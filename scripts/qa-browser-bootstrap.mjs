#!/usr/bin/env node
/**
 * Temporary same-origin session bootstrap for browser QA.
 *
 * The browser pane drives the real UI, and the real UI needs a real session. Two
 * things must therefore be true:
 *
 *   - the session must be minted through the application's own login routes with the
 *     real WordPress credentials (nothing is bypassed), and
 *   - no password or token may end up in a transcript, a file in git, or this script's
 *     output.
 *
 * So the pages are written by *this* process from the server environment, into
 * `public/` (which the running server already serves), and they carry the values
 * inside themselves. The browser opens them, they write the same localStorage keys the
 * application reads, then redirect to the page under test. They are removed by
 * `--clean`, and `qa-wholesale-deep.mjs cleanup` removes them too.
 *
 * Usage:
 *   node scripts/qa-browser-bootstrap.mjs            # admin session page (+ buyers from the manifest)
 *   node scripts/qa-browser-bootstrap.mjs --clean    # remove every page this wrote
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'http://127.0.0.1:3997').replace(/\/+$/, '');
const MANIFEST = join(tmpdir(), 'hk-ws-deep-manifest.json');
const PUBLIC = join(ROOT, 'public');
const FILES = [];

function loadEnv() {
  const out = { ...process.env };
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!(out[key])) out[key] = value;
  }
  return out;
}

const env = loadEnv();

if (process.argv.includes('--clean')) {
  for (const file of ['_qa-admin.html', '_qa-buyer-alpha.html', '_qa-buyer-bravo.html']) {
    const path = join(PUBLIC, file);
    if (existsSync(path)) {
      rmSync(path);
      console.log(`removed public/${file}`);
    }
  }
  process.exit(0);
}

/** A page that writes a session key and then goes where it was asked to go. */
function page({ key, value, destination, note }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QA session bootstrap</title></head>
<body style="font-family:system-ui;padding:2rem">
<p>${note}</p>
<p>Signing in…</p>
<script>
  try {
    window.localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});
    window.location.replace(${JSON.stringify(destination)});
  } catch (error) {
    document.body.insertAdjacentHTML('beforeend', '<pre>' + String(error) + '</pre>');
  }
</script>
</body></html>
`;
}

async function signInAdmin() {
  const response = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.WORDPRESS_ADMIN_USER, password: env.WORDPRESS_ADMIN_APP_PASSWORD }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || typeof json?.token !== 'string') {
    console.error(`admin sign-in failed: HTTP ${response.status} ${json?.error || ''}`);
    process.exit(1);
  }
  return {
    key: 'luxedge_sb_session',
    value: {
      accessToken: json.token,
      refreshToken: '',
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      user: {
        id: json.user?.id ?? 0,
        email: json.user?.email ?? '',
        name: json.user?.name ?? '',
        role: json.user?.role ?? 'admin',
        username: json.user?.username ?? '',
      },
    },
    destination: '/admin/wholesale',
    note: 'Wholesale admin QA session (temporary file, removed by --clean).',
  };
}

async function signInBuyer(entry) {
  const response = await fetch(`${BASE}/api/wholesale/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: entry.email, password: entry.password }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || typeof json?.token !== 'string') {
    console.error(`buyer sign-in failed for ${entry.email}: HTTP ${response.status} ${json?.error || ''}`);
    return null;
  }
  return {
    key: 'hk_wholesale_session',
    value: {
      accessToken: json.token,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      buyer: json.buyer,
    },
    destination: '/wholesale/portal',
    note: `Wholesale buyer QA session — ${json.buyer?.company || entry.email} (temporary file, removed by --clean).`,
  };
}

const written = [];

const admin = await signInAdmin();
writeFileSync(join(PUBLIC, '_qa-admin.html'), page(admin));
written.push('_qa-admin.html');

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
for (const key of ['alpha', 'bravo']) {
  const buyer = manifest?.data?.buyers?.[key];
  if (!buyer?.password) continue;
  const session = await signInBuyer(buyer);
  if (!session) continue;
  writeFileSync(join(PUBLIC, `_qa-buyer-${key}.html`), page(session));
  written.push(`_qa-buyer-${key}.html`);
}

console.log(`Wrote ${written.length} bootstrap page(s) into public/: ${written.join(', ')}`);
console.log('Open:');
console.log(`  ${BASE}/_qa-admin.html`);
for (const key of ['alpha', 'bravo']) {
  if (written.includes(`_qa-buyer-${key}.html`)) console.log(`  ${BASE}/_qa-buyer-${key}.html`);
}
console.log('Then remove them with: node scripts/qa-browser-bootstrap.mjs --clean');
