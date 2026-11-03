import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Bypasses RLS. Only for jobs with no signed-in user, such as cron, and always behind their own auth check. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return null;

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
