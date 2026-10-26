import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './db/harness.ts';

let t: TestDb;
let eventId: string;

const schema = JSON.stringify([
  { id: 'team_name', type: 'text', label: 'Tim' },
  { id: 'players', type: 'repeater', label: 'Pemain' },
]);

before(async () => {
  t = await createTestDb();
  const [evt] = await t.sql<{ id: string }>(
    `INSERT INTO public.events (slug, title, quota, price_type, price_amount, form_schema, status)
     VALUES ('cup', 'Cup', 2, 'per_participant', 50000, $1::jsonb, 'open') RETURNING id`,
    [schema]
  );
  eventId = evt.id;
});

after(async () => t?.close());

async function registerAsAnon(answers: object, phone = '081234567890') {
  const [row] = await t.anon<{ r: Record<string, unknown> }>(
    `SELECT public.create_registration_atomic($1, $2::jsonb, '', 'Budi', $3, '-') AS r`,
    [eventId, JSON.stringify(answers), phone]
  );
  return row.r;
}

test('anon registration is priced by the database, not the caller', async () => {
  const reg = await registerAsAnon({ players: [{}, {}, {}] });
  assert.equal(Number(reg.total_amount), 150000);
  assert.equal(reg.status, 'pending');
  assert.equal((reg.schema_snapshot as unknown[]).length, 2, 'snapshot copied from the event');
});

test('anon cannot insert or read registrations directly', async () => {
  await assert.rejects(
    t.anon(
      `INSERT INTO public.registrations (event_id, code, contact_name, contact_phone, contact_email, total_amount)
       VALUES ($1, 'X-1', 'a', 'b', 'c', 0)`,
      [eventId]
    ),
    /row-level security/
  );
  assert.equal((await t.anon('SELECT * FROM public.registrations')).length, 0);
});

test('quota is enforced atomically by the RPC', async () => {
  await registerAsAnon({ players: [{}] }); // second slot of quota 2
  await assert.rejects(registerAsAnon({ players: [{}] }), /Kuota pendaftaran telah penuh/);
});

test('status lookup needs the real phone number', async () => {
  const [reg] = await t.sql<{ code: string }>(
    `SELECT code FROM public.registrations WHERE event_id = $1 ORDER BY created_at LIMIT 1`,
    [eventId]
  );
  const ok = await t.anon(`SELECT * FROM public.check_registration_status($1, '0812-3456-7890')`, [reg.code]);
  assert.equal(ok.length, 1);

  const wrong = await t.anon(`SELECT * FROM public.check_registration_status($1, '0899999999')`, [reg.code]);
  assert.equal(wrong.length, 0);
});

test('a registration stored with phone "-" cannot be looked up with "-"', async () => {
  await t.sql(`UPDATE public.events SET quota = 0 WHERE id = $1`, [eventId]);
  const reg = await registerAsAnon({ players: [{}] }, '-');
  const leaked = await t.anon(`SELECT * FROM public.check_registration_status($1, '-')`, [reg.code]);
  assert.equal(leaked.length, 0);
});

test('public stats expose only counts for open events', async () => {
  const rows = await t.anon<{ event_id: string; active_registrations: number }>(
    `SELECT * FROM public.get_event_public_stats(ARRAY[$1]::uuid[])`,
    [eventId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active_registrations, 3);
});

test('security definer functions pin search_path', async () => {
  const rows = await t.sql<{ proname: string }>(
    `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%')`
  );
  assert.deepEqual(rows.map((r) => r.proname), []);
});
