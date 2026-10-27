'use client';

import React from 'react';
import { EventStatus, PriceType, QuotaMode } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { listEventTypes, resolveEventType } from '@/lib/event-types';
import { formatRupiah } from '@/lib/utils';
import { DEFAULT_TEMPLATES, NOTIFICATION_KINDS, TEMPLATE_VARIABLES } from '@/lib/notifications';

interface SettingsTabProps {
  title: string;
  handleTitleChange: (val: string) => void;
  eventType: string;
  handleEventTypeChange: (val: string) => void;
  groupingEnabled: boolean;
  setGroupingEnabled: (val: boolean) => void;
  slug: string;
  setSlug: (val: string) => void;
  organizerName: string;
  setOrganizerName: (val: string) => void;
  status: EventStatus;
  setStatus: (val: EventStatus) => void;
  coverUrl: string;
  setCoverUrl: (val: string) => void;
  startsAt: string;
  setStartsAt: (val: string) => void;
  deadline: string;
  setDeadline: (val: string) => void;
  location: string;
  setLocation: (val: string) => void;
  locationUrl: string;
  setLocationUrl: (val: string) => void;
  quota: number;
  setQuota: (val: number) => void;
  quotaMode: QuotaMode;
  setQuotaMode: (val: QuotaMode) => void;
  waitlistEnabled: boolean;
  setWaitlistEnabled: (val: boolean) => void;
  priceType: PriceType;
  setPriceType: (val: PriceType) => void;
  priceAmount: number;
  setPriceAmount: (val: number) => void;
  prefixCode: string;
  setPrefixCode: (val: string) => void;
  waTemplate: string;
  setWaTemplate: (val: string) => void;
  notificationTemplates: Partial<Record<string, string>>;
  setNotificationTemplates: React.Dispatch<React.SetStateAction<Partial<Record<string, string>>>>;
  successMessage: string;
  setSuccessMessage: (val: string) => void;
}

export function SettingsTab({
  title,
  handleTitleChange,
  eventType,
  handleEventTypeChange,
  groupingEnabled,
  setGroupingEnabled,
  slug,
  setSlug,
  organizerName,
  setOrganizerName,
  status,
  setStatus,
  coverUrl,
  setCoverUrl,
  startsAt,
  setStartsAt,
  deadline,
  setDeadline,
  location,
  setLocation,
  locationUrl,
  setLocationUrl,
  quota,
  setQuota,
  quotaMode,
  setQuotaMode,
  waitlistEnabled,
  setWaitlistEnabled,
  priceType,
  setPriceType,
  priceAmount,
  setPriceAmount,
  prefixCode,
  setPrefixCode,
  waTemplate,
  setWaTemplate,
  notificationTemplates,
  setNotificationTemplates,
  successMessage,
  setSuccessMessage,
}: SettingsTabProps) {
  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-6 animate-in fade-in">
      <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          Informasi Umum & Konfigurasi Event
        </h3>
        <p className="text-xs text-neutral-500">
          Sesuaikan URL, status publik, lokasi, kuota, serta biaya registrasi.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Judul Event <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Contoh: Mandiri Mini Soccer Cup 2026"
            className="text-xs h-9"
            required
          />
        </div>

        {/* Event type module: terms, grouping rules, defaults */}
        <div>
          <label htmlFor="event-type" className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Jenis Event
          </label>
          <select
            id="event-type"
            value={eventType}
            onChange={(e) => handleEventTypeChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-800"
          >
            {listEventTypes().map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-neutral-500">{resolveEventType({ event_type: eventType }).description}</p>
          <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={groupingEnabled}
              onChange={(e) => setGroupingEnabled(e.target.checked)}
              className="rounded border-neutral-300"
            />
            Aktifkan fitur {resolveEventType({ event_type: eventType }).labels.groupingAction.toLowerCase()}
          </label>
        </div>

        {/* Slug URL */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            URL Slug (/e/[slug]) <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="mini-soccer-championship"
            className="text-xs h-9 font-mono"
            required
          />
        </div>

        {/* Organizer Name */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Penyelenggara (Nama Akun Admin / Organisasi)
          </label>
          <Input
            type="text"
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            placeholder="Contoh: Budi Santoso / Panitia Turnamen"
            className="text-xs h-9"
          />
          <span className="text-[11px] text-neutral-400">
            Ditampilkan di card event beranda utama sebagai nama akun penyelenggara.
          </span>
        </div>

        {/* Status Event */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Status Event
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus)}
            className="flex h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="open">Buka (Menerima Pendaftaran)</option>
            <option value="closed">Ditutup Sementara</option>
            <option value="archived">Diarsipkan (Selesai)</option>
          </select>
        </div>

        {/* Banner Image */}
        <div className="md:col-span-2">
          <ImageUploadField
            label="Banner / Cover Event"
            value={coverUrl}
            onChange={setCoverUrl}
            helperText="Unggah gambar landscape (rekomendasi rasio 16:9, maks 2MB, format JPG/PNG/WEBP)."
          />
        </div>

        {/* Starts At */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Waktu Pelaksanaan Event
          </label>
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="text-xs h-9"
          />
        </div>

        {/* Deadline */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Batas Akhir Pendaftaran
          </label>
          <Input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="text-xs h-9"
          />
        </div>

        {/* Location Name */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Nama Lokasi / Venue
          </label>
          <Input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Contoh: F7 Mini Soccer Arena, Cilandak"
            className="text-xs h-9"
          />
        </div>

        {/* Location URL */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Link Google Maps Lokasi
          </label>
          <Input
            type="url"
            value={locationUrl}
            onChange={(e) => setLocationUrl(e.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            className="text-xs h-9 font-mono"
          />
        </div>

        {/* Quota */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Kuota Maksimal (0 = Tanpa Batas)
          </label>
          <Input
            type="number"
            min="0"
            value={quota}
            onChange={(e) => setQuota(parseInt(e.target.value) || 0)}
            className="text-xs h-9"
          />
        </div>

        {/* Quota mode & waitlist */}
        <div className="space-y-2">
          <label htmlFor="quota-mode" className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Cara Menghitung Kuota
          </label>
          <select
            id="quota-mode"
            value={quotaMode}
            onChange={(e) => setQuotaMode(e.target.value as QuotaMode)}
            className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-800"
          >
            <option value="registration">Per Formulir / Pendaftaran (mis. 1 tim = 1 slot)</option>
            <option value="participant">Per Orang / Peserta (dihitung dari baris pemain repeater)</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={waitlistEnabled}
              onChange={(e) => setWaitlistEnabled(e.target.checked)}
              className="rounded border-neutral-300"
            />
            Buka daftar tunggu (waitlist) ketika kuota habis
          </label>
        </div>

        {/* Pricing Type */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Skema Biaya Registrasi
          </label>
          <select
            value={priceType}
            onChange={(e) => setPriceType(e.target.value as PriceType)}
            className="flex h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="free">Gratis (Rp 0)</option>
            <option value="fixed">Biaya Tetap / Form (mis. Rp 750.000 / Tim)</option>
            <option value="per_participant">Biaya Dihitung Per Orang (mis. Rp 50.000 / Peserta)</option>
          </select>
        </div>

        {/* Price Amount */}
        {priceType !== 'free' && (
          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
              Nominal Biaya (IDR)
            </label>
            <Input
              type="number"
              min="0"
              step="5000"
              value={priceAmount}
              onChange={(e) => setPriceAmount(parseInt(e.target.value) || 0)}
              className="text-xs h-9"
            />
            <span className="text-[11px] text-neutral-400">
              Format tampilan: {formatRupiah(priceAmount)}
            </span>
          </div>
        )}

        {/* Prefix Code */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Awalan Kode Tiket Pendaftar (Prefix)
          </label>
          <Input
            type="text"
            value={prefixCode}
            onChange={(e) => setPrefixCode(e.target.value.toUpperCase())}
            placeholder="MSC"
            className="text-xs h-9 uppercase font-mono"
            maxLength={6}
          />
          <span className="text-[11px] text-neutral-400">
            Contoh hasil: {prefixCode}-8X9Y2A
          </span>
        </div>

        {/* WA Template */}
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Template Pesan Konfirmasi WhatsApp
          </label>
          <Textarea
            rows={3}
            value={waTemplate}
            onChange={(e) => setWaTemplate(e.target.value)}
            className="text-xs font-mono"
          />
          <span className="text-[11px] text-neutral-400">
            Variabel otomatis yang tersedia: {'{event}'}, {'{kode}'}, {'{nama}'}, {'{total}'}, {'{bukti}'}
          </span>
        </div>

        {/* Messages organizers send to participants (lib/notifications) */}
        <div className="md:col-span-2">
          <details className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <summary className="cursor-pointer text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Template pesan ke peserta (status, daftar tunggu)
            </summary>
            <p className="mt-2 text-[11px] text-neutral-500">
              Kosongkan untuk memakai teks bawaan. Variabel: {TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(', ')}
            </p>
            <div className="mt-3 space-y-3">
              {NOTIFICATION_KINDS.filter((k) => k.kind !== 'registration_received').map(({ kind, label }) => (
                <div key={kind}>
                  <label htmlFor={`tpl-${kind}`} className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 block mb-1">
                    {label}
                  </label>
                  <Textarea
                    id={`tpl-${kind}`}
                    rows={3}
                    value={notificationTemplates[kind] ?? ''}
                    onChange={(e) => setNotificationTemplates((prev) => ({ ...prev, [kind]: e.target.value }))}
                    placeholder={DEFAULT_TEMPLATES[kind]}
                    className="text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Pesan Sukses di Halaman Konfirmasi Tiket
          </label>
          <Input
            type="text"
            value={successMessage}
            onChange={(e) => setSuccessMessage(e.target.value)}
            placeholder="Pesan yang tampil setelah pendaftar berhasil submit form"
            className="text-xs h-9"
          />
        </div>
      </div>
    </div>
  );
}
