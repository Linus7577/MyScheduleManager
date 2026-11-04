import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "@/features/schedule/memory-repo";
import type { ScheduleContext } from "@/features/schedule/generation";
import { collectTags, displayHost, filterVaultItems, linkKind, normalizeUrl, parseTags, sortVaultItems } from "@/features/vault/logic";
import { createItemSchema, updateItemSchema } from "@/features/vault/schema";
import {
  createItem,
  createSection,
  deleteSection,
  ensureVaultReady,
  getItemsForGoal,
  getItemsForTrack,
  getVaultView,
  updateItem,
} from "@/features/vault/service";
import type { VaultItem, VaultItemFields } from "@/features/vault/types";

const SECTION = "00000000-0000-4000-8000-000000000001";

const fields = (patch: Partial<VaultItemFields> = {}): VaultItemFields => ({
  type: "link",
  title: "Item",
  section_id: SECTION,
  description: "",
  tags: [],
  url: "https://example.com",
  body: "",
  goal_id: null,
  project_id: null,
  track_id: null,
  pinned: false,
  ...patch,
});

const item = (patch: Partial<VaultItem> = {}): VaultItem => ({ ...fields(), id: "i", created_at: "2026-11-01T00:00:00Z", ...patch });

describe("tags", () => {
  it("splits on commas, including Chinese ones, and tidies up", () => {
    expect(parseTags(" exam , 期末，notes、 ,")).toEqual(["exam", "期末", "notes"]);
  });

  it("drops repeats, ignoring case", () => {
    expect(parseTags("React, react, REACT")).toEqual(["React"]);
  });

  it("limits how many and how long", () => {
    expect(parseTags(Array.from({ length: 15 }, (_, index) => `t${index}`).join(","))).toHaveLength(10);
    expect(parseTags("x".repeat(50))[0]).toHaveLength(30);
  });

  it("lists every tag once, in order", () => {
    expect(collectTags([item({ tags: ["b", "A"] }), item({ tags: ["a", "c"] })])).toEqual(["A", "b", "c"]);
  });
});

describe("addresses", () => {
  it("adds https to a bare address", () => {
    expect(normalizeUrl(" drive.google.com/abc ")).toBe("https://drive.google.com/abc");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("")).toBe("");
  });

  it("leaves a dangerous scheme alone, for the schema to refuse", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  it.each([
    ["https://drive.google.com/file/d/1", "drive"],
    ["https://docs.google.com/document/d/1", "drive"],
    ["https://github.com/a/b", "github"],
    ["https://gist.github.com/a", "github"],
    ["https://raw.githubusercontent.com/a/b/c", "github"],
    ["https://www.youtube.com/watch?v=1", "youtube"],
    ["https://m.youtube.com/watch?v=1", "youtube"],
    ["https://youtu.be/1", "youtube"],
    ["https://example.com/paper.PDF", "pdf"],
    ["https://example.com/page", "web"],
  ])("gives %s the %s icon", (url, kind) => {
    expect(linkKind(url)).toBe(kind);
  });

  it("isn't fooled by look-alike domains", () => {
    expect(linkKind("https://github.com.evil.example")).toBe("web");
    expect(linkKind("https://notgithub.com/a")).toBe("web");
    expect(linkKind("https://example.com/github.com")).toBe("web");
  });

  it("copes with nothing or nonsense", () => {
    expect(linkKind(null)).toBe("web");
    expect(linkKind("not a url")).toBe("web");
    expect(displayHost("not a url")).toBe("");
    expect(displayHost("https://www.example.com/a")).toBe("example.com");
  });
});

describe("browsing", () => {
  const all = { query: "", sectionId: null, tag: null, type: null };
  const items = [
    item({ id: "a", title: "Linear algebra notes", tags: ["math"], section_id: "s1", type: "note", url: null, body: "Eigenvalues 特徵值" }),
    item({ id: "b", title: "React docs", description: "Hooks guide", tags: ["Web"], section_id: "s2", url: "https://react.dev" }),
    item({ id: "c", title: "Lecture slides", tags: ["math", "web"], section_id: "s2", type: "file", url: "https://drive.google.com/x" }),
  ];
  const ids = (filter: Partial<Parameters<typeof filterVaultItems>[1]>) =>
    filterVaultItems(items, { ...all, ...filter }).map((row) => row.id);

  it("shows everything with no filter", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
  });

  it("searches title, description, tags, address and note text", () => {
    expect(ids({ query: "algebra" })).toEqual(["a"]);
    expect(ids({ query: "hooks" })).toEqual(["b"]);
    expect(ids({ query: "drive.google" })).toEqual(["c"]);
    expect(ids({ query: "eigenvalues" })).toEqual(["a"]);
    expect(ids({ query: "math" })).toEqual(["a", "c"]);
  });

  it("finds Chinese text", () => {
    expect(ids({ query: "特徵" })).toEqual(["a"]);
  });

  it("ignores case, and needs every word", () => {
    expect(ids({ query: "REACT" })).toEqual(["b"]);
    expect(ids({ query: "lecture math" })).toEqual(["c"]);
    expect(ids({ query: "lecture react" })).toEqual([]);
    expect(ids({ query: "   " })).toEqual(["a", "b", "c"]);
  });

  it("filters by section, tag and type, together", () => {
    expect(ids({ sectionId: "s2" })).toEqual(["b", "c"]);
    expect(ids({ tag: "web" })).toEqual(["b", "c"]);
    expect(ids({ type: "note" })).toEqual(["a"]);
    expect(ids({ sectionId: "s2", tag: "math", type: "file", query: "slides" })).toEqual(["c"]);
    expect(ids({ sectionId: "s1", type: "file" })).toEqual([]);
  });

  it("puts pinned first, then newest", () => {
    const sorted = sortVaultItems([
      item({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
      item({ id: "new", created_at: "2026-11-01T00:00:00Z" }),
      item({ id: "pinned", created_at: "2025-01-01T00:00:00Z", pinned: true }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["pinned", "new", "old"]);
  });
});

describe("what's allowed in", () => {
  const ok = (input: unknown) => createItemSchema.safeParse(input).success;

  it("accepts a link, a file reference and a note", () => {
    expect(ok(fields())).toBe(true);
    expect(ok(fields({ type: "file", url: "http://example.com/a.zip" }))).toBe(true);
    expect(ok(fields({ type: "note", url: null, body: "# Hi" }))).toBe(true);
  });

  it("refuses any address that isn't http or https", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://example.com", "nonsense"]) {
      expect(ok(fields({ url })), url).toBe(false);
    }
  });

  it("needs an address on a link, and text on a note", () => {
    expect(ok(fields({ url: null }))).toBe(false);
    expect(ok(fields({ type: "note", url: null, body: "   " }))).toBe(false);
    expect(ok(fields({ type: "note", body: "Text" }))).toBe(false);
  });

  it("allows one link at most", () => {
    const a = "00000000-0000-4000-8000-00000000000a";
    expect(ok(fields({ goal_id: a }))).toBe(true);
    expect(ok(fields({ goal_id: a, track_id: a }))).toBe(false);
  });

  it("refuses unexpected fields", () => {
    expect(ok({ ...fields(), user_id: SECTION })).toBe(false);
    expect(updateItemSchema.safeParse(fields()).success).toBe(false);
  });
});

describe("the Vault's rules", () => {
  let ctx: ScheduleContext;
  let section: string;

  beforeEach(async () => {
    ctx = { repo: createMemoryRepo(), today: "2026-11-04" };
    await ensureVaultReady(ctx);
    section = (await ctx.repo.listVaultSections())[0].id;
  });

  it("creates the five default sections once", async () => {
    await ensureVaultReady(ctx);
    expect((await ctx.repo.listVaultSections()).map((row) => row.key)).toEqual(["courses", "projects", "learning", "finance", "personal"]);
  });

  it("adds a section at the end, and a rename keeps it in place", async () => {
    await createSection(ctx, "Exams");
    const sections = await ctx.repo.listVaultSections();
    expect(sections.at(-1)).toMatchObject({ key: null, name: "Exams", position: 5 });
    await ctx.repo.renameVaultSection(section, "Classes");
    expect((await ctx.repo.listVaultSections())[0]).toMatchObject({ key: "courses", name: "Classes" });
  });

  it("won't delete a section with items, until they've gone", async () => {
    await createItem(ctx, fields({ section_id: section }));
    expect(await deleteSection(ctx, section)).toEqual({ ok: false, code: "sectionNotEmpty" });
    expect(await ctx.repo.listVaultSections()).toHaveLength(5);

    const [saved] = await ctx.repo.listVaultItems();
    await ctx.repo.deleteVaultItem(saved.id);
    expect(await deleteSection(ctx, section)).toEqual({ ok: true });
    expect(await ctx.repo.listVaultSections()).toHaveLength(4);
  });

  it("refuses a section or link target that doesn't exist", async () => {
    expect(await createItem(ctx, fields())).toEqual({ ok: false, code: "invalid" });
    expect(await createItem(ctx, fields({ section_id: section, goal_id: "missing" }))).toEqual({ ok: false, code: "invalid" });
    expect(await createItem(ctx, fields({ section_id: section, project_id: "missing" }))).toEqual({ ok: false, code: "invalid" });
    expect(await createItem(ctx, fields({ section_id: section, track_id: "missing" }))).toEqual({ ok: false, code: "invalid" });
    expect(await ctx.repo.listVaultItems()).toEqual([]);
  });

  it("reports editing a missing item", async () => {
    expect(await updateItem(ctx, "missing", fields({ section_id: section }))).toEqual({ ok: false, code: "notFound" });
  });

  it("lists pinned items first", async () => {
    await createItem(ctx, fields({ section_id: section, title: "First", pinned: true }));
    await createItem(ctx, fields({ section_id: section, title: "Second" }));
    expect((await getVaultView(ctx)).items.map((row) => row.title)).toEqual(["First", "Second"]);
  });

  it("finds items for a goal, including its projects, and for a track", async () => {
    const goal = await ctx.repo.createGoal({ title: "G", why: "", target_date: null, status: "active" });
    const other = await ctx.repo.createGoal({ title: "Other", why: "", target_date: null, status: "active" });
    const project = await ctx.repo.createProject({ goal_id: goal.id, title: "P", status: "active", progress_mode: "tasks", manual_percent: 0 });
    const track = await ctx.repo.createTrack({ kind: "book", title: "T" });
    await createItem(ctx, fields({ section_id: section, title: "On goal", goal_id: goal.id }));
    await createItem(ctx, fields({ section_id: section, title: "On project", project_id: project.id }));
    await createItem(ctx, fields({ section_id: section, title: "On other", goal_id: other.id }));
    await createItem(ctx, fields({ section_id: section, title: "On track", track_id: track.id }));

    expect((await getItemsForGoal(ctx, goal.id)).map((row) => row.title).sort()).toEqual(["On goal", "On project"]);
    expect((await getItemsForTrack(ctx, track.id)).map((row) => row.title)).toEqual(["On track"]);
  });

  it("keeps items when what they link to is deleted", async () => {
    const goal = await ctx.repo.createGoal({ title: "G", why: "", target_date: null, status: "active" });
    const project = await ctx.repo.createProject({ goal_id: goal.id, title: "P", status: "active", progress_mode: "tasks", manual_percent: 0 });
    const track = await ctx.repo.createTrack({ kind: "book", title: "T" });
    await createItem(ctx, fields({ section_id: section, goal_id: goal.id }));
    await createItem(ctx, fields({ section_id: section, project_id: project.id }));
    await createItem(ctx, fields({ section_id: section, track_id: track.id }));

    await ctx.repo.deleteGoal(goal.id);
    await ctx.repo.deleteTrack(track.id);
    const items = await ctx.repo.listVaultItems();
    expect(items).toHaveLength(3);
    expect(items.every((row) => !row.goal_id && !row.project_id && !row.track_id)).toBe(true);
  });
});
