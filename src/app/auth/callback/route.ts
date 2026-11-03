import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/config/app.config";
import { setLocaleCookie } from "@/features/settings/locale-cookie";
import { isAllowedEmail } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);

  if (!isAllowedEmail(data.user?.email, process.env.ALLOWED_EMAIL)) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${origin}/access-denied`);
  }

  // Bring the saved language to a new device.
  const { data: settings } = await supabase.from("settings").select("locale").maybeSingle();
  if (isLocale(settings?.locale)) await setLocaleCookie(settings.locale);

  return NextResponse.redirect(`${origin}/`);
}
