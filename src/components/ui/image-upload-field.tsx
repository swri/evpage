'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, Link as LinkIcon, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { storeFormAttachment } from '@/lib/form-attachments';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  maxSizeMB?: number;
  aspectRatio?: 'video' | 'square' | 'any';
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

export function ImageUploadField({
  label,
  value,
  onChange,
  folder = 'images',
  maxSizeMB = 2,
  aspectRatio = 'any',
  helperText,
  placeholder = 'https://...',
  disabled = false,
}: ImageUploadFieldProps) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);

    // Validate mime type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Format file harus JPG, PNG, WEBP, atau SVG.');
      return;
    }

    // Validate size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setErrorMsg(`Ukuran gambar maksimal ${maxSizeMB} MB.`);
      return;
    }

    setIsUploading(true);
    try {
      const stored = await storeFormAttachment(folder, file);
      onChange(stored.url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunggah gambar.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    onChange('');
    setErrorMsg(null);
  };

  const aspectClass =
    aspectRatio === 'video'
      ? 'aspect-video'
      : aspectRatio === 'square'
      ? 'aspect-square max-w-[120px]'
      : 'max-h-48';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'upload' ? 'url' : 'upload');
            setErrorMsg(null);
          }}
          className="text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 underline cursor-pointer inline-flex items-center gap-1"
        >
          {mode === 'upload' ? (
            <>
              <LinkIcon className="h-3 w-3" />
              <span>Gunakan URL Mentah</span>
            </>
          ) : (
            <>
              <Upload className="h-3 w-3" />
              <span>Upload dari Perangkat</span>
            </>
          )}
        </button>
      </div>

      {mode === 'url' ? (
        <div className="space-y-2">
          <Input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="text-xs h-9"
          />
        </div>
      ) : (
        <div className="space-y-2">
          {!value ? (
            <div
              onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4 text-center cursor-pointer hover:border-neutral-400 hover:bg-neutral-100/60 dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:border-neutral-700 transition-colors ${
                disabled || isUploading ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-1.5 py-2">
                  <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Mengunggah gambar...
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200/80 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    <Upload className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mt-1">
                    Klik untuk memilih gambar
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    JPG, PNG, WEBP, atau SVG (maks. {maxSizeMB} MB)
                  </span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                onChange={handleFileChange}
                disabled={disabled || isUploading}
                className="sr-only"
              />
            </div>
          ) : (
            <div className="relative rounded-xl border border-neutral-200 bg-neutral-100 overflow-hidden dark:border-neutral-800 dark:bg-neutral-900 group">
              <div className={`w-full overflow-hidden flex items-center justify-center ${aspectClass}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={value}
                  alt={label}
                  className="w-full h-full object-contain max-h-48"
                  onError={(e) => {
                    // Fallback on broken image link
                    (e.currentTarget as HTMLImageElement).src = '/icon.svg';
                  }}
                />
              </div>

              <div className="flex items-center justify-between border-t border-neutral-200 bg-white/95 px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-900/95">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white font-medium"
                >
                  Ganti
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  <span>Hapus</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                onChange={handleFileChange}
                disabled={disabled || isUploading}
                className="sr-only"
              />
            </div>
          )}
        </div>
      )}

      {errorMsg && <p className="text-[11px] text-red-500 font-medium">{errorMsg}</p>}

      {helperText && <p className="text-[11px] text-neutral-400">{helperText}</p>}
    </div>
  );
}
