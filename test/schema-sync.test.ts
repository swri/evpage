import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSchema } from '../scripts/build-schema.mjs';

const root = join(import.meta.dirname, '..');

test('supabase/schema.sql is in sync with migrations (run pnpm db:schema)', () => {
  const current = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(current, buildSchema());
});

test('schema.sql and migrations contain no demo seed data', () => {
  const schema = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8');
  assert.ok(!schema.includes('PT Arena Nusantara Mandiri'), 'seed belongs in supabase/seed.sql');
});
