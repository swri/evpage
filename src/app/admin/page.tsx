'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllEvents, getAllRegistrations, formatRupiah, formatIndoDate } from '@/lib/store';
import { useOrg } from '@/components/admin/org-context';
import { EventItem, Registration } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  PlusCircle,
  Calendar,
  ExternalLink,
  Settings2,
  FileSpreadsheet,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const { session, activeOrg, isPlatformAdmin: isSuperAdmin } = useOrg();
  const currentUserId = session?.user?.id;

  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewScope, setViewScope] = useState<'mine' | 'all'>('mine');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [evts, regs] = await Promise.all([
          getAllEvents(),
          getAllRegistrations(),
        ]);
        setAllEvents(evts);
        setAllRegistrations(regs);
      } catch (err) {
        console.error('Failed loading dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  // Filter scoped events by organizer
  const events = isSuperAdmin && viewScope === 'all'
    ? allEvents
    : allEvents.filter((e) =>
        // Scoped to the active organization; legacy events stay with their creator
        e.organization_id ? e.organization_id === activeOrg?.id : e.created_by === currentUserId
      );

  const scopedEventIds = new Set(events.map((e) => e.id));
  const registrations = allRegistrations.filter((r) => scopedEventIds.has(r.event_id));

  // Compute Overall Statistics
  const totalRegistrations = registrations.length;
  const verifiedCount = registrations.filter((r) => r.status === 'verified').length;
  const pendingCount = registrations.filter((r) => r.status === 'pending').length;
  const totalRevenue = registrations
    .filter((r) => r.status === 'verified')
    .reduce((sum, r) => sum + (r.total_amount || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              {session?.user?.organization_name || session?.user?.full_name || 'Portal Penyelenggara'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
            Ringkasan Dashboard
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Pantau aktivitas pendaftaran, verifikasi tiket, dan pemasukan keuangan event Anda.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => setViewScope('mine')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  viewScope === 'mine'
                    ? 'bg-white shadow-2xs text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                }`}
              >
                {activeOrg?.name || 'Organisasi Ini'}
              </button>
              <button
                type="button"
                onClick={() => setViewScope('all')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  viewScope === 'all'
                    ? 'bg-white shadow-2xs text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                }`}
              >
                Semua Penyelenggara
              </button>
            </div>
          )}

          <Link href="/admin/events/new">
            <Button className="h-9 text-xs font-semibold gap-1.5 shadow-xs">
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Buat Event Baru</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Registrations */}
        <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-medium uppercase tracking-wider">Total Pendaftar</span>
            <Users className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {loading ? '...' : totalRegistrations}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            Dari seluruh {events.length} event terdaftar
          </p>
        </div>

        {/* Metric 2: Verified */}
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-5 shadow-xs dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="text-xs font-medium uppercase tracking-wider">Terverifikasi</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">
            {loading ? '...' : verifiedCount}
          </div>
          <p className="mt-1 text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
            Tiket resmi aktif dan sah
          </p>
        </div>

        {/* Metric 3: Pending */}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/30 p-5 shadow-xs dark:border-amber-950 dark:bg-amber-950/20">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
            <span className="text-xs font-medium uppercase tracking-wider">Menunggu Verifikasi</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-amber-950 dark:text-amber-100">
            {loading ? '...' : pendingCount}
          </div>
          <p className="mt-1 text-[11px] text-amber-600/80 dark:text-amber-400/80">
            Perlu dicek bukti transfernya
          </p>
        </div>

        {/* Metric 4: Revenue */}
        <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-medium uppercase tracking-wider">Total Pemasukan</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {loading ? '...' : formatRupiah(totalRevenue)}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            Dana masuk yang telah diverifikasi
          </p>
        </div>
      </div>

      {/* Events List & Management Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            Daftar Event & Progres Pendaftaran
          </h2>
          <Link
            href="/admin/events"
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Lihat Semua Event ({events.length}) &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-neutral-200 bg-white p-5 shadow-xs animate-pulse dark:border-neutral-800 dark:bg-neutral-900"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <Calendar className="mx-auto h-8 w-8 text-neutral-400 mb-2" />
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Belum ada event yang dibuat
            </h3>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto mb-4">
              Mulai buat event pertama Anda menggunakan form builder atau pilih template siap pakai.
            </p>
            <Link href="/admin/events/new">
              <Button size="sm" className="text-xs">
                Buat Event Pertama
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((evt) => {
              const regCount = evt.total_registrations || 0;
              const quotaPercentage = evt.quota > 0 ? Math.min(100, (regCount / evt.quota) * 100) : 0;

              return (
                <div
                  key={evt.id}
                  className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-xs transition-all hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Event Info */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            evt.status === 'open'
                              ? 'success'
                              : evt.status === 'draft'
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {evt.status === 'open' ? 'Buka' : evt.status === 'draft' ? 'Draft' : 'Tutup'}
                        </Badge>
                        <span className="font-mono text-xs text-neutral-400 font-semibold">
                          [{evt.prefix_code}]
                        </span>
                        <span className="text-xs text-neutral-400">
                          {evt.price_type === 'free' ? 'Gratis' : formatRupiah(evt.price_amount)}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                        {evt.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {evt.starts_at && (
                          <span>Mulai: {formatIndoDate(evt.starts_at, false)}</span>
                        )}
                        {evt.registration_deadline && (
                          <span>Deadline: {formatIndoDate(evt.registration_deadline, false)}</span>
                        )}
                        <span>
                          Pemasukan: <strong className="text-neutral-700 dark:text-neutral-300">{formatRupiah(evt.total_revenue || 0)}</strong>
                        </span>
                      </div>

                      {/* Quota Progress Bar */}
                      <div className="pt-2 max-w-md">
                        <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
                          <span>
                            Terisi: <strong>{regCount}</strong> pendaftar ({evt.verified_registrations || 0} terverifikasi)
                          </span>
                          <span>Kuota: {evt.quota}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <div
                            className={`h-full transition-all ${
                              quotaPercentage >= 100
                                ? 'bg-red-500'
                                : quotaPercentage >= 75
                                ? 'bg-amber-500'
                                : 'bg-neutral-900 dark:bg-neutral-100'
                            }`}
                            style={{ width: `${quotaPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                      <Link href={`/admin/events/${evt.id}/registrations`}>
                        <Button variant="default" size="sm" className="h-8 text-xs gap-1.5 shadow-2xs">
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          <span>Tabel Pendaftar ({regCount})</span>
                        </Button>
                      </Link>

                      <Link href={`/admin/events/${evt.id}/edit`}>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                          <Settings2 className="h-3.5 w-3.5" />
                          <span>Edit Form</span>
                        </Button>
                      </Link>

                      <Link href={`/e/${evt.slug}`} target="_blank">
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Buka Form</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
