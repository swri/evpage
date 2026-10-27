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
import { resolveEventType } from '@/lib/event-types';
import { refreshPublicPages } from '@/lib/public-refresh';
import { saveEvent } from '@/lib/store';
import { getCurrentAdminSession } from '@/lib/auth';
import { toWIBDateTimeInput, fromWIBDateTimeInput } from '@/lib/utils';
import { useOrg } from '@/components/admin/org-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import {
  Save,
  ArrowLeft,
  Sliders,
  FileText,
  Eye,
  ExternalLink,
} from 'lucide-react';

import { DEFAULT_INITIAL_FIELDS } from './event-builder/constants';
import { FieldsList } from './event-builder/fields-list';
import { FieldInspector } from './event-builder/field-inspector';
import { SettingsTab } from './event-builder/settings-tab';
import { PreviewTab } from './event-builder/preview-tab';

export interface EventBuilderProps {
  initialEvent?: Partial<EventItem>;
  isEdit?: boolean;
}

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
  const [locationUrl, setLocationUrl] = useState(initialEvent?.location_url || '');
  const [startsAt, setStartsAt] = useState(
    initialEvent?.starts_at ? toWIBDateTimeInput(initialEvent.starts_at) : ''
  );
  const [deadline, setDeadline] = useState(
    initialEvent?.registration_deadline ? toWIBDateTimeInput(initialEvent.registration_deadline) : ''
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
        type: 'info',
        title: 'Template Diterapkan',
        message: `Template "${tpl.name}" berhasil dimuat ke editor.`,
      });
    }
  };

  // Form Field Actions
  const addField = (type: FieldType) => {
    const defaultLabels: Record<FieldType, string> = {
      text: 'Field Teks Baru',
      textarea: 'Catatan / Alamat Tambahan',
      number: 'Kuantitas / Usia',
      email: 'Alamat Email',
      phone: 'Nomor WhatsApp / HP',
      date: 'Tanggal Lahir / Jadwal',
      select: 'Pilihan Menu Dropdown',
      radio: 'Pilihan Radio Tunggal',
      checkbox: 'Persetujuan Syarat & Ketentuan',
      file: 'Upload Berkas Pendukung',
      repeater: 'Daftar Anggota / Pemain',
    };

    const newField: FormField = {
      id: `field_${Math.random().toString(36).substring(2, 7)}`,
      type,
      label: defaultLabels[type] || 'Field Baru',
      placeholder: '',
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
              { id: 'sub_name', type: 'text', label: 'Nama Lengkap', validation: { required: true } },
              { id: 'sub_number', type: 'number', label: 'No Punggung', validation: { required: false } },
              { id: 'sub_position', type: 'text', label: 'Posisi Bermain', validation: { required: false } },
            ]
          : undefined,
    };

    const nextFields = [...fields, newField];
    setFields(nextFields);
    setSelectedFieldIndex(nextFields.length - 1);
  };

  const removeField = (index: number) => {
    if (fields.length <= 1) {
      toast({ type: 'error', message: 'Formulir minimal harus memiliki 1 field.' });
      return;
    }
    const next = fields.filter((_, i) => i !== index);
    setFields(next);
    if (selectedFieldIndex >= next.length) {
      setSelectedFieldIndex(Math.max(0, next.length - 1));
    }
  };

  const duplicateField = (index: number) => {
    const original = fields[index];
    if (!original) return;
    const duplicated: FormField = {
      ...JSON.parse(JSON.stringify(original)),
      id: `${original.id}_copy_${Math.random().toString(36).substring(2, 5)}`,
      label: `${original.label} (Salinan)`,
    };
    const next = [...fields];
    next.splice(index + 1, 0, duplicated);
    setFields(next);
    setSelectedFieldIndex(index + 1);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    const next = [...fields];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setFields(next);
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
        location_url: locationUrl.trim() || null,
        starts_at: fromWIBDateTimeInput(startsAt),
        registration_deadline: fromWIBDateTimeInput(deadline),
        quota,
        quota_mode: quotaMode,
        waitlist_enabled: waitlistEnabled,
        event_type: eventType,
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
        created_by: initialEvent?.created_by ?? currentSession?.user?.id,
        organization_id: initialEvent?.organization_id ?? activeOrg?.id,
        form_schema: sanitizedFields,
        wa_template: waTemplate.trim(),
        notification_templates: Object.fromEntries(
          Object.entries(notificationTemplates).filter(([, text]) => text && text.trim())
        ),
        success_message: successMessage.trim(),
      });

      setEventId(saved.id);
      refreshPublicPages(initialEvent?.slug, saved.slug);

      toast({
        type: 'success',
        title: 'Berhasil Disimpan!',
        message: `Event "${saved.title}" berhasil disimpan. Anda tetap berada di halaman editor.`,
      });

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

  const selectedField = fields[selectedFieldIndex] || fields[0] || undefined;

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
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={status === 'open' ? 'success' : 'outline'} className="capitalize text-[10px]">
                {status}
              </Badge>
              {slug && (
                <Link
                  href={`/e/${slug}`}
                  target="_blank"
                  className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                >
                  <span>evpage/e/{slug}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Preset Template Switcher */}
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                applyTemplate(e.target.value);
                e.target.value = '';
              }
            }}
            className="text-xs h-9 px-2.5 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 font-medium cursor-pointer"
          >
            <option value="" disabled>
              Muat Template Bawaan...
            </option>
            {BUILT_IN_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2 shadow-xs h-9 px-4 text-xs font-semibold"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Event'}</span>
          </Button>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setActiveTab('editor')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'editor'
              ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Editor Form Pendaftaran</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'settings'
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'preview'
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
          <FieldsList
            fields={fields}
            selectedFieldIndex={selectedFieldIndex}
            setSelectedFieldIndex={setSelectedFieldIndex}
            addField={addField}
            moveField={moveField}
            duplicateField={duplicateField}
            removeField={removeField}
          />

          <FieldInspector
            selectedField={selectedField}
            selectedFieldIndex={selectedFieldIndex}
            updateSelectedField={updateSelectedField}
            duplicateField={duplicateField}
            removeField={removeField}
          />
        </div>
      )}

      {/* TAB 2: EVENT SETTINGS & PRICING */}
      {activeTab === 'settings' && (
        <SettingsTab
          title={title}
          handleTitleChange={handleTitleChange}
          eventType={eventType}
          handleEventTypeChange={handleEventTypeChange}
          groupingEnabled={groupingEnabled}
          setGroupingEnabled={setGroupingEnabled}
          slug={slug}
          setSlug={setSlug}
          organizerName={organizerName}
          setOrganizerName={setOrganizerName}
          status={status}
          setStatus={setStatus}
          coverUrl={coverUrl}
          setCoverUrl={setCoverUrl}
          startsAt={startsAt}
          setStartsAt={setStartsAt}
          deadline={deadline}
          setDeadline={setDeadline}
          location={location}
          setLocation={setLocation}
          locationUrl={locationUrl}
          setLocationUrl={setLocationUrl}
          quota={quota}
          setQuota={setQuota}
          quotaMode={quotaMode}
          setQuotaMode={setQuotaMode}
          waitlistEnabled={waitlistEnabled}
          setWaitlistEnabled={setWaitlistEnabled}
          priceType={priceType}
          setPriceType={setPriceType}
          priceAmount={priceAmount}
          setPriceAmount={setPriceAmount}
          prefixCode={prefixCode}
          setPrefixCode={setPrefixCode}
          waTemplate={waTemplate}
          setWaTemplate={setWaTemplate}
          notificationTemplates={notificationTemplates}
          setNotificationTemplates={setNotificationTemplates}
          successMessage={successMessage}
          setSuccessMessage={setSuccessMessage}
        />
      )}

      {/* TAB 3: LIVE PREVIEW */}
      {activeTab === 'preview' && (
        <PreviewTab
          coverUrl={coverUrl}
          priceType={priceType}
          priceAmount={priceAmount}
          title={title}
          organizerName={organizerName}
          location={location}
          fields={fields}
          previewAnswers={previewAnswers}
          setPreviewAnswers={setPreviewAnswers}
          setActiveTab={setActiveTab}
        />
      )}
    </div>
  );
}
