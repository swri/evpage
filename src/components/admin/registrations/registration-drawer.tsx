'use client';

import React from 'react';
import { Registration, RegistrationStatus } from '@/types';
import { Sheet } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaymentProofPreview } from '@/components/admin/payment-proof-preview';
import { formatIndoDate, formatRupiah } from '@/lib/utils';
import { Save, MessageSquare, ExternalLink, Edit } from 'lucide-react';

interface RegistrationDrawerProps {
  activeDetailReg: Registration | null;
  onClose: () => void;
  canVerify: boolean;
  canEdit: boolean;
  drawerStatus: RegistrationStatus;
  setDrawerStatus: (status: RegistrationStatus) => void;
  drawerNote: string;
  setDrawerNote: (note: string) => void;
  saveDrawerStatus: () => void;
  editMode: boolean;
  setEditMode: (edit: boolean) => void;
  editFormData: {
    contact_name: string;
    contact_phone: string;
    contact_email: string;
  };
  setEditFormData: React.Dispatch<
    React.SetStateAction<{
      contact_name: string;
      contact_phone: string;
      contact_email: string;
    }>
  >;
  saveContactEdit: () => void;
  generateRegistrantWALink: (reg: Registration) => string;
}

export function RegistrationDrawer({
  activeDetailReg,
  onClose,
  canVerify,
  canEdit,
  drawerStatus,
  setDrawerStatus,
  drawerNote,
  setDrawerNote,
  saveDrawerStatus,
  editMode,
  setEditMode,
  editFormData,
  setEditFormData,
  saveContactEdit,
  generateRegistrantWALink,
}: RegistrationDrawerProps) {
  return (
    <Sheet open={!!activeDetailReg} onOpenChange={(open) => !open && onClose()}>
      {activeDetailReg && (
        <div className="space-y-6">
          <div>
            <div className="text-xs uppercase font-bold text-neutral-400">
              Detail Registrasi Peserta
            </div>
            <div className="flex items-center justify-between mt-1">
              <h2 className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                {activeDetailReg.code}
              </h2>
              <Badge
                variant={
                  activeDetailReg.status === 'verified'
                    ? 'success'
                    : activeDetailReg.status === 'pending'
                    ? 'warning'
                    : 'destructive'
                }
              >
                {activeDetailReg.status === 'verified'
                  ? 'Terverifikasi'
                  : activeDetailReg.status === 'pending'
                  ? 'Menunggu'
                  : 'Ditolak'}
              </Badge>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Didaftarkan pada: {formatIndoDate(activeDetailReg.created_at, true)}
            </p>
          </div>

          {/* Status Controller Box (hidden for roles without registrations.verify) */}
          <div
            className={`rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/50 space-y-3 ${
              canVerify ? '' : 'hidden'
            }`}
          >
            <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 uppercase">
              Perbarui Status & Catatan
            </div>

            <div className="flex items-center gap-2">
              {(['verified', 'pending', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setDrawerStatus(st)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors cursor-pointer border ${
                    drawerStatus === st
                      ? st === 'verified'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : st === 'pending'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-neutral-700 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  {st === 'verified' ? 'Verifikasi' : st === 'pending' ? 'Menunggu' : 'Tolak'}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">
                Catatan Admin (terlihat oleh pendaftar di halaman cek status):
              </label>
              <Input
                type="text"
                placeholder="Contoh: Bukti transfer BCA valid Rp 750.000 / Bukti tidak jelas..."
                value={drawerNote}
                onChange={(e) => setDrawerNote(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <Button
              size="sm"
              onClick={saveDrawerStatus}
              className="w-full text-xs font-semibold h-8"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              Simpan Perubahan Status
            </Button>
          </div>

          {/* Direct WhatsApp Contact Button */}
          <div>
            <a
              href={generateRegistrantWALink(activeDetailReg)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Hubungi {activeDetailReg.contact_name} via WhatsApp</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-80" />
            </a>
          </div>

          {/* Payment Proof Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
              Bukti Pembayaran (Total: {formatRupiah(activeDetailReg.total_amount)})
            </h3>
            {activeDetailReg.payment_proof_path ? (
              <PaymentProofPreview path={activeDetailReg.payment_proof_path} />
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-400">
                Tidak ada bukti pembayaran yang diunggah (Event Gratis / Belum diupload)
              </div>
            )}
          </div>

          {/* Contact Information & Edit Mode */}
          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Data Kontak Penanggung Jawab
              </h3>
              <button
                type="button"
                onClick={() => setEditMode(!editMode)}
                disabled={!canEdit}
                className="text-xs text-neutral-600 dark:text-neutral-300 hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline"
              >
                <Edit className="h-3 w-3" />
                <span>{editMode ? 'Batal Edit' : 'Edit Kontak'}</span>
              </button>
            </div>

            {editMode ? (
              <div className="space-y-3 bg-neutral-50 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 dark:bg-neutral-800/40">
                <div>
                  <label className="text-[11px] text-neutral-500">Nama Kontak</label>
                  <Input
                    type="text"
                    value={editFormData.contact_name}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, contact_name: e.target.value })
                    }
                    className="text-xs h-8 mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-500">Nomor WhatsApp</label>
                  <Input
                    type="tel"
                    value={editFormData.contact_phone}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, contact_phone: e.target.value })
                    }
                    className="text-xs h-8 mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-500">Email</label>
                  <Input
                    type="email"
                    value={editFormData.contact_email}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, contact_email: e.target.value })
                    }
                    className="text-xs h-8 mt-1"
                  />
                </div>
                <Button size="sm" onClick={saveContactEdit} className="w-full text-xs h-8">
                  Simpan Perubahan Kontak
                </Button>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-neutral-400">Nama Kontak</dt>
                  <dd className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {activeDetailReg.contact_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Nomor WhatsApp</dt>
                  <dd className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {activeDetailReg.contact_phone}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-neutral-400">Email</dt>
                  <dd className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {activeDetailReg.contact_email}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {/* Custom Form Answers Breakdown */}
          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Seluruh Jawaban Formulir
            </h3>

            {activeDetailReg.schema_snapshot?.map((field) => {
              const answer = activeDetailReg.answers[field.id];

              if (field.type === 'repeater' && Array.isArray(answer)) {
                return (
                  <div
                    key={field.id}
                    className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/30"
                  >
                    <div className="font-semibold text-xs text-neutral-800 dark:text-neutral-200 mb-2">
                      {field.label} ({answer.length} baris):
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] text-left">
                        <thead className="border-b border-neutral-200 dark:border-neutral-700 text-neutral-400">
                          <tr>
                            <th className="py-1 px-2">#</th>
                            {field.subFields?.map((sf) => (
                              <th key={sf.id} className="py-1 px-2">
                                {sf.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                          {answer.map((row: Record<string, unknown>, rIdx: number) => (
                            <tr key={rIdx}>
                              <td className="py-1.5 px-2 text-neutral-400">{rIdx + 1}</td>
                              {field.subFields?.map((sf) => (
                                <td key={sf.id} className="py-1.5 px-2 font-medium">
                                  {String(row[sf.id] ?? '-')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }

              return (
                <div key={field.id} className="text-xs">
                  <span className="text-neutral-400">{field.label}:</span>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {Array.isArray(answer)
                      ? answer.join(', ')
                      : typeof answer === 'object' && answer !== null
                      ? (answer as { name?: string }).name || JSON.stringify(answer)
                      : (answer as string | number | undefined) || '-'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
