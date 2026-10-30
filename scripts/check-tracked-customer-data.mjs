#!/usr/bin/env node
/**
 * Refuse to build while a per-record customer export is tracked in this repository.
 *
 *   node scripts/check-tracked-customer-data.mjs
 *
 * ## Why this exists
 *
 * `docs/production/customer-cleanup-manifest-2026-10-11.csv` — 2,705 rows carrying each
 * customer's id, registration date and a digest of their address *with the domain in
 * clear* — was committed and pushed to a **public** GitHub repository. The masking was
 * real but not sufficient: a ten-hex-character digest of the local part of a human
 * address (`first.last`, a name, a name plus digits) is recoverable by dictionary, and
 * `domain` is in the next column, so the pair re-identifies a person.
 *
 * The lesson is not "mask harder". It is that a *per-record* export is not a document:
 * it belongs in `backups/`, which is gitignored and described in `.gitignore` as holding
 * "orders and customers", and what belongs in `docs/` is the counts. That mistake is
 * cheap to repeat the next time a census runs, so it is checked rather than remembered.
 *
 * ## What it flags, and what it deliberately does not
 *
 * A guard that fails on its own repository is worse than no guard, because the next
 * person learns to ignore it — so the rule is about the *kind* of file, not about a
 * pattern in it:
 *
 *   - **Tabular data** (`.csv`, `.json`, `.jsonl`, `.tsv`, `.xml`) is an offence when it
 *     holds ten or more lines with an address, when it carries the census's own digest
 *     column name, or when its filename reads as a customer/account export.
 *   - **Prose** (`.md`, `.txt`, `.html`) is an offence only when the filename *and* the
 *     content both say "this is rows about people" — a document that discusses the
 *     census, quotes its column name, or mentions an address in a sentence is a
 *     document, and this check is not a censor of the audit trail.
 *   - **Source** (`.mjs`, `.js`, `.ts`, `.tsx`, `.jsx`) is never scanned. Test suites
 *     carry fixture addresses by design (`ayaz@example.net`), and treating a fixture as
 *     a leak would make every suite an offence. A customer export is not source code.
 *
 * Paths and counts are printed; matched values never are. A check that leaks what it is
 * protecting has made the problem worse.
 *
 * It runs in `prebuild`, so a build stops rather than producing an artifact from a tree
 * that publishes customer rows. It is not a substitute for the history question:
 * untracking a file does not remove it from commits that already exist, which is a
 * separate decision with a separate blast radius (see the audit's §3 note).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Formats a census, an export or a database dump is written to. */
const TABULAR = /\.(csv|json|jsonl|tsv|xml)$/i;

/** Formats a person writes a document in. */
const PROSE = /\.(md|txt|html)$/i;

/** An address, loose on purpose: this is a shape test, not validation. */
const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** The census's own column name, which no tabular data in this repository needs. */
const CENSUS_COLUMN = /email_local_sha256|email_sha256|email_digest/i;

/** A filename that says "this file is rows about people". */
const PER_RECORD_NAME =
  /(cleanup|census|export|dump|manifest).*(customer|account|user|people)|(customer|account|user|people).*(cleanup|census|export|dump|manifest)/i;

/** Below this many address-bearing lines, a file mentions addresses rather than holding them. */
const ADDRESS_LINE_LIMIT = 10;

/** Files larger than this are not scanned — a customer census is not 8 MB of source. */
const MAX_BYTES = 8 * 1024 * 1024;

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

const offences = [];

for (const file of trackedFiles()) {
  const tabular = TABULAR.test(file);
  const prose = PROSE.test(file);
  if (!tabular && !prose) continue;

  const absolute = join(ROOT, file);
  if (!existsSync(absolute)) continue;
  if (statSync(absolute).size > MAX_BYTES) continue;

  const text = readFileSync(absolute, 'utf8');
  const addressLines = text.split(/\r?\n/).filter((line) => ADDRESS.test(line)).length;
  const named = PER_RECORD_NAME.test(file);
  const reasons = [];

  if (tabular) {
    if (CENSUS_COLUMN.test(text)) reasons.push('carries a census/export digest column name');
    if (addressLines >= ADDRESS_LINE_LIMIT) {
      reasons.push(`${addressLines} lines contain an email address (limit ${ADDRESS_LINE_LIMIT - 1})`);
    }
    if (named) reasons.push('its filename reads as a per-record customer export');
  } else if (named && addressLines >= ADDRESS_LINE_LIMIT) {
    // A document only when both its name and its contents say "rows about people":
    // prose that explains the census is the audit trail, not an export.
    reasons.push(
      `its filename reads as a per-record export AND ${addressLines} lines contain an email address`
    );
  }

  if (reasons.length) offences.push({ file, reasons });
}

if (!offences.length) {
  console.log('No per-record customer export is tracked in this repository.');
  process.exit(0);
}

console.error('A per-record customer export is tracked in this repository:\n');
for (const offence of offences) {
  console.error(`  ${offence.file}`);
  for (const reason of offence.reasons) console.error(`      ${reason}`);
}
console.error(
  '\nThese belong in `backups/` (gitignored), not in `docs/`. Write the aggregate counts to\n' +
    'the document and keep the rows out of the repository:\n' +
    '\n' +
    '  git rm --cached <path> && mkdir -p backups/private && mv <path> backups/private/\n' +
    '\n' +
    'Untracking does not remove the file from commits that already exist — that is a\n' +
    'separate history decision, not something this check can or should do.'
);
process.exit(1);
