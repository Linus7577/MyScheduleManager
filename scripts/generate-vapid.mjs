// Makes the pair of keys that lets this app send push notifications, and saves them in .env.local.
// The private key is never printed. Run once with:
//   node scripts/generate-vapid.mjs
// Making a new pair later cuts off every device that already turned notifications on, so it refuses to replace one.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import webpush from "web-push";

const FILE = ".env.local";
const existing = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";

if (/^VAPID_PRIVATE_KEY=.+/m.test(existing)) {
  console.log(`${FILE} already has notification keys, so nothing was changed.`);
  process.exit(0);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const separator = existing && !existing.endsWith("\n") ? "\n" : "";
appendFileSync(
  FILE,
  `${separator}\n# Push notifications. The public key is meant for browsers. The private key is server only.\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`
);
console.log(`Saved a new pair of notification keys in ${FILE}. Copy both into Vercel: see docs/SETUP.md.`);
