'use client';

import React from 'react';
import { EventStatus, PriceType, QuotaMode } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { listEventTypes, resolveEventType } from '@/lib/event-types';
import { formatRupiah } from '@/lib/utils';
import { DEFAULT_TEMPLATES, NOTIFICATION_KINDS, TEMPLATE_VARIABLES } from '@/lib/notifications';
import { Building2, User, PenLine } from 'lucide-react';

interface SettingsTabProps {
  title: string;
  handleTitleChange: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  eventType: string;
  handleEventTypeChange: (val: string) => void;
  groupingEnabled: boolean;
  setGroupingEnabled: (val: boolean) => void;
  slug: string;
  setSlug: (val: string) => void;
  organizerName: string;
  setOrganizerName: (val: string) => void;
  orgName?: string;
  userName?: string;
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
  description,
  setDescription,
  eventType,
  handleEventTypeChange,
  groupingEnabled,
  setGroupingEnabled,
  slug,
  setSlug,
  organizerName,
  setOrganizerName,
  orgName,
  userName,
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
  const orgNameClean = orgName?.trim() || '';
  const userNameClean = userName?.trim() || '';
  const currentClean = organizerName.trim();
  const isOrgActive = Boolean(orgNameClean && currentClean === orgNameClean);
  const isUserActive = Boolean(userNameClean && currentClean === userNameClean);
  const isCustomActive = !isOrgActive && !isUserActive;
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

        {/* Description / Deskripsi Event */}
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Deskripsi Event (Informasi Acara / Teks Panjang)
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tuliskan detail jadwal, dresscode, tata tertib, hadiah, link WhatsApp grup/maps, atau pesan sambutan peserta..."
            rows={6}
            className="text-xs leading-relaxed"
          />
          <span className="text-[11px] text-neutral-400 mt-1 block">
            Ditampilkan di card utama halaman pendaftaran publik. Teks mendukung banyak baris (paragraf) dan link (https://...) otomatis dapat diklik.
          </span>
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

        {/* Organizer Name Configuration */}
        <div className="md:col-span-2 space-y-3 rounded-xl border border-neutral-200/90 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                Penyelenggara Event
              </label>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block mt-0.5">
                Pilih identitas yang akan ditampilkan sebagai Penyelenggara di card event beranda dan halaman pendaftaran.
              </span>
            </div>
            {/* Live Card Preview Badge */}
            <div className="inline-flex items-center gap-1.5 text-[11px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 rounded-md shadow-2xs text-neutral-700 dark:text-neutral-300">
              <span className="text-neutral-400">Tampil di Card:</span>
              <strong className="font-semibold text-neutral-900 dark:text-neutral-100">
                {organizerName.trim() || 'Panitia Resmi'}
              </strong>
            </div>
          </div>

          {/* Quick Option Cards (Organisasi vs Nama User vs Kustom) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Opsi 1: Nama Organisasi */}
            <button
              type="button"
              onClick={() => {
                if (orgNameClean) setOrganizerName(orgNameClean);
              }}
              disabled={!orgNameClean}
              className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                isOrgActive
                  ? 'border-neutral-900 bg-white ring-1 ring-neutral-900 shadow-xs dark:border-neutral-100 dark:bg-neutral-800 dark:ring-neutral-100'
                  : 'border-neutral-200 bg-white/70 hover:bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800'
              } ${!orgNameClean ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-neutral-500" />
                  Nama Organisasi
                </span>
                {isOrgActive && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-950" />
                )}
              </div>
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate w-full">
                {orgNameClean || '(Belum ada organisasi)'}
              </span>
              <span className="text-[10px] text-neutral-400 mt-0.5">
                Rekomendasi untuk event resmi
              </span>
            </button>

            {/* Opsi 2: Nama User / Akun Admin */}
            <button
              type="button"
              onClick={() => {
                if (userNameClean) setOrganizerName(userNameClean);
              }}
              disabled={!userNameClean}
              className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                isUserActive
                  ? 'border-neutral-900 bg-white ring-1 ring-neutral-900 shadow-xs dark:border-neutral-100 dark:bg-neutral-800 dark:ring-neutral-100'
                  : 'border-neutral-200 bg-white/70 hover:bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800'
              } ${!userNameClean ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-neutral-500" />
                  Nama Akun Admin
                </span>
                {isUserActive && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-950" />
                )}
              </div>
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate w-full">
                {userNameClean || '(Nama akun Anda)'}
              </span>
              <span className="text-[10px] text-neutral-400 mt-0.5">
                Nama profil admin pembuat
              </span>
            </button>

            {/* Opsi 3: Kustom / Manual */}
            <button
              type="button"
              onClick={() => {
                // Focus custom input or leave current value
              }}
              className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
                isCustomActive
                  ? 'border-neutral-900 bg-white ring-1 ring-neutral-900 shadow-xs dark:border-neutral-100 dark:bg-neutral-800 dark:ring-neutral-100'
                  : 'border-neutral-200 bg-white/70 hover:bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  <PenLine className="h-3.5 w-3.5 text-neutral-500" />
                  Kustom / Manual
                </span>
                {isCustomActive && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-950" />
                )}
              </div>
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate w-full">
                {isCustomActive ? organizerName || 'Kustom' : 'Ketik nama bebas...'}
              </span>
              <span className="text-[10px] text-neutral-400 mt-0.5">
                Nama kustom atau kolaborasi
              </span>
            </button>
          </div>

          {/* Editable Input Field */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                Teks Penyelenggara yang Digunakan:
              </label>
              <div className="flex items-center gap-1.5">
                {isOrgActive && (
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md font-medium">
                    🏢 Menggunakan Nama Organisasi
                  </span>
                )}
                {isUserActive && (
                  <span className="text-[10px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md font-medium">
                    👤 Menggunakan Nama Akun Anda
                  </span>
                )}
                {isCustomActive && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md font-medium">
                    ✏️ Menggunakan Teks Kustom
                  </span>
                )}
              </div>
            </div>
            <Input
              type="text"
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
              placeholder="Contoh: TI DDS / Panitia Turnamen"
              className="text-xs h-9 bg-white dark:bg-neutral-900"
            />
          </div>
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
            Waktu Pelaksanaan Event (WIB)
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
            Batas Akhir Pendaftaran (WIB)
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
