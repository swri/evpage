import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupiah,
  formatIndoDate,
  buildWhatsAppLink,
  isUsingDatabase,
  getAllEvents,
  getOrganizationSettings,
} from '../src/lib/store.ts';

test('formatRupiah formats number to IDR currency correctly', () => {
  const result = formatRupiah(750000);
  assert.ok(result.includes('750.000'), `Expected formatted string with 750.000, got ${result}`);
});

test('formatIndoDate formats ISO dates to Indonesian locale', () => {
  const result = formatIndoDate('2026-11-15T08:00:00Z');
  assert.ok(result.includes('2026'), `Expected year 2026, got ${result}`);
  assert.ok(result.includes('November'), `Expected month November, got ${result}`);
});

test('buildWhatsAppLink generates valid wa.me URL with encoded parameters', () => {
  const link = buildWhatsAppLink('081234567890', 'Halo {nama}, kode Anda {kode} di {event}', {
    nama: 'Budi Santoso',
    kode: 'MSC-2026-0001',
    event: 'Mandiri Mini Soccer Cup',
    total: '750.000',
  });

  assert.ok(link.startsWith('https://wa.me/6281234567890'), `Expected cleaned phone number with 62 prefix, got ${link}`);
  assert.ok(link.includes('Budi%20Santoso'), 'Expected encoded name parameter in URL');
  assert.ok(link.includes('MSC-2026-0001'), 'Expected encoded code parameter in URL');
});

test('isUsingDatabase returns boolean database status', () => {
  const usingDb = isUsingDatabase();
  assert.equal(typeof usingDb, 'boolean');
});

test('getAllEvents returns events list with calculated fields', async () => {
  const events = await getAllEvents();
  assert.ok(Array.isArray(events));
  assert.ok(events.length > 0);
  assert.equal(typeof events[0].total_registrations, 'number');
});

test('getOrganizationSettings returns organization settings object', async () => {
  const settings = await getOrganizationSettings();
  assert.ok(settings);
  assert.ok(settings.name);
  assert.equal(typeof settings.wa_number, 'string');
});
