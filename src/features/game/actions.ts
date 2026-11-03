"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getScheduleContext } from "@/features/schedule/context";
import type { ActionResult } from "@/features/schedule/types";
import { acknowledgeProgress, dismissReckoning, recordFocusBroken } from "./service";

async function guarded(change: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const result = await change();
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, code: "failed" };
  }
}

export async function dismissReckoningAction() {
  return guarded(async () => dismissReckoning(await getScheduleContext()));
}

export async function acknowledgeProgressAction() {
  return guarded(async () => acknowledgeProgress(await getScheduleContext()));
}

const focusSchema = z.strictObject({ id: z.uuid() });

export async function recordFocusBrokenAction(input: unknown): Promise<ActionResult> {
  const parsed = focusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  return guarded(async () => recordFocusBroken(await getScheduleContext(), parsed.data.id));
}
