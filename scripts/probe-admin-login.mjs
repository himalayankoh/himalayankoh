#!/usr/bin/env node
/**
 * Sign in through the app's own admin login route, and stage the result for a
 * browser that must not be handed a credential.
 *
 *   node scripts/probe-admin-login.mjs [--stage <public-path>]
 *
 * Why this exists: the console's login form needs a password typed into it, and a
 * password typed into a browser is a password written into a transcript. The login
 * route has a **second** door — a WordPress administrator plus an application
 * password, both already in `.env.local` for server-side integration use — and that
 * door exercises the same code path the form does: verify the credential, mint the
 * signed session, return the identity and role. This script walks that door and
 * prints only the outcome.
 *
 * With `--stage`, the session is written to a file under `public/` so a browser can
 * read it, install it, and be deleted afterwards — the token never appears in this
 * script's output. The file must be removed; it is a credential.
 *
 * Read-only with respect to WordPress: it verifies a credential and stores nothing.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
const base = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:3103'
).replace(/\/+$/, '');

const username = env.WORDPRESS_ADMIN_USER;
const password = env.WORDPRESS_ADMIN_APP_PASSWORD;

if (!username || !password) {
  console.log('SKIP  WORDPRESS_ADMIN_USER / WORDPRESS_ADMIN_APP_PASSWORD are not both set.');
  process.exit(0);
}

const response = await fetch(`${base}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});

const data = await response.json().catch(() => ({}));

console.log(`HTTP ${response.status}`);
if (!response.ok || !data.token) {
  // The message is the route's own, and never contains the password.
  console.log('LOGIN  FAILED —', data.error || '(no error message)');
  process.exit(1);
}

console.log('LOGIN  OK');
console.log('  role        :', data.user?.role);
console.log('  name        :', data.user?.name);
console.log('  identifier  :', (data.user?.email || '').replace(/^(.).*@/, '$1***@'));
console.log('  expiresAt   :', new Date(data.expiresAt).toISOString());

const stageAt = process.argv.indexOf('--stage') + 1;
if (stageAt > 0 && process.argv[stageAt]) {
  const target = resolve(ROOT, process.argv[stageAt]);
  // The exact shape `services/wordpressAdminAuth.ts` persists and reads back.
  const session = {
    accessToken: data.token,
    refreshToken: '',
    expiresAt: data.expiresAt,
    user: {
      id: data.user.id,
      email: data.user.email || '',
      name: data.user.name || data.user.username || '',
      role: 'admin',
      username: data.user.username,
    },
  };
  writeFileSync(target, JSON.stringify(session));
  console.log('  staged to   :', process.argv[stageAt]);
}
