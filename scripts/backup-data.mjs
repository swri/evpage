#!/usr/bin/env node
// Automated backup script for EvPage
// Exports registrations (JSON & CSV), events, and downloads storage bucket files recursively.
// Usage: node scripts/backup-data.mjs [--demo]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local or .env if present
function loadEnv() {
  const root = join(import.meta.dirname, '..');
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
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

loadEnv();

const root = join(import.meta.dirname, '..');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isDemoMode = process.argv.includes('--demo');

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map((h) => `"${h}"`).join(',');
  const lines = rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

/** Recursively lists all files in a storage bucket */
async function listAllBucketFiles(supabase, bucket, prefix = '') {
  const { data: items, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    throw error;
  }
  if (!items || items.length === 0) return [];

  const files = [];
  for (const item of items) {
    if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

    // In Supabase storage, folders have id === null (or no metadata/mimetype)
    if (item.id === null) {
      const nested = await listAllBucketFiles(supabase, bucket, fullPath);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function runBackup() {
  const timestamp = getTimestamp();
  const backupDirName = `backup-${timestamp}`;
  const backupDir = join(root, 'backups', backupDirName);

  mkdirSync(backupDir, { recursive: true });
  console.log(`[BACKUP] Initializing backup at: ${backupDir}`);

  // Handle explicit demo mode or offline backup when no Supabase URL is given
  if (!supabaseUrl || isDemoMode) {
    console.log('[BACKUP] Generating offline demo snapshot...');

    const demoRegistrations = [
      {
        id: 'demo-reg-1',
        event_id: 'mini-soccer-championship-2026',
        registration_code: 'REG-DEMO1',
        status: 'verified',
        total_amount: 1500000,
        contact_name: 'Budi Pratama',
        contact_phone: '081234567890',
        created_at: new Date().toISOString(),
      },
    ];

    writeFileSync(join(backupDir, 'registrations.json'), JSON.stringify(demoRegistrations, null, 2));
    writeFileSync(join(backupDir, 'registrations.csv'), toCsv(demoRegistrations));

    const manifest = {
      timestamp: new Date().toISOString(),
      mode: 'offline_demo',
      registrationCount: demoRegistrations.length,
      storageBuckets: [],
    };
    writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`[BACKUP] Offline demo backup completed successfully in ${backupDir}`);
    return;
  }

  // Live Supabase backup requires SUPABASE_SERVICE_ROLE_KEY to bypass RLS
  if (!serviceRoleKey) {
    console.error('\n[BACKUP] ERROR: SUPABASE_SERVICE_ROLE_KEY is missing!');
    console.error(
      '[BACKUP] Cannot perform backup with anonymous or user keys because Supabase Row-Level Security (RLS)'
    );
    console.error(
      '[BACKUP] will restrict access and silently export 0 rows or fail storage downloads.'
    );
    console.error(
      '[BACKUP] Please set SUPABASE_SERVICE_ROLE_KEY in .env.local or your environment before running pnpm db:backup.\n'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log('[BACKUP] Connected to Supabase with service role. Fetching registrations...');
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: false });

  if (regError) {
    console.error('[BACKUP] Error fetching registrations:', regError.message);
    process.exit(1);
  } else {
    const regList = registrations || [];
    writeFileSync(join(backupDir, 'registrations.json'), JSON.stringify(regList, null, 2));
    writeFileSync(join(backupDir, 'registrations.csv'), toCsv(regList));
    console.log(`[BACKUP] Saved ${regList.length} registrations (JSON & CSV).`);
  }

  console.log('[BACKUP] Fetching events...');
  const { data: events, error: evtError } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  if (evtError) {
    console.error('[BACKUP] Error fetching events:', evtError.message);
    process.exit(1);
  } else {
    const evtList = events || [];
    writeFileSync(join(backupDir, 'events.json'), JSON.stringify(evtList, null, 2));
    console.log(`[BACKUP] Saved ${evtList.length} events.`);
  }

  // Backup Storage Buckets Recursively
  const buckets = ['payment-proofs', 'form-attachments'];
  const storageSummary = {};

  for (const bucket of buckets) {
    console.log(`[BACKUP] Recursively checking storage bucket: ${bucket}...`);
    try {
      const filePaths = await listAllBucketFiles(supabase, bucket, '');
      console.log(`[BACKUP] Found ${filePaths.length} file(s) in bucket ${bucket}.`);

      if (filePaths.length > 0) {
        const bucketFolder = join(backupDir, 'storage', bucket);
        let downloadedCount = 0;

        for (const filePath of filePaths) {
          const { data: blob, error: dlError } = await supabase.storage.from(bucket).download(filePath);
          if (dlError) {
            console.warn(`[BACKUP] Failed downloading ${bucket}/${filePath}:`, dlError.message);
          } else if (blob) {
            const localDest = join(bucketFolder, filePath);
            mkdirSync(dirname(localDest), { recursive: true });
            const buffer = Buffer.from(await blob.arrayBuffer());
            writeFileSync(localDest, buffer);
            downloadedCount++;
          }
        }
        storageSummary[bucket] = downloadedCount;
        console.log(`[BACKUP] Downloaded ${downloadedCount} file(s) from ${bucket}.`);
      } else {
        storageSummary[bucket] = 0;
        console.log(`[BACKUP] Bucket ${bucket} is empty.`);
      }
    } catch (bucketErr) {
      console.warn(`[BACKUP] Error processing bucket ${bucket}:`, bucketErr.message || bucketErr);
    }
  }

  // Write manifest
  const manifest = {
    timestamp: new Date().toISOString(),
    supabaseUrl,
    registrationCount: registrations ? registrations.length : 0,
    eventCount: events ? events.length : 0,
    storage: storageSummary,
  };
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`[BACKUP] Backup completed successfully at: ${backupDir}`);
}

runBackup().catch((err) => {
  console.error('[BACKUP] Fatal error during backup:', err);
  process.exit(1);
});
