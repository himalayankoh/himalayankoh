#!/usr/bin/env node
/**
 * Export everything about the production zone that a cutover would need to put
 * back — read-only, and deliberately not a "backup" in the other sense.
 *
 *   node scripts/export-production-dns.mjs [--out <path>]
 *
 * ## Why this exists
 *
 * The cutover is a routing change. The records that describe today's routing are
 * therefore the thing a rollback has to restore exactly, and "I think the apex
 * was an A record to the shared host" is not something to discover while rolling
 * back under pressure. Cloudflare's dashboard export gives a BIND zone file,
 * which is fine for records but says nothing about the *zone settings* that also
 * have to survive — SSL mode and Always Use HTTPS in particular, because the
 * Worker and the origin want different answers for both.
 *
 * ## What it is not
 *
 * This is not the WordPress backup. It cannot see the database, the uploads or
 * the filesystem, and the records it captures are public data — no secret is
 * written. `docs/PRODUCTION-REMEDIATION.md` §7 tracks the database/files backup
 * separately, because it needs hosting access this environment does not have.
 *
 * ## Credentials
 *
 * `CLOUDFLARE_API_TOKEN`, with `Zone → DNS → Read` and `Zone → Zone → Read` on
 * the zone named by `PRODUCTION_SITE_ORIGIN`. Read-only: every request below is a
 * GET.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_SITE_ORIGIN, STAGING_SITE_ORIGIN } from './production-target.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.cloudflare.com/client/v4';

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  process.stderr.write(
    'CLOUDFLARE_API_TOKEN is not set. Source a token with Zone:DNS:Read for the production zone,\n' +
      'e.g. `eval "$(node ../.freebuff/cf-env.mjs dns)"` from the workspace root.\n'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath =
  outFlag !== -1 && args[outFlag + 1]
    ? args[outFlag + 1]
    : join(ROOT, 'docs', 'production', `dns-export-${new Date().toISOString().slice(0, 10)}.json`);

async function get(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* no JSON body */
  }
  if (!res.ok || body?.success === false) {
    const why = body?.errors?.map((e) => `${e.code} ${e.message}`).join('; ') || `HTTP ${res.status}`;
    throw new Error(`GET ${path} failed: ${why}`);
  }
  return body.result;
}

/** The zone the production origin belongs to, looked up rather than hardcoded. */
const zoneName = new URL(PRODUCTION_SITE_ORIGIN).hostname;
const zones = await get(`/zones?name=${encodeURIComponent(zoneName)}&per_page=1`);
const zone = Array.isArray(zones) ? zones[0] : null;
if (!zone) throw new Error(`No zone named ${zoneName} is visible to this token.`);

const records = await get(`/zones/${zone.id}/dns_records?per_page=200`);

/**
 * Zone settings that a cutover or a rollback would have to preserve.
 *
 * Kept to the ones whose value is a routing/TLS decision rather than a
 * preference, and read individually so a setting this token cannot see is
 * recorded as null rather than silently absent.
 */
const SETTING_IDS = [
  'ssl',
  'always_use_https',
  'min_tls_version',
  'automatic_https_rewrites',
  'opportunistic_encryption',
  'security_header',
  'cache_level',
  'development_mode',
];

const settings = {};
for (const id of SETTING_IDS) {
  try {
    const setting = await get(`/zones/${zone.id}/settings/${id}`);
    settings[id] = setting?.value ?? null;
  } catch (error) {
    settings[id] = `UNREADABLE: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const exportData = {
  exportedAt: new Date().toISOString(),
  exportedBy: 'scripts/export-production-dns.mjs (read-only)',
  zone: { id: zone.id, name: zone.name, status: zone.status, nameServers: zone.name_servers },
  // Where the public origins currently point, so the export states the routing
  // it is preserving rather than only the records.
  routing: {
    productionSite: PRODUCTION_SITE_ORIGIN,
    stagingSite: STAGING_SITE_ORIGIN,
  },
  settings,
  recordCount: records.length,
  records: records.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    content: r.content,
    proxied: r.proxied,
    ttl: r.ttl,
    priority: r.priority ?? undefined,
    comment: r.comment ?? undefined,
  })),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(exportData, null, 2)}\n`);

const byName = new Map();
for (const r of exportData.records) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(`${r.type}${r.proxied ? '*' : ''} → ${r.content}`);
}

process.stdout.write(
  `Exported ${exportData.recordCount} records from zone ${zone.name} (${zone.id}).\n` +
    `Zone settings captured: ${Object.keys(settings).join(', ')}\n\n` +
    [...byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, entries]) => `  ${name.padEnd(38)} ${entries.join(' | ')}`)
      .join('\n') +
    `\n\nWritten to ${outPath.replace(ROOT, '.').split('\\').join('/')}\n` +
    `This is a DNS + zone-settings export, NOT the WordPress database/files backup.\n`
);
