import type { EventItem, OrganizationSettings, Registration, RegistrationStatus, RegistrationStatusResult } from '../types/index.ts';
import { INITIAL_EVENTS, INITIAL_REGISTRATIONS } from './data-service.ts';
import { formatRupiah, formatIndoDate } from './utils.ts';
import { logger } from './logger.ts';
import { createClient as getSupabaseClient, isSupabaseConfigured } from './supabase/client.ts';
import { dbError, getStorage, isBrowser, setStorage } from './local-db.ts';
import { getOrganization } from './orgs.ts';
import { renderTemplate, whatsAppLink } from './notifications.ts';
import { isHttpUrl } from './links.ts';
import { DEMO_ORG_ID } from './data-service.ts';

export { formatRupiah, formatIndoDate, isSupabaseConfigured };

export function isUsingDatabase(): boolean {
  return isSupabaseConfigured();
}

// Key names for browser localStorage cache when running demo/client
const STORAGE_KEYS = {
  EVENTS: 'evpage_events_v1',
  REGISTRATIONS: 'evpage_registrations_v1',
};

// In-memory cache for SSR & server actions
let memoryEvents: EventItem[] = [...INITIAL_EVENTS];
let memoryRegistrations: Registration[] = [...INITIAL_REGISTRATIONS];

const EMPTY_ORGANIZATION_SETTINGS: OrganizationSettings = {
  name: 'Penyelenggara Event',
  accent_color: '#171717',
  wa_number: '',
  payment_info: { bank_name: '', account_number: '', account_holder: '' },
};

// ==========================================
// Organization branding & payment info (per organization / tenant)
// Editing lives in lib/orgs.ts (updateOrganization).
// ==========================================
/**
 * Branding/payment details of an event's organization. Without an id the
 * demo organization is used in demo mode; Supabase mode returns neutral
 * platform branding (there is no single organization).
 */
export async function getOrganizationSettings(organizationId?: string): Promise<OrganizationSettings> {
  const id = organizationId || (isSupabaseConfigured() ? null : DEMO_ORG_ID);
  try {
    const org = await getOrganization(id);
    return org || EMPTY_ORGANIZATION_SETTINGS;
  } catch (err) {
    // Non-fatal for page rendering, but never fall back to demo payment details
    logger.error('store', 'getOrganizationSettings error', err);
    return EMPTY_ORGANIZATION_SETTINGS;
  }
}

// ==========================================
// Events API
// ==========================================
export async function getAllEvents(): Promise<EventItem[]> {
  const supabase = getSupabaseClient();
  let events: EventItem[];

  if (supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw dbError('memuat daftar event', error);
    events = (data || []) as EventItem[];
  } else if (isBrowser) {
    events = getStorage<EventItem[]>(STORAGE_KEYS.EVENTS, memoryEvents);
  } else {
    events = memoryEvents;
  }

  if (events.length === 0) {
    return [];
  }

  // Supabase mode: aggregate counts via RPC without downloading all registrations
  if (supabase) {
    const eventIds = events.map((e) => e.id);
    const { data: statsData, error: statsError } = await supabase.rpc('get_event_admin_stats', {
      p_event_ids: eventIds,
    });

    if (!statsError && statsData && Array.isArray(statsData)) {
      type AdminStats = {
        event_id: string;
        slots_used: number;
        total_registrations: number;
        verified_registrations: number;
        pending_registrations: number;
        rejected_registrations: number;
        total_revenue: number;
      };
      const statsMap = new Map<string, AdminStats>(
        (statsData as AdminStats[]).map((s) => [s.event_id, s])
      );

      return events.map((evt) => {
        const s = statsMap.get(evt.id);
        const verified = s?.verified_registrations ?? 0;
        const pending = s?.pending_registrations ?? 0;
        return {
          ...evt,
          active_registrations: verified + pending,
          slots_used: s?.slots_used ?? 0,
          total_registrations: s?.total_registrations ?? 0,
          verified_registrations: verified,
          pending_registrations: pending,
          rejected_registrations: s?.rejected_registrations ?? 0,
          total_revenue: s?.total_revenue ?? 0,
        };
      });
    }

    // Fallback if RPC is not deployed yet: attach public slot counts
    return attachPublicSlotCounts(events);
  }

  // Demo / local mode calculation
  const regs = await getAllRegistrations();
  return events.map((evt) => {
    const eventRegs = regs.filter((r) => r.event_id === evt.id);
    const verified = eventRegs.filter((r) => r.status === 'verified');
    const pending = eventRegs.filter((r) => r.status === 'pending');
    const rejected = eventRegs.filter((r) => r.status === 'rejected');
    const revenue = verified.reduce((sum, r) => sum + (r.total_amount || 0), 0);

    return {
      ...evt,
      active_registrations: verified.length + pending.length,
      slots_used: slotsUsed(evt, eventRegs),
      total_registrations: eventRegs.length,
      verified_registrations: verified.length,
      pending_registrations: pending.length,
      rejected_registrations: rejected.length,
      total_revenue: revenue,
    };
  });
}

/**
 * Anonymous visitors see no registrations under RLS, so slot usage for open
 * events comes from the get_event_public_stats RPC (counts only).
 */
async function attachPublicSlotCounts(events: EventItem[]): Promise<EventItem[]> {
  const supabase = getSupabaseClient();
  const openIds = events.filter(e => e.status === 'open').map(e => e.id);
  if (!supabase || openIds.length === 0) return events;

  const { data, error } = await supabase.rpc('get_event_public_stats', { p_event_ids: openIds });
  if (error) throw dbError('memuat kuota event', error);
  type Stats = { event_id: string; slots_used: number; active_registrations: number };
  const stats = new Map<string, Stats>(((data || []) as Stats[]).map(r => [r.event_id, r]));
  return events.map(e => {
    const row = stats.get(e.id);
    return row ? { ...e, active_registrations: row.active_registrations, slots_used: row.slots_used } : e;
  });
}

export async function getEventBySlug(slug: string): Promise<EventItem | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    // eq instead of ilike: '%' or '_' in the URL must not act as wildcards.
    // Slugs are stored lowercase by saveEvent.
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug.toLowerCase())
      .maybeSingle();
    if (error) throw dbError('memuat event', error);
    if (!data) return null;
    const [withCounts] = await attachPublicSlotCounts([data as EventItem]);
    return withCounts;
  }
  const events = await getAllEvents();
  const found = events.find(e => e.slug.toLowerCase() === slug.toLowerCase());
  return found || null;
}

export async function getEventById(id: string): Promise<EventItem | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError('memuat event', error);
    return (data as EventItem) || null;
  }
  const events = await getAllEvents();
  const found = events.find(e => e.id === id);
  return found || null;
}

/** Only real columns; computed counters must never be written back. */
function toEventRow(evt: EventItem) {
  return {
    id: evt.id,
    organization_id: evt.organization_id,
    created_by: evt.created_by,
    organizer_name: evt.organizer_name,
    contact_config: evt.contact_config,
    slug: evt.slug,
    title: evt.title,
    description: evt.description,
    cover_url: evt.cover_url,
    location: evt.location,
    location_url: evt.location_url || null,
    starts_at: evt.starts_at,
    registration_deadline: evt.registration_deadline,
    quota: evt.quota,
    quota_mode: evt.quota_mode ?? 'registration',
    waitlist_enabled: evt.waitlist_enabled ?? false,
    event_type: evt.event_type ?? 'general',
    type_config: evt.type_config ?? {},
    notification_templates: evt.notification_templates ?? {},
    price_type: evt.price_type,
    price_amount: evt.price_amount,
    prefix_code: evt.prefix_code,
    form_schema: evt.form_schema,
    wa_template: evt.wa_template,
    success_message: evt.success_message,
    status: evt.status,
    updated_at: evt.updated_at,
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Returns a user-facing error message, or null when the input is valid. */
export function validateEventInput(data: Partial<EventItem>): string | null {
  if (data.title !== undefined && !data.title.trim()) return 'Judul event wajib diisi';
  if (data.quota !== undefined && (!Number.isInteger(data.quota) || data.quota < 0)) {
    return 'Kuota harus bilangan bulat ≥ 0 (0 = tanpa batas)';
  }
  if (data.price_amount !== undefined && (!Number.isFinite(data.price_amount) || data.price_amount < 0)) {
    return 'Harga tidak boleh negatif';
  }
  if (data.location_url && !isHttpUrl(data.location_url)) {
    return 'Link lokasi harus berupa URL lengkap yang diawali https://';
  }
  if (data.starts_at && Number.isNaN(Date.parse(data.starts_at))) return 'Tanggal mulai tidak valid';
  if (data.registration_deadline && Number.isNaN(Date.parse(data.registration_deadline))) {
    return 'Batas pendaftaran tidak valid';
  }
  if (
    data.starts_at &&
    data.registration_deadline &&
    Date.parse(data.registration_deadline) > Date.parse(data.starts_at)
  ) {
    return 'Batas pendaftaran tidak boleh melewati waktu mulai event';
  }
  return null;
}

export async function saveEvent(eventData: Partial<EventItem>): Promise<EventItem> {
  const currentEvents = await getAllEvents();
  const now = new Date().toISOString();
  let updatedEvent: EventItem;

  const validationError = validateEventInput(eventData);
  if (validationError) throw new Error(validationError);
  if (!eventData.id && !eventData.organization_id && isSupabaseConfigured()) {
    // RLS only accepts events inside an organization the user belongs to
    throw new Error('Pilih organisasi penyelenggara terlebih dahulu');
  }

  if (eventData.id) {
    // Update existing event
    const index = currentEvents.findIndex(e => e.id === eventData.id);
    if (index === -1) throw new Error('Event tidak ditemukan');

    let slug = currentEvents[index].slug;
    if (eventData.slug !== undefined) {
      slug = slugify(eventData.slug);
      if (!slug) throw new Error('Slug URL wajib diisi');
      if (currentEvents.some(e => e.id !== eventData.id && e.slug === slug)) {
        throw new Error(`Slug URL "${slug}" sudah dipakai event lain`);
      }
    }

    updatedEvent = {
      ...currentEvents[index],
      ...eventData,
      slug,
      organizer_name:
        eventData.organizer_name !== undefined
          ? eventData.organizer_name
          : currentEvents[index].organizer_name || 'Panitia Resmi',
      updated_at: now,
    };
    currentEvents[index] = updatedEvent;
  } else {
    // Create new event
    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'evt-' + Math.random().toString(36).substring(2, 9);
    const slugBase = slugify(eventData.slug || eventData.title || '') || 'event-baru';

    // Ensure slug is unique
    let finalSlug = slugBase;
    let counter = 1;
    while (currentEvents.some(e => e.slug === finalSlug)) {
      finalSlug = `${slugBase}-${counter++}`;
    }

    updatedEvent = {
      id: newId,
      slug: finalSlug,
      title: eventData.title || 'Event Baru',
      description: eventData.description || '',
      cover_url: eventData.cover_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&auto=format&fit=crop&q=80',
      location: eventData.location || '',
      location_url: eventData.location_url || null,
      starts_at: eventData.starts_at || new Date(Date.now() + 86400000 * 14).toISOString(),
      registration_deadline: eventData.registration_deadline || new Date(Date.now() + 86400000 * 10).toISOString(),
      quota: eventData.quota ?? 50,
      quota_mode: eventData.quota_mode ?? 'registration',
      waitlist_enabled: eventData.waitlist_enabled ?? false,
      event_type: eventData.event_type ?? 'general',
      type_config: eventData.type_config ?? {},
      notification_templates: eventData.notification_templates ?? {},
      price_type: eventData.price_type || 'fixed',
      price_amount: eventData.price_amount ?? 0,
      prefix_code: (eventData.prefix_code || 'EVT').toUpperCase().slice(0, 5),
      organizer_name: eventData.organizer_name || 'Panitia Resmi',
      created_by: eventData.created_by,
      organization_id: eventData.organization_id,
      contact_config: eventData.contact_config,
      form_schema: eventData.form_schema || [],
      wa_template: eventData.wa_template || 'Halo Admin, saya telah mendaftar di *{event}*.\n\nKode Pendaftaran: *{kode}*\nNama: *{nama}*\nTotal Bayar: *Rp {total}*\nBukti: {bukti}',
      success_message: eventData.success_message || 'Terima kasih telah mendaftar! Mohon segera konfirmasi pembayaran melalui WhatsApp.',
      status: eventData.status || 'open',
      created_at: now,
      updated_at: now
    };

    currentEvents.unshift(updatedEvent);
  }

  // Sync to Supabase Postgres if configured
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('events').upsert(toEventRow(updatedEvent));
    if (error) throw dbError('menyimpan event', error);
    return updatedEvent;
  }

  memoryEvents = currentEvents;
  if (isBrowser) setStorage(STORAGE_KEYS.EVENTS, currentEvents);
  return updatedEvent;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw dbError('menghapus event', error);
    return true;
  }
  const currentEvents = await getAllEvents();
  const filtered = currentEvents.filter(e => e.id !== id);
  memoryEvents = filtered;
  if (isBrowser) setStorage(STORAGE_KEYS.EVENTS, filtered);
  // Same as ON DELETE CASCADE in Postgres: registrations go with the event
  const remainingRegs = (await getAllRegistrations()).filter(r => r.event_id !== id);
  memoryRegistrations = remainingRegs;
  if (isBrowser) setStorage(STORAGE_KEYS.REGISTRATIONS, remainingRegs);
  return true;
}

/**
 * Demo-mode counterpart of purge_event_payment_proofs: drops the inline
 * proofs of one event. Returns how many registrations were cleared.
 */
export async function clearLocalPaymentProofs(eventId: string): Promise<number> {
  const now = new Date().toISOString();
  let cleared = 0;
  const regs = (await getAllRegistrations()).map(r => {
    if (r.event_id !== eventId || !r.payment_proof_path) return r;
    cleared++;
    return { ...r, payment_proof_path: '', payment_proof_purged_at: now };
  });
  memoryRegistrations = regs;
  if (isBrowser) setStorage(STORAGE_KEYS.REGISTRATIONS, regs);
  return cleared;
}

export async function duplicateEvent(id: string, createdBy?: string): Promise<EventItem> {
  const original = await getEventById(id);
  if (!original) throw new Error('Event yang akan diduplikasi tidak ditemukan');

  const copy: Partial<EventItem> = {
    ...original,
    id: undefined,
    title: `${original.title} (Salinan)`,
    slug: `${original.slug}-copy`,
    status: 'draft',
    prefix_code: original.prefix_code,
    // The copy belongs to whoever duplicated it
    created_by: createdBy ?? original.created_by,
  };

  return saveEvent(copy);
}

// ==========================================
// Registrations API
// ==========================================
export async function getAllRegistrations(): Promise<Registration[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    // Note: for anonymous visitors RLS returns an empty list, not an error
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw dbError('memuat pendaftaran', error);
    return (data || []) as Registration[];
  }

  if (isBrowser) {
    return getStorage<Registration[]>(STORAGE_KEYS.REGISTRATIONS, memoryRegistrations);
  }
  return memoryRegistrations;
}

export async function getRegistrationsByEvent(eventId: string): Promise<Registration[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw dbError('memuat pendaftaran', error);
    return (data || []) as Registration[];
  }

  const all = await getAllRegistrations();
  return all.filter(r => r.event_id === eventId);
}

/**
 * People in one registration: rows of the first repeater field (minimum 1).
 * Mirrors public.count_participants() in SQL.
 */
export function countParticipants(
  event: Pick<EventItem, 'form_schema'>,
  answers: Record<string, unknown>
): number {
  const repeaterField = event.form_schema.find(f => f.type === 'repeater');
  const rows = repeaterField ? answers?.[repeaterField.id] : undefined;
  return Array.isArray(rows) ? Math.max(1, rows.length) : 1;
}

/**
 * Total fee for a registration, derived only from the event config and answers.
 * per_participant multiplies by countParticipants().
 */
export function calculateRegistrationAmount(
  event: Pick<EventItem, 'price_type' | 'price_amount' | 'form_schema'>,
  answers: Record<string, unknown>
): number {
  if (event.price_type === 'free') return 0;
  const price = Math.max(0, Number(event.price_amount) || 0);
  if (event.price_type === 'per_participant') return price * countParticipants(event, answers);
  return price;
}

const ACTIVE_STATUSES: RegistrationStatus[] = ['pending', 'verified'];

/** Slots a registration takes under the event's quota mode. */
export function slotsNeeded(event: Pick<EventItem, 'quota_mode'>, participantCount: number | undefined): number {
  return event.quota_mode === 'participant' ? Math.max(1, participantCount ?? 1) : 1;
}

/** Slots used by active (pending + verified) registrations. Mirrors public.event_slots_used(). */
export function slotsUsed(event: Pick<EventItem, 'quota_mode'>, eventRegs: Registration[]): number {
  return eventRegs
    .filter(r => ACTIVE_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + slotsNeeded(event, r.participant_count), 0);
}

/** null means unlimited (quota 0) */
export function remainingSlots(event: Pick<EventItem, 'quota' | 'slots_used'>): number | null {
  if (!event.quota || event.quota <= 0) return null;
  return Math.max(0, event.quota - (event.slots_used || 0));
}

function assertFitsQuota(event: EventItem, eventRegs: Registration[], needed: number) {
  if (!event.quota || event.quota <= 0) return;
  const used = slotsUsed(event, eventRegs);
  if (used + needed > event.quota) {
    throw new Error(`Kuota belum tersedia (sisa ${Math.max(event.quota - used, 0)}, dibutuhkan ${needed})`);
  }
}

export async function createRegistration(params: {
  event_id: string;
  answers: Record<string, unknown>;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  payment_proof_path?: string;
}): Promise<Registration> {
  const event = await getEventById(params.event_id);
  if (!event) throw new Error('Event tidak ditemukan');

  if (event.status !== 'open') {
    throw new Error('Pendaftaran untuk event ini sedang ditutup');
  }

  // Check deadline
  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    throw new Error('Batas waktu pendaftaran telah berakhir');
  }

  // Always price on our side; never trust an amount coming from the form
  const finalAmount = calculateRegistrationAmount(event, params.answers);

  const supabase = getSupabaseClient();
  if (supabase) {
    // Anonymous inserts are blocked by RLS; the atomic function locks the
    // event row, enforces quota/deadline and generates the code server-side.
    // Price and form snapshot are derived inside the function from the event
    const { data, error } = await supabase.rpc('create_registration_atomic', {
      p_event_id: params.event_id,
      p_answers: params.answers,
      p_payment_proof_path: params.payment_proof_path || '',
      p_contact_name: params.contact_name,
      p_contact_phone: params.contact_phone,
      p_contact_email: params.contact_email,
    });
    if (error) throw dbError('menyimpan pendaftaran', error);
    return { ...(data as Registration), event };
  }

  const allRegs = await getAllRegistrations();
  const eventRegs = allRegs.filter(r => r.event_id === params.event_id);

  // Same rules as create_registration_atomic
  const participantCount = countParticipants(event, params.answers);
  const needed = slotsNeeded(event, participantCount);
  const used = slotsUsed(event, eventRegs);
  let status: RegistrationStatus = 'pending';
  if (event.quota && event.quota > 0 && used + needed > event.quota) {
    if (event.waitlist_enabled) {
      status = 'waitlisted';
    } else if (used < event.quota) {
      throw new Error(`Sisa kuota ${event.quota - used} peserta, pendaftaran ini berisi ${needed} peserta`);
    } else {
      throw new Error('Kuota pendaftaran telah penuh');
    }
  }

  // Generate unique registration code: PREFIX-YEAR-0001 (sequence over all statuses)
  const year = new Date().getFullYear();
  let count = eventRegs.length + 1;
  const prefix = (event.prefix_code || 'EVT').toUpperCase();
  let code = `${prefix}-${year}-${String(count).padStart(4, '0')}`;

  while (allRegs.some(r => r.code === code)) {
    count++;
    code = `${prefix}-${year}-${String(count).padStart(4, '0')}`;
  }

  const newReg: Registration = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'reg-' + Math.random().toString(36).substring(2, 9),
    event_id: params.event_id,
    code,
    answers: params.answers,
    schema_snapshot: event.form_schema,
    total_amount: finalAmount,
    payment_proof_path: params.payment_proof_path || '',
    status,
    participant_count: participantCount,
    contact_name: params.contact_name,
    contact_phone: params.contact_phone,
    contact_email: params.contact_email,
    created_at: new Date().toISOString(),
    event
  };

  allRegs.unshift(newReg);
  if (!setStorage(STORAGE_KEYS.REGISTRATIONS, allRegs)) {
    throw new Error(
      'Pendaftaran gagal disimpan: penyimpanan browser penuh. Coba unggah bukti pembayaran dengan ukuran lebih kecil.'
    );
  }
  memoryRegistrations = allRegs;

  return newReg;
}

export async function updateRegistrationStatus(
  id: string,
  status: RegistrationStatus,
  admin_note?: string
): Promise<Registration> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const payload: Record<string, unknown> = { status };
    if (admin_note !== undefined) payload.admin_note = admin_note;
    if (status === 'verified') payload.verified_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('registrations')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw dbError('memperbarui status pendaftaran', error);
    if (!data) throw new Error('Pendaftaran tidak ditemukan');
    return data as Registration;
  }

  const allRegs = await getAllRegistrations();
  const index = allRegs.findIndex(r => r.id === id);
  if (index === -1) throw new Error('Pendaftaran tidak ditemukan');

  // Mirrors the registrations_quota_on_activation trigger
  const current = allRegs[index];
  if (!ACTIVE_STATUSES.includes(current.status) && ACTIVE_STATUSES.includes(status)) {
    const event = await getEventById(current.event_id);
    if (event) {
      const eventRegs = allRegs.filter(r => r.event_id === event.id);
      assertFitsQuota(event, eventRegs, slotsNeeded(event, current.participant_count));
    }
  }

  const now = new Date().toISOString();
  const updated: Registration = {
    ...allRegs[index],
    status,
    admin_note: admin_note !== undefined ? admin_note : allRegs[index].admin_note,
    verified_at: status === 'verified' ? now : allRegs[index].verified_at
  };

  allRegs[index] = updated;
  memoryRegistrations = allRegs;
  if (isBrowser) setStorage(STORAGE_KEYS.REGISTRATIONS, allRegs);

  return updated;
}

/** Moves a waitlisted registration to pending when the quota allows it. */
export async function promoteFromWaitlist(id: string): Promise<Registration> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('promote_from_waitlist', { p_registration_id: id });
    if (error) throw dbError('memindahkan dari daftar tunggu', error);
    return data as Registration;
  }
  const reg = (await getAllRegistrations()).find(r => r.id === id);
  if (!reg) throw new Error('Pendaftaran tidak ditemukan');
  if (reg.status !== 'waitlisted') throw new Error('Pendaftaran ini tidak berada di daftar tunggu');
  return updateRegistrationStatus(id, 'pending');
}

/** Attendance on the event day. Only verified participants can check in. */
export async function setCheckIn(id: string, checkedIn: boolean, userId?: string): Promise<Registration> {
  const checked_in_at = checkedIn ? new Date().toISOString() : null;
  const checked_in_by = checkedIn ? userId ?? null : null;

  const supabase = getSupabaseClient();
  if (supabase) {
    let query = supabase.from('registrations').update({ checked_in_at, checked_in_by }).eq('id', id);
    if (checkedIn) query = query.eq('status', 'verified');
    const { data, error } = await query.select().maybeSingle();
    if (error) throw dbError('mencatat kehadiran', error);
    if (!data) throw new Error('Hanya peserta terverifikasi yang dapat check-in');
    return data as Registration;
  }

  const allRegs = await getAllRegistrations();
  const index = allRegs.findIndex(r => r.id === id);
  if (index === -1) throw new Error('Pendaftaran tidak ditemukan');
  if (checkedIn && allRegs[index].status !== 'verified') {
    throw new Error('Hanya peserta terverifikasi yang dapat check-in');
  }
  allRegs[index] = { ...allRegs[index], checked_in_at, checked_in_by };
  memoryRegistrations = allRegs;
  if (isBrowser) setStorage(STORAGE_KEYS.REGISTRATIONS, allRegs);
  return allRegs[index];
}

export async function updateRegistrationData(
  id: string,
  answers: Record<string, unknown>,
  contact_name: string,
  contact_phone: string,
  contact_email: string
): Promise<Registration> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('registrations')
      .update({ answers, contact_name, contact_phone, contact_email })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw dbError('memperbarui data pendaftaran', error);
    if (!data) throw new Error('Pendaftaran tidak ditemukan');
    return data as Registration;
  }

  const allRegs = await getAllRegistrations();
  const index = allRegs.findIndex(r => r.id === id);
  if (index === -1) throw new Error('Pendaftaran tidak ditemukan');

  const updated: Registration = {
    ...allRegs[index],
    answers,
    contact_name,
    contact_phone,
    contact_email
  };

  allRegs[index] = updated;
  memoryRegistrations = allRegs;
  if (isBrowser) setStorage(STORAGE_KEYS.REGISTRATIONS, allRegs);
  return updated;
}

export async function deleteRegistration(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('registrations').delete().eq('id', id);
    if (error) throw dbError('menghapus pendaftaran', error);
    return true;
  }

  const allRegs = await getAllRegistrations();
  const filtered = allRegs.filter(r => r.id !== id);
  memoryRegistrations = filtered;
  if (isBrowser) setStorage(STORAGE_KEYS.REGISTRATIONS, filtered);
  return true;
}

export async function checkStatus(code: string, phone: string): Promise<RegistrationStatusResult | null> {
  const cleanCode = code.trim().toUpperCase();
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  // Both factors are mandatory: codes are sequential and easy to guess
  if (!cleanCode || !cleanPhone) return null;

  const supabase = getSupabaseClient();
  if (supabase) {
    // Anonymous visitors cannot read registrations under RLS; use the
    // SECURITY DEFINER lookup from supabase/schema.sql instead.
    const { data, error } = await supabase.rpc('check_registration_status', {
      p_code: cleanCode,
      p_phone: phone,
    });
    if (error) throw new Error(error.message || 'Gagal memeriksa status pendaftaran');
    const row = Array.isArray(data) ? data[0] : data;
    return (row as RegistrationStatusResult) || null;
  }

  const allRegs = await getAllRegistrations();
  const events = await getAllEvents();

  const found = allRegs.find(r => {
    const regCleanPhone = (r.contact_phone || '').replace(/[^0-9]/g, '');
    return r.code.toUpperCase() === cleanCode && regCleanPhone !== '' && regCleanPhone === cleanPhone;
  });

  if (!found) return null;

  const event = events.find(e => e.id === found.event_id);

  return {
    code: found.code,
    event_title: event?.title || 'Event',
    contact_name: found.contact_name,
    status: found.status,
    admin_note: found.admin_note,
    total_amount: found.total_amount,
    created_at: found.created_at,
    verified_at: found.verified_at
  };
}

// Generate pre-filled WhatsApp link
export function buildWhatsAppLink(
  adminPhone: string,
  template: string,
  data: {
    event: string;
    kode: string;
    nama: string;
    total: string;
    bukti?: string;
  }
): string {
  // Same renderer as lib/notifications (safe against "$&" in names)
  return whatsAppLink(adminPhone, renderTemplate(template, { ...data, bukti: data.bukti || '-' }));
}
