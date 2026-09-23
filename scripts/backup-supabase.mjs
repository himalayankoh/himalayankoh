/**
 * Supabase Data Export Script
 *
 * Run this script to export ALL Supabase data to local JSON files before
 * removing the Supabase dependency. This creates a backup in ./supabase-backup/
 *
 * Usage: node --experimental-modules scripts/backup-supabase.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const backupDir = join(process.cwd(), 'supabase-backup');

// Tables to export
const TABLES = [
  'profiles',
  'orders',
  'order_items',
  'cart_items',
  'wishlist_items',
  'addresses',
  'leads',
  'lead_projects',
  'lead_library',
  'blog_posts',
  'categories',
  'notifications',
  'crm_leads',
  'youtube_settings',
  'youtube_videos',
  'site_events',
  'product_stats',
  'seo_metadata',
  'hubspot_contacts',
  'hermes_evidence',
  'admin_settings',
];

async function exportTable(tableName) {
  try {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' });

    if (error) {
      console.log(`  ⚠ ${tableName}: ${error.message}`);
      return { table: tableName, rows: 0, error: error.message };
    }

    const filename = join(backupDir, `${tableName}.json`);
    writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${tableName}: ${data?.length || 0} rows exported`);
    return { table: tableName, rows: data?.length || 0 };
  } catch (err) {
    console.log(`  ⚠ ${tableName}: ${err.message}`);
    return { table: tableName, rows: 0, error: err.message };
  }
}

async function main() {
  console.log('=== Supabase Data Export ===\n');
  console.log(`Project: ${SUPABASE_URL}`);
  mkdirSync(backupDir, { recursive: true });

  const results = [];
  for (const table of TABLES) {
    results.push(await exportTable(table));
  }

  // Write manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    projectUrl: SUPABASE_URL,
    results,
    totalTables: TABLES.length,
    successfulTables: results.filter(r => r.rows > 0).length,
    totalRows: results.reduce((sum, r) => sum + r.rows, 0),
  };
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n=== Complete ===`);
  console.log(`Tables: ${manifest.successfulTables}/${manifest.totalTables} with data`);
  console.log(`Total rows: ${manifest.totalRows}`);
  console.log(`Backup location: ${backupDir}/`);
}

main().catch(console.error);
