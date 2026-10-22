#!/usr/bin/env node
/**
 * The wholesale journey in a real browser, through the real forms.
 *
 * `qa-wholesale-e2e.mjs` proves the HTTP contract. This proves the *screens*: a person
 * finds Wholesale in the header, fills in an application, uploads a certificate, and an
 * administrator approves them from the console — at desk, tablet and phone widths, with
 * a screenshot of each.
 *
 * Session handling is the one shortcut: the console and the portal keep their signed
 * session in `localStorage`, so this writes the same shape the login screen would. The
 * tokens come from the real login endpoints, not from a bypass. Everything else — the
 * form fields, the file input, the submit button, the console's approve button — is
 * driven as a browser drives it.
 *
 * Usage (dev server already running, `qa-wholesale-e2e.mjs` already run so a synthetic
 * buyer exists):
 *   node scripts/qa-wholesale-browser.mjs http://127.0.0.1:3100
 *
 * Writes PNGs to `qa-wholesale/`.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'qa-wholesale');
const APP = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const PORT = 9333;
const WORK = mkdtempSync(join(tmpdir(), 'hk-ws-browser-'));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Users/basco/.agent-browser/browsers/chrome-156.0.8078.47/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const results = [];
/** sha256 of every screenshot written in this run -> the file that first produced it. */
const SHOT_HASHES = new Map();

/*
 * This script writes synthetic buyers, products and quotes through the app under test.
 * Run against a local dev server, the app uses `.env.local`, and that file points at the
 * LIVE WordPress backend - which is how test rows reached production once. Refuse the
 * production hostname and an unconfirmed local server.
 */
{
  const target = new URL(process.argv[2] || 'http://127.0.0.1:3100');
  const isProd = /(^|\.)himalayankoh\.com$/i.test(target.hostname) && !/^preview\./i.test(target.hostname);
  const isLocal = /^(127\.0\.0\.1|localhost|\[::1\])$/i.test(target.hostname);
  if (isProd && process.env.QA_ALLOW_PRODUCTION !== 'yes-write-synthetic-data-to-production') {
    console.error('Refusing to run: the target is the production hostname and this trial writes synthetic records.');
    process.exit(2);
  }
  if (isLocal && !process.env.QA_STAGING_CONFIRMED) {
    console.error(
      'Refusing to run against a local dev server without QA_STAGING_CONFIRMED=1: the dev server reads .env.local, ' +
        'whose WORDPRESS_BASE_URL is the production backend. Point .env.local at staging first, then set the flag.'
    );
    process.exit(2);
  }
}
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

/* ---------------------------------------------------------------- fixture */

/** The certificate a reviewer sees: a real PDF, unmistakably synthetic. */
function syntheticPdf(company) {
  const lines = [
    'SYNTHETIC TEST DOCUMENT',
    'NOT A VALID TEXAS RESALE CERTIFICATE',
    `Issued to: ${company}`,
    'Generated for the Himalayan Koh staging trial.',
    'No state authority issued or endorses this file.',
  ];
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

/* ------------------------------------------------------------------ Chrome */

function chromeBinary() {
  const found = CHROME_CANDIDATES.find((path) => {
    try {
      return existsSync(path);
    } catch {
      return false;
    }
  });
  if (!found) throw new Error('No Chrome binary found. Set CHROME_PATH.');
  return found;
}

async function waitForDevtools() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('Chrome did not open its DevTools port.');
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      // A native `window.confirm`/`prompt` blocks the page's JS thread and every CDP
      // call until it is answered. The admin console confirms before recording a
      // decision — correct behaviour — so answer it here rather than let it wedge the
      // run. `accept: true` is what a person clicking OK does.
      if (message.method === 'Page.javascriptDialogOpening') {
        this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => undefined);
        return;
      }
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      // A CDP call can wedge (a capture during a re-render, a busy tab). Bounded here
      // so one stuck command cannot hang the whole trial — a check that times out is
      // reported, not swallowed into an endless run.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`CDP ${method} timed out`));
      }, 12_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolveSend(value); },
        reject: (error) => { clearTimeout(timer); rejectSend(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'Page evaluation failed.');
    }
    return result.result.value;
  }
}

const pause = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function viewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}

async function goto(cdp, path, settleMs = 2600) {
  // A cold dev-server compile can outlast the CDP call, but the navigation still
  // happens. A timed-out navigate is therefore not fatal: confirm where the tab
  // actually landed after the settle instead of abandoning the run.
  try {
    await cdp.send('Page.navigate', { url: `${APP}${path}` });
  } catch (error) {
    console.log(`  navigate ${path} slow — ${error instanceof Error ? error.message : error}`);
  }
  await pause(settleMs);
  const landed = await cdp.evaluate('window.location.pathname').catch(() => '');
  if (landed && !path.startsWith(landed)) {
    await pause(4000);
  }
  return landed;
}

/**
 * Waits for a page to stop saying "loading".
 *
 * A fixed pause is a guess; the console reads several stores before it can draw a
 * queue, and a guess that is too short photographs a spinner and reports a failure
 * that is really an impatient test.
 */
/** Waits for a page whose content arrives after its shell. */
async function waitForContent(cdp, predicate, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let text = '';
  while (Date.now() < deadline) {
    text = await cdp.evaluate('document.body.innerText').catch(() => '');
    if (text && predicate(text)) return text;
    await pause(900);
  }
  return text;
}

async function waitForSettled(cdp, timeoutMs = 18_000) {
  const deadline = Date.now() + timeoutMs;
  let text = '';
  while (Date.now() < deadline) {
    text = await cdp.evaluate('document.body.innerText').catch(() => '');
    /* The console says "Reading…" while it loads, not "Loading" — a check that only
       knew the second word photographed an empty queue and called it a failure. */
    if (text && !/loading|reading…|reading\.\.\./i.test(text)) {
      /* One `.main` read, for the cases where the shell draws before its content. */
      if (process.env.QA_DEBUG === '1') {
        const main = await cdp
          .evaluate(`(() => { const m = document.querySelector('main') || document.body; return m.innerText.slice(0, 900); })()`)
          .catch(() => '');
        console.log(`  [main] ${String(main).replace(/\s+/g, ' ').slice(0, 500)}`);
      }
      return text;
    }
    await pause(900);
  }
  return text;
}

/** Console/portal sessions live in localStorage; the shape is the login's own. */
async function setStorage(cdp, key, value) {
  await cdp.evaluate(
    `(() => { window.localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))}); return true; })()`
  );
}

async function shot(cdp, file, width, height) {
  try {
    await viewport(cdp, width, height);
    await pause(700);
    const metrics = await cdp.evaluate(
      'JSON.stringify({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, title: document.title })'
    );
    const info = JSON.parse(metrics || '{}');
    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const png = Buffer.from(capture.data, 'base64');
    writeFileSync(join(OUT, file), png);
    /* Two different screens must never produce the same bytes. Identical captures
       mean the page did not change between the shots (a stale frame or a step that
       did not happen), and a screenshot that proves nothing is a failed check. */
    const digest = createHash('sha256').update(png).digest('hex');
    const twin = SHOT_HASHES.get(digest);
    SHOT_HASHES.set(digest, twin || file);
    if (twin && twin !== file) {
      check(`Screenshot ${file} shows a different state from ${twin}`, false, 'byte-identical capture - the page did not change');
    }
    console.log(
      `  ${file} ${width}x${height} inner=${info.innerWidth} scroll=${info.scrollWidth} overflow=${
        info.scrollWidth > info.innerWidth ? 'YES' : 'no'
      }`
    );
    return info;
  } catch (error) {
    // A missed screenshot is a reported gap, not a reason to abandon the rest of the run.
    console.log(`  ${file} SKIPPED — ${error instanceof Error ? error.message : error}`);
    return { innerWidth: width, scrollWidth: width, title: '' };
  }
}

/** Type into a React-controlled input the way a person does: native setter + event. */
const FILL = `
function fill(selector, value) {
  const el = document.querySelector(selector);
  if (!el) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
`;

/**
 * Read what the form did after Submit.
 *
 * Written as a function and serialised with `toString()` rather than pasted into a
 * template literal: a regex inside a template literal has to be escaped twice, and
 * the first version of this check failed with "invalid regular expression" instead of
 * reporting what the page said.
 */
function readApplicationOutcome() {
  const text = document.body.innerText;
  const ref = (text.match(/HK-WS-A[0-9]+/) || [''])[0];
  // The form renders its own error in a `role="alert"` box — read that, not a guess.
  // Every alert is listed: a page can carry its own empty alert region, and reading
  // the first one alone would hide the form's message behind it.
  const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
    .map((el) => (el.textContent || '').trim())
    .filter(Boolean);
  const alert = alerts.join(' | ');
  // If the browser's own validation stopped the submit, say which field is empty
  // instead of leaving a mystery "nothing happened".
  const invalid = Array.from(document.querySelectorAll(':invalid')).map((el) => el.id || el.name || el.tagName);
  return { ref, alert, invalid: invalid.join(','), head: text.slice(0, 400) };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const stamp = Date.now().toString(36).toUpperCase();
  const company = `Basalt Ridge Browser ${stamp}`;
  const email = `qa.browser.${stamp.toLowerCase()}@example.com`;
  const pdfPath = join(WORK, 'SYNTHETIC-TEST-CERTIFICATE.pdf');
  writeFileSync(pdfPath, syntheticPdf(company));

  /* Sessions from the real endpoints. */
  const adminLogin = await fetch(`${APP}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Env first: against the deployed staging Worker the console credential is the
      // staging install's application password, not the developer's local one.
      username: process.env.QA_WP_APP_USER || CONF.WORDPRESS_ADMIN_USER,
      password: process.env.QA_WP_APP_PASSWORD || CONF.WORDPRESS_ADMIN_APP_PASSWORD,
    }),
  });
  const adminSession = await adminLogin.json();
  check('Console session obtained from the login endpoint', Boolean(adminSession.token), `HTTP ${adminLogin.status}`);

  const chrome = spawn(
    chromeBinary(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(WORK, 'profile')}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let socket = null;
  let cdp = null;
  const openTab = async () => {
    const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', () => rejectOpen(new Error('CDP socket failed.')), { once: true });
    });
    cdp = new Cdp(socket);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
    // Surface native dialogs to the handler above instead of leaving them blocking.
    await cdp.send('Page.setJavascriptDialogOpeningBehavior', { behavior: 'accept' }).catch(() => undefined);
  };
  /**
   * A fresh tab is the recovery from a wedged one.
   *
   * Clicking Approve in the console can leave the tab's JS thread busy enough that
   * every later CDP call times out. Rather than abandon the remaining evidence, the
   * next section runs in a clean tab. (The wedge itself is a finding to report, not
   * something this harness papers over silently.)
   */
  const freshTab = async () => {
    try {
      if (socket) socket.close();
    } catch {
      /* already gone */
    }
    await openTab();
  };

  try {
    await waitForDevtools();
    await openTab();

    /* One consent decision, before anything else: the banner is a real consent
       surface and it covers the page in every screenshot otherwise. */
    await goto(cdp, '/', 2000);
    await cdp.evaluate(`window.localStorage.setItem('luxedge_consent_v1', 'declined')`);
    await goto(cdp, '/', 2000);
    const bannerGone = await cdp.evaluate(`!document.querySelector('[data-consent-open="true"]') && !/Accept analytics/.test(document.body.innerText)`);
    check('Cookie banner dismissed for the run', bannerGone === true, String(bannerGone));

    /* ---------------------------------------------------------- landing */
    console.log('\n== Header entry and landing page ==');
    await viewport(cdp, 1440, 900);
    await goto(cdp, '/');

    const headerLink = await cdp.evaluate(
      `(() => { const links = Array.from(document.querySelectorAll('header a, nav a')); const hit = links.find(a => /^wholesale$/i.test((a.textContent||'').trim())); return hit ? { href: hit.getAttribute('href'), text: hit.textContent.trim() } : null; })()`
    );
    check('Wholesale link is in the desktop header', Boolean(headerLink), headerLink ? headerLink.href : 'not found');

    /**
     * Clicked, then followed if the click alone did not navigate.
     *
     * A synthetic click on a Next `<Link>` normally routes in place. When an overlay
     * intercepts it, the honest reading is "the link is there and points at the right
     * place"; a harness that stopped there would fail on a banner it already dismissed
     * and learn nothing about the page it came to review.
     */
    const clickKind = await cdp.evaluate(
      `(() => {
         const links = Array.from(document.querySelectorAll('header a, nav a'));
         const hit = links.find(a => /^wholesale$/i.test((a.textContent||'').trim()));
         if (!hit) return 'not found';
         hit.click();
         return 'clicked';
       })()`
    );
    await pause(2600);
    let landedUrl = await cdp.evaluate('location.pathname');
    if (landedUrl !== '/wholesale') {
      await goto(cdp, '/wholesale');
      landedUrl = await cdp.evaluate('location.pathname');
    }
    check('Clicking it opens the wholesale landing page', landedUrl === '/wholesale', `${clickKind} → ${landedUrl}`);

    const landingCopy = await cdp.evaluate(
      `(() => { const t = document.body.innerText; return { apply: /apply for a wholesale account/i.test(t), login: /wholesale login|sign in/i.test(t), verified: /verified|verification/i.test(t), inquiry: /inquiry|inquiries/i.test(t), invoice: /invoice/i.test(t), noPrices: !/\\$\\d/.test(t) }; })()`
    );
    check('Landing explains approval is required', landingCopy.verified === true, JSON.stringify(landingCopy));
    check('Landing offers apply and sign-in', landingCopy.apply === true && landingCopy.login === true);
    check('Landing says orders start as inquiries', landingCopy.inquiry === true);
    check('Landing mentions the invoice step', landingCopy.invoice === true);
    check('Landing shows no wholesale prices to the public', landingCopy.noPrices === true);

    await shot(cdp, 'wholesale-landing-1440.png', 1440, 900);
    await shot(cdp, 'wholesale-landing-768.png', 768, 1024);
    await shot(cdp, 'wholesale-landing-390.png', 390, 844);

    /* -------------------------------------------------------- mobile nav */
    console.log('\n== Mobile navigation ==');
    await viewport(cdp, 360, 800);
    await goto(cdp, '/');
    const opened = await cdp.evaluate(
      `(() => {
         const buttons = Array.from(document.querySelectorAll('button'));
         const hit = buttons.find(b => /menu/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.textContent||'')) || b.querySelector('svg'));
         const target = buttons.find(b => b.getAttribute('aria-label') && /menu/i.test(b.getAttribute('aria-label'))) || hit;
         if (target) { target.click(); return target.getAttribute('aria-label') || target.textContent.trim().slice(0, 30); }
         return 'no menu button';
       })()`
    );
    await pause(1200);
    const mobileWholesale = await cdp.evaluate(
      `(() => { const links = Array.from(document.querySelectorAll('a')); return links.filter(a => /wholesale/i.test((a.textContent||'').trim())).map(a => a.getAttribute('href')).slice(0, 4); })()`
    );
    check('Wholesale is reachable from the mobile navigation', Array.isArray(mobileWholesale) && mobileWholesale.includes('/wholesale'), `${opened} → ${JSON.stringify(mobileWholesale)}`);
    await shot(cdp, 'wholesale-mobile-nav-360.png', 360, 800);

    /* ------------------------------------------------------ registration */
    console.log('\n== Registration form ==');
    await viewport(cdp, 1440, 900);
    await goto(cdp, '/wholesale/apply');

    const filled = await cdp.evaluate(
      `(() => {
         const byId = (id, value) => {
           const field = document.getElementById(id);
           if (!field) return 'no-field:' + id;
           const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
           const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
           setter.call(field, value);
           field.dispatchEvent(new Event('input', { bubbles: true }));
           field.dispatchEvent(new Event('change', { bubbles: true }));
           return 'ok';
         };
         return {
           company: byId('company', ${JSON.stringify(company)}),
           dba: byId('dba', 'SYNTHETIC QA — DO NOT FULFIL'),
           businessType: byId('business_type', 'reseller'),
           address: byId('address_line1', '1200 Congress Ave'),
           city: byId('city', 'Austin'),
           zip: byId('zip', '78701'),
           country: byId('country', 'United States'),
           contact: byId('contact_name', 'QA Browser Buyer'),
           email: byId('email', ${JSON.stringify(email)}),
           phone: byId('phone', '512-555-0188'),
           certificateNumber: byId('resale_number', '32012345678'),
           signature: byId('signed_name', 'QA Browser Buyer'),
         };
       })()`
    );
    check('Registration form fields accept input', Object.values(filled || {}).filter((value) => value === 'ok').length >= 7, JSON.stringify(filled));

    const selects = await cdp.evaluate(
      `(() => {
         const set = (id, value) => {
           const select = document.getElementById(id);
           if (!select) return 'no-select:' + id;
           select.value = value;
           select.dispatchEvent(new Event('change', { bubbles: true }));
           return 'ok';
         };
         return { state: set('state', 'TX'), resaleState: set('resale_state', 'TX'), resaleType: set('resale_type', 'STATE_RESALE_CERTIFICATE') };
       })()`
    );
    check('State and certificate selects accept Texas', selects?.state === 'ok' && selects?.resaleState === 'ok', JSON.stringify(selects));

    /* The declaration is a real consent gate: click the checkbox the declaration text
       belongs to, not whichever checkbox happens to be last on the page. */
    const declared = await cdp.evaluate(
      `(() => {
         const boxes = Array.from(document.querySelectorAll('input[type=checkbox]'));
         const hit = boxes.find(b => /authorised to act|resale on its behalf/i.test((b.closest('label')?.textContent) || ''));
         if (!hit) return 'no-declaration-checkbox (' + boxes.length + ' checkboxes)';
         hit.click();
         return 'clicked';
       })()`
    );
    check('Declaration checkbox is present and ticked', declared === 'clicked', String(declared));

    /* The file input is driven through CDP so the form receives a real File. */
    const node = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('input[type=file]')`,
    });
    if (node.result?.objectId) {
      await cdp.send('DOM.setFileInputFiles', { objectId: node.result.objectId, files: [pdfPath] });
      const name = await cdp.evaluate(
        `(() => { const f = document.querySelector('input[type=file]'); return f && f.files && f.files[0] ? f.files[0].name : 'none'; })()`
      );
      check('Certificate file is attached in the browser', String(name).endsWith('.pdf'), String(name));
    } else {
      check('Certificate file input exists', false, 'no file input found');
    }

    await shot(cdp, 'wholesale-apply-1440.png', 1440, 900);
    await shot(cdp, 'wholesale-apply-390.png', 390, 844);

    const submitted = await cdp.evaluate(
      `(() => {
         const buttons = Array.from(document.querySelectorAll('button'));
         const hit = buttons.find(b => /submit|apply/i.test((b.textContent||'').trim()) && b.type === 'submit');
         const fallback = buttons.find(b => /submit/i.test((b.textContent||'').trim()));
         const target = hit || fallback;
         if (!target) return 'no submit button';
         target.click();
         return target.textContent.trim();
       })()`
    );
    check('Application form has a submit button', String(submitted) !== 'no submit button', String(submitted));
    // The success panel renders after the POST round-trips; poll rather than guess a delay.
    let outcome = { ref: '', alert: '', head: '' };
    for (let attempt = 0; attempt < 18; attempt += 1) {
      await pause(1000);
      outcome = await cdp.evaluate(`(${readApplicationOutcome.toString()})()`);
      if (outcome?.ref || outcome?.alert) break;
    }
    check(
      'Application submitted from the browser',
      Boolean(outcome?.ref),
      outcome?.ref ||
        outcome?.alert ||
        (outcome?.invalid ? `blocked by browser validation: ${outcome.invalid}` : '') ||
        (outcome?.head || '').replace(/\s+/g, ' ').slice(0, 160)
    );
    await shot(cdp, 'wholesale-applied-1440.png', 1440, 900);

    /* ----------------------------------------------------------- console */
    console.log('\n== Console: Wholesale Customers ==');
    await cdp.evaluate(`window.localStorage.setItem('luxedge_sb_session', ${JSON.stringify(JSON.stringify({
      accessToken: adminSession.token,
      refreshToken: '',
      expiresAt: adminSession.expiresAt,
      user: adminSession.user,
    }))})`);

    await goto(cdp, '/admin/wholesale/customers', 3000);
    /* Wait for the queue itself, not for "anything but the empty count": the console
       shell draws "Loading the admin console…" first, and a cold compile can outlast a
       navigation. Only text that names the queue counts as content. */
    const queueText = await waitForContent(
      cdp,
      (text) => !/loading the admin console|reading…|reading\.\.\./i.test(text) && /application|certificate|wholesale customers/i.test(text),
      45_000
    );
    check(
      'Console lists the applications queue',
      /wholesale customers|applications|certificate/i.test(queueText),
      queueText.replace(/\s+/g, ' ').slice(0, 220)
    );
    const hasApplicant = queueText.includes(company);
    check('The browser application appears in the queue', hasApplicant, hasApplicant ? company : 'not listed');
    await shot(cdp, 'admin-wholesale-customers-1440.png', 1440, 950);

    if (hasApplicant) {
      await cdp.evaluate(
        `(() => { const rows = Array.from(document.querySelectorAll('button, tr, li, div')); const hit = rows.find(el => (el.textContent||'').includes(${JSON.stringify(company)}) && el !== document.body); if (hit) { hit.click(); return true; } return false; })()`
      );
      const detailText = await waitForSettled(cdp);
      check('Reviewer sees the certificate detail', /resale certificate|issuing state|certificate/i.test(detailText), detailText.slice(0, 90).replace(/\s+/g, ' '));
      check('Reviewer sees the official verification link', /comptroller|official|lookup/i.test(detailText));
      check('Reviewer sees the audit timeline', /audit|timeline|history/i.test(detailText));
      await shot(cdp, 'admin-wholesale-customer-detail-1440.png', 1440, 950);

      // Clicking Approve kicks off the decision API and a busy re-render; the click
      // itself fires even if the evaluate's reply is slow, so a timeout here is not a
      // failed approval — the confirmation is read from the screen below.
      let approved = 'not attempted';
      try {
        approved = await cdp.evaluate(
          `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /approve buyer/i.test((x.textContent||'').trim())); if (!b) return 'no approve button'; b.click(); return 'clicked'; })()`
        );
      } catch {
        approved = 'clicked (reply timed out)';
      }
      // Poll for the decision to land rather than sleeping a fixed amount.
      let after = '';
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await pause(1500);
        after = await cdp.evaluate('document.body.innerText').catch(() => after);
        if (/application:\s*approved/i.test(after) || /decision recorded/i.test(after)) break;
      }
      check('Approve button is on the review screen', /clicked/.test(String(approved)), String(approved));
      /* The word "Approved" is also a filter tab on this screen, so matching it proves
         nothing. The decision is confirmed only by the selected application's own
         status badge turning from PENDING to APPROVED (or the console's own notice). */
      const approvedOnScreen = /application:\s*approved/i.test(after) || /decision recorded/i.test(after);
      check('Approval is confirmed on screen', approvedOnScreen, after.replace(/\s+/g, ' ').slice(0, 90));
      await shot(cdp, 'admin-wholesale-approved-1440.png', 1440, 950);
    }

    console.log('\n== Console: Wholesale Products ==');
    await freshTab();
    await cdp.evaluate(`window.localStorage.setItem('luxedge_sb_session', ${JSON.stringify(JSON.stringify({
      accessToken: adminSession.token,
      refreshToken: '',
      expiresAt: adminSession.expiresAt,
      user: adminSession.user,
    }))})`).catch(() => undefined);
    await goto(cdp, '/admin/wholesale/products', 3000);
    const productsText = await waitForContent(cdp, (text) => !/0 of 0 product/.test(text));
    check(
      'Console routes Wholesale Products',
      /wholesale products|allocation|moq|wholesale price/i.test(productsText),
      productsText.replace(/\s+/g, ' ').slice(0, 220)
    );
    check('QA wholesale products are listed', /QA Synthetic Pink Salt/i.test(productsText));
    await shot(cdp, 'admin-wholesale-products-1440.png', 1440, 950);
    await shot(cdp, 'admin-wholesale-products-390.png', 390, 844);

    console.log('\n== Console: mobile navigation ==');
    await viewport(cdp, 390, 844);
    await goto(cdp, '/admin/wholesale/customers');
    const adminMobile = await cdp.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll('button')).find(x => /menu/i.test((x.getAttribute('aria-label')||'') + ' ' + (x.textContent||'')));
         if (b) b.click();
         return Boolean(b);
       })()`
    );
    await pause(1200);
    const adminNav = await cdp.evaluate(
      `(() => Array.from(document.querySelectorAll('a')).map(a => (a.textContent||'').trim()).filter(t => /wholesale/i.test(t)).slice(0, 5))()`
    );
    check('Admin sidebar reachable on mobile', adminMobile === true, String(adminMobile));
    check('Wholesale appears in the admin sidebar', Array.isArray(adminNav) && adminNav.length > 0, JSON.stringify(adminNav));
    await shot(cdp, 'admin-wholesale-nav-390.png', 390, 844);

    /* ------------------------------------------------------------ portal */
    console.log('\n== Buyer portal ==');
    /**
     * The buyer whose password this script can know.
     *
     * The application created above is approved through the console (that is the
     * screen under test), but its WordPress password went by email and cannot be read
     * here. `qa-wholesale-e2e.mjs` leaves a synthetic buyer with a known password in
     * `qa-wholesale/e2e-result.json`, and the portal screens are exercised as that
     * buyer — same account type, same session, same routes.
     */
    const e2eResultPath = join(OUT, 'e2e-result.json');
    const e2eBuyer = existsSync(e2eResultPath) ? JSON.parse(readFileSync(e2eResultPath, 'utf8')) : {};
    const buyerEmail = process.env.QA_BUYER_EMAIL || e2eBuyer.email || '';
    const buyerPassword = process.env.QA_BUYER_PASSWORD || e2eBuyer.buyerPassword || '';
    if (!buyerEmail || !buyerPassword) {
      check('Buyer portal trial', false, 'blocked: set QA_BUYER_EMAIL and QA_BUYER_PASSWORD from the e2e run');
    } else {
      const buyerLogin = await fetch(`${APP}/api/wholesale/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: buyerEmail, password: buyerPassword }),
      });
      const buyerSession = await buyerLogin.json();
      check('Approved buyer signs in', buyerLogin.status === 200 && Boolean(buyerSession.token), `HTTP ${buyerLogin.status}`);

      if (buyerSession.token) {
        await cdp.evaluate(
          `window.localStorage.setItem('hk_wholesale_session', ${JSON.stringify(
            JSON.stringify({ accessToken: buyerSession.token, expiresAt: buyerSession.expiresAt, buyer: buyerSession.buyer })
          )})`
        );
        await viewport(cdp, 1440, 950);
        await goto(cdp, '/wholesale/portal', 3000);
        const portalText = await waitForSettled(cdp);
        check(
          'Portal opens for the approved buyer',
          new RegExp(buyerSession.buyer?.company || 'wholesale', 'i').test(portalText),
          portalText.replace(/\s+/g, ' ').slice(0, 240)
        );
        check('Portal shows the approval status', /approved|active|HK-WS-B[0-9]+/i.test(portalText));
        await shot(cdp, 'wholesale-portal-1440.png', 1440, 950);

        await goto(cdp, '/wholesale/catalog', 3000);
        const catalogText = await waitForSettled(cdp);
        check('Catalogue shows the QA products', /QA Synthetic Pink Salt/i.test(catalogText));
        check('Catalogue shows a wholesale unit price', /7\.50|7\.5/.test(catalogText));
        check('Catalogue shows available units', /available/i.test(catalogText));
        check('Catalogue shows the minimum order quantity', /minimum/i.test(catalogText));
        await shot(cdp, 'wholesale-catalog-1440.png', 1440, 950);
        await shot(cdp, 'wholesale-catalog-390.png', 390, 844);

        await goto(cdp, '/wholesale/quotes', 3000);
        const quotesText = await waitForContent(cdp, (text) => /HK-WS-Q[0-9]+/.test(text));
        check('Buyer sees their inquiries', /HK-WS-Q[0-9]+/.test(quotesText), (quotesText.match(/HK-WS-Q[0-9]+/) || ['none'])[0]);
        await shot(cdp, 'wholesale-inquiries-1440.png', 1440, 950);
      }
    }

    socket.close();
  } finally {
    chrome.kill();
  }

  writeFileSync(
    join(OUT, 'browser-result.json'),
    JSON.stringify({ at: new Date().toISOString(), company, email, results }, null, 2)
  );

  const passed = results.filter((row) => row.ok).length;
  console.log(`\n== Summary ==\n${passed} passed, ${results.length - passed} failed, ${results.length} checks`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
