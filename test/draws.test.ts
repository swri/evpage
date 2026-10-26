import test from 'node:test';
import assert from 'node:assert/strict';
import type { AdminSession } from '../src/lib/auth.ts';
import {
  getDrawChangeRequests,
  getEventDraw,
  getPublicDraw,
  participantsHash,
  publishDraw,
  requestDrawChange,
  resolveOutcome,
  toPublishedTeams,
  voteDrawChange,
} from '../src/lib/draws.ts';
import { acceptInvitation, createOrganization, inviteMember } from '../src/lib/orgs.ts';
import type { GeneratedTeam } from '../src/lib/team-generator.ts';
import type { EventItem } from '../src/types/index.ts';

const session = (id: string): AdminSession => ({ user: { id, email: `${id}@test.com`, full_name: id }, token: 't' });

const teams = (label: string): GeneratedTeam[] => [
  {
    id: 'team-1',
    name: label,
    color: '#000',
    textColor: '#fff',
    badgeBg: '',
    players: [{ id: 'p1', name: 'Andi', contactPhone: '0812', registrationCode: 'MSC-1', position: 'GK' }],
  },
];

/** Organization with n members (first one owner) and an event owned by it */
async function orgWith(n: number) {
  const members = Array.from({ length: n }, (_, i) => session(`m${i}-${Math.random().toString(36).slice(2, 6)}`));
  const org = await createOrganization('Org Undian', members[0]);
  for (const m of members.slice(1)) {
    const inv = await inviteMember(org.id, m.user.email, 'member', members[0]);
    await acceptInvitation(inv.id, m);
  }
  const event = { id: `evt-${Math.random().toString(36).slice(2)}`, organization_id: org.id, title: 'Cup', status: 'open' } as EventItem;
  return { members, event };
}

test('resolveOutcome matches the SQL rule', () => {
  assert.equal(resolveOutcome({ yes: 1, no: 0, required: 1, members: 1 }), 'applied');
  assert.equal(resolveOutcome({ yes: 1, no: 0, required: 2, members: 2 }), 'pending');
  assert.equal(resolveOutcome({ yes: 1, no: 1, required: 2, members: 2 }), 'rejected');
  assert.equal(resolveOutcome({ yes: 1, no: 1, required: 3, members: 4 }), 'pending');
  assert.equal(resolveOutcome({ yes: 1, no: 2, required: 3, members: 4 }), 'rejected');
});

test('published results never contain phone numbers or registration codes', () => {
  const [team] = toPublishedTeams(teams('A'));
  assert.deepEqual(Object.keys(team.players[0]).sort(), ['backNumber', 'id', 'level', 'name', 'position', 'teamOrigin']);
});

test('participantsHash ignores order', async () => {
  assert.equal(await participantsHash([{ id: 'b' }, { id: 'a' }]), await participantsHash([{ id: 'a' }, { id: 'b' }]));
});

test('solo organizer: publish, then changes apply immediately', async () => {
  const { members, event } = await orgWith(1);
  const draw = await publishDraw(event, teams('Awal'), { algorithm: 'balanced-v2', seed: 'S1' }, members[0]);
  await assert.rejects(publishDraw(event, teams('Lagi'), { algorithm: 'x' }, members[0]), /sudah dipublikasikan/);

  const { outcome, request } = await requestDrawChange(draw, teams('Baru'), { reason: 'cedera' }, members[0]);
  assert.equal(outcome, 'applied');
  assert.equal(request.required_approvals, 1);
  const current = await getEventDraw(event.id);
  assert.equal(current?.result[0].name, 'Baru');
  assert.equal(current?.version, 2);
});

test('two organizers: second approval applies, outsiders cannot vote', async () => {
  const { members, event } = await orgWith(2);
  const outsider = session('outsider');
  const draw = await publishDraw(event, teams('Awal'), { algorithm: 'balanced-v2' }, members[0]);

  const { outcome, request } = await requestDrawChange(draw, teams('Usul'), {}, members[0]);
  assert.equal(outcome, 'pending');
  assert.equal(request.required_approvals, 2);
  assert.equal((await getEventDraw(event.id))?.result[0].name, 'Awal');

  await assert.rejects(voteDrawChange(request.id, true, outsider), /tidak ditemukan/);
  await assert.rejects(voteDrawChange(request.id, true, members[0]), /sudah memberikan suara/);
  assert.equal(await voteDrawChange(request.id, true, members[1]), 'applied');
  assert.equal((await getEventDraw(event.id))?.result[0].name, 'Usul');
});

test('four organizers need three approvals; competing requests go stale', async () => {
  const { members, event } = await orgWith(4);
  const draw = await publishDraw(event, teams('Awal'), { algorithm: 'balanced-v2' }, members[0]);

  const a = await requestDrawChange(draw, teams('A'), {}, members[0]);
  const b = await requestDrawChange(draw, teams('B'), {}, members[1]);
  assert.equal(a.request.required_approvals, 3);

  assert.equal(await voteDrawChange(a.request.id, true, members[2]), 'pending');
  assert.equal(await voteDrawChange(a.request.id, true, members[3]), 'applied');

  const requests = await getDrawChangeRequests(draw.id);
  assert.equal(requests.find((r) => r.id === b.request.id)?.status, 'stale');
  await assert.rejects(requestDrawChange(draw, teams('dari versi lama'), {}, members[0]), /sudah berubah/);
});

test('cashier/check-in members neither vote nor count toward the quorum', async () => {
  const { members, event } = await orgWith(2);
  const kasir = session(`kasir-${Math.random().toString(36).slice(2, 6)}`);
  const inv = await inviteMember(event.organization_id!, kasir.user.email, 'cashier', members[0]);
  await acceptInvitation(inv.id, kasir);

  const draw = await publishDraw(event, teams('Awal'), { algorithm: 'balanced-v2' }, members[0]);
  const { request } = await requestDrawChange(draw, teams('Usul'), {}, members[0]);
  assert.equal(request.required_approvals, 2, '3 members, but only 2 manage draws');
  await assert.rejects(voteDrawChange(request.id, true, kasir), /tidak boleh mengelola hasil undian/);
});

test('public draw hides drafts and exposes published teams', async () => {
  const { members, event } = await orgWith(1);
  await publishDraw(event, teams('Publik'), { algorithm: 'balanced-v2', seed: 'PUB' }, members[0]);
  const pub = await getPublicDraw('cup', event);
  assert.equal(pub?.teams[0].name, 'Publik');
  assert.equal(await getPublicDraw('cup', { ...event, status: 'draft' }), null);
});
