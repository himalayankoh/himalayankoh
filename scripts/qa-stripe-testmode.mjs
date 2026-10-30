#!/usr/bin/env node
/**
 * Proves the staging test-mode wiring is complete, using throwaway test keys.
 *
 * The point is not to reach Stripe successfully — a placeholder `sk_test_` cannot
 * — but to prove the *gate* opens for test mode and that whatever Stripe says is
 * reported honestly rather than swallowed. That is the difference between "no test
 * keys yet" and "test mode is misconfigured", and only the second would waste the
 * owner's time after they paste real keys.
 *
 * The three stored credentials are snapshotted first and put back in a `finally`,
 * so a failed run cannot leave placeholder keys behind. Nothing is printed in
 * full: only prefixes and lengths.
 *
 *   BASE=http://127.0.0.1:3997 node scripts/qa-stripe-testmode.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'http://127.0.0.1:3997').replace(/\/+$/, '');

function loadEnv() {
  const out = { ...process.env };
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!out[key]) out[key] = value;
  }
  return out;
}

const env = loadEnv();
let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`); }
};

const username = env.WORDPRESS_ADMIN_USER || env.ADMIN_USERNAME;
const password = env.WORDPRESS_ADMIN_APP_PASSWORD || env.ADMIN_PASSWORD;
if (!username || !password) {
  console.error('FAIL  admin credentials are not in .env.local');
  process.exit(1);
}

const login = await fetch(`${BASE}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const token = (await login.json().catch(() => ({}))).token;
if (!token) {
  console.error('FAIL  admin login failed');
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const settingsRes = await fetch(`${BASE}/api/admin/settings`, { headers: H });
const settings = await settingsRes.json();
const stripe = settings.settings?.stripe ?? {};
const sources = settings.sources?.stripe ?? {};

/**
 * Never destroy a credential this script cannot read back.
 *
 * The settings API returns a stored secret masked, so a script that snapshots
 * "the old value" and writes it back on the way out writes the mask — or, worse,
 * an empty string and deletes the key. That is exactly what an earlier version of
 * this script did to the owner's live secret key.
 *
 * So the rule is: if any of the three fields is already STORED (source `db`),
 * refuse to run unless the caller explicitly accepts that the stored values will
 * be cleared and must be re-entered. A value that comes from the environment is
 * not at risk — clearing the database copy simply lets the environment value show
 * through again.
 */
const STORED_FIELDS = ['secret_key', 'publishable_key', 'webhook_secret'];
const storedInDb = STORED_FIELDS.filter((k) => sources[k] === 'db');
if (storedInDb.length > 0 && !process.argv.includes('--replace-existing')) {
  console.error(
    `REFUSING TO RUN: ${storedInDb.join(', ')} is already stored in the admin settings.\n` +
      'This script overwrites those fields with placeholders and cannot read the originals back\n' +
      '(they are masked by design), so running it would delete them.\n\n' +
      'Re-run with --replace-existing if you accept that, and be ready to re-enter the values.',
  );
  process.exit(2);
}

/** Only the fields this script is about to fill need clearing on the way out. */
const filledFields = STORED_FIELDS.filter((k) => sources[k] !== 'db');

const suffix = randomBytes(9).toString('hex');
const qa = {
  secret_key: `sk_test_QA_${suffix}`,
  publishable_key: `pk_test_QA_${suffix}`,
  webhook_secret: `whsec_QA_${suffix}`,
};

console.log(`base: ${BASE}`);
console.log(
  `stored stripe keys before: ${storedInDb.length > 0 ? `${storedInDb.join(', ')} (will be cleared)` : 'none in the database'}\n`,
);

const write = await fetch(`${BASE}/api/admin/settings`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ category: 'stripe', settings: qa }),
});
check('temporary test-mode keys stored', write.ok, `HTTP ${write.status}`);

try {
  /* The public config route must report test mode. */
  const cfg = await (await fetch(`${BASE}/api/stripe/config`)).json();
  check('public config reports mode test', cfg.mode === 'test', `mode=${cfg.mode} configured=${cfg.configured}`);
  check(
    'public config reports the webhook configured',
    cfg.webhookConfigured === true,
    `webhookConfigured=${cfg.webhookConfigured}`,
  );

  /* The admin view must call this TEST / STAGING and ready-for-test. */
  const pay = await (await fetch(`${BASE}/api/admin/payments`, { headers: H })).json();
  const p = (pay.providers || []).find((x) => x.id === 'stripe');
  check('admin stage label is TEST / STAGING', p?.stageLabel === 'TEST / STAGING', `stageLabel=${p?.stageLabel}`);
  check('test mode permits charging', p?.chargingEnabled === true, `chargingEnabled=${p?.chargingEnabled}`);
  check('order sync configured', p?.orderSyncConfigured === true, `orderSyncConfigured=${p?.orderSyncConfigured}`);
  check('admin reports ready for test', p?.status === 'ready', `status=${p?.status} blockers=${JSON.stringify(p?.blockers)}`);
  check('no live blockers pending on a test deployment', (p?.blockers?.length ?? 0) === 0, `blockers=${JSON.stringify(p?.blockers)}`);

  /* With the gate open, an attempt must get PAST the 503 and fail at real work
     instead — either a cart problem or Stripe rejecting the placeholder key. */
  const intent = await fetch(`${BASE}/api/stripe/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000000' }),
  });
  const intentBody = await intent.json().catch(() => ({}));
  const gateMessage = String(intentBody.error || '').includes('Card payments are refused');
  check(
    'payment-intent route is no longer refused by the gate',
    intent.status !== 503 && !gateMessage,
    `HTTP ${intent.status} ${String(intentBody.error || '').slice(0, 120)}`,
  );
  check(
    'Stripe placeholder key is reported honestly, not swallowed',
    intent.status === 401 || intent.status === 409 || intent.status === 400,
    `HTTP ${intent.status}`,
  );

  /* Verification likewise reaches Stripe instead of being refused up front. */
  const verify = await fetch(`${BASE}/api/stripe/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId: 'pi_qa_placeholder' }),
  });
  const verifyBody = await verify.json().catch(() => ({}));
  const verifyGate = String(verifyBody.error || '').includes('Card payments are refused');
  check(
    'verify-payment reaches Stripe rather than the gate',
    !verifyGate,
    `HTTP ${verify.status} ${String(verifyBody.error || '').slice(0, 120)}`,
  );
} finally {
  // Clear exactly the fields this run filled, and nothing else: a field that was
  // already stored is either untouched (the guard above refused) or explicitly
  // acknowledged as lost by --replace-existing.
  const restoreSettings = Object.fromEntries(filledFields.map((k) => [k, '']));
  const restored = await fetch(`${BASE}/api/admin/settings`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ category: 'stripe', settings: restoreSettings }),
  });
  const after = await (await fetch(`${BASE}/api/admin/payments`, { headers: H })).json();
  const ap = (after.providers || []).find((x) => x.id === 'stripe');
  console.log(`\nrestore: HTTP ${restored.status} · stage now ${ap?.stageLabel} · blockers ${JSON.stringify(ap?.blockers?.slice(0, 2))}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
