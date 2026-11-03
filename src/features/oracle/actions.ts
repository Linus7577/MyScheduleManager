"use server";

import { z } from "zod";
import { CATEGORY_KEYS } from "@/config/game.config";
import { runAction } from "@/features/schedule/run-action";
import { timeSchema } from "@/features/schedule/schema";
import { getAiProvider } from "./provider-config";
import { approveProposal, generateSuggestion, rejectProposal, undoAction } from "./service";

const idSchema = z.strictObject({ id: z.uuid() });

const title = z.string().trim().min(1).max(120);

const blockEdit = z.strictObject({ start_time: timeSchema, end_time: timeSchema, title });
const templateEdit = z.strictObject({
  weekday: z.number().int().min(1).max(7),
  start_time: timeSchema,
  end_time: timeSchema,
  category: z.enum(CATEGORY_KEYS),
  title,
  notes: z.string().trim().max(2000),
});

const approveSchema = z.strictObject({
  id: z.uuid(),
  edits: z.array(z.union([blockEdit, templateEdit, z.null()])).max(20).optional(),
});

export async function approveProposalAction(input: unknown) {
  return runAction(approveSchema, input, (ctx, data) => approveProposal(ctx, data.id, data.edits));
}

export async function rejectProposalAction(input: unknown) {
  return runAction(idSchema, input, (ctx, data) => rejectProposal(ctx, data.id));
}

export async function undoActionAction(input: unknown) {
  return runAction(idSchema, input, (ctx, data) => undoAction(ctx, data.id));
}

const suggestionSchema = z.strictObject({ locale: z.enum(["en", "zh-TW"]) });

export async function generateSuggestionAction(input: unknown) {
  return runAction(suggestionSchema, input, (ctx, data) =>
    generateSuggestion({ ...ctx, locale: data.locale }, getAiProvider())
  );
}
