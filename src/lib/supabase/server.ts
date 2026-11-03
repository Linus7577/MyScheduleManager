import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
import { freshFetch } from "./fresh-fetch";

/** Acts as the signed-in user, so RLS applies. Returns null until Supabase is configured. */
export async function createSupabaseServerClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  const store = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    global: { fetch: freshFetch },
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components can't write cookies. src/proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
