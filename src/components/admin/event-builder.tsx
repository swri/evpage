'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FormField,
  FieldType,
  EventItem,
  PriceType,
  EventStatus,
  QuotaMode,
} from '@/types';
import { BUILT_IN_TEMPLATES } from '@/lib/data-service';
import { listEventTypes, resolveEventType } from '@/lib/event-types';
import { DEFAULT_TEMPLATES, NOTIFICATION_KINDS, TEMPLATE_VARIABLES } from '@/lib/notifications';
import { saveEvent, formatRupiah } from '@/lib/store';
import { getCurrentAdminSession } from '@/lib/auth';
import { useOrg } from '@/components/admin/org-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import { DynamicFormField } from '@/components/form/dynamic-form-field';
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Eye,
  Copy,
  DollarSign,
  FileText,
  Sliders,
  ExternalLink,
} from 'lucide-react';

interface EventBuilderProps {
  initialEvent?: Partial<EventItem>;
  isEdit?: boolean;
}

const FIELD_TYPE_OPTIONS: { label: string; value: FieldType; desc: string }[] = [
  { label: 'Teks Pendek', value: 'text', desc: 'Satu baris teks (nama, nama tim, instansi)' },
  { label: 'Teks Panjang', value: 'textarea', desc: 'Paragraf catatan, alamat, deskripsi' },
  { label: 'Angka (Number)', value: 'number', desc: 'Usia, nomor punggung, kuantitas' },
  { label: 'Email', value: 'email', desc: 'Email dengan validasi format' },
  { label: 'Nomor WhatsApp / HP', value: 'phone', desc: 'Nomor telepon format kontak' },
  { label: 'Tanggal', value: 'date', desc: 'Pemilih tanggal lahir / jadwal' },
  { label: 'Dropdown (Select)', value: 'select', desc: 'Pilihan menu dropdown tunggal' },
  { label: 'Pilihan Tunggal (Radio)', value: 'radio', desc: 'Opsi radio button berdampingan' },
  { label: 'Pilihan Ganda (Checkbox)', value: 'checkbox', desc: 'Persetujuan syarat & ketentuan / multi-pilih' },
  { label: 'Upload Berkas (File)', value: 'file', desc: 'Unggah KTP, kartu pelajar, atau karya' },
  { label: 'Repeater / Grup Berulang', value: 'repeater', desc: 'Daftar dinamis (pemain tim: nama, no punggung, posisi)' },
];

const DEFAULT_INITIAL_FIELDS: FormField[] = [
  {
    id: 'full_name',
    type: 'text',
    label: 'Nama Lengkap',
    placeholder: 'Contoh: Budi Pratama',
    validation: { required: true },
  },
  {
    id: 'whatsapp',
    type: 'phone',
    label: 'Nomor WhatsApp',
    placeholder: '0812xxxxxxxx',
    helperText: 'Digunakan untuk konfirmasi pendaftaran & login cek status tiket',
    validation: { required: true },
  },
  {
    id: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'nama@email.com',
    validation: { required: false },
  },
  {
    id: 'team_name',
    type: 'text',
    label: 'Nama Tim / Klub',
    placeholder: 'Contoh: Garuda Muda FC',
    validation: { required: true },
  },
];

export function EventBuilder({ initialEvent, isEdit = false }: EventBuilderProps) {
  const { toast } = useToast();
  const currentSession = getCurrentAdminSession();
  const { activeOrg } = useOrg();

  const [activeTab, setActiveTab] = useState<'editor' | 'settings' | 'preview'>('editor');
  const [isSaving, setIsSaving] = useState(false);
  const [eventId, setEventId] = useState<string | undefined>(initialEvent?.id);

  // Event Settings State
  const [title, setTitle] = useState(initialEvent?.title || '');
  const [slug, setSlug] = useState(initialEvent?.slug || '');
  const [organizerName, setOrganizerName] = useState(
    initialEvent?.organizer_name ||
    currentSession?.user?.organization_name ||
    currentSession?.user?.full_name ||
    'Panitia Resmi'
  );
  const [description, setDescription] = useState(initialEvent?.description || '');
  const [coverUrl, setCoverUrl] = useState(
    initialEvent?.cover_url ||
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&auto=format&fit=crop&q=80'
  );
  const [location, setLocation] = useState(initialEvent?.location || '');
  const [startsAt, setStartsAt] = useState(
    initialEvent?.starts_at ? initialEvent.starts_at.slice(0, 16) : ''
  );
  const [deadline, setDeadline] = useState(
    initialEvent?.registration_deadline ? initialEvent.registration_deadline.slice(0, 16) : ''
  );
  const [quota, setQuota] = useState<number>(initialEvent?.quota ?? 32);
  const [quotaMode, setQuotaMode] = useState<QuotaMode>(initialEvent?.quota_mode ?? 'registration');
  const [waitlistEnabled, setWaitlistEnabled] = useState<boolean>(initialEvent?.waitlist_enabled ?? false);
  const [eventType, setEventType] = useState<string>(initialEvent?.event_type ?? 'general');
  const [notificationTemplates, setNotificationTemplates] = useState<Partial<Record<string, string>>>(
    initialEvent?.notification_templates ?? {}
  );
  const [groupingEnabled, setGroupingEnabled] = useState<boolean>(
    () => resolveEventType(initialEvent ?? { event_type: 'general' }).grouping.enabled
  );
  const [priceType, setPriceType] = useState<PriceType>(initialEvent?.price_type || 'fixed');
  const [priceAmount, setPriceAmount] = useState<number>(initialEvent?.price_amount ?? 750000);
  const [prefixCode, setPrefixCode] = useState(initialEvent?.prefix_code || 'MSC');
  const [status, setStatus] = useState<EventStatus>(initialEvent?.status || 'open');
  const [waTemplate, setWaTemplate] = useState(
    initialEvent?.wa_template ||
    'Halo Admin, saya telah mendaftar di *{event}*.\n\nKode: *{kode}*\nNama: *{nama}*\nTotal Bayar: *Rp {total}*\nBukti: {bukti}'
  );
  const [successMessage, setSuccessMessage] = useState(
    initialEvent?.success_message ||
    'Terima kasih telah mendaftar! Mohon segera konfirmasi pembayaran melalui WhatsApp panitia.'
  );

  // Unified Form Fields State
  const [fields, setFields] = useState<FormField[]>(
    initialEvent?.form_schema && initialEvent.form_schema.length > 0
      ? initialEvent.form_schema
      : DEFAULT_INITIAL_FIELDS
  );

  // Active Field Editor selection by index
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number>(0);

  // Preview State
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});

  // Auto-generate slug from title if new
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEdit && !slug) {
      setSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  // Switching type applies its defaults and offers its form template
  const handleEventTypeChange = (typeId: string) => {
    const typeModule = resolveEventType({ event_type: typeId });
    setEventType(typeModule.id);
    setGroupingEnabled(typeModule.grouping.enabled);
    setQuotaMode(typeModule.defaults.quota_mode);
    if (typeModule.defaults.price_type) setPriceType(typeModule.defaults.price_type);
    if (typeModule.templateId) applyTemplate(typeModule.templateId);
  };

  // Load a built-in template
  const applyTemplate = (templateId: string) => {
    const tpl = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    if (
      confirm(
        `Terapkan template "${tpl.name}"? Ini akan memperbarui judul, harga, dan susunan field form Anda.`
      )
    ) {
      if (tpl.template.title) setTitle(tpl.template.title);
      if (tpl.template.description) setDescription(tpl.template.description);
      if (tpl.template.price_type) setPriceType(tpl.template.price_type);
      if (tpl.template.price_amount !== undefined) setPriceAmount(tpl.template.price_amount);
      if (tpl.template.quota) setQuota(tpl.template.quota);
      if (tpl.template.prefix_code) setPrefixCode(tpl.template.prefix_code);
      if (tpl.template.form_schema) {
        setFields(tpl.template.form_schema);
        setSelectedFieldIndex(0);
      }
      toast({
        type: 'success',
        message: `Template "${tpl.name}" berhasil diterapkan!`,
      });
    }
  };

  // Field Management
  const addField = (type: FieldType = 'text') => {
    const newId = 'field_' + Math.random().toString(36).substring(2, 8);
    const defaultLabels: Record<FieldType, string> = {
      text: 'Pertanyaan Teks Baru',
      textarea: 'Catatan / Alamat Lengkap',
      number: 'Nomor / Jumlah',
      email: 'Alamat Email',
      phone: 'Nomor WhatsApp / HP',
      date: 'Pilih Tanggal',
      select: 'Pilihan Menu Dropdown',
      radio: 'Pilihan Radio Tunggal',
      checkbox: 'Pernyataan / Centang',
      file: 'Unggah Berkas / Dokumen',
      repeater: 'Daftar Anggota / Pemain',
    };
    const defaultPlaceholders: Partial<Record<FieldType, string>> = {
      text: 'Tuliskan isian Anda...',
      textarea: 'Tuliskan keterangan detail di sini...',
      number: '0',
      email: 'nama@email.com',
      phone: '0812xxxxxxxx',
      select: 'Pilih salah satu...',
    };

    const newField: FormField = {
      id: newId,
      type,
      label: defaultLabels[type] || `Field Baru (${type})`,
      placeholder: defaultPlaceholders[type] || '',
      validation: { required: false },
      options:
        type === 'select' || type === 'radio' || type === 'checkbox'
          ? [
            { label: 'Opsi 1', value: 'opsi_1' },
            { label: 'Opsi 2', value: 'opsi_2' },
          ]
          : undefined,
      subFields:
        type === 'repeater'
          ? [
            { id: 'sub_1', type: 'text', label: 'Nama', validation: { required: true } },
            { id: 'sub_2', type: 'number', label: 'Nomor', validation: { required: true } },
          ]
          : undefined,
    };
    const nextFields = [...fields, newField];
    setFields(nextFields);
    setSelectedFieldIndex(nextFields.length - 1);
  };

  const removeField = (indexToRemove: number) => {
    if (fields.length <= 1) {
      toast({ type: 'info', message: 'Minimal harus ada 1 field dalam formulir.' });
      return;
    }
    const nextFields = fields.filter((_, idx) => idx !== indexToRemove);
    setFields(nextFields);
    if (selectedFieldIndex >= nextFields.length) {
      setSelectedFieldIndex(Math.max(0, nextFields.length - 1));
    }
  };

  const duplicateField = (indexToDup: number) => {
    const target = fields[indexToDup];
    if (!target) return;
    const newId = (target.id ? `${target.id}_copy` : 'field') + '_' + Math.random().toString(36).substring(2, 6);
    const duplicated: FormField = {
      ...JSON.parse(JSON.stringify(target)),
      id: newId,
      label: `${target.label} (Salinan)`,
    };
    const nextFields = [...fields];
    nextFields.splice(indexToDup + 1, 0, duplicated);
    setFields(nextFields);
    setSelectedFieldIndex(indexToDup + 1);
    toast({ type: 'success', message: `Field "${target.label}" berhasil disalin.` });
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    const nextFields = [...fields];
    const temp = nextFields[index];
    nextFields[index] = nextFields[targetIndex];
    nextFields[targetIndex] = temp;
    setFields(nextFields);
    if (selectedFieldIndex === index) {
      setSelectedFieldIndex(targetIndex);
    } else if (selectedFieldIndex === targetIndex) {
      setSelectedFieldIndex(index);
    }
  };

  const updateSelectedField = (updates: Partial<FormField>) => {
    setFields((prev) => {
      const idx = selectedFieldIndex >= 0 && selectedFieldIndex < prev.length ? selectedFieldIndex : 0;
      if (!prev[idx]) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  };

  // Save Event Handler
  const handleSave = async () => {
    if (!title.trim()) {
      toast({ type: 'error', message: 'Judul event wajib diisi.' });
      setActiveTab('settings');
      return;
    }
    if (!slug.trim()) {
      toast({ type: 'error', message: 'Slug URL wajib diisi.' });
      setActiveTab('settings');
      return;
    }
    if (fields.length === 0) {
      toast({ type: 'error', message: 'Formulir harus memiliki minimal 1 field.' });
      setActiveTab('editor');
      return;
    }

    // Sanitize all field IDs so none are empty or invalid
    const sanitizedFields = fields.map((f, i) => {
      let cleanId = f.id ? f.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') : '';
      if (!cleanId) {
        cleanId = (f.label ? f.label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20) : '') || `field_${i + 1}`;
      }
      return { ...f, id: cleanId };
    });

    setIsSaving(true);
    try {
      const saved = await saveEvent({
        id: eventId || initialEvent?.id,
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        description: description.trim(),
        cover_url: coverUrl.trim(),
        location: location.trim(),
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        registration_deadline: deadline ? new Date(deadline).toISOString() : undefined,
        quota,
        quota_mode: quotaMode,
        waitlist_enabled: waitlistEnabled,
        event_type: eventType,
        // Keep other per-event overrides; only the grouping switch is edited here
        type_config: {
          ...(initialEvent?.type_config ?? {}),
          grouping: {
            ...((initialEvent?.type_config?.grouping as Record<string, unknown>) ?? {}),
            enabled: groupingEnabled,
          },
        },
        price_type: priceType,
        price_amount: priceAmount,
        prefix_code: prefixCode.trim().toUpperCase(),
        status,
        organizer_name: organizerName.trim() || 'Panitia Resmi',
        // Editing must not transfer ownership to whoever saves (e.g. super admin)
        created_by: initialEvent?.created_by ?? currentSession?.user?.id,
        // New events belong to the organization selected in the sidebar
        organization_id: initialEvent?.organization_id ?? activeOrg?.id,
        form_schema: sanitizedFields,
        wa_template: waTemplate.trim(),
        // Blank fields fall back to the defaults, so they are not stored
        notification_templates: Object.fromEntries(
          Object.entries(notificationTemplates).filter(([, text]) => text && text.trim())
        ),
        success_message: successMessage.trim(),
      });

      setEventId(saved.id);

      toast({
        type: 'success',
        title: 'Berhasil Disimpan!',
        message: `Event "${saved.title}" berhasil disimpan. Anda tetap berada di halaman editor.`,
      });

      // Update URL silently without full navigation if we just created a new event
      if (!isEdit && typeof window !== 'undefined' && window.location.pathname.includes('/new')) {
        window.history.replaceState(null, '', `/admin/events/${saved.id}/edit`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      toast({
        type: 'error',
        title: 'Gagal Menyimpan',
        message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedField = fields[selectedFieldIndex] || fields[0] || null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Bar Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/events"
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="text-xs text-neutral-400 uppercase font-semibold">
              {isEdit ? 'Edit Event & Form' : 'Pembuat Event Baru'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 truncate max-w-md">
              {title || 'Event Baru Tanpa Judul'}
            </h1>
          </div>
        </div>

        {/* Action Buttons & Templates Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Template Selector */}
          <div className="relative">
            <select
              onChange={(e) => {
                if (e.target.value) applyTemplate(e.target.value);
                e.target.value = '';
              }}
              defaultValue=""
              className="flex h-9 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 cursor-pointer"
            >
              <option value="" disabled>
                ✨ Muat Template Bawaan...
              </option>
              {BUILT_IN_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {slug && (
            <a
              href={`/e/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 transition-colors shadow-2xs"
              title="Buka form pendaftaran publik di tab baru"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Lihat Form Publik</span>
            </a>
          )}

          <Button
            onClick={handleSave}
            isLoading={isSaving}
            className="h-9 text-xs font-semibold gap-1.5 shadow-xs"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Simpan Event</span>
          </Button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setActiveTab('editor')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${activeTab === 'editor'
              ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Editor Formulir ({fields.length} Field)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${activeTab === 'settings'
              ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
        >
          <FileText className="h-4 w-4" />
          <span>Pengaturan Event & Harga</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${activeTab === 'preview'
              ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
        >
          <Eye className="h-4 w-4" />
          <span>Pratinjau Live Form</span>
        </button>
      </div>

      {/* TAB 1: UNIFIED FORM BUILDER EDITOR */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: All Fields List & Reordering */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between px-0.5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                  Daftar Field Formulir ({fields.length})
                </span>
                <p className="text-[11px] text-neutral-400">
                  Semua field dapat diedit, dipindah, atau dihapus
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => addField('text')}
                className="h-8 text-xs gap-1.5 shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Field</span>
              </Button>
            </div>

            {/* Quick Type Pills */}
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-neutral-200/80 bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-900/50">
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-1">
                + Cepat:
              </span>
              {[
                { label: 'Teks', type: 'text' as FieldType },
                { label: 'WhatsApp', type: 'phone' as FieldType },
                { label: 'Email', type: 'email' as FieldType },
                { label: 'Angka', type: 'number' as FieldType },
                { label: 'Pilihan', type: 'select' as FieldType },
                { label: 'Upload', type: 'file' as FieldType },
                { label: 'Repeater', type: 'repeater' as FieldType },
              ].map((pt) => (
                <button
                  key={pt.type}
                  type="button"
                  onClick={() => addField(pt.type)}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white border border-neutral-200 hover:border-neutral-900 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-400 transition-colors"
                >
                  +{pt.label}
                </button>
              ))}
            </div>

            {/* The Unified Fields List */}
            <div className="space-y-2">
              {fields.map((f, index) => {
                const isSelected = index === selectedFieldIndex;
                return (
                  <div
                    key={`field_${index}_${f.id || 'id'}`}
                    onClick={() => setSelectedFieldIndex(index)}
                    className={`group flex items-center justify-between rounded-xl border p-3 transition-all cursor-pointer ${isSelected
                        ? 'border-neutral-900 bg-white shadow-xs ring-1 ring-neutral-900/10 dark:border-neutral-100 dark:bg-neutral-800 dark:ring-neutral-100/10'
                        : 'border-neutral-200 bg-white/70 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
                      }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="text-neutral-300 group-hover:text-neutral-500 cursor-grab">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 truncate">
                            {f.label}
                          </span>
                          {f.validation?.required ? (
                            <span className="text-[10px] text-red-500 font-bold">*Wajib</span>
                          ) : (
                            <span className="text-[10px] text-neutral-400 font-medium">Opsional</span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400 capitalize">
                          {f.type === 'repeater' ? 'Repeater (Grup Berulang)' : f.type}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(index, 'up');
                        }}
                        disabled={index === 0}
                        title="Geser Naik"
                        className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-20"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(index, 'down');
                        }}
                        disabled={index === fields.length - 1}
                        title="Geser Turun"
                        className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-20"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateField(index);
                        }}
                        title="Salin Field"
                        className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 ml-0.5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeField(index);
                        }}
                        title="Hapus Field"
                        className="p-1 rounded text-neutral-400 hover:text-red-600 ml-0.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Full Inspector for Selected Field */}
          <div className="lg:col-span-7">
            {selectedField ? (
              <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      Pengaturan Field: {selectedField.label}
                    </h3>
                    <p className="text-[11px] text-neutral-400">Tipe: <span className="capitalize font-medium text-neutral-600 dark:text-neutral-300">{selectedField.type}</span></p>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {selectedField.type}
                  </Badge>
                </div>

                {/* Field ID / Key */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    ID / Kunci Kolom (Identifier)
                  </label>
                  <Input
                    type="text"
                    value={selectedField.id}
                    onChange={(e) => {
                      const cleanId = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                      updateSelectedField({ id: cleanId });
                    }}
                    onBlur={() => {
                      if (!selectedField.id.trim()) {
                        const fallback = selectedField.label
                          ? selectedField.label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20)
                          : '';
                        updateSelectedField({ id: fallback || 'field_' + Math.random().toString(36).substring(2, 7) });
                      }
                    }}
                    placeholder="contoh: nama_lengkap, nomor_wa, tim"
                    className="text-xs h-9 font-mono"
                  />
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    Nama kunci kolom di tabel data pendaftaran (huruf kecil & underscore). Bebas dihapus & diganti.
                  </p>
                </div>

                {/* Field Type Selector */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    Tipe Field
                  </label>
                  <select
                    value={selectedField.type}
                    onChange={(e) => {
                      const newType = e.target.value as FieldType;
                      updateSelectedField({
                        type: newType,
                        options:
                          newType === 'select' || newType === 'radio' || newType === 'checkbox'
                            ? selectedField.options || [
                              { label: 'Opsi 1', value: 'opsi_1' },
                              { label: 'Opsi 2', value: 'opsi_2' },
                            ]
                            : undefined,
                        subFields:
                          newType === 'repeater'
                            ? selectedField.subFields || [
                              { id: 'sf_1', type: 'text', label: 'Nama', validation: { required: true } },
                            ]
                            : undefined,
                      });
                    }}
                    className="flex h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.desc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Label Field */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    Label Pertanyaan / Field <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={selectedField.label}
                    onChange={(e) => updateSelectedField({ label: e.target.value })}
                    placeholder="Contoh: Nama Lengkap, Nomor WhatsApp, dll."
                    className="text-xs h-9"
                    required
                  />
                </div>

                {/* Placeholder Field */}
                {selectedField.type !== 'checkbox' && selectedField.type !== 'file' && (
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                      Placeholder (Contoh Teks di Dalam Input)
                    </label>
                    <Input
                      type="text"
                      value={selectedField.placeholder || ''}
                      onChange={(e) => updateSelectedField({ placeholder: e.target.value })}
                      placeholder="Contoh: Masukkan nama lengkap Anda..."
                      className="text-xs h-9"
                    />
                  </div>
                )}

                {/* Helper Text */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    Petunjuk Pengisian (Helper Text di Bawah Input)
                  </label>
                  <Input
                    type="text"
                    value={selectedField.helperText || ''}
                    onChange={(e) => updateSelectedField({ helperText: e.target.value })}
                    placeholder="Contoh: Pastikan nomor aktif di WhatsApp untuk verifikasi tiket."
                    className="text-xs h-9"
                  />
                </div>

                {/* Validation Rules */}
                <div className="space-y-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <div className="text-xs font-semibold uppercase text-neutral-400">
                    Aturan Validasi
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!selectedField.validation?.required}
                      onChange={(e) =>
                        updateSelectedField({
                          validation: { ...selectedField.validation, required: e.target.checked },
                        })
                      }
                      className="h-4 w-4 rounded-sm text-neutral-900 border-neutral-300"
                    />
                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      Wajib Diisi oleh Pendaftar (Required)
                    </span>
                  </label>

                  {/* Min / Max for Repeater or Number */}
                  {(selectedField.type === 'number' || selectedField.type === 'repeater') && (
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">
                          {selectedField.type === 'repeater' ? 'Min. Baris Peserta' : 'Nilai Minimal'}
                        </label>
                        <Input
                          type="number"
                          value={selectedField.validation?.min ?? ''}
                          onChange={(e) =>
                            updateSelectedField({
                              validation: {
                                ...selectedField.validation,
                                min: e.target.value === '' ? undefined : Number(e.target.value),
                              },
                            })
                          }
                          className="text-xs h-8"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">
                          {selectedField.type === 'repeater' ? 'Maks. Baris Peserta' : 'Nilai Maksimal'}
                        </label>
                        <Input
                          type="number"
                          value={selectedField.validation?.max ?? ''}
                          onChange={(e) =>
                            updateSelectedField({
                              validation: {
                                ...selectedField.validation,
                                max: e.target.value === '' ? undefined : Number(e.target.value),
                              },
                            })
                          }
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Options Manager (for select, radio, checkbox) */}
                {(selectedField.type === 'select' ||
                  selectedField.type === 'radio' ||
                  selectedField.type === 'checkbox') && (
                    <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-neutral-400">
                          Daftar Opsi Pilihan
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const currentOpts = selectedField.options || [];
                            const idx = currentOpts.length + 1;
                            updateSelectedField({
                              options: [
                                ...currentOpts,
                                { label: `Opsi ${idx}`, value: `opsi_${idx}` },
                              ],
                            });
                          }}
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Tambah Opsi
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {selectedField.options?.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <Input
                              value={opt.label}
                              onChange={(e) => {
                                const updated = [...(selectedField.options || [])];
                                updated[optIdx] = {
                                  ...updated[optIdx],
                                  label: e.target.value,
                                  value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                                };
                                updateSelectedField({ options: updated });
                              }}
                              placeholder={`Label Opsi #${optIdx + 1}`}
                              className="text-xs h-8 flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (selectedField.options || []).filter(
                                  (_, idx) => idx !== optIdx
                                );
                                updateSelectedField({ options: updated });
                              }}
                              disabled={(selectedField.options || []).length <= 1}
                              className="p-1.5 text-neutral-400 hover:text-red-500 disabled:opacity-20"
                              title="Hapus Opsi"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Subfields Manager for Repeater */}
                {selectedField.type === 'repeater' && (
                  <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold uppercase text-neutral-400">
                          Kolom Sub-Fields Repeater
                        </span>
                        <p className="text-[11px] text-neutral-400">
                          Kolom yang diisi pada setiap baris peserta (contoh: Nama, No. Punggung, Posisi)
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const currentSub = selectedField.subFields || [];
                          const newSubId = 'col_' + Math.random().toString(36).substring(2, 6);
                          updateSelectedField({
                            subFields: [
                              ...currentSub,
                              {
                                id: newSubId,
                                type: 'text',
                                label: `Kolom ${currentSub.length + 1}`,
                                validation: { required: true },
                              },
                            ],
                          });
                        }}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Tambah Kolom
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {selectedField.subFields?.map((sf, sfIdx) => (
                        <div
                          key={sf.id}
                          className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/40 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                              Kolom #{sfIdx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (selectedField.subFields || []).filter(
                                  (_, idx) => idx !== sfIdx
                                );
                                updateSelectedField({ subFields: updated });
                              }}
                              disabled={(selectedField.subFields || []).length <= 1}
                              className="text-neutral-400 hover:text-red-500 disabled:opacity-20 p-1"
                              title="Hapus Kolom"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-neutral-400 block mb-1">
                                Label Kolom
                              </label>
                              <Input
                                value={sf.label}
                                onChange={(e) => {
                                  const updated = [...(selectedField.subFields || [])];
                                  updated[sfIdx] = { ...updated[sfIdx], label: e.target.value };
                                  updateSelectedField({ subFields: updated });
                                }}
                                className="text-xs h-7"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-neutral-400 block mb-1">
                                Tipe Input
                              </label>
                              <select
                                value={sf.type}
                                onChange={(e) => {
                                  const updated = [...(selectedField.subFields || [])];
                                  updated[sfIdx] = {
                                    ...updated[sfIdx],
                                    type: e.target.value as FieldType,
                                  };
                                  updateSelectedField({ subFields: updated });
                                }}
                                className="flex h-7 w-full rounded border border-neutral-300 bg-white px-2 text-[11px] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                              >
                                <option value="text">Teks</option>
                                <option value="number">Angka</option>
                                <option value="phone">Nomor HP</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Footer for this Field */}
                <div className="border-t border-neutral-100 pt-4 flex items-center justify-between dark:border-neutral-800">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateField(selectedFieldIndex)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin Field Ini</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeField(selectedFieldIndex)}
                    className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus Field</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-xs text-neutral-400 dark:border-neutral-700">
                Pilih salah satu field di sebelah kiri untuk mengedit pengaturannya, atau klik <strong>Tambah Field</strong>.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EVENT SETTINGS & PRICING */}
      {activeTab === 'settings' && (
        <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-6">
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
                <option value="open">Buka (Terima Pendaftaran Publik)</option>
                <option value="draft">Draft (Hanya Admin)</option>
                <option value="closed">Tutup (Form Dinonaktifkan)</option>
              </select>
            </div>

            {/* Prefix Code */}
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Prefix Kode Tiket (Maks. 5 Karakter)
              </label>
              <Input
                type="text"
                value={prefixCode}
                onChange={(e) => setPrefixCode(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="MSC / EVT"
                className="text-xs h-9 font-mono uppercase"
              />
              <span className="text-[11px] text-neutral-400">Contoh format: {prefixCode}-2026-0001</span>
            </div>

            {/* Location */}
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Lokasi Pelaksanaan
              </label>
              <Input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Contoh: Grand Futsal Arena, Jakarta Selatan"
                className="text-xs h-9"
              />
            </div>

            {/* Quota */}
            <div>
              <label htmlFor="quota" className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Kuota (0 = tanpa batas)
              </label>
              <div className="flex gap-2">
                <Input
                  id="quota"
                  type="number"
                  min={0}
                  value={quota}
                  onChange={(e) => setQuota(Number(e.target.value))}
                  className="text-xs h-9 w-24"
                />
                <select
                  aria-label="Satuan kuota"
                  value={quotaMode}
                  onChange={(e) => setQuotaMode(e.target.value as QuotaMode)}
                  className="h-9 flex-1 rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-800"
                >
                  <option value="registration">per pendaftaran (mis. per tim)</option>
                  <option value="participant">per peserta (baris repeater)</option>
                </select>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={waitlistEnabled}
                  onChange={(e) => setWaitlistEnabled(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                Terima daftar tunggu saat kuota penuh
              </label>
            </div>

            {/* Starts At */}
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Tanggal & Waktu Mulai Event
              </label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* Registration Deadline */}
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

            {/* Cover URL */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                URL Banner / Cover Gambar
              </label>
              <Input
                type="url"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="text-xs h-9"
              />
              {coverUrl && (
                <div className="mt-2 h-28 w-full max-w-sm overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverUrl} alt="Cover Preview" className="h-full w-full object-cover" />
                </div>
              )}
            </div>

            {/* Description (Markdown Support) */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Deskripsi Event & Ketentuan (Mendukung Markdown)
              </label>
              <Textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tuliskan informasi lengkap, jadwal, hadiah, dan regulasi acara di sini..."
                className="text-xs font-mono"
              />
            </div>
          </div>

          {/* Pricing Section */}
          <div className="border-t border-neutral-200 pt-5 dark:border-neutral-800 space-y-4">
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span>Biaya & Tipe Pendaftaran</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Skema Harga
                </label>
                <select
                  value={priceType}
                  onChange={(e) => setPriceType(e.target.value as PriceType)}
                  className="flex h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="free">Gratis (Tanpa Biaya)</option>
                  <option value="fixed">Biaya Tetap (Per Tim / Per Pendaftaran)</option>
                  <option value="per_participant">Dihitung Per Peserta (Mengikuti Jumlah Repeater)</option>
                </select>
              </div>

              {priceType !== 'free' && (
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    Nominal Biaya (Rp)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={5000}
                    value={priceAmount}
                    onChange={(e) => setPriceAmount(Number(e.target.value))}
                    className="text-xs h-9"
                  />
                  <span className="text-[11px] text-neutral-400">
                    Format tampilan: {formatRupiah(priceAmount)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp & Success Message Settings */}
          <div className="border-t border-neutral-200 pt-5 dark:border-neutral-800 space-y-4">
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Pesan Konfirmasi & Template WhatsApp
            </h4>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Template Pesan WhatsApp Otomatis (wa.me)
              </label>
              <Textarea
                rows={4}
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                placeholder="Gunakan variabel {event}, {kode}, {nama}, {total}, {bukti}"
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                Variabel yang tersedia: <code>{'{event}'}</code>, <code>{'{kode}'}</code>, <code>{'{nama}'}</code>, <code>{'{total}'}</code>, <code>{'{bukti}'}</code>
              </p>
            </div>

            {/* Messages organizers send to participants (lib/notifications) */}
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

            <div>
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
      )}

      {/* TAB 3: LIVE PREVIEW */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Eye className="h-4 w-4" />
              Mode Pratinjau Interaktif — Semua field formulir tampil sesuai susunan di editor.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveTab('editor')}
              className="h-7 text-xs bg-white dark:bg-neutral-900"
            >
              Kembali ke Editor
            </Button>
          </div>

          <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 max-w-2xl mx-auto space-y-6">
            {coverUrl && (
              <div className="h-44 w-full overflow-hidden rounded-xl bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt="Preview Cover" className="h-full w-full object-cover" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="success">Pendaftaran Terbuka</Badge>
                <Badge variant="outline">
                  {priceType === 'free' ? 'Gratis' : formatRupiah(priceAmount)}
                </Badge>
              </div>
              <h2 className="text-2xl font-extrabold text-neutral-900 dark:text-neutral-100">
                {title || 'Judul Event'}
              </h2>
              {organizerName && (
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mt-1">
                  Penyelenggara: <strong>{organizerName}</strong>
                </p>
              )}
              {location && <p className="text-xs text-neutral-500 mt-0.5">{location}</p>}
            </div>

            <div className="space-y-5 border-t border-neutral-100 pt-5 dark:border-neutral-800">
              {/* Unified Dynamic Form Fields Preview */}
              <div className="space-y-5">
                {fields.map((field) => (
                  <DynamicFormField
                    key={field.id}
                    field={field}
                    value={previewAnswers[field.id]}
                    onChange={(val) =>
                      setPreviewAnswers((prev) => ({
                        ...prev,
                        [field.id]: val,
                      }))
                    }
                  />
                ))}
              </div>

              <div className="pt-2">
                <Button disabled className="w-full text-xs font-semibold h-10">
                  Kirim Pendaftaran & Dapatkan Kode Tiket (Pratinjau)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
