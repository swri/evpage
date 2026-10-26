import type { EventItem, OrganizationSettings, Registration, RegistrationStatusResult } from '../types/index.ts';
import { INITIAL_EVENTS, INITIAL_ORGANIZATION_SETTINGS, INITIAL_REGISTRATIONS, formatRupiah, formatIndoDate } from './data-service.ts';
import { createClient as getSupabaseClient, isSupabaseConfigured } from './supabase/client.ts';

export { formatRupiah, formatIndoDate, isSupabaseConfigured };

export function isUsingDatabase(): boolean {
  return isSupabaseConfigured();
}

// Key names for browser localStorage cache when running demo/client
const STORAGE_KEYS = {
  EVENTS: 'evpage_events_v1',
  REGISTRATIONS: 'evpage_registrations_v1',
  SETTINGS: 'evpage_settings_v1',
  ADMIN_SESSION: 'evpage_admin_session_v1'
};

// In-memory cache for SSR & server actions
let memoryEvents: EventItem[] = [...INITIAL_EVENTS];
let memoryRegistrations: Registration[] = [...INITIAL_REGISTRATIONS];
let memorySettings: OrganizationSettings = { ...INITIAL_ORGANIZATION_SETTINGS };

// Helper to determine if we are in browser
const isBrowser = typeof window !== 'undefined';

function getStorage<T>(key: string, defaultValue: T): T {
  if (!isBrowser) return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultValue));
      return defaultValue;
    }
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function setStorage<T>(key: string, value: T): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Storage set error:', err);
  }
}

// ==========================================
// Organization Settings API (Multi-tenant scoped per organizer)
// ==========================================
export async function getOrganizationSettings(organizerId?: string): Promise<OrganizationSettings> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          logo_url: data.logo_url,
          accent_color: data.accent_color,
          wa_number: data.wa_number,
          payment_info: data.payment_info,
          updated_at: data.updated_at,
        };
      }
    } catch (err) {
      console.warn('Supabase getOrganizationSettings fallback:', err);
    }
  }

  if (isBrowser) {
    if (organizerId) {
      const scopedKey = `${STORAGE_KEYS.SETTINGS}_${organizerId}`;
      const scoped = getStorage<OrganizationSettings | null>(scopedKey, null);
      if (scoped) return scoped;
    }
    return getStorage<OrganizationSettings>(STORAGE_KEYS.SETTINGS, memorySettings);
  }
  return memorySettings;
}

export async function updateOrganizationSettings(
  settings: Partial<OrganizationSettings>,
  organizerId?: string
): Promise<OrganizationSettings> {
  const current = await getOrganizationSettings(organizerId);
  const updated: OrganizationSettings = {
    ...current,
    ...settings,
    updated_at: new Date().toISOString()
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('organizations').upsert({
        name: updated.name,
        logo_url: updated.logo_url,
        accent_color: updated.accent_color,
        wa_number: updated.wa_number,
        payment_info: updated.payment_info,
        updated_at: updated.updated_at,
      });
    } catch (err) {
      console.warn('Supabase updateOrganizationSettings fallback:', err);
    }
  }

  if (isBrowser) {
    if (organizerId) {
      setStorage(`${STORAGE_KEYS.SETTINGS}_${organizerId}`, updated);
    } else {
      setStorage(STORAGE_KEYS.SETTINGS, updated);
      memorySettings = updated;
    }
  } else {
    memorySettings = updated;
  }
  return updated;
}

// ==========================================
// Events API
// ==========================================
export async function getAllEvents(): Promise<EventItem[]> {
  const supabase = getSupabaseClient();
  let events: EventItem[] = [];
  let fetchedFromDb = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        events = data as EventItem[];
        fetchedFromDb = true;
      }
    } catch (err) {
      console.warn('Supabase getAllEvents error, using fallback:', err);
    }
  }

  if (!fetchedFromDb) {
    if (isBrowser) {
      events = getStorage<EventItem[]>(STORAGE_KEYS.EVENTS, memoryEvents);
    } else {
      events = memoryEvents;
    }
  }

  // Calculate registration counts & revenue for each event
  const regs = await getAllRegistrations();
  return events.map(evt => {
    const eventRegs = regs.filter(r => r.event_id === evt.id);
    const verified = eventRegs.filter(r => r.status === 'verified');
    const pending = eventRegs.filter(r => r.status === 'pending');
    const rejected = eventRegs.filter(r => r.status === 'rejected');
    const revenue = verified.reduce((sum, r) => sum + (r.total_amount || 0), 0);

    return {
      ...evt,
      total_registrations: eventRegs.length,
      verified_registrations: verified.length,
      pending_registrations: pending.length,
      rejected_registrations: rejected.length,
      total_revenue: revenue
    };
  });
}

export async function getEventBySlug(slug: string): Promise<EventItem | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .ilike('slug', slug)
        .maybeSingle();
      if (!error && data) {
        return data as EventItem;
      }
    } catch (err) {
      console.warn('Supabase getEventBySlug error:', err);
    }
  }
  const events = await getAllEvents();
  const found = events.find(e => e.slug.toLowerCase() === slug.toLowerCase());
  return found || null;
}

export async function getEventById(id: string): Promise<EventItem | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        return data as EventItem;
      }
    } catch (err) {
      console.warn('Supabase getEventById error:', err);
    }
  }
  const events = await getAllEvents();
  const found = events.find(e => e.id === id);
  return found || null;
}

export async function saveEvent(eventData: Partial<EventItem>): Promise<EventItem> {
  const currentEvents = await getAllEvents();
  const now = new Date().toISOString();
  let updatedEvent: EventItem;

  if (eventData.id) {
    // Update existing event
    const index = currentEvents.findIndex(e => e.id === eventData.id);
    if (index === -1) throw new Error('Event tidak ditemukan');

    updatedEvent = {
      ...currentEvents[index],
      ...eventData,
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
    const slugBase = (eventData.slug || eventData.title || 'event-baru')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
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
      starts_at: eventData.starts_at || new Date(Date.now() + 86400000 * 14).toISOString(),
      registration_deadline: eventData.registration_deadline || new Date(Date.now() + 86400000 * 10).toISOString(),
      quota: eventData.quota ?? 50,
      price_type: eventData.price_type || 'fixed',
      price_amount: eventData.price_amount ?? 0,
      prefix_code: (eventData.prefix_code || 'EVT').toUpperCase().slice(0, 5),
      organizer_name: eventData.organizer_name || 'Panitia Resmi',
      created_by: eventData.created_by,
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
    try {
      await supabase.from('events').upsert({
        id: updatedEvent.id,
        slug: updatedEvent.slug,
        title: updatedEvent.title,
        description: updatedEvent.description,
        cover_url: updatedEvent.cover_url,
        location: updatedEvent.location,
        starts_at: updatedEvent.starts_at,
        registration_deadline: updatedEvent.registration_deadline,
        quota: updatedEvent.quota,
        price_type: updatedEvent.price_type,
        price_amount: updatedEvent.price_amount,
        prefix_code: updatedEvent.prefix_code,
        form_schema: updatedEvent.form_schema,
        wa_template: updatedEvent.wa_template,
        success_message: updatedEvent.success_message,
        status: updatedEvent.status,
        updated_at: updatedEvent.updated_at,
      });
    } catch (err) {
      console.warn('Supabase saveEvent error:', err);
    }
  }

  memoryEvents = currentEvents;
  if (isBrowser) setStorage(STORAGE_KEYS.EVENTS, currentEvents);
  return updatedEvent;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('events').delete().eq('id', id);
    } catch (err) {
      console.warn('Supabase deleteEvent error:', err);
    }
  }
  const currentEvents = await getAllEvents();
  const filtered = currentEvents.filter(e => e.id !== id);
  memoryEvents = filtered;
  if (isBrowser) setStorage(STORAGE_KEYS.EVENTS, filtered);
  return true;
}

export async function duplicateEvent(id: string): Promise<EventItem> {
  const original = await getEventById(id);
  if (!original) throw new Error('Event yang akan diduplikasi tidak ditemukan');

  const copy: Partial<EventItem> = {
    ...original,
    id: undefined,
    title: `${original.title} (Salinan)`,
    slug: `${original.slug}-copy`,
    status: 'draft',
    prefix_code: original.prefix_code
  };

  return saveEvent(copy);
}

// ==========================================
// Registrations API
// ==========================================
export async function getAllRegistrations(): Promise<Registration[]> {
  const supabase = getSupabaseClient();
  let fetchedFromDb = false;
  let regs: Registration[] = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        regs = data as Registration[];
        fetchedFromDb = true;
      }
    } catch (err) {
      console.warn('Supabase getAllRegistrations fallback:', err);
    }
  }

  if (!fetchedFromDb) {
    if (isBrowser) {
      regs = getStorage<Registration[]>(STORAGE_KEYS.REGISTRATIONS, memoryRegistrations);
    } else {
      regs = memoryRegistrations;
    }
  }
  return regs;
}

export async function getRegistrationsByEvent(eventId: string): Promise<Registration[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data as Registration[];
      }
    } catch (err) {
      console.warn('Supabase getRegistrationsByEvent fallback:', err);
    }
  }

  const all = await getAllRegistrations();
  return all.filter(r => r.event_id === eventId);
}

/**
 * Total fee for a registration, derived only from the event config and answers.
 * per_participant counts rows of the first repeater field (minimum 1).
 */
export function calculateRegistrationAmount(
  event: Pick<EventItem, 'price_type' | 'price_amount' | 'form_schema'>,
  answers: Record<string, any>
): number {
  if (event.price_type === 'free') return 0;
  const price = Math.max(0, Number(event.price_amount) || 0);
  if (event.price_type === 'per_participant') {
    const repeaterField = event.form_schema.find(f => f.type === 'repeater');
    const rows = repeaterField ? answers?.[repeaterField.id] : undefined;
    const participantCount = Array.isArray(rows) ? rows.length : 1;
    return price * Math.max(1, participantCount);
  }
  return price;
}

export async function createRegistration(params: {
  event_id: string;
  answers: Record<string, any>;
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

  const allRegs = await getAllRegistrations();
  const currentEventRegs = allRegs.filter(
    r => r.event_id === params.event_id && r.status !== 'rejected'
  );

  // Check quota atomically
  if (event.quota && event.quota > 0 && currentEventRegs.length >= event.quota) {
    throw new Error('Kuota pendaftaran telah penuh');
  }

  // Generate unique registration code: PREFIX-YEAR-0001
  const year = new Date().getFullYear();
  let count = currentEventRegs.length + 1;
  const prefix = (event.prefix_code || 'EVT').toUpperCase();
  let code = `${prefix}-${year}-${String(count).padStart(4, '0')}`;

  while (allRegs.some(r => r.code === code)) {
    count++;
    code = `${prefix}-${year}-${String(count).padStart(4, '0')}`;
  }

  // Always price on our side; never trust an amount coming from the form
  const finalAmount = calculateRegistrationAmount(event, params.answers);

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
    status: 'pending',
    contact_name: params.contact_name,
    contact_phone: params.contact_phone,
    contact_email: params.contact_email,
    created_at: new Date().toISOString(),
    event
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('registrations').insert({
        id: newReg.id,
        event_id: newReg.event_id,
        code: newReg.code,
        answers: newReg.answers,
        schema_snapshot: newReg.schema_snapshot,
        total_amount: newReg.total_amount,
        payment_proof_path: newReg.payment_proof_path,
        status: newReg.status,
        contact_name: newReg.contact_name,
        contact_phone: newReg.contact_phone,
        contact_email: newReg.contact_email,
        created_at: newReg.created_at,
      });
    } catch (err) {
      console.warn('Supabase createRegistration fallback:', err);
    }
  }

  allRegs.unshift(newReg);
  memoryRegistrations = allRegs;
  if (isBrowser) setStorage(STORAGE_KEYS.REGISTRATIONS, allRegs);

  return newReg;
}

export async function updateRegistrationStatus(
  id: string,
  status: 'pending' | 'verified' | 'rejected',
  admin_note?: string
): Promise<Registration> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const payload: Record<string, any> = { status };
      if (admin_note !== undefined) payload.admin_note = admin_note;
      if (status === 'verified') payload.verified_at = new Date().toISOString();
      await supabase.from('registrations').update(payload).eq('id', id);
    } catch (err) {
      console.warn('Supabase updateRegistrationStatus error:', err);
    }
  }

  const allRegs = await getAllRegistrations();
  const index = allRegs.findIndex(r => r.id === id);
  if (index === -1) throw new Error('Pendaftaran tidak ditemukan');

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

export async function updateRegistrationData(
  id: string,
  answers: Record<string, any>,
  contact_name: string,
  contact_phone: string,
  contact_email: string
): Promise<Registration> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('registrations').update({
        answers,
        contact_name,
        contact_phone,
        contact_email
      }).eq('id', id);
    } catch (err) {
      console.warn('Supabase updateRegistrationData error:', err);
    }
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
    try {
      await supabase.from('registrations').delete().eq('id', id);
    } catch (err) {
      console.warn('Supabase deleteRegistration error:', err);
    }
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

  const allRegs = await getAllRegistrations();
  const events = await getAllEvents();

  const found = allRegs.find(r => {
    const regCleanPhone = (r.contact_phone || '').replace(/[^0-9]/g, '');
    const phoneMatches =
      !cleanPhone ||
      !regCleanPhone ||
      regCleanPhone === cleanPhone ||
      r.contact_phone === phone.trim();
    return r.code.toUpperCase() === cleanCode && phoneMatches;
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
  // Clean phone number (convert 08xx to 628xx)
  let phone = adminPhone.replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) {
    phone = '62' + phone.slice(1);
  }

  const text = template
    .replace(/{event}/g, data.event)
    .replace(/{kode}/g, data.kode)
    .replace(/{nama}/g, data.nama)
    .replace(/{total}/g, data.total)
    .replace(/{bukti}/g, data.bukti || '-');

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
