import { VOICE_CLIPS_READY } from "@/config/voice-lines";
import type { LineId } from "./lines";

/**
 * Every sound except his voice is made live by the browser, so there are no audio files to download and no music
 * licences to worry about. Browsers keep sound off until the first tap, so nothing else may depend on it playing.
 */

export type SoundName = "tap" | "done" | "skip" | "levelUp" | "tierUp";

const MUTED_KEY = "sound-muted";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let windSource: AudioBufferSourceNode | null = null;
let windWanted = false;
let muted: boolean | null = null;
const listeners = new Set<() => void>();

// Private windows can refuse storage, and the app must still work, so these guess rather than throw.
function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(value: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, value ? "1" : "0");
  } catch {}
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  muted ??= readMuted();
  return muted;
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSoundMuted(value: boolean): void {
  muted = value;
  writeMuted(value);
  if (master && context) master.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, 0.05);
  if (value) voice?.pause();
  listeners.forEach((listener) => listener());
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!context) {
    context = new window.AudioContext();
    master = context.createGain();
    master.gain.value = isSoundMuted() ? 0 : 1;
    master.connect(context.destination);
  }
  return context;
}

/** Call from a tap. Starts anything that was waiting for the browser to allow sound. */
export function unlockSound(): void {
  const ctx = audio();
  if (ctx?.state === "suspended") void ctx.resume();
  if (windWanted) startWind();
}

function noiseBuffer(ctx: AudioContext, seconds: number, smoothing: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < samples.length; i++) {
    // Each sample leans on the one before. The more it leans, the deeper the rumble.
    last = last * smoothing + (Math.random() * 2 - 1) * (1 - smoothing);
    samples[i] = last;
  }
  return buffer;
}

function tone(ctx: AudioContext, type: OscillatorType, from: number, to: number, start: number, length: number, peak: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(master as GainNode);
  oscillator.start(start);
  oscillator.stop(start + length);
}

function thunderAt(ctx: AudioContext, start: number, peak: number): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 3.5, 0.985);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(420, start);
  filter.frequency.exponentialRampToValueAtTime(60, start + 3);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.4);
  source.connect(filter).connect(gain).connect(master as GainNode);
  source.start(start);
}

export function playThunder(): void {
  const ctx = audio();
  if (ctx?.state === "running") thunderAt(ctx, ctx.currentTime, 1.6);
}

export function playSound(name: SoundName): void {
  const ctx = audio();
  if (ctx?.state !== "running") return;
  const now = ctx.currentTime;

  if (name === "tap") {
    tone(ctx, "triangle", 900, 420, now, 0.05, 0.035);
  } else if (name === "done") {
    // A blade ringing out.
    tone(ctx, "sine", 880, 860, now, 0.7, 0.07);
    tone(ctx, "sine", 1760, 1700, now, 0.45, 0.035);
    tone(ctx, "triangle", 2640, 2400, now, 0.2, 0.02);
  } else if (name === "skip") {
    // A heavy blow landing.
    tone(ctx, "sine", 110, 42, now, 0.45, 0.3);
    tone(ctx, "sawtooth", 70, 40, now, 0.2, 0.05);
  } else {
    const notes = name === "levelUp" ? [220, 330, 440, 660] : [110, 165, 220, 330, 440, 660];
    notes.forEach((note, index) => tone(ctx, "sawtooth", note, note * 0.99, now + index * 0.12, 0.8, 0.045));
    if (name === "tierUp") thunderAt(ctx, now, 1.2);
  }
}

function startWind(): void {
  const ctx = audio();
  if (!ctx || ctx.state !== "running" || windSource) return;
  windSource = ctx.createBufferSource();
  windSource.buffer = noiseBuffer(ctx, 6, 0.6);
  windSource.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 380;
  filter.Q.value = 0.7;
  // A slow swell, so it sounds like wind and not like static.
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.09;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 170;
  swell.connect(swellDepth).connect(filter.frequency);
  swell.start();
  const gain = ctx.createGain();
  gain.gain.value = 0.11;
  windSource.connect(filter).connect(gain).connect(master as GainNode);
  windSource.addEventListener("ended", () => swell.stop());
  windSource.start();
}

/** Wind plays while Home is open. If sound isn't allowed yet, it starts on the first tap. */
export function startAmbience(): void {
  windWanted = true;
  startWind();
}

export function stopAmbience(): void {
  windWanted = false;
  windSource?.stop();
  windSource = null;
}

let voice: HTMLAudioElement | null = null;

export function playVoice(line: LineId): void {
  if (!VOICE_CLIPS_READY || isSoundMuted()) return;
  voice?.pause();
  voice = new Audio(`/audio/voice/${line}.mp3`);
  // A blocked or missing clip costs nothing: the line is on screen either way.
  void voice.play().catch(() => {});
}
