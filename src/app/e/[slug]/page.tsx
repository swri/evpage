'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  getEventBySlug,
  getOrganizationSettings,
  createRegistration,
  formatRupiah,
  formatIndoDate,
  buildWhatsAppLink,
} from '@/lib/store';
import { EventItem, OrganizationSettings, Registration } from '@/types';
import { DynamicFormField } from '@/components/form/dynamic-form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';
import { useToast } from '@/components/ui/toast-context';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  ArrowLeft,
  CheckCircle2,
  Copy,
  MessageSquare,
  AlertTriangle,
  Upload,
  CreditCard,
  QrCode,
  FileText,
  Search,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';

function EventRegistrationContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const { slug } = resolvedParams;
  const { toast } = useToast();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [paymentProofName, setPaymentProofName] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Anti-spam Honeypot
  const [honeypot, setHoneypot] = useState('');

  // Success State
  const [createdRegistration, setCreatedRegistration] = useState<Registration | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    async function loadEventData() {
      try {
        const [evt, settings] = await Promise.all([
          getEventBySlug(slug),
          getOrganizationSettings(),
        ]);
        setEvent(evt);
        setOrgSettings(settings);

        if (evt) {
          // Initialize default answers
          const initialAnswers: Record<string, any> = {};
          evt.form_schema.forEach((field) => {
            if (field.type === 'repeater') {
              const minRows = field.validation?.min ?? 1;
              const rows = [];
              for (let i = 0; i < minRows; i++) {
                const rowObj: Record<string, any> = {};
                field.subFields?.forEach((sf) => {
                  rowObj[sf.id] = '';
                });
                rows.push(rowObj);
              }
              initialAnswers[field.id] = rows;
            } else if (field.type === 'checkbox') {
              initialAnswers[field.id] = [];
            } else {
              initialAnswers[field.id] = '';
            }
          });
          setAnswers(initialAnswers);
        }
      } catch (err) {
        console.error('Error loading event:', err);
      } finally {
        setLoading(false);
      }
    }
    loadEventData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf9] dark:bg-[#09090b]">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white mx-auto" />
          <p className="text-sm text-neutral-500">Memuat formulir pendaftaran...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#fafaf9] dark:bg-[#09090b] text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-3" />
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Event Tidak Ditemukan
        </h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-md">
          Tautan pendaftaran mungkin salah, telah kedaluwarsa, atau event telah dihapus oleh panitia.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Halaman Utama</span>
        </Link>
      </div>
    );
  }

  const isClosed = event.status === 'closed';
  const isDeadlinePassed =
    event.registration_deadline && new Date(event.registration_deadline) < new Date();
  const currentCount = event.total_registrations || 0;
  const isQuotaFull = event.quota > 0 && currentCount >= event.quota;
  const remainingQuota = Math.max(0, event.quota - currentCount);

  // Calculate Total Cost
  let totalCost = event.price_amount;
  if (event.price_type === 'free') {
    totalCost = 0;
  } else if (event.price_type === 'per_participant') {
    const repeaterField = event.form_schema.find((f) => f.type === 'repeater');
    if (repeaterField && Array.isArray(answers[repeaterField.id])) {
      totalCost = event.price_amount * Math.max(1, answers[repeaterField.id].length);
    }
  }

  // Handle Proof Upload
  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        type: 'error',
        title: 'Ukuran Terlalu Besar',
        message: 'Ukuran bukti pembayaran maksimal 5 MB.',
      });
      return;
    }

    setPaymentProofName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPaymentProof(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Client Validation
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Primary Contact Validation
    const nameLbl = event.contact_config?.name_label || 'Nama kontak';
    const phoneLbl = event.contact_config?.phone_label || 'Nomor WhatsApp';
    const emailLbl = event.contact_config?.email_label || 'Email';
    const isEmailReq = event.contact_config?.email_required ?? true;

    if (!contactName.trim()) {
      newErrors['contact_name'] = `${nameLbl} wajib diisi.`;
    }
    if (!contactPhone.trim()) {
      newErrors['contact_phone'] = `${phoneLbl} wajib diisi.`;
    } else if (!/^[0-9+\-\s]{8,16}$/.test(contactPhone.trim())) {
      newErrors['contact_phone'] = `Format ${phoneLbl} tidak valid.`;
    }
    if (isEmailReq && !contactEmail.trim()) {
      newErrors['contact_email'] = `${emailLbl} wajib diisi.`;
    } else if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      newErrors['contact_email'] = `Format ${emailLbl} tidak valid.`;
    }

    // Dynamic Fields Validation
    event.form_schema.forEach((field) => {
      const val = answers[field.id];
      const isReq = field.validation?.required;

      if (field.type === 'repeater') {
        const rows = Array.isArray(val) ? val : [];
        const min = field.validation?.min ?? 1;
        if (rows.length < min) {
          newErrors[field.id] = `Minimal harus mengisi ${min} ${field.label}.`;
        }
        // Check required subfields
        rows.forEach((row, rIdx) => {
          field.subFields?.forEach((sf) => {
            if (sf.validation?.required && (!row[sf.id] || String(row[sf.id]).trim() === '')) {
              newErrors[`${field.id}_${rIdx}_${sf.id}`] = `${sf.label} baris #${rIdx + 1} wajib diisi.`;
            }
          });
        });
      } else if (field.type === 'checkbox') {
        if (isReq && (!Array.isArray(val) || val.length === 0)) {
          newErrors[field.id] = `${field.label} wajib dicentang.`;
        }
      } else if (isReq && (val === undefined || val === null || String(val).trim() === '')) {
        newErrors[field.id] = `${field.label} wajib diisi.`;
      }
    });

    // Payment proof validation if not free
    if (totalCost > 0 && !paymentProof) {
      newErrors['payment_proof'] = 'Harap unggah bukti pembayaran transfer / QRIS.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check honeypot anti-spam
    if (honeypot) {
      console.warn('Spam submission detected by honeypot');
      return;
    }

    if (!validateForm()) {
      toast({
        type: 'error',
        title: 'Formulir Belum Lengkap',
        message: 'Mohon periksa kembali isian formulir yang ditandai merah.',
      });
      // Scroll to first error
      const firstErrorKey = Object.keys(errors)[0];
      const errorElement = document.getElementById(firstErrorKey);
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const newRegistration = await createRegistration({
        event_id: event.id,
        answers,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim(),
        payment_proof_path: paymentProof || undefined,
        total_amount: totalCost,
      });

      setCreatedRegistration(newRegistration);

      // Trigger Confetti Celebration
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      toast({
        type: 'success',
        title: 'Pendaftaran Berhasil!',
        message: `Kode Anda: ${newRegistration.code}. Silakan konfirmasi via WhatsApp.`,
      });

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      toast({
        type: 'error',
        title: 'Pendaftaran Gagal',
        message: err.message || 'Terjadi kesalahan sistem saat menyimpan pendaftaran.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // WhatsApp Link for Confirmation
  const waAdminPhone = orgSettings?.wa_number || '6281234567890';
  const waLink = createdRegistration
    ? buildWhatsAppLink(waAdminPhone, event.wa_template, {
        event: event.title,
        kode: createdRegistration.code,
        nama: createdRegistration.contact_name,
        total: formatRupiah(createdRegistration.total_amount),
        bukti: paymentProofName ? `Bukti terlampir (${paymentProofName})` : 'Bukti terunggah di sistem',
      })
    : '#';

  // Copy registration code
  const handleCopyCode = () => {
    if (!createdRegistration) return;
    navigator.clipboard.writeText(createdRegistration.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast({
      type: 'info',
      message: 'Kode pendaftaran berhasil disalin ke clipboard!',
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] dark:bg-[#09090b]">
      {/* Header with Monochrome EVP Logo */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <AppLogo size="sm" subtitle={orgSettings?.name || 'Event Platform'} />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/status"
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
            >
              Cek Status
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {/* SUCCESS VIEW */}
        {createdRegistration ? (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Success Card */}
            <div className="rounded-2xl border border-emerald-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-emerald-900/80 dark:bg-neutral-900">
              <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-8 w-8 shrink-0" />
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                    Pendaftaran Berhasil Dikirim!
                  </h1>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Data Anda telah tersimpan secara resmi di sistem kami.
                  </p>
                </div>
              </div>

              {/* Code Box */}
              <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50/70 p-5 dark:border-neutral-800 dark:bg-neutral-800/40">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Kode Pendaftaran Unik Anda
                </div>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <div className="font-mono text-2xl font-extrabold tracking-wider text-neutral-900 dark:text-neutral-50">
                    {createdRegistration.code}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copiedCode ? 'Tersalin!' : 'Salin Kode'}</span>
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="warning">Menunggu Verifikasi</Badge>
                  <span className="text-xs text-neutral-500">
                    Panitia akan memeriksa pembayaran & berkas Anda
                  </span>
                </div>
              </div>

              {/* Success Message from Admin */}
              <div className="mt-6 rounded-lg bg-neutral-100/80 p-4 text-sm text-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300">
                {event.success_message}
              </div>

              {/* WhatsApp Action Button */}
              <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
                <div className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                  Langkah Terakhir: Klik tombol di bawah untuk mengirim konfirmasi dan bukti bayar langsung ke WhatsApp Panitia:
                </div>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 active:scale-[0.99] transition-all"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Konfirmasi via WhatsApp Panitia</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                </a>
              </div>

              {/* Registration Summary */}
              <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                  Ringkasan Data Pendaftaran
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
                  <div>
                    <dt className="text-neutral-500">Event</dt>
                    <dd className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {event.title}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Total Biaya</dt>
                    <dd className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {totalCost === 0 ? 'Gratis' : formatRupiah(createdRegistration.total_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Nama Kontak</dt>
                    <dd className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {createdRegistration.contact_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Nomor WhatsApp</dt>
                    <dd className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {createdRegistration.contact_phone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Email</dt>
                    <dd className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {createdRegistration.contact_email}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Waktu Mendaftar</dt>
                    <dd className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {formatIndoDate(createdRegistration.created_at, true)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Navigation Actions */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
                <Link
                  href={`/status?code=${createdRegistration.code}&phone=${encodeURIComponent(createdRegistration.contact_phone)}`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Pantau Status di Halaman Cek Status</span>
                </Link>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreatedRegistration(null);
                    window.location.reload();
                  }}
                  className="text-xs text-neutral-500"
                >
                  Daftarkan Peserta / Tim Lain
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* REGISTRATION FORM VIEW */
          <div className="space-y-8">
            {/* Cover Banner */}
            {event.cover_url && (
              <div className="h-48 sm:h-64 w-full overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-800 shadow-sm border border-neutral-200/80 dark:border-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.cover_url}
                  alt={event.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {/* Event Header Information */}
            <div className="border-b border-neutral-200 pb-6 dark:border-neutral-800">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant={isClosed || isDeadlinePassed || isQuotaFull ? 'destructive' : 'success'}>
                  {isClosed
                    ? 'Pendaftaran Ditutup'
                    : isDeadlinePassed
                    ? 'Batas Waktu Berakhir'
                    : isQuotaFull
                    ? 'Kuota Penuh'
                    : 'Pendaftaran Terbuka'}
                </Badge>
                {event.price_type === 'free' ? (
                  <Badge variant="secondary">Gratis</Badge>
                ) : (
                  <Badge variant="outline">{formatRupiah(event.price_amount)}</Badge>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
                {event.title}
              </h1>

              {/* Event Metadata (Date, Location, Quota) */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                {event.starts_at && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-neutral-500 shrink-0" />
                    <span>{formatIndoDate(event.starts_at, true)}</span>
                  </div>
                )}
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-neutral-500 shrink-0" />
                    <span className="line-clamp-1">{event.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-neutral-500 shrink-0" />
                  <span>
                    Sisa Kuota: <strong>{remainingQuota}</strong> slot (total {event.quota})
                  </span>
                </div>
                {event.registration_deadline && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-neutral-500 shrink-0" />
                    <span>Batas Akhir: {formatIndoDate(event.registration_deadline, true)}</span>
                  </div>
                )}
              </div>

              {/* Description (Markdown-like formatting) */}
              {event.description && (
                <div className="mt-6 prose prose-neutral dark:prose-invert max-w-none text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line leading-relaxed bg-neutral-50/60 dark:bg-neutral-900/60 p-4 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
                  {event.description}
                </div>
              )}
            </div>

            {/* CLOSED STATE ALERT */}
            {(isClosed || isDeadlinePassed || isQuotaFull) ? (
              <div className="rounded-xl border border-red-200 bg-red-50/80 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
                <AlertTriangle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
                <h3 className="mt-3 text-lg font-bold text-red-900 dark:text-red-200">
                  Pendaftaran Telah Ditutup
                </h3>
                <p className="mt-1 text-xs text-red-700 dark:text-red-300 max-w-md mx-auto">
                  {isQuotaFull
                    ? 'Mohon maaf, kuota peserta untuk event ini sudah terpenuhi.'
                    : isDeadlinePassed
                    ? 'Batas waktu pendaftaran untuk event ini telah berakhir.'
                    : 'Pendaftaran event ini sedang dinonaktifkan oleh pihak penyelenggara.'}
                </p>
                <div className="mt-5">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Lihat Event Lainnya</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* REGISTRATION FORM */
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Anti-spam Honeypot (hidden from normal users) */}
                <div className="sr-only" aria-hidden="true">
                  <label htmlFor="website_url">Do not fill this</label>
                  <input
                    id="website_url"
                    type="text"
                    name="website_url"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {/* Section 1: Contact Information */}
                <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="mb-4 border-b border-neutral-200 pb-3 dark:border-neutral-800">
                    <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                      {event.contact_config?.title || '1. Informasi Kontak Penanggung Jawab'}
                    </h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {event.contact_config?.description ||
                        'Digunakan untuk verifikasi, konfirmasi WhatsApp, dan pengecekan status tiket.'}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="contact_name" className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                        {event.contact_config?.name_label || 'Nama Lengkap'} <span className="text-red-500 font-semibold">*</span>
                      </label>
                      <Input
                        id="contact_name"
                        type="text"
                        autoComplete="name"
                        placeholder={event.contact_config?.name_placeholder || 'Contoh: Budi Pratama'}
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="mt-1"
                      />
                      {errors.contact_name && (
                        <p className="text-xs text-red-600 mt-1">{errors.contact_name}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="contact_phone" className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                          {event.contact_config?.phone_label || 'Nomor WhatsApp'} <span className="text-red-500 font-semibold">*</span>
                        </label>
                        <Input
                          id="contact_phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder={event.contact_config?.phone_placeholder || '0812xxxxxxxx'}
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          className="mt-1"
                        />
                        <p className="text-[11px] text-neutral-400 mt-1">
                          {event.contact_config?.phone_helper || 'Nomor ini juga digunakan untuk login cek status.'}
                        </p>
                        {errors.contact_phone && (
                          <p className="text-xs text-red-600 mt-1">{errors.contact_phone}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="contact_email" className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                          {event.contact_config?.email_label || 'Email Aktif'}{' '}
                          {(event.contact_config?.email_required ?? true) && (
                            <span className="text-red-500 font-semibold">*</span>
                          )}
                        </label>
                        <Input
                          id="contact_email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder={event.contact_config?.email_placeholder || 'nama@email.com'}
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="mt-1"
                        />
                        {errors.contact_email && (
                          <p className="text-xs text-red-600 mt-1">{errors.contact_email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Custom Dynamic Fields */}
                {event.form_schema.length > 0 && (
                  <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mb-4 border-b border-neutral-200 pb-3 dark:border-neutral-800">
                      <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                        2. Formulir Data Pendaftaran
                      </h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Lengkapi seluruh informasi data peserta di bawah ini.
                      </p>
                    </div>

                    <div className="space-y-6">
                      {event.form_schema.map((field) => (
                        <DynamicFormField
                          key={field.id}
                          field={field}
                          value={answers[field.id]}
                          onChange={(val) => {
                            setAnswers((prev) => ({
                              ...prev,
                              [field.id]: val,
                            }));
                          }}
                          error={errors[field.id]}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 3: Payment Section (if not free) */}
                {event.price_type !== 'free' && (
                  <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mb-4 border-b border-neutral-200 pb-3 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                            3. Rincian Biaya & Pembayaran
                          </h2>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Silakan transfer sesuai nominal dan unggah struk bukti transfer.
                          </p>
                        </div>
                        <CreditCard className="h-5 w-5 text-neutral-400" />
                      </div>
                    </div>

                    {/* Total Cost Display Box */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                          Total Yang Harus Dibayar
                        </span>
                        <span className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-neutral-100">
                          {formatRupiah(totalCost)}
                        </span>
                      </div>
                      {event.price_type === 'per_participant' && (
                        <p className="text-[11px] text-neutral-500 mt-1 text-right">
                          Dihitung berdasarkan jumlah peserta yang didaftarkan ({formatRupiah(event.price_amount)} /peserta)
                        </p>
                      )}
                    </div>

                    {/* Payment Instruction & Bank / QRIS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {/* Bank Transfer Info */}
                      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                          <CreditCard className="h-4 w-4" />
                          <span>Transfer Bank Manual</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="text-neutral-500">Bank:</div>
                          <div className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                            {orgSettings?.payment_info.bank_name || 'BCA'}
                          </div>
                          <div className="text-neutral-500 mt-2">Nomor Rekening:</div>
                          <div className="font-mono font-bold text-sm text-neutral-900 dark:text-neutral-100">
                            {orgSettings?.payment_info.account_number || '1234567890'}
                          </div>
                          <div className="text-neutral-500 mt-2">Atas Nama:</div>
                          <div className="font-medium text-neutral-800 dark:text-neutral-200">
                            {orgSettings?.payment_info.account_holder || 'Panitia Event'}
                          </div>
                        </div>
                      </div>

                      {/* QRIS Info */}
                      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                          <QrCode className="h-4 w-4" />
                          <span>Scan QRIS Instan</span>
                        </div>
                        {orgSettings?.payment_info.qris_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={orgSettings.payment_info.qris_url}
                            alt="QRIS Pembayaran"
                            className="h-32 w-32 rounded-lg border border-neutral-200 dark:border-neutral-700 object-contain p-1 bg-white"
                          />
                        ) : (
                          <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">
                            QRIS Panitia
                          </div>
                        )}
                        <span className="text-[11px] text-neutral-500 mt-2">
                          Mendukung GoPay, OVO, Dana, ShopeePay, BCA, dll.
                        </span>
                      </div>
                    </div>

                    {/* Upload Bukti Pembayaran */}
                    <div className="space-y-2" id="payment_proof">
                      <label className="block text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        Unggah Bukti Transfer / Resi <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Format JPG, PNG, atau PDF (maks. 5 MB).
                      </p>

                      <div className="mt-2 flex items-center gap-3">
                        <label className="relative inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 cursor-pointer dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 transition-colors">
                          <Upload className="h-4 w-4" />
                          <span>{paymentProof ? 'Ganti Bukti' : 'Pilih Berkas Bukti'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={handleProofUpload}
                            className="sr-only"
                          />
                        </label>
                        {paymentProof && (
                          <span className="text-xs text-emerald-600 font-medium dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Berkas siap diunggah
                          </span>
                        )}
                      </div>

                      {errors.payment_proof && (
                        <p className="text-xs text-red-600 mt-1">{errors.payment_proof}</p>
                      )}

                      {/* Preview Box */}
                      {paymentProof && (
                        <div className="mt-3 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/50">
                          {paymentProof.startsWith('data:image/') ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={paymentProof}
                              alt="Preview Bukti"
                              className="h-16 w-16 rounded object-cover border border-neutral-200 dark:border-neutral-700"
                            />
                          ) : (
                            <FileText className="h-12 w-12 text-neutral-500" />
                          )}
                          <div>
                            <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                              {paymentProofName || 'Bukti Pembayaran'}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              Pratinjau bukti bayar berhasil dimuat
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    size="lg"
                    isLoading={isSubmitting}
                    className="w-full text-base font-semibold py-6 shadow-md"
                  >
                    Kirim Pendaftaran & Dapatkan Kode Tiket
                  </Button>
                  <p className="text-center text-xs text-neutral-400 mt-3">
                    Dengan mendaftar, Anda menyetujui seluruh ketentuan & regulasi yang berlaku pada event ini.
                  </p>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-200 bg-white py-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-4 text-xs text-neutral-500 dark:text-neutral-400 sm:flex-row sm:px-6">
          <div>
            &copy; 2026 {orgSettings?.name || 'EvPage'}. Sistem Pendaftaran Mandiri.
          </div>
          <div className="flex items-center gap-4">
            <Link href="/status" className="hover:underline">
              Cek Status
            </Link>
            <Link href="/" className="hover:underline">
              Semua Event
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function EventRegistrationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#fafaf9] dark:bg-[#09090b]">
          <div className="space-y-4 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white mx-auto" />
            <p className="text-sm text-neutral-500">Memuat formulir pendaftaran...</p>
          </div>
        </div>
      }
    >
      <EventRegistrationContent params={params} />
    </React.Suspense>
  );
}
