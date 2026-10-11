#!/usr/bin/env node
/**
 * Why do 2,704 customer records exist?
 *
 *   node scripts/probe-registration-source.mjs
 *
 * Read-only. The census established the shape of the population (2,704 accounts,
 * 3 of them with a name, 674 with a hex-run local part, created across seven
 * years with a few hundred-record bursts). This asks the two questions that
 * decide the remedy:
 *
 *   1. Is there a *live* path that creates accounts one at a time — WordPress's
 *      own `wp-login.php?action=register`, or this app's signup route? A live
 *      path is what a rate limit or a captcha fixes.
 *   2. Or do the records look *inserted in batches* — contiguous id blocks whose
 *      creation timestamps are identical to the second, no names, no cart or
 *      session meta? A batch insert is not fixed by a rate limit; it is fixed by
 *      knowing which tool inserted them.
 *
 * Both can be true of the same population at different times, which is why both
 * are measured rather than one assumed.
 *
 * Nothing is written. Addresses are digested.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const envFile = argOf('env', '.env.local');
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = argOf('base', env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const wooAuth = 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
const wpAuth =
  env.WORDPRESS_ADMIN_USER && env.WORDPRESS_ADMIN_APP_PASSWORD
    ? 'Basic ' + Buffer.from(`${env.WORDPRESS_ADMIN_USER}:${env.WORDPRESS_ADMIN_APP_PASSWORD.replace(/\s+/g, '')}`).toString('base64')
    : null;

const digest = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 10);
const mask = (email) => {
  const at = String(email || '').lastIndexOf('@');
  return at > 0 ? `${digest(String(email).slice(0, at))}@${String(email).slice(at + 1).toLowerCase()}` : '<none>';
};

async function get(pathname, auth, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/wp-json${pathname}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body, headers: res.headers };
}

console.log(`Registration-source probe against ${BASE} (read-only)\n`);

/* 1 — is WordPress's own registration form open? */
console.log('=== 1. Public registration paths ===');
for (const [label, url] of [
  ['wp-login.php?action=register', `${BASE}/wp-login.php?action=register`],
  ['wp-signup.php', `${BASE}/wp-signup.php`],
]) {
  try {
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    const html = await res.text();
    const hasForm = /id="registerform"|name="user_login"|id="setupform"/i.test(html);
    const closed = /registration (has been )?disabled|Registration is disabled|user_registration_disabled/i.test(html);
    console.log(
      `  ${label}: HTTP ${res.status} bytes=${html.length} form=${hasForm} closed-notice=${closed} final=${res.url.replace(/\?.*$/, '')}`
    );
  } catch (error) {
    console.log(`  ${label}: ERROR ${error.message}`);
  }
}

/* The app's own signup route, without submitting it: OPTIONS/CORS tells whether
   the route exists, and a deliberately malformed POST is refused before any
   account is created. Neither call creates a user. */
try {
  const res = await fetch('https://himalayankoh.com/api/auth/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://himalayankoh.com' },
    body: JSON.stringify({}), // missing email/password → validation refusal, no account
  });
  const text = await res.text();
  console.log(`  POST /api/auth/customer/register (empty body): HTTP ${res.status} ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
} catch (error) {
  console.log(`  POST /api/auth/customer/register: ERROR ${error.message}`);
}

/* 2 — WordPress's own settings: does open registration exist at all? */
console.log('\n=== 2. WordPress registration settings ===');
const settings = await get('/wp/v2/settings', wpAuth);
if (settings.status === 200) {
  const s = settings.body;
  for (const key of ['title', 'users_can_register', 'default_role', 'default_password_nag']) {
    console.log(`  ${key}: ${JSON.stringify(s[key])}`);
  }
} else {
  console.log(`  HTTP ${settings.status}: ${JSON.stringify(settings.body).slice(0, 200)}`);
}

/* 3 — the population, in full, to look for batch insertion */
console.log('\n=== 3. Batch-insertion analysis over all customers ===');
const rows = [];
for (let page = 1; page <= 40; page += 1) {
  const res = await get('/wc/v3/customers', wooAuth, {
    per_page: 100,
    page,
    _fields: 'id,email,username,first_name,last_name,role,date_created,date_created_gmt',
  });
  if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) break;
  rows.push(...res.body);
  if (res.body.length < 100) break;
}
console.log(`  read ${rows.length} records`);

volatile: {
  // Timestamps to the second: batch inserts share a timestamp; organic signups do not.
  const bySecond = {};
  for (const r of rows) {
    const stamp = String(r.date_created_gmt || r.date_created || '').slice(0, 19);
    (bySecond[stamp] ||= []).push(r.id);
  }
  const bursts = Object.entries(bySecond)
    .filter(([, ids]) => ids.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
  console.log(`  distinct creation timestamps: ${Object.keys(bySecond).length}`);
  console.log(`  timestamps shared by >1 account: ${bursts.length}`);
  const biggest = bursts.slice(0, 5).map(([ts, ids]) => `${ts}=${ids.length} ids ${Math.min(...ids)}..${Math.max(...ids)}`);
  console.log(`  largest same-second groups: ${biggest.join(' | ') || '(none)'}`);

  // Id contiguity: consecutive ids mean one insertion loop.
  const ids = rows.map((r) => r.id).sort((a, b) => a - b);
  let runs = [];
  let run = [ids[0]];
  for (let i = 1; i < ids.length; i += 1) {
    if (ids[i] === ids[i - 1] + 1) run.push(ids[i]);
    else {
      runs.push(run);
      run = [ids[i]];
    }
  }
  runs.push(run);
  const longRuns = runs.filter((r) => r.length >= 10).sort((a, b) => b.length - a.length);
  console.log(`  contiguous id runs ≥10: ${longRuns.length}`);
  for (const r of longRuns.slice(0, 6)) console.log(`    ${r[0]}..${r[r.length - 1]} (${r.length} ids)`);

  // Does id order track creation order? If yes, the accounts were created, not imported.
  const inOrder = rows.filter((r) => r.date_created).sort((a, b) => a.id - b.id);
  let inversions = 0;
  for (let i = 1; i < inOrder.length; i += 1) {
    if (String(inOrder[i].date_created) < String(inOrder[i - 1].date_created)) inversions += 1;
  }
  console.log(`  id-order vs date-order inversions: ${inversions} of ${inOrder.length} (low = organic creation order)`);

  // Hex-run cluster: ids, dates, name presence.
  const hex = rows.filter((r) => /^[0-9a-f]{8,}$/.test(String(r.email || '').split('@')[0].toLowerCase()));
  const hexIds = hex.map((r) => r.id).sort((a, b) => a - b);
  const hexDates = [...new Set(hex.map((r) => String(r.date_created).slice(0, 10)))].sort();
  console.log(`  hex-run local parts: ${hex.length}; ids ${hexIds[0]}..${hexIds.at(-1)}; dates ${hexDates[0]}..${hexDates.at(-1)}`);
  console.log(`  hex-run with a name: ${hex.filter((r) => (r.first_name || '').trim() || (r.last_name || '').trim()).length}`);

  // Disposable / suspicious domains.
  const DISPOSABLE = /(mailinator|guerrillamail|10minutemail|tempmail|throwaway|trashmail|sharklasers|yopmail|dispostable|getnada|maildrop|temp-mail|fakeinbox|mailnesia|spam4|grr\.la|example\.com|example\.org|test\.com|localhost)/i;
  const disposable = rows.filter((r) => DISPOSABLE.test(String(r.email)));
  console.log(`  disposable/placeholder domains: ${disposable.length}`);
  for (const r of disposable.slice(0, 10)) console.log(`    #${r.id} ${mask(r.email)} ${String(r.date_created).slice(0, 10)}`);

  // Domains that are corporations rather than consumer mailboxes, usually a sign
  // of a scraped or purchased list.
  const domainCounts = {};
  for (const r of rows) {
    const d = String(r.email || '').split('@')[1]?.toLowerCase() || '<none>';
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  }
  const nonConsumer = Object.entries(domainCounts)
    .filter(([d]) => !/^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|aol|icloud|me|mac|comcast|verizon|att|sbcglobal|bellsouth|cox|charter|earthlink|gmx|mail|protonmail|proton|zoho|yandex|usa|vtext|tmomail|mymetropcs|txt)\./i.test(d))
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]);
  console.log(`  non-consumer domains with ≥3 accounts: ${nonConsumer.length}`);
  console.log(`    ${nonConsumer.slice(0, 15).map(([d, n]) => `${d}=${n}`).join(' ')}`);

  // Spam-name signatures sometimes appear in first/last name on spam accounts.
  const weirdNames = rows.filter((r) => /https?:\/\/|\.com|\.ru|www\.|seo|crypto|viagra|casino/i.test(`${r.first_name} ${r.last_name}`));
  console.log(`  accounts whose name field looks promotional: ${weirdNames.length}`);
}

/* 4 — what one suspicious record carries beyond its address */
console.log('\n=== 4. What a suspicious record carries ===');
for (const id of [2723, 2721, 2500, 17]) {
  const one = await get(`/wc/v3/customers/${id}`, wooAuth);
  if (one.status !== 200) {
    console.log(`  #${id}: HTTP ${one.status}`);
    continue;
  }
  const c = one.body;
  const billingSet = Object.entries(c.billing || {}).filter(([, v]) => v).map(([k]) => k);
  const shippingSet = Object.entries(c.shipping || {}).filter(([, v]) => v).map(([k]) => k);
  console.log(
    `  #${c.id} ${mask(c.email)} user=${c.username} role=${c.role} created=${String(c.date_created).slice(0, 19)} ` +
      `name="${c.first_name} ${c.last_name}" billingFields=${billingSet.join(',') || '(none)'} shippingFields=${shippingSet.join(',') || '(none)'}`
  );
  console.log(`     meta keys: ${(c.meta_data || []).map((m) => m.key).join(', ') || '(none)'}`);
  console.log(`     avatar: ${c.avatar_url ? 'set' : 'none'}`);
}
