'use client';

import React from 'react';
import {
  MapPin,
  Calendar,
  Clock,
  Building2,
  Users,
  CreditCard,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  InfoCardId,
  ALL_INFO_CARDS,
  DEFAULT_CARD_ORDER,
} from '@/lib/info-cards';
import { Button } from '@/components/ui/button';

interface CardOrderManagerProps {
  cardOrder: InfoCardId[];
  setCardOrder: React.Dispatch<React.SetStateAction<InfoCardId[]>>;
  hiddenCards: InfoCardId[];
  setHiddenCards: React.Dispatch<React.SetStateAction<InfoCardId[]>>;
}

const CARD_ICONS: Record<InfoCardId, React.ComponentType<{ className?: string }>> = {
  location: MapPin,
  time: Calendar,
  deadline: Clock,
  organizer: Building2,
  quota: Users,
  price: CreditCard,
};

const CARD_COLORS: Record<InfoCardId, { bg: string; text: string; border: string }> = {
  location: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200/80 dark:border-rose-900/60',
  },
  time: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200/80 dark:border-blue-900/60',
  },
  deadline: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200/80 dark:border-amber-900/60',
  },
  organizer: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200/80 dark:border-purple-900/60',
  },
  quota: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200/80 dark:border-emerald-900/60',
  },
  price: {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200/80 dark:border-teal-900/60',
  },
};

export function CardOrderManager({
  cardOrder,
  setCardOrder,
  hiddenCards,
  setHiddenCards,
}: CardOrderManagerProps) {
  const moveCard = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cardOrder.length) return;

    const newOrder = [...cardOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    setCardOrder(newOrder);
  };

  const toggleVisibility = (id: InfoCardId) => {
    if (hiddenCards.includes(id)) {
      setHiddenCards(hiddenCards.filter((cardId) => cardId !== id));
    } else {
      setHiddenCards([...hiddenCards, id]);
    }
  };

  const resetToDefault = () => {
    setCardOrder([...DEFAULT_CARD_ORDER]);
    setHiddenCards([]);
  };

  const isCustomized =
    JSON.stringify(cardOrder) !== JSON.stringify(DEFAULT_CARD_ORDER) ||
    hiddenCards.length > 0;

  return (
    <div className="md:col-span-2 space-y-3 rounded-2xl border border-neutral-200/90 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
            Urutan & Visibilitas Kartu Informasi Event
          </label>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block mt-0.5">
            Atur urutan tampilan kartu informasi (Lokasi, Waktu, Kuota, dll.) di halaman pendaftaran publik /e/[slug].
          </span>
        </div>

        {isCustomized && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            className="h-7 text-xs gap-1.5 px-2.5 bg-white dark:bg-neutral-800"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Urutan Bawaan</span>
          </Button>
        )}
      </div>

      {/* List of cards with reorder & visibility controls */}
      <div className="space-y-2 pt-1">
        {cardOrder.map((cardId, index) => {
          const meta = ALL_INFO_CARDS.find((c) => c.id === cardId);
          if (!meta) return null;

          const Icon = CARD_ICONS[cardId];
          const colors = CARD_COLORS[cardId];
          const isHidden = hiddenCards.includes(cardId);

          return (
            <div
              key={cardId}
              className={`flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl border transition-all ${
                isHidden
                  ? 'border-neutral-200/60 bg-neutral-100/60 opacity-60 dark:border-neutral-800 dark:bg-neutral-950/40'
                  : 'border-neutral-200 bg-white shadow-2xs hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-850 dark:hover:border-neutral-700'
              }`}
            >
              {/* Left: Position & Icon & Info */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 shrink-0">
                  {index + 1}
                </span>

                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-lg border ${colors.bg} ${colors.text} ${colors.border} shrink-0`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                      {meta.title}
                    </span>
                    {isHidden && (
                      <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        Disembunyikan
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate hidden sm:block">
                    {meta.description}
                  </p>
                </div>
              </div>

              {/* Right: Controls (Move Up, Move Down, Toggle Eye) */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => moveCard(index, 'up')}
                  disabled={index === 0}
                  title="Geser Naik"
                  className="p-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(index, 'down')}
                  disabled={index === cardOrder.length - 1}
                  title="Geser Turun"
                  className="p-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleVisibility(cardId)}
                  title={isHidden ? 'Tampilkan Kartu' : 'Sembunyikan Kartu'}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                    isHidden
                      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                >
                  {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
