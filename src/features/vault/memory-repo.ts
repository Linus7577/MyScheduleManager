import type { VaultRepo } from "./repo";
import type { VaultItem, VaultSection } from "./types";

export type VaultStore = { sections: VaultSection[]; items: VaultItem[] };

export const emptyVaultStore = (): VaultStore => ({ sections: [], items: [] });

const newId = () => crypto.randomUUID();

/** What the database does by itself when something an item links to is deleted. */
export function clearVaultLinks(
  store: VaultStore,
  removed: { goalIds?: string[]; projectIds?: string[]; trackIds?: string[] }
): void {
  store.items = store.items.map((item) => ({
    ...item,
    goal_id: item.goal_id && removed.goalIds?.includes(item.goal_id) ? null : item.goal_id,
    project_id: item.project_id && removed.projectIds?.includes(item.project_id) ? null : item.project_id,
    track_id: item.track_id && removed.trackIds?.includes(item.track_id) ? null : item.track_id,
  }));
}

/** Stands in for Supabase in tests and login-free preview. */
export function createVaultMemoryRepo(store: VaultStore): VaultRepo {
  // Keeps entry order when two items are saved within the same millisecond.
  let sequence = 0;
  const stamp = () => new Date(Date.now() + sequence++).toISOString();

  return {
    async listVaultSections() {
      return [...store.sections].sort((a, b) => a.position - b.position);
    },
    async insertVaultSections(sections) {
      for (const section of sections) {
        if (section.key && store.sections.some((existing) => existing.key === section.key)) continue;
        store.sections.push({ ...section, id: newId() });
      }
    },
    async renameVaultSection(id, name) {
      store.sections = store.sections.map((section) => (section.id === id ? { ...section, name } : section));
    },
    async deleteVaultSection(id) {
      store.sections = store.sections.filter((section) => section.id !== id);
    },

    async listVaultItems() {
      return [...store.items].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async getVaultItem(id) {
      return store.items.find((item) => item.id === id) ?? null;
    },
    async createVaultItem(fields) {
      store.items.push({ ...fields, id: newId(), created_at: stamp() });
    },
    async updateVaultItem(id, fields) {
      store.items = store.items.map((item) => (item.id === id ? { ...item, ...fields } : item));
    },
    async setVaultItemPinned(id, pinned) {
      store.items = store.items.map((item) => (item.id === id ? { ...item, pinned } : item));
    },
    async deleteVaultItem(id) {
      store.items = store.items.filter((item) => item.id !== id);
    },
  };
}
