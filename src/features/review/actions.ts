"use server";

import { z } from "zod";
import { getAiProvider } from "@/features/oracle/provider-config";
import { runAction } from "@/features/schedule/run-action";
import { dateSchema } from "@/features/schedule/schema";
import { generateWeeklyReview, saveWeeklyAnswers } from "./service";

const answerSchema = z.string().trim().max(4000);
const answersSchema = z.strictObject({ week: dateSchema, worked: answerSchema, didnt: answerSchema, focus: answerSchema });
const writeSchema = z.strictObject({ week: dateSchema, locale: z.enum(["en", "zh-TW"]) });

export async function saveWeeklyAnswersAction(input: unknown) {
  return runAction(answersSchema, input, (ctx, { week, ...answers }) => saveWeeklyAnswers(ctx, week, answers));
}

export async function writeWeeklyReviewAction(input: unknown) {
  return runAction(writeSchema, input, (ctx, data) =>
    generateWeeklyReview({ ...ctx, locale: data.locale }, getAiProvider(), data.week)
  );
}
