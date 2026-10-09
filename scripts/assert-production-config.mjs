/**
 * Refuse anything that is not the approved production deployment.
 *
 * This is the mirror of `assert-staging-config.mjs`, and it is deliberately a
 * separate guard rather than a flag on that one. The staging guard's whole value is
 * that it cannot be talked into deploying something else; loosening it so it can
 * also accept production would delete the protection it exists to provide, and the
 * two deployments have opposite requirements:
 *
 *   - staging must point at the staging backend and the preview origin;
 *   - production must point at the live backend and the production origin, and must
 *     **not** be reachable at the apex yet.
 *
 * Three checks, because the three ways this goes wrong are different:
 *
 *   1. {@link readProductionOverlay} — `wrangler.production.jsonc` agrees with
 *      `production-target.mjs`, so the declaration a human edits cannot drift from
 *      the values the build and the deployer use.
 *   2. {@link assertProductionConfig} — the artifact that is about to be uploaded
 *      (`dist/server/wrangler.json`) carries the production Worker name, exactly the
 *      production variables and nothing else, no staging origin, and no route or
 *      custom domain naming the apex. The variable set is asserted as a *set* rather
 *      than a minimum, which is what makes the launch mode part of the guard:
 *      `STOREFRONT_ORDERS_PAUSED=true` is declared in the overlay, so a build that
 *      lost it — or a build that flipped it to `false` — is refused here rather than
 *      discovered after it is taking orders.
 *   3. {@link assertProductionArtifact} — the built bundle itself was compiled for
 *      production. The variables in the config are *not* what the server code reads:
 *      `NEXT_PUBLIC_*` is inlined at build time, so a bundle built against the
 *      staging environment would ship staging prices to the production domain even
 *      with a perfect config. Only a scan of the emitted files can catch that.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  FORBIDDEN_IN_PRODUCTION_ARTIFACT,
  HOLD_UNTIL_CUTOVER_HOSTS,
  PRODUCTION_BACKEND_ORIGIN,
  PRODUCTION_ORDERS_PAUSED,
  PRODUCTION_ORDERS_PAUSED_PUBLIC,
  PRODUCTION_SITE_ORIGIN,
  PRODUCTION_STRIPE_PUBLISHABLE_KEY,
  PRODUCTION_WORKER_NAME,
  STAGING_BACKEND_ORIGIN,
  UNSERVED_ARTIFACT_FILES,
  parseJsonc,
  resolveProductionStripePublishableKey,
} from './production-target.mjs';

/** Files whose contents are code, not a rendered document or payload. */
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * Which staging values are unacceptable in a given file.
 *
 * The two values are not equivalent, and treating them as one produced a guard
 * that could never pass:
 *
 *  - **The staging backend** (`https://himalayankoh.com/staging`) is wrong
 *    anywhere. It has no innocent use in any file, and finding it means this build
 *    was programmed against the staging store.
 *  - **The staging origin** (`https://preview.himalayankoh.com`) is a real constant
 *    in `src/lib/site/origin.ts` — it is how the code names the staging deployment,
 *    and `resolveSiteOrigin` and `resolveRuntimeSiteOrigin` both reference it — so it
 *    legitimately survives into code bundles. What must never happen is that it
 *    reaches a *rendered document*, where it stops being an identifier and becomes a
 *    canonical URL, an OG tag or a sitemap entry pointing at the preview site. The
 *    plain `npm run build` scans `.next` for exactly that failure and this continues
 *    it for the deployable artifact.
 */
function forbiddenValuesFor(rel) {
  const ext = rel.slice(rel.lastIndexOf('.'));
  return CODE_EXTENSIONS.has(ext) ? [STAGING_BACKEND_ORIGIN] : FORBIDDEN_IN_PRODUCTION_ARTIFACT;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every variable a production Worker must declare, and nothing else.
 *
 * Exported because the deploy verifies the *deployed* Worker against this same map.
 * The guard proves what the file says; only a read-back from Cloudflare proves what
 * the deployment got.
 *
 * "And nothing else" is load-bearing, and so is the fact that the set is fixed: the
 * last entry is not an address but the **launch mode** (`STOREFRONT_ORDERS_PAUSED`),
 * and a set comparison is what keeps it present. A minimum-count check would let the
 * pause be deleted from the overlay and the storefront would quietly start writing
 * orders on a deployment that cannot mark them paid.
 */
export const EXPECTED_VARS = {
  NEXT_PUBLIC_SITE_URL: PRODUCTION_SITE_ORIGIN,
  NEXT_PUBLIC_DATA_SOURCE: 'woocommerce',
  NEXT_PUBLIC_WORDPRESS_BASE_URL: PRODUCTION_BACKEND_ORIGIN,
  NEXT_PUBLIC_WOOCOMMERCE_BASE_URL: PRODUCTION_BACKEND_ORIGIN,
  // The fifth variable, and the only one that is a third party's public key rather
  // than this shop's own address. It belongs here for the same reason the other four
  // do: it is inlined at build time, so a production build without it ships a
  // checkout that cannot take a card, and `assertStripePublishableKey` below is what
  // turns that from a discovery in production into a failed build.
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PRODUCTION_STRIPE_PUBLISHABLE_KEY,
  // The launch mode, in both of the forms that decide it, and neither of them is a
  // public value like the four above.
  //
  // `STOREFRONT_ORDERS_PAUSED` is read on the server, where it decides whether the
  // storefront may write an order. `NEXT_PUBLIC_ORDERS_PAUSED` is inlined into the
  // bundle, where it decides whether a product card renders a cart control at all.
  // Asserting both — each against the same constant in `production-target.mjs` — is what
  // keeps the screen and the refusal from disagreeing, and what makes the pause
  // impossible to lose from a production build. See `src/lib/storefront/ordering.ts`.
  STOREFRONT_ORDERS_PAUSED: PRODUCTION_ORDERS_PAUSED,
  NEXT_PUBLIC_ORDERS_PAUSED: PRODUCTION_ORDERS_PAUSED_PUBLIC,
};

function refuse(reason) {
  throw new Error(`Production deployment refused: ${reason}`);
}

/**
 * Read `wrangler.production.jsonc` and prove it matches `production-target.mjs`.
 *
 * The two files exist for different readers — one is the config wrangler-style
 * declaration, one is what the tooling imports — and a mismatch between them is the
 * exact drift this module is meant to prevent, so it is fatal here.
 */
export function readProductionOverlay(root = ROOT) {
  const path = join(root, 'wrangler.production.jsonc');
  if (!existsSync(path)) refuse('wrangler.production.jsonc is missing.');

  let declared;
  try {
    declared = parseJsonc(readFileSync(path, 'utf8'));
  } catch (error) {
    refuse(`wrangler.production.jsonc could not be parsed: ${error instanceof Error ? error.message : error}`);
  }

  const declaredVars = declared.vars ?? {};
  const differences = [];
  if (declared.name !== PRODUCTION_WORKER_NAME) {
    differences.push(`name is ${JSON.stringify(declared.name)}, scripts/production-target.mjs says ${PRODUCTION_WORKER_NAME}`);
  }
  for (const [key, value] of Object.entries(EXPECTED_VARS)) {
    if (declaredVars[key] !== value) {
      differences.push(`vars.${key} is ${JSON.stringify(declaredVars[key] ?? null)}, expected ${JSON.stringify(value)}`);
    }
  }
  for (const key of Object.keys(declaredVars)) {
    if (!(key in EXPECTED_VARS)) {
      differences.push(`vars.${key} is declared but is not part of the approved production variables`);
    }
  }
  if (differences.length > 0) {
    refuse(
      `wrangler.production.jsonc and scripts/production-target.mjs disagree:\n` +
        differences.map((line) => `  - ${line}`).join('\n'),
    );
  }

  return { name: PRODUCTION_WORKER_NAME, vars: { ...EXPECTED_VARS } };
}

/**
 * Guard the built Worker config — the file that is actually uploaded.
 *
 * `routes` and custom domains are checked because this deployment runs before the
 * cutover: the only reachable address must be its `*.workers.dev` name. A route for
 * the apex would move real customer traffic onto a Worker that has not been through
 * the cutover checks, which is the one thing this task must not do.
 */
export function assertProductionConfig(config) {
  if (!config || typeof config !== 'object') refuse('no Worker config was found to check.');

  if (config.name !== PRODUCTION_WORKER_NAME) {
    refuse(`the Worker is named ${JSON.stringify(config.name)} — production must be ${PRODUCTION_WORKER_NAME}.`);
  }

  const vars = config.vars ?? {};
  const varKeys = Object.keys(vars).sort();
  const expectedKeys = Object.keys(EXPECTED_VARS).sort();
  if (varKeys.join(',') !== expectedKeys.join(',')) {
    refuse(
      `the public variables are ${JSON.stringify(varKeys)} — production must declare exactly ` +
        `${JSON.stringify(expectedKeys)}. A variable carried over from another environment is how a ` +
        `staging backend reaches production customers.`,
    );
  }
  for (const [key, value] of Object.entries(EXPECTED_VARS)) {
    if (vars[key] !== value) {
      refuse(`vars.${key} is ${JSON.stringify(vars[key])}, expected ${JSON.stringify(value)}.`);
    }
  }

  const blob = JSON.stringify(vars);
  for (const forbidden of FORBIDDEN_IN_PRODUCTION_ARTIFACT) {
    if (blob.includes(forbidden)) refuse(`a staging value (${forbidden}) is present in the production variables.`);
  }

  const routes = Array.isArray(config.routes) ? config.routes : [];
  if (routes.length > 0) {
    refuse(
      `routes are configured (${JSON.stringify(routes)}). Nothing may be attached to a hostname before the ` +
        `cutover is approved; this build is meant to be reachable only at its *.workers.dev name.`,
    );
  }
  const customDomains = config.triggers?.custom_domains;
  if (Array.isArray(customDomains) && customDomains.length > 0) {
    refuse(`a custom domain is configured (${JSON.stringify(customDomains)}) but the cutover has not been approved.`);
  }
  for (const host of HOLD_UNTIL_CUTOVER_HOSTS) {
    if (JSON.stringify(config).includes(`"${host}`)) {
      refuse(`${host} appears in the Worker config, and that hostname stays on WordPress until the cutover.`);
    }
  }

  if (config.workers_dev === false) {
    refuse('workers_dev is disabled, so nothing could reach this Worker before the domain is attached.');
  }
  if (!config.main) refuse('the config has no `main`, so it is not a built Worker.');
  if (!config.assets?.directory) {
    refuse('the config has no assets directory, so it is not a built storefront.');
  }

  return true;
}

/** Walk a directory, returning file paths. Missing directories are not an error here. */
async function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    found.push(...(entry.isDirectory() ? await walk(full) : [full]));
  }
  return found;
}

/**
 * Scan the emitted artifact for staging values.
 *
 * Every file is read, not only documents: the backend origin is inlined into
 * JavaScript chunks, and a chunk is where a wrong build actually shows up. Binary
 * assets are skipped by content (a NUL byte) rather than by extension, so an `.svg`
 * or `.webmanifest` that carries a URL is still checked.
 */
export async function assertProductionArtifact(dir = join(ROOT, 'dist')) {
  const stripe = await assertStripePublishableKey(dir);
  const staging = await assertNoStagingValue(dir);
  return { ...staging, stripe };
}

/**
 * Prove the production publishable key is in the bundle, and that no test key is.
 *
 * Two directions, because both failures are real and they are not the same mistake:
 *
 *  - **A missing key** is a silent payments outage. `src/app/api/stripe/config/route.ts`
 *    reports `configured: false`, the checkout renders no card form, and the shopper
 *    sees an unavailable payment method rather than an error anyone is alerted to.
 *    The build had no way to notice, because an absent `NEXT_PUBLIC_*` is not an error
 *    to Next or Vite.
 *  - **A `pk_test_` key** on a deployment holding a live secret key is the mismatch
 *    `src/lib/stripe/server/configStatus.ts` names: the browser initialises Stripe.js
 *    in test mode, the server creates a live PaymentIntent, and the two cannot
 *    complete a payment together.
 *
 * The presence check reads the whole artifact rather than only the client-served
 * files, because the key legitimately appears in both: the browser bundle embeds it
 * and the server route serves it. Requiring it in *any* file would be satisfied by an
 * unreferenced copy, so at least one match must be a served file — that is the one a
 * visitor's browser can actually get.
 */
async function assertStripePublishableKey(dir) {
  const expected = resolveProductionStripePublishableKey();
  const files = await walk(dir);

  let occurrences = 0;
  let servedOccurrences = 0;
  const testKeys = [];

  for (const file of files) {
    const rel = relative(dir, file).split('\\').join('/');
    if (UNSERVED_ARTIFACT_FILES.has(rel)) continue;

    const info = await stat(file);
    if (info.size > 12 * 1024 * 1024) continue;

    const body = await readFile(file, 'utf8').catch(() => null);
    if (body === null || body.includes('\u0000')) continue;

    if (body.includes(expected)) {
      occurrences += 1;
      if (SERVED_ARTIFACT_PREFIXES.some((prefix) => rel.startsWith(prefix)) || rel.endsWith('.html')) {
        servedOccurrences += 1;
      }
    }
    if (/(?:^|[^\w])pk_test_[A-Za-z0-9]{6,}/.test(body)) testKeys.push(rel);
  }

  if (testKeys.length > 0) {
    refuse(
      `a Stripe TEST publishable key is compiled into ${testKeys.length} built file(s)${' '}` +
        `(${testKeys.slice(0, 5).join(', ')}${testKeys.length > 5 ? ', …' : ''}). The production Worker holds a ` +
        `live secret key, so a test publishable key in the bundle makes card checkout unable to ` +
        `complete. Rebuild with scripts/build-production.mjs.`,
    );
  }

  if (occurrences === 0) {
    refuse(
      `the production Stripe publishable key is not in the built artifact. That build would report ` +
        `payments as unconfigured and render no card form at checkout. It is written by ` +
        `scripts/prepare-deploy-env.mjs — check that the build ran through ` +
        `scripts/build-production.mjs rather than ` +
        `\`vinext build\` directly, which skips the deploy env.`,
    );
  }
  if (servedOccurrences === 0) {
    refuse(
      `the production Stripe publishable key appears only in files a browser cannot fetch, so the ` +
        `checkout's client code cannot read it. Check that the value is read through a ` +
        `NEXT_PUBLIC_ name at build time.`,
    );
  }

  return { occurrences, servedOccurrences };
}

/** True for the directories an HTTP request can reach inside the artifact. */
const SERVED_ARTIFACT_PREFIXES = ['client/', 'static/'];

async function assertNoStagingValue(dir) {
  const files = await walk(dir);
  if (files.length === 0) {
    refuse(`no build output was found in ${relative(ROOT, dir)} — run scripts/build-production.mjs first.`);
  }

  const offenders = [];
  let scanned = 0;

  for (const file of files) {
    const rel = relative(dir, file).split('\\').join('/');
    if (UNSERVED_ARTIFACT_FILES.has(rel)) continue;

    const info = await stat(file);
    if (info.size > 12 * 1024 * 1024) continue;

    const body = await readFile(file, 'utf8').catch(() => null);
    if (body === null || body.includes('\u0000')) continue;
    scanned += 1;

    const hits = forbiddenValuesFor(rel).filter((value) => body.includes(value));
    if (hits.length > 0) offenders.push({ rel, hits });
  }

  if (offenders.length > 0) {
    refuse(
      `a staging value is compiled into ${offenders.length} built file(s). This build was made with the ` +
        `staging environment, so it must not be deployed as production:\n` +
        offenders
          .slice(0, 15)
          .map(({ rel, hits }) => `  ${rel}  (${hits.join(', ')})`)
          .join('\n') +
        (offenders.length > 15 ? `\n  ...and ${offenders.length - 15} more` : '') +
        `\n\nRebuild with scripts/build-production.mjs, which writes the production origin and backend ` +
        `into .env.production.local before the build.`,
    );
  }

  return { scanned, files: files.length };
}

/** The build environment must agree with the artifact: a stale env file lies about which commit/origin it is for. */
export function assertDeployEnvFile(root = ROOT) {
  const path = join(root, '.env.production.local');
  if (!existsSync(path)) refuse('the deploy env file (.env.production.local) is missing — run scripts/prepare-deploy-env.mjs.');
  const body = readFileSync(path, 'utf8');
  if (!body.includes(`NEXT_PUBLIC_SITE_URL=${PRODUCTION_SITE_ORIGIN}`)) {
    refuse(
      `the deploy env file does not set NEXT_PUBLIC_SITE_URL=${PRODUCTION_SITE_ORIGIN}. ` +
        `Regenerate it with DEPLOY_SITE_ORIGIN=${PRODUCTION_SITE_ORIGIN}.`,
    );
  }

  // The Stripe publishable key has to be *written* by the deploy env, not inherited
  // from `.env.local`.
  //
  // This is the check that closes the real risk, and a check on the artifact alone
  // would not: if the deploy env leaves the variable out, the build still succeeds —
  // Next and Vite fall through to `.env.local`, which is a developer's file and may
  // hold a `pk_test_` key or nothing at all. So "the artifact contains a live key"
  // can be true by accident of whose laptop ran the build, while "the deploy env
  // pins the live key" cannot.
  const expectedKey = resolveProductionStripePublishableKey();
  if (!body.includes(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${expectedKey}`)) {
    refuse(
      `the deploy env file does not pin NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to the production ` +
        `publishable key. Without the line the build silently inherits whatever a developer's ` +
        `.env.local holds. Regenerate it with scripts/prepare-deploy-env.mjs (optionally with ` +
        `DEPLOY_STRIPE_PUBLISHABLE_KEY to rotate the key for one build).`,
    );
  }
  return true;
}

async function main() {
  const configPath = join(ROOT, 'dist', 'server', 'wrangler.json');
  if (!existsSync(configPath)) refuse('dist/server/wrangler.json is missing — build first.');

  readProductionOverlay();
  assertDeployEnvFile();
  assertProductionConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const artifact = await assertProductionArtifact();

  process.stdout.write(
    `Production config asserted: ${PRODUCTION_WORKER_NAME} -> ${PRODUCTION_SITE_ORIGIN} ` +
      `with backend ${PRODUCTION_BACKEND_ORIGIN}.\n` +
      `Scanned ${artifact.scanned} of ${artifact.files} built file(s); no staging value is compiled in.\n` +
      `Stripe publishable key: a live key is inlined in ${artifact.stripe.servedOccurrences} browser-served ` +
      `file(s) (${artifact.stripe.occurrences} in total) and no test key is present.\n` +
      `No route or custom domain is attached, so this Worker is reachable only at its workers.dev name.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
