// Turns exported art into the small files the app serves. Run with: node scripts/prepare-art.mjs <folder of PNGs>
// Expects citadel.png, dragon.png and warrior-1.png to warrior-8.png. Any that are missing are skipped.
// Dragon and warrior art is painted on flat grey, which this cuts away, keeping soft smoke and mist see-through.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const source = process.argv[2];
if (!source) throw new Error("Pass the folder holding the exported PNGs");

const OUT = "public/art";
mkdirSync(join(OUT, "warrior"), { recursive: true });
mkdirSync(join(OUT, "home"), { recursive: true });

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

async function load(name) {
  return sharp(join(source, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function report(path) {
  console.log(`${path}  ${Math.round(statSync(path).size / 1024)} KB`);
}

if (existsSync(join(source, "citadel.png"))) {
  const path = join(OUT, "home", "citadel.webp");
  await sharp(join(source, "citadel.png")).webp({ quality: 84, effort: 6 }).toFile(path);
  report(path);
}

if (existsSync(join(source, "dragon.png"))) {
  const path = join(OUT, "home", "dragon.webp");
  const cut = await cutOut(await load("dragon.png")).png().toBuffer();
  await sharp(cut).trim({ threshold: 1 }).resize({ height: 1100, withoutEnlargement: true }).modulate({ brightness: 0.8 }).webp({ quality: 80, alphaQuality: 80, effort: 6 }).toFile(path);
  report(path);
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
