'use client';

import React from 'react';
import { FormField, FieldType } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FIELD_TYPE_OPTIONS } from './constants';
import { Plus, Trash2, Copy } from 'lucide-react';

interface FieldInspectorProps {
  selectedField: FormField | undefined;
  selectedFieldIndex: number;
  updateSelectedField: (patch: Partial<FormField>) => void;
  duplicateField: (index: number) => void;
  removeField: (index: number) => void;
}

export function FieldInspector({
  selectedField,
  selectedFieldIndex,
  updateSelectedField,
  duplicateField,
  removeField,
}: FieldInspectorProps) {
  return (
    <div className="lg:col-span-7">
      {selectedField ? (
        <div className="rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-5 animate-in fade-in duration-200">
          <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Pengaturan Field: {selectedField.label}
              </h3>
              <p className="text-[11px] text-neutral-400">
                Tipe:{' '}
                <span className="capitalize font-medium text-neutral-600 dark:text-neutral-300">
                  {selectedField.type}
                </span>
              </p>
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
                    ? selectedField.label
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .slice(0, 20)
                    : '';
                  updateSelectedField({
                    id: fallback || 'field_' + Math.random().toString(36).substring(2, 7),
                  });
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
            <div className="text-xs font-semibold uppercase text-neutral-400">Aturan Validasi</div>

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
                      options: [...currentOpts, { label: `Opsi ${idx}`, value: `opsi_${idx}` }],
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
                        const updated = (selectedField.options || []).filter((_, idx) => idx !== optIdx);
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
                    const newSubId =
                      'col_' +
                      (typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID().replace(/-/g, '').substring(0, 12)
                        : Math.random().toString(36).substring(2, 14));
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
                          const updated = (selectedField.subFields || []).filter((_, idx) => idx !== sfIdx);
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
                        <label className="text-[10px] text-neutral-400 block mb-1">Label Kolom</label>
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
                        <label className="text-[10px] text-neutral-400 block mb-1">Tipe Input</label>
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
          Pilih salah satu field di sebelah kiri untuk mengedit pengaturannya, atau klik{' '}
          <strong>Tambah Field</strong>.
        </div>
      )}
    </div>
  );
}
