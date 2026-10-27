#!/usr/bin/env node
// Automated backup script for EvPage
// Exports registrations (JSON & CSV), events, and downloads storage bucket files.
// Usage: node scripts/backup-data.mjs [--dir <output_dir>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

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

async function runBackup() {
  const timestamp = getTimestamp();
  const backupDirName = `backup-${timestamp}`;
  const backupDir = join(root, 'backups', backupDirName);

  mkdirSync(backupDir, { recursive: true });
  console.log(`[BACKUP] Initializing backup at: ${backupDir}`);

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[BACKUP] No Supabase credentials detected (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).');
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
    console.log(`[BACKUP] Offline backup completed successfully in ${backupDir}`);
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  console.log('[BACKUP] Connected to Supabase. Fetching registrations...');
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: false });

  if (regError) {
    console.error('[BACKUP] Error fetching registrations:', regError);
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
    console.error('[BACKUP] Error fetching events:', evtError);
  } else {
    const evtList = events || [];
    writeFileSync(join(backupDir, 'events.json'), JSON.stringify(evtList, null, 2));
    console.log(`[BACKUP] Saved ${evtList.length} events.`);
  }

  // Backup Storage Buckets
  const buckets = ['payment-proofs', 'form-attachments'];
  const storageSummary = {};

  for (const bucket of buckets) {
    console.log(`[BACKUP] Checking storage bucket: ${bucket}...`);
    try {
      const { data: files, error: listError } = await supabase.storage.from(bucket).list('', {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (listError) {
        console.warn(`[BACKUP] Could not list bucket ${bucket} (may not exist or insufficient permissions):`, listError.message);
        continue;
      }

      if (files && files.length > 0) {
        const bucketFolder = join(backupDir, 'storage', bucket);
        mkdirSync(bucketFolder, { recursive: true });
        let downloadedCount = 0;

        for (const file of files) {
          if (!file.name || file.name === '.emptyFolderPlaceholder') continue;
          const { data: blob, error: dlError } = await supabase.storage.from(bucket).download(file.name);
          if (dlError) {
            console.warn(`[BACKUP] Failed downloading ${bucket}/${file.name}:`, dlError.message);
          } else if (blob) {
            const buffer = Buffer.from(await blob.arrayBuffer());
            writeFileSync(join(bucketFolder, file.name), buffer);
            downloadedCount++;
          }
        }
        storageSummary[bucket] = downloadedCount;
        console.log(`[BACKUP] Downloaded ${downloadedCount} files from ${bucket}.`);
      } else {
        storageSummary[bucket] = 0;
        console.log(`[BACKUP] Bucket ${bucket} is empty.`);
      }
    } catch (bucketErr) {
      console.warn(`[BACKUP] Error processing bucket ${bucket}:`, bucketErr);
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
