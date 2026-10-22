'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FormField,
  FieldType,
  EventItem,
  PriceType,
  EventStatus,
} from '@/types';
import { BUILT_IN_TEMPLATES } from '@/lib/data-service';
import { saveEvent, formatRupiah } from '@/lib/store';
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
  Edit3,
  Copy,
  Sparkles,
  Calendar,
  DollarSign,
  FileText,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface EventBuilderProps {
  initialEvent?: Partial<EventItem>;
  isEdit?: boolean;
}

const FIELD_TYPE_OPTIONS: { label: string; value: FieldType; desc: string }[] = [
  { label: 'Teks Pendek', value: 'text', desc: 'Satu baris teks (nama, nama tim, instansi)' },
  { label: 'Teks Panjang', value: 'textarea', desc: 'Paragraf catatan, alamat, deskripsi' },
  { label: 'Angka (Number)', value: 'number', desc: 'Usia, nomor punggung, jumlah' },
  { label: 'Email', value: 'email', desc: 'Email dengan validasi format' },
  { label: 'Nomor HP / WhatsApp', value: 'phone', desc: 'Nomor telepon format kontak' },
  { label: 'Tanggal', value: 'date', desc: 'Pemilih tanggal lahir / jadwal' },
  { label: 'Dropdown (Select)', value: 'select', desc: 'Pilihan menu dropdown tunggal' },
  { label: 'Pilihan Tunggal (Radio)', value: 'radio', desc: 'Opsi radio button berdampingan' },
  { label: 'Pilihan Ganda (Checkbox)', value: 'checkbox', desc: 'Persetujuan syarat & ketentuan / multi-pilih' },
  { label: 'Upload Berkas (File)', value: 'file', desc: 'Unggah KTP, kartu pelajar, atau karya' },
  { label: 'Repeater / Grup Berulang', value: 'repeater', desc: 'Daftar dinamis (pemain tim: nama, no punggung, posisi)' },
];

export function EventBuilder({ initialEvent, isEdit = false }: EventBuilderProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'editor' | 'settings' | 'preview'>('editor');
  const [isSaving, setIsSaving] = useState(false);

  // Event Settings State
  const [title, setTitle] = useState(initialEvent?.title || '');
  const [slug, setSlug] = useState(initialEvent?.slug || '');
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

  // Form Fields State
  const [fields, setFields] = useState<FormField[]>(
    initialEvent?.form_schema || [
      {
        id: 'full_name',
        type: 'text',
        label: 'Nama Lengkap',
        placeholder: 'Nama sesuai KTP',
        validation: { required: true },
      },
    ]
  );

  // Active Field Editor selection
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    fields[0]?.id || null
  );

  // Preview State
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});

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
      if (tpl.template.location) setLocation(tpl.template.location);
      if (tpl.template.form_schema) {
        setFields(tpl.template.form_schema);
        setSelectedFieldId(tpl.template.form_schema[0]?.id || null);
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
    const newField: FormField = {
      id: newId,
      type,
      label: `Field Baru (${type})`,
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
              { id: 'sub_1', type: 'text', label: 'Nama', validation: { required: true } },
              { id: 'sub_2', type: 'number', label: 'Nomor', validation: { required: true } },
            ]
          : undefined,
    };
    const nextFields = [...fields, newField];
    setFields(nextFields);
    setSelectedFieldId(newId);
  };

  const removeField = (id: string) => {
    if (fields.length <= 1) {
      toast({ type: 'info', message: 'Minimal harus ada 1 field dalam formulir.' });
      return;
    }
    const nextFields = fields.filter((f) => f.id !== id);
    setFields(nextFields);
    if (selectedFieldId === id) {
      setSelectedFieldId(nextFields[0]?.id || null);
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    const nextFields = [...fields];
    const temp = nextFields[index];
    nextFields[index] = nextFields[targetIndex];
    nextFields[targetIndex] = temp;
    setFields(nextFields);
  };

  const updateSelectedField = (updates: Partial<FormField>) => {
    if (!selectedFieldId) return;
    setFields((prev) =>
      prev.map((f) => (f.id === selectedFieldId ? { ...f, ...updates } : f))
    );
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

    setIsSaving(true);
    try {
      const saved = await saveEvent({
        id: initialEvent?.id,
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        description: description.trim(),
        cover_url: coverUrl.trim(),
        location: location.trim(),
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        registration_deadline: deadline ? new Date(deadline).toISOString() : undefined,
        quota,
        price_type: priceType,
        price_amount: priceAmount,
        prefix_code: prefixCode.trim().toUpperCase(),
        status,
        form_schema: fields,
        wa_template: waTemplate.trim(),
        success_message: successMessage.trim(),
      });

      toast({
        type: 'success',
        title: 'Berhasil Disimpan!',
        message: `Event "${saved.title}" berhasil disimpan.`,
      });
      router.push('/admin/events');
    } catch (err: any) {
      toast({
        type: 'error',
        title: 'Gagal Menyimpan',
        message: err.message || 'Terjadi kesalahan sistem.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId);

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
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'editor'
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

      {/* TAB 1: FORM BUILDER EDITOR */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Fields List & Reordering */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Susunan Field Formulir
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addField('text')}
                  className="h-7 text-xs border-dashed gap-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>Tambah Field</span>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {fields.map((f, index) => {
                const isSelected = f.id === selectedFieldId;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFieldId(f.id)}
                    className={`group flex items-center justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-neutral-900 bg-white shadow-xs dark:border-neutral-100 dark:bg-neutral-800'
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
                          {f.validation?.required && (
                            <span className="text-[10px] text-red-500 font-bold">*Wajib</span>
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
                        className="p-1 rounded text-neutral-400 hover:text-neutral-900 disabled:opacity-20"
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
                        className="p-1 rounded text-neutral-400 hover:text-neutral-900 disabled:opacity-20"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeField(f.id);
                        }}
                        title="Hapus Field"
                        className="p-1 rounded text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Field Properties Inspector */}
          <div className="lg:col-span-7">
            {selectedField ? (
              <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-5">
                <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      Pengaturan Field: {selectedField.label}
                    </h3>
                    <p className="text-[11px] text-neutral-400">ID: {selectedField.id}</p>
                  </div>
                  <Badge variant="outline">{selectedField.type}</Badge>
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
                        {opt.label} - {opt.desc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Label & Placeholder */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                      Label Field <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="text"
                      value={selectedField.label}
                      onChange={(e) => updateSelectedField({ label: e.target.value })}
                      className="text-xs h-9"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                      Placeholder (Teks Contoh)
                    </label>
                    <Input
                      type="text"
                      value={selectedField.placeholder || ''}
                      onChange={(e) => updateSelectedField({ placeholder: e.target.value })}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                {/* Helper text */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    Helper Text (Petunjuk pengisian di bawah label)
                  </label>
                  <Input
                    type="text"
                    value={selectedField.helperText || ''}
                    onChange={(e) => updateSelectedField({ helperText: e.target.value })}
                    placeholder="Contoh: Format KTP, minimal 7 baris, dll."
                    className="text-xs h-9"
                  />
                </div>

                {/* Validation Rules */}
                <div className="space-y-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <div className="text-xs font-semibold uppercase text-neutral-400">
                    Aturan Validasi
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!selectedField.validation?.required}
                      onChange={(e) =>
                        updateSelectedField({
                          validation: { ...selectedField.validation, required: e.target.checked },
                        })
                      }
                      className="h-4 w-4 rounded-sm text-neutral-900"
                    />
                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      Wajib Diisi (Required)
                    </span>
                  </label>

                  {/* Min / Max for Repeater or Number */}
                  {(selectedField.type === 'number' || selectedField.type === 'repeater') && (
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">
                          {selectedField.type === 'repeater' ? 'Min. Baris' : 'Nilai Minimal'}
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
                          {selectedField.type === 'repeater' ? 'Maks. Baris' : 'Nilai Maksimal'}
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
                      {selectedField.options?.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <Input
                            type="text"
                            placeholder="Label Tampilan"
                            value={opt.label}
                            onChange={(e) => {
                              const updated = [...(selectedField.options || [])];
                              updated[oIdx] = { ...opt, label: e.target.value };
                              updateSelectedField({ options: updated });
                            }}
                            className="text-xs h-8 flex-1"
                          />
                          <Input
                            type="text"
                            placeholder="Nilai (value)"
                            value={opt.value}
                            onChange={(e) => {
                              const updated = [...(selectedField.options || [])];
                              updated[oIdx] = { ...opt, value: e.target.value };
                              updateSelectedField({ options: updated });
                            }}
                            className="text-xs h-8 w-32 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (selectedField.options || []).filter(
                                (_, idx) => idx !== oIdx
                              );
                              updateSelectedField({ options: updated });
                            }}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SubFields Manager (for Repeater / Group) */}
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
                              className="text-red-400 hover:text-red-600 p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-neutral-400">Label</label>
                              <Input
                                type="text"
                                value={sf.label}
                                onChange={(e) => {
                                  const updated = [...(selectedField.subFields || [])];
                                  updated[sfIdx] = { ...sf, label: e.target.value };
                                  updateSelectedField({ subFields: updated });
                                }}
                                className="text-xs h-7"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-neutral-400">Tipe</label>
                              <select
                                value={sf.type}
                                onChange={(e) => {
                                  const updated = [...(selectedField.subFields || [])];
                                  updated[sfIdx] = {
                                    ...sf,
                                    type: e.target.value as FieldType,
                                    options:
                                      e.target.value === 'select'
                                        ? [
                                            { label: 'Opsi 1', value: '1' },
                                            { label: 'Opsi 2', value: '2' },
                                          ]
                                        : undefined,
                                  };
                                  updateSelectedField({ subFields: updated });
                                }}
                                className="flex h-7 w-full rounded border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                              >
                                <option value="text">Teks Pendek</option>
                                <option value="number">Angka</option>
                                <option value="select">Dropdown</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-xs text-neutral-400">
                Pilih salah satu field di sebelah kiri untuk mengedit pengaturannya.
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
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Kuota Maksimal Pendaftar
              </label>
              <Input
                type="number"
                min={1}
                value={quota}
                onChange={(e) => setQuota(Number(e.target.value))}
                className="text-xs h-9"
              />
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

            {/* Deadline */}
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Batas Akhir Pendaftaran (Deadline)
              </label>
              <Input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* Cover Image URL */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                URL Banner / Cover Gambar
              </label>
              <Input
                type="url"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
                className="text-xs h-9"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Deskripsi & Ketentuan Event (Mendukung Markdown sederhana)
              </label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan detail event, regulasi, fasilitas peserta, dan total hadiah..."
                className="text-xs"
              />
            </div>
          </div>

          {/* Pricing Box */}
          <div className="border-t border-neutral-200 pt-5 dark:border-neutral-800 space-y-4">
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <span>Biaya & Skema Tarif Pendaftaran</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Model Biaya
                </label>
                <select
                  value={priceType}
                  onChange={(e) => setPriceType(e.target.value as PriceType)}
                  className="flex h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="fixed">Harga Tetap / Per Tim (Rp)</option>
                  <option value="per_participant">Dihitung Per Peserta (Berdasarkan Baris Repeater)</option>
                  <option value="free">Gratis (Tanpa Biaya)</option>
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
                    step={1000}
                    value={priceAmount}
                    onChange={(e) => setPriceAmount(Number(e.target.value))}
                    className="text-xs h-9 font-semibold"
                  />
                  <span className="text-[11px] text-neutral-400">
                    {formatRupiah(priceAmount)} {priceType === 'per_participant' ? '/peserta' : '/pendaftaran'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp & Success Templates */}
          <div className="border-t border-neutral-200 pt-5 dark:border-neutral-800 space-y-4">
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Template Pesan WhatsApp & Konfirmasi
            </h4>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Template Pesan Otomatis WhatsApp
                </label>
                <span className="text-[11px] text-neutral-400">
                  Variabel: &#123;event&#125;, &#123;kode&#125;, &#123;nama&#125;, &#123;total&#125;, &#123;bukti&#125;
                </span>
              </div>
              <Textarea
                rows={3}
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Pesan Sukses (Ditampilkan setelah pendaftar submit formulir)
              </label>
              <Input
                type="text"
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
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
              Mode Pratinjau Interaktif — Anda dapat menguji isian formulir publik secara langsung di sini.
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
              {location && <p className="text-xs text-neutral-500 mt-1">{location}</p>}
            </div>

            <div className="space-y-5 border-t border-neutral-100 pt-5 dark:border-neutral-800">
              {/* Contact preview inputs */}
              <div className="space-y-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                <div className="font-semibold text-xs text-neutral-400 uppercase">
                  Kontak Penanggung Jawab
                </div>
                <Input placeholder="Nama Lengkap *" disabled className="text-xs h-9" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nomor WhatsApp *" disabled className="text-xs h-9" />
                  <Input placeholder="Email Aktif *" disabled className="text-xs h-9" />
                </div>
              </div>

              {/* Dynamic Fields */}
              <div className="space-y-5">
                <div className="font-semibold text-xs text-neutral-400 uppercase">
                  Data Formulir
                </div>
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
