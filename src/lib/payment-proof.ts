// Payment proof handling.
//  Supabase mode: file goes to the private `payment-proofs` bucket under
//    "<event_id>/<random>.<ext>" (the storage RLS policy only accepts that
//    shape for open events); admins read it through a short-lived signed URL.
//  Demo mode: the file stays an inline data URL in localStorage.
import { dbError, newId } from './local-db.ts';
import { createClient as getSupabaseClient } from './supabase/client.ts';

export const PROOF_BUCKET = 'payment-proofs';
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 10 * 60;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
export const PROOF_ACCEPT = Object.keys(EXTENSIONS).join(',');

/** Returns a user-facing error, or null when the file is acceptable. */
export function validateProofFile(file: { size: number; type: string }): string | null {
  if (!EXTENSIONS[file.type]) return 'Format bukti harus JPG, PNG, WEBP, atau PDF.';
  if (file.size > PROOF_MAX_BYTES) return 'Ukuran bukti pembayaran maksimal 5 MB.';
  return null;
}

export function buildProofPath(eventId: string, mimeType: string, id: string = newId('proof')): string {
  return `${eventId}/${id}.${EXTENSIONS[mimeType] ?? 'bin'}`;
}

/**
 * Stores the proof and returns what goes into registrations.payment_proof_path.
 * `dataUrl` is the FileReader result already used for the preview.
 */
export async function storePaymentProof(eventId: string, file: File, dataUrl: string): Promise<string> {
  const problem = validateProofFile(file);
  if (problem) throw new Error(problem);

  const supabase = getSupabaseClient();
  if (!supabase) return dataUrl;

  const path = buildProofPath(eventId, file.type);
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw dbError('mengunggah bukti pembayaran', error);
  return path;
}

const SAFE_DATA_URL = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/;
const STORAGE_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9-]+\.(jpg|png|webp|pdf)$/;

export function isPdfProof(path: string): boolean {
  return path.startsWith('data:application/pdf') || path.endsWith('.pdf');
}

/**
 * Turns a stored value into something safe for <img src>/<a href>.
 * Participants control this value, so anything that is not an inline image/PDF
 * or one of our storage paths (e.g. "javascript:..." or a foreign URL) is
 * rejected instead of rendered.
 */
export async function resolvePaymentProofUrl(stored: string | undefined | null): Promise<string | null> {
  if (!stored) return null;
  if (SAFE_DATA_URL.test(stored)) return stored;
  if (!STORAGE_PATH.test(stored)) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(stored, SIGNED_URL_TTL_SECONDS);
  if (error) throw dbError('membuka bukti pembayaran', error);
  return data.signedUrl;
}

/** Synchronous variant for thumbnails: only inline data URLs, no network. */
export function inlineProofUrl(stored: string | undefined | null): string | null {
  return stored && SAFE_DATA_URL.test(stored) ? stored : null;
}

/**
 * Removes an uploaded payment proof file from storage (used to rollback if registration creation fails).
 */
export async function deletePaymentProof(path: string | undefined | null): Promise<void> {
  if (!path || path.startsWith('data:')) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
  } catch (err) {
    console.warn('Gagal menghapus bukti pembayaran yatim:', err);
  }
}

