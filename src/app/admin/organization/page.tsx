'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Check, MailPlus, Trash2, UserMinus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPageSkeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import { useOrg } from '@/components/admin/org-context';
import {
  ROLE_LABELS,
  acceptInvitation,
  canManageOrg,
  changeMemberRole,
  createOrganization,
  getOrganizationInvitations,
  getOrganizationMembers,
  inviteMember,
  removeMember,
  requiredApprovals,
  revokeInvitation,
  roleCan,
  setActiveOrganizationId,
  type OrgInvitation,
  type OrgMember,
  type OrgRole,
} from '@/lib/orgs';

const sectionClass =
  'rounded-xl border border-neutral-200/90 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900';

export default function OrganizationPage() {
  const { toast } = useToast();
  const { session, activeOrg, invitations, refresh, loading } = useOrg();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<OrgInvitation[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<OrgRole, 'owner'>>('member');
  const [busy, setBusy] = useState(false);

  const isManager = canManageOrg(activeOrg?.role) || !!session?.user.is_platform_admin;

  const loadTeam = useCallback(async () => {
    if (!activeOrg) return;
    try {
      const [m, inv] = await Promise.all([
        getOrganizationMembers(activeOrg.id),
        isManager ? getOrganizationInvitations(activeOrg.id) : Promise.resolve([]),
      ]);
      setMembers(m);
      setPendingInvites(inv);
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memuat tim' });
    }
  }, [activeOrg, isManager, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTeam();
  }, [loadTeam]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast({ type: 'success', message: success });
      await refresh();
      await loadTeam();
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Terjadi kesalahan' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const org = await createOrganization(newOrgName, session);
      setActiveOrganizationId(org.id);
      setNewOrgName('');
    }, 'Organisasi berhasil dibuat');
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    run(async () => {
      await inviteMember(activeOrg.id, inviteEmail, inviteRole, session);
      setInviteEmail('');
    }, `Undangan dikirim ke ${inviteEmail}. Minta mereka masuk/daftar dengan email tersebut.`);
  };

  if (loading) {
    return <AdminPageSkeleton cards={3} />;
  }

  // Only roles that may manage draws form the approval quorum
  const drawManagers = members.filter((m) => roleCan(m.role, 'draws.manage')).length;
  const approvalsNeeded = requiredApprovals(drawManagers);

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-200">
      <div className="border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
          Organisasi &amp; Tim Panitia
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
          Event, pendaftar, dan hasil undian dimiliki oleh organisasi. Undang penyelenggara lain agar bisa mengelola bersama.
        </p>
      </div>

      {invitations.length > 0 && (
        <section className={sectionClass} aria-labelledby="my-invites">
          <h2 id="my-invites" className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-3">
            Undangan untuk Anda
          </h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  <strong>{inv.organization_name || 'Organisasi'}</strong> mengundang Anda sebagai{' '}
                  {ROLE_LABELS[inv.role]}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => acceptInvitation(inv.id, session), 'Anda bergabung ke organisasi')}
                  className="gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Terima
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeOrg ? (
        <>
          <section className={sectionClass} aria-labelledby="members">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 id="members" className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                <Users className="h-4 w-4 text-neutral-500" />
                Anggota {activeOrg.name}
              </h2>
              <Badge variant="secondary">Peran Anda: {ROLE_LABELS[activeOrg.role]}</Badge>
            </div>

            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {members.map((m) => {
                const isSelf = m.user_id === session?.user.id;
                return (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {m.full_name || m.email || m.user_id} {isSelf && <span className="text-neutral-400">(Anda)</span>}
                      </div>
                      <div className="text-neutral-500 truncate">{m.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isManager && !isSelf ? (
                        <select
                          aria-label={`Peran ${m.email || m.user_id}`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            run(
                              () => changeMemberRole(activeOrg.id, m.user_id, e.target.value as OrgRole, session),
                              'Peran diperbarui'
                            )
                          }
                          className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-800"
                        >
                          {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant="outline">{ROLE_LABELS[m.role]}</Badge>
                      )}
                      {(isManager || isSelf) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={isSelf ? 'Keluar dari organisasi' : `Keluarkan ${m.email || m.user_id}`}
                          onClick={() => {
                            if (!confirm(isSelf ? 'Keluar dari organisasi ini?' : 'Keluarkan anggota ini?')) return;
                            run(() => removeMember(activeOrg.id, m.user_id, session), isSelf ? 'Anda keluar dari organisasi' : 'Anggota dikeluarkan');
                          }}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-[11px] text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400">
              Aturan perubahan hasil undian yang sudah dipublikasikan: dengan {drawManagers} panitia pengelola undian,
              perlu <strong>{approvalsNeeded} persetujuan</strong>
              {approvalsNeeded > 1 ? ' (termasuk pengaju)' : ' (langsung berlaku)'}.
            </p>
          </section>

          {isManager && (
            <section className={sectionClass} aria-labelledby="invite">
              <h2 id="invite" className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-3">
                <MailPlus className="h-4 w-4 text-neutral-500" />
                Undang Penyelenggara
              </h2>
              <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@panitia.com"
                  aria-label="Email yang diundang"
                  className="flex-1"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Exclude<OrgRole, 'owner'>)}
                  aria-label="Peran yang diundang"
                  className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-800"
                >
                  <option value="member">{ROLE_LABELS.member}</option>
                  <option value="cashier">{ROLE_LABELS.cashier}</option>
                  <option value="checkin">{ROLE_LABELS.checkin}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                </select>
                <Button type="submit" isLoading={busy}>
                  Kirim Undangan
                </Button>
              </form>

              {pendingInvites.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-xs">
                  {pendingInvites.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        {inv.email} · {ROLE_LABELS[inv.role]} · menunggu
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Batalkan undangan ${inv.email}`}
                        onClick={() => run(() => revokeInvitation(inv.id, session), 'Undangan dibatalkan')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Anda belum tergabung di organisasi mana pun. Buat organisasi baru atau terima undangan di atas.
        </p>
      )}

      <section className={sectionClass} aria-labelledby="new-org">
        <h2 id="new-org" className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-3">
          <Building2 className="h-4 w-4 text-neutral-500" />
          Buat Organisasi Baru
        </h2>
        <form onSubmit={handleCreateOrg} className="flex flex-col sm:flex-row gap-2">
          <Input
            required
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="Nama organisasi / komunitas"
            aria-label="Nama organisasi baru"
            className="flex-1"
          />
          <Button type="submit" isLoading={busy}>
            Buat
          </Button>
        </form>
      </section>
    </div>
  );
}
