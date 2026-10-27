// Shared helpers for the two data backends:
//  - demo mode: browser localStorage (in-memory under Node, e.g. in tests)
//  - Supabase mode: error helper so DB failures always reach the caller

import { logger } from './logger.ts';

export const isBrowser = typeof window !== 'undefined';

export function getStorage<T>(key: string, defaultValue: T): T {
  if (!isBrowser) return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultValue));
      return defaultValue;
    }
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

// Returns false when the browser refuses the write (usually the ~5 MB quota,
// e.g. a large base64 payment proof), so callers can report it.
export function setStorage<T>(key: string, value: T): boolean {
  if (!isBrowser) return true;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('Storage set error:', err);
    return false;
  }
}

// When Supabase is configured the database is the only source of truth.
// Demo data must never leak into that mode (fake bank accounts, fake events).
export function dbError(context: string, error: { message?: string } | null): Error {
  logger.error('db', `Supabase ${context} error:`, error);
  return new Error(error?.message || `Gagal ${context}`);
}

export function newId(prefix: string): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * A demo-mode "table": localStorage in the browser, module memory in Node.
 * Rows are read fresh on every call so several tabs stay roughly in sync.
 */
export function localTable<T>(key: string, seed: () => T[]) {
  let memory: T[] | null = null;
  return {
    // Copies in Node too, so callers never hold live references (matches the
    // JSON round-trip that localStorage does in the browser)
    all(): T[] {
      if (isBrowser) return getStorage<T[]>(key, seed());
      if (!memory) memory = seed();
      return structuredClone(memory);
    },
    save(rows: T[]): void {
      if (isBrowser) {
        if (!setStorage(key, rows)) {
          throw new Error('Penyimpanan browser penuh; data demo tidak dapat disimpan.');
        }
        return;
      }
      memory = structuredClone(rows);
    },
  };
}
