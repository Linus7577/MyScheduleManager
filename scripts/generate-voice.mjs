// Makes the warrior's voice clips from src/config/voice-lines.ts, using VOICEVOX on this computer.
// See "Making the voice clips" in docs/SETUP.md. Run with:
//   node scripts/generate-voice.mjs --python <venv python> --tools <unpacked tools folder>
// Options: --out <folder> keeps samples elsewhere, --lines r1,s3 limits the lines.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Mp3Encoder } from "@breezystack/lamejs";
import { VOICE_PRONUNCIATION, VOICE_SCRIPT } from "../src/config/voice-lines.ts";

// The owner chose this by ear: the voice's quiet style (しっとり, 84), a little slower and lower than its default.
const DELIVERY = { style: 84, speed: 0.92, pitch: -0.04, intonation: 0.85 };
const BITRATE_KBPS = 48;

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const python = option("python");
const tools = option("tools");
if (!python || !tools) throw new Error("Pass --python and --tools");
const out = option("out", "public/audio/voice");
const only = option("lines", "");
const ids = only ? only.split(",") : Object.keys(VOICE_SCRIPT);
mkdirSync(out, { recursive: true });

/** Reads the sound out of a WAV file, finding its parts by name because their positions can vary. */
function readWav(buffer) {
  let at = 12;
  let sampleRate = 0;
  while (at < buffer.length) {
    const id = buffer.toString("ascii", at, at + 4);
    const size = buffer.readUInt32LE(at + 4);
    if (id === "fmt ") sampleRate = buffer.readUInt32LE(at + 12);
    if (id === "data") {
      const data = buffer.subarray(at + 8, at + 8 + size);
      const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.length);
      return { sampleRate, samples: new Int16Array(copy) };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("Not a WAV file");
}

function toMp3({ sampleRate, samples }) {
  const encoder = new Mp3Encoder(1, sampleRate, BITRATE_KBPS);
  const parts = [];
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const part = encoder.encodeBuffer(samples.subarray(i, i + blockSize));
    if (part.length > 0) parts.push(Buffer.from(part));
  }
  const end = encoder.flush();
  if (end.length > 0) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}

const wavs = mkdtempSync(join(tmpdir(), "voice-"));
try {
  const lines = ids.map((id) => {
    if (!VOICE_SCRIPT[id]) throw new Error(`No line called ${id}`);
    return { id, text: VOICE_SCRIPT[id], kana: VOICE_PRONUNCIATION[id] ?? null };
  });
  const args = ["scripts/voicevox-synth.py", "--tools", tools, "--out", wavs, "--style", String(DELIVERY.style)];
  args.push("--speed", String(DELIVERY.speed), "--pitch", String(DELIVERY.pitch), "--intonation", String(DELIVERY.intonation));
  const run = spawnSync(python, args, {
    input: JSON.stringify(lines),
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, PYTHONUTF8: "1" },
  });
  if (run.status !== 0) throw new Error(`The voice engine stopped with code ${run.status}`);

  for (const { id } of lines) {
    const path = join(out, `${id}.mp3`);
    writeFileSync(path, toMp3(readWav(readFileSync(join(wavs, `${id}.wav`)))));
    console.log(`${path}  ${Math.round(statSync(path).size / 1024)} KB`);
  }
} finally {
  rmSync(wavs, { recursive: true, force: true });
}
