'use client';

import React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface RejectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rejectNote: string;
  setRejectNote: (note: string) => void;
  onConfirm: () => void;
}

export function RejectModal({
  open,
  onOpenChange,
  rejectNote,
  setRejectNote,
  onConfirm,
}: RejectModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-red-600 font-bold">
          <AlertTriangle className="h-5 w-5" />
          <span>Tolak Pendaftaran</span>
        </div>

        <p className="text-xs text-neutral-500">
          Berikan alasan penolakan. Catatan ini akan ditampilkan kepada pendaftar saat mereka memeriksa status kode tiket.
        </p>

        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
            Catatan Penolakan:
          </label>
          <Input
            type="text"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Contoh: Bukti bayar buram atau nominal tidak sesuai."
            className="text-xs"
            required
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Batal
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            className="text-xs font-semibold"
          >
            Konfirmasi Tolak
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
