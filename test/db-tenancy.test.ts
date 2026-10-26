import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './db/harness.ts';

let t: TestDb;
let alice: string; // owner of org A
let bob: string; // invited into org A
let carol: string; // owner of org B (outsider for A)
let root: string; // platform admin
let orgA: string;
let orgB: string;
let eventA: string;

before(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice@test.com');
  bob = await t.createUser('bob@test.com');
  carol = await t.createUser('carol@test.com');
  root = await t.createUser('owner@app.com');
  await t.sql('INSERT INTO public.platform_admins (user_id) VALUES ($1)', [root]);

  [{ id: orgA }] = (await t.user<{ r: { id: string } }>(alice, `SELECT public.create_organization('Org A') AS r`)).map((x) => x.r);
  [{ id: orgB }] = (await t.user<{ r: { id: string } }>(carol, `SELECT public.create_organization('Org B') AS r`)).map((x) => x.r);
});

after(async () => t?.close());

test('signing up creates a profile automatically', async () => {
  const rows = await t.sql<{ email: string; account_type: string }>('SELECT email, account_type FROM public.profiles WHERE id = $1', [alice]);
  assert.deepEqual(rows, [{ email: 'alice@test.com', account_type: 'organizer' }]);
});

test('creating an organization makes the creator its owner', async () => {
  const rows = await t.user<{ role: string }>(alice, 'SELECT role FROM public.organization_members WHERE organization_id = $1', [orgA]);
  assert.deepEqual(rows, [{ role: 'owner' }]);
});

test('members can create events only inside their own organization', async () => {
  const [row] = await t.user<{ id: string }>(
    alice,
    `INSERT INTO public.events (slug, title, organization_id, created_by, status)
     VALUES ('a-cup', 'A Cup', $1, $2, 'draft') RETURNING id`,
    [orgA, alice]
  );
  eventA = row.id;

  await assert.rejects(
    t.user(carol, `INSERT INTO public.events (slug, title, organization_id, created_by) VALUES ('x', 'X', $1, $2)`, [orgA, carol]),
    /row-level security/
  );
});

test('draft events are hidden from outsiders and anon, visible to members', async () => {
  assert.equal((await t.user(alice, 'SELECT id FROM public.events WHERE id = $1', [eventA])).length, 1);
  assert.equal((await t.user(carol, 'SELECT id FROM public.events WHERE id = $1', [eventA])).length, 0);
  assert.equal((await t.anon('SELECT id FROM public.events WHERE id = $1', [eventA])).length, 0);
  assert.equal((await t.user(root, 'SELECT id FROM public.events WHERE id = $1', [eventA])).length, 1);
});

test('outsiders cannot update another organization event', async () => {
  const updated = await t.user(carol, `UPDATE public.events SET title = 'pwned' WHERE id = $1 RETURNING id`, [eventA]);
  assert.equal(updated.length, 0);
});

test('invitation flow: only org admins invite, only the invitee accepts', async () => {
  await assert.rejects(
    t.user(carol, `INSERT INTO public.organization_invitations (organization_id, email, invited_by) VALUES ($1, 'x@test.com', $2)`, [orgA, carol]),
    /row-level security/
  );

  const [inv] = await t.user<{ id: string }>(
    alice,
    `INSERT INTO public.organization_invitations (organization_id, email, invited_by) VALUES ($1, 'BOB@test.com', $2) RETURNING id`,
    [orgA, alice]
  );

  // Bob sees his invitation; Carol does not
  assert.equal((await t.user(bob, 'SELECT id FROM public.organization_invitations')).length, 1);
  assert.equal((await t.user(carol, 'SELECT id FROM public.organization_invitations')).length, 0);

  await assert.rejects(t.user(carol, 'SELECT public.accept_invitation($1)', [inv.id]), /Undangan tidak ditemukan/);
  await t.user(bob, 'SELECT public.accept_invitation($1)', [inv.id]);
  await assert.rejects(t.user(bob, 'SELECT public.accept_invitation($1)', [inv.id]), /sudah digunakan/);

  const members = await t.user<{ user_id: string; role: string }>(bob, 'SELECT user_id, role FROM public.organization_members WHERE organization_id = $1 ORDER BY role', [orgA]);
  assert.equal(members.length, 2);
  assert.equal((await t.user(bob, 'SELECT id FROM public.events WHERE id = $1', [eventA])).length, 1, 'new member sees org events');
});

test('an org admin cannot promote anyone to owner', async () => {
  const setRole = `UPDATE public.organization_members SET role = $3 WHERE organization_id = $1 AND user_id = $2`;
  await t.sql(setRole, [orgA, bob, 'admin']);
  await assert.rejects(t.user(bob, setRole, [orgA, bob, 'owner']), /row-level security/);
  await t.sql(setRole, [orgA, bob, 'member']);
});

test('co-members can see each other profiles, outsiders cannot', async () => {
  assert.equal((await t.user(alice, 'SELECT id FROM public.profiles WHERE id = $1', [bob])).length, 1);
  assert.equal((await t.user(carol, 'SELECT id FROM public.profiles WHERE id = $1', [bob])).length, 0);
});

test('registrations and proofs are scoped to the event organization', async () => {
  await t.sql(`UPDATE public.events SET status = 'open' WHERE id = $1`, [eventA]);
  await t.anon(`SELECT public.create_registration_atomic($1, '{}'::jsonb, '', 'Peserta', '081234567890', '-')`, [eventA]);

  assert.equal((await t.user(bob, 'SELECT id FROM public.registrations')).length, 1);
  assert.equal((await t.user(carol, 'SELECT id FROM public.registrations')).length, 0);
  assert.equal((await t.user(root, 'SELECT id FROM public.registrations')).length, 1);

  await t.sql(`INSERT INTO storage.buckets (id, name) VALUES ('payment-proofs', 'payment-proofs') ON CONFLICT DO NOTHING`);
  await t.anon(`INSERT INTO storage.objects (bucket_id, name) VALUES ('payment-proofs', $1)`, [`${eventA}/bukti.jpg`]);
  await assert.rejects(
    t.anon(`INSERT INTO storage.objects (bucket_id, name) VALUES ('payment-proofs', 'random/bukti.jpg')`),
    /row-level security/
  );
  assert.equal((await t.user(alice, `SELECT name FROM storage.objects`)).length, 1);
  assert.equal((await t.user(carol, `SELECT name FROM storage.objects`)).length, 0);
  assert.equal((await t.anon(`SELECT name FROM storage.objects`)).length, 0);
});

test('only org admins remove members, and the last owner cannot leave', async () => {
  const removedByBob = await t.user(bob, 'DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2 RETURNING user_id', [orgA, alice]);
  assert.equal(removedByBob.length, 0, 'a plain member cannot remove the owner');

  await assert.rejects(
    t.user(alice, 'DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2', [orgA, alice]),
    /minimal satu owner/
  );
});

test('platform admin rows cannot be self-granted through the API', async () => {
  await assert.rejects(t.user(carol, 'INSERT INTO public.platform_admins (user_id) VALUES ($1)', [carol]), /row-level security/);
});

test('deleting an organization cascades past the last-owner guard', async () => {
  await t.user(carol, 'DELETE FROM public.organizations WHERE id = $1', [orgB]);
  assert.equal((await t.sql('SELECT 1 FROM public.organization_members WHERE organization_id = $1', [orgB])).length, 0);
});
