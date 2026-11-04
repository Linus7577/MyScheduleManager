// Turns exported art into the small files the app serves. Run with: node scripts/prepare-art.mjs <folder of images>
// Expects painting.webp, citadel.png, dragon.png and warrior-1.png to warrior-8.png. Any that are missing are skipped.
// Dragon and warrior art is painted on flat grey, which this cuts away, keeping soft smoke and mist see-through.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { LAYER_FEATHER, layerBox, PAINTING_LAYERS, PAINTING_SIZE } from "../src/config/lobby-art.ts";

const source = process.argv[2];
if (!source) throw new Error("Pass the folder holding the exported PNGs");

const OUT = "public/art";
mkdirSync(join(OUT, "warrior"), { recursive: true });
mkdirSync(join(OUT, "home"), { recursive: true });
mkdirSync(join(OUT, "oracle"), { recursive: true });

// How far a colour may sit from the background and still be background.
const HARD = 34;
// Past HARD, a light colour touching the background is treated as partly see-through, up to this far.
const SOFT = 120;
const MIN_LIGHTNESS = 96;
// A pocket of background enclosed by the figure, such as a tear in a cape, is judged a little more loosely.
const POCKET = 52;
const MIN_POCKET_PIXELS = 8;

function cutOut({ data, info }) {
  const { width, height } = info;
  const px = (x, y) => (y * width + x) * 4;
  const corners = [px(4, 4), px(width - 5, 4), px(4, height - 5), px(width - 5, height - 5)];
  const bg = [0, 1, 2].map((c) => corners.reduce((sum, i) => sum + data[i + c], 0) / corners.length);
  const distance = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  const lightness = (i) => (data[i] + data[i + 1] + data[i + 2]) / 3;

  const seen = new Uint8Array(width * height);
  const flood = (startX, startY, limit) => {
    const stack = [[startX, startY]];
    const region = [];
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const at = y * width + x;
      if (seen[at]) continue;
      const i = at * 4;
      const d = distance(i);
      if (!(d < limit || (limit === SOFT && d < SOFT && lightness(i) > MIN_LIGHTNESS))) continue;
      seen[at] = 1;
      region.push(at);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return region;
  };

  const clear = (region) => {
    for (const at of region) {
      const i = at * 4;
      const d = distance(i);
      const alpha = d <= HARD ? 0 : Math.min(1, (d - HARD) / (SOFT - HARD));
      for (let c = 0; c < 3; c++) {
        // Takes the grey back out of a partly see-through colour, so no pale fringe is left.
        data[i + c] = alpha === 0 ? 0 : Math.max(0, Math.min(255, (data[i + c] - (1 - alpha) * bg[c]) / alpha));
      }
      data[i + 3] = Math.round(alpha * 255);
    }
  };

  for (let x = 0; x < width; x++) {
    clear(flood(x, 0, SOFT));
    clear(flood(x, height - 1, SOFT));
  }
  for (let y = 0; y < height; y++) {
    clear(flood(0, y, SOFT));
    clear(flood(width - 1, y, SOFT));
  }
  // Enclosed pockets must be close to the exact grey, so armor highlights inside the figure stay.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (seen[y * width + x] || distance(px(x, y)) >= POCKET) continue;
      const pocket = flood(x, y, POCKET);
      if (pocket.length < MIN_POCKET_PIXELS) continue;
      clear(pocket);
      // Then its soft rim, the same way as the outer edge.
      for (const at of pocket) {
        const [px_, py] = [at % width, Math.floor(at / width)];
        for (const [nx, ny] of [[px_ + 1, py], [px_ - 1, py], [px_, py + 1], [px_, py - 1]]) clear(flood(nx, ny, SOFT));
      }
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}

/**
 * Paints the dragon into the sky, so it reads as part of the scene behind the warrior instead of a second figure beside him.
 * Done here rather than with live blending, which would cost a phone real work on every frame of its movement.
 */
const SKY = [24, 3, 6];
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const smooth = (from, to, value) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
// Lightens toward a color without dimming what's already bright, so blacks take the sky's red and veins stay hot.
const screen = (value, sky) => 255 - ((255 - value) * (255 - sky)) / 255;

async function paintIntoSky(image) {
  const png = await image.ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(png).blur(0.7).raw().toBuffer({ resolveWithObject: true });
  const original = await sharp(png).raw().toBuffer();
  const softAlpha = await sharp(png).extractChannel("alpha").blur(3).raw().toBuffer();
  const { width, height } = info;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      // How much of this pixel is a glowing vein, as opposed to grey scale.
      const heat = clamp(((r - Math.max(g, b)) / 255) * 1.8);
      // Scales go darker and redder while veins don't, which keeps it rich instead of washed out.
      const dim = 1 - (1 - heat) * 0.3;
      data[i] = clamp(screen(r * dim * (1 + heat * 0.3), SKY[0]), 0, 255);
      data[i + 1] = clamp(screen(g * (0.52 - heat * 0.2), SKY[1]), 0, 255);
      data[i + 2] = clamp(screen(b * (0.56 - heat * 0.2), SKY[2]), 0, 255);

      // Soft edges, with the far parts dissolving: the lower body into the fog, and the wing tips into the sky.
      const edge = smooth(0.35, 0.95, softAlpha[y * width + x] / 255);
      const lower = 1 - smooth(0.36, 0.8, y / height);
      const side = 1 - 0.65 * smooth(0.68, 1, Math.abs((2 * x) / width - 1));
      data[i + 3] = original[i + 3] * edge * lower * side * 0.96;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}

async function load(name) {
  return sharp(join(source, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function report(path) {
  console.log(`${path}  ${Math.round(statSync(path).size / 1024)} KB`);
}

// The Home painting, and a soft-edged copy of each part that moves.
if (existsSync(join(source, "painting.webp"))) {
  const { width, height } = PAINTING_SIZE;
  const painting = await sharp(join(source, "painting.webp")).resize(width, height).removeAlpha().png().toBuffer();
  const path = join(OUT, "home", "painting.webp");
  await sharp(painting).webp({ quality: 86, effort: 6 }).toFile(path);
  report(path);
  for (const layer of PAINTING_LAYERS) {
    const outline = layer.points.map(([x, y]) => `${x},${y}`).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><filter id="soft"><feGaussianBlur stdDeviation="${LAYER_FEATHER}"/></filter><rect width="${width}" height="${height}" fill="#000"/><polygon points="${outline}" fill="#fff" filter="url(#soft)"/></svg>`;
    const mask = await sharp(Buffer.from(svg)).extractChannel(0).png().toBuffer();
    const file = join(OUT, "home", `layer-${layer.id}.webp`);
    const whole = await sharp(painting).joinChannel(mask).png().toBuffer();
    await sharp(whole).extract(layerBox(layer.points)).webp({ quality: 82, alphaQuality: 80, effort: 6 }).toFile(file);
    report(file);
  }
}

if (existsSync(join(source, "citadel.png"))) {
  const path = join(OUT, "home", "citadel.webp");
  await sharp(join(source, "citadel.png")).webp({ quality: 84, effort: 6 }).toFile(path);
  report(path);
}

if (existsSync(join(source, "dragon.png"))) {
  const path = join(OUT, "oracle", "dragon.webp");
  const cut = await cutOut(await load("dragon.png")).png().toBuffer();
  const sized = sharp(await sharp(cut).trim({ threshold: 1 }).resize({ height: 1100, withoutEnlargement: true }).modulate({ brightness: 0.8 }).png().toBuffer());
  await (await paintIntoSky(sized)).webp({ quality: 82, alphaQuality: 80, effort: 6 }).toFile(path);
  report(path);
  // Its head, for beside the Oracle's name.
  const face = join(OUT, "oracle", "dragon-face.webp");
  const head = { left: 280, top: 0, width: 240, height: 240 };
  await sharp(await sized.clone().png().toBuffer()).extract(head).resize(96, 96).flatten({ background: "#14060a" }).webp({ quality: 82, effort: 6 }).toFile(face);
  report(face);
}

for (let tier = 1; tier <= 8; tier++) {
  const name = `warrior-${tier}.png`;
  if (!existsSync(join(source, name))) continue;
  // Same canvas for every tier, so swapping tiers never shifts where he stands.
  const cut = await cutOut(await load(name)).png().toBuffer();
  const full = join(OUT, "warrior", `tier-${tier}.webp`);
  await sharp(cut).resize({ width: 720 }).webp({ quality: 80, alphaQuality: 80, effort: 6 }).toFile(full);
  report(full);
  const face = join(OUT, "warrior", `tier-${tier}-face.webp`);
  await sharp(cut).extract({ left: 362, top: 20, width: 280, height: 280 }).resize(96, 96).webp({ quality: 78, effort: 6 }).toFile(face);
  report(face);
}
