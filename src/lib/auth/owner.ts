import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedEmail, isAuthPreviewEnabled } from "./access";

export type OwnerSession = { preview: true } | { preview: false; userId: string; email: string };

/** The second lock behind src/proxy.ts: pages and server actions check the owner again themselves. */
export const getOwner = cache(async (): Promise<OwnerSession | null> => {
  if (isAuthPreviewEnabled()) return { preview: true };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !isAllowedEmail(claims.email, process.env.ALLOWED_EMAIL)) return null;

  return { preview: false, userId: claims.sub, email: claims.email as string };
});

export async function requireOwner(): Promise<OwnerSession> {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  return owner;
}
