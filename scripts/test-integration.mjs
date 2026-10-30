/**
 * Runs the gated backend integration suites.
 *
 * Those suites are skipped unless `BACKEND_INTEGRATION=1` *and* the WooCommerce
 * credentials exist, because they talk to a live store — and one of them creates then
 * removes a throwaway product. Vitest does not read `.env.local` — Next does — so this
 * runner loads the same file and passes the values through the child process
 * environment.
 *
 * It loads only the backend variables, so a unit test cannot start behaviour that
 * depends on the rest of the environment. The values are never printed and never
 * written anywhere: the file stays the only copy, and it is gitignored.
 *
 *   npm run test:integration
 *   npm run test:integration -- src/lib/woo
 *
 * ## Why it says which origin it is about to test
 *
 * This runner used to print "the configured staging store…" whatever `.env.local`
 * pointed at, and that sentence is how a set of *staging* catalogue expectations
 * asserted against the *production* install read as an application failure for a
 * while: the reader was told staging while the failures were production's shape. So
 * the origin is now classified and named, and the classification is passed to the
 * suites (`HIMALAYAN_KOH_ORIGIN_KIND`) rather than each re-deriving it — one
 * decision, printed once.
 *
 * ## What it refuses to start
 *
 * The suites describe two origins: the staging install
 * (`https://himalayankoh.com/staging`) and the production install
 * (`https://wp.himalayankoh.com`). A third origin has no expectations written for it,
 * so running there would produce failures that mean nothing; that case stops here,
 * naming the origin and both of the ones the suites know about. The same applies when
 * the server-side and public origins disagree, or when the backend source is not
 * WooCommerce: the suites would then be exercising something other than the store the
 * storefront reads.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');

/** The variables the backend suites need. Deliberately a short allow-list. */
const WANTED = [
  'NEXT_PUBLIC_DATA_SOURCE',
  'WORDPRESS_BASE_URL',
  'WOOCOMMERCE_BASE_URL',
  'NEXT_PUBLIC_WORDPRESS_BASE_URL',
  'NEXT_PUBLIC_WOOCOMMERCE_BASE_URL',
  'WORDPRESS_REQUEST_TIMEOUT_MS',
  'WOOCOMMERCE_CONSUMER_KEY',
  'WOOCOMMERCE_CONSUMER_SECRET',
  // The write path resolves a gallery image against the WordPress media library
  // (see `lib/woo/productImageAttachments.ts`), which authenticates as a
  // WordPress administrator rather than with the consumer pair. Without these two
  // the suites can only exercise the fallback that offers the store a URL to
  // download — the behaviour the attachment rule exists to avoid.
  'WORDPRESS_ADMIN_USER',
  'WORDPRESS_ADMIN_APP_PASSWORD',
];

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (!WANTED.includes(key)) continue;
    out[key] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const fromFile = readEnvFile(envPath);
const env = {
  ...process.env,
  ...fromFile,
  BACKEND_INTEGRATION: '1',
  NEXT_PUBLIC_DATA_SOURCE: fromFile.NEXT_PUBLIC_DATA_SOURCE || 'woocommerce',
};

const missing = ['WOOCOMMERCE_CONSUMER_KEY', 'WOOCOMMERCE_CONSUMER_SECRET'].filter(
  (key) => !env[key]
);
if (missing.length) {
  console.error(
    `Cannot run integration tests: ${missing.join(' and ')} are not set.\n` +
      `Add them to ${path.relative(root, envPath)} (server-only; never NEXT_PUBLIC_*).`
  );
  process.exit(2);
}

/**
 * The two installs the suites have expectations for, and a name for each. The order
 * matters: `/staging` is a path on the apex host, so it is matched before the apex
 * itself.
 */
const ORIGINS = [
  {
    kind: 'staging',
    describe: 'staging',
    pattern: /^https:\/\/(?:wp\.)?himalayankoh\.com\/staging(?:\/|$)/,
    note: 'catalogue-shape expectations were observed here, and the write suite may run',
  },
  {
    kind: 'production',
    describe: 'production',
    pattern: /^https:\/\/(?:www\.)?(?:wp\.)?himalayankoh\.com(?:\/|$)/,
    note: 'origin-independent contracts and production-shape assertions run; the write suite skips itself',
  },
];

const base = (env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
const publicBase = (env.NEXT_PUBLIC_WOOCOMMERCE_BASE_URL || env.NEXT_PUBLIC_WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
const match = ORIGINS.find((origin) => origin.pattern.test(base));

if (!base) {
  console.error(
    'Cannot run integration tests: no origin is configured.\n' +
      '  Set WORDPRESS_BASE_URL / WOOCOMMERCE_BASE_URL, or NEXT_PUBLIC_* equivalents, in .env.local.\n' +
      `  The suites describe ${ORIGINS.map((origin) => `${origin.describe} (${origin.pattern.source})`).join(' and ')}.`
  );
  process.exit(2);
}

if (!match) {
  console.error(
    `Cannot run integration tests against ${base}: this origin has no expectations written for it.\n` +
      `  staging:     https://himalayankoh.com/staging\n` +
      `  production:  https://wp.himalayankoh.com\n` +
      '  A run here would fail on the shape of the catalogue rather than on a defect.'
  );
  process.exit(2);
}

if (publicBase && publicBase !== base && !ORIGINS.some((origin) => origin.pattern.test(publicBase))) {
  console.error(
    `Cannot run integration tests: the server origin is ${base} but the public origin is ${publicBase}.\n` +
      '  The read-only suite resolves products with the public value (a client component does), so the\n' +
      '  two must point at the same install. Fix .env.local rather than the tests.'
  );
  process.exit(2);
}

if (env.NEXT_PUBLIC_DATA_SOURCE !== 'woocommerce') {
  console.error(
    `Cannot run integration tests: NEXT_PUBLIC_DATA_SOURCE is "${env.NEXT_PUBLIC_DATA_SOURCE}", not "woocommerce".\n` +
      '  These suites are about the WooCommerce backend, so a run with the source switched off tests nothing.'
  );
  process.exit(2);
}

console.log(`Running backend integration suites against ${match.describe} — ${base}`);
console.log(`  ${match.note}`);
if (match.kind === 'production') {
  console.log('  its own name for that origin is passed on as HIMALAYAN_KOH_ORIGIN_KIND, so the suites and this line cannot disagree');
}

const args = ['vitest', 'run', ...process.argv.slice(2)];
const result = spawnSync('npx', args, {
  stdio: 'inherit',
  env: { ...env, HIMALAYAN_KOH_ORIGIN_KIND: match.kind },
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
