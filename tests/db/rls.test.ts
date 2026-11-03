import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const OWNER = "00000000-0000-0000-0000-00000000000a";
const STRANGER = "00000000-0000-0000-0000-00000000000b";

// The parts of Supabase that the migrations rely on, standing in for a real project.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role supabase_auth_admin nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, supabase_auth_admin;
  grant usage on schema public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select on auth.users to anon, authenticated;
`;

let db: PGlite;

async function asUser<T>(userId: string | null, role: string, run: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('test.user_id', $1, false)`, [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@example.com'), ($2, 'stranger@example.com')`, [
    OWNER,
    STRANGER,
  ]);
  await db.query(`insert into public.settings (user_id, timezone) values ($1, 'Asia/Taipei')`, [OWNER]);
  await db.query(`insert into public.audit_log (user_id, actor, action) values ($1, 'system', 'test')`, [OWNER]);
  await db.exec(`insert into private.signup_allowlist (email) values ('Owner@Example.com')`);
});

describe("RLS baseline", () => {
  it("is enabled on every table", async () => {
    const { rows } = await db.query<{ table: string }>(`
      select n.nspname || '.' || c.relname as table
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname in ('public', 'private')
        and not c.relrowsecurity
    `);
    expect(rows).toEqual([]);
  });

  it("gives every user table the standard columns", async () => {
    const { rows } = await db.query<{ table_name: string; missing: string }>(`
      select t.table_name, required.column_name as missing
      from information_schema.tables t
      cross join (values ('id'), ('user_id'), ('created_at'), ('updated_at')) as required(column_name)
      where t.table_schema = 'public'
        and not exists (
          select 1 from information_schema.columns c
          where c.table_schema = t.table_schema
            and c.table_name = t.table_name
            and c.column_name = required.column_name
        )
    `);
    expect(rows).toEqual([]);
  });

  it("gives the anon key nothing at all", async () => {
    await asUser(null, "anon", async () => {
      await expect(db.query("select * from public.settings")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.audit_log")).rejects.toThrow(/permission denied/);
    });
  });

  it("hides the owner's rows from another signed-in user", async () => {
    await asUser(STRANGER, "authenticated", async () => {
      expect((await db.query("select * from public.settings")).rows).toEqual([]);
      expect((await db.query("select * from public.audit_log")).rows).toEqual([]);
    });
  });

  it("stops another user changing the owner's row or writing as the owner", async () => {
    await asUser(STRANGER, "authenticated", async () => {
      const update = await db.query(`update public.settings set timezone = 'UTC' where user_id = $1`, [OWNER]);
      expect(update.affectedRows).toBe(0);
      await expect(
        db.query(`insert into public.settings (user_id) values ($1)`, [OWNER])
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("lets the owner read and change their own settings", async () => {
    await asUser(OWNER, "authenticated", async () => {
      const { rows } = await db.query<{ timezone: string }>("select timezone from public.settings");
      expect(rows).toEqual([{ timezone: "Asia/Taipei" }]);
      const update = await db.query(`update public.settings set locale = 'zh-TW' where user_id = $1`, [OWNER]);
      expect(update.affectedRows).toBe(1);
    });
  });

  it("makes audit_log append-only, even for the owner", async () => {
    await asUser(OWNER, "authenticated", async () => {
      await db.query(`insert into public.audit_log (actor, action) values ('owner', 'test')`);
      await expect(db.query(`update public.audit_log set action = 'forged'`)).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.audit_log")).rejects.toThrow(/permission denied/);
      await expect(db.query("truncate public.audit_log")).rejects.toThrow(/permission denied/);
    });
  });

  it("keeps the allowlist out of reach of app users", async () => {
    await asUser(OWNER, "authenticated", async () => {
      await expect(db.query("select * from private.signup_allowlist")).rejects.toThrow(/permission denied/);
    });
  });
});

describe("schedule tables", () => {
  const TEMPLATE = "10000000-0000-0000-0000-000000000001";
  const BLOCK = "10000000-0000-0000-0000-000000000002";
  const SCHEDULE_TABLES = [
    "loop_templates",
    "template_activations",
    "template_blocks",
    "block_instances",
    "events",
    "rest_days",
  ];

  beforeAll(async () => {
    await db.query(`insert into public.loop_templates (id, user_id, name) values ($1, $2, 'Semester')`, [TEMPLATE, OWNER]);
    await db.query(
      `insert into public.template_activations (user_id, template_id, effective_from) values ($1, $2, '2026-11-03')`,
      [OWNER, TEMPLATE]
    );
    await db.query(
      `insert into public.template_blocks (id, user_id, template_id, weekday, start_time, end_time, category, title)
       values ($1, $2, $3, 3, '09:00', '10:00', 'study', 'Study')`,
      [BLOCK, OWNER, TEMPLATE]
    );
    await db.query(
      `insert into public.block_instances (user_id, date, start_time, end_time, category, title, template_block_id)
       values ($1, '2026-11-04', '09:00', '10:00', 'study', 'Study', $2)`,
      [OWNER, BLOCK]
    );
    await db.query(
      `insert into public.events (user_id, title, category, start_date, end_date, start_time, end_time)
       values ($1, 'Dentist', 'other', '2026-11-04', '2026-11-04', '14:00', '15:00')`,
      [OWNER]
    );
    await db.query(`insert into public.rest_days (user_id, date, kind) values ($1, '2026-11-05', 'rest')`, [OWNER]);
  });

  it.each(SCHEDULE_TABLES)("%s is invisible to the anon key", async (table) => {
    await asUser(null, "anon", async () => {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
    });
  });

  it.each(SCHEDULE_TABLES)("%s hides the owner's rows from another user", async (table) => {
    await asUser(STRANGER, "authenticated", async () => {
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`delete from public.${table}`)).affectedRows).toBe(0);
    });
  });

  it.each(SCHEDULE_TABLES)("%s is readable by its owner", async (table) => {
    await asUser(OWNER, "authenticated", async () => {
      expect((await db.query(`select * from public.${table}`)).rows.length).toBeGreaterThan(0);
    });
  });

  it("stops a user writing a row as someone else", async () => {
    await asUser(STRANGER, "authenticated", async () => {
      await expect(
        db.query(`insert into public.rest_days (user_id, date, kind) values ($1, '2026-11-06', 'rest')`, [OWNER])
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("generating the same template block and date twice can't create a duplicate", async () => {
    await expect(
      db.query(
        `insert into public.block_instances (user_id, date, start_time, end_time, category, title, template_block_id)
         values ($1, '2026-11-04', '09:00', '10:00', 'study', 'Study', $2)`,
        [OWNER, BLOCK]
      )
    ).rejects.toThrow(/duplicate key/);
  });

  it("removing a template block keeps blocks already on the schedule", async () => {
    const block = "10000000-0000-0000-0000-000000000003";
    await db.query(
      `insert into public.template_blocks (id, user_id, template_id, weekday, start_time, end_time, category, title)
       values ($1, $2, $3, 4, '09:00', '10:00', 'gym', 'Gym')`,
      [block, OWNER, TEMPLATE]
    );
    await db.query(
      `insert into public.block_instances (user_id, date, start_time, end_time, category, title, template_block_id, status)
       values ($1, '2026-11-05', '09:00', '10:00', 'gym', 'Gym', $2, 'done')`,
      [OWNER, block]
    );
    await db.query(`delete from public.template_blocks where id = $1`, [block]);

    const { rows } = await db.query<{ status: string; template_block_id: string | null }>(
      `select status, template_block_id from public.block_instances where date = '2026-11-05'`
    );
    expect(rows).toEqual([{ status: "done", template_block_id: null }]);
  });

  it("rejects an unknown category, status, weekday or rest kind", async () => {
    await expect(
      db.query(`insert into public.rest_days (user_id, date, kind) values ($1, '2026-12-01', 'nap')`, [OWNER])
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `insert into public.template_blocks (user_id, template_id, weekday, start_time, end_time, category, title)
         values ($1, $2, 8, '09:00', '10:00', 'study', 'Bad')`,
        [OWNER, TEMPLATE]
      )
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `insert into public.block_instances (user_id, date, start_time, end_time, category, title, status)
         values ($1, '2026-12-01', '09:00', '10:00', 'magic', 'Bad', 'planned')`,
        [OWNER]
      )
    ).rejects.toThrow(/check constraint/);
  });
});

describe("command center tables", () => {
  const TABLES = [
    "goals",
    "projects",
    "tasks",
    "learning_tracks",
    "learning_units",
    "progress_snapshots",
    "habits",
    "habit_checkins",
    "widget_layouts",
  ];
  const GOAL = "20000000-0000-0000-0000-000000000001";
  const PROJECT = "20000000-0000-0000-0000-000000000002";
  const TRACK = "20000000-0000-0000-0000-000000000003";
  const HABIT = "20000000-0000-0000-0000-000000000004";

  beforeAll(async () => {
    await db.query(`insert into public.goals (id, user_id, title) values ($1, $2, 'Goal')`, [GOAL, OWNER]);
    await db.query(`insert into public.projects (id, user_id, goal_id, title) values ($1, $2, $3, 'Project')`, [PROJECT, OWNER, GOAL]);
    await db.query(`insert into public.learning_tracks (id, user_id, kind, title) values ($1, $2, 'book', 'Book')`, [TRACK, OWNER]);
    await db.query(`insert into public.learning_units (user_id, track_id, title) values ($1, $2, 'Unit')`, [OWNER, TRACK]);
    await db.query(`insert into public.tasks (user_id, project_id, title, track_id) values ($1, $2, 'Task', $3)`, [OWNER, PROJECT, TRACK]);
    await db.query(
      `insert into public.progress_snapshots (user_id, date, entity_type, entity_id, percent) values ($1, '2026-11-03', 'goal', $2, 10)`,
      [OWNER, GOAL]
    );
    await db.query(`insert into public.habits (id, user_id, title) values ($1, $2, 'Gym')`, [HABIT, OWNER]);
    await db.query(`insert into public.habit_checkins (user_id, habit_id, date) values ($1, $2, '2026-11-03')`, [OWNER, HABIT]);
    await db.query(`insert into public.widget_layouts (user_id, device, layout) values ($1, 'mobile', '[]')`, [OWNER]);
  });

  it.each(TABLES)("%s is invisible to the anon key", async (table) => {
    await asUser(null, "anon", async () => {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
    });
  });

  it.each(TABLES)("%s hides the owner's rows from another user", async (table) => {
    await asUser(STRANGER, "authenticated", async () => {
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`delete from public.${table}`)).affectedRows).toBe(0);
    });
  });

  it.each(TABLES)("%s is readable by its owner", async (table) => {
    await asUser(OWNER, "authenticated", async () => {
      expect((await db.query(`select * from public.${table}`)).rows.length).toBeGreaterThan(0);
    });
  });

  it("allows one check-in per habit per day", async () => {
    await expect(
      db.query(`insert into public.habit_checkins (user_id, habit_id, date) values ($1, $2, '2026-11-03')`, [OWNER, HABIT])
    ).rejects.toThrow(/duplicate key/);
  });

  it("replaces a day's snapshot rather than adding a second one", async () => {
    await expect(
      db.query(
        `insert into public.progress_snapshots (user_id, date, entity_type, entity_id, percent) values ($1, '2026-11-03', 'goal', $2, 20)`,
        [OWNER, GOAL]
      )
    ).rejects.toThrow(/duplicate key/);
  });

  it("refuses a percent outside 0 to 100", async () => {
    await expect(
      db.query(`update public.learning_units set percent = 101 where track_id = $1`, [TRACK])
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`update public.projects set manual_percent = -1 where id = $1`, [PROJECT])
    ).rejects.toThrow(/check constraint/);
  });

  it("deleting a track keeps tagged tasks, without the tag", async () => {
    await db.query(`delete from public.learning_tracks where id = $1`, [TRACK]);
    const { rows } = await db.query<{ track_id: string | null }>(`select track_id from public.tasks where project_id = $1`, [PROJECT]);
    expect(rows).toEqual([{ track_id: null }]);
  });

  it("deleting a goal removes its projects and tasks", async () => {
    await db.query(`delete from public.goals where id = $1`, [GOAL]);
    expect((await db.query(`select * from public.projects where id = $1`, [PROJECT])).rows).toEqual([]);
    expect((await db.query(`select * from public.tasks where project_id = $1`, [PROJECT])).rows).toEqual([]);
  });
});

describe("Oracle tables", () => {
  const TABLES = [
    "ai_conversations",
    "ai_messages",
    "ai_proposals",
    "ai_actions",
    "ai_suggestions",
    "ai_rate_limits",
    "weekly_reviews",
  ];
  const CONVERSATION = "30000000-0000-0000-0000-000000000001";

  beforeAll(async () => {
    await db.query(`insert into public.ai_conversations (id, user_id) values ($1, $2)`, [CONVERSATION, OWNER]);
    await db.query(`insert into public.ai_messages (user_id, conversation_id, role, content) values ($1, $2, 'user', 'Hi')`, [OWNER, CONVERSATION]);
    await db.query(
      `insert into public.ai_proposals (user_id, conversation_id, kind, summary, changes, expires_at)
       values ($1, $2, 'block_changes', 'Move', '[]', now() + interval '48 hours')`,
      [OWNER, CONVERSATION]
    );
    await db.query(
      `insert into public.ai_actions (user_id, conversation_id, tool, summary, undo, undo_until)
       values ($1, $2, 'create_goal', 'G', '{}', now() + interval '7 days')`,
      [OWNER, CONVERSATION]
    );
    await db.query(`insert into public.ai_suggestions (user_id, date, text) values ($1, '2026-11-03', 'Do it')`, [OWNER]);
    await db.query(`insert into public.ai_rate_limits (user_id, window_start, count) values ($1, now(), 1)`, [OWNER]);
    await db.query(`insert into public.weekly_reviews (user_id, week_start, oracle_text) values ($1, '2026-11-02', 'Good')`, [OWNER]);
  });

  it.each(TABLES)("%s is invisible to the anon key", async (table) => {
    await asUser(null, "anon", async () => {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
    });
  });

  it.each(TABLES)("%s hides the owner's rows from another user", async (table) => {
    await asUser(STRANGER, "authenticated", async () => {
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`delete from public.${table}`)).affectedRows).toBe(0);
    });
  });

  it.each(TABLES)("%s is readable by its owner", async (table) => {
    await asUser(OWNER, "authenticated", async () => {
      expect((await db.query(`select * from public.${table}`)).rows.length).toBeGreaterThan(0);
    });
  });

  it("refuses an unknown proposal status or kind", async () => {
    await expect(db.query(`update public.ai_proposals set status = 'maybe'`)).rejects.toThrow(/check constraint/);
    await expect(db.query(`update public.ai_proposals set kind = 'finance'`)).rejects.toThrow(/check constraint/);
  });

  describe("rate limit counter", () => {
    const RATE_USER = "00000000-0000-0000-0000-00000000000c";
    const bump = async (max: number) =>
      (
        await db.query<{ result: boolean }>("select public.bump_ai_rate_limit($1, $2) as result", [RATE_USER, max])
      ).rows[0].result;

    beforeAll(async () => {
      await db.query(`insert into auth.users (id, email) values ($1, 'rate@example.com')`, [RATE_USER]);
    });

    it("allows up to the limit, then refuses", async () => {
      await asUser(RATE_USER, "authenticated", async () => {
        expect(await bump(2)).toBe(true);
        expect(await bump(2)).toBe(true);
        expect(await bump(2)).toBe(false);
      });
    });

    it("can't be called by the anon key", async () => {
      await asUser(null, "anon", async () => {
        await expect(bump(2)).rejects.toThrow(/permission denied/);
      });
    });

    it("starts again in a new minute", async () => {
      await db.query(`update public.ai_rate_limits set window_start = now() - interval '5 minutes' where user_id = $1`, [RATE_USER]);
      await asUser(RATE_USER, "authenticated", async () => {
        expect(await bump(2)).toBe(true);
      });
    });
  });
});

describe("game tables and the atomic commit", () => {
  const GAME_TABLES = ["game_state", "game_ledger", "closed_days", "daily_summaries"];

  const baseState = {
    total_xp: 60,
    power: 94.5,
    tier: 1,
    streak_days: 1,
    power_zero_count: 0,
    demotion_count: 0,
    last_closed_date: "2026-11-02",
  };

  const commitPayload = (patch: Record<string, unknown> = {}) => ({
    expected_version: 0,
    close_date: "2026-11-02",
    instances: [],
    ledger: [
      {
        date: "2026-11-02",
        source: "closeout",
        block_instance_id: null,
        block_title: "Study",
        reason: "skipped",
        delta_xp: -15,
        delta_power: -6,
        tier: 1,
      },
    ],
    state: baseState,
    summaries: [],
    audit: [{ actor: "system", action: "day_closeout", entity: "2026-11-02", details: {} }],
    ...patch,
  });

  const callCommit = (owner: string, payload: unknown) =>
    db.query<{ result: boolean }>("select public.apply_game_commit($1, $2::jsonb) as result", [
      owner,
      JSON.stringify(payload),
    ]);

  beforeAll(async () => {
    await db.query("insert into public.game_state (user_id) values ($1)", [OWNER]);
  });

  it.each(GAME_TABLES)("%s is invisible to the anon key", async (table) => {
    await asUser(null, "anon", async () => {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
    });
  });

  it("the anon key can't call the commit", async () => {
    await asUser(null, "anon", async () => {
      await expect(callCommit(OWNER, commitPayload())).rejects.toThrow(/permission denied/);
    });
  });

  it("another user can't commit as the owner", async () => {
    await asUser(STRANGER, "authenticated", async () => {
      const { rows } = await callCommit(OWNER, commitPayload());
      expect(rows[0].result).toBe(false);
    });
    const { rows } = await db.query<{ total_xp: number }>("select total_xp from public.game_state where user_id = $1", [OWNER]);
    expect(rows[0].total_xp).toBe(0);
  });

  it("applies everything together", async () => {
    await asUser(OWNER, "authenticated", async () => {
      const { rows } = await callCommit(OWNER, commitPayload());
      expect(rows[0].result).toBe(true);

      const state = await db.query<{ total_xp: number; version: number; power: string }>(
        "select total_xp, version, power from public.game_state"
      );
      expect(state.rows[0].total_xp).toBe(60);
      expect(state.rows[0].version).toBe(1);
      expect(Number(state.rows[0].power)).toBe(94.5);

      expect((await db.query("select * from public.game_ledger")).rows).toHaveLength(1);
      expect((await db.query("select * from public.closed_days")).rows).toHaveLength(1);
      expect((await db.query("select * from public.audit_log where action = 'day_closeout'")).rows).toHaveLength(1);
    });
  });

  it("closing the same day twice changes nothing at all", async () => {
    await asUser(OWNER, "authenticated", async () => {
      const { rows } = await callCommit(
        OWNER,
        commitPayload({ expected_version: 1, state: { ...baseState, total_xp: 999 } })
      );
      expect(rows[0].result).toBe(false);

      const state = await db.query<{ total_xp: number; version: number }>("select total_xp, version from public.game_state");
      expect(state.rows[0]).toEqual({ total_xp: 60, version: 1 });
      expect((await db.query("select * from public.game_ledger")).rows).toHaveLength(1);
    });
  });

  it("refuses a change based on an out-of-date state", async () => {
    await asUser(OWNER, "authenticated", async () => {
      const { rows } = await callCommit(
        OWNER,
        commitPayload({ expected_version: 0, close_date: null, state: { ...baseState, total_xp: 999 } })
      );
      expect(rows[0].result).toBe(false);
      const state = await db.query<{ total_xp: number }>("select total_xp from public.game_state");
      expect(state.rows[0].total_xp).toBe(60);
    });
  });

  it("the ledger and closed days are append-only, even for the owner", async () => {
    await asUser(OWNER, "authenticated", async () => {
      await expect(db.query("update public.game_ledger set delta_xp = 9999")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.game_ledger")).rejects.toThrow(/permission denied/);
      await expect(db.query("truncate public.game_ledger")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.closed_days")).rejects.toThrow(/permission denied/);
    });
  });

  it("another user sees none of the owner's game data", async () => {
    await asUser(STRANGER, "authenticated", async () => {
      for (const table of GAME_TABLES) {
        expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      }
    });
  });

  it("the database itself refuses impossible values", async () => {
    await expect(db.query("update public.game_state set total_xp = -1")).rejects.toThrow(/check constraint/);
    await expect(db.query("update public.game_state set power = 101")).rejects.toThrow(/check constraint/);
    await expect(db.query("update public.game_state set tier = 9")).rejects.toThrow(/check constraint/);
  });
});

describe("before-user-created hook", () => {
  const callHook = async (email: string | null) => {
    const event = JSON.stringify({ user: { email } });
    const { rows } = await asUser(null, "supabase_auth_admin", () =>
      db.query<{ result: { error?: { http_code: number } } }>(
        "select public.hook_before_user_created($1::jsonb) as result",
        [event]
      )
    );
    return rows[0].result;
  };

  it("allows the allow-listed email, ignoring case", async () => {
    expect(await callHook("owner@example.com")).toEqual({});
  });

  it("rejects anyone else with a 403", async () => {
    expect((await callHook("stranger@example.com")).error?.http_code).toBe(403);
  });

  it("rejects a sign-up with no email", async () => {
    expect((await callHook(null)).error?.http_code).toBe(403);
  });

  it("can't be called by app users", async () => {
    await asUser(STRANGER, "authenticated", async () => {
      await expect(
        db.query(`select public.hook_before_user_created('{}'::jsonb)`)
      ).rejects.toThrow(/permission denied/);
    });
  });
});
