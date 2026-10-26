// Server-side readers for public pages (Supabase mode). They use an anonymous
// client without cookies, so results are the same for every visitor and can
// be cached. RLS limits them to what anon may see: open events, organization
// branding, slot counts (RPC) and published teams (RPC).
// Kept free of next/cache so they are unit-testable; caching lives in
// public-cache.ts.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventItem, OrganizationSettings } from '../../types/index.ts';
import { supabaseEnv } from '../admin-guard.ts';
import type { PublicDraw } from '../draws.ts';

/** Public pages can render on the server only when Supabase is configured. */
export function isServerDataEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return supabaseEnv(env) !== null;
}

export function createPublicSupabase(env: Record<string, string | undefined> = process.env): SupabaseClient | null {
  const config = supabaseEnv(env);
  if (!config) return null;
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const EMPTY_SETTINGS: OrganizationSettings = {
  name: 'Penyelenggara Event',
  accent_color: '#171717',
  wa_number: '',
  payment_info: { bank_name: '', account_number: '', account_holder: '' },
};

type SlotStats = { event_id: string; slots_used: number; active_registrations: number };

async function attachSlots(client: SupabaseClient, events: EventItem[]): Promise<EventItem[]> {
  const openIds = events.filter((e) => e.status === 'open').map((e) => e.id);
  if (openIds.length === 0) return events;
  const { data, error } = await client.rpc('get_event_public_stats', { p_event_ids: openIds });
  if (error) throw new Error(`get_event_public_stats: ${error.message}`);
  const stats = new Map(((data || []) as SlotStats[]).map((r) => [r.event_id, r]));
  return events.map((e) => {
    const s = stats.get(e.id);
    return s ? { ...e, slots_used: s.slots_used, active_registrations: s.active_registrations } : e;
  });
}

async function fetchSettings(client: SupabaseClient, organizationId?: string): Promise<OrganizationSettings> {
  if (!organizationId) return EMPTY_SETTINGS;
  const { data, error } = await client
    .from('organizations')
    .select('id, name, logo_url, accent_color, wa_number, payment_info, updated_at')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`organizations: ${error.message}`);
  return (data as OrganizationSettings) || EMPTY_SETTINGS;
}

export interface PublicEventPage {
  event: EventItem;
  settings: OrganizationSettings;
}

export async function fetchPublicEvent(client: SupabaseClient, slug: string): Promise<PublicEventPage | null> {
  const { data, error } = await client.from('events').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
  if (error) throw new Error(`events: ${error.message}`);
  if (!data) return null;
  const [event] = await attachSlots(client, [data as EventItem]);
  return { event, settings: await fetchSettings(client, event.organization_id) };
}

/** Open events for the landing page, newest first. */
export async function fetchOpenEvents(client: SupabaseClient): Promise<EventItem[]> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`events: ${error.message}`);
  return attachSlots(client, (data || []) as EventItem[]);
}

export async function fetchPublicDraw(client: SupabaseClient, slug: string): Promise<PublicDraw | null> {
  const { data, error } = await client.rpc('get_public_draw', { p_event_slug: slug.toLowerCase() });
  if (error) throw new Error(`get_public_draw: ${error.message}`);
  return (data as PublicDraw) || null;
}

/** Short plain-text description for link previews (WhatsApp, Facebook, X). */
export function previewDescription(event: Pick<EventItem, 'description' | 'location' | 'starts_at'>, max = 180): string {
  const text = (event.description || '')
    .replace(/[#*_`>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const base = text || [event.location, event.starts_at ? new Date(event.starts_at).toLocaleDateString('id-ID') : '']
    .filter(Boolean)
    .join(' · ');
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}
