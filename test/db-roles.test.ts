import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './db/harness.ts';
import { ROLE_PERMISSIONS, roleCan, type OrgRole, type Permission } from '../src/lib/orgs.ts';

let t: TestDb;
let owner: string;
let cashier: string;
let checker: string;
let panitia: string;
let orgId: string;
let eventId: string;

const regRow = async () =>
  (
    await t.anon<{ r: { id: string } }>(
      `SELECT public.create_registration_atomic($1, '{}'::jsonb, '', 'Peserta', '081234567890', '-') AS r`,
      [eventId]
    )
  )[0].r.id;

before(async () => {
  t = await createTestDb();
  owner = await t.createUser('owner@test.com');
  cashier = await t.createUser('kasir@test.com');
  checker = await t.createUser('checkin@test.com');
  panitia = await t.createUser('panitia@test.com');
  [{ id: orgId }] = (await t.user<{ r: { id: string } }>(owner, `SELECT public.create_organization('Org') AS r`)).map((x) => x.r);
  for (const [user, role] of [[cashier, 'cashier'], [checker, 'checkin'], [panitia, 'member']]) {
    await t.sql('INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)', [orgId, user, role]);
  }
  [{ id: eventId }] = await t.sql<{ id: string }>(
    `INSERT INTO public.events (slug, title, organization_id, status) VALUES ('cup', 'Cup', $1, 'open') RETURNING id`,
    [orgId]
  );
});

after(async () => t?.close());

test('TypeScript ROLE_PERMISSIONS matches the SQL permission matrix exactly', async () => {
  const roles = Object.keys(ROLE_PERMISSIONS) as OrgRole[];
  const permissions = [...new Set(Object.values(ROLE_PERMISSIONS).flat())] as Permission[];
  for (const role of roles) {
    for (const permission of permissions) {
      const [{ ok }] = await t.sql<{ ok: boolean }>('SELECT public.role_has_permission($1, $2) AS ok', [role, permission]);
      assert.equal(ok, roleCan(role, permission), `${role} / ${permission}`);
    }
  }
});

test('every role can read its registrations', async () => {
  await regRow();
  for (const user of [owner, cashier, checker, panitia]) {
    assert.ok((await t.user(user, 'SELECT id FROM public.registrations')).length >= 1);
  }
});

test('cashier verifies payments but cannot check in or edit answers', async () => {
  const id = await regRow();
  await t.user(cashier, `UPDATE public.registrations SET status = 'verified', verified_at = NOW() WHERE id = $1`, [id]);
  await assert.rejects(
    t.user(cashier, 'UPDATE public.registrations SET checked_in_at = NOW() WHERE id = $1', [id]),
    /tidak boleh mencatat kehadiran/
  );
  await assert.rejects(
    t.user(cashier, `UPDATE public.registrations SET contact_name = 'X' WHERE id = $1`, [id]),
    /tidak boleh mengubah data pendaftar/
  );
});

test('check-in officer records attendance but cannot touch payment status', async () => {
  const id = await regRow();
  await t.user(checker, 'UPDATE public.registrations SET checked_in_at = NOW() WHERE id = $1', [id]);
  await assert.rejects(
    t.user(checker, `UPDATE public.registrations SET status = 'verified' WHERE id = $1`, [id]),
    /tidak boleh mengubah status pembayaran/
  );
  const deleted = await t.user(checker, 'DELETE FROM public.registrations WHERE id = $1 RETURNING id', [id]);
  assert.equal(deleted.length, 0);
});

test('only event managers create or edit events', async () => {
  await assert.rejects(
    t.user(cashier, `INSERT INTO public.events (slug, title, organization_id, created_by) VALUES ('k', 'K', $1, $2)`, [orgId, cashier]),
    /row-level security/
  );
  const updated = await t.user(checker, `UPDATE public.events SET title = 'x' WHERE id = $1 RETURNING id`, [eventId]);
  assert.equal(updated.length, 0);
  const ok = await t.user(panitia, `UPDATE public.events SET title = 'Cup 2' WHERE id = $1 RETURNING id`, [eventId]);
  assert.equal(ok.length, 1);
});

test('approval quorum counts only roles allowed to manage draws', async () => {
  // owner + panitia can manage draws; cashier/checkin do not count -> 2 members -> 2 approvals
  const [{ d }] = await t.user<{ d: { id: string } }>(
    owner,
    `SELECT public.publish_group_draw($1, 'balanced-v2', 'S', '{}'::jsonb, 'h', '[]'::jsonb) AS d`,
    [eventId]
  );
  const [{ r }] = await t.user<{ r: { id: string; required_approvals: number } }>(
    owner,
    `SELECT public.request_draw_change($1, 1, '[]'::jsonb, '', NULL, NULL) AS r`,
    [d.id]
  );
  assert.equal(r.required_approvals, 2);
  await assert.rejects(t.user(cashier, 'SELECT public.vote_draw_change($1, true)', [r.id]), /tidak boleh mengelola hasil undian/);
  assert.equal((await t.user<{ v: string }>(panitia, 'SELECT public.vote_draw_change($1, true) AS v', [r.id]))[0].v, 'applied');
});

test('cashier and check-in roles cannot manage members or invite', async () => {
  await assert.rejects(
    t.user(cashier, `INSERT INTO public.organization_invitations (organization_id, email, invited_by) VALUES ($1, 'x@t.com', $2)`, [orgId, cashier]),
    /row-level security/
  );
  await t.user(owner, `INSERT INTO public.organization_invitations (organization_id, email, role, invited_by) VALUES ($1, 'k2@t.com', 'cashier', $2)`, [orgId, owner]);
});
