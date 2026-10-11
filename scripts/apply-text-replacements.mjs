#!/usr/bin/env node
/**
 * Apply exact-string replacements to named WordPress records.
 *
 *   node scripts/apply-text-replacements.mjs --file=docs/production/content-corrections/legacy-theme-pages.json
 *   node scripts/apply-text-replacements.mjs --file=... --apply
 *
 * ## Why not rewrite the page
 *
 * These pages are legacy WPBakery layouts: thousands of characters of shortcodes
 * around the sentences that need to change. Rewriting one by hand would risk the
 * layout, so only the offending sentences are substituted — and every substitution
 * must match **exactly once**. An `old` string that matches nothing means the page
 * is not what this file was written against (somebody edited it, or the correction
 * was already applied), and an `old` string that matches twice cannot be aimed.
 * Either way the batch is refused before a single write, so a partly-applied
 * correction is not possible.
 *
 * ## What it writes, and what it refuses to touch
 *
 * Content only. Slug, status, title, date and author are read before and after and
 * must be identical. WordPress appends a newline to a content field, so the
 * comparison trims; everything else is compared exactly.
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const argOf = (name) => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const file = argOf('file');
if (!file) throw new Error('Required: --file=<corrections json>.');
const plan = JSON.parse(fs.readFileSync(file, 'utf8'));

const envFile = argOf('env') || '.env.local';
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const base = (argOf('base') || env.WORDPRESS_BASE_URL || env.WOOCOMMERCE_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const auth =
  'Basic ' +
  Buffer.from(`${env.WORDPRESS_ADMIN_USER}:${(env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '')}`).toString('base64');

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

/** Every group in the file, checked before anything is written. */
const stages = [];
for (const [type, group] of Object.entries(plan)) {
  if (type.startsWith('_')) continue;
  for (const [id, spec] of Object.entries(group)) {
    const res = await fetch(`${base}/wp-json/wp/v2/${type}/${id}?context=edit`, {
      headers: { Authorization: auth, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`${type} ${id}: HTTP ${res.status}`);
    const record = await res.json();

    if (spec.slug && record.slug !== spec.slug) {
      throw new Error(`${type} ${id} has slug "${record.slug}", expected "${spec.slug}". Refusing to write.`);
    }

    const original = String(record.content?.raw ?? '');
    let next = original;
    const applied = [];
    for (const [oldText, newText] of spec.replacements) {
      const count = countOccurrences(next, oldText);
      if (count !== 1) {
        throw new Error(
          `${type} ${id} (${record.slug}): the string to replace matches ${count} times, expected exactly 1.\n` +
            `  "olds": ${JSON.stringify(oldText.slice(0, 120))}\n` +
            '  Refusing the whole batch: nothing has been written.'
        );
      }
      next = next.replace(oldText, newText);
      applied.push({ from: oldText.slice(0, 90), to: newText.slice(0, 90) });
    }

    // The fields a content change must not disturb, captured for comparison after
    // the write.
    const fields = {
      status: record.status,
      slug: record.slug,
      date: record.date,
      author: record.author,
      type: record.type,
      parent: record.parent,
    };
    stages.push({ type, id, slug: record.slug, status: record.status, title: record.title?.raw ?? '', original, next, applied, fields });
  }
}

console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry run', origin: base, records: stages.map((s) => ({ type: s.type, id: s.id, slug: s.slug, status: s.status, bytes: { from: s.original.length, to: s.next.length }, replacements: s.applied.length })) }, null, 2));

if (!APPLY) {
  console.log('\nDry run only. Every replacement matched exactly once. Re-run with --apply to write.');
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const stage of stages) {
    const record = {
      at: new Date().toISOString(),
      origin: base,
      type: stage.type,
      id: stage.id,
      slug: stage.slug,
      status: stage.status,
      title: stage.title,
      content: stage.original,
    };
    const readable = path.join(process.cwd(), 'backups', `${new Date().toISOString().slice(0, 10)}-content-backup`, `${stage.type}-${stage.id}.json`);
    fs.mkdirSync(path.dirname(readable), { recursive: true });
    fs.writeFileSync(readable, JSON.stringify(record, null, 2));
    fs.writeFileSync(`.git/${stage.type}-${stage.id}-${stamp}.json`, JSON.stringify(record, null, 2));

    const res = await fetch(`${base}/wp-json/wp/v2/${stage.type}/${stage.id}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: stage.next }),
    });
    if (!res.ok) throw new Error(`${stage.type} ${stage.id}: write failed HTTP ${res.status}`);
    const after = await res.json();

    const drifted = Object.keys(stage.fields).filter(
      (field) => String(after[field] ?? '') !== String(stage.fields[field] ?? '')
    );
    const matches = String(after.content?.raw ?? '').trim() === stage.next.trim();

    console.log(
      JSON.stringify(
        {
          wrote: `${stage.type} ${stage.id}`,
          backup: readable,
          contentMatches: matches,
          fieldsChanged: drifted,
        },
        null,
        2
      )
    );
    if (!matches) throw new Error(`${stage.type} ${stage.id}: the stored content does not match what was sent. Inspect ${readable}.`);
    if (drifted.length) throw new Error(`${stage.type} ${stage.id}: unexpected fields changed (${drifted.join(', ')}). Inspect ${readable}.`);
  }
}
