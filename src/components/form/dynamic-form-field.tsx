'use client';

import React from 'react';
import { FormField } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Upload, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { storeFormAttachment } from '@/lib/form-attachments';

interface DynamicFormFieldProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
  eventId?: string;
}

export function DynamicFormField({
  field,
  value,
  onChange,
  error,
  disabled,
  eventId
}: DynamicFormFieldProps) {
  const { id, type, label, placeholder, helperText, validation, options, subFields } = field;
  const isRequired = validation?.required;

  // File preview state helper
  const renderInput = () => {
    switch (type) {
      case 'text':
        return (
          <Input
            id={id}
            name={id}
            type="text"
            placeholder={placeholder}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : helperText ? `${id}-desc` : undefined}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={id}
            name={id}
            placeholder={placeholder}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={3}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : helperText ? `${id}-desc` : undefined}
          />
        );

      case 'number':
        return (
          <Input
            id={id}
            name={id}
            type="number"
            min={validation?.min}
            max={validation?.max}
            placeholder={placeholder}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={disabled}
            aria-invalid={!!error}
          />
        );

      case 'email':
        return (
          <Input
            id={id}
            name={id}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={placeholder || 'contoh@email.com'}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={!!error}
          />
        );

      case 'phone':
        return (
          <Input
            id={id}
            name={id}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder={placeholder || '08xxxxxxxxxx'}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={!!error}
          />
        );

      case 'date':
        return (
          <Input
            id={id}
            name={id}
            type="date"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={!!error}
          />
        );

      case 'select':
        return (
          <div className="relative">
            <select
              id={id}
              name={id}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:ring-neutral-100"
              aria-invalid={!!error}
            >
              <option value="">{placeholder || '-- Pilih salah satu --'}</option>
              {options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2 pt-1" role="radiogroup" aria-labelledby={`${id}-label`}>
            {options?.map((opt) => {
              const isChecked = value === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    isChecked
                      ? 'border-neutral-900 bg-neutral-50/80 dark:border-neutral-100 dark:bg-neutral-800/60'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name={id}
                    value={opt.value}
                    checked={isChecked}
                    onChange={() => onChange(opt.value)}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 text-neutral-900 accent-neutral-900 focus:ring-neutral-900"
                  />
                  <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        );

      case 'checkbox':
        const checkedValues: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2 pt-1">
            {options?.map((opt) => {
              const isChecked = checkedValues.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    isChecked
                      ? 'border-neutral-900 bg-neutral-50/80 dark:border-neutral-100 dark:bg-neutral-800/60'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    value={opt.value}
                    checked={isChecked}
                    disabled={disabled}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChange([...checkedValues, opt.value]);
                      } else {
                        onChange(checkedValues.filter((v) => v !== opt.value));
                      }
                    }}
                    className="mt-0.5 h-4 w-4 rounded-sm text-neutral-900 accent-neutral-900 focus:ring-neutral-900"
                  />
                  <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        );

      case 'file':
        return (
          <FileInputField
            id={id}
            value={value}
            disabled={disabled}
            onChange={onChange}
            eventId={eventId}
          />
        );

      case 'repeater': {
        const rows: any[] = Array.isArray(value) ? value : [];
        const minRows = validation?.min ?? 1;
        const maxRows = validation?.max ?? 20;

        const addRow = () => {
          if (rows.length >= maxRows) return;
          const newRow: Record<string, any> = {};
          subFields?.forEach((sf) => {
            newRow[sf.id] = '';
          });
          onChange([...rows, newRow]);
        };

        const removeRow = (index: number) => {
          if (rows.length <= minRows && rows.length === 1) return;
          onChange(rows.filter((_, idx) => idx !== index));
        };

        const updateRowField = (rowIndex: number, fieldId: string, fieldValue: any) => {
          const updated = [...rows];
          updated[rowIndex] = {
            ...updated[rowIndex],
            [fieldId]: fieldValue
          };
          onChange(updated);
        };

        return (
          <div className="space-y-4">
            {rows.map((row, index) => (
              <div
                key={index}
                className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50"
              >
                <div className="mb-3 flex items-center justify-between border-b border-neutral-200 pb-2 dark:border-neutral-800">
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                    {label} #{index + 1}
                  </span>
                  {rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(index)}
                      className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Hapus
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {subFields?.map((sf) => (
                    <div key={sf.id} className="space-y-1">
                      <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {sf.label} {sf.validation?.required && <span className="text-red-500">*</span>}
                      </label>
                      {sf.type === 'select' ? (
                        <select
                          value={row[sf.id] ?? ''}
                          onChange={(e) => updateRowField(index, sf.id, e.target.value)}
                          className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        >
                          <option value="">{sf.placeholder || '-- Pilih --'}</option>
                          {sf.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={sf.type === 'number' ? 'number' : 'text'}
                          placeholder={sf.placeholder}
                          value={row[sf.id] ?? ''}
                          onChange={(e) =>
                            updateRowField(
                              index,
                              sf.id,
                              sf.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
                            )
                          }
                          className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                disabled={disabled || rows.length >= maxRows}
                className="border-dashed text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Tambah {label} ({rows.length}/{maxRows})
              </Button>
              {validation?.min && (
                <span className="text-xs text-neutral-400">
                  Wajib min. {validation.min} baris
                </span>
              )}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-1.5 notion-block py-1">
      {type !== 'repeater' && (
        <label
          id={`${id}-label`}
          htmlFor={id}
          className="block text-sm font-medium text-neutral-800 dark:text-neutral-200"
        >
          {label}{' '}
          {isRequired && <span className="text-red-500 font-semibold">*</span>}
        </label>
      )}

      {type === 'repeater' && (
        <div className="flex items-baseline justify-between mb-1">
          <label className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {label}{' '}
            {isRequired && <span className="text-red-500 font-semibold">*</span>}
          </label>
        </div>
      )}

      {helperText && (
        <p id={`${id}-desc`} className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          {helperText}
        </p>
      )}

      {renderInput()}

      {error && (
        <div id={`${id}-error`} className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mt-1.5 animate-in fade-in">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function FileInputField({
  id,
  value,
  disabled,
  onChange,
  eventId = 'form-uploads',
}: {
  id: string;
  value: any;
  disabled?: boolean;
  onChange: (val: any) => void;
  eventId?: string;
}) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setIsUploading(true);
    try {
      const stored = await storeFormAttachment(eventId, file);
      onChange(stored);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunggah berkas.');
    } finally {
      setIsUploading(false);
    }
  };

  const fileData = React.useMemo(() => {
    if (typeof value === 'object' && value !== null) {
      return value as { name?: string; size?: number; type?: string; url?: string };
    }
    if (typeof value === 'string' && value.trim()) {
      const isImg = value.startsWith('data:image') || /\.(jpg|jpeg|png|webp)($|\?)/i.test(value);
      return {
        name: isImg ? 'Gambar Terunggah' : 'Berkas Terunggah',
        url: value,
        type: isImg ? 'image/jpeg' : 'application/octet-stream',
      };
    }
    return null;
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label
          className={`relative inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 cursor-pointer dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 transition-colors ${
            disabled || isUploading ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-neutral-500" /> : <Upload className="h-4 w-4" />}
          <span>{isUploading ? 'Mengunggah...' : 'Pilih Berkas'}</span>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileUpload}
            disabled={disabled || isUploading}
            className="sr-only"
          />
        </label>

        {fileData && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-red-600 hover:underline dark:text-red-400"
          >
            Hapus file
          </button>
        )}
      </div>

      {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}

      {fileData && (
        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/50">
          {fileData.type?.startsWith('image/') ||
          (typeof fileData.url === 'string' &&
            (fileData.url.startsWith('data:image') || /\.(jpg|jpeg|png|webp)($|\?)/i.test(fileData.url))) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileData.url}
              alt={fileData.name}
              className="h-12 w-12 rounded object-cover border border-neutral-200 dark:border-neutral-700"
            />
          ) : (
            <FileText className="h-8 w-8 text-neutral-500" />
          )}
          <div className="overflow-hidden flex-1">
            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {fileData.name}
            </div>
            <div className="text-xs text-neutral-500">
              {fileData.size ? `${(fileData.size / 1024).toFixed(1)} KB` : 'Berkas Terunggah'}
            </div>
          </div>
          {fileData.url && (
            <a
              href={fileData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 underline shrink-0"
            >
              Lihat
            </a>
          )}
        </div>
      )}
    </div>
  );
}

