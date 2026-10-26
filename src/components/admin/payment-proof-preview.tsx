'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, FileText, ShieldAlert } from 'lucide-react';
import { inlineProofUrl, isPdfProof, resolvePaymentProofUrl } from '@/lib/payment-proof';

/** Small table cell: inline images only (no signed-URL request per row). */
export function PaymentProofThumb({ path }: { path?: string }) {
  if (!path) return <span className="text-neutral-400 text-[11px]">-</span>;
  const inline = inlineProofUrl(path);
  if (inline && !isPdfProof(path)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={inline} alt="Bukti" className="h-full w-full object-cover group-hover:opacity-80 transition-opacity" />;
  }
  return <FileText className="m-auto h-5 w-5 text-neutral-500" aria-label="Bukti tersimpan" />;
}

/** Detail view: resolves a signed URL for stored files, rejects unsafe values. */
export function PaymentProofPreview({ path }: { path: string }) {
  const [state, setState] = useState<{ url: string | null; error?: string; loading: boolean }>({
    url: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    resolvePaymentProofUrl(path)
      .then((url) => !cancelled && setState({ url, loading: false }))
      .catch((err: Error) => !cancelled && setState({ url: null, loading: false, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (state.loading) {
    return <div className="h-24 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />;
  }
  if (!state.url) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>{state.error || 'Bukti pembayaran tidak dapat ditampilkan (format tidak dikenal atau tidak aman).'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!isPdfProof(path) && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.url} alt="Bukti Transfer" className="w-full max-h-72 object-contain" />
        </div>
      )}
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        <span>{isPdfProof(path) ? 'Buka Bukti (PDF)' : 'Buka Bukti Gambar Ukuran Penuh'}</span>
      </a>
    </div>
  );
}
