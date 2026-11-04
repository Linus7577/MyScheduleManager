import { VAULT_DEFAULT_SECTIONS } from "@/config/app.config";
import type { ScheduleContext } from "@/features/schedule/generation";
import type { ActionResult } from "@/features/schedule/types";
import { sortVaultItems } from "./logic";
import type { VaultItem, VaultItemFields } from "./types";

const OK: ActionResult = { ok: true };

/** Creates the default sections the first time. Every item needs a section, so there's always at least one. */
export async function ensureVaultReady(ctx: ScheduleContext): Promise<void> {
  if ((await ctx.repo.listVaultSections()).length > 0) return;
  await ctx.repo.insertVaultSections(VAULT_DEFAULT_SECTIONS.map((key, position) => ({ key, name: "", position })));
}

export async function createSection(ctx: ScheduleContext, name: string): Promise<ActionResult> {
  const sections = await ctx.repo.listVaultSections();
  const position = Math.max(-1, ...sections.map((section) => section.position)) + 1;
  await ctx.repo.insertVaultSections([{ key: null, name, position }]);
  return OK;
}

/** A section with items stays, so nothing is ever deleted by accident or left without a home. */
export async function deleteSection(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const items = await ctx.repo.listVaultItems();
  if (items.some((item) => item.section_id === id)) return { ok: false, code: "sectionNotEmpty" };
  await ctx.repo.deleteVaultSection(id);
  return OK;
}

async function targetsExist(ctx: ScheduleContext, fields: VaultItemFields): Promise<boolean> {
  const sections = await ctx.repo.listVaultSections();
  if (!sections.some((section) => section.id === fields.section_id)) return false;
  if (fields.goal_id && !(await ctx.repo.listGoals()).some((goal) => goal.id === fields.goal_id)) return false;
  if (fields.project_id && !(await ctx.repo.listProjects()).some((project) => project.id === fields.project_id)) return false;
  if (fields.track_id && !(await ctx.repo.listTracks()).some((track) => track.id === fields.track_id)) return false;
  return true;
}

export async function createItem(ctx: ScheduleContext, fields: VaultItemFields): Promise<ActionResult> {
  if (!(await targetsExist(ctx, fields))) return { ok: false, code: "invalid" };
  await ctx.repo.createVaultItem(fields);
  return OK;
}

export async function updateItem(ctx: ScheduleContext, id: string, fields: VaultItemFields): Promise<ActionResult> {
  if (!(await ctx.repo.getVaultItem(id))) return { ok: false, code: "notFound" };
  if (!(await targetsExist(ctx, fields))) return { ok: false, code: "invalid" };
  await ctx.repo.updateVaultItem(id, fields);
  return OK;
}

export async function getVaultView(ctx: ScheduleContext) {
  const [sections, items, goals, projects, tracks] = await Promise.all([
    ctx.repo.listVaultSections(),
    ctx.repo.listVaultItems(),
    ctx.repo.listGoals(),
    ctx.repo.listProjects(),
    ctx.repo.listTracks(),
  ]);
  return { sections, items: sortVaultItems(items), goals, projects, tracks };
}

/** Items for a goal, including those on its projects. */
export async function getItemsForGoal(ctx: ScheduleContext, goalId: string): Promise<VaultItem[]> {
  const [items, projects] = await Promise.all([ctx.repo.listVaultItems(), ctx.repo.listProjects()]);
  const projectIds = new Set(projects.filter((project) => project.goal_id === goalId).map((project) => project.id));
  return sortVaultItems(
    items.filter((item) => item.goal_id === goalId || (item.project_id !== null && projectIds.has(item.project_id)))
  );
}

export async function getItemsForTrack(ctx: ScheduleContext, trackId: string): Promise<VaultItem[]> {
  return sortVaultItems((await ctx.repo.listVaultItems()).filter((item) => item.track_id === trackId));
}
