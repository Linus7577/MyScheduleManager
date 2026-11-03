"use server";

import { revalidatePath } from "next/cache";
import { getPreviewRepo } from "@/features/schedule/memory-repo";
import { requireOwner } from "@/lib/auth/owner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setLocaleCookie, setMotionCookie } from "./locale-cookie";
import { settingsSchema, type SaveSettingsState } from "./schema";

export async function saveSettings(_previous: SaveSettingsState, formData: FormData): Promise<SaveSettingsState> {
  const owner = await requireOwner();

  const parsed = settingsSchema.safeParse({
    locale: formData.get("locale"),
    timezone: formData.get("timezone"),
    motion: formData.get("motion"),
    about_me: formData.get("about_me"),
  });
  if (!parsed.success) return { status: "invalid" };

  if (owner.preview) {
    await setLocaleCookie(parsed.data.locale);
    await setMotionCookie(parsed.data.motion);
    await getPreviewRepo().setAboutMe(parsed.data.about_me);
    revalidatePath("/", "layout");
    return { status: "savedPreview" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "failed" };

  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: owner.userId, ...parsed.data }, { onConflict: "user_id" });
  if (error) return { status: "failed" };

  await setLocaleCookie(parsed.data.locale);
  await setMotionCookie(parsed.data.motion);
  revalidatePath("/", "layout");
  return { status: "saved" };
}
