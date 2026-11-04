import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKUP_TABLES } from "@/features/backup/logic";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const OWNER = "00000000-0000-0000-0000-00000000000a";
const STRANGER = "00000000-0000-0000-0000-00000000000b";
const GOAL = "00000000-0000-0000-0000-0000000000a1";
const EVENT = "00000000-0000-0000-0000-0000000000a2";
const BLOCK = "00000000-0000-0000-0000-0000000000a3";

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

const restore = (owner: string | null, backup: unknown) =>
  db.query(`select public.restore_backup($1, $2::jsonb)`, [owner, JSON.stringify(backup)]);

const count = async (table: string, owner: string) => {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [owner]);
  return rows[0].n;
};

const titles = async (table: string, owner: string) => {
  const { rows } = await db.query<{ title: string }>(`select title from public.${table} where user_id = $1 order by title`, [owner]);
  return rows.map((row) => row.title);
};

const event = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  category: "other",
  all_day: true,
  start_date: "2026-11-04",
  end_date: "2026-11-04",
  ...extra,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@example.com'), ($2, 'stranger@example.com')`, [OWNER, STRANGER]);
});

describe("repeating events", () => {
  it("stores a rule and removed dates, and refuses an over-long rule", async () => {
    const { rows } = await db.query<{ rrule: string; exdates: string[] }>(
      `insert into public.events (user_id, title, category, all_day, start_date, end_date, rrule, exdates)
       values ($1, 'Series', 'other', true, '2026-11-04', '2026-11-04', 'FREQ=DAILY', '{2026-11-05}') returning rrule, exdates`,
      [OWNER]
    );
    expect(rows[0].rrule).toBe("FREQ=DAILY");
    expect(rows[0].exdates).toHaveLength(1);
    await expect(
      db.query(`insert into public.events (user_id, title, category, all_day, start_date, end_date, rrule) values ($1, 'Long', 'other', true, '2026-11-04', '2026-11-04', $2)`, [OWNER, "x".repeat(301)])
    ).rejects.toThrow(/check constraint/);
    await db.query(`delete from public.events where user_id = $1`, [OWNER]);
  });

  it("keeps one copy of an imported event per owner", async () => {
    const insert = (owner: string) =>
      db.query(`insert into public.events (user_id, title, category, all_day, start_date, end_date, ics_uid) values ($1, 'Imported', 'other', true, '2026-11-04', '2026-11-04', 'uid-1')`, [owner]);
    await insert(OWNER);
    await expect(insert(OWNER)).rejects.toThrow(/duplicate key/);
    await insert(STRANGER);
    await db.query(`delete from public.events where ics_uid = 'uid-1'`);
  });
});

describe("notification tables", () => {
  const TABLES = ["push_subscriptions", "notification_log"];

  beforeEach(async () => {
    await db.exec(`delete from public.push_subscriptions; delete from public.notification_log;`);
    await db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/a', 'k', 'a')`, [OWNER]);
    await db.query(`insert into public.notification_log (user_id, kind, key) values ($1, 'weekly', '2026-11-02')`, [OWNER]);
  });

  it("shows the owner their own rows and hides them from anyone else", async () => {
    for (const table of TABLES) {
      const own = await asUser(OWNER, "authenticated", () => db.query(`select * from public.${table}`));
      expect(own.rows, table).toHaveLength(1);
      const other = await asUser(STRANGER, "authenticated", () => db.query(`select * from public.${table}`));
      expect(other.rows, table).toHaveLength(0);
    }
  });

  it("gives the anon key nothing", async () => {
    for (const table of TABLES) {
      await asUser(null, "anon", async () => {
        await expect(db.query(`select * from public.${table}`), table).rejects.toThrow(/permission denied/);
      });
    }
  });

  it("refuses another owner's rows, and an address that isn't secure", async () => {
    await asUser(STRANGER, "authenticated", async () => {
      await expect(
        db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/b', 'k', 'a')`, [OWNER])
      ).rejects.toThrow(/row-level security/);
    });
    await expect(
      db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'http://push.example/c', 'k', 'a')`, [OWNER])
    ).rejects.toThrow(/check constraint/);
  });

  it("records each notification once, and says so when one is repeated", async () => {
    const claim = () =>
      db.query(
        `insert into public.notification_log (user_id, kind, key) values ($1, 'weekly', '2026-11-09')
         on conflict (user_id, kind, key) do nothing returning id`,
        [OWNER]
      );
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
  });

  it("turns only the Sunday review on by default", async () => {
    await db.query(`insert into public.settings (user_id) values ($1) on conflict (user_id) do nothing`, [STRANGER]);
    const { rows } = await db.query(`select notify_weekly, notify_block_start, notify_open_blocks, notify_low_power from public.settings where user_id = $1`, [STRANGER]);
    expect(rows[0]).toEqual({ notify_weekly: true, notify_block_start: false, notify_open_blocks: false, notify_low_power: false });
    await db.query(`delete from public.settings where user_id = $1`, [STRANGER]);
  });
});

describe("restoring a backup", () => {
  beforeEach(async () => {
    await restore(OWNER, { tables: {} });
    await restore(STRANGER, { tables: {} });
    await db.query(`insert into public.goals (id, user_id, title) values ($1, $2, 'Old goal')`, [GOAL, OWNER]);
    await db.query(`insert into public.events (user_id, title, category, all_day, start_date, end_date) values ($1, 'Old event', 'other', true, '2026-11-04', '2026-11-04')`, [OWNER]);
    await db.query(`insert into public.events (user_id, title, category, all_day, start_date, end_date) values ($1, 'Stranger event', 'other', true, '2026-11-04', '2026-11-04')`, [STRANGER]);
    await db.query(`insert into public.game_state (user_id) values ($1)`, [OWNER]);
    await db.query(`insert into public.game_ledger (user_id, date, source, reason, tier) values ($1, '2026-11-04', 'block', 'block_done', 1)`, [OWNER]);
    await db.query(`insert into public.audit_log (user_id, actor, action) values ($1, 'system', 'old')`, [OWNER]);
    await db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/keep', 'k', 'a') on conflict do nothing`, [OWNER]);
  });

  it("lists exactly the tables the app's backup file lists, in an order that can be put back", async () => {
    const { rows } = await db.query<{ source: string }>(`select prosrc as source from pg_proc where proname = 'restore_backup'`);
    const inFunction = /restore_order constant text\[\] := array\[([^\]]+)\]/.exec(rows[0].source)?.[1];
    const names = [...(inFunction ?? "").matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(names).toEqual([...BACKUP_TABLES]);
  });

  it("covers every table holding the owner's data, apart from the ones left out on purpose", async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);
    const leftOut = ["push_subscriptions", "notification_log", "ai_rate_limits"];
    const expected = rows.map((row) => row.table_name).filter((name) => !leftOut.includes(name));
    expect([...BACKUP_TABLES].sort()).toEqual(expected.sort());
  });

  it("replaces everything with the file, including the append-only history", async () => {
    await restore(OWNER, {
      tables: {
        events: [event(EVENT, "Restored event", { rrule: "FREQ=WEEKLY", exdates: ["2026-11-11"] })],
        goals: [{ id: GOAL, title: "Restored goal" }],
        audit_log: [{ actor: "owner", action: "from file" }],
      },
    });

    expect(await titles("events", OWNER)).toEqual(["Restored event"]);
    expect(await titles("goals", OWNER)).toEqual(["Restored goal"]);
    expect(await count("game_ledger", OWNER)).toBe(0);
    expect(await count("game_state", OWNER)).toBe(0);
    const { rows } = await db.query<{ action: string }>(`select action from public.audit_log where user_id = $1`, [OWNER]);
    expect(rows.map((row) => row.action)).toEqual(["from file"]);
    const stored = await db.query<{ rrule: string; exdates: unknown[] }>(`select rrule, exdates from public.events where id = $1`, [EVENT]);
    expect(stored.rows[0].rrule).toBe("FREQ=WEEKLY");
    expect(stored.rows[0].exdates).toHaveLength(1);
  });

  it("leaves everyone else's rows and this device's notifications alone", async () => {
    const devices = await count("push_subscriptions", OWNER);
    await restore(OWNER, { tables: {} });
    expect(await titles("events", STRANGER)).toEqual(["Stranger event"]);
    expect(devices).toBeGreaterThan(0);
    expect(await count("push_subscriptions", OWNER)).toBe(devices);
  });

  it("puts rows under the owner running it, whatever the file claims", async () => {
    await restore(OWNER, { tables: { events: [event(EVENT, "Claimed", { user_id: STRANGER })] } });
    expect(await titles("events", OWNER)).toEqual(["Claimed"]);
    expect(await titles("events", STRANGER)).toEqual(["Stranger event"]);
  });

  it("keeps links between rows, so a block still points at its event", async () => {
    await restore(OWNER, {
      tables: {
        events: [event(EVENT, "Linked")],
        block_instances: [
          { id: BLOCK, date: "2026-11-04", start_time: "09:00", end_time: "10:00", category: "study", title: "Block", status: "done", event_id: EVENT },
        ],
        game_ledger: [{ date: "2026-11-04", source: "block", block_instance_id: BLOCK, reason: "block_done", delta_xp: 10, tier: 1 }],
      },
    });
    const { rows } = await db.query<{ event_id: string; delta_xp: number }>(
      `select b.event_id, l.delta_xp from public.block_instances b join public.game_ledger l on l.block_instance_id = b.id where b.id = $1`,
      [BLOCK]
    );
    expect(rows).toEqual([{ event_id: EVENT, delta_xp: 10 }]);
  });

  it("gives an older backup's missing columns their defaults, and ignores columns it doesn't know", async () => {
    await restore(OWNER, { tables: { events: [event(EVENT, "Older", { from_the_future: "ignored" })] } });
    const { rows } = await db.query<{ rrule: null; exdates: string[]; notes: string }>(`select rrule, exdates, notes from public.events where id = $1`, [EVENT]);
    expect(rows[0]).toEqual({ rrule: null, exdates: [], notes: "" });
  });

  it("changes nothing at all if a single row breaks a rule", async () => {
    await expect(
      restore(OWNER, {
        tables: {
          goals: [{ id: GOAL, title: "Would replace" }],
          events: [event(EVENT, "Breaks a rule", { end_date: "2020-01-01" })],
        },
      })
    ).rejects.toThrow(/check constraint/);
    expect(await titles("goals", OWNER)).toEqual(["Old goal"]);
    expect(await titles("events", OWNER)).toEqual(["Old event"]);
    expect(await count("game_ledger", OWNER)).toBe(1);
  });

  it("changes nothing if a row points at something the file doesn't have", async () => {
    await expect(
      restore(OWNER, { tables: { projects: [{ title: "Orphan", goal_id: "00000000-0000-0000-0000-0000000000ff" }] } })
    ).rejects.toThrow(/foreign key/);
    expect(await titles("goals", OWNER)).toEqual(["Old goal"]);
  });

  it("needs an owner", async () => {
    await expect(restore(null, { tables: {} })).rejects.toThrow(/needs an owner/);
  });

  it("runs with the server's secret key", async () => {
    await asUser(null, "service_role", () => restore(OWNER, { tables: { events: [event(EVENT, "By the server")] } }));
    expect(await titles("events", OWNER)).toEqual(["By the server"]);
  });

  it("gives the server's key every table the timers use", async () => {
    await asUser(null, "service_role", async () => {
      for (const table of [...BACKUP_TABLES, "push_subscriptions", "notification_log", "ai_rate_limits"]) {
        await expect(db.query(`select count(*) from public.${table}`), table).resolves.toBeDefined();
      }
    });
  });

  it("can't be run from a browser's key, signed in or not", async () => {
    await asUser(OWNER, "authenticated", async () => {
      await expect(restore(OWNER, { tables: {} })).rejects.toThrow(/permission denied/);
    });
    await asUser(null, "anon", async () => {
      await expect(restore(OWNER, { tables: {} })).rejects.toThrow(/permission denied/);
    });
    expect(await titles("goals", OWNER)).toEqual(["Old goal"]);
  });
});
