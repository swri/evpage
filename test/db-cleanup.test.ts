import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './db/harness.ts';

let t: TestDb;
let owner: string;
let kasir: string;
let outsider: string;
let root: string;
let orgId: string;

before(async () => {
  t = await createTestDb();
  owner = await t.createUser('owner@test.com');
  kasir = await t.createUser('kasir@test.com');
  outsider = await t.createUser('out@test.com');
  root = await t.createUser('root@app.com');
  await t.sql('INSERT INTO public.platform_admins (user_id) VALUES ($1)', [root]);
  [{ id: orgId }] = (await t.user<{ r: { id: string } }>(owner, `SELECT public.create_organization('Org') AS r`)).map((x) => x.r);
  await t.sql(`INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'cashier')`, [orgId, kasir]);
  await t.sql(`INSERT INTO storage.buckets (id, name) VALUES ('payment-proofs', 'payment-proofs') ON CONFLICT DO NOTHING`);
});

after(async () => t?.close());

async function eventWithProofs(startsInDays: number) {
  const [{ id }] = await t.sql<{ id: string }>(
    `INSERT INTO public.events (slug, title, organization_id, status, starts_at)
     VALUES ($1, 'E', $2, 'open', NOW() + ($3 || ' days')::interval) RETURNING id`,
    [`e-${Math.random().toString(36).slice(2)}`, orgId, String(startsInDays)]
  );
  const used = `${id}/used.jpg`;
  const orphan = `${id}/orphan.jpg`;
  const fresh = `${id}/fresh.jpg`;
  await t.anon(`SELECT public.create_registration_atomic($1, '{}'::jsonb, $2, 'P', '081234567890', '-')`, [id, used]);
  await t.sql(
    `INSERT INTO storage.objects (bucket_id, name, created_at, metadata) VALUES
       ('payment-proofs', $1, NOW() - INTERVAL '2 days', '{"size": 1000}'),
       ('payment-proofs', $2, NOW() - INTERVAL '2 days', '{"size": 2000}'),
       ('payment-proofs', $3, NOW(), '{"size": 3000}')`,
    [used, orphan, fresh]
  );
  return { id, used, orphan, fresh };
}

test('orphans: unreferenced files older than one hour, visible to event managers only', async () => {
  const e = await eventWithProofs(7);
  const rows = await t.user<{ name: string; size_bytes: number }>(owner, 'SELECT * FROM public.list_orphan_payment_proofs($1)', [e.id]);
  assert.deepEqual(rows.map((r) => r.name), [e.orphan], 'used file and in-flight upload are kept');
  assert.equal(Number(rows[0].size_bytes), 2000);
  assert.equal((await t.user(kasir, 'SELECT * FROM public.list_orphan_payment_proofs($1)', [e.id])).length, 0);
  assert.equal((await t.user(outsider, 'SELECT * FROM public.list_orphan_payment_proofs(NULL)')).length, 0);
});

test('organizers purge proofs only after the event is finished', async () => {
  const upcoming = await eventWithProofs(7);
  await assert.rejects(t.user(owner, 'SELECT public.purge_event_payment_proofs($1)', [upcoming.id]), /setelah event selesai/);

  const past = await eventWithProofs(-1);
  const [{ paths }] = await t.user<{ paths: string[] }>(owner, 'SELECT public.purge_event_payment_proofs($1) AS paths', [past.id]);
  assert.deepEqual([...paths].sort(), [past.fresh, past.orphan, past.used].sort());
  const [reg] = await t.sql<{ payment_proof_path: string; payment_proof_purged_at: string | null }>(
    'SELECT payment_proof_path, payment_proof_purged_at FROM public.registrations WHERE event_id = $1',
    [past.id]
  );
  assert.equal(reg.payment_proof_path, '');
  assert.ok(reg.payment_proof_purged_at);
});

test('closed events count as finished; cashier and outsiders cannot purge', async () => {
  const e = await eventWithProofs(7);
  await t.sql(`UPDATE public.events SET status = 'closed' WHERE id = $1`, [e.id]);
  await assert.rejects(t.user(kasir, 'SELECT public.purge_event_payment_proofs($1)', [e.id]), /tidak ditemukan/);
  await assert.rejects(t.user(outsider, 'SELECT public.purge_event_payment_proofs($1)', [e.id]), /tidak ditemukan/);
  const [{ paths }] = await t.user<{ paths: string[] }>(owner, 'SELECT public.purge_event_payment_proofs($1) AS paths', [e.id]);
  assert.equal(paths.length, 3);
});

test('platform admin purges any time and sees orphans of deleted events', async () => {
  const e = await eventWithProofs(30);
  const [{ paths }] = await t.user<{ paths: string[] }>(root, 'SELECT public.purge_event_payment_proofs($1) AS paths', [e.id]);
  assert.equal(paths.length, 3);

  const gone = await eventWithProofs(30);
  await t.sql('DELETE FROM public.events WHERE id = $1', [gone.id]);
  const orphans = await t.user<{ name: string }>(root, 'SELECT name FROM public.list_orphan_payment_proofs(NULL)');
  assert.ok(orphans.some((o) => o.name === gone.used), 'files of a deleted event are orphans');
  assert.ok(!(await t.user<{ name: string }>(owner, 'SELECT name FROM public.list_orphan_payment_proofs(NULL)')).some((o) => o.name === gone.used));
});

test('storage delete policy: event managers and platform admin only', async () => {
  const e = await eventWithProofs(7);
  assert.equal((await t.user(kasir, 'DELETE FROM storage.objects WHERE name = $1 RETURNING name', [e.orphan])).length, 0);
  assert.equal((await t.anon('DELETE FROM storage.objects WHERE name = $1 RETURNING name', [e.orphan])).length, 0);
  assert.equal((await t.user(owner, 'DELETE FROM storage.objects WHERE name = $1 RETURNING name', [e.orphan])).length, 1);
});

test('file lists for deleting an event or organization', async () => {
  const e = await eventWithProofs(7);
  const [{ files }] = await t.user<{ files: string[] }>(owner, 'SELECT public.event_storage_files($1) AS files', [e.id]);
  assert.equal(files.length, 3);
  await assert.rejects(t.user(kasir, 'SELECT public.event_storage_files($1)', [e.id]), /tidak ditemukan/);
  const [{ org }] = await t.user<{ org: string[] }>(root, 'SELECT public.organization_storage_files($1) AS org', [orgId]);
  assert.ok(org.length >= 3);
  await assert.rejects(t.user(kasir, 'SELECT public.organization_storage_files($1)', [orgId]), /tidak ditemukan/);
});

test('platform overview and expired invitations are super-admin only', async () => {
  await t.sql(
    `INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at) VALUES ($1, 'old@test.com', $2, NOW() - INTERVAL '1 day')`,
    [orgId, owner]
  );
  await assert.rejects(t.user(owner, 'SELECT public.platform_overview()'), /Hanya super admin/);
  const [{ o }] = await t.user<{ o: { storage: { files: number; bytes: number }; events: unknown[]; expired_invitations: number } }>(
    root,
    'SELECT public.platform_overview() AS o'
  );
  assert.ok(o.storage.files > 0);
  assert.ok(o.events.length > 0);
  assert.equal(o.expired_invitations, 1);

  await assert.rejects(t.user(owner, 'SELECT public.purge_expired_invitations()'), /Hanya super admin/);
  const [{ n }] = await t.user<{ n: number }>(root, 'SELECT public.purge_expired_invitations() AS n');
  assert.equal(n, 1);
});
