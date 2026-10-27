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
