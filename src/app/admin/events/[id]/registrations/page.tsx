'use client';

import React, { useState, useEffect, useMemo, useRef, use } from 'react';
import Link from 'next/link';
import {
  getEventById,
  getRegistrationsByEvent,
  updateRegistrationStatus,
  updateRegistrationData,
  deleteRegistration,
  promoteFromWaitlist,
  setCheckIn,
  remainingSlots,
  formatRupiah,
  formatIndoDate,
} from '@/lib/store';
import { EventItem, Registration, RegistrationStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast-context';
import {
  ArrowLeft,
  Search,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Trash2,
  Edit,
  Eye,
  MessageSquare,
  ExternalLink,
  CheckSquare,
  Square,
  Save,
  AlertTriangle,
  Shuffle,
  ArrowUpCircle,
  UserCheck,
  HardDrive,
} from 'lucide-react';
import { sanitizeCsvRow, downloadCsv, downloadExcel } from '@/lib/export';
import { useOrg } from '@/components/admin/org-context';
import { PaymentProofPreview, PaymentProofThumb } from '@/components/admin/payment-proof-preview';
import { resolveEventType } from '@/lib/event-types';
import { buildParticipantMessage } from '@/lib/notifications';
import { StorageCleanupDialog } from '@/components/admin/storage-cleanup-dialog';
import { refreshPublicPages } from '@/lib/public-refresh';
import { RandomTeamModal } from '@/components/admin/random-team-modal';

// A status badge mounts when the status changes, so this marks the update
const BADGE_IN = 'animate-in fade-in zoom-in-95';

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: 'Menunggu',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
  waitlisted: 'Daftar Tunggu',
};

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
  const { canManageEvent, can, loading: orgLoading, session } = useOrg();
  const eventTypeModule = useMemo(() => resolveEventType(event), [event]);
  // Role-based actions (cashier verifies, check-in officer checks in); RLS enforces the same
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

  // Bumped by every optimistic change. A reload that started before it would
  // overwrite the change with stale rows, so loadData drops that result.
  const changeSeq = useRef(0);

  // Initial load shows the skeleton; refreshes after an action update in place
  const loadData = async () => {
    const seq = changeSeq.current;
    try {
      const [evt, regs] = await Promise.all([
        getEventById(eventId),
        getRegistrationsByEvent(eventId),
      ]);
      // A newer change is in flight; its own reload follows
      if (seq !== changeSeq.current) return;
      // Participant data is personal; only the event owner (or super admin) may see it
      if (evt && !canManageEvent(evt)) {
        setAccessDenied(true);
        setEvent(null);
        setRegistrations([]);
        return;
      }
      setEvent(evt);
      setRegistrations(regs);
    } catch (err) {
      console.error('Failed to load registrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Access check needs the organization list first
    if (orgLoading) return;
    loadData();
  }, [eventId, orgLoading]);

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      // Status filter
      if (statusFilter !== 'all' && reg.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = reg.code.toLowerCase().includes(q);
        const nameMatch = reg.contact_name.toLowerCase().includes(q);
        const phoneMatch = reg.contact_phone.toLowerCase().includes(q);
        const emailMatch = reg.contact_email.toLowerCase().includes(q);
        const answersMatch = JSON.stringify(reg.answers || {}).toLowerCase().includes(q);
        return codeMatch || nameMatch || phoneMatch || emailMatch || answersMatch;
      }
      return true;
    });
  }, [registrations, statusFilter, searchQuery]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = registrations.length;
    const verified = registrations.filter((r) => r.status === 'verified').length;
    const pending = registrations.filter((r) => r.status === 'pending').length;
    const rejected = registrations.filter((r) => r.status === 'rejected').length;
    const waitlisted = registrations.filter((r) => r.status === 'waitlisted').length;
    const checkedIn = registrations.filter((r) => r.checked_in_at).length;
    const revenue = registrations
      .filter((r) => r.status === 'verified')
      .reduce((sum, r) => sum + (r.total_amount || 0), 0);
    return { total, verified, pending, rejected, waitlisted, checkedIn, revenue };
  }, [registrations]);

  /**
   * Applies `patch` to the table immediately, then runs `action` on the server.
   * The reload afterwards picks up server-side fields, and puts the rows back
   * if the action failed (the caller's catch shows the error).
   */
  const applyChange = async (patch: (regs: Registration[]) => Registration[], action: () => Promise<unknown>) => {
    changeSeq.current += 1;
    setRegistrations(patch);
    try {
      await action();
      // Slot counts on the public page changed
      refreshPublicPages(event?.slug);
    } finally {
      void loadData();
    }
  };

  const patchRows = (ids: string[], fields: Partial<Registration>) => (regs: Registration[]) =>
    regs.map((r) => (ids.includes(r.id) ? { ...r, ...fields } : r));

  const handlePromote = async (id: string) => {
    try {
      await applyChange(patchRows([id], { status: 'pending' }), () => promoteFromWaitlist(id));
      // Their next WhatsApp message should say "a slot opened up"
      setPromotedIds((prev) => [...prev, id]);
      toast({
        type: 'success',
        message: 'Dipindahkan ke Menunggu Verifikasi. Kirim kabar via tombol WhatsApp pendaftar.',
      });
    } catch (err: unknown) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memindahkan pendaftar' });
    }
  };

  const handleCheckIn = async (reg: Registration) => {
    try {
      await applyChange(
        patchRows([reg.id], { checked_in_at: reg.checked_in_at ? null : new Date().toISOString() }),
        () => setCheckIn(reg.id, !reg.checked_in_at, session?.user.id)
      );
      toast({ type: 'success', message: reg.checked_in_at ? 'Check-in dibatalkan.' : `${reg.contact_name} hadir.` });
    } catch (err: unknown) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal mencatat kehadiran' });
    }
  };

  // Quick Status Actions
  const handleVerify = async (id: string) => {
    try {
      await applyChange(patchRows([id], { status: 'verified' }), () => updateRegistrationStatus(id, 'verified'));
      toast({
        type: 'success',
        message: 'Status pendaftaran berhasil diverifikasi!',
      });
      if (activeDetailReg?.id === id) {
        setActiveDetailReg((prev) => (prev ? { ...prev, status: 'verified' } : null));
      }
    } catch (err: any) {
      toast({ type: 'error', message: err.message });
    }
  };

  const openRejectModal = (id: string) => {
    setRejectTargetId(id);
    setRejectNote('Bukti pembayaran tidak sesuai atau tidak terbaca.');
    setRejectModalOpen(true);
  };

  const submitReject = async () => {
    if (!rejectTargetId) return;
    try {
      await applyChange(
        patchRows([rejectTargetId], { status: 'rejected', admin_note: rejectNote }),
        () => updateRegistrationStatus(rejectTargetId, 'rejected', rejectNote)
      );
      toast({
        type: 'info',
        message: 'Pendaftaran telah ditolak dengan catatan.',
      });
      setRejectModalOpen(false);
      if (activeDetailReg?.id === rejectTargetId) {
        setActiveDetailReg((prev) =>
          prev ? { ...prev, status: 'rejected', admin_note: rejectNote } : null
        );
      }
    } catch (err: any) {
      toast({ type: 'error', message: err.message });
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Hapus pendaftaran ${code}? Tindakan ini permanen.`)) return;
    try {
      await applyChange((regs) => regs.filter((r) => r.id !== id), () => deleteRegistration(id));
      toast({ type: 'info', message: `Pendaftaran ${code} telah dihapus.` });
      if (activeDetailReg?.id === id) setActiveDetailReg(null);
    } catch (err: any) {
      toast({ type: 'error', message: err.message });
    }
  };

  // Bulk Actions
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRegistrations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRegistrations.map((r) => r.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Sequential on purpose: in demo mode each update is a read-modify-write of
  // the whole localStorage list, so parallel updates overwrite each other.
  const updateSequentially = async (ids: string[], update: (id: string) => Promise<unknown>) => {
    for (const id of ids) {
      await update(id);
    }
  };

  const handleBulkVerify = async () => {
    if (!confirm(`Verifikasi ${selectedIds.length} pendaftar yang dipilih?`)) return;
    try {
      await applyChange(patchRows(selectedIds, { status: 'verified' }), () =>
        updateSequentially(selectedIds, (id) => updateRegistrationStatus(id, 'verified'))
      );
      toast({
        type: 'success',
        message: `${selectedIds.length} pendaftar berhasil diverifikasi!`,
      });
      setSelectedIds([]);
    } catch (err: any) {
      toast({ type: 'error', message: err.message });
    }
  };

  const handleBulkReject = async () => {
    const note = prompt('Masukkan alasan penolakan untuk pendaftar terpilih:', 'Pembayaran tidak valid.');
    if (note === null) return;
    try {
      await applyChange(patchRows(selectedIds, { status: 'rejected', admin_note: note }), () =>
        updateSequentially(selectedIds, (id) => updateRegistrationStatus(id, 'rejected', note))
      );
      toast({
        type: 'info',
        message: `${selectedIds.length} pendaftar ditolak.`,
      });
      setSelectedIds([]);
    } catch (err: any) {
      toast({ type: 'error', message: err.message });
    }
  };

  // Export to Excel (XLSX)
  const handleExportXLSX = async () => {
    if (registrations.length === 0) {
      toast({ type: 'info', message: 'Tidak ada data untuk diekspor.' });
      return;
    }

    // Export runs synchronously and blocks the page; let the button's spinner
    // (shown after 100ms, see button.tsx) appear first
    await new Promise((resolve) => setTimeout(resolve, 120));

    const rows = registrations.map((r) => {
      const baseRow: Record<string, any> = {
        'Kode Pendaftaran': r.code,
        'Nama Kontak': r.contact_name,
        'Nomor WhatsApp': r.contact_phone,
        'Email': r.contact_email,
        'Status': STATUS_LABELS[r.status],
        'Jumlah Peserta': r.participant_count ?? 1,
        'Hadir': r.checked_in_at ? formatIndoDate(r.checked_in_at, true) : '-',
        'Total Biaya (Rp)': r.total_amount,
        'Catatan Admin': r.admin_note || '-',
        'Tanggal Mendaftar': formatIndoDate(r.created_at, true),
        'Tanggal Verifikasi': r.verified_at ? formatIndoDate(r.verified_at, true) : '-',
      };

      // Append dynamic answers
      if (r.schema_snapshot) {
        r.schema_snapshot.forEach((field) => {
          const val = r.answers[field.id];
          if (field.type === 'repeater' && Array.isArray(val)) {
            baseRow[field.label] = `${val.length} item: ` + val.map((item) => Object.values(item).join(' - ')).join(' | ');
          } else if (Array.isArray(val)) {
            baseRow[field.label] = val.join(', ');
          } else if (typeof val === 'object' && val !== null) {
            baseRow[field.label] = val.name || JSON.stringify(val);
          } else {
            baseRow[field.label] = val ?? '-';
          }
        });
      }

      return baseRow;
    });

    const fileName = `${event?.slug || 'event'}-pendaftar-${new Date().toISOString().slice(0, 10)}.xlsx`;
    await downloadExcel(fileName, rows, 'Pendaftar');

    toast({
      type: 'success',
      title: 'Export Berhasil',
      message: `File ${fileName} berhasil diunduh.`,
    });
  };

  // Export to CSV
  const handleExportCSV = async () => {
    if (registrations.length === 0) {
      toast({ type: 'info', message: 'Tidak ada data untuk diekspor.' });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));

    const rows = registrations.map((r) => sanitizeCsvRow({
      'Kode': r.code,
      'Nama': r.contact_name,
      'WhatsApp': r.contact_phone,
      'Email': r.contact_email,
      'Status': r.status,
      'Total': r.total_amount,
      'Tanggal': r.created_at,
    }));

    const fileName = `${event?.slug || 'event'}-pendaftar.csv`;
    downloadCsv(fileName, rows);

    toast({
      type: 'success',
      message: 'File CSV berhasil diunduh.',
    });
  };

  // Open Drawer Detail
  const openDetail = (reg: Registration) => {
    setActiveDetailReg(reg);
    setDrawerStatus(reg.status);
    setDrawerNote(reg.admin_note || '');
    setEditMode(false);
    setEditFormData({
      contact_name: reg.contact_name,
      contact_phone: reg.contact_phone,
      contact_email: reg.contact_email,
    });
  };

  const saveDrawerStatus = async () => {
    if (!activeDetailReg) return;
    try {
      await applyChange(
        patchRows([activeDetailReg.id], { status: drawerStatus, admin_note: drawerNote }),
        () => updateRegistrationStatus(activeDetailReg.id, drawerStatus, drawerNote)
      );
      toast({
        type: 'success',
        message: 'Status dan catatan berhasil diperbarui!',
      });
      setActiveDetailReg((prev) =>
        prev ? { ...prev, status: drawerStatus, admin_note: drawerNote } : null
      );
    } catch (err: any) {
      toast({ type: 'error', message: err.message });
    }
  };

  const saveEditData = async () => {
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
    } catch (err: any) {
      toast({ type: 'error', message: err.message });
    }
  };

  // Generate WhatsApp message to registrant
  // Message follows the registration state and the event's templates (lib/notifications)
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
          {/* Storage cleanup: event managers after the event, super admin any time */}
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

          {/* Grouping is an event-type module feature and can be switched off per event */}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-[11px] font-medium text-neutral-400 uppercase">Total Pendaftar</div>
          <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {stats.total}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="text-[11px] font-medium text-emerald-600 uppercase">Terverifikasi</div>
          <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mt-1">
            {stats.verified}
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="text-[11px] font-medium text-amber-600 uppercase">Menunggu</div>
          <div className="text-xl font-bold text-amber-900 dark:text-amber-100 mt-1">
            {stats.pending}
          </div>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50/40 p-3.5 dark:border-red-900 dark:bg-red-950/20">
          <div className="text-[11px] font-medium text-red-600 uppercase">Ditolak</div>
          <div className="text-xl font-bold text-red-900 dark:text-red-100 mt-1">
            {stats.rejected}
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-[11px] font-medium text-neutral-400 uppercase">Hadir / Sisa Kuota</div>
          <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {stats.checkedIn}/{stats.verified}
          </div>
          <div className="text-[11px] text-neutral-500">
            {event && remainingSlots(event) !== null
              ? `Sisa ${remainingSlots(event)} ${event.quota_mode === 'participant' ? 'peserta' : 'slot'}`
              : 'Kuota tanpa batas'}
            {stats.waitlisted > 0 && ` · ${stats.waitlisted} antre`}
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-neutral-400 uppercase">Pemasukan Sah</div>
          <div className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {formatRupiah(stats.revenue)}
          </div>
        </div>
      </div>

      {/* Table Toolbar (Search, Filter, Bulk Actions) */}
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
                filteredRegistrations.map((reg) => {
                  const isSelected = selectedIds.includes(reg.id);

                  // Primary answer summary (e.g. team name or first answer)
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
                        {reg.code}
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
                        {reg.answers?.players && Array.isArray(reg.answers.players) && (
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
                          <Badge variant="success" className={BADGE_IN}>Terverifikasi</Badge>
                        )}
                        {reg.status === 'pending' && (
                          <Badge variant="warning" className={BADGE_IN}>Menunggu</Badge>
                        )}
                        {reg.status === 'rejected' && (
                          <Badge variant="destructive" className={BADGE_IN}>Ditolak</Badge>
                        )}
                        {reg.status === 'waitlisted' && (
                          <Badge variant="info" className={BADGE_IN}>Daftar Tunggu</Badge>
                        )}
                        {reg.checked_in_at && (
                          <Badge variant="secondary" className={`mt-1 ${BADGE_IN}`}>Hadir</Badge>
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

                          {/* Waitlist promotion (quota is re-checked server-side) */}
                          {reg.status === 'waitlisted' && canVerify && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePromote(reg.id)}
                              title="Pindahkan dari daftar tunggu"
                              aria-label={`Pindahkan ${reg.code} dari daftar tunggu`}
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
                              aria-label={reg.checked_in_at ? `Batalkan check-in ${reg.code}` : `Check-in ${reg.code}`}
                              aria-pressed={!!reg.checked_in_at}
                              className={`h-7 w-7 p-0 ${reg.checked_in_at ? 'text-neutral-900 bg-neutral-100 dark:text-white dark:bg-neutral-800' : 'text-neutral-500'}`}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* Quick Verify (waitlisted entries go through promotion first) */}
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
                            onClick={() => handleDelete(reg.id, reg.code)}
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
      </div>

      {/* REGISTRATION DETAIL DRAWER (SHEET) */}
      <Sheet open={!!activeDetailReg} onOpenChange={(open) => !open && setActiveDetailReg(null)}>
        {activeDetailReg && (
          <div className="space-y-6">
            <div className="border-b border-neutral-200 pb-4 dark:border-neutral-800">
              <div className="text-xs text-neutral-400 uppercase font-semibold">
                Detail Pendaftaran
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
            <div className={`rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/50 space-y-3 ${canVerify ? '' : 'hidden'}`}>
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
                <div className="space-y-3 bg-neutral-50 dark:bg-neutral-800/40 p-4 rounded-xl">
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
                  <Button size="sm" onClick={saveEditData} className="w-full text-xs h-8">
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
                            {answer.map((row: any, rIdx: number) => (
                              <tr key={rIdx}>
                                <td className="py-1.5 px-2 text-neutral-400">{rIdx + 1}</td>
                                {field.subFields?.map((sf) => (
                                  <td key={sf.id} className="py-1.5 px-2 font-medium">
                                    {row[sf.id] || '-'}
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
                        ? answer.name || JSON.stringify(answer)
                        : answer || '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Sheet>

      {/* REJECT MODAL */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
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
              onClick={() => setRejectModalOpen(false)}
              className="text-xs"
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={submitReject}
              className="text-xs font-semibold"
            >
              Konfirmasi Tolak
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Random Team & Tournament Draw Modal */}
      {event && (
        <StorageCleanupDialog
          open={cleanupOpen}
          onOpenChange={setCleanupOpen}
          event={event}
          registrations={registrations}
          onDone={loadData}
        />
      )}

      {/* Mounted once the event is known so its event-type defaults apply */}
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
