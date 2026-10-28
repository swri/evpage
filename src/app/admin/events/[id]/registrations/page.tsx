'use client';

import React, { useState, useEffect, useMemo, useRef, use, useCallback } from 'react';
import Link from 'next/link';
import {
  getEventById,
  getRegistrationsByEvent,
  updateRegistrationStatus,
  updateRegistrationData,
  deleteRegistration,
  promoteFromWaitlist,
  setCheckIn,
} from '@/lib/store';
import { formatRupiah, formatTicketCode, cleanTicketCode } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { EventItem, Registration, RegistrationStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Shuffle,
  HardDrive,
} from 'lucide-react';
import { sanitizeCsvRow, downloadCsv, downloadExcel } from '@/lib/export';
import { useOrg } from '@/components/admin/org-context';
import { resolveEventType } from '@/lib/event-types';
import { buildParticipantMessage } from '@/lib/notifications';
import { StorageCleanupDialog } from '@/components/admin/storage-cleanup-dialog';
import { refreshPublicPages } from '@/lib/public-refresh';
import { RandomTeamModal } from '@/components/admin/random-team-modal';

import { RegistrationStats } from '@/components/admin/registrations/registration-stats';
import { RegistrationTable } from '@/components/admin/registrations/registration-table';
import { RegistrationDrawer } from '@/components/admin/registrations/registration-drawer';
import { RejectModal } from '@/components/admin/registrations/reject-modal';

function EventRegistrationsContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { id: eventId } = resolvedParams;
  const { toast } = useToast();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const { canManageEvent, can, loading: orgLoading } = useOrg();
  const eventTypeModule = useMemo(() => resolveEventType(event), [event]);
  
  const canVerify = can('registrations.verify', event);
  const canCheckIn = can('registrations.checkin', event);
  const canEdit = can('registrations.edit', event);
  const canManageDraws = can('draws.manage', event);
  const canManageEvents = can('events.manage', event);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [promotedIds, setPromotedIds] = useState<string[]>([]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RegistrationStatus>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Detail Sheet & Modals
  const [activeDetailReg, setActiveDetailReg] = useState<Registration | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState({
    contact_name: '',
    contact_phone: '',
    contact_email: '',
  });

  // Reject Note Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // Status note inside drawer
  const [drawerNote, setDrawerNote] = useState('');
  const [drawerStatus, setDrawerStatus] = useState<RegistrationStatus>('pending');

  // Random team & tournament draw modal
  const [randomTeamOpen, setRandomTeamOpen] = useState(false);

  // Bumped by every optimistic change
  const changeSeq = useRef(0);

  const loadData = useCallback(async () => {
    const seq = changeSeq.current;
    try {
      const [evt, regs] = await Promise.all([
        getEventById(eventId),
        getRegistrationsByEvent(eventId),
      ]);
      if (seq !== changeSeq.current) return;
      if (evt && !canManageEvent(evt)) {
        setAccessDenied(true);
        setEvent(null);
        setRegistrations([]);
        return;
      }
      setEvent(evt);
      setRegistrations(regs);
    } catch (err) {
      logger.error('admin-registrations', 'Failed to load registrations:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId, canManageEvent]);

  useEffect(() => {
    if (orgLoading) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        void loadData();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, orgLoading, loadData]);

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      if (statusFilter !== 'all' && reg.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cleanQ = cleanTicketCode(searchQuery);
        const codeMatch =
          cleanTicketCode(reg.code).includes(cleanQ) || reg.code.toLowerCase().includes(q);
        const nameMatch = reg.contact_name.toLowerCase().includes(q);
        const phoneMatch = reg.contact_phone.toLowerCase().includes(q);
        const emailMatch = reg.contact_email?.toLowerCase().includes(q) || false;
        const answerMatch = Object.values(reg.answers || {}).some((val) =>
          String(val).toLowerCase().includes(q)
        );
        return codeMatch || nameMatch || phoneMatch || emailMatch || answerMatch;
      }
      return true;
    });
  }, [registrations, statusFilter, searchQuery]);

  // Pagination states
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [prevFilterState, setPrevFilterState] = useState({ searchQuery, statusFilter, pageSize });

  // Reset to page 1 whenever filter or search query changes
  if (
    prevFilterState.searchQuery !== searchQuery ||
    prevFilterState.statusFilter !== statusFilter ||
    prevFilterState.pageSize !== pageSize
  ) {
    setPrevFilterState({ searchQuery, statusFilter, pageSize });
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / pageSize));
  const paginatedRegistrations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRegistrations.slice(start, start + pageSize);
  }, [filteredRegistrations, currentPage, pageSize]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: registrations.length,
      verified: registrations.filter((r) => r.status === 'verified').length,
      pending: registrations.filter((r) => r.status === 'pending').length,
      rejected: registrations.filter((r) => r.status === 'rejected').length,
      waitlisted: registrations.filter((r) => r.status === 'waitlisted').length,
      checkedIn: registrations.filter((r) => !!r.checked_in_at).length,
      revenue: registrations
        .filter((r) => r.status === 'verified')
        .reduce((sum, r) => sum + (r.total_amount || 0), 0),
    };
  }, [registrations]);

  const patchRows = (ids: string[], patch: Partial<Registration>): Registration[] => {
    const idSet = new Set(ids);
    return registrations.map((r) => (idSet.has(r.id) ? { ...r, ...patch } : r));
  };

  const applyChange = async (
    optimisticRows: Registration[],
    persist: () => Promise<unknown>
  ) => {
    changeSeq.current += 1;
    const previous = registrations;
    setRegistrations(optimisticRows);
    try {
      await persist();
      refreshPublicPages(event?.slug);
    } catch (err) {
      setRegistrations(previous);
      throw err;
    }
  };

  // Select / Deselect actions
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRegistrations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRegistrations.map((r) => r.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Status Updates
  const handleVerify = async (id: string) => {
    try {
      await applyChange(
        patchRows([id], { status: 'verified', admin_note: 'Diverifikasi' }),
        () => updateRegistrationStatus(id, 'verified', 'Diverifikasi')
      );
      toast({ type: 'success', message: 'Status pendaftar berhasil diverifikasi!' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memperbarui status';
      toast({ type: 'error', message });
    }
  };

  const handlePromote = async (id: string) => {
    try {
      await applyChange(
        patchRows([id], { status: 'pending', admin_note: 'Dipindahkan dari daftar tunggu' }),
        () => promoteFromWaitlist(id)
      );
      setPromotedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      toast({
        type: 'success',
        message: 'Peserta dipindahkan dari daftar tunggu ke status menunggu verifikasi.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mempromosikan dari daftar tunggu';
      toast({ type: 'error', message });
    }
  };

  const openRejectModal = (id: string) => {
    setRejectTargetId(id);
    setRejectNote('');
    setRejectModalOpen(true);
  };

  const submitReject = async () => {
    if (!rejectTargetId) return;
    try {
      const note = rejectNote.trim() || 'Bukti pembayaran tidak sesuai atau dibatalkan.';
      await applyChange(
        patchRows([rejectTargetId], { status: 'rejected', admin_note: note }),
        () => updateRegistrationStatus(rejectTargetId, 'rejected', note)
      );
      setRejectModalOpen(false);
      toast({ type: 'info', message: 'Pendaftaran telah ditolak.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memperbarui status';
      toast({ type: 'error', message });
    }
  };

  const handleCheckIn = async (reg: Registration) => {
    const nextValue = !reg.checked_in_at;
    const optimisticTimestamp = nextValue ? new Date().toISOString() : undefined;
    try {
      await applyChange(
        patchRows([reg.id], { checked_in_at: optimisticTimestamp }),
        () => setCheckIn(reg.id, nextValue)
      );
      toast({
        type: 'success',
        message: nextValue
          ? `${formatTicketCode(reg.code)} berhasil dicatat hadir.`
          : `Kehadiran ${formatTicketCode(reg.code)} dibatalkan.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mencatat kehadiran';
      toast({ type: 'error', message });
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (confirm(`Yakin ingin menghapus pendaftaran ${formatTicketCode(code)}? Tindakan ini tidak dapat dibatalkan.`)) {
      try {
        await applyChange(
          registrations.filter((r) => r.id !== id),
          () => deleteRegistration(id)
        );
        setSelectedIds((prev) => prev.filter((i) => i !== id));
        toast({ type: 'info', message: `Data registrasi ${formatTicketCode(code)} telah dihapus.` });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Gagal menghapus registrasi';
        toast({ type: 'error', message });
      }
    }
  };

  const handleBulkVerify = async () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Verifikasi ${selectedIds.length} pendaftar yang dipilih?`)) {
      try {
        await applyChange(
          patchRows(selectedIds, { status: 'verified', admin_note: 'Verifikasi masal' }),
          () =>
            Promise.all(
              selectedIds.map((id) =>
                updateRegistrationStatus(id, 'verified', 'Verifikasi masal')
              )
            )
        );
        setSelectedIds([]);
        toast({
          type: 'success',
          message: `${selectedIds.length} pendaftar berhasil diverifikasi!`,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Gagal memverifikasi pendaftar';
        toast({ type: 'error', message });
      }
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) return;
    const note = prompt('Masukkan alasan penolakan masal:', 'Pendaftaran ditolak oleh panitia.') || '';
    if (!note) return;

    try {
      await applyChange(
        patchRows(selectedIds, { status: 'rejected', admin_note: note }),
        () => Promise.all(selectedIds.map((id) => updateRegistrationStatus(id, 'rejected', note)))
      );
      setSelectedIds([]);
      toast({
        type: 'info',
        message: `${selectedIds.length} pendaftar telah ditolak.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menolak pendaftar';
      toast({ type: 'error', message });
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    if (filteredRegistrations.length === 0) {
      toast({ type: 'error', message: 'Tidak ada data untuk diekspor.' });
      return;
    }

    const rows = filteredRegistrations.map((r) => {
      const customAnswersFlat: Record<string, string> = {};
      r.schema_snapshot?.forEach((f) => {
        const a = r.answers[f.id];
        customAnswersFlat[f.label] = Array.isArray(a)
          ? JSON.stringify(a)
          : typeof a === 'object' && a !== null
          ? JSON.stringify(a)
          : String(a || '-');
      });

      return sanitizeCsvRow({
        'Kode Tiket': formatTicketCode(r.code),
        Status: r.status,
        'Hadir': r.checked_in_at || '-',
        'Nama Pendaftar': r.contact_name,
        'Nomor WhatsApp': r.contact_phone,
        Email: r.contact_email || '-',
        'Tanggal Mendaftar': r.created_at,
        'Tanggal Verifikasi': r.verified_at || '-',
        'Total Biaya (IDR)': r.total_amount,
        'Catatan Admin': r.admin_note || '-',
        ...customAnswersFlat,
      });
    });

    const slugName = event?.slug || 'event';
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`registrations-${slugName}-${timestamp}.csv`, rows);
  };

  const handleExportXLSX = async () => {
    if (filteredRegistrations.length === 0) {
      toast({ type: 'error', message: 'Tidak ada data untuk diekspor.' });
      return;
    }

    try {
      const rows = filteredRegistrations.map((r) => {
        const customAnswersFlat: Record<string, string> = {};
        r.schema_snapshot?.forEach((f) => {
          const a = r.answers[f.id];
          customAnswersFlat[f.label] = Array.isArray(a)
            ? JSON.stringify(a)
            : typeof a === 'object' && a !== null
            ? JSON.stringify(a)
            : String(a || '-');
        });

        return sanitizeCsvRow({
          'Kode Tiket': formatTicketCode(r.code),
          Status: r.status,
          'Hadir': r.checked_in_at || '-',
          'Nama Pendaftar': r.contact_name,
          'Nomor WhatsApp': r.contact_phone,
          Email: r.contact_email || '-',
          'Tanggal Mendaftar': r.created_at,
          'Tanggal Verifikasi': r.verified_at || '-',
          'Total Biaya (IDR)': r.total_amount,
          'Catatan Admin': r.admin_note || '-',
          ...customAnswersFlat,
        });
      });

      const slugName = event?.slug || 'event';
      const timestamp = new Date().toISOString().slice(0, 10);
      await downloadExcel(`registrations-${slugName}-${timestamp}.xlsx`, rows, 'Pendaftar');
    } catch (err) {
      logger.error('admin-registrations', 'Export XLSX error:', err);
      toast({ type: 'error', message: 'Gagal mengekspor file Excel.' });
    }
  };

  const openDetail = (reg: Registration) => {
    setActiveDetailReg(reg);
    setDrawerStatus(reg.status);
    setDrawerNote(reg.admin_note || '');
    setEditMode(false);
    setEditFormData({
      contact_name: reg.contact_name,
      contact_phone: reg.contact_phone,
      contact_email: reg.contact_email || '',
    });
  };

  const saveDrawerStatus = async () => {
    if (!activeDetailReg) return;
    try {
      const prevStatus = activeDetailReg.status;
      await applyChange(
        patchRows([activeDetailReg.id], { status: drawerStatus, admin_note: drawerNote }),
        () => updateRegistrationStatus(activeDetailReg.id, drawerStatus, drawerNote)
      );
      toast({
        type: 'success',
        message: `Status ${formatTicketCode(activeDetailReg.code)} berhasil diubah ke ${drawerStatus}!`,
      });
      if (prevStatus === 'waitlisted' && drawerStatus === 'pending') {
        setPromotedIds((prev) =>
          prev.includes(activeDetailReg.id) ? prev : [...prev, activeDetailReg.id]
        );
      }
      setActiveDetailReg((prev) =>
        prev ? { ...prev, status: drawerStatus, admin_note: drawerNote } : null
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memperbarui status';
      toast({ type: 'error', message });
    }
  };

  const saveContactEdit = async () => {
    if (!activeDetailReg) return;
    try {
      await applyChange(
        patchRows([activeDetailReg.id], {
          contact_name: editFormData.contact_name,
          contact_phone: editFormData.contact_phone,
          contact_email: editFormData.contact_email,
        }),
        () =>
          updateRegistrationData(
            activeDetailReg.id,
            activeDetailReg.answers,
            editFormData.contact_name,
            editFormData.contact_phone,
            editFormData.contact_email
          )
      );
      toast({
        type: 'success',
        message: 'Data kontak pendaftar berhasil diperbarui!',
      });
      setActiveDetailReg((prev) =>
        prev
          ? {
              ...prev,
              contact_name: editFormData.contact_name,
              contact_phone: editFormData.contact_phone,
              contact_email: editFormData.contact_email,
            }
          : null
      );
      setEditMode(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memperbarui kontak';
      toast({ type: 'error', message });
    }
  };

  const generateRegistrantWALink = (reg: Registration) => {
    if (!event) return '#';
    return buildParticipantMessage(event, reg, {
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      formatMoney: formatRupiah,
      justPromoted: promotedIds.includes(reg.id),
    }).link;
  };

  if (accessDenied) {
    return (
      <div className="p-12 text-center text-neutral-500">
        Anda tidak memiliki akses ke data pendaftar event ini.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
            <Link href="/admin/events" className="hover:underline flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Semua Event</span>
            </Link>
            <span>/</span>
            <span>Data Pendaftar</span>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {event?.title || 'Memuat Event...'}
            </h1>
            {event && (
              <Badge
                variant={
                  event.status === 'open'
                    ? 'success'
                    : event.status === 'draft'
                    ? 'secondary'
                    : 'destructive'
                }
              >
                {event.status === 'open' ? 'Buka' : event.status === 'draft' ? 'Draft' : 'Tutup'}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Kelola verifikasi, preview bukti pembayaran, dan kontak peserta via WhatsApp.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canManageEvents && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCleanupOpen(true)}
              className="h-8 text-xs gap-1.5"
              title="Hapus bukti bayar setelah event selesai dan file yang tidak terpakai"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>Bersihkan Penyimpanan</span>
            </Button>
          )}

          {eventTypeModule.grouping.enabled && canManageDraws && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRandomTeamOpen(true)}
              className="h-8 text-xs gap-1.5 shadow-2xs border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600/40 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-medium"
              title={`${eventTypeModule.labels.groupingAction} dan undian bagan dari peserta terdaftar`}
            >
              <Shuffle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{eventTypeModule.labels.groupingAction}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-8 text-xs gap-1.5 shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            size="sm"
            onClick={handleExportXLSX}
            className="h-8 text-xs gap-1.5 shadow-2xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export XLSX (Excel)</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <RegistrationStats stats={stats} event={event} />

      {/* Table Toolbar, Filter, & Table */}
      <RegistrationTable
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        stats={stats}
        selectedIds={selectedIds}
        toggleSelectAll={toggleSelectAll}
        toggleSelectRow={toggleSelectRow}
        filteredRegistrations={filteredRegistrations}
        paginatedRegistrations={paginatedRegistrations}
        pageSize={pageSize}
        setPageSize={setPageSize}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        canVerify={canVerify}
        canCheckIn={canCheckIn}
        canEdit={canEdit}
        openDetail={openDetail}
        handleVerify={handleVerify}
        openRejectModal={openRejectModal}
        handlePromote={handlePromote}
        handleCheckIn={handleCheckIn}
        handleDelete={handleDelete}
        handleBulkVerify={handleBulkVerify}
        handleBulkReject={handleBulkReject}
        setSelectedIds={setSelectedIds}
        generateRegistrantWALink={generateRegistrantWALink}
      />

      {/* REGISTRATION DETAIL DRAWER (SHEET) */}
      <RegistrationDrawer
        activeDetailReg={activeDetailReg}
        onClose={() => setActiveDetailReg(null)}
        canVerify={canVerify}
        canEdit={canEdit}
        drawerStatus={drawerStatus}
        setDrawerStatus={setDrawerStatus}
        drawerNote={drawerNote}
        setDrawerNote={setDrawerNote}
        saveDrawerStatus={saveDrawerStatus}
        editMode={editMode}
        setEditMode={setEditMode}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        saveContactEdit={saveContactEdit}
        generateRegistrantWALink={generateRegistrantWALink}
      />

      {/* REJECT MODAL */}
      <RejectModal
        open={rejectModalOpen}
        onOpenChange={setRejectModalOpen}
        rejectNote={rejectNote}
        setRejectNote={setRejectNote}
        onConfirm={submitReject}
      />

      {/* Storage Cleanup Modal */}
      {event && (
        <StorageCleanupDialog
          open={cleanupOpen}
          onOpenChange={setCleanupOpen}
          event={event}
          registrations={registrations}
          onDone={loadData}
        />
      )}

      {/* Random Team & Tournament Draw Modal */}
      {event && (
        <RandomTeamModal
          open={randomTeamOpen}
          onOpenChange={setRandomTeamOpen}
          eventTitle={event?.title || 'Event'}
          registrations={registrations}
          event={event}
        />
      )}
    </div>
  );
}

export default function EventRegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white" />
        </div>
      }
    >
      <EventRegistrationsContent params={params} />
    </React.Suspense>
  );
}
