'use client';

import React, { useState, useEffect } from 'react';
import { getOrganizationSettings, updateOrganizationSettings } from '@/lib/store';
import { OrganizationSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast-context';
import { AppLogo } from '@/components/ui/app-logo';
import {
  Save,
  Building,
  CreditCard,
  QrCode,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Settings State
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [accentColor, setAccentColor] = useState('#0f172a');
  const [waNumber, setWaNumber] = useState('');
  const [bankName, setBankName] = useState('BCA');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [qrisUrl, setQrisUrl] = useState('');
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    getOrganizationSettings().then((settings) => {
      setName(settings.name);
      setLogoUrl(settings.logo_url || '');
      setAccentColor(settings.accent_color || '#0f172a');
      setWaNumber(settings.wa_number);
      setBankName(settings.payment_info.bank_name);
      setAccountNumber(settings.payment_info.account_number);
      setAccountHolder(settings.payment_info.account_holder);
      setQrisUrl(settings.payment_info.qris_url || '');
      setInstructions(settings.payment_info.instructions || '');
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateOrganizationSettings({
        name: name.trim(),
        logo_url: logoUrl.trim(),
        accent_color: accentColor,
        wa_number: waNumber.trim(),
        payment_info: {
          bank_name: bankName.trim(),
          account_number: accountNumber.trim(),
          account_holder: accountHolder.trim(),
          qris_url: qrisUrl.trim(),
          instructions: instructions.trim(),
        },
      });

      toast({
        type: 'success',
        title: 'Pengaturan Disimpan',
        message: 'Identitas organisasi dan info rekening pembayaran berhasil diperbarui!',
      });
    } catch (err: any) {
      toast({
        type: 'error',
        message: err.message || 'Gagal menyimpan pengaturan.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
            Pengaturan Organisasi & Rekening
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Kustomisasi white-label branding, nomor WhatsApp admin, dan rekening transfer manual / QRIS.
          </p>
        </div>

        <Button
          onClick={handleSave}
          isLoading={isSaving}
          className="h-9 text-xs font-semibold gap-1.5 shadow-xs"
        >
          <Save className="h-3.5 w-3.5" />
          <span>Simpan Perubahan</span>
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Brand & Organization Identity */}
        <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
          <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800 flex items-center gap-2">
            <Building className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Identitas Organisasi / Penyelenggara
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Nama Organisasi / Brand Penyelenggara
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Arena Sport & Event Center"
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Nomor WhatsApp Admin (Untuk Menerima Konfirmasi)
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  type="tel"
                  value={waNumber}
                  onChange={(e) => setWaNumber(e.target.value)}
                  placeholder="6281234567890"
                  className="pl-9 text-xs h-9"
                  required
                />
              </div>
              <span className="text-[11px] text-neutral-400">Format internasional: 628xxxxxxxx</span>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Logo Aplikasi / Organisasi
                </label>
                <button
                  type="button"
                  onClick={() => setLogoUrl('/icon.svg')}
                  className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white underline cursor-pointer"
                >
                  Gunakan Logo Resmi EVP (Hitam Putih)
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-950 p-2 text-white">
                  {logoUrl && logoUrl !== '/icon.svg' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <AppLogo size="sm" iconOnly={true} />
                  )}
                </div>

                <div className="flex-1">
                  <Input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="Contoh: /icon.svg atau https://domain.com/logo.png"
                    className="text-xs h-9"
                  />
                  <span className="text-[11px] text-neutral-400">
                    Kosongkan atau gunakan <code>/icon.svg</code> untuk menggunakan logo tema hitam-putih EVP.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Payment & Bank Transfer */}
        <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
          <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Rekening Pembayaran Bank Manual & QRIS
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Nama Bank
              </label>
              <Input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="BCA / Mandiri / BNI / BRI"
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Nomor Rekening
              </label>
              <Input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="8801239841"
                className="text-xs h-9 font-mono"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Atas Nama Pemilik Rekening
              </label>
              <Input
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="PT Arena Nusantara Mandiri"
                className="text-xs h-9"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
              URL Barcode / QRIS Pembayaran
            </label>
            <Input
              type="url"
              value={qrisUrl}
              onChange={(e) => setQrisUrl(e.target.value)}
              placeholder="https://example.com/qris.jpg"
              className="text-xs h-9"
            />
            <span className="text-[11px] text-neutral-400">
              Pendaftar dapat memindai QRIS ini di form pendaftaran untuk pembayaran cepat.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
              Instruksi Tambahan Pembayaran
            </label>
            <Textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Transfer sesuai total nominal ke rekening di atas atau scan QRIS. Harap simpan dan upload struk transfer."
              className="text-xs"
            />
          </div>
        </div>

        {/* Live Preview of Payment Box */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-800/40 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Pratinjau Tampilan Rekening (Yang Dilihat Pendaftar)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 text-xs space-y-1">
              <div className="font-semibold text-neutral-700 dark:text-neutral-300">
                Transfer Bank Manual
              </div>
              <div className="text-neutral-400 mt-2">Bank:</div>
              <div className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                {bankName || 'BCA'}
              </div>
              <div className="text-neutral-400">Nomor Rekening:</div>
              <div className="font-mono font-bold text-sm text-neutral-900 dark:text-neutral-100">
                {accountNumber || '1234567890'}
              </div>
              <div className="text-neutral-400">Atas Nama:</div>
              <div className="font-medium text-neutral-800 dark:text-neutral-200">
                {accountHolder || 'Panitia'}
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 flex flex-col items-center justify-center text-center text-xs">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                Scan QRIS
              </span>
              {qrisUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrisUrl}
                  alt="QRIS Preview"
                  className="h-24 w-24 object-contain rounded border border-neutral-200 dark:border-neutral-700 p-1"
                />
              ) : (
                <div className="h-24 w-24 rounded border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 text-[11px]">
                  QRIS Panitia
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <Button type="submit" isLoading={isSaving} className="text-xs font-semibold h-10 px-6">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            <span>Simpan Semua Pengaturan</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
