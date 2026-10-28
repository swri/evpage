'use client';

import React from 'react';
import { FormField, PriceType, QuotaMode } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicFormField } from '@/components/form/dynamic-form-field';
import { formatRupiah, fromWIBDateTimeInput } from '@/lib/utils';
import { Eye } from 'lucide-react';
import { EventInfoCards } from '@/components/event/event-info-cards';
import { InfoCardId, DEFAULT_CARD_ORDER } from '@/lib/info-cards';

interface PreviewTabProps {
  coverUrl: string;
  priceType: PriceType;
  priceAmount: number | '';
  title: string;
  description?: string;
  organizerName: string;
  location: string;
  locationUrl?: string;
  startsAt?: string;
  deadline?: string;
  quota?: number | '';
  quotaMode?: QuotaMode;
  cardOrder?: InfoCardId[];
  hiddenCards?: InfoCardId[];
  fields: FormField[];
  previewAnswers: Record<string, unknown>;
  setPreviewAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  setActiveTab: (tab: 'editor' | 'settings' | 'preview') => void;
}

export function PreviewTab({
  coverUrl,
  priceType,
  priceAmount,
  title,
  description,
  organizerName,
  location,
  locationUrl,
  startsAt,
  deadline,
  quota,
  quotaMode,
  cardOrder,
  hiddenCards,
  fields,
  previewAnswers,
  setPreviewAnswers,
  setActiveTab,
}: PreviewTabProps) {
  return (
    <div className="space-y-4 animate-in fade-in">
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
              {priceType === 'free' ? 'Gratis' : formatRupiah(priceAmount || 0)}
            </Badge>
          </div>
          <h2 className="text-2xl font-extrabold text-neutral-900 dark:text-neutral-100">
            {title || 'Judul Event'}
          </h2>

          {/* Event Information Cards in Live Preview */}
          <EventInfoCards
            event={{
              title: title || 'Judul Event',
              organizer_name: organizerName,
              location,
              location_url: locationUrl,
              starts_at: startsAt ? fromWIBDateTimeInput(startsAt) : undefined,
              registration_deadline: deadline ? fromWIBDateTimeInput(deadline) : undefined,
              quota: quota === '' ? 0 : Number(quota),
              price_type: priceType,
              price_amount: priceAmount === '' ? 0 : Number(priceAmount),
            }}
            cardOrder={cardOrder || DEFAULT_CARD_ORDER}
            hiddenCards={hiddenCards || []}
            remainingQuota={quota === '' || quota === 0 ? null : Number(quota)}
            quotaUnit={quotaMode === 'participant' ? 'peserta' : 'slot'}
            previewMode
          />
        </div>

        {description && (
          <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 text-xs leading-relaxed text-neutral-700 whitespace-pre-line break-words dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300">
            {description}
          </div>
        )}

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
  );
}
