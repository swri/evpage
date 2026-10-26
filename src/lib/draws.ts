// Published team draws and the approval workflow for changing them.
// Supabase mode: RPCs from supabase/migrations/20261027040000_group_draws_approvals.sql.
// Demo mode mirrors the same rules in localStorage.
import type { AdminSession } from './auth.ts';
import type { EventItem } from '../types/index.ts';
import type { GeneratedTeam, PlayerParticipant } from './team-generator.ts';
import { dbError, localTable, newId } from './local-db.ts';
import { getOrganizationMembers, requiredApprovals } from './orgs.ts';
import { createClient as getSupabaseClient } from './supabase/client.ts';

/** Team as stored/published: no phone numbers or registration codes */
export type PublishedPlayer = Pick<PlayerParticipant, 'id' | 'name' | 'position' | 'backNumber' | 'teamOrigin' | 'level'>;
export type PublishedTeam = Omit<GeneratedTeam, 'players'> & { players: PublishedPlayer[] };

export interface GroupDraw {
  id: string;
  event_id: string;
  organization_id: string;
  algorithm: string;
  seed?: string | null;
  options: Record<string, unknown>;
  participants_hash?: string | null;
  result: PublishedTeam[];
  version: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type ChangeStatus = 'pending' | 'applied' | 'rejected' | 'stale';

export interface DrawVote {
  request_id: string;
  user_id: string;
  approve: boolean;
  created_at: string;
}

export interface DrawChangeRequest {
  id: string;
  draw_id: string;
  base_version: number;
  proposed_result: PublishedTeam[];
  proposed_seed?: string | null;
  proposed_options?: Record<string, unknown> | null;
  reason?: string | null;
  requested_by?: string | null;
  required_approvals: number;
  status: ChangeStatus;
  created_at: string;
  resolved_at?: string | null;
  votes: DrawVote[];
}

export interface DrawMeta {
  algorithm: string;
  seed?: string;
  options?: Record<string, unknown>;
}

/** Strips contact data before a result is stored or shown to participants. */
export function toPublishedTeams(teams: GeneratedTeam[]): PublishedTeam[] {
  return teams.map((t) => ({
    ...t,
    players: t.players.map(({ id, name, position, backNumber, teamOrigin, level }) => ({
      id,
      name,
      position,
      backNumber,
      teamOrigin,
      level,
    })),
  }));
}

/** SHA-256 of the sorted participant ids: proves which pool a seed was applied to. */
export async function participantsHash(players: { id: string }[]): Promise<string> {
  const ids = players.map((p) => p.id).sort().join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ids));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Same decision as public.resolve_draw_change(): apply once enough approvals
 * are in, reject once the remaining members can no longer reach the target.
 */
export function resolveOutcome(input: { yes: number; no: number; required: number; members: number }): 'applied' | 'rejected' | 'pending' {
  if (input.yes >= input.required) return 'applied';
  if (input.members - input.no < input.required) return 'rejected';
  return 'pending';
}

// ---------- demo tables ----------
const drawTable = localTable<GroupDraw>('evpage_group_draws_v1', () => []);
const requestTable = localTable<Omit<DrawChangeRequest, 'votes'>>('evpage_draw_requests_v1', () => []);
const voteTable = localTable<DrawVote>('evpage_draw_votes_v1', () => []);

function requireSession(session: AdminSession | null): AdminSession {
  if (!session) throw new Error('Silakan masuk terlebih dahulu');
  return session;
}

async function assertLocalMember(orgId: string, session: AdminSession) {
  const members = await getOrganizationMembers(orgId);
  if (!session.user.is_platform_admin && !members.some((m) => m.user_id === session.user.id)) {
    throw new Error('Hasil undian tidak ditemukan');
  }
  return members;
}

// ---------- reads ----------
export async function getEventDraw(eventId: string): Promise<GroupDraw | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('group_draws').select('*').eq('event_id', eventId).maybeSingle();
    if (error) throw dbError('memuat hasil undian', error);
    return (data as GroupDraw) || null;
  }
  return drawTable.all().find((d) => d.event_id === eventId) || null;
}

export async function getDrawChangeRequests(drawId: string): Promise<DrawChangeRequest[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('draw_change_requests')
      .select('*, votes:draw_change_votes(*)')
      .eq('draw_id', drawId)
      .order('created_at', { ascending: false });
    if (error) throw dbError('memuat permintaan perubahan', error);
    return (data || []) as DrawChangeRequest[];
  }
  const votes = voteTable.all();
  return requestTable
    .all()
    .filter((r) => r.draw_id === drawId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => ({ ...r, votes: votes.filter((v) => v.request_id === r.id) }));
}

export interface PublicDraw {
  event_title: string;
  seed?: string | null;
  version: number;
  updated_at: string;
  teams: PublishedTeam[];
}

/** Published teams of an open/closed event, for participants. */
export async function getPublicDraw(slug: string, event?: EventItem | null): Promise<PublicDraw | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('get_public_draw', { p_event_slug: slug });
    if (error) throw dbError('memuat pembagian tim', error);
    return (data as PublicDraw) || null;
  }
  if (!event || event.status === 'draft') return null;
  const draw = await getEventDraw(event.id);
  return draw
    ? { event_title: event.title, seed: draw.seed, version: draw.version, updated_at: draw.updated_at, teams: draw.result }
    : null;
}

// ---------- writes ----------
export async function publishDraw(
  event: Pick<EventItem, 'id' | 'organization_id'>,
  teams: GeneratedTeam[],
  meta: DrawMeta & { participantsHash?: string },
  session: AdminSession | null
): Promise<GroupDraw> {
  const s = requireSession(session);
  const result = toPublishedTeams(teams);

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('publish_group_draw', {
      p_event_id: event.id,
      p_algorithm: meta.algorithm,
      p_seed: meta.seed ?? null,
      p_options: meta.options ?? {},
      p_participants_hash: meta.participantsHash ?? null,
      p_result: result,
    });
    if (error) throw dbError('mempublikasikan hasil undian', error);
    return data as GroupDraw;
  }

  if (!event.organization_id) throw new Error('Event belum terhubung ke organisasi');
  await assertLocalMember(event.organization_id, s);
  if (drawTable.all().some((d) => d.event_id === event.id)) {
    throw new Error('Hasil undian sudah dipublikasikan; ajukan perubahan untuk mengubahnya');
  }
  const now = new Date().toISOString();
  const draw: GroupDraw = {
    id: newId('draw'),
    event_id: event.id,
    organization_id: event.organization_id,
    algorithm: meta.algorithm,
    seed: meta.seed ?? null,
    options: meta.options ?? {},
    participants_hash: meta.participantsHash ?? null,
    result,
    version: 1,
    created_by: s.user.id,
    created_at: now,
    updated_at: now,
  };
  drawTable.save([...drawTable.all(), draw]);
  return draw;
}

function applyLocal(requestId: string): 'applied' | 'stale' {
  const requests = requestTable.all();
  const req = requests.find((r) => r.id === requestId)!;
  const draws = drawTable.all();
  const draw = draws.find((d) => d.id === req.draw_id)!;
  const now = new Date().toISOString();

  if (draw.version !== req.base_version) {
    req.status = 'stale';
    req.resolved_at = now;
    requestTable.save(requests);
    return 'stale';
  }
  draw.result = req.proposed_result;
  draw.seed = req.proposed_seed ?? draw.seed;
  draw.options = req.proposed_options ?? draw.options;
  draw.version += 1;
  draw.updated_at = now;
  drawTable.save(draws);

  for (const r of requests) {
    if (r.draw_id !== draw.id || r.status !== 'pending') continue;
    r.status = r.id === req.id ? 'applied' : 'stale';
    r.resolved_at = now;
  }
  requestTable.save(requests);
  return 'applied';
}

async function resolveLocal(requestId: string): Promise<ChangeStatus> {
  const req = requestTable.all().find((r) => r.id === requestId)!;
  const draw = drawTable.all().find((d) => d.id === req.draw_id)!;
  const members = (await getOrganizationMembers(draw.organization_id)).length;
  const votes = voteTable.all().filter((v) => v.request_id === requestId);
  const outcome = resolveOutcome({
    yes: votes.filter((v) => v.approve).length,
    no: votes.filter((v) => !v.approve).length,
    required: req.required_approvals,
    members,
  });
  if (outcome === 'applied') return applyLocal(requestId);
  if (outcome === 'rejected') {
    const requests = requestTable.all();
    const target = requests.find((r) => r.id === requestId)!;
    target.status = 'rejected';
    target.resolved_at = new Date().toISOString();
    requestTable.save(requests);
  }
  return outcome;
}

/**
 * Proposes a new result for a published draw. With a single organizer it is
 * applied at once; otherwise it waits for requiredApprovals(members).
 */
export async function requestDrawChange(
  draw: GroupDraw,
  teams: GeneratedTeam[],
  details: { reason?: string; seed?: string; options?: Record<string, unknown> },
  session: AdminSession | null
): Promise<{ request: DrawChangeRequest; outcome: ChangeStatus }> {
  const s = requireSession(session);
  const proposed = toPublishedTeams(teams);

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('request_draw_change', {
      p_draw_id: draw.id,
      p_base_version: draw.version,
      p_proposed_result: proposed,
      p_reason: details.reason ?? '',
      p_proposed_seed: details.seed ?? null,
      p_proposed_options: details.options ?? null,
    });
    if (error) throw dbError('mengajukan perubahan undian', error);
    const { outcome, ...request } = data as DrawChangeRequest & { outcome: ChangeStatus };
    return { request: { ...request, votes: [] }, outcome };
  }

  const current = drawTable.all().find((d) => d.id === draw.id);
  if (!current) throw new Error('Hasil undian tidak ditemukan');
  const members = await assertLocalMember(current.organization_id, s);
  if (current.version !== draw.version) {
    throw new Error('Hasil undian sudah berubah; muat ulang sebelum mengajukan perubahan');
  }

  const now = new Date().toISOString();
  const request: Omit<DrawChangeRequest, 'votes'> = {
    id: newId('dcr'),
    draw_id: draw.id,
    base_version: draw.version,
    proposed_result: proposed,
    proposed_seed: details.seed ?? null,
    proposed_options: details.options ?? null,
    reason: details.reason?.trim() || null,
    requested_by: s.user.id,
    required_approvals: requiredApprovals(members.length),
    status: 'pending',
    created_at: now,
    resolved_at: null,
  };
  requestTable.save([...requestTable.all(), request]);
  voteTable.save([...voteTable.all(), { request_id: request.id, user_id: s.user.id, approve: true, created_at: now }]);

  const outcome = await resolveLocal(request.id);
  const saved = (await getDrawChangeRequests(draw.id)).find((r) => r.id === request.id)!;
  return { request: saved, outcome };
}

export async function voteDrawChange(requestId: string, approve: boolean, session: AdminSession | null): Promise<ChangeStatus> {
  const s = requireSession(session);
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('vote_draw_change', { p_request_id: requestId, p_approve: approve });
    if (error) throw dbError('memberi suara', error);
    return data as ChangeStatus;
  }

  const req = requestTable.all().find((r) => r.id === requestId);
  if (!req) throw new Error('Permintaan perubahan tidak ditemukan');
  const draw = drawTable.all().find((d) => d.id === req.draw_id)!;
  await assertLocalMember(draw.organization_id, s);
  if (req.status !== 'pending') throw new Error(`Permintaan ini sudah selesai (${req.status})`);
  if (voteTable.all().some((v) => v.request_id === requestId && v.user_id === s.user.id)) {
    throw new Error('Anda sudah memberikan suara untuk permintaan ini');
  }
  voteTable.save([...voteTable.all(), { request_id: requestId, user_id: s.user.id, approve, created_at: new Date().toISOString() }]);
  return resolveLocal(requestId);
}
