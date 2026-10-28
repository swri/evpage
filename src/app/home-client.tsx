'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAllEvents, getOrganizationSettings, remainingSlots } from '@/lib/store';
import { formatRupiah, formatIndoDate } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { EventItem, OrganizationSettings } from '@/types';
import {
  Calendar,
  MapPin,
  Users,
  ArrowRight,
  ShieldCheck,
  Search,
  Sparkles,
  Building2,
  X,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';
import { EventBannerImage } from '@/components/ui/event-banner-image';

/**
 * Landing page. Supabase mode: open events come from the server (preloaded);
 * demo mode: they live in this browser's localStorage and load here.
 */
export function HomeClient({
  preloaded,
  initialEvents,
  initialSettings,
}: {
  preloaded: boolean;
  initialEvents: EventItem[];
  initialSettings: OrganizationSettings | null;
}) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [settings, setSettings] = useState<OrganizationSettings | null>(initialSettings);
  const [loading, setLoading] = useState(!preloaded);

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedOrganizer, setSelectedOrganizer] = useState('all');
  const [selectedPriceFilter, setSelectedPriceFilter] = useState<'all' | 'free' | 'paid'>('all');

  // Debounce search input by 300ms to avoid unnecessary load
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (preloaded) return;
    async function loadData() {
      try {
        const [evts, orgSettings] = await Promise.all([
          getAllEvents(),
          getOrganizationSettings(),
        ]);
        setEvents(evts);
        setSettings(orgSettings);
      } catch (err) {
        logger.error('home', 'Error loading data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [preloaded]);

  const openEvents = events.filter((e) => e.status === 'open');

  // Dynamically extract unique organizer names from open events
  const availableOrganizers = Array.from(
    new Set(
      openEvents
        .map((e) => e.organizer_name?.trim())
        .filter((name): name is string => Boolean(name && name.length > 0))
    )
  ).sort();

  // Filtered Events with debounced query and organizer/price filter
  const filteredEvents = openEvents.filter((event) => {
    // 1. Debounced Text Search
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase().trim();
      const titleMatch = event.title.toLowerCase().includes(q);
      const organizerMatch = (event.organizer_name || '').toLowerCase().includes(q);
      const locationMatch = (event.location || '').toLowerCase().includes(q);
      if (!titleMatch && !organizerMatch && !locationMatch) return false;
    }

    // 2. Organizer Filter
    if (selectedOrganizer !== 'all') {
      if ((event.organizer_name || '').trim() !== selectedOrganizer) {
        return false;
      }
    }

    // 3. Price Filter
    if (selectedPriceFilter === 'free') {
      if (event.price_type !== 'free' && event.price_amount > 0) return false;
    } else if (selectedPriceFilter === 'paid') {
      if (event.price_type === 'free' || event.price_amount === 0) return false;
    }

    return true;
  });

  const hasActiveFilters = Boolean(
    searchInput.trim() || selectedOrganizer !== 'all' || selectedPriceFilter !== 'all'
  );

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedQuery('');
    setSelectedOrganizer('all');
    setSelectedPriceFilter('all');
  };

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
              <span>Cek Tiket</span>
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
        <div className="mb-8 sm:mb-10 border-b border-neutral-200 pb-6 sm:pb-8 dark:border-neutral-800">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] sm:text-xs font-medium text-neutral-600 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 mb-3 sm:mb-4">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Pendaftaran Event Resmi & Pembayaran Terverifikasi</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-4xl">
            Event & Pendaftaran Terbuka
          </h1>
          <p className="mt-2 text-xs sm:text-base text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            Temukan berbagai event resmi dari ragam penyelenggara terpercaya. Pilih event untuk mengisi formulir pendaftaran dan konfirmasi instan via WhatsApp.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="mb-8 rounded-2xl border border-neutral-200/90 bg-white p-3.5 sm:p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input with Debounce */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari nama event, penyelenggara, atau lokasi..."
                className="w-full h-10 pl-9.5 pr-8 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-100 dark:focus:bg-neutral-900 dark:focus:ring-neutral-100/10 dark:focus:border-neutral-100 transition-all"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Penyelenggara Dropdown */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                <select
                  value={selectedOrganizer}
                  onChange={(e) => setSelectedOrganizer(e.target.value)}
                  className="w-full h-10 pl-8 pr-7 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs text-neutral-800 focus:bg-white focus:outline-hidden focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-200 dark:focus:bg-neutral-900 dark:focus:border-neutral-100 cursor-pointer appearance-none transition-all truncate"
                >
                  <option value="all">Semua Penyelenggara ({availableOrganizers.length})</option>
                  {availableOrganizers.map((org) => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                  ▼
                </div>
              </div>

              {/* Filter Tipe Biaya Dropdown */}
              <select
                value={selectedPriceFilter}
                onChange={(e) => setSelectedPriceFilter(e.target.value as 'all' | 'free' | 'paid')}
                className="h-10 px-3 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs text-neutral-800 focus:bg-white focus:outline-hidden focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-200 dark:focus:bg-neutral-900 dark:focus:border-neutral-100 cursor-pointer transition-all shrink-0"
              >
                <option value="all">Semua Biaya</option>
                <option value="free">Gratis</option>
                <option value="paid">Berbayar</option>
              </select>
            </div>
          </div>

          {/* Active Filter Indicators & Reset Button */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/60 text-xs text-neutral-500">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-neutral-400">Filter Aktif:</span>
                {debouncedQuery && (
                  <Badge variant="outline" className="text-[10px] gap-1 py-0.5">
                    <span>Cari: &ldquo;{debouncedQuery}&rdquo;</span>
                    <button type="button" onClick={() => setSearchInput('')}>
                      <X className="h-2.5 w-2.5 ml-0.5" />
                    </button>
                  </Badge>
                )}
                {selectedOrganizer !== 'all' && (
                  <Badge variant="outline" className="text-[10px] gap-1 py-0.5">
                    <span>Penyelenggara: {selectedOrganizer}</span>
                    <button type="button" onClick={() => setSelectedOrganizer('all')}>
                      <X className="h-2.5 w-2.5 ml-0.5" />
                    </button>
                  </Badge>
                )}
                {selectedPriceFilter !== 'all' && (
                  <Badge variant="outline" className="text-[10px] gap-1 py-0.5">
                    <span>Biaya: {selectedPriceFilter === 'free' ? 'Gratis' : 'Berbayar'}</span>
                    <button type="button" onClick={() => setSelectedPriceFilter('all')}>
                      <X className="h-2.5 w-2.5 ml-0.5" />
                    </button>
                  </Badge>
                )}
              </div>

              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 dark:text-red-400 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Atur Ulang Filter</span>
              </button>
            </div>
          )}
        </div>

        {/* Events Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <span>Daftar Event Tersedia</span>
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
                ({filteredEvents.length} dari {openEvents.length} event)
              </span>
            </h2>
            <Link
              href="/status"
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 underline underline-offset-4"
            >
              Cek Tiket / Status
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
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-10 sm:p-14 text-center dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <Search className="mx-auto h-8 w-8 text-neutral-400 mb-2" />
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Tidak ada event yang cocok
              </h3>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'Coba gunakan kata kunci pencarian lain atau klik tombol atur ulang filter di bawah.'
                  : 'Belum ada pendaftaran event yang dibuka saat ini.'}
              </p>
              {hasActiveFilters && (
                <div className="mt-4">
                  <Button size="sm" variant="outline" onClick={handleResetFilters} className="text-xs gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset Pencarian & Filter</span>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className={`grid grid-cols-2 gap-3 sm:gap-6 ${preloaded ? '' : 'animate-in fade-in slide-in-from-bottom-2'}`}>
              {filteredEvents.map((event) => {
                const isFree = event.price_type === 'free' || event.price_amount === 0;
                const remainingQuota = remainingSlots(event);

                return (
                  <div
                    key={event.id}
                    className="group flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-xs transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                  >
                    <div>
                      {/* Event Cover Image */}
                      {event.cover_url && (
                        <div className="relative h-28 sm:h-44 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                          <EventBannerImage
                            src={event.cover_url}
                            alt={event.title}
                            className="transition-transform duration-300 group-hover:scale-102"
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

                        {/* Organizer, Location & Date */}
                        <div className="mt-2 sm:mt-3.5 space-y-1 sm:space-y-2 text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                          {/* Penyelenggara (Akun Admin) */}
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                            <span className="line-clamp-1">
                              Penyelenggara:{' '}
                              <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
                                {event.organizer_name || 'Panitia Resmi'}
                              </strong>
                            </span>
                          </div>

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
                              {remainingQuota === null ? 'Kuota bebas' : <>Sisa: <strong className="text-neutral-800 dark:text-neutral-200">{remainingQuota} {event.quota_mode === 'participant' ? 'peserta' : 'slot'}</strong></>}
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
