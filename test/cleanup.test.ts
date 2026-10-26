import test from 'node:test';
import assert from 'node:assert/strict';
import type { AdminSession } from '../src/lib/auth.ts';
import {
  deleteEventWithFiles,
  deleteOrganizationWithFiles,
  formatBytes,
  getPlatformOverview,
  isEventFinished,
  purgeEventPaymentProofs,
} from '../src/lib/cleanup.ts';
import { createRegistration, getAllRegistrations, getEventById, saveEvent } from '../src/lib/store.ts';
import { createOrganization, getMyOrganizations } from '../src/lib/orgs.ts';

const DAY = 86400000;
const organizer: AdminSession = { user: { id: 'u-clean', email: 'clean@test.com', full_name: 'C' }, token: 't' };
const root: AdminSession = { user: { id: 'u-root', email: 'root@test.com', full_name: 'R', is_platform_admin: true }, token: 't' };
const png = 'data:image/png;base64,' + 'A'.repeat(4000);

async function eventWithProof(startOffsetDays: number, organization_id?: string) {
  const evt = await saveEvent({
    title: 'Bersih ' + Math.random().toString(36).slice(2, 6),
    status: 'open',
    price_type: 'fixed',
    price_amount: 1000,
    organization_id,
    starts_at: new Date(Date.now() + 10 * DAY).toISOString(),
    registration_deadline: new Date(Date.now() + 5 * DAY).toISOString(),
    form_schema: [],
  });
  // Register while it is open, then move the event to the requested date
  await createRegistration({ event_id: evt.id, answers: {}, contact_name: 'P', contact_phone: '081234567890', contact_email: '-', payment_proof_path: png });
  return saveEvent({
    id: evt.id,
    starts_at: new Date(Date.now() + startOffsetDays * DAY).toISOString(),
    registration_deadline: new Date(Date.now() + (startOffsetDays - 1) * DAY).toISOString(),
  });
}

test('isEventFinished: closed or start date passed', () => {
  assert.equal(isEventFinished({ status: 'open', starts_at: new Date(Date.now() - DAY).toISOString() }), true);
  assert.equal(isEventFinished({ status: 'closed', starts_at: new Date(Date.now() + DAY).toISOString() }), true);
  assert.equal(isEventFinished({ status: 'open', starts_at: new Date(Date.now() + DAY).toISOString() }), false);
  assert.equal(isEventFinished({ status: 'open' }), false);
});

test('organizers purge proofs only after the event; super admin any time', async () => {
  const upcoming = await eventWithProof(5);
  await assert.rejects(purgeEventPaymentProofs(upcoming, organizer), /setelah event selesai/);

  const byRoot = await purgeEventPaymentProofs(upcoming, root);
  assert.equal(byRoot.removed, 1);

  const past = await eventWithProof(-1);
  const res = await purgeEventPaymentProofs(past, organizer);
  assert.equal(res.removed, 1);
  const reg = (await getAllRegistrations()).find((r) => r.event_id === past.id)!;
  assert.equal(reg.payment_proof_path, '');
  assert.ok(reg.payment_proof_purged_at);
});

test('platform overview counts files and bytes per event', async () => {
  const evt = await eventWithProof(5);
  const overview = await getPlatformOverview();
  const row = overview.events.find((e) => e.id === evt.id)!;
  assert.equal(row.files, 1);
  assert.equal(row.bytes, 3000);
  assert.equal(row.finished, false);
  assert.ok(overview.storage.bytes >= 3000);
});

test('deleting an event also deletes its registrations (demo cascade)', async () => {
  const evt = await eventWithProof(5);
  await deleteEventWithFiles(evt.id);
  assert.equal(await getEventById(evt.id), null);
  assert.equal((await getAllRegistrations()).filter((r) => r.event_id === evt.id).length, 0);
});

test('deleting an organization removes its events; only owner or super admin', async () => {
  const org = await createOrganization('Org Hapus', organizer);
  const evt = await eventWithProof(5, org.id);
  const stranger: AdminSession = { user: { id: 'u-x', email: 'x@test.com', full_name: 'X' }, token: 't' };
  await assert.rejects(deleteOrganizationWithFiles(org.id, stranger), /izin/);

  await deleteOrganizationWithFiles(org.id, root);
  assert.equal(await getEventById(evt.id), null);
  assert.ok(!(await getMyOrganizations(organizer)).some((o) => o.id === org.id));
});

test('formatBytes', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});
