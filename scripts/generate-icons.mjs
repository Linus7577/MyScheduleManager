// Rebuilds the PNG app icons from src/app/icon.svg. Run with: npm run icons
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile("src/app/icon.svg");
await mkdir("public/icons", { recursive: true });

const render = (size) => sharp(svg, { density: 300 }).resize(size, size).png();

await render(192).toFile("public/icons/icon-192.png");
await render(512).toFile("public/icons/icon-512.png");
await render(180).toFile("src/app/apple-icon.png");

// Android may crop maskable icons to a circle, so the art sits inside the middle 80% on a full-bleed background.
const inner = await render(410).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0a0a0c" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile("public/icons/icon-maskable-512.png");
