import { dbError, newId } from './local-db';
import { createClient as getSupabaseClient } from './supabase/client';

export const ATTACHMENTS_BUCKET = 'form-attachments';
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const ATTACHMENT_ACCEPT = Object.keys(EXTENSIONS).join(',');

export interface StoredAttachment {
  name: string;
  size: number;
  type: string;
  path?: string;
  url: string;
}

export function validateAttachmentFile(file: { size: number; type: string }): string | null {
  if (!EXTENSIONS[file.type]) return 'Format berkas harus JPG, PNG, WEBP, atau PDF.';
  if (file.size > ATTACHMENT_MAX_BYTES) return 'Ukuran berkas maksimal 5 MB.';
  return null;
}

export function buildAttachmentPath(eventId: string, mimeType: string, id: string = newId('att')): string {
  return `${eventId}/${id}.${EXTENSIONS[mimeType] ?? 'bin'}`;
}

/**
 * Uploads a file to the `form-attachments` bucket if Supabase is available,
 * otherwise converts it to a base64 Data URL for demo mode.
 */
export async function storeFormAttachment(
  eventId: string,
  file: File
): Promise<StoredAttachment> {
  const error = validateAttachmentFile(file);
  if (error) throw new Error(error);

  const supabase = getSupabaseClient();
  if (!supabase) {
    // Demo mode: read as Data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          size: file.size,
          type: file.type,
          url: reader.result as string,
        });
      };
      reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
      reader.readAsDataURL(file);
    });
  }

  const path = buildAttachmentPath(eventId, file.type);
  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    throw dbError('mengunggah berkas formulir', uploadError);
  }

  const { data: publicUrlData } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);

  return {
    name: file.name,
    size: file.size,
    type: file.type,
    path,
    url: publicUrlData.publicUrl,
  };
}
