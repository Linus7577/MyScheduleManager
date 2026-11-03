import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";
import { isAuthorizedCron } from "@/lib/security/cron";

describe("isAuthorizedCron", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong, unprefixed or missing header", () => {
    expect(isAuthorizedCron("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
  });

  it("refuses everyone when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });
});

describe("buildCsp", () => {
  const production = buildCsp({ nonce: "abc", isDev: false, supabaseUrl: "https://ref.supabase.co" });

  it("only runs scripts carrying this request's nonce", () => {
    expect(production).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(production).not.toContain("unsafe-eval");
  });

  it("blocks framing, plugins and base-tag tricks", () => {
    expect(production).toContain("frame-ancestors 'none'");
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("base-uri 'self'");
  });

  it("allows connections to Supabase and nowhere else", () => {
    expect(production).toContain("connect-src 'self' https://ref.supabase.co wss://ref.supabase.co");
  });

  it("works before Supabase is configured", () => {
    expect(buildCsp({ nonce: "abc", isDev: false, supabaseUrl: undefined })).toContain("connect-src 'self';");
  });

  it("allows eval only in development", () => {
    expect(buildCsp({ nonce: "abc", isDev: true, supabaseUrl: undefined })).toContain("'unsafe-eval'");
  });
});
