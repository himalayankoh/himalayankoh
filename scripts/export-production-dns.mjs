#!/usr/bin/env node
/**
 * Export everything about the production zone that a cutover would need to put
 * back — read-only, and deliberately not a "backup" in the other sense.
 *
 *   node scripts/export-production-dns.mjs [--out <path>] [--public]
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
 * ## Credentials, and the fallback that keeps this runnable
 *
 * The API path needs `CLOUDFLARE_API_TOKEN` with `Zone → DNS → Read` and
 * `Zone → Zone → Read` on the zone named by `PRODUCTION_SITE_ORIGIN`. Every
 * request is a GET.
 *
 * That token does not always have DNS permission — the one in this environment
 * today reads the zone and its settings but is refused `GET /dns_records`
 * (`10000 Authentication error`), and permission can be rotated away without
 * warning. A rollback reference that stops existing when a token changes is worse
 * than none, because its absence is silent. So when the API cannot read the
 * records, this falls back to querying **public resolvers** over DNS-over-HTTPS
 * and writes the same shape, marked `source: "public-dns"`.
 *
 * The fallback is honest about what it loses, and records the loss in the file:
 *
 *   - **record ids are absent** — a public query cannot see them, and they are what
 *     a targeted API delete or restore would use;
 *   - **`proxied` is `null`** rather than guessed: a proxied record resolves to a
 *     Cloudflare anycast address and a DNS-only record resolves to the origin, and
 *     inferring which from the answer would be a guess dressed as a fact. What
 *     resolves *is* recorded, which is what a rollback needs to compare against;
 *   - **zone settings are `UNREADABLE`** — they are API-only;
 *   - **records added since the last API read appear**, which is the point: a
 *     public snapshot sees `wp.himalayankoh.com`, and the API export in
 *     `docs/production/` predates it.
 *
 * `--public` forces the snapshot even when the token can read the zone, for when a
 * second opinion is wanted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_SITE_ORIGIN, STAGING_SITE_ORIGIN } from './production-target.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.cloudflare.com/client/v4';
const DOH = 'https://cloudflare-dns.com/dns-query';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath =
  outFlag !== -1 && args[outFlag + 1]
    ? args[outFlag + 1]
    : join(ROOT, 'docs', 'production', `dns-export-${new Date().toISOString().slice(0, 10)}.json`);
const forcePublic = args.includes('--public');

const token = process.env.CLOUDFLARE_API_TOKEN;

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

/** Read the zone and its records + settings through the API. Throws on any refusal. */
async function readViaApi() {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');

  const zoneName = new URL(PRODUCTION_SITE_ORIGIN).hostname;
  const zones = await get(`/zones?name=${encodeURIComponent(zoneName)}&per_page=1`);
  const zone = Array.isArray(zones) ? zones[0] : null;
  if (!zone) throw new Error(`No zone named ${zoneName} is visible to this token.`);

  // Read the records *first*. If this is what the token lacks, nothing else here is
  // worth doing, and the caller falls back to a snapshot rather than a half export.
  const records = await get(`/zones/${zone.id}/dns_records?per_page=200`);

  const settings = {};
  for (const id of SETTING_IDS) {
    try {
      const setting = await get(`/zones/${zone.id}/settings/${id}`);
      settings[id] = setting?.value ?? null;
    } catch (error) {
      settings[id] = `UNREADABLE: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return {
    source: 'cloudflare-api',
    zone: { id: zone.id, name: zone.name, status: zone.status, nameServers: zone.name_servers },
    settings,
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
    limitations: [],
  };
}

/** One DNS query over HTTPS. Returns the answer strings, or an error marker. */
async function doh(name, type) {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { error: `resolver HTTP ${response.status}` };
    const body = await response.json();
    if (body.Status === 3) return { answers: [] }; // NXDOMAIN is an answer, not a failure
    if (body.Status !== 0) return { error: `resolver status ${body.Status}` };
    return { answers: (body.Answer || []).map((row) => String(row.data)) };
  } catch (error) {
    return { error: error?.name === 'TimeoutError' ? 'timed out' : String(error?.message || error) };
  }
}

/** Strip the trailing dot resolvers put on names and MX/NS targets. */
const undot = (value) => value.replace(/\.$/, '');

/**
 * Reconstruct the routing that is publicly observable, without the API.
 *
 * Names are the ones this deployment's documentation and configuration actually
 * reference — the apex, `www`, the two backend candidates, the staging origin, and
 * the mail names — so the snapshot stays a description of this deployment rather than
 * a bulk zone dump. Types are the ones a rollback would have to restore; TXT records
 * that are not SPF/DKIM/DMARC/verification are included because a domain-verification
 * token is a record the owner would otherwise have to regenerate.
 */
async function readViaPublicDns() {
  const zoneName = new URL(PRODUCTION_SITE_ORIGIN).hostname;
  const names = [
    zoneName,
    `www.${zoneName}`,
    `mail.${zoneName}`,
    `webmail.${zoneName}`,
    `wp.${zoneName}`,
    new URL(STAGING_SITE_ORIGIN).hostname,
  ];

  const queries = [];
  for (const name of names) {
    for (const type of ['A', 'AAAA', 'CNAME']) queries.push({ name, type });
  }
  for (const type of ['MX', 'NS', 'CAA', 'SOA']) queries.push({ name: zoneName, type });
  for (const type of ['TXT']) {
    for (const name of [zoneName, `_dmarc.${zoneName}`, `default._domainkey.${zoneName}`]) {
      queries.push({ name, type });
    }
  }

  const records = [];
  const failures = [];

  for (const { name, type } of queries) {
    const result = await doh(name, type);
    if (result.error) {
      failures.push(`${type} ${name}: ${result.error}`);
      continue;
    }
    for (const answer of result.answers || []) {
      // DoH answers carry "content" shaped per type; MX and NS/SOA/… keep a
      // preference or an origin in the same string, which is what the API would
      // have split out. Store the raw answer and say so.
      const priorityMatch = type === 'MX' ? /^(\d+)\s+(.+)$/.exec(answer) : null;
      records.push({
        type,
        name,
        content: undot(priorityMatch ? priorityMatch[2] : answer),
        // A public query cannot see whether Cloudflare is proxying — the answer is
        // either an anycast address or the origin, and inferring which would be a
        // guess. Null is the honest value; `content` is what a rollback compares.
        proxied: null,
        ttl: undefined,
        priority: priorityMatch ? Number(priorityMatch[1]) : undefined,
      });
    }
  }

  // CNAME and A can both answer for the same name; a CNAME wins, because that is the
  // record a resolver actually followed.
  const cnameNames = new Set(records.filter((r) => r.type === 'CNAME').map((r) => r.name));
  const deduped = records.filter((r) => !(r.type !== 'CNAME' && cnameNames.has(r.name)));

  const settings = Object.fromEntries(
    SETTING_IDS.map((id) => [id, 'UNREADABLE: zone settings are only available through the Cloudflare API']),
  );

  let zoneId = null;
  if (token) {
    try {
      const zones = await get(`/zones?name=${encodeURIComponent(zoneName)}&per_page=1`);
      zoneId = Array.isArray(zones) ? zones[0]?.id ?? null : null;
    } catch {
      /* the snapshot does not depend on the zone id */
    }
  }

  const ns = deduped.filter((r) => r.type === 'NS').map((r) => r.content);

  return {
    source: 'public-dns',
    zone: { id: zoneId, name: zoneName, status: null, nameServers: ns.length ? ns : null },
    settings,
    records: deduped,
    limitations: [
      'Record ids are absent: a public query cannot see them, and they are what a targeted API restore needs.',
      'proxied is null for every record: whether Cloudflare is proxying cannot be read from a public answer.',
      'Zone settings (SSL mode, Always Use HTTPS, …) are API-only and are recorded as UNREADABLE.',
      'TXT values are returned without their SPF/DKIM semantics applied — a line that describes a record, not a verdict on it.',
      ...(failures.length ? [`${failures.length} query(ies) did not answer: ${failures.slice(0, 5).join('; ')}`] : []),
    ],
  };
}

let exportBody;
let sourceNote;

if (forcePublic) {
  exportBody = await readViaPublicDns();
  sourceNote = '--public was passed, so the API was not used.';
} else {
  try {
    exportBody = await readViaApi();
    sourceNote = 'Read through the Cloudflare API.';
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Cloudflare API path unavailable: ${why}\nFalling back to a public-resolver snapshot.\n`);
    exportBody = await readViaPublicDns();
    sourceNote = `The Cloudflare API could not read the records (${why}), so this is a public-resolver snapshot.`;
  }
}

const exportData = {
  exportedAt: new Date().toISOString(),
  exportedBy: 'scripts/export-production-dns.mjs (read-only)',
  source: exportBody.source,
  sourceNote,
  zone: exportBody.zone,
  // Where the public origins currently point, so the export states the routing
  // it is preserving rather than only the records.
  routing: {
    productionSite: PRODUCTION_SITE_ORIGIN,
    stagingSite: STAGING_SITE_ORIGIN,
  },
  settings: exportBody.settings,
  recordCount: exportBody.records.length,
  records: exportBody.records,
  limitations: exportBody.limitations,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(exportData, null, 2)}\n`);

const byName = new Map();
for (const r of exportBody.records) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(`${r.type}${r.proxied === true ? '*' : r.proxied === null ? '~' : ''} → ${r.content}`);
}

process.stdout.write(
  `Exported ${exportData.recordCount} records for zone ${exportData.zone.name} ` +
    `${exportData.zone.id ? `(${exportData.zone.id})` : ''} — source: ${exportData.source}\n` +
    `${sourceNote}\n` +
    `Zone settings captured: ${Object.keys(exportBody.settings).join(', ')}\n\n` +
    [...byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, entries]) => `  ${name.padEnd(38)} ${entries.join(' | ')}`)
      .join('\n') +
    (exportBody.limitations.length
      ? `\n\nWhat this snapshot cannot see:\n${exportBody.limitations.map((l) => `  - ${l}`).join('\n')}`
      : '') +
    `\n\nWritten to ${outPath.replace(ROOT, '.').split('\\').join('/')}\n` +
    `This is a DNS + zone-settings export, NOT the WordPress database/files backup.\n`,
);
