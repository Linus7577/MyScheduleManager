// Asks for each Supabase setting and saves it to .env.local. Run with: node scripts/fill-env.mjs
// To set just one: node scripts/fill-env.mjs SUPABASE_SECRET_KEY
// The secret key is hidden while you paste it, and no value is ever printed back.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

const ENV_FILE = ".env.local";

const FIELDS = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    label: "Project URL, like https://abcd1234.supabase.co",
    pattern: /^https:\/\/[a-z0-9]+\.supabase\.co$/,
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    label: "Publishable key, starts with sb_publishable_",
    pattern: /^sb_publishable_\S+$/,
  },
  {
    name: "SUPABASE_SECRET_KEY",
    label: "Secret key, starts with sb_secret_ (hidden as you paste, nothing will appear)",
    pattern: /^sb_secret_\S+$/,
    hidden: true,
  },
  {
    name: "ALLOWED_EMAIL",
    label: "The Google address you will sign in with",
    pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  },
];

function ask(question, hidden) {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, done) {
        if (!muted) process.stdout.write(chunk, encoding);
        done();
      },
    });
    const prompt = createInterface({ input: process.stdin, output, terminal: true });
    prompt.question(question, (answer) => {
      prompt.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = Boolean(hidden);
  });
}

function setLine(text, name, value) {
  const line = new RegExp(`^${name}=.*$`, "m");
  return line.test(text) ? text.replace(line, () => `${name}=${value}`) : `${text.trimEnd()}\n${name}=${value}\n`;
}

let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";

console.log("\nPaste each value and press Enter. Press Enter alone to skip one.\n");

const requested = process.argv.slice(2);
const fields = requested.length ? FIELDS.filter((field) => requested.includes(field.name)) : FIELDS;

for (const field of fields) {
  for (;;) {
    const value = await ask(`${field.label}:\n> `, field.hidden);
    if (!value) {
      console.log("Skipped.\n");
      break;
    }
    if (field.pattern.test(value.replace(/\/$/, ""))) {
      text = setLine(text, field.name, value.replace(/\/$/, ""));
      writeFileSync(ENV_FILE, text);
      console.log("Saved.\n");
      break;
    }
    console.log("That doesn't look right, so it wasn't saved. Please try again.\n");
  }
}

console.log("All done. You can go back to the chat.");
process.exit(0);
