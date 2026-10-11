#!/usr/bin/env node
/**
 * Apply one reviewed correction file to one WordPress post.
 *
 *   node scripts/apply-post-correction.mjs --id=2268 --file=docs/production/content-corrections/post-2268.html
 *   node scripts/apply-post-correction.mjs --id=2268 --file=... --apply
 *
 * ## The rule this script exists to enforce
 *
 * Owner-authored copy on a live store is not a test fixture. So a correction is
 * never typed straight into a POST body: it is written to a file, read before it
 * is applied, and applied only to the post it names — and the record it is about
 * to replace is saved first, in two places:
 *
 *   - `backups/<date>-content-backup/post-<id>.json` — the readable copy, so a
 *     restore does not depend on WordPress revisions surviving;
 *   - `.git/post-<id>-<timestamp>.json` — private, never committed, next to the
 *     other write snapshots.
 *
 * ## What it refuses
 *
 * It refuses a post id that is not a single existing post, a file that does not
 * exist or is unchanged, and an `--id` whose current record does not match the
 * slug it was told to expect (`--expect-slug`). It writes **content and, when
 * asked, title** — never status, slug, date or author — and then re-reads the
 * record and asserts that title, slug, status and date are byte-identical except
 * for the field it was asked to change. A content correction must not silently
 * republish, unpublish or re-slug a post: each of those is a separate decision
 * with its own SEO consequence.
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const argOf = (name) => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const id = Number(argOf('id'));
const file = argOf('file');
const newTitle = argOf('title');
const expectSlug = argOf('expect-slug');
if (!Number.isInteger(id) || id <= 0) throw new Error('Required: --id=<post id>.');
if (!file) throw new Error('Required: --file=<path to the corrected content>.');

const envFile = argOf('env') || '.env.local';
if (!fs.existsSync(envFile)) throw new Error(`${envFile} not found; no credential to read.`);
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const base = (argOf('base') || env.WORDPRESS_BASE_URL || env.WOOCOMMERCE_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
if (!env.WORDPRESS_ADMIN_USER || !env.WORDPRESS_ADMIN_APP_PASSWORD) {
  throw new Error(`${envFile} is missing the WordPress admin application password pair.`);
}
const auth = 'Basic ' + Buffer.from(`${env.WORDPRESS_ADMIN_USER}:${env.WORDPRESS_ADMIN_APP_PASSWORD.replace(/\s+/g, '')}`).toString('base64');
const api = `${base}/wp-json/wp/v2/posts`;

if (!fs.existsSync(file)) throw new Error(`No correction file at ${file}.`);
const corrected = fs.readFileSync(file, 'utf8').trim();
if (!corrected) throw new Error(`${file} is empty.`);

async function request(pathname = '', init = {}) {
  const res = await fetch(`${api}${pathname}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WordPress HTTP ${res.status} for ${pathname}: ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

/** Whitespace and entity differences WordPress introduces are not content changes. */
const normalise = (html) =>
  String(html ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '\u2019')
    .replace(/\s+/g, ' ')
    .trim();

const before = await request(`/${id}?context=edit`);
if (expectSlug && before.slug !== expectSlug) {
  throw new Error(`Post ${id} has slug "${before.slug}", expected "${expectSlug}". Refusing to write to the wrong record.`);
}

const beforeBody = before.content?.raw ?? '';
console.log(
  JSON.stringify(
    {
      mode: APPLY ? 'apply' : 'dry run',
      post: id,
      title: before.title?.raw,
      status: before.status,
      slug: before.slug,
      modified: before.modified,
      bodyChars: { from: beforeBody.length, to: corrected.length },
      titleChange: newTitle ? { from: before.title?.raw, to: newTitle } : 'unchanged',
      file,
    },
    null,
    2
  )
);

// No `process.exit()` below: on Node 24 under Git Bash, exiting a top-level-await
// ESM module that way trips a libuv assertion and reports a failure for a run that
// in fact succeeded, which would break any caller using `set -e` to check the result.
// The repo learned this once already in `scripts/set-listing-status.mjs`.
if (normalise(beforeBody) === normalise(corrected) && !newTitle) {
  console.log('\nThe post already carries this text. Nothing written.');
} else if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to write this correction.');
} else {
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const snapshotRecord = {
  at: new Date().toISOString(),
  origin: base,
  id,
  slug: before.slug,
  status: before.status,
  title: before.title?.raw ?? '',
  content: beforeBody,
  excerpt: before.excerpt?.raw ?? '',
  modified: before.modified,
  meta: before.meta,
};
const readable = path.join(process.cwd(), 'backups', `${new Date().toISOString().slice(0, 10)}-content-backup`, `post-${id}.json`);
fs.mkdirSync(path.dirname(readable), { recursive: true });
fs.writeFileSync(readable, JSON.stringify(snapshotRecord, null, 2));
fs.writeFileSync(`.git/post-${id}-${stamp}.json`, JSON.stringify(snapshotRecord, null, 2));

const payload = { content: corrected };
if (newTitle) payload.title = newTitle;

await request(`/${id}`, { method: 'POST', body: JSON.stringify(payload) });

const after = await request(`/${id}?context=edit`);
const drifted = ['status', 'slug', 'date', 'author', 'type', 'parent'].filter(
  (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
);

console.log(
  JSON.stringify(
    {
      wrote: { id: after.id, fields: newTitle ? ['title', 'content'] : ['content'] },
      backups: { readable, private: `.git/post-${id}-${stamp}.json` },
      afterChars: (after.content?.raw ?? '').length,
      unrequestedFieldsChanged: drifted,
      contentMatches: normalise(after.content?.raw) === normalise(corrected),
    },
    null,
    2
  )
);

if (drifted.length) throw new Error(`Unrequested fields changed: ${drifted.join(', ')}. Restore from ${readable}.`);
if (normalise(after.content?.raw) !== normalise(corrected)) {
  throw new Error(`The stored content does not match ${file} (WordPress altered it). Inspect ${readable}.`);
}
if (newTitle && after.title?.raw !== newTitle) throw new Error(`Title is "${after.title?.raw}" after the write.`);
}
