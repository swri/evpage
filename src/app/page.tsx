'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAllEvents, getOrganizationSettings, formatRupiah, formatIndoDate } from '@/lib/store';
import { EventItem, OrganizationSettings } from '@/types';
import { Calendar, MapPin, Users, ArrowRight, ShieldCheck, Search, Sparkles, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';

export default function HomePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [evts, orgSettings] = await Promise.all([
          getAllEvents(),
          getOrganizationSettings()
        ]);
        setEvents(evts);
        setSettings(orgSettings);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const openEvents = events.filter(e => e.status === 'open');

  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] dark:bg-[#09090b]">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <AppLogo size="sm" subtitle={settings?.name || 'Event Platform'} />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/status"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Cek Status</span>
            </Link>

            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 shadow-xs transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Portal Admin</span>
            </Link>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        {/* Hero Section */}
        <div className="mb-8 sm:mb-12 border-b border-neutral-200 pb-6 sm:pb-10 dark:border-neutral-800">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] sm:text-xs font-medium text-neutral-600 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 mb-3 sm:mb-4">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Pendaftaran Event Resmi & Pembayaran Terverifikasi</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-4xl">
            Event & Pendaftaran Terbuka
          </h1>
          <p className="mt-2 text-xs sm:text-base text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            Pilih event di bawah untuk mengisi formulir pendaftaran, unggah bukti pembayaran, dan dapatkan konfirmasi instan melalui WhatsApp.
          </p>
        </div>

        {/* Events Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Daftar Event Tersedia ({openEvents.length})
            </h2>
            <Link
              href="/status"
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 underline underline-offset-4"
            >
              Sudah pernah daftar? Periksa status disini
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-64 sm:h-72 rounded-xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-xs animate-pulse dark:border-neutral-800 dark:bg-neutral-900"
                />
              ))}
            </div>
          ) : openEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <Users className="mx-auto h-10 w-10 text-neutral-400" />
              <h3 className="mt-4 text-base font-medium text-neutral-900 dark:text-neutral-100">
                Belum ada pendaftaran event yang dibuka
              </h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Kunjungi kembali nanti atau hubungi panitia untuk informasi selanjutnya.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              {openEvents.map((event) => {
                const isFree = event.price_type === 'free' || event.price_amount === 0;
                const remainingQuota = Math.max(0, event.quota - (event.total_registrations || 0));

                return (
                  <div
                    key={event.id}
                    className="group flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-xs transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                  >
                    <div>
                      {/* Event Cover Image */}
                      {event.cover_url && (
                        <div className="relative h-28 sm:h-44 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={event.cover_url}
                            alt={event.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                          />
                          <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
                            <Badge variant="success" className="text-[10px] px-1.5 py-0.5 sm:text-xs sm:px-2.5 sm:py-0.5">Buka</Badge>
                          </div>
                        </div>
                      )}

                      <div className="p-3 sm:p-6">
                        <h3 className="text-sm sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 line-clamp-2">
                          {event.title}
                        </h3>

                        {/* Location & Date */}
                        <div className="mt-2 sm:mt-3.5 space-y-1 sm:space-y-2 text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                          {event.starts_at && (
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                              <span className="line-clamp-1">{formatIndoDate(event.starts_at, true)}</span>
                            </div>
                          )}
                          {event.location && (
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                              <span className="line-clamp-1">{event.location}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                            <span className="line-clamp-1">
                              Sisa: <strong className="text-neutral-800 dark:text-neutral-200">{remainingQuota} slot</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer with Price & Button */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 border-t border-neutral-100 bg-neutral-50/50 p-3 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900/50">
                      <div>
                        <div className="text-[10px] sm:text-[11px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                          Biaya
                        </div>
                        <div className="text-xs sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                          {isFree ? 'Gratis' : formatRupiah(event.price_amount)}
                          {event.price_type === 'per_participant' && (
                            <span className="text-[10px] sm:text-xs font-normal text-neutral-500"> /peserta</span>
                          )}
                        </div>
                      </div>

                      <Link
                        href={`/e/${event.slug}`}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-neutral-900 px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
                      >
                        <span className="hidden sm:inline">Daftar Sekarang</span>
                        <span className="sm:hidden">Daftar</span>
                        <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-200 bg-white py-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 text-xs text-neutral-500 dark:text-neutral-400 sm:flex-row sm:px-6">
          <div>
            &copy; 2026 {settings?.name || 'EvPage'}. Sistem Pendaftaran Mandiri.
          </div>
          <div className="flex items-center gap-4">
            <Link href="/status" className="hover:underline">
              Cek Status Pendaftaran
            </Link>
            <Link href="/admin" className="hover:underline">
              Login Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
