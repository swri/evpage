'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllEvents, duplicateEvent, deleteEvent, formatRupiah } from '@/lib/store';
import { getCurrentAdminSession, isSuperAdmin as checkSuperAdmin } from '@/lib/auth';
import { EventItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import {
  CalendarDays,
  PlusCircle,
  Copy,
  Trash2,
  Settings2,
  FileSpreadsheet,
  ExternalLink,
} from 'lucide-react';

export default function AdminEventsPage() {
  const { toast } = useToast();
  const session = getCurrentAdminSession();
  const currentUserId = session?.user?.id;
  const isSuperAdmin = checkSuperAdmin(session);

  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewScope, setViewScope] = useState<'mine' | 'all'>('mine');

  const loadData = async () => {
    setLoading(true);
    try {
      const evts = await getAllEvents();
      setAllEvents(evts);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const events = isSuperAdmin && viewScope === 'all'
    ? allEvents
    : allEvents.filter(
        (e) => e.created_by === currentUserId || (!e.created_by && isSuperAdmin)
      );

  const handleDuplicate = async (id: string, title: string) => {
    try {
      await duplicateEvent(id, currentUserId);
      toast({
        type: 'success',
        title: 'Event Berhasil Diduplikasi',
        message: `Salinan "${title}" telah dibuat dengan status Draft.`,
      });
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menduplikasi event';
      toast({
        type: 'error',
        message,
      });
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus event "${title}"? Seluruh data pendaftar terkait juga akan dihapus.`)) {
      return;
    }

    try {
      await deleteEvent(id);
      toast({
        type: 'info',
        message: `Event "${title}" berhasil dihapus.`,
      });
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus event';
      toast({
        type: 'error',
        message,
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
            Semua Event & Formulir
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Kelola event, buat pendaftaran baru, dan duplikasi template form.
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
                Event Saya
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

      {/* Events Table / Grid */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-neutral-200 bg-white p-5 shadow-xs animate-pulse dark:border-neutral-800 dark:bg-neutral-900"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <CalendarDays className="mx-auto h-10 w-10 text-neutral-400 mb-3" />
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Belum Ada Event
          </h3>
          <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto mb-4">
            Buat event baru dengan form kustom atau gunakan salah satu dari 3 template bawaan.
          </p>
          <Link href="/admin/events/new">
            <Button size="sm" className="text-xs">
              Mulai Buat Event
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-xs transition-all hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
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
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      /e/{evt.slug}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                    {evt.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>
                      Harga:{' '}
                      <strong className="text-neutral-800 dark:text-neutral-200">
                        {evt.price_type === 'free' ? 'Gratis' : formatRupiah(evt.price_amount)}
                      </strong>
                    </span>
                    <span>
                      Penyelenggara:{' '}
                      <strong className="text-neutral-800 dark:text-neutral-200">
                        {evt.organizer_name || 'Panitia Resmi'}
                      </strong>
                    </span>
                    <span>
                      Pendaftar:{' '}
                      <strong className="text-neutral-800 dark:text-neutral-200">
                        {evt.total_registrations || 0} / {evt.quota} slot
                      </strong>
                    </span>
                    <span>
                      Pemasukan:{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {formatRupiah(evt.total_revenue || 0)}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/events/${evt.id}/registrations`}>
                    <Button variant="default" size="sm" className="h-8 text-xs gap-1.5 shadow-2xs">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      <span>Data Pendaftar ({evt.total_registrations || 0})</span>
                    </Button>
                  </Link>

                  <Link href={`/admin/events/${evt.id}/edit`}>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" />
                      <span>Edit Form</span>
                    </Button>
                  </Link>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDuplicate(evt.id, evt.title)}
                    title="Duplikat Event"
                    className="h-8 text-xs gap-1.5 text-neutral-600 dark:text-neutral-400"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Duplikat</span>
                  </Button>

                  <Link href={`/e/${evt.slug}`} target="_blank">
                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(evt.id, evt.title)}
                    title="Hapus Event"
                    className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
