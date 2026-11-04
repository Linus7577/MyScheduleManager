import { VAULT_MAX_TAGS, VAULT_MAX_TAG_LENGTH } from "@/config/app.config";
import type { LinkKind, VaultFilter, VaultItem } from "./types";

/** Makes text comparable: ignores case, and treats full-width and half-width characters as the same. */
const comparable = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

/** Splits typed tags on commas, including the Chinese ones, and drops repeats. Too many are cut off. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(/[,，、\n]/)) {
    const tag = part.trim().slice(0, VAULT_MAX_TAG_LENGTH).trim();
    const key = comparable(tag);
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, VAULT_MAX_TAGS);
}

/** Lets you type drive.google.com/abc. Anything already naming a scheme is left alone, for the schema to judge. */
export function normalizeUrl(text: string): string {
  const url = text.trim();
  if (url === "" || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}

const isDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Which icon an address gets. Matches whole domains, so github.com.example.org isn't GitHub. */
export function linkKind(url: string | null): LinkKind {
  if (!url) return "web";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "web";
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.pathname.toLowerCase().endsWith(".pdf")) return "pdf";
  if (isDomain(host, "drive.google.com") || isDomain(host, "docs.google.com")) return "drive";
  if (isDomain(host, "github.com") || isDomain(host, "githubusercontent.com")) return "github";
  if (isDomain(host, "youtube.com") || host === "youtu.be") return "youtube";
  return "web";
}

/** Just the site name, for showing beneath a title. */
export function displayHost(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Pinned first, then newest first. */
export function sortVaultItems(items: VaultItem[]): VaultItem[] {
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
}

/** Every word typed must appear somewhere in the item, in any order. */
function matchesQuery(item: VaultItem, query: string): boolean {
  const words = comparable(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = comparable([item.title, item.description, item.tags.join(" "), item.url ?? "", item.body].join("\n"));
  return words.every((word) => text.includes(word));
}

export function filterVaultItems(items: VaultItem[], filter: VaultFilter): VaultItem[] {
  return items.filter(
    (item) =>
      matchesQuery(item, filter.query) &&
      (filter.sectionId === null || item.section_id === filter.sectionId) &&
      (filter.type === null || item.type === filter.type) &&
      (filter.tag === null || item.tags.some((tag) => comparable(tag) === comparable(filter.tag as string)))
  );
}

/** Every tag in use, once each, in alphabetical order. */
export function collectTags(items: VaultItem[]): string[] {
  const tags = new Map<string, string>();
  for (const item of items) {
    for (const tag of item.tags) if (!tags.has(comparable(tag))) tags.set(comparable(tag), tag);
  }
  return [...tags.values()].sort((a, b) => a.localeCompare(b));
}
