import { afterEach, describe, expect, it, vi } from "vitest";
import { freshFetch } from "@/lib/supabase/fresh-fetch";

describe("freshFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const stub = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", stub);
    return stub;
  }

  it("adds a signal, which stops a page's read-back being answered from memory", async () => {
    const stub = stubFetch();
    await freshFetch("https://example.com", { headers: { a: "b" } });
    expect(stub).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ headers: { a: "b" }, signal: expect.any(AbortSignal) })
    );
  });

  it("keeps a signal the caller already passed", async () => {
    const stub = stubFetch();
    const { signal } = new AbortController();
    await freshFetch("https://example.com", { signal });
    expect(stub).toHaveBeenCalledWith("https://example.com", expect.objectContaining({ signal }));
  });
});
