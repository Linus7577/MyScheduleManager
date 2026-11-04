import { z } from "zod";
import { VAULT_MAX_TAG_LENGTH, VAULT_MAX_TAGS, VAULT_NOTE_MAX_LENGTH } from "@/config/app.config";
import { VAULT_ITEM_TYPES } from "./types";

const id = z.uuid();

export const idOnlySchema = z.strictObject({ id });

const sectionName = z.string().trim().min(1).max(40);
export const createSectionSchema = z.strictObject({ name: sectionName });
export const renameSectionSchema = z.strictObject({ id, name: sectionName });

// Only web addresses, so a saved item can never hold a javascript: link that runs code when tapped.
const webAddress = z.url({ protocol: /^https?$/ }).max(2000);

const itemFields = {
  type: z.enum(VAULT_ITEM_TYPES),
  title: z.string().trim().min(1).max(200),
  section_id: id,
  description: z.string().trim().max(2000),
  tags: z.array(z.string().trim().min(1).max(VAULT_MAX_TAG_LENGTH)).max(VAULT_MAX_TAGS),
  url: webAddress.nullable(),
  body: z.string().max(VAULT_NOTE_MAX_LENGTH),
  goal_id: id.nullable(),
  project_id: id.nullable(),
  track_id: id.nullable(),
  pinned: z.boolean(),
};

type ItemShape = { type: string; url: string | null; body: string; goal_id: string | null; project_id: string | null; track_id: string | null };

/** A note has text and no address, a link or file has an address and no text, and an item links to one thing at most. */
function isConsistent(item: ItemShape): boolean {
  const links = [item.goal_id, item.project_id, item.track_id].filter(Boolean).length;
  const content = item.type === "note" ? item.url === null && item.body.trim() !== "" : item.url !== null && item.body === "";
  return links <= 1 && content;
}

export const createItemSchema = z.strictObject(itemFields).refine(isConsistent);
export const updateItemSchema = z.strictObject({ id, ...itemFields }).refine(isConsistent);

export const setPinnedSchema = z.strictObject({ id, pinned: z.boolean() });
