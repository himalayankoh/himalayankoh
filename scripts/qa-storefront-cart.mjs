#!/usr/bin/env node
/**
 * Staging QA for the storefront and its cart.
 *
 *   node scripts/qa-storefront-cart.mjs [--base http://127.0.0.1:3103]
 *
 * Two things are checked, both against the running app:
 *
 *   1. the customer-facing pages render — counted as a real status code plus the
 *      presence of page-specific content, because a 200 that is only the Next.js
 *      error shell is the failure mode this catches;
 *   2. the cart lifecycle works through `/api/cart`, which is the app's own proxy
 *      onto WooCommerce's Store API. Add → read → change quantity → remove → clear,
 *      carrying the cart-token cookie the way a browser does.
 *
 * Checkout is deliberately **not** driven past the page load: completing it would
 * create an order and touch a payment provider. This script never posts to
 * checkout, never pays, and creates no order — the cart is cleared at the end.
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
const WP = String(env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
const WOO_AUTH = `Basic ${Buffer.from(
  `${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`
).toString('base64')}`;

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${detail}`);
};

/** A cookie jar, because the cart lives behind an httpOnly cookie. */
const jar = new Map();

function rememberCookies(res) {
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  for (const raw of setCookies) {
    const [pair] = String(raw).split(';');
    const at = pair.indexOf('=');
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function cart(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(jar.size ? { Cookie: cookieHeader() } : {}),
      ...(init.headers || {}),
    },
    redirect: 'manual',
  });
  rememberCookies(res);
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

const itemCount = (body) =>
  Array.isArray(body?.items) ? body.items.reduce((n, i) => n + Number(i.quantity || 0), 0) : null;

try {
  // ---- 1. pages render ------------------------------------------------------
  const published = await (
    await fetch(`${WP}/wp-json/wc/v3/products?status=publish&per_page=1&_fields=id,slug`, {
      headers: { Authorization: WOO_AUTH },
    })
  ).json();
  const product = Array.isArray(published) && published[0] ? published[0] : null;
  if (!product) throw new Error('no published product to render');

  const pages = [
    ['/', 'Himalayan'],
    ['/products', 'Salt'],
    [`/products/${product.slug}`, ''],
    ['/track', ''],
    ['/wishlist', ''],
    ['/checkout', ''],
  ];

  for (const [path, needle] of pages) {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    const html = await res.text();
    const hasNeedle = needle ? html.toLowerCase().includes(needle.toLowerCase()) : true;
    const looksLikeShell = html.length < 2_000 || /Application error|Internal Server Error/i.test(html);
    record(
      `page ${path}`,
      res.status === 200 && hasNeedle && !looksLikeShell,
      `HTTP ${res.status} ${html.length}b${needle ? ` has "${needle}"=${hasNeedle}` : ''}`
    );
  }

  // ---- 2. cart lifecycle ----------------------------------------------------
  const empty = await cart('/api/cart');
  record('cart reads empty', empty.ok && itemCount(empty.body) === 0, `HTTP ${empty.status} items=${itemCount(empty.body)}`);
  record('cart carries a session cookie', jar.size > 0, `cookies=${jar.size}`);

  const added = await cart('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ action: 'add', productId: String(product.id), quantity: 2 }),
  });
  record(
    'cart add (qty 2)',
    added.ok && itemCount(added.body) === 2,
    `HTTP ${added.status} items=${itemCount(added.body)} total=${added.body?.totals?.total ?? '-'}`
  );

  const key = Array.isArray(added.body?.items) ? added.body.items[0]?.key : null;
  record('cart line carries an item key', !!key, `key=${key ? 'present' : 'missing'}`);

  if (key) {
    const setQty = await cart('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ action: 'setQuantity', key, quantity: 1 }),
    });
    record('cart setQuantity -> 1', setQty.ok && itemCount(setQty.body) === 1, `items=${itemCount(setQty.body)}`);

    const removed = await cart('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ action: 'remove', key }),
    });
    record('cart remove line', removed.ok && itemCount(removed.body) === 0, `items=${itemCount(removed.body)}`);
  }

  // A second add + clear, so the empty state after a clear is proven too.
  await cart('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ action: 'add', productId: String(product.id), quantity: 1 }),
  });
  const cleared = await cart('/api/cart', { method: 'POST', body: JSON.stringify({ action: 'clear' }) });
  record('cart clear', cleared.ok && itemCount(cleared.body) === 0, `items=${itemCount(cleared.body)}`);

  const rejected = await cart('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ action: 'add', productId: '', quantity: 1 }),
  });
  record('cart rejects an empty product id', rejected.status >= 400, `HTTP ${rejected.status}`);
} catch (error) {
  record('run', false, error instanceof Error ? error.message : String(error));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
console.log('NOTE  checkout was not completed: no order was created and no payment was attempted.');
process.exit(failed ? 1 : 0);
