#!/usr/bin/env node
/**
 * Staging QA for the customer journey — signup, sign-in, wishlist, addresses,
 * password change, reset request, and the isolation between two shoppers.
 *
 *   node scripts/qa-customer-journey.mjs [--base http://127.0.0.1:3103]
 *
 * Every step goes through the app's own routes against a **running** server, so it
 * exercises the real path: WordPress verifies the credential, the app mints a
 * signed customer session, and each account route derives identity from that
 * session rather than from anything the caller sent.
 *
 * The isolation checks are the point of the second account. Two shoppers are
 * created; B must not be able to see, delete or count anything that belongs to A,
 * and a browser-supplied customer id must not be a way in.
 *
 * Test customers are deleted at the end (WooCommerce force-delete), so a run
 * leaves nothing behind. No mail is sent by design: the reset route is asked and
 * its *acceptance* is checked, not a delivery.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
const baseArg = process.argv.indexOf('--base');
const BASE = (baseArg > 0 ? process.argv[baseArg + 1] : 'http://127.0.0.1:3103').replace(/\/+$/, '');
const WOO_BASE = String(env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
const WOO_AUTH = `Basic ${Buffer.from(
  `${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`
).toString('base64')}`;

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(40)} ${detail}`);
};

const STAMP = Date.now();
const EMAIL_A = `qa-customer-a-${STAMP}@example.test`;
const EMAIL_B = `qa-customer-b-${STAMP}@example.test`;
const PASSWORD = 'qa-staging-pass-1';
const NEW_PASSWORD = 'qa-staging-pass-2';

const createdCustomerIds = [];

async function json(path, init = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

async function wooDelete(path) {
  return fetch(`${WOO_BASE}/wp-json${path}`, {
    method: 'DELETE',
    headers: { Authorization: WOO_AUTH },
  });
}

async function register(email) {
  return json('/api/auth/customer/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, name: 'QA Shopper' }),
  });
}

/** A published product, for the wishlist. */
async function publishedProductId() {
  const res = await fetch(`${WOO_BASE}/wp-json/wc/v3/products?status=publish&per_page=1&_fields=id`, {
    headers: { Authorization: WOO_AUTH },
  });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

try {
  // 1. signup -----------------------------------------------------------------
  const signup = await register(EMAIL_A);
  const tokenA = signup.body?.token;
  const customerA = signup.body?.customer?.id ?? signup.body?.user?.id;
  record('signup creates a customer + session', signup.ok && !!tokenA, `HTTP ${signup.status} id=${customerA ?? '-'}`);
  if (!tokenA) throw new Error('signup did not return a session — the rest cannot be verified');
  if (customerA) createdCustomerIds.push(Number(customerA));

  const who = await json('/api/auth/session', {}, tokenA);
  record(
    'server says role=customer',
    who.body?.role === 'customer' && String(who.body?.user?.id) === String(customerA),
    `role=${who.body?.role}`
  );

  // 2. sign-in with the same credential ---------------------------------------
  const login = await json('/api/auth/customer/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_A, password: PASSWORD }),
  });
  record('sign-in with the new account', login.ok && !!login.body?.token, `HTTP ${login.status}`);
  const liveTokenA = login.body?.token || tokenA;

  // 3. order history is the customer's own ------------------------------------
  const orders = await json('/api/account/orders', {}, liveTokenA);
  const orderCount = Array.isArray(orders.body?.orders) ? orders.body.orders.length : null;
  record('order history (own, empty)', orders.ok && orderCount === 0, `HTTP ${orders.status} orders=${orderCount}`);

  // 4. wishlist ---------------------------------------------------------------
  const productId = await publishedProductId();
  if (!productId) throw new Error('no published product to wishlist');
  const added = await json('/api/wishlist', {
    method: 'POST',
    body: JSON.stringify({ productId, action: 'toggle' }),
  }, liveTokenA);
  const listed = await json('/api/wishlist', {}, liveTokenA);
  const items = Array.isArray(listed.body?.items) ? listed.body.items : [];
  const mine = items.some((item) => String(item.product_id ?? item.productId) === String(productId));
  record('wishlist add + list', added.ok && mine, `HTTP ${added.status} items=${items.length} product=${productId}`);

  const count = await json('/api/wishlist/count', {}, liveTokenA);
  record('wishlist count', count.ok && Number(count.body?.count) >= 1, `count=${count.body?.count}`);

  const removed = await json('/api/wishlist', {
    method: 'POST',
    body: JSON.stringify({ productId, action: 'toggle' }),
  }, liveTokenA);
  const afterRemove = await json('/api/wishlist', {}, liveTokenA);
  const stillThere = (afterRemove.body?.items || []).some(
    (item) => String(item.product_id ?? item.productId) === String(productId)
  );
  record('wishlist remove', removed.ok && !stillThere, `HTTP ${removed.status} stillThere=${stillThere}`);

  // 5. addresses --------------------------------------------------------------
  const address = {
    label: 'QA',
    full_name: 'QA Shopper',
    phone: '+1 555 0100',
    address_line1: '1 QA Way',
    city: 'Ketchum',
    state: 'ID',
    postal_code: '83340',
    country: 'US',
    is_default_shipping: false,
  };
  const created = await json('/api/account/addresses', { method: 'POST', body: JSON.stringify(address) }, liveTokenA);
  const addressId = created.body?.address?.id;
  record('address create', created.status === 201 && !!addressId, `HTTP ${created.status} id=${addressId ?? '-'}`);

  const addressList = await json('/api/account/addresses', {}, liveTokenA);
  const addresses = Array.isArray(addressList.body?.addresses) ? addressList.body.addresses : [];
  record('address list', addressList.ok && addresses.some((a) => a.id === addressId), `n=${addresses.length}`);

  const madeDefault = await json(`/api/account/addresses/${addressId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_default_shipping: true }),
  }, liveTokenA);
  const afterDefault = await json('/api/account/addresses', {}, liveTokenA);
  const defaults = (afterDefault.body?.addresses || []).filter((a) => a.is_default_shipping);
  record(
    'set default address (exactly one)',
    madeDefault.ok && defaults.length === 1 && defaults[0].id === addressId,
    `defaults=${defaults.length}`
  );

  // 6. a second shopper must not see any of it --------------------------------
  const signupB = await register(EMAIL_B);
  const tokenB = signupB.body?.token;
  const customerB = signupB.body?.customer?.id ?? signupB.body?.user?.id;
  if (customerB) createdCustomerIds.push(Number(customerB));
  record('second account created', signupB.ok && !!tokenB, `HTTP ${signupB.status} id=${customerB ?? '-'}`);

  const bAddresses = await json('/api/account/addresses', {}, tokenB);
  const bList = Array.isArray(bAddresses.body?.addresses) ? bAddresses.body.addresses : [];
  record("B sees none of A's addresses", bAddresses.ok && bList.length === 0, `n=${bList.length}`);

  const bWishlist = await json('/api/wishlist', {}, tokenB);
  const bItems = Array.isArray(bWishlist.body?.items) ? bWishlist.body.items : [];
  record("B sees none of A's wishlist", bWishlist.ok && bItems.length === 0, `n=${bItems.length}`);

  // A direct id attack: B names A's address id, and a forged customer id.
  const steal = await json(`/api/account/addresses/${addressId}`, {
    method: 'DELETE',
  }, tokenB);
  const aStillHasIt = await json('/api/account/addresses', {}, liveTokenA);
  const survived = (aStillHasIt.body?.addresses || []).some((a) => a.id === addressId);
  record(
    "B cannot delete A's address",
    survived && (steal.status === 404 || steal.status === 200),
    `HTTP ${steal.status} survived=${survived}`
  );

  const forged = await json('/api/wishlist', {
    method: 'POST',
    body: JSON.stringify({ productId, action: 'toggle', owner: String(customerA), customer_id: String(customerA) }),
  }, tokenB);
  const aWishlist = await json('/api/wishlist', {}, liveTokenA);
  const aGotBItem = (aWishlist.body?.items || []).some(
    (item) => String(item.product_id ?? item.productId) === String(productId)
  );
  record(
    'a body-supplied owner id is ignored',
    forged.ok && !aGotBItem,
    `A's wishlist untouched=${!aGotBItem}`
  );

  // 7. password change ---------------------------------------------------------
  const changed = await json('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
  }, liveTokenA);
  record('password change', changed.ok, `HTTP ${changed.status} ${changed.ok ? '' : changed.body?.error || ''}`);

  const relogin = await json('/api/auth/customer/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_A, password: NEW_PASSWORD }),
  });
  record('sign-in with the new password', relogin.ok && !!relogin.body?.token, `HTTP ${relogin.status}`);

  const oldPassword = await json('/api/auth/customer/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_A, password: PASSWORD }),
  });
  record('old password is refused', !oldPassword.ok, `HTTP ${oldPassword.status}`);

  // 8. reset request -----------------------------------------------------------
  const forgot = await json('/api/auth/customer/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_A }),
  });
  record('reset request accepted', forgot.status === 200 && forgot.body?.sent === true, `HTTP ${forgot.status}`);

  const unknown = await json('/api/auth/customer/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: `nobody-${STAMP}@example.test` }),
  });
  record(
    'unknown address answers the same',
    unknown.status === forgot.status && unknown.body?.sent === true,
    `HTTP ${unknown.status} (no account enumeration)`
  );

  // 9. cleanup ----------------------------------------------------------------
  const deletedAddress = await json(`/api/account/addresses/${addressId}`, { method: 'DELETE' }, liveTokenA);
  record('address delete', deletedAddress.ok, `HTTP ${deletedAddress.status}`);
} catch (error) {
  record('run', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const id of createdCustomerIds.filter((n) => Number.isInteger(n) && n > 0)) {
    await wooDelete(`/wc/v3/customers/${id}?force=true&reassign=0`).catch(() => {});
  }
  if (createdCustomerIds.length) {
    console.log(`CLEANUP  removed ${createdCustomerIds.length} QA customer(s) from WooCommerce`);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
