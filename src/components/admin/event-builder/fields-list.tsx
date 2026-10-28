'use client';

import React from 'react';
import { FormField, FieldType } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Copy,
} from 'lucide-react';

interface FieldsListProps {
  fields: FormField[];
  selectedFieldIndex: number;
  setSelectedFieldIndex: (index: number) => void;
  addField: (type: FieldType) => void;
  moveField: (index: number, direction: 'up' | 'down') => void;
  duplicateField: (index: number) => void;
  removeField: (index: number) => void;
}

const QUICK_TYPES: { label: string; type: FieldType }[] = [
  { label: 'Teks', type: 'text' },
  { label: 'Teks Panjang', type: 'textarea' },
  { label: 'WhatsApp', type: 'phone' },
  { label: 'Email', type: 'email' },
  { label: 'Angka', type: 'number' },
  { label: 'Pilihan', type: 'select' },
  { label: 'Upload', type: 'file' },
  { label: 'Repeater', type: 'repeater' },
];

export function FieldsList({
  fields,
  selectedFieldIndex,
  setSelectedFieldIndex,
  addField,
  moveField,
  duplicateField,
  removeField,
}: FieldsListProps) {
  return (
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
        {QUICK_TYPES.map((pt) => (
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
              className={`group flex items-center justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                isSelected
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
  );
}
