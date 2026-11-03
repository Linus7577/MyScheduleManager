"use server";

import { runAction } from "@/features/schedule/run-action";
import type { ActionResult } from "@/features/schedule/types";
import { getMarketData } from "./market-data-config";
import {
  archiveCategorySchema,
  createCategorySchema,
  createRecurringSchema,
  createTradeSchema,
  createTransactionSchema,
  deleteBudgetSchema,
  dividendSchema,
  idOnlySchema,
  refreshMarketSchema,
  renameCategorySchema,
  setBudgetSchema,
  setManualFxSchema,
  setManualPriceSchema,
  setRecurringActiveSchema,
  updateRecurringSchema,
  updateTradeSchema,
  updateTransactionSchema,
} from "./schema";
import * as service from "./service";

const OK: ActionResult = { ok: true };

export async function createTransactionAction(input: unknown) {
  return runAction(createTransactionSchema, input, (ctx, data) => service.createTransaction(ctx, data));
}

export async function updateTransactionAction(input: unknown) {
  return runAction(updateTransactionSchema, input, (ctx, { id, ...data }) => service.updateTransaction(ctx, id, data));
}

export async function deleteTransactionAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteTransaction(data.id);
    return OK;
  });
}

export async function createCategoryAction(input: unknown) {
  return runAction(createCategorySchema, input, (ctx, data) => service.createCategory(ctx, data.kind, data.name));
}

export async function renameCategoryAction(input: unknown) {
  return runAction(renameCategorySchema, input, async (ctx, data) => {
    await ctx.repo.updateFinCategory(data.id, { name: data.name });
    return OK;
  });
}

export async function archiveCategoryAction(input: unknown) {
  return runAction(archiveCategorySchema, input, (ctx, data) => service.setCategoryArchived(ctx, data.id, data.archived));
}

export async function createRecurringAction(input: unknown) {
  return runAction(createRecurringSchema, input, (ctx, data) => service.createRecurringRule(ctx, data));
}

export async function updateRecurringAction(input: unknown) {
  return runAction(updateRecurringSchema, input, (ctx, { id, ...data }) => service.updateRecurringRule(ctx, id, data));
}

export async function setRecurringActiveAction(input: unknown) {
  return runAction(setRecurringActiveSchema, input, (ctx, data) => service.setRecurringActive(ctx, data.id, data.active));
}

export async function deleteRecurringAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteRecurringRule(data.id);
    return OK;
  });
}

export async function setBudgetAction(input: unknown) {
  return runAction(setBudgetSchema, input, (ctx, data) => service.setBudget(ctx, data.category_id, data.amount_twd));
}

export async function deleteBudgetAction(input: unknown) {
  return runAction(deleteBudgetSchema, input, async (ctx, data) => {
    await ctx.repo.deleteBudget(data.category_id);
    return OK;
  });
}

export async function createTradeAction(input: unknown) {
  return runAction(createTradeSchema, input, (ctx, data) => service.createTrade(ctx, data));
}

export async function updateTradeAction(input: unknown) {
  return runAction(updateTradeSchema, input, (ctx, { id, ...data }) => service.updateTrade(ctx, id, data));
}

export async function deleteTradeAction(input: unknown) {
  return runAction(idOnlySchema, input, (ctx, data) => service.deleteTrade(ctx, data.id));
}

export async function recordDividendAction(input: unknown) {
  return runAction(dividendSchema, input, (ctx, data) => service.recordDividend(ctx, data));
}

export async function setManualPriceAction(input: unknown) {
  return runAction(setManualPriceSchema, input, (ctx, data) => service.setManualPrice(ctx, data));
}

export async function setManualFxAction(input: unknown) {
  return runAction(setManualFxSchema, input, async (ctx, data) => {
    await ctx.repo.setManualFxRate(data.currency, ctx.today, data.rate);
    await service.recordPortfolioSnapshot(ctx);
    return OK;
  });
}

/** Asks the outside sources for anything out of date. It only fails if none of them answered. */
export async function refreshMarketAction(input: unknown) {
  return runAction(refreshMarketSchema, input, async (ctx, data) => {
    const { attempted, failed } = await service.refreshMarketData(ctx, getMarketData(), data.force);
    return attempted > 0 && failed === attempted ? { ok: false, code: "marketUnavailable" } : OK;
  });
}
