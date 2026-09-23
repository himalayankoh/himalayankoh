#!/usr/bin/env node
/**
 * Staging QA for LeadOS and CRM — persistence through the real endpoints.
 *
 *   node scripts/qa-leados-crm.mjs [--base http://127.0.0.1:3103]
 *
 * Everything goes through the running app and the WordPress plugin's own routes:
 * admin sign-in first, then the LeadOS project/lead cycle and the CRM inbox. The
 * interesting assertions are the ones that would catch a migration that only
 * *looks* finished:
 *
 *   - a saved lead comes back from WordPress, not from the response echo
 *   - saving the same OSM lead twice updates the row instead of duplicating it
 *     (the dedupe key is workspace + provider + osm_type + osm_id)
 *   - a lead carries `openstreetmap` as its source, and no other provider is
 *     invented for it
 *   - the CRM inbox accepts and returns a lead
 *
 * Rows created here carry a `QA-STAGING-<stamp>` marker. The LeadOS lead is deleted
 * through its own DELETE route; the project and the CRM row have no delete endpoint
 * (only GET/POST are registered), so they are left plainly marked as staging test
 * data rather than silently polluting the inbox — this script prints exactly what it
 * left behind.
 *
 * Outreach sending is deliberately not exercised: it is an outbound-mail action
 * against a real prospect list, and this pass must not send anything.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 1) continue;
    out[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const baseArg = process.argv.indexOf('--base');
const BASE = (baseArg > 0 ? process.argv[baseArg + 1] : 'http://127.0.0.1:3103').replace(/\/+$/, '');
const WP = String(env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
const WP_AUTH = `Basic ${Buffer.from(
  `${env.WORDPRESS_ADMIN_USER}:${env.WORDPRESS_ADMIN_APP_PASSWORD}`
).toString('base64')}`;

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(40)} ${detail}`);
};

const STAMP = Date.now();
const MARK = `QA-STAGING-${STAMP}`;
const leftBehind = [];

// Admin session through the app's own login route (WordPress door).
const loginRes = await fetch(`${BASE}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: env.WORDPRESS_ADMIN_USER,
    password: env.WORDPRESS_ADMIN_APP_PASSWORD,
  }),
});
const session = await loginRes.json().catch(() => ({}));
if (!loginRes.ok || !session.token) {
  console.log('FAIL  admin sign-in:', session.error || loginRes.status);
  process.exit(1);
}

const APP = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
const PLUGIN = { Authorization: WP_AUTH, 'Content-Type': 'application/json' };

async function call(url, init, headers) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

const app = (path, init) => call(`${BASE}${path}`, init, APP);
const plugin = (path, init) => call(`${WP}/wp-json${path}`, init, PLUGIN);

let leadId = null;
let projectId = null;

try {
  // ---- LeadOS: read paths ---------------------------------------------------
  const stats = await app('/api/admin/leados/stats');
  record('LeadOS stats', stats.ok, `HTTP ${stats.status}`);

  const projects = await plugin('/leados/v1/projects');
  const existing = Array.isArray(projects.body?.projects) ? projects.body.projects.length : null;
  record('LeadOS projects list', projects.ok && existing !== null, `HTTP ${projects.status} n=${existing}`);

  // ---- LeadOS: create a project --------------------------------------------
  projectId = `qa-${STAMP}`;
  const madeProject = await plugin('/leados/v1/projects', {
    method: 'POST',
    body: JSON.stringify({
      id: projectId,
      name: `${MARK} project`,
      shortDescription: 'staging QA — safe to mark archived',
      status: 'active',
    }),
  });
  const created = madeProject.body?.project ?? madeProject.body;
  record('LeadOS project save', madeProject.ok && !!created?.id, `HTTP ${madeProject.status} id=${created?.id ?? '-'}`);

  const rereadProject = await plugin(`/leados/v1/projects/${projectId}`);
  record(
    '  project read back from WordPress',
    rereadProject.ok && String(rereadProject.body?.name || '').includes(MARK),
    `name="${String(rereadProject.body?.name || '').slice(0, 26)}"`
  );

  // ---- LeadOS: save a lead twice -------------------------------------------
  const lead = {
    business_name: `${MARK} Feed Store`,
    category: 'Farm supplies',
    address: '1 QA Way',
    city: 'Ketchum',
    region: 'ID',
    country: 'US',
    website: 'https://example.test/qa',
    phone: '+15550100',
    osm_type: 'node',
    osm_id: String(STAMP),
    osm_url: `https://www.openstreetmap.org/node/${STAMP}`,
    tags: ['qa', 'staging'],
  };

  const first = await plugin('/leados/v1/leads', { method: 'POST', body: JSON.stringify({ lead }) });
  const firstRow = first.body?.lead ?? first.body;
  leadId = firstRow?.id ?? null;
  record('LeadOS lead save', first.ok && !!leadId, `HTTP ${first.status} id=${leadId ?? '-'}`);
  record(
    '  source is OpenStreetMap',
    String(firstRow?.data_source || '') === 'openstreetmap',
    `data_source=${firstRow?.data_source}`
  );

  const second = await plugin('/leados/v1/leads', {
    method: 'POST',
    body: JSON.stringify({ lead: { ...lead, business_name: `${MARK} Feed Store (edited)`, phone: '+15550199' } }),
  });
  const secondRow = second.body?.lead ?? second.body;
  record(
    'dedupe: same lead updates, not duplicates',
    second.ok && String(secondRow?.id) === String(leadId) && String(secondRow?.phone) === '+15550199',
    `id=${secondRow?.id} phone=${secondRow?.phone}`
  );

  const search = await plugin(`/leados/v1/leads?search=${encodeURIComponent(MARK)}`, {}, {});
  const rows = search.body?.leads ?? search.body?.items ?? [];
  record('LeadOS lead search finds exactly one', search.ok && rows.length === 1, `n=${rows.length}`);

  // ---- LeadOS through the app's own route ----------------------------------
  const appLeads = await app(`/api/admin/leados/leads?search=${encodeURIComponent(MARK)}`);
  const appRows = appLeads.body?.leads ?? appLeads.body?.items ?? [];
  record('app /api/admin/leados/leads reads it', appLeads.ok && appRows.length >= 1, `HTTP ${appLeads.status} n=${appRows.length}`);

  const appProjects = await app('/api/admin/leados/projects');
  record('app /api/admin/leados/projects', appProjects.ok, `HTTP ${appProjects.status}`);

  const scoring = await app('/api/admin/leados/scoring', {
    method: 'POST',
    body: JSON.stringify({ lead }),
  });
  // The route wraps the calculator's own result: `{ ok, result }`.
  const result = scoring.body?.result ?? {};
  const score = result.score ?? result.total ?? result.opportunityScore ?? result.opportunity_score;
  record(
    'app scoring answers a number',
    scoring.ok && Number.isFinite(Number(score)),
    `score=${score} keys=${Object.keys(result).slice(0, 5).join(',')}`
  );

  // ---- CRM -----------------------------------------------------------------
  const crmEmail = `qa-staging-${STAMP}@example.test`;
  const crmLead = await plugin('/crm/v1/leads', {
    method: 'POST',
    body: JSON.stringify({
      email: crmEmail,
      name: `${MARK} CRM`,
      source: 'qa_staging',
      company: 'QA',
      metadata: { marker: MARK },
    }),
  });
  const crmRow = crmLead.body?.lead;
  record('CRM lead save', crmLead.ok && !!crmRow?.id, `HTTP ${crmLead.status} id=${crmRow?.id ?? '-'}`);
  if (crmRow?.id) leftBehind.push(`crm_leads id=${crmRow.id} (email qa-staging-${STAMP}@example.test)`);

  const crmList = await plugin(`/crm/v1/leads?search=${encodeURIComponent(`qa-staging-${STAMP}`)}`);
  const crmRows = crmList.body?.leads ?? [];
  record('CRM reads the lead back', crmList.ok && crmRows.length >= 1, `n=${crmRows.length}`);

  const crmRejected = await plugin('/crm/v1/leads', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  record('CRM refuses an invalid email', crmRejected.status === 400, `HTTP ${crmRejected.status}`);

  // ---- cleanup -------------------------------------------------------------
  const removed = await plugin(`/leados/v1/leads/${leadId}`, { method: 'DELETE' });
  record('LeadOS lead deleted', removed.ok, `HTTP ${removed.status}`);
  if (removed.ok) leadId = null;

  const archived = await plugin('/leados/v1/projects', {
    method: 'POST',
    body: JSON.stringify({ id: projectId, name: `${MARK} project`, status: 'archived' }),
  });
  record('QA project marked archived', archived.ok, `HTTP ${archived.status}`);
  leftBehind.push(`leados_projects id=${projectId} (name "${MARK} project", archived)`);
} catch (error) {
  record('run', false, error instanceof Error ? error.message : String(error));
} finally {
  if (leadId) {
    await plugin(`/leados/v1/leads/${leadId}`, { method: 'DELETE' }).catch(() => {});
    console.log(`CLEANUP  deleted leftover lead ${leadId}`);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (leftBehind.length) {
  console.log('LEFT ON STAGING (no delete endpoint exists for these):');
  for (const row of leftBehind) console.log('  -', row);
}
process.exit(failed ? 1 : 0);
