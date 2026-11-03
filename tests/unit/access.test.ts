import { describe, expect, it } from "vitest";
import { decideAccess, isAllowedEmail, isAuthPreviewEnabled } from "@/lib/auth/access";

const ALLOWED = "owner@example.com";
const decide = (pathname: string, email: string | null, allowedEmail: string | undefined = ALLOWED) =>
  decideAccess({ pathname, email, allowedEmail, preview: false });

describe("isAllowedEmail", () => {
  it("matches ignoring case and spaces", () => {
    expect(isAllowedEmail(" Owner@Example.com ", ALLOWED)).toBe(true);
  });

  it("rejects other emails, including near matches", () => {
    expect(isAllowedEmail("other@example.com", ALLOWED)).toBe(false);
    expect(isAllowedEmail("owner@example.com.evil.test", ALLOWED)).toBe(false);
  });

  it("fails closed when either side is missing or blank", () => {
    expect(isAllowedEmail(null, ALLOWED)).toBe(false);
    expect(isAllowedEmail(ALLOWED, undefined)).toBe(false);
    expect(isAllowedEmail(ALLOWED, "   ")).toBe(false);
    expect(isAllowedEmail("", "")).toBe(false);
  });
});

describe("decideAccess", () => {
  it("sends signed-out visitors to login from private pages", () => {
    for (const path of ["/", "/loop", "/settings", "/api/anything"]) {
      expect(decide(path, null)).toBe("login");
    }
  });

  it("lets signed-out visitors reach the public pages", () => {
    for (const path of ["/login", "/access-denied", "/auth/login", "/auth/callback"]) {
      expect(decide(path, null)).toBe("allow");
    }
  });

  it("doesn't treat paths that only look public as public", () => {
    expect(decide("/login-secret", null)).toBe("login");
    expect(decide("/authx", null)).toBe("login");
  });

  it("denies a signed-in stranger everywhere, including public pages", () => {
    for (const path of ["/", "/settings", "/login", "/auth/callback"]) {
      expect(decide(path, "stranger@example.com")).toBe("deny");
    }
  });

  it("denies everyone signed in when ALLOWED_EMAIL isn't set", () => {
    expect(decide("/", ALLOWED, "")).toBe("deny");
  });

  it("lets the owner in and moves them off the login page", () => {
    expect(decide("/", ALLOWED)).toBe("allow");
    expect(decide("/settings", ALLOWED)).toBe("allow");
    expect(decide("/login", ALLOWED)).toBe("home");
    expect(decide("/access-denied", ALLOWED)).toBe("home");
  });
});

describe("isAuthPreviewEnabled", () => {
  it("needs both the flag and a non-production build", () => {
    expect(isAuthPreviewEnabled({ NODE_ENV: "development", AUTH_PREVIEW: "true" })).toBe(true);
    expect(isAuthPreviewEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isAuthPreviewEnabled({ NODE_ENV: "development", AUTH_PREVIEW: "1" })).toBe(false);
  });

  it("is always off in production", () => {
    expect(isAuthPreviewEnabled({ NODE_ENV: "production", AUTH_PREVIEW: "true" })).toBe(false);
  });
});
