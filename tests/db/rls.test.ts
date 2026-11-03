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
