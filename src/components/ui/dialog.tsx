'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { usePresence } from './use-presence';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

function useFocusTrap(open: boolean, onEscape?: () => void) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    const focusTimer = setTimeout(() => {
      const focusable = container?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      } else {
        container?.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onEscape) onEscape();
        return;
      }

      if (e.key === 'Tab' && container) {
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !container.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !container.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [open, onEscape]);

  return containerRef;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  ariaLabel = 'Dialog',
  ariaLabelledBy,
}: DialogProps) {
  const containerRef = useFocusTrap(open, () => onOpenChange(false));
  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 ${closing ? 'pointer-events-none' : ''}`}>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-xs ${closing ? 'animate-out fade-out' : 'animate-in fade-in'}`}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Content wrapper */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={!ariaLabelledBy ? ariaLabel : undefined}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={`relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 outline-none ${
          closing ? 'animate-out fade-out zoom-out-95' : 'animate-in fade-in zoom-in-95'
        }`}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
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
  side = 'right',
  ariaLabel = 'Panel Samping',
  ariaLabelledBy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: 'right' | 'left';
  ariaLabel?: string;
  ariaLabelledBy?: string;
}) {
  const containerRef = useFocusTrap(open, () => onOpenChange(false));
  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${closing ? 'pointer-events-none' : ''}`}>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-xs ${closing ? 'animate-out fade-out' : 'animate-in fade-in'}`}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className={`fixed inset-y-0 ${side === 'right' ? 'right-0' : 'left-0'} max-w-full flex`}>
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={!ariaLabelledBy ? ariaLabel : undefined}
          aria-labelledby={ariaLabelledBy}
          tabIndex={-1}
          className={`w-screen max-w-xl bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl p-6 overflow-y-auto relative outline-none ${
            closing ? 'animate-out slide-out-to-right' : 'animate-in slide-in-from-right'
          }`}
        >
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-sm p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
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

