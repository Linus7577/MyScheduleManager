"use server";

import { runAction } from "@/features/schedule/run-action";
import type { ActionResult } from "@/features/schedule/types";
import {
  createItemSchema,
  createSectionSchema,
  idOnlySchema,
  renameSectionSchema,
  setPinnedSchema,
  updateItemSchema,
} from "./schema";
import * as service from "./service";

const OK: ActionResult = { ok: true };

export async function createSectionAction(input: unknown) {
  return runAction(createSectionSchema, input, (ctx, data) => service.createSection(ctx, data.name));
}

export async function renameSectionAction(input: unknown) {
  return runAction(renameSectionSchema, input, async (ctx, data) => {
    await ctx.repo.renameVaultSection(data.id, data.name);
    return OK;
  });
}

export async function deleteSectionAction(input: unknown) {
  return runAction(idOnlySchema, input, (ctx, data) => service.deleteSection(ctx, data.id));
}

export async function createItemAction(input: unknown) {
  return runAction(createItemSchema, input, (ctx, data) => service.createItem(ctx, data));
}

export async function updateItemAction(input: unknown) {
  return runAction(updateItemSchema, input, (ctx, { id, ...fields }) => service.updateItem(ctx, id, fields));
}

export async function setItemPinnedAction(input: unknown) {
  return runAction(setPinnedSchema, input, async (ctx, data) => {
    await ctx.repo.setVaultItemPinned(data.id, data.pinned);
    return OK;
  });
}

export async function deleteItemAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteVaultItem(data.id);
    return OK;
  });
}
