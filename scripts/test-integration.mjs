/**
 * Runs the gated backend integration suites.
 *
 * Those suites are skipped unless `BACKEND_INTEGRATION=1` *and* the WooCommerce
 * credentials exist, because they talk to the live staging store and create then
 * remove a throwaway product. Vitest does not read `.env.local` — Next does — so
 * this runner loads the same file and passes the values through the child
 * process environment.
 *
 * It loads only the backend variables, so a unit test cannot start behaviour
 * that depends on the rest of the environment. The values are never printed and
 * never written anywhere: the file stays the only copy, and it is gitignored.
 *
 *   npm run test:integration
 *   npm run test:integration -- src/lib/woo
 *
 * The suites themselves refuse to write unless the configured origin is the
 * staging install, so this cannot become a production write by accident.
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

console.log('Running backend integration suites against the configured staging store…');
const args = ['vitest', 'run', ...process.argv.slice(2)];
const result = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
