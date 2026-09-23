#!/usr/bin/env node
/**
 * Keep server credentials out of the build output, and prove it.
 *
 *   node scripts/check-build-secrets.mjs [build-dir]
 *
 * `build-dir` defaults to `dist` (the vinext/Cloudflare artifact). `npm run build`
 * runs `next build`, which writes `.next` and does **not** touch `dist` — so it
 * passes `.next` explicitly rather than scanning a `dist/` left behind by an
 * earlier deploy build. That distinction matters in both directions: a stale `dist`
 * can fail the gate on a file the current source no longer produces, or pass it
 * while the artifact that actually ships still holds a credential.
 *
 * The problem this fixes
 * ----------------------
 * The Cloudflare Vite plugin stages the project's `.dev.vars` next to its generated
 * Worker config, so `dist/server/.dev.vars` ended up holding the WooCommerce
 * consumer key/secret and the Shippo key inside the build directory. Nothing served
 * it (the Worker's assets come from `dist/client`, and `/.dev.vars` returns 404),
 * but live credentials sitting in a build artifact are one `wrangler pages deploy
 * dist`, one zip or one artifact upload away from being published — and "it happens
 * to be excluded" is not a control.
 *
 * So: the file is removed from the artifact after every build, and then every file
 * left in `dist` is searched for the *values* of the server-side variables this
 * machine actually has. A hit fails the build.
 *
 * It runs at deploy time too, and that is not belt-and-braces. The same plugin
 * regenerates `dist/server/wrangler.json` and re-stages `.dev.vars` beside it when
 * `vinext-cloudflare deploy` runs — `start:vinext` (`wrangler dev`) needs those
 * values to read the backend locally, so they are put back after the build-time
 * check has already passed. A build-time-only guard, therefore, leaves the artifact
 * dirty again by the time it is shipped. Cleaning and verifying at both points is
 * what makes the invariant "no credentials in the build output" hold rather than
 * "held briefly".
 *
 * What it deliberately does not do
 * -------------------------------
 * It never prints, hashes or partially reveals a value. It does not flag
 * `NEXT_PUBLIC_*`: those are inlined into the browser bundle by design (the Supabase
 * anon key is public). And it compares real values rather than guessing at patterns,
 * so it cannot become a check people learn to ignore.
 */
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The artifact to scan: `node scripts/check-build-secrets.mjs [dir]`, default `dist`. */
const DIST = join(ROOT, process.argv[2] || 'dist');

/** Local env files. Gitignored, developer-owned, and the only place values exist locally. */
const ENV_FILES = ['.env.local', '.dev.vars', '.env.production.local'];

/** Files inside the build output that must never ship, whatever they contain. */
const FORBIDDEN_ARTIFACTS = ['server/.dev.vars', '.dev.vars', 'server/.env', '.env'];

/**
 * Directories that are build bookkeeping rather than build output.
 *
 * `.next/cache` is webpack's *persistent* module cache: it survives across builds
 * and still holds the source text of modules the current tree no longer contains, so
 * scanning it reports yesterday's code as today's artifact. Nothing in it is served,
 * copied or deployed — `.next/static` and `.next/server` are.
 */
const NOT_ARTIFACT_DIRS = new Set(['cache', 'trace']);

/** Values shorter than this are placeholders, not credentials. */
const MIN_SECRET_LENGTH = 20;

/** Values that are configuration rather than credentials. */
const NOT_A_SECRET =
  /^(?:https?:\/\/|true$|false$|1$|0$|woocommerce$|supabase$|production$|development$|test$|live$|shippo_test_$)/i;

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 1) continue;
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Variables whose values are public by intent, so finding one proves nothing.
 *
 * - `NEXT_PUBLIC_*` is inlined into the browser bundle on purpose.
 * - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are the legacy browser
 *   aliases for the same public Supabase configuration; the anon key is public
 *   by design and RLS protects the data.
 * - `SHIPPO_FROM_*` is the shipping-from business address, which the storefront
 *   publishes on Contact, Shipping, Privacy and the FAQ. Flagging it would make this
 *   check fail on every build for a value the shop advertises, which is the failure
 *   mode that turns a guard into noise. (It was in fact the only thing this check
 *   flagged the first time it ran.)
 */
const PUBLIC_BY_INTENT = [
  /^NEXT_PUBLIC_/,
  /^VITE_SUPABASE_URL$/,
  /^VITE_SUPABASE_ANON_KEY$/,
  /^SHIPPO_FROM_/,
  /_MODEL$/,
];

/** Server-only variables whose value must not appear in the build output. */
function collectSecrets() {
  const values = new Map(); // value -> variable name (never printed as a value)
  for (const file of ENV_FILES) {
    const env = parseEnvFile(join(ROOT, file));
    for (const [name, value] of Object.entries(env)) {
      if (PUBLIC_BY_INTENT.some((pattern) => pattern.test(name))) continue;
      if (!value || value.length < MIN_SECRET_LENGTH) continue;
      if (NOT_A_SECRET.test(value)) continue;
      values.set(value, name);
    }
  }
  return values;
}

/**
 * Whether a path inside the artifact is served to browsers.
 *
 * Two layouts, because two builders write here:
 *
 *   dist/client/**      vinext/Cloudflare — the Worker's static asset root
 *   static/**          `next build` — copied to the CDN and to every client
 *   *.html             a prerendered document, whoever wrote it
 *
 * Everything else (server bundles, SSR chunks) is still part of a deployed
 * artifact, but not a URL a visitor can fetch — which is the difference between
 * "this value is public" and "this value is one bad deploy away from being
 * public". Both fail the gate; only the report differs.
 */
function isClientServed(rel) {
  return rel.startsWith('client/') || rel.startsWith('static/') || rel.endsWith('.html');
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && NOT_ARTIFACT_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

if (!existsSync(DIST)) {
  process.stderr.write(`No build output in ${relative(ROOT, DIST) || DIST}/. Run the build first.\n`);
  process.exit(1);
}

// 1. Remove env files the toolchain copied into the artifact.
const removed = [];
for (const rel of FORBIDDEN_ARTIFACTS) {
  const path = join(DIST, rel);
  if (!existsSync(path)) continue;
  await rm(path, { force: true });
  removed.push(rel);
}

// 2. Search what is left for the values of this machine's server-side variables.
const secrets = collectSecrets();
const offenders = [];
let scanned = 0;

for (const file of await walk(DIST)) {
  const info = await stat(file);
  if (info.size > 16 * 1024 * 1024) continue;
  const body = await readFile(file).catch(() => null);
  if (!body) continue;
  scanned += 1;

  const text = body.toString('latin1');
  for (const [value, name] of secrets) {
    if (text.includes(value)) {
      offenders.push({ rel: relative(DIST, file).split('\\').join('/'), name });
    }
  }
}

if (removed.length > 0) {
  process.stdout.write(
    `Removed ${removed.length} env file(s) from the build output: ${removed.join(', ')}\n`,
  );
}
process.stdout.write(
  `Scanned ${scanned} file(s) in ${relative(ROOT, DIST) || '.'}/ against ${secrets.size} server-side variable(s).\n`,
);

if (offenders.length > 0) {
  // The two classes are reported apart because they mean different things. A value
  // in a client-served file has already been handed to anyone who loaded the page;
  // one in a server bundle is not fetched by a browser but is still shipped. Nothing
  // is printed by design — open the file and look.
  const clientServed = offenders.filter((o) => isClientServed(o.rel));
  const serverOnly = offenders.filter((o) => !isClientServed(o.rel));

  process.stderr.write(`\nA server-only value appears in ${relative(ROOT, DIST) || '.'}/.\n`);

  if (clientServed.length > 0) {
    process.stderr.write(
      `\nCLIENT-SERVED — reachable by any visitor; treat as disclosed (${clientServed.length}):\n`,
    );
    for (const { rel, name } of clientServed) {
      process.stderr.write(`  ${rel}  <- ${name}\n`);
    }
  }

  if (serverOnly.length > 0) {
    process.stderr.write(
      `\nSERVER-ONLY — not fetched by a browser, but part of the deployed artifact (${serverOnly.length}):\n`,
    );
    for (const { rel, name } of serverOnly) {
      process.stderr.write(`  ${rel}  <- ${name}\n`);
    }
  }

  process.stderr.write(
    `\nNothing is printed here by design; open the file and check it yourself.\n` +
      `Fix: the value must be read at runtime (Worker secret), never inlined. Only\n` +
      `NEXT_PUBLIC_* may be inlined, and only for genuinely public values.\n`,
  );
  process.exit(1);
}

process.stdout.write('No server-side credential value in the build output.\n');
