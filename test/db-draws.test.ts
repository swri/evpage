import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './db/harness.ts';

let t: TestDb;
const users: Record<string, string> = {};
let outsider: string;

before(async () => {
  t = await createTestDb();
  for (const name of ['u1', 'u2', 'u3', 'u4']) users[name] = await t.createUser(`${name}@test.com`);
  outsider = await t.createUser('out@test.com');
});

after(async () => t?.close());

const result = (label: string) => JSON.stringify([{ id: 'team-1', name: label, players: [{ id: 'p1', name: 'Andi' }] }]);

/** Organization with the first n users as members (u1 owner), plus an open event */
async function setup(memberCount: number) {
  const owner = users.u1;
  const [{ r }] = await t.user<{ r: { id: string } }>(owner, `SELECT public.create_organization('Org') AS r`);
  for (const name of ['u2', 'u3', 'u4'].slice(0, memberCount - 1)) {
    await t.sql(`INSERT INTO public.organization_members (organization_id, user_id) VALUES ($1, $2)`, [r.id, users[name]]);
  }
  const [evt] = await t.sql<{ id: string; slug: string }>(
    `INSERT INTO public.events (slug, title, organization_id, status) VALUES ($1, 'Cup', $2, 'open') RETURNING id, slug`,
    [`cup-${Math.random().toString(36).slice(2)}`, r.id]
  );
  const [{ d }] = await t.user<{ d: { id: string; version: number } }>(
    owner,
    `SELECT public.publish_group_draw($1, 'balanced-v2', 'SEED1', '{}'::jsonb, 'hash', $2::jsonb) AS d`,
    [evt.id, result('Awal')]
  );
  return { orgId: r.id, eventId: evt.id, slug: evt.slug, drawId: d.id };
}

const request = async (userId: string, drawId: string, version: number, label: string) =>
  (
    await t.user<{ r: { id: string; status: string; required_approvals: number; outcome: string } }>(
      userId,
      `SELECT public.request_draw_change($1, $2, $3::jsonb, 'pindah pemain', NULL, NULL) AS r`,
      [drawId, version, result(label)]
    )
  )[0].r;

const vote = async (userId: string, requestId: string, approve: boolean) =>
  (await t.user<{ v: string }>(userId, 'SELECT public.vote_draw_change($1, $2) AS v', [requestId, approve]))[0].v;

const currentResult = async (drawId: string) =>
  (await t.sql<{ result: { name: string }[]; version: number }>('SELECT result, version FROM public.group_draws WHERE id = $1', [drawId]))[0];

test('a solo organizer changes the published draw immediately', async () => {
  const { drawId } = await setup(1);
  const req = await request(users.u1, drawId, 1, 'Solo');
  assert.equal(req.required_approvals, 1);
  assert.equal(req.outcome, 'applied');
  const draw = await currentResult(drawId);
  assert.equal(draw.result[0].name, 'Solo');
  assert.equal(draw.version, 2);
});

test('two organizers: the change waits for the second approval', async () => {
  const { drawId } = await setup(2);
  const req = await request(users.u1, drawId, 1, 'Berdua');
  assert.equal(req.required_approvals, 2);
  assert.equal(req.outcome, 'pending');
  assert.equal((await currentResult(drawId)).result[0].name, 'Awal');

  await assert.rejects(vote(users.u1, req.id, true), /sudah memberikan suara/);
  assert.equal(await vote(users.u2, req.id, true), 'applied');
  assert.equal((await currentResult(drawId)).result[0].name, 'Berdua');
});

test('two organizers: one rejection kills the request', async () => {
  const { drawId } = await setup(2);
  const req = await request(users.u2, drawId, 1, 'Ditolak');
  assert.equal(await vote(users.u1, req.id, false), 'rejected');
  assert.equal((await currentResult(drawId)).result[0].name, 'Awal');
  await assert.rejects(vote(users.u1, req.id, true), /sudah selesai/);
});

test('three organizers need 2, four need 3 approvals', async () => {
  const three = await setup(3);
  const r3 = await request(users.u1, three.drawId, 1, 'Tiga');
  assert.equal(r3.required_approvals, 2);
  assert.equal(await vote(users.u3, r3.id, true), 'applied');

  const four = await setup(4);
  const r4 = await request(users.u1, four.drawId, 1, 'Empat');
  assert.equal(r4.required_approvals, 3);
  assert.equal(await vote(users.u2, r4.id, false), 'pending', 'still reachable: 3 of the remaining could approve');
  assert.equal(await vote(users.u3, r4.id, true), 'pending');
  assert.equal(await vote(users.u4, r4.id, true), 'applied');
});

test('competing requests: the second one becomes stale once the first applies', async () => {
  const { drawId } = await setup(2);
  const a = await request(users.u1, drawId, 1, 'A');
  const b = await request(users.u2, drawId, 1, 'B');
  assert.equal(await vote(users.u2, a.id, true), 'applied');
  const [{ status }] = await t.sql<{ status: string }>('SELECT status FROM public.draw_change_requests WHERE id = $1', [b.id]);
  assert.equal(status, 'stale');
  await assert.rejects(request(users.u1, drawId, 1, 'old base'), /sudah berubah/);
});

test('outsiders cannot publish, request, vote, or read', async () => {
  const { eventId, drawId } = await setup(2);
  await assert.rejects(
    t.user(outsider, `SELECT public.publish_group_draw($1, 'x', 's', '{}'::jsonb, 'h', '[]'::jsonb)`, [eventId]),
    /Event tidak ditemukan/
  );
  await assert.rejects(request(outsider, drawId, 1, 'X'), /tidak ditemukan/);
  const req = await request(users.u1, drawId, 1, 'Y');
  await assert.rejects(vote(outsider, req.id, true), /tidak ditemukan/);
  assert.equal((await t.user(outsider, 'SELECT * FROM public.group_draws')).length, 0);
});

test('draws cannot be edited directly or re-published, internal helpers are not callable', async () => {
  const { eventId, drawId } = await setup(1);
  const updated = await t.user(users.u1, `UPDATE public.group_draws SET result = '[]'::jsonb WHERE id = $1 RETURNING id`, [drawId]);
  assert.equal(updated.length, 0, 'no UPDATE policy: changes must go through approvals');
  await assert.rejects(
    t.user(users.u1, `SELECT public.publish_group_draw($1, 'x', 's', '{}'::jsonb, 'h', '[]'::jsonb)`, [eventId]),
    /sudah dipublikasikan/
  );
  await assert.rejects(t.user(users.u1, `SELECT public.apply_draw_change(gen_random_uuid())`), /permission denied/);
});

test('participants see the published teams through get_public_draw', async () => {
  const { slug } = await setup(1);
  const [{ d }] = await t.anon<{ d: { teams: { name: string }[]; seed: string } }>('SELECT public.get_public_draw($1) AS d', [slug]);
  assert.equal(d.teams[0].name, 'Awal');
  assert.equal(d.seed, 'SEED1');
  assert.equal((await t.anon('SELECT * FROM public.group_draws')).length, 0, 'raw table stays private');
});
