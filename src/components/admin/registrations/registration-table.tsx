'use client';

import React from 'react';
import { Registration, RegistrationStatus } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PaymentProofThumb } from '@/components/admin/payment-proof-preview';
import { formatIndoDate, formatRupiah, formatTicketCode } from '@/lib/utils';
import { RegistrationStatsData } from './registration-stats';
import {
  Search,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Square,
  Eye,
  MessageSquare,
  Trash2,
  UserCheck,
  ArrowUpCircle,
} from 'lucide-react';

const BADGE_IN = 'animate-in fade-in zoom-in-95';

interface RegistrationTableProps {
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: 'all' | RegistrationStatus;
  setStatusFilter: (status: 'all' | RegistrationStatus) => void;
  stats: RegistrationStatsData;
  selectedIds: string[];
  toggleSelectAll: () => void;
  toggleSelectRow: (id: string) => void;
  filteredRegistrations: Registration[];
  paginatedRegistrations: Registration[];
  pageSize: number;
  setPageSize: (size: number) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  canVerify: boolean;
  canCheckIn: boolean;
  canEdit: boolean;
  openDetail: (reg: Registration) => void;
  handleVerify: (id: string) => void;
  openRejectModal: (id: string) => void;
  handlePromote: (id: string) => void;
  handleCheckIn: (reg: Registration) => void;
  handleDelete: (id: string, code: string) => void;
  handleBulkVerify: () => void;
  handleBulkReject: () => void;
  setSelectedIds: (ids: string[]) => void;
  generateRegistrantWALink: (reg: Registration) => string;
}

export function RegistrationTable({
  loading,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  stats,
  selectedIds,
  toggleSelectAll,
  toggleSelectRow,
  filteredRegistrations,
  paginatedRegistrations,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  totalPages,
  canVerify,
  canCheckIn,
  canEdit,
  openDetail,
  handleVerify,
  openRejectModal,
  handlePromote,
  handleCheckIn,
  handleDelete,
  handleBulkVerify,
  handleBulkReject,
  setSelectedIds,
  generateRegistrantWALink,
}: RegistrationTableProps) {
  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <Input
            type="text"
            placeholder="Cari nama, kode tiket, nomor WA, email, nama tim..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'pending', 'verified', 'waitlisted', 'rejected'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === st
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              {st === 'all'
                ? `Semua (${stats.total})`
                : st === 'pending'
                ? `Menunggu (${stats.pending})`
                : st === 'verified'
                ? `Terverifikasi (${stats.verified})`
                : st === 'waitlisted'
                ? `Daftar Tunggu (${stats.waitlisted})`
                : `Ditolak (${stats.rejected})`}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions Banner (appears when items are selected) */}
      {selectedIds.length > 0 && canVerify && (
        <div className="flex items-center justify-between rounded-lg bg-neutral-100 px-4 py-2.5 dark:bg-neutral-800 animate-in fade-in">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {selectedIds.length} pendaftar dipilih
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkVerify}
              className="h-7 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Verifikasi Terpilih
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkReject}
              className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Tolak Terpilih
            </Button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-neutral-500 hover:underline ml-2"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* DATA TABLE */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              <th className="p-3 w-10 text-center">
                <button onClick={toggleSelectAll} className="cursor-pointer text-neutral-600 dark:text-neutral-300">
                  {selectedIds.length > 0 && selectedIds.length === filteredRegistrations.length ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              </th>
              <th className="p-3">Kode Tiket</th>
              <th className="p-3">Kontak Pendaftar</th>
              <th className="p-3">Ringkasan Jawaban</th>
              <th className="p-3">Total Biaya</th>
              <th className="p-3">Bukti Bayar</th>
              <th className="p-3">Status</th>
              <th className="p-3">Tanggal</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-neutral-400">
                  Memuat data pendaftar...
                </td>
              </tr>
            ) : filteredRegistrations.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-12 text-center text-neutral-400">
                  Tidak ada pendaftar yang cocok dengan filter atau pencarian.
                </td>
              </tr>
            ) : (
              paginatedRegistrations.map((reg) => {
                const isSelected = selectedIds.includes(reg.id);

                const primaryAnswer =
                  reg.answers?.team_name ||
                  reg.answers?.full_name ||
                  reg.answers?.participant_name ||
                  Object.values(reg.answers || {})[0] ||
                  '-';

                return (
                  <tr
                    key={reg.id}
                    className={`transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 ${
                      isSelected ? 'bg-neutral-100/60 dark:bg-neutral-800/60' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => toggleSelectRow(reg.id)}
                        className="cursor-pointer text-neutral-600 dark:text-neutral-300"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-neutral-900 dark:text-white" />
                        ) : (
                          <Square className="h-4 w-4 text-neutral-400" />
                        )}
                      </button>
                    </td>

                    {/* Code */}
                    <td className="p-3 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      {formatTicketCode(reg.code)}
                    </td>

                    {/* Contact Info with WA Icon */}
                    <td className="p-3">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {reg.contact_name}
                      </div>
                      <div className="flex items-center gap-1.5 text-neutral-500 mt-0.5">
                        <span>{reg.contact_phone}</span>
                        <a
                          href={generateRegistrantWALink(reg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Chat via WhatsApp"
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <div className="text-[11px] text-neutral-400">{reg.contact_email}</div>
                    </td>

                    {/* Primary Answer */}
                    <td className="p-3 max-w-[200px]">
                      <div className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                        {String(primaryAnswer)}
                      </div>
                      {Array.isArray(reg.answers?.players) && (
                        <div className="text-[11px] text-neutral-400">
                          {reg.answers.players.length} Pemain terdaftar
                        </div>
                      )}
                    </td>

                    {/* Total Amount */}
                    <td className="p-3 font-semibold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                      {reg.total_amount === 0 ? 'Gratis' : formatRupiah(reg.total_amount)}
                    </td>

                    {/* Payment Proof Thumbnail */}
                    <td className="p-3">
                      {reg.payment_proof_path ? (
                        <button
                          type="button"
                          onClick={() => openDetail(reg)}
                          className="group relative h-10 w-10 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700 cursor-pointer"
                        >
                          <PaymentProofThumb path={reg.payment_proof_path} />
                        </button>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="p-3">
                      {reg.status === 'verified' && (
                        <Badge variant="success" className={BADGE_IN}>
                          Terverifikasi
                        </Badge>
                      )}
                      {reg.status === 'pending' && (
                        <Badge variant="warning" className={BADGE_IN}>
                          Menunggu
                        </Badge>
                      )}
                      {reg.status === 'rejected' && (
                        <Badge variant="destructive" className={BADGE_IN}>
                          Ditolak
                        </Badge>
                      )}
                      {reg.status === 'waitlisted' && (
                        <Badge variant="info" className={BADGE_IN}>
                          Daftar Tunggu
                        </Badge>
                      )}
                      {reg.checked_in_at && (
                        <Badge variant="secondary" className={`mt-1 ${BADGE_IN}`}>
                          Hadir
                        </Badge>
                      )}
                    </td>

                    {/* Date */}
                    <td className="p-3 text-neutral-500 whitespace-nowrap text-[11px]">
                      {formatIndoDate(reg.created_at, false)}
                    </td>

                    {/* Action buttons */}
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {/* Detail Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetail(reg)}
                          title="Lihat Detail & Bukti"
                          className="h-7 w-7 p-0"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>

                        {/* Waitlist promotion */}
                        {reg.status === 'waitlisted' && canVerify && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePromote(reg.id)}
                            title="Pindahkan dari daftar tunggu"
                            aria-label={`Pindahkan ${formatTicketCode(reg.code)} dari daftar tunggu`}
                            className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          >
                            <ArrowUpCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Attendance */}
                        {reg.status === 'verified' && canCheckIn && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCheckIn(reg)}
                            title={reg.checked_in_at ? 'Batalkan check-in' : 'Check-in (hadir)'}
                            aria-label={
                              reg.checked_in_at
                                ? `Batalkan check-in ${formatTicketCode(reg.code)}`
                                : `Check-in ${formatTicketCode(reg.code)}`
                            }
                            aria-pressed={!!reg.checked_in_at}
                            className={`h-7 w-7 p-0 ${
                              reg.checked_in_at
                                ? 'text-neutral-900 bg-neutral-100 dark:text-white dark:bg-neutral-800'
                                : 'text-neutral-500'
                            }`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Quick Verify */}
                        {reg.status !== 'verified' && reg.status !== 'waitlisted' && canVerify && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVerify(reg.id)}
                            title="Verifikasi"
                            className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Quick Reject */}
                        {reg.status !== 'rejected' && canVerify && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRejectModal(reg.id)}
                            title="Tolak Pendaftaran"
                            className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(reg.id, formatTicketCode(reg.code))}
                          title="Hapus"
                          disabled={!canEdit}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredRegistrations.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center gap-2">
            <span>Baris per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-neutral-400">|</span>
            <span>
              Menampilkan {(currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, filteredRegistrations.length)} dari{' '}
              {filteredRegistrations.length} data
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-7 px-2.5 text-xs"
            >
              Sebelumnya
            </Button>
            <div className="px-2 font-medium">
              Halaman {currentPage} dari {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-7 px-2.5 text-xs"
            >
              Selanjutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
