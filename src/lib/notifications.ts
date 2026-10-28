// Notification templates. One place for every message the app sends, with
// per-event overrides in events.notification_templates. Delivery is
// WhatsApp click-to-chat (the organizer or participant presses send), which
// fits manual-transfer payments; an email/WA API channel can reuse the same
// rendered text later.
import type { EventItem, Registration, RegistrationStatus } from '../types/index.ts';

export type NotificationKind =
  | 'registration_received'
  | 'status_pending'
  | 'status_verified'
  | 'status_rejected'
  | 'waitlist_joined'
  | 'waitlist_promoted';

export const NOTIFICATION_KINDS: { kind: NotificationKind; label: string; audience: 'panitia' | 'peserta' }[] = [
  { kind: 'registration_received', label: 'Konfirmasi pendaftaran (peserta → panitia)', audience: 'panitia' },
  { kind: 'status_pending', label: 'Status: menunggu verifikasi', audience: 'peserta' },
  { kind: 'status_verified', label: 'Status: terverifikasi', audience: 'peserta' },
  { kind: 'status_rejected', label: 'Status: ditolak', audience: 'peserta' },
  { kind: 'waitlist_joined', label: 'Masuk daftar tunggu', audience: 'peserta' },
  { kind: 'waitlist_promoted', label: 'Dapat slot dari daftar tunggu', audience: 'peserta' },
];

/** Placeholders available in every template */
export const TEMPLATE_VARIABLES = ['event', 'kode', 'nama', 'total', 'bukti', 'status', 'catatan', 'tautan_status', 'tautan_tim'] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string>>;

const SIGNATURE = '\n\nTerima kasih,\nPanitia Penyelenggara.';

export const DEFAULT_TEMPLATES: Record<NotificationKind, string> = {
  registration_received:
    'Halo Admin, saya telah mendaftar di *{event}*.\n\nKode Pendaftaran: *{kode}*\nNama: *{nama}*\nTotal Bayar: *{total}*\nBukti: {bukti}',
  status_pending:
    'Halo {nama},\n\nPendaftaran Anda di *{event}* (kode *{kode}*) sedang kami periksa.{catatan}\nPantau status: {tautan_status}' + SIGNATURE,
  status_verified:
    'Halo {nama},\n\nPendaftaran Anda di *{event}* (kode *{kode}*) *TERVERIFIKASI*. Sampai jumpa di acara!{catatan}\nPembagian tim/kelompok: {tautan_tim}' + SIGNATURE,
  status_rejected:
    'Halo {nama},\n\nMohon maaf, pendaftaran Anda di *{event}* (kode *{kode}*) *DITOLAK*.{catatan}\nSilakan hubungi panitia bila ada pertanyaan.' + SIGNATURE,
  waitlist_joined:
    'Halo {nama},\n\nKuota *{event}* sedang penuh, Anda masuk *daftar tunggu* (kode *{kode}*). Mohon jangan transfer dulu; kami kabari bila ada slot.' + SIGNATURE,
  waitlist_promoted:
    'Halo {nama},\n\nKabar baik! Ada slot untuk Anda di *{event}* (kode *{kode}*). Silakan selesaikan pembayaran *{total}* dan kirim buktinya.{catatan}' + SIGNATURE,
};

/**
 * Replaces {placeholders} with values. Unknown placeholders are left as-is so
 * a typo is visible instead of silently disappearing. Uses a replacer
 * function, so "$&" or "$1" inside a participant's name is not interpreted.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = vars[key as TemplateVariable];
    return value === undefined ? match : value;
  });
}

/** Per-event override, then the legacy wa_template for confirmations, then the default. */
export function getTemplate(
  event: Pick<EventItem, 'wa_template' | 'notification_templates'> | null | undefined,
  kind: NotificationKind
): string {
  const override = event?.notification_templates?.[kind];
  if (override && override.trim()) return override;
  if (kind === 'registration_received' && event?.wa_template?.trim()) return event.wa_template;
  return DEFAULT_TEMPLATES[kind];
}

/** Which message fits a registration's current state. */
export function notificationKindFor(status: RegistrationStatus, justPromoted = false): NotificationKind {
  if (justPromoted) return 'waitlist_promoted';
  switch (status) {
    case 'verified':
      return 'status_verified';
    case 'rejected':
      return 'status_rejected';
    case 'waitlisted':
      return 'waitlist_joined';
    default:
      return 'status_pending';
  }
}

/** Indonesian numbers: 08xx -> 628xx; strips everything but digits. */
export function normalizeWhatsAppNumber(phone: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits;
}

import { formatTicketCode } from './utils.ts';

export function whatsAppLink(phone: string, text: string): string {
  return `https://wa.me/${normalizeWhatsAppNumber(phone)}?text=${encodeURIComponent(text)}`;
}

/** Message to a participant about their registration, ready for wa.me. */
export function buildParticipantMessage(
  event: Pick<EventItem, 'title' | 'slug' | 'wa_template' | 'notification_templates'>,
  reg: Pick<Registration, 'code' | 'contact_name' | 'contact_phone' | 'status' | 'admin_note' | 'total_amount'>,
  options: { origin?: string; formatMoney?: (n: number) => string; justPromoted?: boolean } = {}
): { kind: NotificationKind; text: string; link: string } {
  const kind = notificationKindFor(reg.status, options.justPromoted);
  const origin = options.origin ?? '';
  const cleanCode = formatTicketCode(reg.code);
  const text = renderTemplate(getTemplate(event, kind), {
    event: event.title,
    kode: cleanCode,
    nama: reg.contact_name,
    total: options.formatMoney ? options.formatMoney(reg.total_amount) : String(reg.total_amount),
    status: reg.status,
    catatan: reg.admin_note ? `\n\nCatatan panitia: "${reg.admin_note}"` : '',
    tautan_status: `${origin}/status?code=${encodeURIComponent(cleanCode)}`,
    tautan_tim: `${origin}/e/${event.slug}/teams`,
  });
  return { kind, text, link: whatsAppLink(reg.contact_phone, text) };
}
