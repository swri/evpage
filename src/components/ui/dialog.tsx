'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { usePresence } from './use-presence';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);

  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 ${closing ? 'pointer-events-none' : ''}`}>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-xs ${closing ? 'animate-out fade-out' : 'animate-in fade-in'}`}
        onClick={() => onOpenChange(false)}
      />
      {/* Content wrapper */}
      <div
        className={`relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 ${
          closing ? 'animate-out fade-out zoom-out-95' : 'animate-in fade-in zoom-in-95'
        }`}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          aria-label="Tutup dialog"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

// Side Sheet / Drawer for detail views (e.g. registration details drawer in admin)
export function Sheet({
  open,
  onOpenChange,
  children,
  side = 'right'
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: 'right' | 'left';
}) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${closing ? 'pointer-events-none' : ''}`}>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-xs ${closing ? 'animate-out fade-out' : 'animate-in fade-in'}`}
        onClick={() => onOpenChange(false)}
      />
      <div className={`fixed inset-y-0 ${side === 'right' ? 'right-0' : 'left-0'} max-w-full flex`}>
        <div
          className={`w-screen max-w-xl bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl p-6 overflow-y-auto relative ${
            closing ? 'animate-out slide-out-to-right' : 'animate-in slide-in-from-right'
          }`}
        >
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-sm p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            aria-label="Tutup panel"
          >
            <X className="h-5 w-5" />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
