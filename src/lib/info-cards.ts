export type InfoCardId = 'location' | 'time' | 'deadline' | 'organizer' | 'quota' | 'price';

export interface InfoCardMeta {
  id: InfoCardId;
  title: string;
  shortLabel: string;
  description: string;
}

export const ALL_INFO_CARDS: readonly InfoCardMeta[] = [
  {
    id: 'location',
    title: 'Lokasi Pertandingan / Venue',
    shortLabel: 'Lokasi',
    description: 'Alamat tempat acara, tombol Salin Alamat dan Buka di Google Maps',
  },
  {
    id: 'time',
    title: 'Waktu Bermain / Jadwal Acara',
    shortLabel: 'Waktu & Jadwal',
    description: 'Hari, tanggal, jam mulai, dan tombol Tambah ke Kalender (.ics)',
  },
  {
    id: 'deadline',
    title: 'Batas Akhir Pendaftaran',
    shortLabel: 'Batas Akhir',
    description: 'Batas waktu pendaftaran dan badge hitung mundur sisa waktu',
  },
  {
    id: 'organizer',
    title: 'Penyelenggara Event',
    shortLabel: 'Penyelenggara',
    description: 'Nama pihak penyelenggara atau panitia resmi acara',
  },
  {
    id: 'quota',
    title: 'Sisa Kuota Peserta',
    shortLabel: 'Sisa Kuota',
    description: 'Jumlah kuota tersisa, total kapasitas pendaftar, dan status waitlist',
  },
  {
    id: 'price',
    title: 'Biaya Pendaftaran / Tiket',
    shortLabel: 'Biaya / Tiket',
    description: 'Nominal harga dan skema pembayaran (Gratis, Tetap, Per Peserta)',
  },
] as const;

export const DEFAULT_CARD_ORDER: InfoCardId[] = ALL_INFO_CARDS.map((c) => c.id);

/**
 * Resolves the card order from event.type_config or fallback to DEFAULT_CARD_ORDER.
 * Ensures any missing card IDs from older configurations are appended to the end,
 * and invalid IDs are safely discarded.
 */
export function resolveCardOrder(typeConfig?: Record<string, unknown> | null): InfoCardId[] {
  if (!typeConfig || typeof typeConfig !== 'object') {
    return [...DEFAULT_CARD_ORDER];
  }
  const rawOrder = (typeConfig as { card_order?: unknown }).card_order;
  if (!Array.isArray(rawOrder) || rawOrder.length === 0) {
    return [...DEFAULT_CARD_ORDER];
  }

  const validIds = new Set<InfoCardId>(DEFAULT_CARD_ORDER);
  const result: InfoCardId[] = [];

  for (const item of rawOrder) {
    if (typeof item === 'string' && validIds.has(item as InfoCardId) && !result.includes(item as InfoCardId)) {
      result.push(item as InfoCardId);
    }
  }

  for (const id of DEFAULT_CARD_ORDER) {
    if (!result.includes(id)) {
      result.push(id);
    }
  }

  return result;
}

/**
 * Checks if a specific info card is enabled / visible for the event.
 */
export function isCardVisible(id: InfoCardId, typeConfig?: Record<string, unknown> | null): boolean {
  if (!typeConfig || typeof typeConfig !== 'object') return true;
  const hidden = (typeConfig as { hidden_cards?: unknown }).hidden_cards;
  if (Array.isArray(hidden) && hidden.includes(id)) {
    return false;
  }
  return true;
}
