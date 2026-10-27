// Storage housekeeping for organizers and the platform admin.
// Supabase mode: RPCs from 20261028000000_storage_cleanup.sql pick the files
// and clear database references; files are then removed via the Storage API
// (Supabase does not allow deleting Storage files with SQL).
// Demo mode: proofs are inline data URLs, so cleanup only clears them.
import type { AdminSession } from './auth.ts';
import type { EventItem } from '../types/index.ts';
import { dbError } from './local-db.ts';
import { PROOF_BUCKET } from './payment-proof.ts';
import {
  deleteOrganizationRecord,
  localOrganizationsSnapshot,
  purgeLocalExpiredInvitations,
} from './orgs.ts';
import { clearLocalPaymentProofs, deleteEvent, getAllEvents, getAllRegistrations } from './store.ts';
import { createClient as getSupabaseClient } from './supabase/client.ts';

const REMOVE_BATCH = 100;

/** Finished = closed, or the start date has passed. Mirrors public.is_event_finished(). */
type EventTiming = { status: EventItem['status']; starts_at?: string | null };

export function isEventFinished(event: EventTiming, now = Date.now()): boolean {
  return event.status === 'closed' || (!!event.starts_at && Date.parse(event.starts_at) < now);
}

/** Removes files from the proof bucket in batches; returns how many were removed. */
export async function removeProofFiles(paths: string[]): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase || paths.length === 0) return 0;
  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const { data, error } = await supabase.storage.from(PROOF_BUCKET).remove(paths.slice(i, i + REMOVE_BATCH));
    if (error) throw dbError('menghapus file bukti bayar', error);
    removed += data?.length ?? 0;
  }
  return removed;
}

export interface PurgeResult {
  /** registrations whose proof reference was cleared (demo) or files removed (Supabase) */
  removed: number;
}

/**
 * Deletes every payment proof of an event. Event managers: only after the
 * event is finished. Platform admin: any time.
 */
export async function purgeEventPaymentProofs(
  event: EventTiming & { id: string },
  session: AdminSession | null
): Promise<PurgeResult> {
  if (!session) throw new Error('Silakan masuk terlebih dahulu');
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('purge_event_payment_proofs', { p_event_id: event.id });
    if (error) throw dbError('membersihkan bukti bayar', error);
    return { removed: await removeProofFiles((data as string[]) || []) };
  }
  if (!session.user.is_platform_admin && !isEventFinished(event)) {
    throw new Error('Bukti bayar baru bisa dibersihkan setelah event selesai (ditutup atau tanggal mulai lewat)');
  }
  return { removed: await clearLocalPaymentProofs(event.id) };
}

export interface OrphanProof {
  name: string;
  event_id: string | null;
  size_bytes: number;
  created_at: string;
}

/** Files no registration points to (failed or abandoned uploads), older than 1 hour. */
export async function findOrphanProofs(eventId?: string): Promise<OrphanProof[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return []; // demo mode stores proofs inline, there are no loose files
  const { data, error } = await supabase.rpc('list_orphan_payment_proofs', { p_event_id: eventId ?? null });
  if (error) throw dbError('mencari file yatim', error);
  return ((data || []) as OrphanProof[]).map((o) => ({ ...o, size_bytes: Number(o.size_bytes) || 0 }));
}

export async function removeOrphanProofs(eventId?: string): Promise<PurgeResult> {
  const orphans = await findOrphanProofs(eventId);
  return { removed: await removeProofFiles(orphans.map((o) => o.name)) };
}

/** Deletes an event, its registrations (cascade) and its files. */
export async function deleteEventWithFiles(eventId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('event_storage_files', { p_event_id: eventId });
    if (error) throw dbError('menyiapkan penghapusan event', error);
    await removeProofFiles((data as string[]) || []);
  }
  await deleteEvent(eventId);
}

/** Deletes an organization with all its events and files (owner / platform admin). */
export async function deleteOrganizationWithFiles(orgId: string, session: AdminSession | null): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('organization_storage_files', { p_org: orgId });
    if (error) throw dbError('menyiapkan penghapusan organisasi', error);
    await removeProofFiles((data as string[]) || []);
    await deleteOrganizationRecord(orgId, session);
    return;
  }
  await deleteOrganizationRecord(orgId, session);
  for (const evt of (await getAllEvents()).filter((e) => e.organization_id === orgId)) {
    await deleteEvent(evt.id);
  }
}

// ---------- platform admin ----------
export interface PlatformOverview {
  storage: { files: number; bytes: number };
  organizations: { id: string; name: string; created_at?: string; members: number; events: number }[];
  events: {
    id: string;
    title: string;
    slug: string;
    status: EventItem['status'];
    starts_at?: string | null;
    organization_id?: string | null;
    finished: boolean;
    registrations: number;
    files: number;
    bytes: number;
  }[];
  expired_invitations: number;
}

/** Rough size of a base64 data URL payload in bytes */
const dataUrlBytes = (value: string) => Math.floor(((value.split(',')[1] || '').length * 3) / 4);

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('platform_overview');
    if (error) throw dbError('memuat ringkasan platform', error);
    return data as PlatformOverview;
  }

  const [events, regs] = await Promise.all([getAllEvents(), getAllRegistrations()]);
  const { organizations, members, invitations } = localOrganizationsSnapshot();
  const eventRows = events.map((e) => {
    const proofs = regs.filter((r) => r.event_id === e.id && r.payment_proof_path);
    return {
      id: e.id,
      title: e.title,
      slug: e.slug,
      status: e.status,
      starts_at: e.starts_at ?? null,
      organization_id: e.organization_id ?? null,
      finished: isEventFinished(e),
      registrations: regs.filter((r) => r.event_id === e.id).length,
      files: proofs.length,
      bytes: proofs.reduce((sum, r) => sum + dataUrlBytes(r.payment_proof_path || ''), 0),
    };
  });
  return {
    storage: {
      files: eventRows.reduce((s, e) => s + e.files, 0),
      bytes: eventRows.reduce((s, e) => s + e.bytes, 0),
    },
    organizations: organizations.map((o) => ({
      id: o.id,
      name: o.name,
      created_at: o.created_at,
      members: members.filter((m) => m.organization_id === o.id).length,
      events: events.filter((e) => e.organization_id === o.id).length,
    })),
    events: eventRows,
    expired_invitations: invitations.filter((i) => !i.accepted_at && Date.parse(i.expires_at) < Date.now()).length,
  };
}

export async function purgeExpiredInvitations(): Promise<number> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('purge_expired_invitations');
    if (error) throw dbError('menghapus undangan kedaluwarsa', error);
    return Number(data) || 0;
  }
  return purgeLocalExpiredInvitations();
}

export { formatBytes } from './utils.ts';
