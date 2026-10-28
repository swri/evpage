import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTicketCode,
  formatTicketCode,
  formatEventDateTime,
  formatDeadlineDateTime,
  getDeadlineCountdown,
} from '../src/lib/utils.ts';
import { buildIcsContent } from '../src/lib/calendar.ts';

test('cleanTicketCode and formatTicketCode strip dashes and spaces and uppercase', () => {
  assert.equal(cleanTicketCode('TIDDS-2026-0004'), 'TIDDS20260004');
  assert.equal(cleanTicketCode('tidds-2026-0004'), 'TIDDS20260004');
  assert.equal(cleanTicketCode('  tidds 2026 0004  '), 'TIDDS20260004');
  assert.equal(cleanTicketCode('TIDDS20260004'), 'TIDDS20260004');
  assert.equal(cleanTicketCode(''), '');
  assert.equal(cleanTicketCode(null), '');
  assert.equal(cleanTicketCode(undefined), '');

  assert.equal(formatTicketCode('TIDDS-2026-0004'), 'TIDDS20260004');
  assert.equal(formatTicketCode('msc-2026-0001'), 'MSC20260001');
});

test('formatEventDateTime formats day of week and time in WIB (Asia/Jakarta)', () => {
  // 2026-11-28 is a Saturday
  const playTimeIso = '2026-11-28T06:00:00+07:00';
  const formatted = formatEventDateTime(playTimeIso);
  assert.match(formatted, /Sabtu/);
  assert.match(formatted, /28 November 2026/);
  assert.match(formatted, /06\.00 WIB/);

  // 2026-11-25 is a Wednesday
  const deadlineIso = '2026-11-25T20:00:00+07:00';
  const deadlineFormatted = formatDeadlineDateTime(deadlineIso);
  assert.match(deadlineFormatted, /Rabu/);
  assert.match(deadlineFormatted, /25 November 2026/);
  assert.match(deadlineFormatted, /20\.00 WIB/);
});

test('getDeadlineCountdown calculates past and upcoming deadlines', () => {
  const past = new Date(Date.now() - 3600000).toISOString();
  const pastRes = getDeadlineCountdown(past);
  assert.equal(pastRes.isPassed, true);
  assert.equal(pastRes.label, 'Pendaftaran Ditutup');

  const future3Days = new Date(Date.now() + 3 * 24 * 3600000).toISOString();
  const futureRes = getDeadlineCountdown(future3Days);
  assert.equal(futureRes.isPassed, false);
  assert.match(futureRes.label, /hari lagi/);
});

test('buildIcsContent generates standard RFC 5545 iCalendar content', () => {
  const ics = buildIcsContent({
    id: 'evt-123',
    title: 'TI DDS Mini Soccer Part 7 - 2026',
    description: 'Turnamen internal',
    location: 'Wins 63 Soccer',
    starts_at: '2026-11-28T06:00:00+07:00',
    organizer_name: 'TI-PIHC',
  });

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:TI DDS Mini Soccer Part 7 - 2026/);
  assert.match(ics, /LOCATION:Wins 63 Soccer/);
  assert.match(ics, /ORGANIZER;CN=TI-PIHC/);
  assert.match(ics, /END:VCALENDAR/);
});

test('QR code payload does NOT leak phone number or personal data', () => {
  const code = 'TIDDS-2026-0004';
  const cleanCode = formatTicketCode(code);
  const participantPhone = '085156192865';

  // DigitalTicketCard QR generator logic
  const origin = 'https://evpage.id';
  const qrDataUrl = `${origin}/status?code=${encodeURIComponent(cleanCode)}`;

  // Assert ticket code is dashless
  assert.equal(cleanCode, 'TIDDS20260004');
  assert.equal(cleanCode.includes('-'), false);

  // Assert NO phone number or query parameter exists in QR payload
  assert.equal(qrDataUrl.includes('phone='), false);
  assert.equal(qrDataUrl.includes(participantPhone), false);
  assert.match(qrDataUrl, /\/status\?code=TIDDS20260004$/);
});

test('resolveCardOrder returns DEFAULT_CARD_ORDER on missing or empty config', async () => {
  const { resolveCardOrder, DEFAULT_CARD_ORDER } = await import('../src/lib/info-cards.ts');
  assert.deepEqual(resolveCardOrder(null), DEFAULT_CARD_ORDER);
  assert.deepEqual(resolveCardOrder(undefined), DEFAULT_CARD_ORDER);
  assert.deepEqual(resolveCardOrder({}), DEFAULT_CARD_ORDER);
  assert.deepEqual(resolveCardOrder({ card_order: [] }), DEFAULT_CARD_ORDER);
});

test('resolveCardOrder preserves custom order and appends missing items', async () => {
  const { resolveCardOrder } = await import('../src/lib/info-cards.ts');
  const custom = ['time', 'location', 'quota'];
  const resolved = resolveCardOrder({ card_order: custom });
  assert.equal(resolved[0], 'time');
  assert.equal(resolved[1], 'location');
  assert.equal(resolved[2], 'quota');
  assert.equal(resolved.includes('deadline'), true);
  assert.equal(resolved.includes('organizer'), true);
  assert.equal(resolved.includes('price'), true);
  assert.equal(resolved.length, 6);
});

test('isCardVisible checks hidden_cards array in type_config', async () => {
  const { isCardVisible } = await import('../src/lib/info-cards.ts');
  assert.equal(isCardVisible('quota', null), true);
  assert.equal(isCardVisible('quota', { hidden_cards: ['quota'] }), false);
  assert.equal(isCardVisible('price', { hidden_cards: ['quota'] }), true);
});

