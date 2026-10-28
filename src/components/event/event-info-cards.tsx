'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Calendar,
  CalendarPlus,
  Clock,
  Building2,
  Users,
  CreditCard,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatEventDateTime,
  formatDeadlineDateTime,
  getDeadlineCountdown,
  formatRupiah,
} from '@/lib/utils';
import { locationHref } from '@/lib/links';
import { downloadEventIcs } from '@/lib/calendar';
import { InfoCardId } from '@/lib/info-cards';
import { EventItem } from '@/types';

export interface EventInfoCardsProps {
  event: Partial<EventItem> & {
    title: string;
    organizer_name?: string;
    location?: string;
    location_url?: string | null;
    starts_at?: string;
    registration_deadline?: string;
    quota?: number;
    price_type?: EventItem['price_type'];
    price_amount?: number;
  };
  cardOrder: InfoCardId[];
  hiddenCards?: InfoCardId[];
  remainingQuota?: number | null;
  quotaUnit?: string;
  isQuotaFull?: boolean;
  joinsWaitlist?: boolean;
  previewMode?: boolean;
}

export function EventInfoCards({
  event,
  cardOrder,
  hiddenCards = [],
  remainingQuota = null,
  quotaUnit = 'peserta',
  isQuotaFull = false,
  joinsWaitlist = false,
  previewMode = false,
}: EventInfoCardsProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);

  const handleCopyAddress = () => {
    if (!event.location) return;
    navigator.clipboard.writeText(event.location);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const renderCard = (cardId: InfoCardId) => {
    if (hiddenCards.includes(cardId)) return null;

    switch (cardId) {
      case 'location': {
        if (!event.location && !previewMode) return null;
        const locationText = event.location || 'Lokasi belum ditentukan';
        const mapsUrl = locationHref(event.location, event.location_url);

        return (
          <div
            key="location"
            className="sm:col-span-2 rounded-2xl border border-neutral-200/80 bg-white/95 dark:border-neutral-800/80 dark:bg-neutral-900/80 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 shrink-0">
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Lokasi Pertandingan / Venue
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-50 leading-snug break-words">
                {locationText}
              </div>
            </div>

            {event.location && (
              <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAddress}
                  className="h-7 text-xs rounded-full gap-1.5 px-3 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-200 border-neutral-200/80 dark:border-neutral-700 cursor-pointer active:scale-95"
                >
                  {copiedAddress ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      <span>Alamat Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Salin Alamat</span>
                    </>
                  )}
                </Button>

                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-neutral-50 hover:bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-750 transition-all active:scale-95"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Buka di Maps</span>
                  </a>
                )}
              </div>
            )}
          </div>
        );
      }

      case 'time': {
        if (!event.starts_at && !previewMode) return null;
        const timeText = event.starts_at
          ? formatEventDateTime(event.starts_at)
          : 'Waktu pelaksanaan belum diatur';

        return (
          <div
            key="time"
            className="rounded-2xl border border-neutral-200/80 bg-white/95 dark:border-neutral-800/80 dark:bg-neutral-900/80 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 shrink-0">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Waktu Bermain / Jadwal
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-50 leading-snug">
                {timeText}
              </div>
            </div>

            {event.starts_at && (
              <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadEventIcs(event as EventItem)}
                  className="h-7 text-xs rounded-full gap-1.5 px-3 bg-blue-50/70 hover:bg-blue-100/80 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60 border-blue-200/60 dark:border-blue-800/60 cursor-pointer active:scale-95 w-full sm:w-auto"
                >
                  <CalendarPlus className="h-3 w-3" />
                  <span>Tambah ke Kalender (.ics)</span>
                </Button>
              </div>
            )}
          </div>
        );
      }

      case 'deadline': {
        if (!event.registration_deadline && !previewMode) return null;
        const deadlineCountdown = getDeadlineCountdown(event.registration_deadline);
        const deadlineText = event.registration_deadline
          ? formatDeadlineDateTime(event.registration_deadline)
          : 'Batas akhir pendaftaran belum ditentukan';

        return (
          <div
            key="deadline"
            className="rounded-2xl border border-neutral-200/80 bg-white/95 dark:border-neutral-800/80 dark:bg-neutral-900/80 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Batas Akhir Pendaftaran
                  </span>
                </div>

                {deadlineCountdown.label && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      deadlineCountdown.isPassed
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                        : deadlineCountdown.daysLeft <= 2
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    }`}
                  >
                    {deadlineCountdown.label}
                  </span>
                )}
              </div>

              <div className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-50 leading-snug">
                {deadlineText}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 text-[11px] text-neutral-500 dark:text-neutral-400">
              {deadlineCountdown.isPassed
                ? 'Waktu pendaftaran untuk acara ini telah ditutup.'
                : 'Pastikan mendaftar sebelum batas waktu berakhir.'}
            </div>
          </div>
        );
      }

      case 'organizer': {
        if (!event.organizer_name && !previewMode) return null;
        const name = event.organizer_name || 'Panitia Resmi';

        return (
          <div
            key="organizer"
            className="rounded-2xl border border-neutral-200/80 bg-white/95 dark:border-neutral-800/80 dark:bg-neutral-900/80 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-100 dark:border-purple-900/40 shrink-0">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Penyelenggara
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-50 leading-snug">
                {name}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 text-[11px] text-neutral-500 dark:text-neutral-400">
              Diselenggarakan resmi oleh pihak {name}
            </div>
          </div>
        );
      }

      case 'quota': {
        return (
          <div
            key="quota"
            className="rounded-2xl border border-neutral-200/80 bg-white/95 dark:border-neutral-800/80 dark:bg-neutral-900/80 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 shrink-0">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Sisa Kuota
                  </span>
                </div>

                {isQuotaFull && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    {joinsWaitlist ? 'Daftar Tunggu' : 'Penuh'}
                  </span>
                )}
              </div>

              <div className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-50 leading-snug">
                {event.quota === 0 || remainingQuota === null ? (
                  'Kuota tidak dibatasi'
                ) : (
                  <>
                    {remainingQuota} {quotaUnit}{' '}
                    <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
                      (total kapasitas {event.quota})
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 text-[11px] text-neutral-500 dark:text-neutral-400">
              {event.quota === 0 || remainingQuota === null
                ? 'Pendaftaran terbuka tanpa batas peserta.'
                : isQuotaFull
                ? joinsWaitlist
                  ? 'Kuota utama penuh, pendaftar baru masuk daftar tunggu.'
                  : 'Seluruh kuota pendaftaran telah terisi penuh.'
                : `Tersisa ${remainingQuota} slot ${quotaUnit} yang masih tersedia.`}
            </div>
          </div>
        );
      }

      case 'price': {
        const isFree = event.price_type === 'free';
        const priceText = isFree
          ? 'Gratis'
          : formatRupiah(event.price_amount || 0);

        return (
          <div
            key="price"
            className="rounded-2xl border border-neutral-200/80 bg-white/95 dark:border-neutral-800/80 dark:bg-neutral-900/80 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40 shrink-0">
                  <CreditCard className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Biaya Pendaftaran
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-50 leading-snug">
                {priceText}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 text-[11px] text-neutral-500 dark:text-neutral-400">
              {isFree
                ? 'Tidak dipungut biaya pendaftaran.'
                : event.price_type === 'per_participant'
                ? 'Biaya per satu peserta yang didaftarkan.'
                : 'Biaya per pendaftaran (satu tim / grup).'}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
      {cardOrder.map((cardId) => renderCard(cardId))}
    </div>
  );
}
