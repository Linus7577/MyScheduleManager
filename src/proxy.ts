import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { decideAccess, isAuthPreviewEnabled } from "@/lib/auth/access";
import { buildCsp } from "@/lib/security/csp";
import { getSupabaseConfig } from "@/lib/supabase/config";

type PendingCookie = { name: string; value: string; options: CookieOptions };

/** Runs before every page: refreshes the session, applies the allowlist and sets the per-request CSP. */
export async function proxy(request: NextRequest) {
  const preview = isAuthPreviewEnabled();
  const config = preview ? null : getSupabaseConfig();

  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};
  const supabase = config
    ? createServerClient(config.url, config.publishableKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              pendingCookies.push({ name, value, options });
            });
            Object.assign(pendingHeaders, headers);
          },
        },
      })
    : null;

  let email: string | null = null;
  try {
    const { data } = (await supabase?.auth.getClaims()) ?? {};
    const claim = data?.claims?.email;
    email = typeof claim === "string" ? claim : null;
  } catch {
    // If auth can't be reached, treat the visitor as signed out.
    email = null;
  }

  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    email,
    allowedEmail: process.env.ALLOWED_EMAIL,
    preview,
  });

  if (decision === "deny") {
    await supabase?.auth.signOut({ scope: "local" });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  const response = respond(request, decision, nonce, csp);
  response.headers.set("Content-Security-Policy", csp);
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(pendingHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

function respond(request: NextRequest, decision: ReturnType<typeof decideAccess>, nonce: string, csp: string) {
  switch (decision) {
    case "login":
      return NextResponse.redirect(new URL("/login", request.url));
    case "deny":
      return NextResponse.redirect(new URL("/access-denied", request.url));
    case "home":
      return NextResponse.redirect(new URL("/", request.url));
    case "allow": {
      // Next.js reads the nonce from this request header and adds it to its own scripts.
      const headers = new Headers(request.headers);
      headers.set("x-nonce", nonce);
      headers.set("Content-Security-Policy", csp);
      return NextResponse.next({ request: { headers } });
    }
  }
}

export const config = {
  // Everything is guarded by default. Only static files and cron, which has its own secret, skip this.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|manifest.webmanifest|api/cron/).*)",
  ],
};
