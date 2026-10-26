import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRegistrationAmount,
  createRegistration,
  saveEvent,
} from '../src/lib/store.ts';
import type { FormField } from '../src/types/index.ts';

const DAY = 86400000;

const repeaterSchema: FormField[] = [
  { id: 'team_name', type: 'text', label: 'Nama Tim' },
  {
    id: 'players',
    type: 'repeater',
    label: 'Pemain',
    subFields: [{ id: 'player_name', type: 'text', label: 'Nama' }],
  },
];

async function createOpenEvent(overrides: Parameters<typeof saveEvent>[0] = {}) {
  return saveEvent({
    title: 'Test Event ' + Math.random().toString(36).slice(2, 7),
    status: 'open',
    quota: 10,
    price_type: 'fixed',
    price_amount: 100000,
    registration_deadline: new Date(Date.now() + 7 * DAY).toISOString(),
    form_schema: repeaterSchema,
    ...overrides,
  });
}

test('calculateRegistrationAmount handles free, fixed and per_participant', () => {
  const base = { price_amount: 50000, form_schema: repeaterSchema };
  const answers = { players: [{ player_name: 'A' }, { player_name: 'B' }, { player_name: 'C' }] };

  assert.equal(calculateRegistrationAmount({ ...base, price_type: 'free' }, answers), 0);
  assert.equal(calculateRegistrationAmount({ ...base, price_type: 'fixed' }, answers), 50000);
  assert.equal(calculateRegistrationAmount({ ...base, price_type: 'per_participant' }, answers), 150000);
  // Empty repeater still charges at least one participant
  assert.equal(calculateRegistrationAmount({ ...base, price_type: 'per_participant' }, { players: [] }), 50000);
  // Negative price from a bad config never produces a negative bill
  assert.equal(calculateRegistrationAmount({ ...base, price_amount: -10, price_type: 'fixed' }, {}), 0);
});

test('createRegistration ignores a client-supplied total_amount', async () => {
  const event = await createOpenEvent({ price_type: 'per_participant', price_amount: 25000 });
  const reg = await createRegistration({
    event_id: event.id,
    answers: { team_name: 'Garuda', players: [{ player_name: 'A' }, { player_name: 'B' }] },
    contact_name: 'Budi',
    contact_phone: '081234567890',
    contact_email: 'budi@test.com',
    // Simulates a tampered request from the browser
    ...({ total_amount: 1 } as object),
  });
  assert.equal(reg.total_amount, 50000);
});
