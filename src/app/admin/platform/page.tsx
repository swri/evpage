'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarX, HardDrive, MailX, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import { useOrg } from '@/components/admin/org-context';
import {
  deleteEventWithFiles,
  deleteOrganizationWithFiles,
  findOrphanProofs,
  formatBytes,
  getPlatformOverview,
  purgeEventPaymentProofs,
  purgeExpiredInvitations,
  removeOrphanProofs,
  type OrphanProof,
  type PlatformOverview,
} from '@/lib/cleanup';
import { formatIndoDate } from '@/lib/store';
import { refreshPublicPages } from '@/lib/public-refresh';

const card = 'rounded-xl border border-neutral-200/90 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900';

/** Super-admin housekeeping: storage usage and deleting data nobody needs. */
export default function PlatformPage() {
  const { toast } = useToast();
  const { session, isPlatformAdmin, loading: orgLoading, refresh } = useOrg();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [orphans, setOrphans] = useState<OrphanProof[]>([]);
  const [busy, setBusy] = useState(false);
  const [onlyFinished, setOnlyFinished] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, orphanList] = await Promise.all([getPlatformOverview(), findOrphanProofs()]);
      setOverview(o);
      setOrphans(orphanList);
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memuat data platform' });
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isPlatformAdmin) load();
  }, [isPlatformAdmin, load]);

  const orgName = useMemo(() => {
    const map = new Map((overview?.organizations || []).map((o) => [o.id, o.name]));
    return (id?: string | null) => (id && map.get(id)) || '—';
  }, [overview]);

  const run = async (action: () => Promise<string>, confirmMessage?: string) => {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    try {
      toast({ type: 'success', message: await action() });
      await load();
      await refresh();
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Aksi gagal' });
    } finally {
      setBusy(false);
    }
  };

  if (orgLoading) return null;
  if (!isPlatformAdmin) {
    return (
      <div className="p-12 text-center text-sm text-neutral-500">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6" />
        Halaman ini khusus super admin platform.
      </div>
    );
  }
  if (!overview) {
    return <div className="h-7 w-7 mx-auto mt-20 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white" />;
  }

  const events = overview.events.filter((e) => !onlyFinished || e.finished);
  const orphanBytes = orphans.reduce((s, o) => s + o.size_bytes, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
          Pemeliharaan Platform
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
          Pantau pemakaian penyimpanan dan hapus data yang tidak dipakai lagi. Semua penghapusan permanen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <section className={card} aria-labelledby="storage-total">
          <h2 id="storage-total" className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
            <HardDrive className="h-4 w-4" /> Bukti bayar tersimpan
          </h2>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{formatBytes(overview.storage.bytes)}</p>
          <p className="text-xs text-neutral-500">{overview.storage.files} file. Bandingkan dengan batas paket di dashboard Supabase.</p>
        </section>

        <section className={card} aria-labelledby="orphans">
          <h2 id="orphans" className="text-xs font-semibold uppercase text-neutral-500">File yatim (&gt; 1 jam)</h2>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{orphans.length}</p>
          <p className="text-xs text-neutral-500">{formatBytes(orphanBytes)}, termasuk file dari event yang sudah dihapus.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={busy || orphans.length === 0}
            onClick={() => run(async () => `${(await removeOrphanProofs()).removed} file yatim dihapus`)}
          >
            Hapus semua file yatim
          </Button>
        </section>

        <section className={card} aria-labelledby="invites">
          <h2 id="invites" className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
            <MailX className="h-4 w-4" /> Undangan kedaluwarsa
          </h2>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{overview.expired_invitations}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={busy || overview.expired_invitations === 0}
            onClick={() => run(async () => `${await purgeExpiredInvitations()} undangan dihapus`)}
          >
            Hapus undangan kedaluwarsa
          </Button>
        </section>
      </div>

      <section className={card} aria-labelledby="events-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 id="events-heading" className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
            <CalendarX className="h-4 w-4 text-neutral-500" /> Event ({events.length})
          </h2>
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input type="checkbox" checked={onlyFinished} onChange={(e) => setOnlyFinished(e.target.checked)} />
            Hanya event yang sudah selesai
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Organisasi</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Pendaftar</th>
                <th className="py-2 pr-3">Bukti bayar</th>
                <th className="py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/events/${e.id}/registrations`} className="font-semibold text-neutral-900 hover:underline dark:text-neutral-100">
                      {e.title}
                    </Link>
                    <div className="text-neutral-500">{e.starts_at ? formatIndoDate(e.starts_at, false) : 'tanpa tanggal'}</div>
                  </td>
                  <td className="py-2 pr-3 text-neutral-600 dark:text-neutral-400">{orgName(e.organization_id)}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={e.finished ? 'secondary' : 'success'}>{e.finished ? 'Selesai' : e.status}</Badge>
                  </td>
                  <td className="py-2 pr-3">{e.registrations}</td>
                  <td className="py-2 pr-3">
                    {e.files} · {formatBytes(e.bytes)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || e.files === 0}
                      onClick={() =>
                        run(
                          async () => `${(await purgeEventPaymentProofs(e, session)).removed} bukti bayar dihapus`,
                          `Hapus semua bukti bayar "${e.title}"? Data pendaftar tetap ada.`
                        )
                      }
                    >
                      Bersihkan bukti
                    </Button>{' '}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Hapus event ${e.title}`}
                      disabled={busy}
                      className="text-red-600"
                      onClick={() =>
                        run(
                          async () => {
                            await deleteEventWithFiles(e.id);
                            refreshPublicPages(e.slug);
                            return `Event "${e.title}" dihapus beserta pendaftar dan filenya`;
                          },
                          `Hapus PERMANEN event "${e.title}", ${e.registrations} pendaftar, hasil undian, dan ${e.files} file?`
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card} aria-labelledby="orgs-heading">
        <h2 id="orgs-heading" className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-3">
          <Building2 className="h-4 w-4 text-neutral-500" /> Organisasi ({overview.organizations.length})
        </h2>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          {overview.organizations.map((o) => {
            const unused = o.members === 0 || o.events === 0;
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong className="text-neutral-900 dark:text-neutral-100">{o.name}</strong>{' '}
                  <span className="text-neutral-500">
                    · {o.members} anggota · {o.events} event
                  </span>{' '}
                  {unused && <Badge variant="warning">tidak terpakai</Badge>}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 gap-1"
                  disabled={busy}
                  onClick={() =>
                    run(
                      async () => {
                        await deleteOrganizationWithFiles(o.id, session);
                        return `Organisasi "${o.name}" dihapus`;
                      },
                      `Hapus PERMANEN organisasi "${o.name}" beserta ${o.events} event, semua pendaftar, dan file bukti bayarnya?`
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
