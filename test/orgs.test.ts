import test from 'node:test';
import assert from 'node:assert/strict';
import type { AdminSession } from '../src/lib/auth.ts';
import {
  acceptInvitation,
  canManageEventIn,
  changeMemberRole,
  createOrganization,
  getAccessContext,
  getMyInvitations,
  getMyOrganizations,
  getOrganizationMembers,
  inviteMember,
  removeMember,
  requiredApprovals,
  updateOrganization,
} from '../src/lib/orgs.ts';

const session = (id: string, email: string, is_platform_admin = false): AdminSession => ({
  user: { id, email, full_name: email.split('@')[0], is_platform_admin },
  token: 't',
});

const ani = session('u-ani', 'ani@test.com');
const budi = session('u-budi', 'budi@test.com');
const cici = session('u-cici', 'cici@test.com');
const owner = session('u-root', 'root@app.com', true);

test('requiredApprovals: 1 -> 1, 2-3 -> 2, 4+ -> 3', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 10].map(requiredApprovals), [1, 1, 2, 2, 3, 3, 3]);
});

test('creating an organization makes the creator owner', async () => {
  const org = await createOrganization('Komunitas Futsal Ani', ani);
  const mine = await getMyOrganizations(ani);
  assert.equal(mine.find((o) => o.id === org.id)?.role, 'owner');
  await assert.rejects(createOrganization('  ', ani), /wajib diisi/);
});

test('invite -> accept flow and permission checks', async () => {
  const org = await createOrganization('Org Undangan', ani);

  await assert.rejects(inviteMember(org.id, 'x@test.com', 'member', budi), /pemilik\/admin/);
  await assert.rejects(inviteMember(org.id, 'bukan-email', 'member', ani), /tidak valid/);
  await inviteMember(org.id, 'BUDI@test.com', 'member', ani);

  const invites = await getMyInvitations(budi);
  const inv = invites.find((i) => i.organization_id === org.id);
  assert.ok(inv, 'budi sees the invitation');
  assert.equal(inv.organization_name, 'Org Undangan');

  await assert.rejects(acceptInvitation(inv.id, cici), /tidak ditemukan/);
  await acceptInvitation(inv.id, budi);
  await assert.rejects(acceptInvitation(inv.id, budi), /sudah digunakan/);

  const members = await getOrganizationMembers(org.id);
  assert.deepEqual(members.map((m) => m.role).sort(), ['member', 'owner']);

  // A plain member cannot edit branding or promote themselves
  await assert.rejects(updateOrganization(org.id, { name: 'Diretas' }, budi), /izin/);
  await assert.rejects(changeMemberRole(org.id, budi.user.id, 'owner', budi), /pemilik\/admin/);
});

test('the last owner cannot leave or be demoted', async () => {
  const org = await createOrganization('Org Owner Tunggal', ani);
  await assert.rejects(removeMember(org.id, ani.user.id, ani), /minimal satu owner/);
  await assert.rejects(changeMemberRole(org.id, ani.user.id, 'member', ani), /minimal satu owner/);
});

test('canManageEventIn: members of the owning org and platform admins only', async () => {
  const org = await createOrganization('Org Akses', ani);
  const event = { organization_id: org.id };

  assert.equal(canManageEventIn(event, await getAccessContext(ani)), true);
  assert.equal(canManageEventIn(event, await getAccessContext(cici)), false);
  assert.equal(canManageEventIn(event, await getAccessContext(owner)), true);
  assert.equal(canManageEventIn(event, await getAccessContext(null)), false);
  // Legacy events without an organization fall back to the creator
  assert.equal(canManageEventIn({ created_by: cici.user.id }, await getAccessContext(cici)), true);
});
