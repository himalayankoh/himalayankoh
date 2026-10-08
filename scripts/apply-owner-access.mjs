#!/usr/bin/env node
/**
 * Merge the owner-provided access file into the project's gitignored `.env.local`.
 *
 *   node scripts/apply-owner-access.mjs [--source docs/production/owner-access.local.env]
 *
 * Why this exists as a script rather than a one-off edit
 * -----------------------------------------------------
 * The credentials the migration needs (hosting account, WordPress administrator,
 * Cloudflare tokens, the repository token) arrive out of band — the owner sends them,
 * not a deploy pipeline. Writing them straight into `.env.local` by hand means the
 * only record of *which* token is which, and what each one is for, is in that file's
 * raw lines; when a token is rotated there is nothing to compare against.
 *
 * So the authoritative copy is `docs/production/owner-access.local.env` — commented,
 * versioned in the sense that it can be re-derived, and gitignored along with
 * everything else under `docs/production/*.local.*`. This script copies the values
 * that the tooling and the app actually read into `.env.local`, which is the file
 * `scripts/lib/env.mjs` already loads, so no other code has to learn a new location.
 *
 * What it will not do
 * -------------------
 *   - It never prints a value, not even a prefix. It prints the **names** it wrote and
 *     whether each already existed, which is what a reader needs to confirm the merge
 *     and is what a transcript can safely contain.
 *   - It will not overwrite a variable it does not own. Every name it writes is listed
 *     in `MAPPING`; anything else in either file is left exactly as it was.
 *   - It refuses to run if `.env.local` is tracked by git. A secret store that is
 *     committed is not a secret store.
 *
 * Rotation is the same command: update the source file, re-run this.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const sourceFlag = args.indexOf('--source');
const SOURCE = join(
  ROOT,
  sourceFlag !== -1 && args[sourceFlag + 1] ? args[sourceFlag + 1] : 'docs/production/owner-access.local.env',
);
const TARGET = join(ROOT, '.env.local');

/**
 * Which names in the owner file become which names in `.env.local`.
 *
 * Renaming is the point in two places:
 *
 *  - `WOOCOMMERCE_API_CONSUMER_*` is the owner's own label for the pair; the app reads
 *    `WOOCOMMERCE_CONSUMER_*` (`src/lib/backend/credentials.ts`).
 *  - `WORDPRESS_ADMIN_URL`/`_EMAIL`/`_PASSWORD` are the *login*, which is for a human at
 *    a wp-login form. The app's REST credential is a WordPress **application password**
 *    and is a different secret entirely, so it is deliberately not mapped: overwriting
 *    it with a login password would break every admin REST call with a confusing 401.
 *
 * `CLOUDFLARE_DNS_TOKEN_1` also becomes `CLOUDFLARE_API_TOKEN`, which is the name
 * `wrangler` and `scripts/lib/cloudflareCredentials.mjs` read. The other two stay under
 * their own names so all three remain available for a capability comparison.
 */
const MAPPING = [
  ['GITHUB_TOKEN', 'GITHUB_TOKEN'],
  ['GITHUB_ACTIVE_REPO', 'GITHUB_ACTIVE_REPO'],
  ['GITHUB_OLD_REPO', 'GITHUB_OLD_REPO'],
  // One source name, two targets: `wrangler` and the deploy guard read
  // CLOUDFLARE_API_TOKEN, while the numbered name keeps the token identifiable when
  // the three are compared for capability.
  ['CLOUDFLARE_DNS_TOKEN_1', 'CLOUDFLARE_API_TOKEN'],
  ['CLOUDFLARE_DNS_TOKEN_1', 'CLOUDFLARE_DNS_TOKEN_1'],
  ['CLOUDFLARE_DNS_TOKEN_2', 'CLOUDFLARE_DNS_TOKEN_2'],
  ['CLOUDFLARE_DNS_TOKEN_3', 'CLOUDFLARE_DNS_TOKEN_3'],
  ['WOOCOMMERCE_API_CONSUMER_KEY', 'WOOCOMMERCE_CONSUMER_KEY'],
  ['WOOCOMMERCE_API_CONSUMER_SECRET', 'WOOCOMMERCE_CONSUMER_SECRET'],
  ['WORDPRESS_ADMIN_URL', 'PRODUCTION_WP_ADMIN_URL'],
  ['WORDPRESS_ADMIN_URL_STAGING', 'PRODUCTION_WP_ADMIN_URL_STAGING'],
  ['WORDPRESS_ADMIN_EMAIL', 'PRODUCTION_WP_ADMIN_EMAIL'],
  ['WORDPRESS_ADMIN_PASSWORD', 'PRODUCTION_WP_ADMIN_PASSWORD'],
  // The pre-cutover access gate. Generated here rather than supplied by the owner, and
  // mapped because `.env.local` is where the tooling and `wrangler` look for it.
  ['PREVIEW_ACCESS_TOKEN', 'PREVIEW_ACCESS_TOKEN'],
  ['NAMECHEAP_USER', 'NAMECHEAP_USER'],
  ['NAMECHEAP_PASS', 'NAMECHEAP_PASS'],
  ['NAMECHEAP_HOSTING_ORIGIN_IP', 'NAMECHEAP_HOSTING_ORIGIN_IP'],
];

function parseEnvFile(path) {
  if (!existsSync(path)) return { order: [], values: new Map() };
  const order = [];
  const values = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 1) continue;
    const name = trimmed.slice(0, i).trim();
    values.set(name, trimmed.slice(i + 1));
    order.push(name);
  }
  return { order, values };
}

// A secret store that git can see is not a secret store.
try {
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', '.env.local'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
  if (tracked) {
    process.stderr.write(
      '.env.local is tracked by git. Refusing to write credentials into a file that would be committed.\n' +
        'Remove it from the index first (git rm --cached .env.local) and confirm .gitignore covers it.\n',
    );
    process.exit(1);
  }
} catch {
  /* `git ls-files` exits non-zero when the path is not tracked — which is what we want. */
}

const source = parseEnvFile(SOURCE);
if (source.values.size === 0) {
  process.stderr.write(`No KEY=value pairs found in ${SOURCE.replace(ROOT, '.').split('\\').join('/')}.\n`);
  process.exit(1);
}

const target = parseEnvFile(TARGET);

const written = [];
for (const [from, to] of MAPPING) {
  const value = source.values.get(from);
  if (value === undefined || value.trim() === '') continue;
  const existed = target.values.get(to);
  target.values.set(to, value);
  if (!target.order.includes(to)) target.order.push(to);
  written.push({ name: to, state: existed === undefined ? 'added' : existed === value ? 'unchanged' : 'updated' });
}

if (written.length === 0) {
  process.stderr.write(
    `Nothing to merge: ${SOURCE.replace(ROOT, '.').split('\\').join('/')} holds none of the mapped names.\n`,
  );
  process.exit(1);
}

// Rewrite `.env.local`, preserving every key that was already there — including the
// ones this script does not own — and appending the new ones at the end.
const body = target.order.map((name) => `${name}=${target.values.get(name)}`).join('\n');
writeFileSync(TARGET, `${body}\n`, 'utf8');

process.stdout.write(`Merged ${written.length} variable(s) into .env.local (values not shown):\n`);
for (const { name, state } of written) process.stdout.write(`  ${state.padEnd(10)} ${name}\n`);
process.stdout.write(
  `\n.env.local is gitignored; ${SOURCE.replace(ROOT, '.').split('\\').join('/')} is the commented ` +
    `authoritative copy.\nRotate by editing that file and re-running this script.\n`,
);
