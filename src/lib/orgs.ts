// Organizations (tenants), members and invitations.
// Supabase mode relies on the RLS + RPCs in
// supabase/migrations/20261027010000_organizations_tenancy.sql;
// demo mode mirrors the same rules in localStorage.
import type { OrganizationSettings } from '../types/index.ts';
import type { AdminSession } from './auth.ts';
import { DEMO_ORG_ID, INITIAL_ORGANIZATION_SETTINGS } from './data-service.ts';
import { dbError, getStorage, isBrowser, localTable, newId, setStorage } from './local-db.ts';
import { createClient as getSupabaseClient } from './supabase/client.ts';

export type OrgRole = 'owner' | 'admin' | 'member' | 'cashier' | 'checkin';

export type Permission =
  | 'org.manage'
  | 'events.manage'
  | 'registrations.edit'
  | 'registrations.verify'
  | 'registrations.checkin'
  | 'draws.manage';

/** Mirrors public.role_has_permission() in the role_permissions migration. */
export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  owner: ['org.manage', 'events.manage', 'registrations.edit', 'registrations.verify', 'registrations.checkin', 'draws.manage'],
  admin: ['org.manage', 'events.manage', 'registrations.edit', 'registrations.verify', 'registrations.checkin', 'draws.manage'],
  member: ['events.manage', 'registrations.edit', 'registrations.verify', 'registrations.checkin', 'draws.manage'],
  cashier: ['registrations.verify'],
  checkin: ['registrations.checkin'],
};

export function roleCan(role: OrgRole | undefined | null, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role]?.includes(permission);
}

export interface Organization extends OrganizationSettings {
  id: string;
  created_by?: string;
  created_at?: string;
}

export interface MyOrganization extends Organization {
  role: OrgRole;
}

export interface OrgMember {
  organization_id: string;
  user_id: string;
  role: OrgRole;
  email?: string;
  full_name?: string;
  created_at?: string;
}

export interface OrgInvitation {
  id: string;
  organization_id: string;
  organization_name?: string;
  email: string;
  role: Exclude<OrgRole, 'owner'>;
  invited_by?: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Pemilik',
  admin: 'Admin',
  member: 'Panitia',
  cashier: 'Kasir (verifikasi bayar)',
  checkin: 'Petugas Check-in',
};

/** owner/admin manage members, invitations and organization settings */
export function canManageOrg(role: OrgRole | undefined | null): boolean {
  return roleCan(role, 'org.manage');
}

/**
 * Approvals needed before a published team draw may be changed, counting the
 * requester's own approval. Mirrors public.required_approvals() in SQL.
 *   1 organizer   -> 1 (just do it)
 *   2-3 organizers -> 2
 *   4+ organizers  -> 3
 */
export function requiredApprovals(memberCount: number): number {
  if (memberCount <= 1) return 1;
  if (memberCount <= 3) return 2;
  return 3;
}

export { DEMO_ORG_ID };
const DEMO_ADMIN_ID = 'admin-demo-uuid-1';
const INVITE_TTL_DAYS = 14;

// ---------- demo tables ----------
const orgTable = localTable<Organization>('evpage_orgs_v1', () => [
  { ...INITIAL_ORGANIZATION_SETTINGS, id: DEMO_ORG_ID, created_by: DEMO_ADMIN_ID, created_at: '2026-01-01T00:00:00.000Z' },
]);
const memberTable = localTable<OrgMember>('evpage_org_members_v1', () => [
  {
    organization_id: DEMO_ORG_ID,
    user_id: DEMO_ADMIN_ID,
    role: 'owner',
    email: 'admin@evpage.com',
    full_name: 'Administrator Utama',
    created_at: '2026-01-01T00:00:00.000Z',
  },
]);
const invitationTable = localTable<OrgInvitation>('evpage_org_invitations_v1', () => []);

function requireSession(session: AdminSession | null): AdminSession {
  if (!session) throw new Error('Silakan masuk terlebih dahulu');
  return session;
}

function mapOrg(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    logo_url: (row.logo_url as string) || undefined,
    accent_color: (row.accent_color as string) || '#171717',
    wa_number: (row.wa_number as string) || '',
    payment_info: (row.payment_info as Organization['payment_info']) || {
      bank_name: '',
      account_number: '',
      account_holder: '',
    },
    created_by: (row.created_by as string) || undefined,
    created_at: (row.created_at as string) || undefined,
    updated_at: (row.updated_at as string) || undefined,
  };
}

// ---------- active organization (UI preference) ----------
const ACTIVE_ORG_KEY = 'evpage_active_org';

export function getActiveOrganizationId(): string | null {
  return isBrowser ? getStorage<string | null>(ACTIVE_ORG_KEY, null) : null;
}

export function setActiveOrganizationId(id: string | null): void {
  setStorage(ACTIVE_ORG_KEY, id);
}

/** Picks the remembered organization if still a member, else the first one. */
export function resolveActiveOrganization(orgs: MyOrganization[]): MyOrganization | null {
  const remembered = getActiveOrganizationId();
  return orgs.find((o) => o.id === remembered) || orgs[0] || null;
}

// ---------- organizations ----------
export async function getMyOrganizations(session: AdminSession | null): Promise<MyOrganization[]> {
  if (!session) return [];
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations(*)')
      .eq('user_id', session.user.id);
    if (error) throw dbError('memuat organisasi', error);
    return (data || [])
      .filter((row) => row.organizations)
      .map((row) => ({ ...mapOrg(row.organizations as unknown as Record<string, unknown>), role: row.role as OrgRole }));
  }

  const mine = memberTable.all().filter((m) => m.user_id === session.user.id);
  const orgs = orgTable.all();
  return mine
    .map((m) => {
      const org = orgs.find((o) => o.id === m.organization_id);
      return org ? { ...org, role: m.role } : null;
    })
    .filter((o): o is MyOrganization => o !== null);
}

export async function getOrganization(id: string | undefined | null): Promise<Organization | null> {
  if (!id) return null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('organizations').select('*').eq('id', id).maybeSingle();
    if (error) throw dbError('memuat organisasi', error);
    return data ? mapOrg(data) : null;
  }
  return orgTable.all().find((o) => o.id === id) || null;
}

export async function createOrganization(name: string, session: AdminSession | null): Promise<Organization> {
  const s = requireSession(session);
  const clean = name.trim();
  if (!clean) throw new Error('Nama organisasi wajib diisi');

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.rpc('create_organization', { p_name: clean });
    if (error) throw dbError('membuat organisasi', error);
    return mapOrg(data as Record<string, unknown>);
  }

  const now = new Date().toISOString();
  const org: Organization = {
    id: newId('org'),
    name: clean,
    accent_color: '#171717',
    wa_number: '',
    payment_info: { bank_name: '', account_number: '', account_holder: '' },
    created_by: s.user.id,
    created_at: now,
  };
  orgTable.save([...orgTable.all(), org]);
  memberTable.save([
    ...memberTable.all(),
    { organization_id: org.id, user_id: s.user.id, role: 'owner', email: s.user.email, full_name: s.user.full_name, created_at: now },
  ]);
  return org;
}

export async function updateOrganization(
  id: string,
  patch: Partial<OrganizationSettings>,
  session: AdminSession | null
): Promise<Organization> {
  const s = requireSession(session);
  const updated_at = new Date().toISOString();
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organizations')
      .update({
        name: patch.name,
        logo_url: patch.logo_url,
        accent_color: patch.accent_color,
        wa_number: patch.wa_number,
        payment_info: patch.payment_info,
        updated_at,
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw dbError('menyimpan organisasi', error);
    if (!data) throw new Error('Anda tidak memiliki izin mengubah organisasi ini');
    return mapOrg(data);
  }

  const role = memberTable.all().find((m) => m.organization_id === id && m.user_id === s.user.id)?.role;
  if (!canManageOrg(role) && !s.user.is_platform_admin) {
    throw new Error('Anda tidak memiliki izin mengubah organisasi ini');
  }
  const orgs = orgTable.all();
  const index = orgs.findIndex((o) => o.id === id);
  if (index === -1) throw new Error('Organisasi tidak ditemukan');
  const next = { ...orgs[index], ...patch, id, updated_at };
  orgs[index] = next;
  orgTable.save(orgs);
  return next;
}

// ---------- members ----------
export async function getOrganizationMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, user_id, role, created_at')
      .eq('organization_id', orgId);
    if (error) throw dbError('memuat anggota', error);
    const ids = (data || []).map((m) => m.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from('profiles').select('id, email, full_name').in('id', ids)
      : { data: [], error: null };
    if (profileError) throw dbError('memuat profil anggota', profileError);
    return (data || []).map((m) => {
      const p = (profiles || []).find((x) => x.id === m.user_id);
      return { ...(m as OrgMember), email: p?.email, full_name: p?.full_name };
    });
  }
  return memberTable.all().filter((m) => m.organization_id === orgId);
}

function assertLocalManager(orgId: string, session: AdminSession) {
  const role = memberTable.all().find((m) => m.organization_id === orgId && m.user_id === session.user.id)?.role;
  if (!canManageOrg(role) && !session.user.is_platform_admin) {
    throw new Error('Hanya pemilik/admin organisasi yang dapat mengelola anggota');
  }
  return role;
}

export async function changeMemberRole(orgId: string, userId: string, role: OrgRole, session: AdminSession | null) {
  const s = requireSession(session);
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (error) throw dbError('mengubah peran', error);
    if (!data) throw new Error('Anda tidak memiliki izin mengubah peran ini');
    return;
  }

  const myRole = assertLocalManager(orgId, s);
  if (role === 'owner' && myRole !== 'owner' && !s.user.is_platform_admin) {
    throw new Error('Hanya pemilik yang dapat menunjuk pemilik baru');
  }
  const members = memberTable.all();
  const target = members.find((m) => m.organization_id === orgId && m.user_id === userId);
  if (!target) throw new Error('Anggota tidak ditemukan');
  if (target.role === 'owner' && role !== 'owner') assertNotLastOwner(members, orgId, userId);
  target.role = role;
  memberTable.save(members);
}

function assertNotLastOwner(members: OrgMember[], orgId: string, userId: string) {
  const otherOwners = members.filter((m) => m.organization_id === orgId && m.role === 'owner' && m.user_id !== userId);
  if (otherOwners.length === 0) throw new Error('Organisasi harus memiliki minimal satu owner');
}

export async function removeMember(orgId: string, userId: string, session: AdminSession | null) {
  const s = requireSession(session);
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .select();
    if (error) throw dbError('menghapus anggota', error);
    if (!data || data.length === 0) throw new Error('Anda tidak memiliki izin menghapus anggota ini');
    return;
  }

  if (userId !== s.user.id) assertLocalManager(orgId, s);
  const members = memberTable.all();
  const target = members.find((m) => m.organization_id === orgId && m.user_id === userId);
  if (!target) throw new Error('Anggota tidak ditemukan');
  if (target.role === 'owner') assertNotLastOwner(members, orgId, userId);
  memberTable.save(members.filter((m) => m !== target));
}

// ---------- invitations ----------
export async function inviteMember(
  orgId: string,
  email: string,
  role: Exclude<OrgRole, 'owner'>,
  session: AdminSession | null
): Promise<OrgInvitation> {
  const s = requireSession(session);
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Format email tidak valid');

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organization_invitations')
      .insert({ organization_id: orgId, email: cleanEmail, role, invited_by: s.user.id })
      .select()
      .single();
    if (error) throw dbError('mengirim undangan', error);
    return data as OrgInvitation;
  }

  assertLocalManager(orgId, s);
  if (memberTable.all().some((m) => m.organization_id === orgId && m.email?.toLowerCase() === cleanEmail)) {
    throw new Error('Email ini sudah menjadi anggota organisasi');
  }
  const now = Date.now();
  const invitation: OrgInvitation = {
    id: newId('inv'),
    organization_id: orgId,
    email: cleanEmail,
    role,
    invited_by: s.user.id,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + INVITE_TTL_DAYS * 86400000).toISOString(),
    accepted_at: null,
  };
  invitationTable.save([...invitationTable.all(), invitation]);
  return invitation;
}

/** Open invitations addressed to the signed-in user's email */
export async function getMyInvitations(session: AdminSession | null): Promise<OrgInvitation[]> {
  if (!session) return [];
  const email = session.user.email.toLowerCase();
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('*, organizations(name)')
      .ilike('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString());
    if (error) throw dbError('memuat undangan', error);
    return (data || []).map((row) => ({
      ...(row as OrgInvitation),
      organization_name: (row.organizations as { name?: string } | null)?.name,
    }));
  }
  const orgs = orgTable.all();
  return invitationTable
    .all()
    .filter((i) => i.email === email && !i.accepted_at && Date.parse(i.expires_at) > Date.now())
    .map((i) => ({ ...i, organization_name: orgs.find((o) => o.id === i.organization_id)?.name }));
}

export async function getOrganizationInvitations(orgId: string): Promise<OrgInvitation[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('*')
      .eq('organization_id', orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw dbError('memuat undangan', error);
    return (data || []) as OrgInvitation[];
  }
  return invitationTable.all().filter((i) => i.organization_id === orgId && !i.accepted_at);
}

export async function acceptInvitation(invitationId: string, session: AdminSession | null): Promise<void> {
  const s = requireSession(session);
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.rpc('accept_invitation', { p_invitation_id: invitationId });
    if (error) throw dbError('menerima undangan', error);
    return;
  }

  const invitations = invitationTable.all();
  const inv = invitations.find((i) => i.id === invitationId);
  if (!inv || inv.email !== s.user.email.toLowerCase()) throw new Error('Undangan tidak ditemukan');
  if (inv.accepted_at) throw new Error('Undangan sudah digunakan');
  if (Date.parse(inv.expires_at) < Date.now()) throw new Error('Undangan sudah kedaluwarsa');

  const members = memberTable.all();
  if (!members.some((m) => m.organization_id === inv.organization_id && m.user_id === s.user.id)) {
    members.push({
      organization_id: inv.organization_id,
      user_id: s.user.id,
      role: inv.role,
      email: s.user.email,
      full_name: s.user.full_name,
      created_at: new Date().toISOString(),
    });
    memberTable.save(members);
  }
  inv.accepted_at = new Date().toISOString();
  invitationTable.save(invitations);
}

export async function revokeInvitation(invitationId: string, session: AdminSession | null): Promise<void> {
  const s = requireSession(session);
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('organization_invitations').delete().eq('id', invitationId).select();
    if (error) throw dbError('membatalkan undangan', error);
    if (!data || data.length === 0) throw new Error('Anda tidak memiliki izin membatalkan undangan ini');
    return;
  }
  const invitations = invitationTable.all();
  const inv = invitations.find((i) => i.id === invitationId);
  if (!inv) return;
  assertLocalManager(inv.organization_id, s);
  invitationTable.save(invitations.filter((i) => i.id !== invitationId));
}

// ---------- access context ----------
export interface AccessContext {
  session: AdminSession | null;
  organizations: MyOrganization[];
  isPlatformAdmin: boolean;
}

export async function getAccessContext(session: AdminSession | null): Promise<AccessContext> {
  return {
    session,
    organizations: await getMyOrganizations(session),
    isPlatformAdmin: !!session?.user.is_platform_admin,
  };
}

/**
 * Whether the signed-in organizer may manage an event. UI guard only; in
 * Supabase mode RLS (is_org_member / can_manage_event) is the enforcement.
 */
export function canManageEventIn(
  event: { organization_id?: string; created_by?: string },
  ctx: AccessContext
): boolean {
  if (!ctx.session) return false;
  if (ctx.isPlatformAdmin) return true;
  if (event.organization_id) return ctx.organizations.some((o) => o.id === event.organization_id);
  // Legacy events created before organizations existed
  return !!event.created_by && event.created_by === ctx.session.user.id;
}
