'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  title?: string;
}

interface ToastContextType {
  toast: (options: { type?: 'success' | 'error' | 'info'; message: string; title?: string }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = 'info', message, title }: { type?: 'success' | 'error' | 'info'; message: string; title?: string }) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, message, title }]);
      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  const success = useCallback((message: string, title?: string) => toast({ type: 'success', message, title }), [toast]);
  const error = useCallback((message: string, title?: string) => toast({ type: 'error', message, title }), [toast]);
  const info = useCallback((message: string, title?: string) => toast({ type: 'info', message, title }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5 ${
              t.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
                : t.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
                : 'border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />}

            <div className="flex-1 text-sm">
              {t.title && <div className="font-semibold">{t.title}</div>}
              <div>{t.message}</div>
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
