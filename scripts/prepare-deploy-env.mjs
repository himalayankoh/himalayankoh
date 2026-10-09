#!/usr/bin/env node
/**
 * Write the gitignored env file that a deploy build reads, so every deployed
 * artifact carries its own origin and the commit it was built from.
 *
 *   node scripts/prepare-deploy-env.mjs
 *   DEPLOY_SITE_ORIGIN=https://himalayankoh.com node scripts/prepare-deploy-env.mjs
 *
 * Why this exists
 * ---------------
 * Two values must be right in a deployed build, and neither can be trusted to the
 * shell:
 *
 * 1. The origin. Exporting `NEXT_PUBLIC_SITE_URL` before `vinext build` did *not*
 *    win: the build's env-file loading takes precedence, so `.env.local` carried
 *    `http://localhost:3001` into the artifacts while the deployment's own
 *    variables said otherwise. The refusal in `src/lib/site/origin.ts` caught it
 *    and fell back to the production origin, which is safe but wrong for staging —
 *    staging must publish staging URLs.
 *
 * 2. The build stamp. `/api/version` reporting `null` is worse than useless: it
 *    makes "the deployed Worker matches a commit" unverifiable, which is the one
 *    invariant the migration keeps.
 *
 * `.env.production.local` has higher precedence than `.env.local` in both Next's
 * and Vite's env-file order, and it is gitignored, so this is the one file a deploy
 * can own without touching developer settings or committing an origin.
 *
 * Writes only public values — origin, backend, the Stripe publishable key, commit,
 * timestamp. Never a secret: the Stripe **secret** key, the WooCommerce pair, the
 * session secrets and the Shippo token are Worker secrets and are never written here.
 *
 * ## The Stripe publishable key, for a production build
 *
 * When the origin is production this file also pins
 * `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, from `scripts/production-target.mjs` (or from
 * `DEPLOY_STRIPE_PUBLISHABLE_KEY` when a build needs to rotate it).
 *
 * Unlike the origin and the backend, this variable has a fallback that would otherwise
 * quietly take over: a developer's `.env.local`. Absent here, the build would still
 * succeed and would ship whichever key that file happens to hold — a test key, or none.
 * So it is pinned for a production origin and refused when it is not a `pk_live_` key.
 * `assert-production-config.mjs` then proves the value is actually inlined in the
 * artifact and that no `pk_test_` value is.
 *
 * ## The backend origin, for a production build
 *
 * Pass `DEPLOY_BACKEND_ORIGIN` to have this file also pin the two public backend
 * variables (`NEXT_PUBLIC_WORDPRESS_BASE_URL`, `NEXT_PUBLIC_WOOCOMMERCE_BASE_URL`).
 *
 * Production needs it because of the same inlining rule as the site origin: a
 * production build that leaves the backend to `.env.local` ships the *staging*
 * backend to the production domain, and `NEXT_PUBLIC_*` cannot be corrected after
 * the fact. Staging deliberately does not pass it — its backend comes from
 * `.env.local` and is asserted by `assert-staging-config.mjs`, so the staging build
 * is byte-for-byte what it was before this option existed.
 *
 * ## What it no longer writes
 *
 * It used to require and inject the public Supabase URL and anon key, because the
 * browser auth client read them. Nothing in the application does any more, and a
 * deploy that kept writing them would be publishing a database endpoint and a key
 * to every visitor for no reader — the exact exposure the migration set out to
 * remove. A missing Supabase configuration is no longer a deploy failure.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_ORDERS_PAUSED_PUBLIC,
  PRODUCTION_SITE_ORIGIN,
  resolveProductionStripePublishableKey,
} from './production-target.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Staging is the default because the only Worker deployed today is the staging one. */
const STAGING_ORIGIN = 'https://preview.himalayankoh.com';
const PRODUCTION_ORIGIN = PRODUCTION_SITE_ORIGIN;

const origin = (process.env.DEPLOY_SITE_ORIGIN || STAGING_ORIGIN).trim().replace(/\/+$/, '');

let parsed;
try {
  parsed = new URL(origin);
} catch {
  process.stderr.write(`DEPLOY_SITE_ORIGIN is not a URL: ${origin}\n`);
  process.exit(1);
}

const backendOrigin = (process.env.DEPLOY_BACKEND_ORIGIN || '').trim().replace(/\/+$/, '');
if (backendOrigin) {
  try {
    parsed = new URL(backendOrigin);
  } catch {
    process.stderr.write(`DEPLOY_BACKEND_ORIGIN is not a URL: ${backendOrigin}\n`);
    process.exit(1);
  }
}

// The *server-side* backend variable has to be overridden too, and it is the one
// that bites. `WORDPRESS_BASE_URL` is not a `NEXT_PUBLIC_` name, so it is never
// inlined for the browser — but it wins over the public one for every server read
// (`src/lib/backend/config.ts`), including the reads the *build* performs when it
// prerenders routes. Left in `.env.local` it pointed the production build's
// prerender at the staging store, which baked staging image URLs into the
// prerendered HTML — the exact leak `assert-production-config.mjs` refuses.
const serverBackendVars = backendOrigin
  ? [`WORDPRESS_BASE_URL=${backendOrigin}`, `WOOCOMMERCE_BASE_URL=${backendOrigin}`]
  : [];

// A production build must pin the Stripe publishable key in this file.
//
// Same inlining rule as the origin and the backend, and the same consequence if it is
// missed: `NEXT_PUBLIC_*` cannot be corrected after the build. The difference is that
// this variable has a *fallback* the others do not — a developer's `.env.local` — so
// leaving it out does not fail the build, it silently succeeds with a value nobody
// chose. That is why the key is required here for a production origin and refused here
// if it is not a live key, rather than checked later.
//
// Staging deliberately does not get it: staging's backend is not production and the
// staging Worker is where a test key belongs.
const stripePublishableKey =
  origin === PRODUCTION_ORIGIN ? resolveProductionStripePublishableKey(process.env) : '';

// The launch mode, inlined into the bundle.
//
// `publicEnv` in a client component is read at build time, so a production build that
// left this to a developer's `.env.local` would render Add to Cart buttons on a deployment
// whose routes refuse every order — the one mismatch the catalogue-only launch exists to
// prevent. Written for a production origin only; staging deliberately keeps ordering on so
// the cart and checkout can be exercised there.
const ordersPausedPublic =
  origin === PRODUCTION_ORIGIN ? PRODUCTION_ORDERS_PAUSED_PUBLIC : '';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
if (loopbackHosts.has(parsed.hostname.toLowerCase()) || parsed.hostname.endsWith('.localhost')) {
  process.stderr.write(
    `Refusing to prepare a deploy env with a loopback origin (${origin}).\n` +
      `Set DEPLOY_SITE_ORIGIN to the deployment's real origin.\n`,
  );
  process.exit(1);
}

let sha = process.env.NEXT_PUBLIC_BUILD_SHA || '';
if (!sha) {
  try {
    sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    process.stderr.write(
      'Could not read the git SHA. A deploy must be traceable to a commit, so this is fatal.\n' +
        'Run inside the repository, or pass NEXT_PUBLIC_BUILD_SHA explicitly.\n',
    );
    process.exit(1);
  }
}

const builtAt = new Date().toISOString();

const body = [
  '# Generated by scripts/prepare-deploy-env.mjs — do not commit, do not hand-edit.',
  `# Written for a build of ${sha}${origin === PRODUCTION_ORIGIN ? '' : ' (staging)'}.`,
  '# Regenerate with: npm run build:deploy',
  '',
  `NEXT_PUBLIC_SITE_URL=${origin}`,
  ...(backendOrigin
    ? [
        `NEXT_PUBLIC_WORDPRESS_BASE_URL=${backendOrigin}`,
        `NEXT_PUBLIC_WOOCOMMERCE_BASE_URL=${backendOrigin}`,
        ...serverBackendVars,
      ]
    : []),
  ...(stripePublishableKey ? [`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${stripePublishableKey}`] : []),
  ...(ordersPausedPublic ? [`NEXT_PUBLIC_ORDERS_PAUSED=${ordersPausedPublic}`] : []),
  `NEXT_PUBLIC_BUILD_SHA=${sha}`,
  `NEXT_PUBLIC_BUILD_TIME=${builtAt}`,
  '',
].join('\n');

writeFileSync(join(ROOT, '.env.production.local'), body, 'utf8');

process.stdout.write(
  `Deploy env written: origin=${origin}${backendOrigin ? ` backend=${backendOrigin}` : ''} ` +
    `${stripePublishableKey ? `stripe=${stripePublishableKey.slice(0, 8)}…(${stripePublishableKey.length} chars) ` : ''}` +
    `${ordersPausedPublic ? `ordersPaused=${ordersPausedPublic} ` : ''}` +
    `sha=${sha.slice(0, 12)} builtAt=${builtAt}\n`,
);
