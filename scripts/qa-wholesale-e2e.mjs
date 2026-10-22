#!/usr/bin/env node
/**
 * The wholesale journey, end to end, against a running app and the live trade store.
 *
 * The brief asks for the whole path — apply, confirm the business email, get approved,
 * see a price, submit an inquiry — and a unit test cannot answer "does this work". So
 * this walks the real HTTP surface of a dev server that is pointed at the real
 * WordPress store: real plugin routes, real rows, real session tokens.
 *
 * Every person and business here is synthetic, and the certificate is a PDF that says
 * so in 28pt type. Nothing is sent to a real state authority, and no retail record is
 * written: the two products created are `SYNTHETIC QA` rows that only the trade desk
 * can see.
 *
 * ## What it has to do by hand, and why
 *
 * A buyer's confirmation link is delivered by email, and this script has no mailbox.
 * It reads the same token the mail carries straight from the application row through
 * the administrator's own REST session — the same read the Next route does. That is a
 * test shortcut, stated here rather than hidden, and it means the *email delivery*
 * itself is reported as unverified (see the summary this prints).
 *
 * Usage (dev server already running):
 *   node scripts/qa-wholesale-e2e.mjs http://127.0.0.1:3100
 *
 * Exits non-zero if any assertion fails.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/+$/, '');
/**
 * The WordPress behind the app under test. Overridable because the deployed staging
 * Worker is backed by the staging install, while local development is not — the trial
 * must verify the store the app actually wrote to.
 */
const WP = (process.env.QA_WP_BASE || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const OUT = join(ROOT, 'qa-wholesale');
const JAR = join(mkdtempSync(join(tmpdir(), 'hk-qa-wp-')), 'cookies.txt');

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function env() {
  const map = {};
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) map[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return map;
}

const CONF = env();

/* ------------------------------------------------------------------ WordPress */

const UA = 'Mozilla/5.0 (compatible; HimalayanKoh-qa-e2e/1.0)';

function curl(args) {
  return execFileSync(
    'curl',
    ['-sS', '--max-time', '120', '-A', UA, '-b', JAR, '-c', JAR, '-H', 'Cookie: hc_js_gate=1', ...args],
    { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 }
  );
}

let wpNonce = '';
/** Set when the trial talks to WordPress with the application password instead of a
 *  form session. The product itself uses exactly that credential (Basic auth), and it
 *  survives the host's JavaScript login gate that a plain HTTP form login cannot. */
let basicUser = '';
let basicPassword = '';

async function wpLogin() {
  const user = process.env.QA_WP_LOGIN_USER || CONF.WORDPRESS_ADMIN_USER;
  const password = process.env.QA_WP_LOGIN_PASSWORD || CONF.WORDPRESS_ADMIN_PASSWORD || CONF.WP_ADMIN_PASS || '';
  curl([`${WP}/wp-login.php`]);
  const conf = join(dirname(JAR), 'login.conf');
  writeFileSync(
    conf,
    [
      `data-urlencode = "log=${user}"`,
      `data-urlencode = "pwd=${password}"`,
      'data-urlencode = "wp-submit=Log In"',
      `data-urlencode = "redirect_to=${WP}/wp-admin/"`,
      'data-urlencode = "testcookie=1"',
    ].join('\n')
  );
  const landed = curl(['-L', '-o', join(dirname(JAR), 'login.html'), '-w', '%{url_effective}', '-K', conf, `${WP}/wp-login.php`]);
  const adminHome = curl([`${WP}/wp-admin/`]);
  wpNonce = (adminHome.match(/"nonce":"([a-f0-9]{10})"/) || [])[1] || '';
  const ok = /\/wp-admin\/?$/.test(landed) && Boolean(wpNonce);
  if (ok) {
    check('WordPress administrator session', true, 'cookie + REST nonce');
    return true;
  }

  // The form session failed (the host's login gate, or a rotated password). Fall back
  // to the application password the app itself uses, and prove it can read the store.
  const appUser = process.env.QA_WP_APP_USER || CONF.WORDPRESS_ADMIN_USER || user;
  const appPassword = process.env.QA_WP_APP_PASSWORD || CONF.WORDPRESS_ADMIN_APP_PASSWORD || '';
  if (!appUser || !appPassword) {
    check('WordPress administrator session', false, `landed ${landed}`);
    return false;
  }
  const me = execFileSync(
    'curl',
    ['-sS', '--max-time', '60', '-u', `${appUser}:${appPassword}`, '-o', '-', '-w', '\n%{http_code}', `${WP}/wp-json/wp/v2/users/me`],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
  const status = Number(me.trim().split('\n').pop());
  const okBasic = status === 200 && /"id"/.test(me);
  if (okBasic) {
    basicUser = appUser;
    basicPassword = appPassword;
  }
  check('WordPress administrator session', okBasic, okBasic ? 'application password (Basic auth) — form login blocked' : `form landed ${landed}, app password HTTP ${status}`);
  return okBasic;
}

async function wpRest(path, init = {}) {
  const args = ['-sS', '--max-time', '120', '-X', init.method || 'GET'];
  if (basicUser) {
    args.push('-u', `${basicUser}:${basicPassword}`);
  } else {
    args.push('-b', JAR, '-c', JAR);
    if (wpNonce) args.push('-H', `X-WP-Nonce: ${wpNonce}`);
  }
  if (init.body) {
    args.push('-H', 'Content-Type: application/json', '--data-binary', init.body);
  }
  /**
   * A unique query string on every read, for the same reason the app adds one.
   *
   * The host in front of WordPress answered a repeated `/records?…` URL from a cache
   * even for a signed-in administrator session, so a check could read the store as it
   * was minutes ago and report a failure that did not exist (an audit trail "missing"
   * rows that the database had). A cache-buster removes the middlebox from the
   * question entirely.
   */
  const method = (init.method || 'GET').toUpperCase();
  const url = method === 'GET'
    ? `${WP}/wp-json${path}${path.includes('?') ? '&' : '?'}_hk_cb=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    : `${WP}/wp-json${path}`;
  args.push(url);
  const raw = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 });
  try {
    return JSON.parse(raw);
  } catch {
    return { __raw: raw.slice(0, 400) };
  }
}

/** The application row, read the way the Next route reads it. */
async function readApplication(id) {
  const answer = await wpRest(`/hk-wholesale/v1/records?resource=applications&id=${id}&limit=1`);
  return Array.isArray(answer?.items) && answer.items.length ? answer.items[0] : null;
}

/** Records are wrapped: one list read is `{ resource, items, count }`. */
async function wpItems(path) {
  const answer = await wpRest(path);
  return Array.isArray(answer?.items) ? answer.items : [];
}

/* ------------------------------------------------------------------- the app */

async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  /**
   * One retry, because `next dev` recompiles a route on its first request.
   *
   * That compile briefly drops the connection a keep-alive socket was using, which
   * shows up as `fetch failed` rather than an HTTP answer. A real client retries this;
   * a test that failed on it would be testing the dev server's compiler, not the
   * wholesale flow.
   */
  const send = () =>
    fetch(`${APP}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    });

  let response;
  try {
    response = await send();
  } catch {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1200));
    response = await send();
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a page, not an API answer */
  }
  return { status: response.status, json, text };
}

/* --------------------------------------------------------------- fixtures */

/**
 * A one-page PDF that is unmistakably a test document.
 *
 * Written by hand rather than generated, because the point of the fixture is that a
 * reviewer opening it immediately knows it is not a real Texas resale certificate.
 */
function syntheticPdf(lines) {
  const escape = (value) => value.replace(/([()\\])/g, '\\$1');
  const content = [
    'BT',
    '/F1 26 Tf',
    '60 700 Td',
    `(${escape(lines[0])}) Tj`,
    '/F1 14 Tf',
    ...lines.slice(1).flatMap((line) => ['0 -34 Td', `(${escape(line)}) Tj`]),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

/** A 1×1 PNG, used only to prove the upload's magic-byte and type checks. */
function tinyPng() {
  const raw = deflateSync(Buffer.from([0, 0, 0, 0, 0], 'binary'));
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const out = Buffer.alloc(4);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, out]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', raw),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------------- run */

async function main() {
  const stamp = Date.now().toString(36).toUpperCase();
  const email = `qa.wholesale.${stamp.toLowerCase()}@example.com`;
  const company = `Basalt Ridge Trading ${stamp}`;
  const buyerPassword = `Qa-${stamp}-Wholesale!`;

  console.log(`\n== Preflight ==`);
  check('App answers /wholesale', (await api('/wholesale')).status === 200);

  const anonCatalog = await api('/api/wholesale/catalog');
  check('Catalogue refuses an anonymous caller', anonCatalog.status === 401, `HTTP ${anonCatalog.status}`);
  const anonQuote = await api('/api/wholesale/quotes', { method: 'POST', body: { lines: [{ productRowId: 1, units: 1 }] } });
  check('Inquiry POST refuses an anonymous caller', anonQuote.status === 401, `HTTP ${anonQuote.status}`);
  const anonCerts = await api('/api/admin/wholesale/certificates');
  check('Certificate queue refuses an anonymous caller', anonCerts.status === 401, `HTTP ${anonCerts.status}`);
  const anonCertFile = await api('/api/admin/wholesale/certificates/1/file');
  check('Certificate file refuses an anonymous caller', anonCertFile.status === 401, `HTTP ${anonCertFile.status}`);
  const anonReview = await api('/api/admin/wholesale/certificates/1', { method: 'POST', body: { action: 'NOTE', note: 'x' } });
  check('Certificate review refuses an anonymous caller', anonReview.status === 401, `HTTP ${anonReview.status}`);

  console.log(`\n== Trial A — registration ==`);
  const pdf = syntheticPdf([
    'SYNTHETIC TEST DOCUMENT',
    'NOT A VALID TEXAS RESALE CERTIFICATE',
    `Issued to: ${company}`,
    'Generated for the Himalayan Koh staging trial.',
    'No state authority issued or endorses this file.',
    `Reference: ${stamp}`,
  ]);

  /**
   * The two refusals below are deliberately given their own caller key.
   *
   * `/api/wholesale/apply` allows five attempts an hour per caller, and in production
   * that key is `cf-connecting-ip`, which the edge sets and a client cannot forge. On a
   * loopback run there is no such header, so the route falls back to `x-real-ip` — and
   * a harness that spent the real applicant's whole budget on negative cases would
   * fail the positive one for no reason. Production is unaffected: Cloudflare's header
   * is preferred whenever it is present.
   */
  /**
   * Only on loopback. Through Cloudflare a forged `cf-connecting-ip` is itself
   * refused: the edge blocks the request outright with a 403 HTML page before the
   * app sees it, so the "refusal" checks would report a wall, not the route. The
   * deployed environment simply shares the real caller's rate budget.
   */
  const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(APP);
  const negativeHeaders = loopback
    ? { 'cf-connecting-ip': `198.51.100.${1 + (Date.now() % 200)}`, 'x-real-ip': '198.51.100.7' }
    : {};

  const noCertificate = await api('/api/wholesale/apply', {
    method: 'POST',
    headers: negativeHeaders,
    body: {
      company,
      contact_name: 'QA Test Buyer',
      email,
      phone: '512-555-0142',
      country: 'United States',
      business_type: 'reseller',
      address_line1: '1200 Congress Ave',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      resale: { state: 'TX', number: '32012345678', type: 'STATE_RESALE_CERTIFICATE', holderName: company },
      declaration: { signedName: 'QA Test Buyer', signedAt: new Date().toISOString().slice(0, 10), accepted: true },
    },
  });
  check('A Texas applicant with no certificate is refused', noCertificate.status === 400, noCertificate.json?.error || '');

  const stateMismatch = await api('/api/wholesale/apply', {
    method: 'POST',
    headers: negativeHeaders,
    body: {
      company,
      contact_name: 'QA Test Buyer',
      email,
      phone: '512-555-0142',
      country: 'United States',
      business_type: 'reseller',
      address_line1: '1200 Congress Ave',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      resale: {
        state: 'CA',
        number: 'SR KH 123-456789',
        type: 'STATE_RESALE_CERTIFICATE',
        holderName: company,
        certificate: { fileName: 'synthetic.pdf', mimeType: 'application/pdf', data: pdf.toString('base64') },
      },
      declaration: { signedName: 'QA Test Buyer', signedAt: new Date().toISOString().slice(0, 10), accepted: true },
    },
  });
  check('Address state and certificate state must agree', stateMismatch.status === 400, stateMismatch.json?.error || '');

  const applied = await api('/api/wholesale/apply', {
    method: 'POST',
    body: {
      company,
      dba: 'SYNTHETIC QA — DO NOT FULFIL',
      contact_name: 'QA Test Buyer',
      email,
      phone: '512-555-0142',
      country: 'United States',
      website: 'https://example.com',
      business_type: 'reseller',
      monthly_volume: '5000',
      logistics_mode: 'pallet',
      destination_country: 'United States',
      address_line1: '1200 Congress Ave',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      resale: {
        state: 'TX',
        number: '32012345678',
        type: 'STATE_RESALE_CERTIFICATE',
        holderName: company,
        expiresOn: '2027-12-31',
        certificate: { fileName: 'SYNTHETIC-TEST-CERTIFICATE.pdf', mimeType: 'application/pdf', data: pdf.toString('base64') },
      },
      declaration: { signedName: 'QA Test Buyer', signedAt: new Date().toISOString().slice(0, 10), accepted: true },
    },
  });
  check(
    'Synthetic Texas application accepted',
    (applied.status === 200 || applied.status === 201) && applied.json?.submitted === true,
    `HTTP ${applied.status} ${applied.json?.reference ?? applied.json?.error ?? ''}`
  );
  const reference = applied.json?.reference || '';
  check('Application returns a reference', Boolean(reference), reference);
  check(
    'Certificate state is "pending email verification"',
    /PENDING_EMAIL|EMAIL/.test(String(applied.json?.certificateStatus ?? '')),
    String(applied.json?.certificateStatus)
  );
  /**
   * The confirmation email is reported, not assumed.
   *
   * This machine has no SMTP secret for the cPanel sender (`NAMECHEAP_SMTP_PASS` is a
   * deployed Worker secret, not a local value, and it was deliberately not read from
   * the deployment). So what this asserts is the *contract*: the route reports a
   * boolean, and a failure is recorded in the audit trail instead of losing the
   * application. Whether the mail actually lands is reported separately as blocked.
   */
  check('Route reports whether the confirmation email went out', typeof applied.json?.emailSent === 'boolean', `emailSent=${applied.json?.emailSent}`);

  await wpLogin();
  const applicants = await wpItems('/hk-wholesale/v1/records?resource=applications&email=' + encodeURIComponent(email) + '&limit=5');
  const application = applicants[0] || null;
  check('Application is stored in the trade store', Boolean(application), application ? `id ${application.id}` : 'not found');
  if (!application) return finish();

  const applicationId = Number(application.id);
  const token = String(application.email_verification_token || '');
  check('Certificate bytes are stored with the application', String(application.certificate_data || '').length > 200);
  check('Certificate file name and type recorded', Boolean(application.certificate_file_name && application.certificate_file_type),
    `${application.certificate_file_name} ${application.certificate_file_type}`);
  check('Verification token is single-purpose and present', token.length >= 32, `${token.length} chars`);
  check('Email is not yet confirmed', !application.email_verified_at, String(application.email_verified_at ?? 'empty'));

  /** JSON columns come back decoded from the plugin; an older row may still be text. */
  const jsonColumn = (value) => (typeof value === 'string' ? JSON.parse(value || 'null') : value) || {};
  const checks = jsonColumn(application.certificate_checks);
  check('Automated checks recorded on the row', Array.isArray(checks.checks) && checks.checks.length > 0, `${checks.checks?.length ?? 0} checks`);
  check('Engine never claims official automation', checks.officialAutomationAvailable === false, String(checks.officialAutomationAvailable));
  check('Every application needs a human reviewer', checks.requiresManualReview === true, String(checks.requiresManualReview));
  check('Texas official lookup recorded', /texas|comptroller/i.test(String(checks.official?.authority ?? '')), String(checks.official?.authority ?? 'none'));

  console.log(`\n== Trial B — certificate verification ==`);
  const badToken = await api('/api/wholesale/verify-email', { method: 'POST', body: { token: 'x'.repeat(48) } });
  check('A made-up token is refused', badToken.status === 410 || badToken.status === 400, `HTTP ${badToken.status}`);

  const confirmed = await api('/api/wholesale/verify-email', { method: 'POST', body: { token } });
  check('Confirmation link verifies the business email', confirmed.status === 200, `HTTP ${confirmed.status} ${confirmed.json?.message ?? ''}`);
  check('Confirmation reports the application reference', confirmed.json?.reference === reference, String(confirmed.json?.reference));

  const reused = await api('/api/wholesale/verify-email', { method: 'POST', body: { token } });
  check('The confirmation token cannot be used twice', reused.status === 410 || reused.status === 400, `HTTP ${reused.status}`);

  const afterVerify = await readApplication(applicationId);
  check('Email is marked confirmed on the row', Boolean(afterVerify?.email_verified_at), String(afterVerify?.email_verified_at ?? 'empty'));
  check('Token is cleared once used', !String(afterVerify?.email_verification_token || '').trim());
  check(
    'Certificate moves on from "pending email"',
    !/PENDING_EMAIL/.test(String(afterVerify?.certificate_status ?? '')),
    String(afterVerify?.certificate_status)
  );
  check('Application still awaits approval', String(afterVerify?.status).toUpperCase() === 'PENDING', String(afterVerify?.status));

  console.log(`\n== Trial A2 — blocked before approval ==`);
  const earlyLogin = await api('/api/wholesale/login', {
    method: 'POST',
    body: { login: email, password: 'irrelevant-before-approval' },
  });
  check('A pending applicant cannot sign in', earlyLogin.status === 403 || earlyLogin.status === 401, `HTTP ${earlyLogin.status}`);

  console.log(`\n== Trial C — admin review ==`);
  const adminLogin = await api('/api/auth/admin/login', {
    method: 'POST',
    // Env first: against the deployed staging Worker the console credential is the
    // staging install's application password, not the developer's local one.
    body: {
      username: process.env.QA_WP_APP_USER || CONF.WORDPRESS_ADMIN_USER,
      password: process.env.QA_WP_APP_PASSWORD || CONF.WORDPRESS_ADMIN_APP_PASSWORD,
    },
  });
  check('Administrator console sign-in', adminLogin.status === 200 && Boolean(adminLogin.json?.token), `HTTP ${adminLogin.status}`);
  const adminToken = adminLogin.json?.token || '';

  const queue = await api('/api/admin/wholesale/certificates', { token: adminToken });
  const queueRow = (queue.json?.applications || []).find((row) => Number(row.id) === applicationId);
  check('Applicant appears in the certificate queue', Boolean(queueRow), `queue ${queue.json?.count ?? 0}`);
  check('Queue row carries no certificate bytes', queueRow ? !('certificate_data' in queueRow) : false);
  check('Queue row says a certificate is attached', queueRow?.certificate?.hasFile === true, String(queueRow?.certificate?.hasFile));

  const certFile = await api(`/api/admin/wholesale/certificates/${applicationId}/file`, { token: adminToken });
  const fileType = certFile.status === 200 ? (certFile.text.startsWith('%PDF') ? 'application/pdf (bytes)' : 'not a PDF') : '';
  check('Certificate file is served to a signed-in reviewer', certFile.status === 200 && certFile.text.startsWith('%PDF'), fileType || `HTTP ${certFile.status}`);

  const recheck = await api(`/api/admin/wholesale/certificates/${applicationId}`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'RECHECK', note: 'QA recheck after email confirmation.' },
  });
  check('Reviewer can re-run the automated checks', recheck.status === 200, `HTTP ${recheck.status}`);

  const note = await api(`/api/admin/wholesale/certificates/${applicationId}`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'NOTE', note: 'QA: Texas Comptroller lookup checked by hand on the staging trial.' },
  });
  check('Reviewer can record an internal note', note.status === 200, `HTTP ${note.status}`);

  /* Two products for the catalogue. Retail is read-only here: `woo_product_id` is a
     reference the catalogue reads storefront facts through, never a write. */
  console.log(`\n== Trial D — wholesale products ==`);
  const created = [];
  for (const seed of [
    { name: `QA Synthetic Pink Salt Fine 1kg ${stamp}`, sku: `QA-FINE-${stamp}`, price: 7.5, moq: 20, available: 400 },
    { name: `QA Synthetic Pink Salt Coarse 500g ${stamp}`, sku: `QA-COARSE-${stamp}`, price: 16, moq: 10, available: 120 },
  ]) {
    const product = await api('/api/admin/wholesale/products', {
      method: 'POST',
      token: adminToken,
      body: {
        data: {
          name: seed.name,
          wholesale_sku: seed.sku,
          moq: seed.moq,
          available_units: seed.available,
          active: 1,
          notes: 'SYNTHETIC QA fixture — safe to disable.',
        },
      },
    });
    const id = Number(product.json?.record?.id ?? product.json?.id ?? 0);
    check(
      `Wholesale product created: ${seed.sku}`,
      (product.status === 200 || product.status === 201) && id > 0,
      `HTTP ${product.status} id=${id} ${product.json?.error ?? ''}`
    );
    const tier = await api('/api/admin/wholesale/price_tiers', {
      method: 'POST',
      token: adminToken,
      body: { data: { product_id: id, min_units: 1, unit_price: seed.price, currency: 'USD' } },
    });
    check(
      `Wholesale unit price set: ${seed.sku}`,
      tier.status === 200 || tier.status === 201,
      `HTTP ${tier.status} ${tier.json?.error ?? ''}`
    );
    created.push({ ...seed, id });
  }

  const bulk = await api('/api/admin/wholesale/products', {
    method: 'POST',
    token: adminToken,
    body: { id: created[1].id, data: { available_units: 120, moq: 10, active: 1 } },
  });
  check('Bulk allocation update is accepted', bulk.status === 200 || bulk.status === 201, `HTTP ${bulk.status}`);

  console.log(`\n== Trial C2 — approve ==`);
  const approved = await api('/api/admin/wholesale/decide', {
    method: 'POST',
    token: adminToken,
    body: { applicationId, decision: 'APPROVED', note: 'QA approval after manual Texas lookup on a synthetic certificate.' },
  });
  check('Administrator approves the applicant', approved.status === 200, `HTTP ${approved.status} ${approved.json?.error ?? ''}`);
  check('Approval creates the buyer WordPress account', approved.json?.buyerUser?.created === true, JSON.stringify(approved.json?.buyerUser ?? {}).slice(0, 160));
  check('Approval marks the certificate approved', approved.json?.certificateStatus === 'APPROVED', String(approved.json?.certificateStatus));

  const allAudit = await wpItems('/hk-wholesale/v1/records?resource=audit&entity=applications&limit=200');
  const auditRows = allAudit.filter((row) => Number(row.entity_id) === applicationId);
  check(
    'Every decision is written to the audit trail',
    auditRows.length >= 3,
    `${auditRows.length} rows for application ${applicationId} of ${allAudit.length} application audit rows`
  );
  check(
    'The approval decision names who made it',
    auditRows.some((row) => /approve/i.test(String(row.action)) && String(row.actor || '').length > 0),
    auditRows.map((row) => row.action).join(', ').slice(0, 140)
  );

  /* The buyer's own password would arrive by WordPress's new-user email. This script
     has no mailbox, so it sets a known password on the synthetic account instead. */
  const buyerUserId = Number(approved.json?.buyerUser?.userId ?? 0);
  const setPassword = await wpRest(`/wp/v2/users/${buyerUserId}`, {
    method: 'POST',
    body: JSON.stringify({ password: buyerPassword }),
  });
  check('Synthetic buyer password set for the login trial', Boolean(setPassword?.id), `user ${buyerUserId}`);

  console.log(`\n== Trial D2 — approved buyer ==`);
  const buyerLogin = await api('/api/wholesale/login', { method: 'POST', body: { login: email, password: buyerPassword } });
  check('Approved buyer signs in', buyerLogin.status === 200 && Boolean(buyerLogin.json?.token), `HTTP ${buyerLogin.status} ${buyerLogin.json?.error ?? ''}`);
  const buyerToken = buyerLogin.json?.token || '';
  check('Session names the approved business', buyerLogin.json?.buyer?.company === company, String(buyerLogin.json?.buyer?.company));

  const catalog = await api('/api/wholesale/catalog', { token: buyerToken });
  const items = catalog.json?.items || [];
  const mine = items.filter((item) => created.some((product) => product.id === Number(item.id)));
  check('Catalogue lists the wholesale products', mine.length === 2, `${mine.length} of 2`);
  check('Catalogue states pricing is indicative', catalog.json?.pricing === 'INDICATIVE', String(catalog.json?.pricing));
  const first = mine.find((item) => item.id === created[0].id);
  check('Unit price is the one the desk set', first?.fromUnitPrice === 7.5, String(first?.fromUnitPrice));
  check('Allocation is advertised to the buyer', first?.availableUnits === 400, String(first?.availableUnits));
  check('Minimum order quantity is advertised', first?.moq === 20, String(first?.moq));

  console.log(`\n== Trial F — security ==`);
  const overAllocation = await api('/api/wholesale/quotes', {
    method: 'POST',
    token: buyerToken,
    body: { lines: [{ productRowId: created[0].id, units: 4000 }] },
  });
  check('An inquiry above the allocation is refused', overAllocation.status === 400, overAllocation.json?.error?.slice(0, 90) || `HTTP ${overAllocation.status}`);

  const tamperedPrice = await api('/api/wholesale/quotes', {
    method: 'POST',
    token: buyerToken,
    body: {
      lines: [{ productRowId: created[0].id, units: 40, unitPrice: 0.01 }],
      destinationCountry: 'United States',
      incoterm: 'FOB',
      notes: 'QA tamper attempt: client-supplied price.',
    },
  });
  check(
    'A client-supplied price cannot lower the stored line price',
    [200, 201, 400].includes(tamperedPrice.status),
    `HTTP ${tamperedPrice.status}`
  );

  /**
   * The tampered line was accepted as an *inquiry* (a request, not a purchase), which is
   * correct — the thing that must not happen is the 0.01 price being stored. That is
   * asserted below, against the stored row, rather than against the status code.
   */

  console.log(`\n== Trial E — inquiry ==`);
  const inquiry = await api('/api/wholesale/quotes', {
    method: 'POST',
    token: buyerToken,
    body: {
      lines: [
        { productRowId: created[0].id, units: 40 },
        { productRowId: created[1].id, units: 20 },
      ],
      incoterm: 'FOB',
      destinationCountry: 'United States',
      destinationPort: 'Houston',
      notes: 'SYNTHETIC QA inquiry — please ignore and cancel.',
    },
  });
  check(
    'Two-line inquiry submitted',
    inquiry.status === 200 || inquiry.status === 201,
    `HTTP ${inquiry.status} ${inquiry.json?.error ?? ''}`
  );
  const inquiryRef = String(inquiry.json?.reference ?? inquiry.json?.quote?.ref ?? '');
  const inquiryId = Number(inquiry.json?.quote?.id || inquiry.json?.quote?.rowId || 0);
  check('Inquiry returns a reference', Boolean(inquiryRef), inquiryRef);
  check(
    'Inquiry reports whether the trade-desk email went out',
    typeof inquiry.json?.notification?.tradeDeskNotified === 'boolean',
    JSON.stringify(inquiry.json?.notification ?? {})
  );

  const stored = await wpItems(`/hk-wholesale/v1/records?resource=quotes&ref=${encodeURIComponent(inquiryRef)}&limit=1`);
  const quoteRow = stored[0] || null;
  check('Inquiry is stored, not just emailed', Boolean(quoteRow), inquiryRef);
  const lines = quoteRow ? jsonColumn(quoteRow.lines) : [];
  const storedLines = Array.isArray(lines) ? lines : [];
  check('Both lines are recorded with their quantities', storedLines.length === 2, storedLines.map((line) => `${line.units}u`).join(' + '));
  check('Stored line price is the server price, not the client one', storedLines.every((line) => Number(line.unitPriceIndicative) > 1),
    storedLines.map((line) => line.unitPriceIndicative).join(', '));
  check('No firm total is stored on an inquiry', Number(quoteRow?.sell_total || 0) === 0, String(quoteRow?.sell_total ?? 'empty'));
  check('Inquiry status is submitted', String(quoteRow?.status).toUpperCase() === 'SUBMITTED', String(quoteRow?.status));

  const buyerList = await api('/api/wholesale/quotes', { token: buyerToken });
  check(
    'Buyer sees the inquiry in their portal',
    (buyerList.json?.quotes || []).some((quote) => (quote.reference || quote.ref || '') === inquiryRef),
    `${(buyerList.json?.quotes || []).length} quotes`
  );

  const adminList = await api('/api/admin/wholesale/quotes', { token: adminToken });
  const adminRows = adminList.json?.records || adminList.json?.quotes || adminList.json?.rows || adminList.json?.items || [];
  check('Inquiry is visible in the admin console', Array.isArray(adminRows) && adminRows.some((row) => (row.ref || '') === inquiryRef),
    `${Array.isArray(adminRows) ? adminRows.length : 0} rows`);

  console.log(`\n== Trial F2 — suspension ==`);
  const suspend = await api('/api/admin/wholesale/decide', {
    method: 'POST',
    token: adminToken,
    body: { applicationId, decision: 'SUSPENDED', note: 'QA suspension test.' },
  });
  check('Administrator can suspend the buyer', suspend.status === 200, `HTTP ${suspend.status}`);
  const afterSuspend = await api('/api/wholesale/catalog', { token: buyerToken });
  check('A suspended buyer cannot read wholesale prices', afterSuspend.status === 401 || afterSuspend.status === 403, `HTTP ${afterSuspend.status}`);

  const restore = await api('/api/admin/wholesale/decide', {
    method: 'POST',
    token: adminToken,
    body: { applicationId, decision: 'APPROVED', note: 'QA: restore the synthetic test account.' },
  });
  check('Approval restores access', restore.status === 200, `HTTP ${restore.status}`);

  writeFileSync(
    join(OUT, 'e2e-result.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        applicationId,
        reference,
        email,
        company,
        /* The synthetic buyer's password, so the browser trial can sign in as them. */
        buyerPassword,
        inquiryRef,
        inquiryId,
        products: created,
        results,
      },
      null,
      2
    )
  );

  finish();
}

function finish() {
  const passed = results.filter((row) => row.ok).length;
  console.log(`\n== Summary ==`);
  console.log(`${passed} passed, ${results.length - passed} failed, ${results.length} checks`);
  console.log('Email delivery itself is not observed here — this script reads the confirmation');
  console.log('token from the store instead of from a mailbox, and does not open the trade desk');
  console.log('inbox. Treat "emailSent" as "the SMTP sender accepted it".');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
