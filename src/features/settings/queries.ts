import "server-only";
import { cache } from "react";
import { DEFAULT_TIMEZONE } from "@/config/app.config";
import { getOwner } from "@/lib/auth/owner";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getOwnerTimezone = cache(async (): Promise<string> => {
  const owner = await getOwner();
  if (!owner || owner.preview) return DEFAULT_TIMEZONE;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return DEFAULT_TIMEZONE;

  const { data, error } = await supabase.from("settings").select("timezone").maybeSingle();
  if (error) throw new Error("Could not read settings");
  return data?.timezone ?? DEFAULT_TIMEZONE;
});
