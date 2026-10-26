'use client';

import React, { useEffect, useState } from 'react';
import { HardDrive, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-context';
import { useOrg } from '@/components/admin/org-context';
import {
  findOrphanProofs,
  formatBytes,
  isEventFinished,
  purgeEventPaymentProofs,
  removeOrphanProofs,
  type OrphanProof,
} from '@/lib/cleanup';
import type { EventItem, Registration } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventItem;
  registrations: Registration[];
  onDone: () => void;
}

/**
 * Frees Storage for one event: all payment proofs once the event is over,
 * and orphan files (uploads whose registration failed) at any time.
 */
export function StorageCleanupDialog({ open, onOpenChange, event, registrations, onDone }: Props) {
  const { toast } = useToast();
  const { session, isPlatformAdmin } = useOrg();
  const [orphans, setOrphans] = useState<OrphanProof[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const finished = isEventFinished(event);
  const allowedNow = finished || isPlatformAdmin;
  const proofCount = registrations.filter((r) => r.payment_proof_path).length;

  useEffect(() => {
    if (!open) return;
    findOrphanProofs(event.id)
      .then(setOrphans)
      .catch((err: Error) => toast({ type: 'error', message: err.message }));
  }, [open, event.id, toast]);

  const run = async (action: () => Promise<{ removed: number }>, label: string) => {
    setBusy(true);
    try {
      const { removed } = await action();
      toast({ type: 'success', message: `${label}: ${removed} berkas dihapus.` });
      setConfirmText('');
      onDone();
      setOrphans(await findOrphanProofs(event.id));
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Pembersihan gagal' });
    } finally {
      setBusy(false);
    }
  };

  const orphanBytes = orphans.reduce((s, o) => s + o.size_bytes, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-5 text-sm">
        <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
          <HardDrive className="h-5 w-5" />
          <span>Bersihkan Penyimpanan Event</span>
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-neutral-500">Bukti bayar pendaftar</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {proofCount} pendaftar masih menyimpan bukti bayar. Setelah dihapus, status dan data pendaftar tetap ada;
            hanya gambar/PDF bukti yang hilang. <strong>Tidak bisa dibatalkan.</strong>
          </p>
          {!allowedNow && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Tersedia setelah event selesai: ubah status menjadi Ditutup atau tunggu tanggal mulai lewat.
            </p>
          )}
          {allowedNow && proofCount > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Ketik HAPUS untuk konfirmasi"
                aria-label="Konfirmasi penghapusan bukti bayar"
                className="h-9 flex-1 rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-800"
              />
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || confirmText.trim().toUpperCase() !== 'HAPUS'}
                onClick={() => run(() => purgeEventPaymentProofs(event, session), 'Bukti bayar dibersihkan')}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus semua bukti bayar
              </Button>
            </div>
          )}
          {isPlatformAdmin && !finished && (
            <p className="text-[11px] text-neutral-500">Sebagai super admin Anda dapat membersihkan sebelum event selesai.</p>
          )}
        </section>

        <section className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 className="text-xs font-semibold uppercase text-neutral-500">File yatim</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Unggahan yang tidak terhubung ke pendaftaran mana pun (pendaftaran gagal setelah upload), lebih dari 1 jam:{' '}
            <strong>
              {orphans.length} file ({formatBytes(orphanBytes)})
            </strong>
            .
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || orphans.length === 0}
            onClick={() => run(() => removeOrphanProofs(event.id), 'File yatim dibersihkan')}
          >
            Hapus file yatim
          </Button>
        </section>
      </div>
    </Dialog>
  );
}
