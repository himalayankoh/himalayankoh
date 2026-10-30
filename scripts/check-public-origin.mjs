#!/usr/bin/env node
/**
 * Fail the build if a loopback origin is baked into the shipped output.
 *
 * This is the mechanical half of the rule in `src/lib/site/origin.ts`. That
 * module refuses a loopback value at resolution time; this script checks the
 * artifacts afterwards, because the bug it exists to prevent was "the value that
 * got inlined was not the value anyone configured", and only a scan of what was
 * actually emitted can catch that.
 *
 *   node scripts/check-public-origin.mjs [artifact-dir]
 *
 * Run after a build. `artifact-dir` is the directory the build emitted and
 * defaults to `dist/` (the Cloudflare/vinext artifact checked by `build:vinext`
 * and `build:deploy`); the plain `npm run build` passes `.next`, because that is
 * what `next build` emits and the rule — no loopback origin in a shipped
 * document — is about the documents this build will serve. Exits non-zero on a
 * match, so a deploy cannot proceed from a build that would publish
 * `http://localhost:...` in a canonical URL, a sitemap entry or an email link.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_DIR = process.argv[2] ? join(ROOT, process.argv[2]) : join(ROOT, 'dist');

/**
 * Document extensions only — the artifacts a visitor or crawler actually receives.
 *
 * Bundled JavaScript is deliberately not scanned. `localhost` appears in shipped
 * code for legitimate reasons that cannot be removed: the development default in
 * `src/lib/site/origin.ts`, and third-party dev fallbacks. Flagging those would
 * make this check fail forever and teach everyone to ignore it. A loopback URL in
 * a *document*, by contrast, has no innocent explanation — that is a canonical
 * tag, a sitemap entry or a JSON-LD URL pointing at somebody's laptop.
 *
 * This still catches the bug that motivated the check: the inlined origin reached
 * the prerendered HTML and RSC payloads as canonicals and OG URLs before it
 * reached the sitemap at all.
 */
const DOCUMENT_EXTENSIONS = new Set(['.html', '.htm', '.rsc', '.xml', '.txt', '.json']);

/**
 * This repository's own scan report, written into the artifact directory by
 * `check-client-supabase.mjs`. It records the base URL the scan was pointed at
 * (a loopback URL during local verification by definition) and is not part of
 * the build's output — nothing serves or deploys it.
 */
const SCANNER_REPORTS = new Set(['client-supabase-report.json']);

/**
 * Files that legitimately hold a loopback URL:
 *
 * - `dist/server/.dev.vars` is a copy of the local dev env file that the
 *   Cloudflare plugin stages next to its generated config. It is never uploaded
 *   (the Worker's assets come from `dist/client`) and it is not served, so a
 *   localhost value there is expected — but it is also a secrets-bearing file
 *   sitting in a build directory, which this script reports separately.
 */
const EXPECTED_LOOPBACK_FILES = new Set(['server/.dev.vars']);

const LOOPBACK = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/gi;

async function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(full)));
    } else {
      found.push(full);
    }
  }
  return found;
}

const files = await walk(ARTIFACT_DIR);
if (files.length === 0) {
  process.stderr.write(
    `No build output found in ${relative(ROOT, ARTIFACT_DIR)}/. Run the build first — ` +
      'this check inspects what the build emitted.\n',
  );
  process.exit(1);
}

const offenders = [];
const expected = [];

for (const file of files) {
  const ext = file.slice(file.lastIndexOf('.'));
  if (!DOCUMENT_EXTENSIONS.has(ext)) continue;
  if (SCANNER_REPORTS.has(file.slice(file.lastIndexOf('\\') + 1))) continue;

  const info = await stat(file);
  if (info.size > 12 * 1024 * 1024) continue;

  const body = await readFile(file, 'utf8');
  const matches = body.match(LOOPBACK);
  if (!matches) continue;

  const rel = relative(ARTIFACT_DIR, file).split('\\').join('/');
  if (EXPECTED_LOOPBACK_FILES.has(rel)) {
    expected.push(rel);
    continue;
  }
  const unique = [...new Set(matches)].slice(0, 4);
  offenders.push({ rel, unique });
}

for (const rel of expected) {
  process.stdout.write(
    `note: ${rel} carries a dev-only value and is never uploaded or served; ` +
      `it is a secrets-bearing file in the build directory, so keep dist/ out of version control.\n`,
  );
}

if (offenders.length > 0) {
  process.stderr.write(
    `\nLoopback origin found in ${offenders.length} built file(s). A deployed build must never\n` +
      `publish localhost URLs in canonicals, sitemap entries or email links.\n\n`,
  );
  for (const { rel, unique } of offenders.slice(0, 25)) {
    process.stderr.write(`  ${rel}\n`);
    for (const hit of unique) process.stderr.write(`      ${hit}\n`);
  }
  if (offenders.length > 25) {
    process.stderr.write(`  ...and ${offenders.length - 25} more\n`);
  }
  process.stderr.write(
    `\nFix: set NEXT_PUBLIC_SITE_URL to the deployment's real origin before building\n` +
      `(staging: https://preview.himalayankoh.com, production: https://himalayankoh.com).\n` +
      `See src/lib/site/origin.ts.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `No loopback origin in ${files.length} built file(s) under ${relative(ROOT, ARTIFACT_DIR)}/. ` +
    'Public origin is safe to deploy.\n',
);
