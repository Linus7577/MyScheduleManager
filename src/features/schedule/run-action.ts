import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { getScheduleContext } from "./context";
import type { ScheduleContext } from "./generation";
import type { ActionResult } from "./types";

/** The one path for every change: validate, confirm the owner, run the rule, refresh the screens. */
export async function runAction<S extends z.ZodType>(
  schema: S,
  input: unknown,
  change: (ctx: ScheduleContext, data: z.output<S>) => Promise<ActionResult>
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  try {
    const result = await change(await getScheduleContext(), parsed.data);
    // The whole shell refreshes, because the status strip shows XP and Power on every page.
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    unstable_rethrow(error);
    // Only on a developer's machine: hosted logs must never hold personal data.
    if (process.env.NODE_ENV === "development") console.error(error);
    return { ok: false, code: "failed" };
  }
}
