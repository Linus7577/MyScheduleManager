import type { NewVaultSection, VaultItem, VaultItemFields, VaultSection } from "./types";

export interface VaultRepo {
  listVaultSections(): Promise<VaultSection[]>;
  /** Defaults already there are left alone, so seeding twice can't create duplicates. */
  insertVaultSections(sections: NewVaultSection[]): Promise<void>;
  renameVaultSection(id: string, name: string): Promise<void>;
  deleteVaultSection(id: string): Promise<void>;

  listVaultItems(): Promise<VaultItem[]>;
  getVaultItem(id: string): Promise<VaultItem | null>;
  createVaultItem(fields: VaultItemFields): Promise<void>;
  updateVaultItem(id: string, fields: VaultItemFields): Promise<void>;
  setVaultItemPinned(id: string, pinned: boolean): Promise<void>;
  deleteVaultItem(id: string): Promise<void>;
}
