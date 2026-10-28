#!/usr/bin/env node
// Migration script: Convert legacy Base64 data URLs in registrations.answers
// to file references stored in the `form-attachments` Supabase storage bucket.
//
// Usage:
//   node scripts/migrate-base64-attachments.mjs            # DRY RUN (safe preview)
//   node scripts/migrate-base64-attachments.mjs --apply    # Execute migration

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Load .env.local or .env if present
export function loadEnv() {
  const root = join(import.meta.dirname, '..');
  for (const file of ['.env.local', '.env']) {
    const fullPath = join(root, file);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

/**
 * Validates file buffer by inspecting magic bytes.
 * Strictly permits only PNG, JPG, WEBP, and PDF.
 * Explicitly rejects SVG, executable files, HTML, scripts, etc.
 */
export function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // PDF: %PDF-
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }

  return null;
}

/** Parses a data URL and returns its buffer and detected format */
export function parseBase64DataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
  if (!match) return null;

  const declaredMime = match[1].toLowerCase();
  const base64Data = match[2];

  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return null;
  }

  const detected = detectMimeFromBuffer(buffer);
  return {
    buffer,
    declaredMime,
    detected,
    isSvg: declaredMime.includes('svg') || buffer.slice(0, 100).toString('utf8').includes('<svg'),
  };
}

/**
 * Checks if a value in answers is already a valid StoredAttachment object.
 */
export function isAlreadyMigratedAttachment(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.url === 'string' &&
    typeof value.path === 'string' &&
    typeof value.type === 'string'
  );
}

/**
 * Builds the standard StoredAttachment object matching form-attachments.ts
 */
export function createAttachmentReference(eventId, buffer, mimeInfo, publicUrlBase) {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const path = `${eventId}/att-${hash}.${mimeInfo.ext}`;
  const url = `${publicUrlBase.replace(/\/+$/, '')}/${path}`;

  return {
    reference: {
      name: `lampiran-${hash.slice(0, 8)}.${mimeInfo.ext}`,
      size: buffer.length,
      type: mimeInfo.mime,
      path,
      url,
    },
    path,
  };
}

async function run() {
  loadEnv();

  const isApply = process.argv.includes('--apply');
  const root = join(import.meta.dirname, '..');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('====================================================');
  console.log(`[MIGRATE-BASE64] Mode: ${isApply ? 'APPLY (Executing changes)' : 'DRY RUN (Preview only)'}`);
  console.log('====================================================\n');

  if (!supabaseUrl) {
    console.error('[ERROR] Supabase URL is not configured (NEXT_PUBLIC_SUPABASE_URL).');
    process.exit(1);
  }

  if (!serviceKey) {
    console.error('[ERROR] SUPABASE_SERVICE_ROLE_KEY is required to inspect and update registrations table and upload to storage.');
    console.error('Please configure SUPABASE_SERVICE_ROLE_KEY in .env.local before running.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: publicUrlData } = supabase.storage.from('form-attachments').getPublicUrl('test');
  const publicUrlBase = publicUrlData.publicUrl.replace(/\/test$/, '');

  // Fetch all registrations in batches
  const BATCH_SIZE = 100;
  let offset = 0;
  let hasMore = true;

  const stats = {
    scanned: 0,
    alreadyMigrated: 0,
    migrated: 0,
    needsManualReview: 0,
    skipped: 0,
    bytesFreed: 0,
  };

  const backupRecords = [];
  const manualReviewList = [];

  while (hasMore) {
    const { data: registrations, error } = await supabase
      .from('registrations')
      .select('id, event_id, code, answers')
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('[ERROR] Failed fetching registrations batch:', error.message);
      process.exit(1);
    }

    if (!registrations || registrations.length === 0) {
      hasMore = false;
      break;
    }

    stats.scanned += registrations.length;

    for (const reg of registrations) {
      const answers = reg.answers || {};
      let modified = false;
      const updatedAnswers = { ...answers };

      for (const [fieldId, val] of Object.entries(answers)) {
        if (isAlreadyMigratedAttachment(val)) {
          stats.alreadyMigrated++;
          continue;
        }

        if (typeof val === 'string' && val.startsWith('data:')) {
          const parsed = parseBase64DataUrl(val);

          if (!parsed) {
            stats.skipped++;
            continue;
          }

          if (parsed.isSvg || !parsed.detected) {
            stats.needsManualReview++;
            manualReviewList.push({
              registrationId: reg.id,
              code: reg.code,
              fieldId,
              declaredMime: parsed.declaredMime,
              reason: parsed.isSvg ? 'SVG file detected (potential stored script)' : 'MIME type not whitelisted',
            });
            continue;
          }

          // Allowed format: PNG, JPG, WEBP, PDF
          const { reference, path } = createAttachmentReference(reg.event_id, parsed.buffer, parsed.detected, publicUrlBase);

          stats.migrated++;
          stats.bytesFreed += val.length;
          modified = true;
          updatedAnswers[fieldId] = reference;

          backupRecords.push({
            registrationId: reg.id,
            code: reg.code,
            fieldId,
            eventId: reg.event_id,
            originalBase64: val,
            newReference: reference,
          });

          if (isApply) {
            // Upload to storage with upsert
            const { error: uploadErr } = await supabase.storage.from('form-attachments').upload(path, parsed.buffer, {
              contentType: parsed.detected.mime,
              upsert: true,
            });

            if (uploadErr) {
              console.error(`[ERROR] Failed uploading ${path}:`, uploadErr.message);
              continue;
            }
          }
        }
      }

      if (modified && isApply) {
        const { error: updateErr } = await supabase
          .from('registrations')
          .update({ answers: updatedAnswers })
          .eq('id', reg.id);

        if (updateErr) {
          console.error(`[ERROR] Failed updating registration ${reg.code}:`, updateErr.message);
        }
      }
    }

    offset += BATCH_SIZE;
  }

  // If in apply mode and records were modified, save backup file
  if (backupRecords.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = join(root, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const backupFilePath = join(backupDir, `base64-migration-${timestamp}.json`);
    writeFileSync(backupFilePath, JSON.stringify(backupRecords, null, 2));
    console.log(`\n[BACKUP] Saved pre-migration snapshot to: ${backupFilePath}`);
  }

  console.log('\n================ RINGKASAN MIGRASI ================');
  console.log(`Total baris pendaftaran dipindai : ${stats.scanned}`);
  console.log(`Sudah berformat Storage          : ${stats.alreadyMigrated}`);
  console.log(`Base64 berhasil dimigrasi        : ${stats.migrated}`);
  console.log(`Perlu tinjauan manual (SVG/lain) : ${stats.needsManualReview}`);
  console.log(`Dilewati (bukan data URL)        : ${stats.skipped}`);
  console.log(`Ukuran teks Base64 dibebaskan    : ${(stats.bytesFreed / (1024 * 1024)).toFixed(2)} MB`);
  console.log('====================================================\n');

  if (manualReviewList.length > 0) {
    console.log('Berkas yang ditandai untuk tinjauan manual:');
    manualReviewList.forEach((item) => {
      console.log(`  - Pendaftar ${item.code} (${item.fieldId}): ${item.declaredMime} -> ${item.reason}`);
    });
    console.log('');
  }

  if (!isApply) {
    console.log('[DRY RUN SELESAI] Tidak ada data di database atau storage yang diubah.');
    console.log('Untuk menerapkan perubahan ke database secara permanen, jalankan:');
    console.log('  pnpm db:migrate-base64 --apply\n');
  } else {
    console.log('[MIGRASI SELESAI] Perubahan telah berhasil diterapkan ke database dan Storage.\n');
  }
}

// Only auto-run if directly invoked as main script
if (process.argv[1] && process.argv[1].endsWith('migrate-base64-attachments.mjs')) {
  run().catch((err) => {
    console.error('[FATAL ERROR]:', err);
    process.exit(1);
  });
}
