import { FileText, GitBranch, Globe, HardDrive, Paperclip, Play, StickyNote, type LucideIcon } from "lucide-react";
import { linkKind } from "../logic";
import type { LinkKind, VaultItem, VaultSection } from "../types";

/** Which picture an item gets. A note always looks like a note, a link like where it goes, a plain file like a paperclip. */
export const ITEM_ICONS: Record<LinkKind | "note" | "file", LucideIcon> = {
  drive: HardDrive,
  github: GitBranch,
  youtube: Play,
  pdf: FileText,
  web: Globe,
  note: StickyNote,
  file: Paperclip,
};

export function itemIconKey(item: Pick<VaultItem, "type" | "url">): keyof typeof ITEM_ICONS {
  if (item.type === "note") return "note";
  const kind = linkKind(item.url);
  return kind === "web" && item.type === "file" ? "file" : kind;
}

/** A default section shows its translated name until the owner gives it their own. */
export function sectionLabel(section: VaultSection | undefined, t: (key: string) => string): string {
  if (!section) return "";
  return section.name || (section.key ? t(section.key) : "");
}
