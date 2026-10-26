import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countParticipants,
  createRegistration,
  getEventById,
  promoteFromWaitlist,
  remainingSlots,
  saveEvent,
  setCheckIn,
  updateRegistrationStatus,
} from '../src/lib/store.ts';
import type { QuotaMode } from '../src/types/index.ts';

const schema = [{ id: 'players', type: 'repeater' as const, label: 'Pemain' }];
const team = (n: number) => ({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })) });

async function makeEvent(quota: number, quota_mode: QuotaMode, waitlist_enabled: boolean) {
  return saveEvent({
    title: 'Kuota ' + Math.random().toString(36).slice(2, 7),
    status: 'open',
    price_type: 'free',
    quota,
    quota_mode,
    waitlist_enabled,
    registration_deadline: new Date(Date.now() + 86400000).toISOString(),
    form_schema: schema,
  });
}

const register = (event_id: string, players: number) =>
  createRegistration({ event_id, answers: team(players), contact_name: 'X', contact_phone: '081234567890', contact_email: '-' });

test('countParticipants uses the first repeater, minimum 1', () => {
  assert.equal(countParticipants({ form_schema: schema }, team(7)), 7);
  assert.equal(countParticipants({ form_schema: schema }, { players: [] }), 1);
  assert.equal(countParticipants({ form_schema: [] }, {}), 1);
});

test('participant quota counts people and explains partial fits', async () => {
  const evt = await makeEvent(10, 'participant', false);
  const first = await register(evt.id, 6);
  assert.equal(first.participant_count, 6);
  await assert.rejects(register(evt.id, 5), /Sisa kuota 4 peserta, pendaftaran ini berisi 5 peserta/);
  await register(evt.id, 4);
  await assert.rejects(register(evt.id, 1), /Kuota pendaftaran telah penuh/);
  assert.equal(remainingSlots((await getEventById(evt.id))!), 0);
});

test('registration quota counts one slot per form (per team)', async () => {
  const evt = await makeEvent(2, 'registration', false);
  await register(evt.id, 12);
  await register(evt.id, 12);
  await assert.rejects(register(evt.id, 1), /penuh/);
});

test('waitlist: overflow is queued, promotion and re-activation respect the quota', async () => {
  const evt = await makeEvent(1, 'registration', true);
  const first = await register(evt.id, 1);
  const queued = await register(evt.id, 1);
  assert.equal(queued.status, 'waitlisted');
  assert.notEqual(first.code, queued.code);

  await assert.rejects(promoteFromWaitlist(queued.id), /Kuota belum tersedia/);
  await assert.rejects(updateRegistrationStatus(queued.id, 'verified'), /Kuota belum tersedia/);

  await updateRegistrationStatus(first.id, 'rejected');
  const promoted = await promoteFromWaitlist(queued.id);
  assert.equal(promoted.status, 'pending');
});

test('check-in only for verified participants and can be undone', async () => {
  const evt = await makeEvent(0, 'registration', false);
  const reg = await register(evt.id, 1);
  await assert.rejects(setCheckIn(reg.id, true, 'u-1'), /terverifikasi/);

  await updateRegistrationStatus(reg.id, 'verified');
  const checked = await setCheckIn(reg.id, true, 'u-1');
  assert.ok(checked.checked_in_at);
  assert.equal(checked.checked_in_by, 'u-1');

  const undone = await setCheckIn(reg.id, false);
  assert.equal(undone.checked_in_at, null);
});

test('unlimited quota (0) reports no remaining-slot limit', async () => {
  const evt = await makeEvent(0, 'participant', false);
  assert.equal(remainingSlots(evt), null);
});
