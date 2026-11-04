export const VAULT_ITEM_TYPES = ["link", "note", "file"] as const;
export type VaultItemType = (typeof VAULT_ITEM_TYPES)[number];

export type LinkKind = "drive" | "github" | "youtube" | "pdf" | "web";

export type VaultSection = {
  id: string;
  /** Set for a default section. */
  key: string | null;
  /** Empty for a default section not renamed yet, which shows its translated name. */
  name: string;
  position: number;
};

export type VaultItemFields = {
  type: VaultItemType;
  title: string;
  section_id: string;
  description: string;
  tags: string[];
  /** The address, for a link or file reference. Always null for a note. */
  url: string | null;
  /** The text of a note, in markdown. */
  body: string;
  /** What this item belongs to. At most one of these three is set. */
  goal_id: string | null;
  project_id: string | null;
  track_id: string | null;
  pinned: boolean;
};

export type VaultItem = VaultItemFields & { id: string; created_at: string };

export type VaultFilter = {
  query: string;
  sectionId: string | null;
  tag: string | null;
  type: VaultItemType | null;
};

export type NewVaultSection = { key: string | null; name: string; position: number };
