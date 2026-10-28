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

test('checkStatus normalizes codes and finds legacy dashed codes or new dashless codes', async () => {
  const event = await saveEvent({
    title: 'TI DDS Mini Soccer Part 7 - 2026',
    organizer_name: 'TI-PIHC',
    location: 'Wins 63 Soccer',
    starts_at: '2026-11-28T06:00:00+07:00',
    status: 'open',
    price_type: 'free',
    form_schema: [{ id: 'nama', type: 'text', label: 'Nama' }],
  });

  const reg = await createRegistration({
    event_id: event.id,
    answers: { nama: 'Haris' },
    contact_name: 'Haris',
    contact_phone: '0851-5619-2865',
    contact_email: '',
  });

  // Verify new code has NO hyphens
  assert.equal(reg.code.includes('-'), false, 'New registration code must not contain hyphens');
  assert.match(reg.code, /^[A-Z0-9]+$/);

  // Search with exact code
  const exact = await checkStatus(reg.code, '085156192865');
  assert.equal(exact?.code, reg.code);
  assert.equal(exact?.event_title, 'TI DDS Mini Soccer Part 7 - 2026');
  assert.equal(exact?.organizer_name, 'TI-PIHC');
  assert.equal(exact?.event_location, 'Wins 63 Soccer');
  assert.equal(exact?.event_starts_at, '2026-11-28T06:00:00+07:00');

  // Search with lowercase and spaces
  const lowerWithSpaces = await checkStatus('  ' + reg.code.toLowerCase() + '  ', '0851-5619-2865');
  assert.equal(lowerWithSpaces?.code, reg.code);

  // Search with hyphens inserted
  const withHyphens = reg.code.slice(0, 5) + '-' + reg.code.slice(5, 9) + '-' + reg.code.slice(9);
  const dashedSearch = await checkStatus(withHyphens, '085156192865');
  assert.equal(dashedSearch?.code, reg.code);
});
