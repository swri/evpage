'use client';

import React from 'react';
import { EventItem } from '@/types';
import { remainingSlots } from '@/lib/store';
import { formatRupiah } from '@/lib/utils';

export interface RegistrationStatsData {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  waitlisted: number;
  checkedIn: number;
  revenue: number;
}

interface RegistrationStatsProps {
  stats: RegistrationStatsData;
  event: EventItem | null;
}

export function RegistrationStats({ stats, event }: RegistrationStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <div className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-[11px] font-medium text-neutral-400 uppercase">Total Pendaftar</div>
        <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
          {stats.total}
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="text-[11px] font-medium text-emerald-600 uppercase">Terverifikasi</div>
        <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mt-1">
          {stats.verified}
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="text-[11px] font-medium text-amber-600 uppercase">Menunggu</div>
        <div className="text-xl font-bold text-amber-900 dark:text-amber-100 mt-1">
          {stats.pending}
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50/40 p-3.5 dark:border-red-900 dark:bg-red-950/20">
        <div className="text-[11px] font-medium text-red-600 uppercase">Ditolak</div>
        <div className="text-xl font-bold text-red-900 dark:text-red-100 mt-1">
          {stats.rejected}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-[11px] font-medium text-neutral-400 uppercase">Hadir / Sisa Kuota</div>
        <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
          {stats.checkedIn}/{stats.verified}
        </div>
        <div className="text-[11px] text-neutral-500">
          {event && remainingSlots(event) !== null
            ? `Sisa ${remainingSlots(event)} ${event.quota_mode === 'participant' ? 'peserta' : 'slot'}`
            : 'Kuota tanpa batas'}
          {stats.waitlisted > 0 && ` · ${stats.waitlisted} antre`}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900 col-span-2 sm:col-span-1">
        <div className="text-[11px] font-medium text-neutral-400 uppercase">Pemasukan Sah</div>
        <div className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-1">
          {formatRupiah(stats.revenue)}
        </div>
      </div>
    </div>
  );
}
