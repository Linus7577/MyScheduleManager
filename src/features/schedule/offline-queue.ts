import type { LogStatus } from "./types";

/**
 * Check-offs made with no connection wait here, on this device, until they can be sent.
 * Reading and writing can fail in a private window, so a failure just means the check-off isn't saved for later.
 */
const STORAGE_KEY = "offline-checkoffs";
const CHANGE_EVENT = "offline-checkoffs-changed";

export type QueuedCheckoff = {
  id: string;
  /** What to set the block to. "planned" takes back a check-off. */
  status: LogStatus | "planned";
  log_note: string;
  title: string;
};

export function readQueue(): QueuedCheckoff[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? (parsed as QueuedCheckoff[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedCheckoff[]): boolean {
  try {
    if (queue.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** A block has one status, so a newer check-off replaces an older one still waiting. False if it couldn't be saved. */
export function enqueueCheckoff(item: QueuedCheckoff): boolean {
  return writeQueue([...readQueue().filter((queued) => queued.id !== item.id), item]);
}

export function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter((queued) => queued.id !== id));
}

export function clearQueue(): void {
  writeQueue([]);
}

/** For React's external-store hook: tells a block's card when its waiting check-off changes. */
export function subscribeToQueue(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function queuedStatusFor(id: string): QueuedCheckoff["status"] | null {
  return readQueue().find((queued) => queued.id === id)?.status ?? null;
}
