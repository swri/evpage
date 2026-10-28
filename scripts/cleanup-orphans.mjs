#!/usr/bin/env node
// Automated orphan payment proof cleanup for EvPage.
// Safely removes payment proof files that are not referenced by any registration
// and are older than 1 hour (to never touch in-flight uploads).
// Usage: node scripts/cleanup-orphans.mjs [--dry-run]

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
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

loadEnv();

const isDryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runCleanup() {
  console.log(`[CLEANUP] Starting orphan payment proof cleanup (dry-run: ${isDryRun})...`);

  if (!supabaseUrl) {
    console.error('[CLEANUP] Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required.');
    process.exit(1);
  }

  if (!serviceKey) {
    console.error(
      '[CLEANUP] Error: SUPABASE_SERVICE_ROLE_KEY is required to safely inspect and purge unreferenced storage files across organizations.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Call the platform orphan listing RPC (which inspects files older than 1 hour not referenced by registrations)
  const { data: orphans, error: rpcError } = await supabase.rpc('list_orphan_payment_proofs');
  if (rpcError) {
    console.error('[CLEANUP] RPC list_orphan_payment_proofs failed:', rpcError.message);
    process.exit(1);
  }

  const fileList = (orphans || []).map((o) => o.name).filter(Boolean);
  console.log(`[CLEANUP] Found ${fileList.length} orphan file(s) older than 1 hour.`);

  if (fileList.length === 0) {
    console.log('[CLEANUP] Bucket is clean. Nothing to remove.');
    return;
  }

  if (isDryRun) {
    console.log('[CLEANUP] Dry-run enabled. Orphan files to be removed:');
    fileList.forEach((f) => console.log(`  - ${f}`));
    return;
  }

  // Remove files in batches of 100
  const BATCH_SIZE = 100;
  let totalRemoved = 0;
  for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
    const batch = fileList.slice(i, i + BATCH_SIZE);
    const { data, error: rmError } = await supabase.storage.from('payment-proofs').remove(batch);
    if (rmError) {
      console.error(`[CLEANUP] Failed to remove batch starting at index ${i}:`, rmError.message);
    } else {
      totalRemoved += data?.length ?? 0;
      console.log(`[CLEANUP] Removed batch: ${data?.length ?? 0} file(s).`);
    }
  }

  console.log(`[CLEANUP] Housekeeping complete. Total files purged: ${totalRemoved}.`);
}

runCleanup().catch((err) => {
  console.error('[CLEANUP] Unexpected error:', err);
  process.exit(1);
});
