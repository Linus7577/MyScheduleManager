export type AccessDecision = "allow" | "login" | "deny" | "home";

const PUBLIC_PATHS = ["/login", "/access-denied"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth/");
}

/** A missing or blank ALLOWED_EMAIL lets nobody in. */
export function isAllowedEmail(email: string | null | undefined, allowedEmail: string | null | undefined): boolean {
  const expected = allowedEmail?.trim().toLowerCase();
  if (!expected || !email) return false;
  return email.trim().toLowerCase() === expected;
}

export function decideAccess(input: {
  pathname: string;
  email: string | null;
  allowedEmail: string | undefined;
  preview: boolean;
}): AccessDecision {
  const { pathname, email, allowedEmail, preview } = input;
  if (preview) return "allow";
  if (!email) return isPublicPath(pathname) ? "allow" : "login";
  if (!isAllowedEmail(email, allowedEmail)) return "deny";
  return PUBLIC_PATHS.includes(pathname) ? "home" : "allow";
}

/** Preview needs an explicit flag and a non-production build, so it can never open up a deployed app. */
export function isAuthPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.AUTH_PREVIEW === "true";
}
