import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VaultRepo } from "./repo";
import type { VaultItem, VaultSection } from "./types";

function unwrapMaybe<T>(result: { data: T | null; error: unknown }): T | null {
  if (result.error) throw new Error("Vault database request failed");
  return result.data;
}

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  const data = unwrapMaybe(result);
  if (data === null) throw new Error("Vault database request returned nothing");
  return data;
}

function check(result: { error: unknown }): void {
  if (result.error) throw new Error("Vault database request failed");
}

const SECTION_COLUMNS = "id, key, name, position";
const ITEM_COLUMNS =
  "id, type, title, section_id, description, tags, url, body, goal_id, project_id, track_id, pinned, created_at";

/** Runs as the signed-in owner, so RLS applies underneath this code. */
export function createVaultSupabaseRepo(db: SupabaseClient, userId: string): VaultRepo {
  return {
    async listVaultSections() {
      const rows = unwrap(await db.from("vault_sections").select(SECTION_COLUMNS).order("position"));
      return rows as unknown as VaultSection[];
    },
    async insertVaultSections(sections) {
      check(
        await db
          .from("vault_sections")
          .upsert(sections.map((section) => ({ ...section, user_id: userId })), {
            onConflict: "user_id,key",
            ignoreDuplicates: true,
          })
      );
    },
    async renameVaultSection(id, name) {
      check(await db.from("vault_sections").update({ name }).eq("id", id));
    },
    async deleteVaultSection(id) {
      check(await db.from("vault_sections").delete().eq("id", id));
    },

    async listVaultItems() {
      const rows = unwrap(await db.from("vault_items").select(ITEM_COLUMNS).order("created_at", { ascending: false }));
      return rows as unknown as VaultItem[];
    },
    async getVaultItem(id) {
      const row = unwrapMaybe(await db.from("vault_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle());
      return row as unknown as VaultItem | null;
    },
    async createVaultItem(fields) {
      check(await db.from("vault_items").insert({ ...fields, user_id: userId }));
    },
    async updateVaultItem(id, fields) {
      check(await db.from("vault_items").update(fields).eq("id", id));
    },
    async setVaultItemPinned(id, pinned) {
      check(await db.from("vault_items").update({ pinned }).eq("id", id));
    },
    async deleteVaultItem(id) {
      check(await db.from("vault_items").delete().eq("id", id));
    },
  };
}
