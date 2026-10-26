import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './db/harness.ts';

let t: TestDb;
let owner: string;
let outsider: string;
let orgId: string;

const schema = JSON.stringify([{ id: 'players', type: 'repeater', label: 'Pemain' }]);
const team = (n: number) => JSON.stringify({ players: Array.from({ length: n }, () => ({})) });

before(async () => {
  t = await createTestDb();
  owner = await t.createUser('owner@test.com');
  outsider = await t.createUser('out@test.com');
  [{ id: orgId }] = (await t.user<{ r: { id: string } }>(owner, `SELECT public.create_organization('Org') AS r`)).map((x) => x.r);
});

after(async () => t?.close());

async function createEvent(opts: { quota: number; mode: string; waitlist: boolean }) {
  const [row] = await t.sql<{ id: string }>(
    `INSERT INTO public.events (slug, title, quota, quota_mode, waitlist_enabled, form_schema, status, organization_id, price_type)
     VALUES ($1, 'E', $2, $3, $4, $5::jsonb, 'open', $6, 'free') RETURNING id`,
    [`e-${Math.random().toString(36).slice(2)}`, opts.quota, opts.mode, opts.waitlist, schema, orgId]
  );
  return row.id;
}

const register = async (eventId: string, players: number) =>
  (
    await t.anon<{ r: Record<string, unknown> }>(
      `SELECT public.create_registration_atomic($1, $2::jsonb, '', 'X', '081234567890', '-') AS r`,
      [eventId, team(players)]
    )
  )[0].r;

test('participant mode counts people, not forms', async () => {
  const eventId = await createEvent({ quota: 10, mode: 'participant', waitlist: false });
  const a = await register(eventId, 6);
  assert.equal(a.participant_count, 6);
  await assert.rejects(register(eventId, 5), /Sisa kuota 4 peserta, pendaftaran ini berisi 5 peserta/);
  await register(eventId, 4);
  await assert.rejects(register(eventId, 1), /Kuota pendaftaran telah penuh/);
});

test('registration mode counts one slot per form regardless of team size', async () => {
  const eventId = await createEvent({ quota: 2, mode: 'registration', waitlist: false });
  await register(eventId, 12);
  await register(eventId, 12);
  await assert.rejects(register(eventId, 1), /penuh/);
});

test('waitlist accepts overflow and promotion respects capacity', async () => {
  const eventId = await createEvent({ quota: 1, mode: 'registration', waitlist: true });
  const first = await register(eventId, 1);
  const second = await register(eventId, 1);
  assert.equal(first.status, 'pending');
  assert.equal(second.status, 'waitlisted');
  assert.notEqual(first.code, second.code, 'codes stay unique across statuses');

  await assert.rejects(t.user(owner, 'SELECT public.promote_from_waitlist($1)', [second.id]), /Kuota belum tersedia/);
  await assert.rejects(t.user(outsider, 'SELECT public.promote_from_waitlist($1)', [second.id]), /tidak ditemukan/);

  await t.user(owner, `UPDATE public.registrations SET status = 'rejected' WHERE id = $1`, [first.id]);
  const [{ r }] = await t.user<{ r: { status: string } }>(owner, 'SELECT public.promote_from_waitlist($1) AS r', [second.id]);
  assert.equal(r.status, 'pending');
});

test('a plain status UPDATE cannot push a waitlisted entry past the quota', async () => {
  const eventId = await createEvent({ quota: 1, mode: 'registration', waitlist: true });
  await register(eventId, 1);
  const queued = await register(eventId, 1);
  await assert.rejects(
    t.user(owner, `UPDATE public.registrations SET status = 'verified' WHERE id = $1`, [queued.id]),
    /Kuota belum tersedia/
  );
});

test('public stats report slots used per quota mode', async () => {
  const eventId = await createEvent({ quota: 20, mode: 'participant', waitlist: false });
  await register(eventId, 3);
  await register(eventId, 2);
  const [row] = await t.anon<{ slots_used: number; active_registrations: number }>(
    'SELECT * FROM public.get_event_public_stats(ARRAY[$1]::uuid[])',
    [eventId]
  );
  assert.equal(row.slots_used, 5);
  assert.equal(row.active_registrations, 2);
});

test('members record check-in; outsiders cannot', async () => {
  const eventId = await createEvent({ quota: 0, mode: 'registration', waitlist: false });
  const reg = await register(eventId, 1);
  const done = await t.user(owner, `UPDATE public.registrations SET checked_in_at = NOW(), checked_in_by = $2 WHERE id = $1 RETURNING id`, [reg.id, owner]);
  assert.equal(done.length, 1);
  const denied = await t.user(outsider, `UPDATE public.registrations SET checked_in_at = NOW() WHERE id = $1 RETURNING id`, [reg.id]);
  assert.equal(denied.length, 0);
});
