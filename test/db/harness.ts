// In-process Postgres (PGlite) with the minimum of Supabase's platform
// objects stubbed (auth.uid(), anon/authenticated roles, storage tables),
// so migrations, RLS policies and RPCs can be tested without a server.
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

const SUPABASE_STUB = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}'::jsonb);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  GRANT SELECT ON auth.users TO authenticated;

  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN DEFAULT false);
  CREATE TABLE storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT,
    owner UUID
  );
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT string_to_array(name, '/')
  $$;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated;
  GRANT ALL ON storage.objects TO anon, authenticated;

  -- Supabase grants table access broadly and relies on RLS to restrict it
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function createTestDb() {
  const db = await PGlite.create({ extensions: { uuid_ossp } });
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }

  /** Runs statements as the given Supabase role, then resets to superuser. */
  async function as<T = Record<string, unknown>>(
    role: 'anon' | 'authenticated',
    userId: string | null,
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
    await db.exec(`SET ROLE ${role}`);
    try {
      const res = await db.query<T>(sql, params);
      return res.rows;
    } finally {
      await db.exec('RESET ROLE');
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  return {
    db,
    /** Superuser query (setup / assertions) */
    sql: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      (await db.query<T>(sql, params)).rows,
    anon: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as<T>('anon', null, sql, params),
    user: <T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) =>
      as<T>('authenticated', userId, sql, params),
    async createUser(email: string): Promise<string> {
      const [row] = (await db.query<{ id: string }>(
        `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), $1) RETURNING id`,
        [email]
      )).rows;
      return row.id;
    },
    close: () => db.close(),
  };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
