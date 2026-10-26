// Regenerates supabase/schema.sql from supabase/migrations/*.sql so the
// "paste into SQL Editor" file can never drift from the migrations.
// Usage: pnpm db:schema   (test/schema-sync.test.ts fails when out of date)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const migrationsDir = join(root, 'supabase', 'migrations');

export function buildSchema() {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const header = [
    '-- ============================================================',
    '-- GENERATED FILE - do not edit. Source: supabase/migrations/*.sql',
    '-- Regenerate with: pnpm db:schema',
    '-- For a fresh project: paste into the Supabase SQL Editor, or use',
    '-- `supabase db push`. Demo data lives separately in supabase/seed.sql.',
    '-- ============================================================',
    '',
  ].join('\n');
  const body = files
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8').replace(/\r\n/g, '\n').trimEnd())
    .join('\n\n');
  return `${header}\n${body}\n`;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  writeFileSync(join(root, 'supabase', 'schema.sql'), buildSchema());
  console.log('supabase/schema.sql regenerated');
}
