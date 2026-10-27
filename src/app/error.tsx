'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled runtime error in application:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf9] dark:bg-[#09090b] p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div>
          <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            Terjadi Kesalahan pada Aplikasi
          </h1>
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {error.message || 'Halaman mengalami kendala saat memuat data. Silakan coba kembali.'}
          </p>
          {error.digest && (
            <span className="mt-2 inline-block rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-mono text-neutral-500 dark:bg-neutral-800">
              Kode Error: {error.digest}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
          <Button
            onClick={() => reset()}
            className="w-full sm:w-auto text-xs h-9 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Coba Lagi</span>
          </Button>

          <Link href="/" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full sm:w-auto text-xs h-9 gap-1.5"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Ke Beranda</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
