'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { checkStatus, getOrganizationSettings } from '@/lib/store';
import { formatRupiah, formatIndoDate, formatTicketCode, formatEventDateTime } from '@/lib/utils';
import { downloadTicketImage } from '@/lib/ticket-canvas';
import { logger } from '@/lib/logger';
import { RegistrationStatusResult, OrganizationSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';
import {
  Search,
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  MessageSquare,
  ShieldAlert,
  Printer,
  Download,
} from 'lucide-react';
import QRCode from 'qrcode';

function StatusContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const initialPhone = searchParams.get('phone') || '';

  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState(initialPhone);
  const [result, setResult] = useState<RegistrationStatusResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);

  const handleSearch = useCallback(async (targetCode: string, targetPhone: string) => {
    if (!targetCode.trim() || !targetPhone.trim()) return;

    setLoading(true);
    setSearched(true);
    setErrorMessage(null);
    try {
      const res = await checkStatus(targetCode, targetPhone);
      setResult(res);
    } catch (err: unknown) {
      logger.error('status', 'Error checking status:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memeriksa status pendaftaran';
      setErrorMessage(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getOrganizationSettings().then((settings) => {
      if (!cancelled) setOrgSettings(settings);
    });
    if (initialCode && initialPhone) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          void handleSearch(initialCode, initialPhone);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [initialCode, initialPhone, handleSearch]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(code, phone);
  };

  const rawWa = orgSettings?.wa_number?.trim();
  const cleanWa = rawWa ? rawWa.replace(/[^0-9]/g, '') : '';
  const waContactUrl = cleanWa
    ? `https://wa.me/${cleanWa}?text=${encodeURIComponent(
        `Halo Panitia, saya ingin menanyakan status pendaftaran dengan Kode: ${code || '-'}`
      )}`
    : null;

  return (
    <div className="space-y-6">
      {/* Search Box */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          Masukkan Informasi Tiket Anda
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          Demi keamanan data, masukkan kombinasi Kode Pendaftaran dan Nomor WhatsApp yang digunakan saat mendaftar.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="reg_code"
              className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
            >
              Kode Pendaftaran
            </label>
            <Input
              id="reg_code"
              type="text"
              placeholder="Contoh: MSC-2026-0001"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mt-1 font-mono uppercase"
              required
            />
          </div>

          <div>
            <label
              htmlFor="reg_phone"
              className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
            >
              Nomor WhatsApp
            </label>
            <Input
              id="reg_phone"
              type="tel"
              inputMode="tel"
              placeholder="08xxxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          <Button type="submit" isLoading={loading} className="w-full text-xs font-semibold h-10">
            <Search className="h-3.5 w-3.5 mr-1" />
            <span>Periksa Status Pendaftaran</span>
          </Button>
        </form>
      </div>

      {/* RESULT SECTION */}
      {searched && (
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
          {result ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
                <div>
                  <div className="text-xs text-neutral-500">Kode Pendaftaran</div>
                  <div className="font-mono text-lg font-bold text-neutral-900 dark:text-neutral-100">
                    {formatTicketCode(result.code)}
                  </div>
                </div>

                <div>
                  {result.status === 'verified' && (
                    <Badge variant="success" className="px-3 py-1 text-xs gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Terverifikasi
                    </Badge>
                  )}
                  {result.status === 'pending' && (
                    <Badge variant="warning" className="px-3 py-1 text-xs gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Menunggu Verifikasi
                    </Badge>
                  )}
                  {result.status === 'waitlisted' && (
                    <Badge variant="info" className="px-3 py-1 text-xs gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Daftar Tunggu
                    </Badge>
                  )}
                  {result.status === 'rejected' && (
                    <Badge variant="destructive" className="px-3 py-1 text-xs gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      Ditolak
                    </Badge>
                  )}
                </div>
              </div>

              {/* Status details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-neutral-500">Event:</span>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {result.event_title}
                  </p>
                </div>
                {result.organizer_name && (
                  <div>
                    <span className="text-neutral-500">Penyelenggara:</span>
                    <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {result.organizer_name}
                    </p>
                  </div>
                )}
                {result.event_location && (
                  <div className="sm:col-span-2">
                    <span className="text-neutral-500">Lokasi Pertandingan:</span>
                    <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5 break-words">
                      {result.event_location}
                    </p>
                  </div>
                )}
                {result.event_starts_at && (
                  <div>
                    <span className="text-neutral-500">Waktu Bermain:</span>
                    <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {formatEventDateTime(result.event_starts_at)}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-neutral-500">Nama Kontak:</span>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {result.contact_name}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-500">Total Biaya:</span>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {result.total_amount === 0 ? 'Gratis' : formatRupiah(result.total_amount)}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-500">Waktu Mendaftar:</span>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {formatIndoDate(result.created_at, true)}
                  </p>
                </div>
              </div>

              {/* Status Notice for non-verified registrations */}
              {result.status === 'pending' && (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <div className="font-semibold mb-1 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span>Status: Menunggu Verifikasi Panitia</span>
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    Pembayaran dan berkas pendaftaran Anda sedang ditinjau oleh panitia. E-Tiket resmi dengan kode QR masuk akan otomatis aktif di halaman ini setelah verifikasi disetujui.
                  </p>
                </div>
              )}

              {result.status === 'waitlisted' && (
                <div className="rounded-lg border border-blue-200/80 bg-blue-50/70 p-4 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                  <div className="font-semibold mb-1 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span>Status: Terdaftar di Daftar Tunggu (Waitlist)</span>
                  </div>
                  <p className="text-blue-800 dark:text-blue-300 leading-relaxed">
                    Kuota utama acara saat ini sudah penuh. Pendaftaran Anda tercatat dalam antrean daftar tunggu. Panitia akan menghubungi Anda melalui WhatsApp apabila ada kuota yang terbuka.
                  </p>
                </div>
              )}

              {result.status === 'rejected' && (
                <div className="rounded-lg border border-red-200/80 bg-red-50/70 p-4 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  <div className="font-semibold mb-1 flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>Status: Pendaftaran Tidak Diverifikasi</span>
                  </div>
                  <p className="text-red-800 dark:text-red-300 leading-relaxed">
                    Pendaftaran Anda tidak dapat diverifikasi oleh panitia sehingga e-tiket masuk tidak dapat diterbitkan.
                  </p>
                </div>
              )}

              {/* Admin Note if Rejected or Special Instruction */}
              {result.admin_note && (
                <div
                  className={`rounded-lg p-4 text-xs ${
                    result.status === 'rejected'
                      ? 'bg-red-50 text-red-900 border border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900'
                      : 'bg-neutral-50 text-neutral-800 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <div className="font-semibold mb-1 flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Catatan dari Panitia:</span>
                  </div>
                  <div>{result.admin_note}</div>
                </div>
              )}

              {/* Digital E-Ticket & Verified Badge (strictly confirmed/verified status only) */}
              {result.status === 'verified' && (
                <DigitalTicketCard
                  registration={result}
                  phone={phone}
                  orgName={result.organizer_name || orgSettings?.name}
                />
              )}

              {/* WA Help Button / Contact Alternative */}
              <div className="pt-2">
                {waContactUrl ? (
                  <a
                    href={waContactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Ada kendala? Hubungi Panitia via WhatsApp</span>
                  </a>
                ) : (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 text-center text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
                    Ada kendala dengan pendaftaran Anda? Silakan hubungi panitia penyelenggara melalui kanal resmi acara.
                  </div>
                )}
              </div>
            </div>
          ) : errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/60 dark:bg-red-950/40">
              <ShieldAlert className="mx-auto h-8 w-8 text-red-600 dark:text-red-400 mb-2" />
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
                Pemeriksaan Dibatasi
              </h3>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300 max-w-sm mx-auto">
                {errorMessage}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center bg-white dark:border-neutral-700 dark:bg-neutral-900">
              <HelpCircle className="mx-auto h-8 w-8 text-neutral-400 mb-2" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Pendaftaran Tidak Ditemukan
              </h3>
              <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
                Pastikan kombinasi Kode Pendaftaran dan Nomor WhatsApp yang dimasukkan sama persis dengan yang Anda isi di formulir.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DigitalTicketCard({
  registration,
  phone,
  orgName,
}: {
  registration: RegistrationStatusResult;
  phone: string;
  orgName?: string;
}) {
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);

  const cleanCode = formatTicketCode(registration.code);
  // PRIVACY SAFE: QR payload contains ONLY the clean registration code or status URL with code (NO phone number!)
  const qrData =
    typeof window !== 'undefined'
      ? `${window.location.origin}/status?code=${encodeURIComponent(cleanCode)}`
      : cleanCode;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(qrData, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#171717',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrImageUrl(url);
      })
      .catch((err) => {
        logger.error('status-qr', 'Gagal membuat QR Code lokal:', err);
      });
    return () => {
      active = false;
    };
  }, [qrData]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTicket = async () => {
    setIsDownloading(true);
    try {
      await downloadTicketImage({
        type: 'ticket',
        eventTitle: registration.event_title,
        organizerName: registration.organizer_name || orgName || 'Panitia Acara',
        location: registration.event_location,
        startsAtFormatted: registration.event_starts_at ? formatEventDateTime(registration.event_starts_at) : undefined,
        contactName: registration.contact_name,
        code: cleanCode,
        statusLabel: 'TERVERIFIKASI / CONFIRMED',
        qrDataUrl: qrImageUrl,
      });
    } catch (err) {
      logger.error('status-download', 'Gagal mengunduh e-tiket:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-emerald-500/40 bg-gradient-to-b from-emerald-50/50 to-white p-5 dark:from-emerald-950/20 dark:to-neutral-900 shadow-sm space-y-4 print:border-solid print:p-6 print:m-0">
      <div className="flex items-start justify-between gap-4 border-b border-emerald-200/60 pb-3 dark:border-emerald-800/40">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {registration.organizer_name || orgName || 'E-TIKET RESMI'}
          </span>
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
            {registration.event_title || 'Kartu Peserta Resmi'}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Tunjukkan kode QR ini kepada panitia saat registrasi ulang di lokasi acara.
          </p>
        </div>
        <div className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shrink-0">
          ✓ Terverifikasi
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white border border-neutral-200 shadow-2xs dark:border-neutral-800 shrink-0 min-h-[140px] min-w-[140px]">
          {qrImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrImageUrl}
              alt={`QR Code ${cleanCode}`}
              className="h-32 w-32 object-contain"
            />
          ) : (
            <div className="h-32 w-32 flex items-center justify-center text-[10px] text-neutral-400">
              Membuat QR...
            </div>
          )}
          <span className="mt-1 font-mono text-[11px] font-bold text-neutral-800 tracking-wider">
            {cleanCode}
          </span>
        </div>

        <div className="flex-1 space-y-2.5 text-xs w-full">
          <div>
            <span className="text-neutral-500 block">Nama Peserta / Tim:</span>
            <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
              {registration.contact_name}
            </span>
          </div>

          {registration.event_location && (
            <div>
              <span className="text-neutral-500 block">Lokasi Pertandingan:</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {registration.event_location}
              </span>
            </div>
          )}

          {registration.event_starts_at && (
            <div>
              <span className="text-neutral-500 block">Waktu Bermain:</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {formatEventDateTime(registration.event_starts_at)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-neutral-500 block">WhatsApp:</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200 font-mono">
                {phone || '-'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block">Total Biaya:</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {registration.total_amount === 0 ? 'Gratis' : formatRupiah(registration.total_amount)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200/60 dark:border-neutral-800">
            <div>
              <span className="text-neutral-500 block">Tanggal Mendaftar:</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {formatIndoDate(registration.created_at)}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block">Diverifikasi:</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {registration.verified_at ? formatIndoDate(registration.verified_at) : 'Ya'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-2 flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button
          type="button"
          size="sm"
          onClick={handleDownloadTicket}
          disabled={isDownloading || !qrImageUrl}
          className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{isDownloading ? 'Menyiapkan...' : 'Unduh E-Tiket (PNG)'}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="text-xs h-8 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 cursor-pointer"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>Cetak / Simpan Tiket</span>
        </Button>
      </div>
    </div>
  );
}

export default function StatusPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] dark:bg-[#09090b]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <AppLogo size="sm" subtitle="Cek Status" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Beranda</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
            Cek Status Pendaftaran
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Periksa status verifikasi tiket dan catatan panitia secara real-time.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="h-64 rounded-xl border border-neutral-200 bg-white p-6 animate-pulse dark:border-neutral-800 dark:bg-neutral-900" />
          }
        >
          <StatusContent />
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-200 bg-white py-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-xl flex-col items-center justify-between gap-3 px-4 text-xs text-neutral-500 dark:text-neutral-400 sm:flex-row sm:px-6">
          <div>&copy; 2026 EvPage. Sistem Pendaftaran Mandiri.</div>
          <Link href="/" className="hover:underline">
            Daftar Event Lain
          </Link>
        </div>
      </footer>
    </div>
  );
}
