import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to format currency in Rupiah
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Helper to format Indonesian dates (standardized to WIB / Asia/Jakarta)
export function formatIndoDate(
  dateString?: string,
  withTime = false,
  timeZone = 'Asia/Jakarta'
): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone,
      ...(withTime ? { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } : {}),
    };
    return new Intl.DateTimeFormat('id-ID', options).format(d);
  } catch {
    return dateString;
  }
}

/**
 * Converts an ISO date string to a 'YYYY-MM-DDTHH:mm' string in WIB (Asia/Jakarta).
 * Ideal for setting default values on HTML <input type="datetime-local">.
 */
export function toWIBDateTimeInput(dateString?: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T').slice(0, 16);
}

/**
 * Converts a 'YYYY-MM-DDTHH:mm' local string entered in WIB into an ISO UTC string.
 */
export function fromWIBDateTimeInput(localString?: string | null): string | undefined {
  if (!localString) return undefined;
  const clean = localString.trim();
  if (!clean) return undefined;
  const isoWithWIB = clean.length === 16 ? `${clean}:00+07:00` : clean;
  const d = new Date(isoWithWIB);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Helper to format bytes to human-readable size
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Normalizes a ticket code by stripping dashes, spaces, and converting to uppercase.
 * Example: 'TIDDS-2026-0004' -> 'TIDDS20260004'
 */
export function cleanTicketCode(code?: string | null): string {
  if (!code) return '';
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Consistently formats a ticket code for display without hyphens.
 */
export function formatTicketCode(code?: string | null): string {
  return cleanTicketCode(code);
}

/**
 * Formats match / play date with dynamic day of week and time in WIB (Asia/Jakarta).
 * Example: 'Sabtu, 28 November 2026 · 06.00 WIB'
 */
export function formatEventDateTime(
  dateString?: string | null,
  timeZone = 'Asia/Jakarta'
): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);

    const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone }).format(d);
    const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(d);
    const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d);

    return `${weekday}, ${date} · ${time.replace(':', '.')} WIB`;
  } catch {
    return String(dateString);
  }
}

/**
 * Formats deadline date and time with day of week in WIB.
 * Example: 'Rabu, 25 November 2026 · 20.00 WIB'
 */
export function formatDeadlineDateTime(
  dateString?: string | null,
  timeZone = 'Asia/Jakarta'
): string {
  return formatEventDateTime(dateString, timeZone);
}

/**
 * Calculates a friendly countdown status for registration deadlines.
 */
export function getDeadlineCountdown(
  dateString?: string | null
): { isPassed: boolean; label: string; text: string; daysLeft: number } {
  if (!dateString) {
    return { isPassed: false, label: '', text: '', daysLeft: 0 };
  }
  const target = new Date(dateString).getTime();
  if (isNaN(target)) {
    return { isPassed: false, label: '', text: '', daysLeft: 0 };
  }
  const now = Date.now();
  const diffMs = target - now;

  if (diffMs <= 0) {
    return {
      isPassed: true,
      label: 'Pendaftaran Ditutup',
      text: 'Batas waktu pendaftaran telah berakhir',
      daysLeft: 0,
    };
  }

  const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));
  if (hoursLeft <= 24) {
    return {
      isPassed: false,
      label: `Tutup ${hoursLeft} jam lagi`,
      text: `Pendaftaran ditutup hari ini (sisa ${hoursLeft} jam lagi)`,
      daysLeft: 0,
    };
  }

  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return {
    isPassed: false,
    label: `Sisa ${daysLeft} hari lagi`,
    text: `Pendaftaran ditutup dalam ${daysLeft} hari lagi`,
    daysLeft,
  };
}
