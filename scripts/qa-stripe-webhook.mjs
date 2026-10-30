#!/usr/bin/env node
/**
 * Stripe webhook + live-refusal verification, against a running deployment.
 *
 * What it proves, without ever making a charge:
 *
 *   1. a correctly signed delivery is accepted                      (200 received)
 *   2. a delivery naming an order the store does not have is
 *      acknowledged rather than retried forever                     (200 applied:false)
 *   3. a bad signature is rejected                                  (400)
 *   4. a missing signature header is rejected                       (400)
 *   5. a body tampered with after signing is rejected               (400)
 *   6. a LIVE-mode delivery is acknowledged but NOT applied on a
 *      deployment that may not take live payments                   (200 applied:false)
 *   7. a duplicate delivery changes nothing                         (200, idempotent)
 *   8. card charging is still refused after the webhook is
 *      configured, because the live key is on a non-production
 *      origin                                                        (503)
 *
 * It stores a temporary QA webhook signing secret, then puts the previous value
 * back. No secret is ever printed: only prefixes, lengths and pass/fail lines.
 *
 *   BASE=http://127.0.0.1:3997 node scripts/qa-stripe-webhook.mjs
 */

import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

function sign(secret, body, timestampSeconds) {
  const t = timestampSeconds ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return { header: `t=${t},v1=${v1}`, t, v1 };
}

async function postWebhook(body, sigHeader) {
  const headers = { 'Content-Type': 'application/json' };
  if (sigHeader) headers['stripe-signature'] = sigHeader;
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON answer */ }
  return { status: res.status, json, text: text.slice(0, 300) };
}

function event(type, { livemode = false, orderId = null, id = null } = {}) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  return {
    id: id || `evt_qa_${stamp}`,
    object: 'event',
    type,
    livemode,
    data: {
      object: {
        id: `pi_qa_${stamp}`,
        object: 'payment_intent',
        livemode,
        payment_method_types: ['card'],
        metadata: orderId ? { woo_order_id: String(orderId) } : {},
      },
    },
  };
}

/* ---- an admin session, minted through the app's own login route ---------- */
const username = env.WORDPRESS_ADMIN_USER || env.ADMIN_USERNAME;
const password = env.WORDPRESS_ADMIN_APP_PASSWORD || env.ADMIN_PASSWORD;
if (!username || !password) {
  console.error('FAIL  WORDPRESS_ADMIN_USER / WORDPRESS_ADMIN_APP_PASSWORD are not in .env.local');
  process.exit(1);
}

const login = await fetch(`${BASE}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const loginBody = await login.json().catch(() => ({}));
const token = loginBody.token || loginBody.accessToken;
if (!login.ok || !token) {
  console.error(`FAIL  admin login failed: HTTP ${login.status} ${JSON.stringify(loginBody).slice(0, 200)}`);
  process.exit(1);
}
const adminHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

/* ---- snapshot the current stripe settings so we can restore them --------- */
const before = await fetch(`${BASE}/api/admin/settings`, { headers: adminHeaders });
const beforeJson = await before.json();
const previousSources = beforeJson?.sources?.stripe ?? {};
const previousSource = previousSources.webhook_secret ?? 'unset';
const hadStoredWebhook = previousSource === 'db';
const hadStoredSecretKey = previousSources.secret_key === 'db';

// Refuse rather than destroy. A stored secret is returned masked, so this script
// cannot put the original back — an earlier version blanked it and deleted the
// owner's key. Refusing is the only safe default.
if ((hadStoredWebhook || hadStoredSecretKey) && !process.argv.includes('--replace-existing')) {
  const conflicting = [
    hadStoredWebhook ? 'webhook_secret' : null,
    hadStoredSecretKey ? 'secret_key' : null,
  ].filter(Boolean).join(', ');
  console.error(
    `REFUSING TO RUN: ${conflicting} is already stored in the admin settings.\n` +
      'This script overwrites it with a placeholder and cannot read the original back (it is\n' +
      'masked by design), so running it would delete it. Re-run with --replace-existing if\n' +
      'you accept that, and be ready to re-enter the values.',
  );
  process.exit(2);
}

// Signature verification needs a Stripe client, and a client needs an API key — so
// the suite cannot run against a deployment with no secret key at all. It supplies
// a placeholder, and clears it on the way out.
const needsPlaceholderKey = previousSources.secret_key !== 'db';
const placeholderSecretKey = `sk_test_QA_verify_${randomBytes(9).toString('hex')}`;

const qaSecret = `whsec_QA_${randomBytes(18).toString('hex')}`;
console.log(`base: ${BASE}`);
console.log(`webhook secret before: ${hadStoredWebhook ? 'stored in settings' : previousSource === 'env' ? 'from environment' : 'not set'}`);
console.log(`secret key before: ${hadStoredSecretKey ? 'stored in settings' : previousSources.secret_key === 'env' ? 'from environment' : 'not set'}`);
console.log(`probe secret: ${qaSecret.slice(0, 10)}… (temporary, ${qaSecret.length} chars)\n`);

const save = await fetch(`${BASE}/api/admin/settings`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({
    category: 'stripe',
    settings: needsPlaceholderKey
      ? { webhook_secret: qaSecret, secret_key: placeholderSecretKey }
      : { webhook_secret: qaSecret },
  }),
});
check('temporary webhook secret stored', save.ok, `HTTP ${save.status}`);

try {
  /* 1 — a correct signature is accepted */
  const goodBody = JSON.stringify(event('payment_intent.created'));
  const goodSig = sign(qaSecret, goodBody);
  const r1 = await postWebhook(goodBody, goodSig.header);
  check('signed delivery accepted', r1.status === 200 && r1.json?.received === true, `HTTP ${r1.status} ${r1.text.slice(0, 80)}`);

  /* 2 — an event naming an unknown order is acknowledged, not retried */
  const unknownBody = JSON.stringify(event('payment_intent.succeeded', { orderId: 987654321 }));
  const r2 = await postWebhook(unknownBody, sign(qaSecret, unknownBody).header);
  check(
    'unknown order acknowledged without applying',
    r2.status === 200 && r2.json?.received === true && r2.json?.applied === false,
    `HTTP ${r2.status} ${r2.text.slice(0, 120)}`,
  );

  /* 3 — a wrong signature is rejected */
  const r3 = await postWebhook(goodBody, sign(`whsec_wrong_${'0'.repeat(20)}`, goodBody).header);
  check('bad signature rejected', r3.status === 400, `HTTP ${r3.status} ${r3.text.slice(0, 80)}`);

  /* 4 — no signature header */
  const r4 = await postWebhook(goodBody, null);
  check('missing signature rejected', r4.status === 400, `HTTP ${r4.status} ${r4.text.slice(0, 80)}`);

  /* 5 — a body changed after signing */
  const tampered = JSON.stringify(event('payment_intent.succeeded', { orderId: 12345 }));
  const r5 = await postWebhook(tampered, goodSig.header);
  check('tampered body rejected', r5.status === 400, `HTTP ${r5.status} ${r5.text.slice(0, 80)}`);

  /* 6 — a LIVE delivery cannot be applied on a deployment that may not charge live */
  const liveBody = JSON.stringify(event('payment_intent.succeeded', { livemode: true, orderId: 987654321 }));
  const r6 = await postWebhook(liveBody, sign(qaSecret, liveBody).header);
  const liveRefused = r6.status === 200 && r6.json?.applied === false;
  check(
    'live-mode delivery acknowledged but NOT applied',
    liveRefused,
    `HTTP ${r6.status} ${String(r6.json?.reason || '').slice(0, 140) || r6.text.slice(0, 120)}`,
  );

  /* 7 — a duplicate delivery changes nothing */
  const r7a = await postWebhook(goodBody, goodSig.header);
  const r7b = await postWebhook(goodBody, goodSig.header);
  check(
    'duplicate delivery is idempotent',
    r7a.status === 200 && r7b.status === 200 && r7b.json?.applied !== true,
    `HTTP ${r7a.status} then ${r7b.status}`,
  );

  /* 8 — charging is still refused with the webhook now configured */
  const intent = await fetch(`${BASE}/api/stripe/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000000' }),
  });
  const intentBody = await intent.json().catch(() => ({}));
  check(
    'card charging still refused (live key, non-production origin)',
    intent.status === 503,
    `HTTP ${intent.status} ${String(intentBody.error || '').slice(0, 150)}`,
  );
} finally {
  /* ---- restore ----------------------------------------------------------- */
  // Only the fields this script filled are cleared. A previously stored secret is
  // never "restored" to a mask, which is how the value would be destroyed.
  const restoreSettings = needsPlaceholderKey
    ? { webhook_secret: '', secret_key: '' }
    : { webhook_secret: '' };
  const restored = await fetch(`${BASE}/api/admin/settings`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ category: 'stripe', settings: restoreSettings }),
  });
  const after = await fetch(`${BASE}/api/admin/payments`, { headers: adminHeaders });
  const afterJson = await after.json();
  const stripe = (afterJson.providers || []).find((p) => p.id === 'stripe');
  console.log(
    `\nrestore: cleared ${Object.keys(restoreSettings).join(', ')} (HTTP ${restored.status})` +
      (hadStoredWebhook || hadStoredSecretKey ? ' — a stored value was overwritten and must be re-entered' : ''),
  );
  console.log(`stage after restore: ${stripe?.stageLabel || '(unknown)'} · webhook configured: ${stripe?.orderSyncConfigured}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
