// LeadOS / CRM migration: Supabase → WordPress.
//
// Moves the `leados_*` tables and `crm_leads` from the Supabase project into the
// custom tables created by `wordpress/himalayan-koh-leados.php`, through the
// plugin's own `leados/v1/import` endpoint. See docs/LEADOS-WORDPRESS-CONTRACT.md.
//
//   npm run migrate:leados                       # DRY RUN — reads both sides, writes nothing
//   npm run migrate:leados -- --apply            # perform the import
//   npm run migrate:leados -- --apply --tables=leados_leads,crm_leads
//
// DRY RUN IS THE DEFAULT. This script rewrites tables that hold the owner's lead
// library, so writing has to be something you asked for by name.
//
// It is idempotent: the import endpoint uses REPLACE with the source ids, so
// running it twice leaves one copy of each row rather than two.
//
// IDS: `leados_*` ids are UUID strings in both systems and are preserved, which
// matters because `leados_project_leads` points at them. `crm_leads.id` was a
// UUID in Supabase and is a bigint in WordPress, and `leados_audit_logs.id` is an
// auto-increment log, so those two are reassigned — nothing references them.
//
// ORDER MATTERS: projects are imported before leads, and leads before the
// project↔lead links, so a row is never written before the row it points at.

import { loadEnv, getEnvConfig } from './lib/env.mjs';

loadEnv();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const applyArg = process.argv.find((a) => a.startsWith('--tables='));
const apply = args.has('--apply') || args.has('--yes');

const { supabaseUrl, serviceRoleKey } = getEnvConfig();
const wpBase = (
  process.env.WORDPRESS_BASE_URL ||
  process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL ||
  ''
).replace(/\/+$/, '');
const wpUser = (process.env.WORDPRESS_ADMIN_USER || '').trim();
// WordPress displays the password in spaced groups; the spaces are cosmetic.
const wpPassword = (process.env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '');

const wpApiRoot = wpBase ? `${wpBase}/wp-json` : '';
const PAGE_SIZE = 1000; // PostgREST's per-request ceiling
const IMPORT_BATCH = 200;
const TIMEOUT_MS = Number(process.env.WORDPRESS_REQUEST_TIMEOUT_MS || 30000);
const UA = 'Mozilla/5.0 (compatible; HimalayanKoh-migrate-leados/1.0)';

/**
 * The source tables, in dependency order, each paired with the WordPress stat
 * that must equal its row count afterwards. `orderBy` keeps PostgREST paging
 * stable — without it, page 2 can repeat rows from page 1.
 */
const TABLES = [
  { table: 'leados_workspaces', orderBy: 'id', wpStat: 'workspacesCount' },
  { table: 'leados_projects', orderBy: 'id', wpStat: 'projectsCount' },
  { table: 'leados_leads', orderBy: 'id', wpStat: 'savedLeadsCount' },
  {
    table: 'leados_project_leads',
    orderBy: 'project_id,lead_id',
    wpStat: 'projectLeadsCount',
    note: 'link rows follow their leads',
  },
  { table: 'leados_searches', orderBy: 'id', wpStat: 'searchesCount' },
  { table: 'leados_audit_logs', orderBy: 'id', wpStat: 'auditLogCount', note: 'ids reassigned (auto-increment log)' },
  { table: 'crm_leads', orderBy: 'created_at', wpStat: 'crmLeadsCount', note: 'ids reassigned (UUID → bigint)' },
];

const selected = applyArg
  ? new Set(applyArg.slice('--tables='.length).split(',').map((t) => t.trim()).filter(Boolean))
  : null;

const plan = selected ? TABLES.filter((entry) => selected.has(entry.table)) : TABLES;

const unknown = selected ? [...selected].filter((t) => !TABLES.some((e) => e.table === t)) : [];
if (unknown.length) {
  console.error(`Unknown table(s): ${unknown.join(', ')}`);
  console.error(`Known: ${TABLES.map((t) => t.table).join(', ')}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

const problems = [];
if (!supabaseUrl || !serviceRoleKey) {
  problems.push('Supabase: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (reads the source rows).');
}
if (!wpApiRoot) {
  problems.push('WordPress: set WORDPRESS_BASE_URL (or NEXT_PUBLIC_WORDPRESS_BASE_URL).');
}
if (!wpUser || !wpPassword) {
  problems.push('WordPress: set WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD (writes the target rows).');
}
if (problems.length) {
  console.error('Cannot run — missing configuration:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('LeadOS / CRM → WordPress migration');
console.log(`  mode:      ${apply ? 'APPLY (writing)' : 'DRY RUN (nothing will be written)'}`);
console.log(`  supabase:  ${supabaseUrl}`);
console.log(`  wordpress: ${wpApiRoot}`);
console.log(`  tables:    ${plan.map((t) => t.table).join(', ')}`);
console.log('');

// ---------------------------------------------------------------------------
// Supabase (source)
// ---------------------------------------------------------------------------

const supabaseHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'User-Agent': UA,
};

/** Exact row count, without downloading the rows. `null` when the table is absent. */
async function supabaseCount(table) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`;
  const response = await fetch(url, {
    headers: { ...supabaseHeaders, Prefer: 'count=exact', Range: '0-0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // PostgREST says 42P01/PGRST205 when the relation is not in the schema cache:
    // a table this project never had, which is a fact to report, not a crash.
    if (/42P01|PGRST205|does not exist/i.test(body)) return { count: null, missing: true };
    throw new Error(`Supabase count failed for ${table}: HTTP ${response.status} ${body.slice(0, 200)}`);
  }

  // `Content-Range: 0-0/1234` (or `*/1234` when the range is empty).
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return { count: Number.isFinite(total) ? total : 0, missing: false };
}

/** Reads every row, one page at a time. */
async function supabaseFetchAll(table, orderBy) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${supabaseUrl}/rest/v1/${table}` +
      `?select=*&order=${encodeURIComponent(orderBy)}&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: supabaseHeaders,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Supabase read failed for ${table}: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// WordPress (target)
// ---------------------------------------------------------------------------

function wpHeaders() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': UA,
    Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPassword}`).toString('base64')}`,
  };
}

/** One WordPress call. Returns parsed JSON; throws with the API's own message. */
async function wpRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${wpApiRoot}${path}`, {
    method,
    headers: wpHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* WordPress answered with HTML — most often a PHP fatal or a login page */
  }

  if (!response.ok) {
    const message = json?.message || text.slice(0, 200) || `HTTP ${response.status}`;
    throw new Error(`WordPress ${method} ${path} → HTTP ${response.status}: ${message}`);
  }
  if (json === null) {
    throw new Error(`WordPress ${method} ${path} → response was not JSON: ${text.slice(0, 200)}`);
  }
  return json;
}

/** The plugin's own counters, used for the before/after comparison. */
async function readWpStats() {
  const { stats } = await wpRequest('/leados/v1/stats');
  return stats || {};
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function formatCount(value) {
  return value === null || value === undefined ? '—' : String(value);
}

async function main() {
  // A wrong credential should fail here, before anything is read or written.
  const beforeStats = await readWpStats();
  console.log('WordPress reachable. Counts before import:');
  for (const entry of plan) {
    console.log(`  ${entry.table.padEnd(22)} ${formatCount(beforeStats[entry.wpStat])}`);
  }
  console.log('');

  const results = [];

  for (const entry of plan) {
    const { table, orderBy, wpStat, note } = entry;
    process.stdout.write(`→ ${table}${note ? ` (${note})` : ''}\n`);

    let source;
    try {
      source = await supabaseCount(table);
    } catch (error) {
      console.log(`  ⚠ ${error.message}\n`);
      results.push({ table, wpStat, source: null, imported: 0, error: error.message });
      continue;
    }

    if (source.missing) {
      console.log('  ⚠ not present in the Supabase schema — skipped\n');
      results.push({ table, wpStat, source: null, imported: 0, missing: true });
      continue;
    }

    console.log(`  source rows: ${source.count}`);

    if (source.count === 0) {
      console.log('  nothing to import\n');
      results.push({ table, wpStat, source: 0, imported: 0 });
      continue;
    }

    let rows;
    try {
      rows = await supabaseFetchAll(table, orderBy);
    } catch (error) {
      console.log(`  ⚠ ${error.message}\n`);
      results.push({ table, wpStat, source: source.count, imported: 0, error: error.message });
      continue;
    }

    if (rows.length !== source.count) {
      // Not fatal, but worth saying: it means rows moved between the count and
      // the read, and the comparison at the end will show it.
      console.log(`  ⚠ read ${rows.length} rows but the count said ${source.count}`);
    }

    if (!apply) {
      console.log(`  DRY RUN — would import ${rows.length} rows\n`);
      results.push({ table, wpStat, source: source.count, imported: 0, dryRun: true, wouldImport: rows.length });
      continue;
    }

    let imported = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
      const batch = rows.slice(i, i + IMPORT_BATCH);
      try {
        const result = await wpRequest('/leados/v1/import', {
          method: 'POST',
          body: { table, rows: batch },
        });
        imported += result.imported ?? 0;
        for (const message of result.errors || []) errors.push(message);
      } catch (error) {
        errors.push(error.message);
        break;
      }
      process.stdout.write(`  imported ${Math.min(i + batch.length, rows.length)}/${rows.length}\r`);
    }

    console.log(`  imported: ${imported}${errors.length ? `  errors: ${errors.length}` : '        '}`);
    for (const message of errors.slice(0, 3)) console.log(`    ⚠ ${message}`);
    console.log('');
    results.push({ table, wpStat, source: source.count, imported, errors });
  }

  // -------------------------------------------------------------------------
  // Comparison
  // -------------------------------------------------------------------------

  const afterStats = apply ? await readWpStats() : beforeStats;

  console.log('=== Count comparison ===');
  console.log(`  ${'table'.padEnd(22)} ${'supabase'.padStart(9)} ${'wordpress'.padStart(10)}  result`);

  let mismatches = 0;
  for (const result of results) {
    const { table, wpStat, source, imported } = result;
    const wpCount = afterStats[wpStat];

    if (result.missing || result.error) {
      console.log(`  ${table.padEnd(22)} ${formatCount(source).padStart(9)} ${formatCount(wpCount).padStart(10)}  ⚠ skipped`);
      continue;
    }

    if (!apply) {
      console.log(
        `  ${table.padEnd(22)} ${formatCount(source).padStart(9)} ${formatCount(wpCount).padStart(10)}  would import ${result.wouldImport}`
      );
      continue;
    }

    const ok = wpCount !== null && wpCount !== undefined && wpCount >= source;
    if (!ok) mismatches++;
    console.log(
      `  ${table.padEnd(22)} ${formatCount(source).padStart(9)} ${formatCount(wpCount).padStart(10)}  ${ok ? '✓' : '✗ MISMATCH'}${imported !== source ? ` (imported ${imported})` : ''}`
    );
  }

  console.log('');
  if (!apply) {
    console.log('DRY RUN complete — nothing was written. Re-run with --apply to import.');
    return;
  }

  if (mismatches) {
    console.log(`${mismatches} table(s) did not match. Nothing was deleted from Supabase — investigate before retiring it.`);
    process.exitCode = 1;
    return;
  }

  console.log('All counts match. Supabase still holds the originals; retire it only after you are satisfied.');
  console.log('Note: any WordPress rows created since the plugin was activated are counted too, so a table');
  console.log('strictly greater than its source count is expected once the console has been used.');
}

main().catch((error) => {
  console.error(`\nMigration failed: ${error.message}`);
  process.exitCode = 1;
});
