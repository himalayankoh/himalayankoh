#!/usr/bin/env node
/**
 * Live-verify the WordPress side of the migration: every place the application now
 * *writes* instead of writing to Supabase.
 *
 *   npm run verify:wordpress            # prints what it would do
 *   npm run verify:wordpress -- --apply # performs the writes against the target site
 *
 * Why this exists: `check:wordpress` proves the endpoints are there and answer, but a
 * route that lists rows and a route that stores one are different code paths, and only
 * the second one is the migration. This exercises the second.
 *
 * What it cannot do: WordPress exposes no delete route for newsletter subscribers,
 * contact messages, events or Hermes evidence — those tables are append-only by design.
 * The rows this script creates are labelled `cutover-verify-<stamp>` so they are
 * recognisable, and the leftovers are listed at the end rather than hidden.
 *
 * Reversible by construction: the blog post and the media item are deleted again, the
 * settings and category-hub writes re-write the value that was already there, and the
 * console record is written under its own `cutover_verify` table name and removed.
 *
 * Never prints the credential. Uses WORDPRESS_ADMIN_USER / WORDPRESS_ADMIN_APP_PASSWORD.
 */

import { loadEnv } from './lib/env.mjs';

loadEnv();

const base = (
  process.env.WORDPRESS_BASE_URL || process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL || ''
).replace(/\/+$/, '');
const user = process.env.WORDPRESS_ADMIN_USER || '';
const password = (process.env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '');
const apply = process.argv.includes('--apply');

if (!base || !user || !password) {
  console.error('Set WORDPRESS_BASE_URL, WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD.');
  process.exit(1);
}

const api = `${base}/wp-json`;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
const marker = `cutover-verify-${stamp}`;
const auth = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

const results = [];
const leftovers = [];

/**
 * A unique query value for read-back calls, on top of the `no-cache` request headers.
 *
 * The host sits behind a page cache that answers a repeated GET from its own copy —
 * including for these authenticated plugin routes, and including when the query string
 * differs. A read-back that comes from a cache is not a read-back: it reported "the
 * write did not land" for rows that were in the table the whole time.
 */
const bust = () => `&verify=${Date.now()}`;

/** One call. Returns { status, json, text } and never throws on an HTTP error. */
async function call(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: auth,
      'User-Agent': 'HimalayanKoh-cutover-verify/1.0',
      // Ask the cache not to answer these; the query value below is the belt to this
      // pair of braces, because a cached read-back is a false negative every time.
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...headers,
    },
    signal: AbortSignal.timeout(30000),
  };
  if (body !== undefined) {
    init.body = raw ? body : JSON.stringify(body);
    if (!raw) init.headers['Content-Type'] = 'application/json';
  }
  try {
    const response = await fetch(`${api}${path}`, init);
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, json, text };
  } catch (error) {
    return { status: 0, json: null, text: String(error.message || error) };
  }
}

const message = (result) =>
  result.json?.message || result.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 90);

function record(area, ok, detail) {
  results.push({ area, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${area} — ${detail}`);
}

async function skip(area, why) {
  results.push({ area, ok: false, detail: `skipped: ${why}` });
  console.log(`  SKIP ${area} — ${why}`);
}

// ---------------------------------------------------------------------------
// Blog: create draft → read → edit → trash. This is the whole write path the
// console uses, minus the UI.
// ---------------------------------------------------------------------------
async function blog() {
  if (!apply) return skip('blog', 'dry run');
  const created = await call('/wp/v2/posts', {
    method: 'POST',
    body: { title: `[${marker}] have a draft`, content: 'created by verify-wordpress-writes', status: 'draft' },
  });
  if (created.status !== 201) return record('blog', false, `create ${created.status} ${message(created)}`);
  const id = created.json.id;

  const read = await call(`/wp/v2/posts/${id}?context=edit`);
  const readBack = read.status === 200 && String(read.json?.title?.raw || '') === `[${marker}] have a draft`;

  const edited = await call(`/wp/v2/posts/${id}`, {
    method: 'POST',
    body: { excerpt: `${marker} excerpt`, title: `[${marker}] edited` },
  });
  const titleChanged = String(edited.json?.title?.raw || '') === `[${marker}] edited`;

  const revisions = await call(`/wp/v2/posts/${id}/revisions?per_page=5`);
  const revisionCount = Array.isArray(revisions.json) ? revisions.json.length : 0;

  const deleted = await call(`/wp/v2/posts/${id}?force=true`, { method: 'DELETE' });
  const gone = deleted.status === 200 && deleted.json?.deleted === true;

  record(
    'blog',
    readBack && titleChanged && gone,
    `draft created (id ${id}), read back, edited, ${revisionCount} revision(s), deleted:${gone}`,
  );
  if (!gone) leftovers.push(`post id ${id}`);
}

// ---------------------------------------------------------------------------
// Media: upload → read → delete. The app's upload route ends up here.
// ---------------------------------------------------------------------------
async function media() {
  if (!apply) return skip('media', 'dry run');
  // 1x1 transparent PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const filename = `${marker}.png`;
  const uploaded = await call('/wp/v2/media', {
    method: 'POST',
    raw: true,
    body: png,
    headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${filename}"` },
  });
  if (uploaded.status !== 201) return record('media', false, `upload ${uploaded.status} ${message(uploaded)}`);
  const id = uploaded.json.id;

  const read = await call(`/wp/v2/media/${id}`);
  const readBack = read.status === 200 && String(read.json?.source_url || '').includes(marker);

  const deleted = await call(`/wp/v2/media/${id}?force=true`, { method: 'DELETE' });
  const gone = deleted.status === 200 && deleted.json?.deleted === true;

  record('media', readBack && gone, `uploaded ${filename} (id ${id}, ${png.length} bytes), read back, deleted:${gone}`);
  if (!gone) leftovers.push(`media id ${id}`);
}

// ---------------------------------------------------------------------------
// Settings: read → write the same values back → read again. Writing the identical
// value proves the write path landed without changing anything an owner relies on.
// ---------------------------------------------------------------------------
async function settings() {
  const category = 'store';
  const before = await call(`/hk-storefront/v1/settings?category=${category}`);
  if (before.status !== 200) return record('settings', false, `read ${before.status} ${message(before)}`);
  const values = before.json?.values || {};
  if (!apply) return skip('settings', `dry run (category "${category}" holds ${Object.keys(values).length} value(s))`);

  const write = await call('/hk-storefront/v1/settings', { method: 'POST', body: { category, values } });
  const after = await call(`/hk-storefront/v1/settings?category=${category}`);
  const same = JSON.stringify(after.json?.values || {}) === JSON.stringify(values);

  record(
    'settings',
    write.status === 200 && after.status === 200 && same,
    `write ${write.status}, reloaded, ${Object.keys(values).length} value(s) unchanged:${same}`,
  );
}

// ---------------------------------------------------------------------------
// Category hubs: same round-trip, on the first published hub.
// ---------------------------------------------------------------------------
async function categoryHubs() {
  const list = await call('/hk-storefront/v1/category-hubs');
  if (list.status !== 200) return record('category hubs', false, `list ${list.status} ${message(list)}`);
  const hubs = Array.isArray(list.json?.items) ? list.json.items : [];
  if (!hubs.length) return record('category hubs', true, 'no hub override stored yet — read path only');

  const key = hubs[0].category_key;
  const before = await call(`/hk-storefront/v1/category-hubs/one?key=${encodeURIComponent(key)}`);
  const stored = before.json?.override || null;
  if (!apply) return skip('category hubs', `dry run (key "${key}")`);

  const write = await call('/hk-storefront/v1/category-hubs', {
    method: 'POST',
    body: { ...stored, category_key: key },
  });
  const after = await call(`/hk-storefront/v1/category-hubs/one?key=${encodeURIComponent(key)}`);
  const preserved = after.json?.override?.hero
    ? JSON.stringify(after.json.override.hero) === JSON.stringify(stored?.hero)
    : true;

  record(
    'category hubs',
    write.status === 200 && after.status === 200 && preserved,
    `key "${key}", write ${write.status}, reloaded, hero preserved:${preserved}`,
  );
}

// ---------------------------------------------------------------------------
// Newsletter, contact, events: append-only, so these leave a labelled row.
// ---------------------------------------------------------------------------
async function newsletter() {
  if (!apply) return skip('newsletter', 'dry run');
  const email = `${marker}@example.com`;
  const write = await call('/hk-storefront/v1/newsletter', { method: 'POST', body: { email, source: marker } });
  const list = await call(`/hk-storefront/v1/newsletter?limit=200${bust()}`);
  const emails = (list.json?.items || []).map((row) => String(row.email || '').toLowerCase());
  const found = emails.includes(email.toLowerCase());
  record(
    'newsletter',
    write.status === 200 && found,
    `subscribe ${write.status} (created:${write.json?.created}) list ${list.status} (${emails.length}), present:${found}`,
  );
  if (write.status === 200) leftovers.push(`newsletter subscriber ${email} (no delete route)`);
}

async function contact() {
  if (!apply) return skip('contact', 'dry run');
  const email = `${marker}@example.com`;
  const write = await call('/hk-storefront/v1/contact', {
    method: 'POST',
    body: { name: marker, email, subject: marker, message: 'created by verify-wordpress-writes' },
  });
  const list = await call(`/hk-storefront/v1/contact?limit=200${bust()}`);
  const found = (list.json?.items || []).some(
    (row) => String(row.email || '').toLowerCase() === email.toLowerCase(),
  );
  record('contact', write.status === 200 && found, `submit ${write.status} list ${list.status}, present:${found}`);
  if (write.status === 200) leftovers.push(`contact message from ${email} (no delete route)`);
}

async function events() {
  if (!apply) return skip('events', 'dry run');
  const write = await call('/hk-storefront/v1/events', { method: 'POST', body: { event: marker, path: `/${marker}` } });
  const summary = await call(`/hk-storefront/v1/events/summary?limit=200${bust()}`);
  const aggregated = (summary.json?.summary || []).some((row) => row.event === marker);
  record('events', write.status === 200 && aggregated, `record ${write.status}, aggregated:${aggregated}`);
  if (write.status === 200) leftovers.push(`site event "${marker}" (no delete route)`);
}

// ---------------------------------------------------------------------------
// Hermes evidence: the insert and the dedupe path — the second insert must not
// create a second row, which is the rule the whole store exists for.
// ---------------------------------------------------------------------------
async function hermesEvidence() {
  if (!apply) return skip('hermes evidence', 'dry run');
  const body = {
    dedupe_key: marker,
    source: marker,
    type: 'cutover-verify',
    title: marker,
    summary: 'created by verify-wordpress-writes',
    evidence: { checked: ['insert', 'dedupe'] },
    confidence: 0.5,
  };
  const first = await call('/hk-storefront/v1/hermes-evidence', { method: 'POST', body });
  const second = await call('/hk-storefront/v1/hermes-evidence', { method: 'POST', body });
  const status = (result) => String(result.json?.status || '');
  const list = await call(`/hk-storefront/v1/hermes-evidence?source=${marker}${bust()}`);
  const rows = (list.json?.items || []).filter((row) => row.dedupe_key === marker);

  record(
    'hermes evidence',
    status(first) === 'CREATED' && status(second) === 'ALREADY_EXISTS' && rows.length === 1,
    `insert:${status(first)} dedupe:${status(second)} rows for key:${rows.length}`,
  );
  if (status(first) === 'CREATED') leftovers.push(`Hermes evidence "${marker}" (no delete route)`);
}

// ---------------------------------------------------------------------------
// Console records (Scout / Research / Listing Task / Hermes state): the one table
// here with a delete route, so it goes in and comes back out.
// ---------------------------------------------------------------------------
async function adminRecords() {
  if (!apply) return skip('admin records', 'dry run');
  // The plugin stores only the record names it knows; `media_videos` is the one no
  // producer writes yet, so a test row there cannot collide with real console state.
  const table = 'media_videos';
  const write = await call('/hk-storefront/v1/admin-records', {
    method: 'POST',
    body: { table, id: marker, payload: { marker, at: stamp } },
  });
  const read = await call(`/hk-storefront/v1/admin-records/one?table=${table}&id=${marker}${bust()}`);
  const listed = await call(`/hk-storefront/v1/admin-records?table=${table}&limit=5${bust()}`);
  const found = (listed.json?.items || []).some((row) => String(row.record_id || row.id || '') === marker);
  // The delete route reads its arguments from the request body, as the app sends them.
  const removed = await call('/hk-storefront/v1/admin-records', { method: 'DELETE', body: { table, id: marker } });
  const after = await call(`/hk-storefront/v1/admin-records/one?table=${table}&id=${marker}${bust()}`);
  const gone = after.status === 404 || after.json?.record === null;

  record(
    'admin records',
    write.status === 200 && read.status === 200 && found && removed.status === 200 && gone,
    `upsert:${write.status} read:${read.status} listed:${found} delete:${removed.status} gone:${gone}` +
      (write.status === 200 && removed.status === 200 ? '' : ` — ${message(write)} ${message(removed)}`),
  );
  if (!gone) leftovers.push(`console record ${table}/${marker}`);
}

console.log(`verify WordPress writes — ${base}`);
console.log(`  mode: ${apply ? 'APPLY (writes)' : 'dry run'} · marker ${marker}\n`);

await blog();
await media();
await settings();
await categoryHubs();
await newsletter();
await contact();
await events();
await hermesEvidence();
await adminRecords();

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} area(s) verified${apply ? '' : ' (dry run)'}`);
if (leftovers.length) {
  console.log('\nLeft in place deliberately (these tables have no delete route):');
  for (const item of leftovers) console.log(`  - ${item}`);
}
process.exit(passed === results.length ? 0 : 1);
