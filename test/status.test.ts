import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStatus, createRegistration, saveEvent } from '../src/lib/store.ts';

async function registerWithPhone(phone: string) {
  const event = await saveEvent({
    title: 'Status Test ' + Math.random().toString(36).slice(2, 7),
    status: 'open',
    price_type: 'free',
    registration_deadline: new Date(Date.now() + 86400000).toISOString(),
    form_schema: [{ id: 'nama', type: 'text', label: 'Nama' }],
  });
  return createRegistration({
    event_id: event.id,
    answers: { nama: 'Sari' },
    contact_name: 'Sari',
    contact_phone: phone,
    contact_email: '-',
  });
}

test('checkStatus finds a registration with matching code and phone', async () => {
  const reg = await registerWithPhone('0812-3456-7890');
  const result = await checkStatus(reg.code.toLowerCase(), '081234567890');
  assert.equal(result?.code, reg.code);
});

test('checkStatus rejects a wrong or empty phone', async () => {
  const reg = await registerWithPhone('081234567890');
  assert.equal(await checkStatus(reg.code, '089999999999'), null);
  assert.equal(await checkStatus(reg.code, ''), null);
});

test('checkStatus does not leak registrations stored without a phone', async () => {
  const reg = await registerWithPhone('-');
  assert.equal(await checkStatus(reg.code, '081234567890'), null);
});
