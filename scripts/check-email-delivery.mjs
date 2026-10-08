#!/usr/bin/env node
/**
 * What outbound email needs, and which part of it is still missing.
 *
 *   node scripts/check-email-delivery.mjs
 *
 * Why this exists
 * ---------------
 * `/api/email/status` can honestly report two things: whether a Resend key is present,
 * and whether `EMAIL_SEND_ENABLED` is on. It reports SPF and DKIM as `NOT_VERIFIED`,
 * because application code cannot resolve DNS. That leaves the migration with a claim
 * it cannot check — "Resend is prepared" — and the failure it hides is specific and
 * expensive: **a Resend key with an unverified sending domain sends nothing at all.**
 * Resend accepts the API call and rejects the message, so orders still exist, the app
 * still logs a failure, and the owner's inbox is simply empty. Order confirmations are
 * the kind of email nobody notices is missing until a customer asks.
 *
 * So this script reads the parts of the answer that are genuinely public — the sending
 * domain's DNS — and reports them as facts. It never needs a Resend key, and it never
 * sends mail.
 *
 * What it checks, and what each result actually means
 * ---------------------------------------------------
 * | Check | What failure means |
 * | --- | --- |
 * | SPF | No SPF, or an SPF without a Resend include, means receiving servers cannot authorise Resend to send for the domain — mail lands in spam or is refused. |
 * | DKIM (`resend._domainkey`) | Without the DKIM record Resend's own dashboard reports the domain as **not verified**, and sending is blocked regardless of what the API key allows. |
 * | DMARC | Absent DMARC does not block sending, but it makes the domain spoofable and is what a deliverability review asks for first. Reported as advice, not as a blocker. |
 * | MX | Inbound still has to work: it is how replies reach the owner. Cloudflare Email Routing and a mailbox both satisfy it. |
 *
 * What it deliberately does not do
 * --------------------------------
 * It cannot see Resend's dashboard, so it cannot say a domain is *verified* — only that
 * the records that verification depends on resolve. `KEYS` below reports which server
 * variables are present, by name, never by value: `RESEND_API_KEY` unset is the one
 * condition that makes all of the above moot, so it is stated first.
 *
 * Exit code: 0 when outbound email could plausibly deliver, 1 when a required record is
 * missing or the key is unset, 2 when DNS could not be reached at all (so a missing
 * record is not misreported as the cause).
 *
 * Read-only. Resolves DNS over HTTPS; writes nothing, sends nothing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The domain mail is sent from. Overridable so this is not hard-wired to one store. */
const DOMAIN = (process.env.EMAIL_DOMAIN || 'himalayankoh.com').trim();

/** Where Resend publishes its DKIM record, per Resend's own domain setup. */
const DKIM_HOST = `resend._domainkey.${DOMAIN}`;

const DNS_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 10_000;

/** Resend's SPF include, as documented for domain verification. */
const RESEND_SPF_INCLUDE = '_spf.resend.com';

if (!existsSync(join(ROOT, '.env.local')) && !process.env.RESEND_API_KEY) {
  process.stdout.write(
    'No .env.local and no RESEND_API_KEY in the environment, so the key cannot be read here.\n' +
      'The DNS checks below are still valid.\n\n',
  );
}

function envFileValues() {
  const path = join(ROOT, '.env.local');
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

const local = envFileValues();
const present = (name) => Boolean(((process.env[name] || local[name] || '') + '').trim());

/** One DNS query over HTTPS. Never throws: an unreachable resolver is its own verdict. */
async function query(name, type) {
  const url = `${DNS_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { error: `resolver answered HTTP ${response.status}` };
    const body = await response.json();
    if (body.Status !== 0) {
      // 3 is NXDOMAIN — a real answer ("this record does not exist"), not a failure.
      if (body.Status === 3) return { answers: [], nxdomain: true };
      return { error: `resolver returned status ${body.Status}` };
    }
    return { answers: (body.Answer || []).map((row) => String(row.data)), nxdomain: false };
  } catch (error) {
    return { error: error?.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : String(error?.message || error) };
  }
}

const results = new Map();
let dnsUnreachable = false;

for (const [key, name, type] of [
  ['spf', DOMAIN, 'TXT'],
  ['dkim', DKIM_HOST, 'CNAME'],
  ['dmarc', `_dmarc.${DOMAIN}`, 'TXT'],
  ['mx', DOMAIN, 'MX'],
  ['resendReturnPath', `send.${DOMAIN}`, 'CNAME'],
]) {
  const result = await query(name, type);
  if (result.error) dnsUnreachable = true;
  results.set(key, result);
}

const txt = (key) =>
  (results.get(key).answers || []).map((value) => value.replace(/^"|"$/g, '')).filter((v) => v.startsWith('v='));

const spfRecords = txt('spf');
const dmarcRecords = txt('dmarc');
const dkim = results.get('dkim');
const mx = results.get('mx');

const spfMentionsResend = spfRecords.some((record) => record.includes(RESEND_SPF_INCLUDE));

process.stdout.write(`Outbound email readiness — ${DOMAIN}\n`);
process.stdout.write(`  (read-only: DNS over HTTPS; no key is used, no mail is sent)\n\n`);

/* ------------------------------------------------------------------ */
/* Credentials                                                        */
/* ------------------------------------------------------------------ */

process.stdout.write('Server configuration\n');
for (const name of ['RESEND_API_KEY', 'RESEND_FROM', 'ADMIN_NOTIFICATION_EMAIL', 'EMAIL_SEND_ENABLED']) {
  process.stdout.write(`  ${present(name) ? 'present ' : 'MISSING '} ${name}\n`);
}
process.stdout.write('\n');

/* ------------------------------------------------------------------ */
/* DNS                                                                */
/* ------------------------------------------------------------------ */

function report(label, state, detail) {
  process.stdout.write(`  ${state.padEnd(9)} ${label.padEnd(30)} ${detail}\n`);
}

process.stdout.write('Sending domain (what Resend’s verification depends on)\n');

if (dnsUnreachable && spfRecords.length === 0 && !dkim.answers?.length) {
  report('SPF', 'UNKNOWN', 'the resolver could not be reached — this is not evidence the record is absent');
  report('DKIM', 'UNKNOWN', `could not resolve ${DKIM_HOST}`);
} else {
  if (spfRecords.length === 0) {
    report('SPF', 'MISSING', `no TXT record starting "v=spf1" on ${DOMAIN}`);
  } else if (!spfMentionsResend) {
    report(
      'SPF',
      'INCOMPLETE',
      `SPF exists but does not include ${RESEND_SPF_INCLUDE}, so Resend is not authorised to send for this domain`,
    );
  } else {
    report('SPF', 'PRESENT', `SPF includes ${RESEND_SPF_INCLUDE}`);
  }

  if (!dkim.answers?.length) {
    report(
      'DKIM',
      'MISSING',
      `no CNAME at ${DKIM_HOST} — without it Resend reports the domain as NOT VERIFIED and refuses to send`,
    );
  } else {
    report('DKIM', 'PRESENT', `${DKIM_HOST} -> ${dkim.answers[0]}`);
  }
}

process.stdout.write('\nReceiving and policy (does not block sending, but is checked)\n');
if (!mx.answers?.length) {
  report('MX', 'MISSING', 'no MX record: replies to the store’s own addresses have nowhere to go');
} else {
  report('MX', 'PRESENT', `${mx.answers.length} record(s), lowest preference: ${mx.answers[0]}`);
}

if (dmarcRecords.length === 0) {
  report('DMARC', 'ADVICE', 'no _dmarc TXT record: the domain can be spoofed; add p=none to start reporting');
} else {
  report('DMARC', 'PRESENT', dmarcRecords[0].slice(0, 90));
}

/* ------------------------------------------------------------------ */
/* Verdict                                                            */
/* ------------------------------------------------------------------ */

const keyPresent = present('RESEND_API_KEY');
const fromPresent = present('RESEND_FROM');
const dkimPresent = Boolean(dkim.answers?.length);
const spfOk = spfMentionsResend;

process.stdout.write('\nWhat still has to happen, in order\n');

const actions = [];
if (!keyPresent) {
  actions.push(
    'A Resend API key must be set as a Worker secret: RESEND_API_KEY. Without it sendEmail()\n' +
      '     returns false and logs "RESEND_API_KEY not set", so nothing is sent — and nothing claims it was.',
  );
}
if (!fromPresent) {
  actions.push(
    'RESEND_FROM is not set, so mail would go out from the built-in default,\n' +
      `     "Himalayan Koh <sales@${DOMAIN}>" (src/lib/email/sendEmail.ts). That is the right domain,
` +
      '     but set it explicitly so the sending address is a decision rather than a default.',
  );
}
if (!dkimPresent) {
  actions.push(
    'Verify the domain in Resend and add the DKIM record it issues. That is a dashboard action\n' +
      `     plus one DNS record (a CNAME at ${DKIM_HOST}). Cloudflare DNS edits need a token with\n` +
      '     Zone → DNS → Edit; the token in this environment does not have DNS read or write today.',
  );
}
if (!spfOk && spfRecords.length > 0) {
  actions.push(
    'The existing SPF record must authorise Resend. Resend’s dashboard shows the exact value to\n' +
      `     add (its documented include host is ${RESEND_SPF_INCLUDE}). Append it to the single v=spf1\n` +
      '     record that already exists — a second v=spf1 record is itself a failure, not a second chance.',
  );
}
if (spfRecords.length === 0 && !dnsUnreachable) {
  actions.push(`Publish an SPF record for ${DOMAIN} including ${RESEND_SPF_INCLUDE}.`);
}
if (!present('EMAIL_SEND_ENABLED')) {
  actions.push(
    'EMAIL_SEND_ENABLED=true must be set on the production Worker, or sendEmail() is in simulation\n' +
      '     mode by design (SITE_CONFIG.emailSendEnabled) and no real mail leaves the deployment.',
  );
}
if (!present('ADMIN_NOTIFICATION_EMAIL')) {
  actions.push(
    'ADMIN_NOTIFICATION_EMAIL is unset, so new-order notifications fall back to SHIPPO_FROM_EMAIL and\n' +
      '     then to sales@' + DOMAIN + '. Set it to the inbox that should receive them.',
  );
}

if (actions.length === 0) {
  process.stdout.write('  Nothing. Every record resolves and every variable is set.\n');
  process.stdout.write(
    '\n  This is not proof that mail is delivered: only a real send to a real inbox proves that,\n' +
      '  and this script sends nothing. The remaining evidence is one test order placed against\n' +
      '  the production Worker after the key is set.\n',
  );
} else {
  for (const [index, action] of actions.entries()) process.stdout.write(`  ${index + 1}. ${action}\n`);
}

process.stdout.write('\nresend prepared (records + key): ');

const outboundReady = keyPresent && fromPresent && dkimPresent && spfOk && present('EMAIL_SEND_ENABLED');
if (outboundReady) {
  process.stdout.write('outbound email is configured to send.\n');
} else {
  process.stdout.write(
    'NOT READY — outbound email cannot deliver yet. Nothing here sends mail, so no half-configured\n' +
      'email is enabled either; the storefront keeps working and simply sends none.\n',
  );
}

// `process.exitCode`, never `process.exit()`: an abrupt exit while undici still holds its
// keep-alive sockets aborts libuv's teardown (`Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)`) and reports 127 — a crash code that would read as "the check itself
// failed" to anything gating on this. Setting the code and letting the loop drain gives
// the caller the verdict the checks actually reached.
process.exitCode = dnsUnreachable && !keyPresent ? 2 : outboundReady ? 0 : 1;
