'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { checkStatus, getOrganizationSettings, formatRupiah, formatIndoDate } from '@/lib/store';
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
  FileCheck2,
} from 'lucide-react';

function StatusContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const initialPhone = searchParams.get('phone') || '';

  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState(initialPhone);
  const [result, setResult] = useState<RegistrationStatusResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);

  useEffect(() => {
    getOrganizationSettings().then(setOrgSettings);
    if (initialCode && initialPhone) {
      handleSearch(initialCode, initialPhone);
    }
  }, [initialCode, initialPhone]);

  const handleSearch = async (targetCode: string, targetPhone: string) => {
    if (!targetCode.trim() || !targetPhone.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await checkStatus(targetCode, targetPhone);
      setResult(res);
    } catch (err) {
      console.error('Error checking status:', err);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(code, phone);
  };

  const waNumber = orgSettings?.wa_number || '6281234567890';
  const waContactUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    `Halo Panitia, saya ingin menanyakan status pendaftaran dengan Kode: ${code || '-'}`
  )}`;

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
                    {result.code}
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
                  <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {result.event_title}
                  </p>
                </div>
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

              {/* Verified Badge Details */}
              {result.status === 'verified' && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-900 dark:text-emerald-200">
                  <div className="flex items-center gap-2 font-semibold">
                    <FileCheck2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Pembayaran & Berkas Telah Diverifikasi Panitia</span>
                  </div>
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    Selamat, pendaftaran Anda telah resmi terdaftar! Simpan kode tiket ini saat menghadiri event.
                  </p>
                  {result.verified_at && (
                    <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                      Diverifikasi pada: {formatIndoDate(result.verified_at, true)}
                    </div>
                  )}
                </div>
              )}

              {/* WA Help Button */}
              <div className="pt-2">
                <a
                  href={waContactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Ada kendala? Hubungi Panitia via WhatsApp</span>
                </a>
              </div>
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
