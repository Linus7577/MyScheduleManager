import { describe, expect, it, vi } from "vitest";
import { withRequestCache } from "@/features/schedule/request-cache";

function fakeRepo() {
  let value = 1;
  const read = vi.fn(async (key: string) => (key ? value : 0));
  return {
    read,
    repo: {
      getValue: read,
      listValues: async () => [value],
      setValue: async (next: number) => {
        value = next;
      },
    },
  };
}

describe("withRequestCache", () => {
  it("runs the same read once", async () => {
    const { repo, read } = fakeRepo();
    const cached = withRequestCache(repo);
    await cached.getValue("a");
    await cached.getValue("a");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shares one read between callers running at the same time", async () => {
    const { repo, read } = fakeRepo();
    const cached = withRequestCache(repo);
    await Promise.all([cached.getValue("a"), cached.getValue("a")]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps different arguments apart", async () => {
    const { repo, read } = fakeRepo();
    const cached = withRequestCache(repo);
    await cached.getValue("a");
    await cached.getValue("b");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("sees its own writes", async () => {
    const { repo } = fakeRepo();
    const cached = withRequestCache(repo);
    expect(await cached.getValue("a")).toBe(1);
    await cached.setValue(2);
    expect(await cached.getValue("a")).toBe(2);
  });
});
