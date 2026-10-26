import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TEMPLATES,
  NOTIFICATION_KINDS,
  TEMPLATE_VARIABLES,
  buildParticipantMessage,
  getTemplate,
  normalizeWhatsAppNumber,
  notificationKindFor,
  renderTemplate,
} from '../src/lib/notifications.ts';
import { buildWhatsAppLink } from '../src/lib/store.ts';

const event = { title: 'Mini Cup', slug: 'mini-cup', wa_template: 'Daftar {event} kode {kode}', notification_templates: {} };
const reg = {
  code: 'MSC-2026-0007',
  contact_name: 'Budi',
  contact_phone: '0812-3456-7890',
  status: 'verified' as const,
  admin_note: 'Datang 07.00',
  total_amount: 750000,
};

test('renderTemplate fills known placeholders and keeps unknown ones visible', () => {
  assert.equal(renderTemplate('Halo {nama} di {event} {typo}', { nama: 'Sari', event: 'Cup' }), 'Halo Sari di Cup {typo}');
});

test('renderTemplate does not interpret $ patterns from participant input', () => {
  assert.equal(renderTemplate('Halo {nama}', { nama: 'A$&B $1' }), 'Halo A$&B $1');
  const link = buildWhatsAppLink('0812', '{nama}', { nama: '$&', event: '', kode: '', total: '' });
  assert.ok(decodeURIComponent(link).endsWith('text=$&'));
});

test('templates: per-event override > legacy wa_template > default', () => {
  assert.equal(getTemplate(event, 'registration_received'), 'Daftar {event} kode {kode}');
  assert.equal(getTemplate(event, 'status_verified'), DEFAULT_TEMPLATES.status_verified);
  const custom = { ...event, notification_templates: { status_verified: 'Lunas, {nama}!' } };
  assert.equal(getTemplate(custom, 'status_verified'), 'Lunas, {nama}!');
  assert.equal(getTemplate({ ...event, notification_templates: { status_verified: '   ' } }, 'status_verified'), DEFAULT_TEMPLATES.status_verified);
});

test('notificationKindFor maps every status, promotion wins', () => {
  assert.equal(notificationKindFor('pending'), 'status_pending');
  assert.equal(notificationKindFor('verified'), 'status_verified');
  assert.equal(notificationKindFor('rejected'), 'status_rejected');
  assert.equal(notificationKindFor('waitlisted'), 'waitlist_joined');
  assert.equal(notificationKindFor('pending', true), 'waitlist_promoted');
});

test('buildParticipantMessage renders note, links and a wa.me URL', () => {
  const msg = buildParticipantMessage(event, reg, { origin: 'https://evpage.id', formatMoney: (n) => `Rp ${n}` });
  assert.equal(msg.kind, 'status_verified');
  assert.match(msg.text, /Halo Budi/);
  assert.match(msg.text, /Catatan panitia: "Datang 07.00"/);
  assert.match(msg.text, /https:\/\/evpage\.id\/e\/mini-cup\/teams/);
  assert.ok(msg.link.startsWith('https://wa.me/6281234567890?text='));
});

test('default templates only use documented variables', () => {
  const known = new Set<string>(TEMPLATE_VARIABLES);
  for (const { kind } of NOTIFICATION_KINDS) {
    for (const [, key] of DEFAULT_TEMPLATES[kind].matchAll(/\{([a-z_]+)\}/g)) {
      assert.ok(known.has(key), `${kind} uses {${key}}`);
    }
  }
});

test('normalizeWhatsAppNumber', () => {
  assert.equal(normalizeWhatsAppNumber('0812 3456'), '628123456');
  assert.equal(normalizeWhatsAppNumber('+62 812'), '62812');
});
