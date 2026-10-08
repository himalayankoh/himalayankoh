#!/usr/bin/env node
/**
 * Deploy the production Worker — still without the production domain.
 *
 *   node scripts/deploy-production.mjs              # build, guard, deploy
 *   node scripts/deploy-production.mjs --skip-build # deploy the artifact already built
 *
 * This is the mirror of `scripts/deploy-staging.mjs` and it holds to the same
 * order, for the same reason: **guard before credentials.** Cloudflare is not
 * contacted, and no credential file is read, until the artifact has passed
 * `assert-production-config.mjs`. A guard that runs after the upload is a report,
 * not a guard.
 *
 * ## Two traps in `vinext-cloudflare deploy`, both measured the hard way
 *
 * 1. **It builds unless told not to.** `vinext-cloudflare deploy` runs its own Vite
 *    build by default, and that build *regenerates* `dist/server/wrangler.json` from
 *    the root `wrangler.jsonc` — the staging file. The first version of this script
 *    omitted `--skip-build`, so the overlay was thrown away between the guard and the
 *    upload and the deploy went to the **staging** Worker with staging variables.
 *    Hence `--skip-build`, always, once this script has already built the artifact.
 * 2. **The Worker name defaults to `package.json`'s `name`**, which is
 *    `himalayan-koh-ecommerce` — the staging Worker. So `--name` is passed
 *    explicitly, from the same constant the guard asserts, and the deployed Worker is
 *    read back afterwards to prove the name and the variables actually landed.
 *
 * What this deliberately cannot do:
 *
 *   - It cannot attach `himalayankoh.com` or `www.himalayankoh.com`. The guard
 *     refuses any route or custom domain, so the only reachable address after this
 *     deploy is the Worker's `*.workers.dev` name. Attaching the domain is a
 *     separate, owner-approved step (see docs/PRODUCTION-CUTOVER-PLAN.md).
 *   - It cannot touch the staging Worker: the name is asserted to be the production
 *     one, and the read-back fails if that name does not exist in the account.
 *   - It cannot set a secret. Secrets are set once with `wrangler secret put` and
 *     survive later deploys; a deploy script that could write them would be a
 *     script that could write a wrong one.
 *   - It does not need Zone → DNS permission. It creates no DNS record and attaches no
 *     hostname, and the read-back only asks for Workers Scripts and the account's own
 *     scripts list. The credentials come from the environment
 *     (`scripts/lib/cloudflareCredentials.mjs`) rather than a workspace helper file, so
 *     the deploy cannot be broken by a directory outside this repository.
 *   - It cannot deploy the staging Worker. The name comes from the built artifact and
 *     is asserted to be the production one.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_VARS,
  assertProductionArtifact,
  assertProductionConfig,
  readProductionOverlay,
} from './assert-production-config.mjs';
import { resolveCloudflareCredentials } from './lib/cloudflareCredentials.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_CONFIG = join(ROOT, 'dist', 'server', 'wrangler.json');

const skipBuild = process.argv.includes('--skip-build');

function fail(message, status = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(status);
}

if (!skipBuild) {
  const build = spawnSync('node', ['scripts/build-production.mjs'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) fail('The production build did not pass, so nothing was deployed.', build.status ?? 1);
} else if (!existsSync(DIST_CONFIG)) {
  fail('dist/server/wrangler.json is missing — run the build without --skip-build at least once.');
}

// Fail closed before loading credentials or contacting Cloudflare.
const built = JSON.parse(readFileSync(DIST_CONFIG, 'utf8'));
readProductionOverlay();
assertProductionConfig(built);
await assertProductionArtifact();

const preflight = spawnSync('node', ['scripts/check-build-secrets.mjs'], { cwd: ROOT, stdio: 'inherit' });
if (preflight.status !== 0) fail('The build-output secret scan failed, so nothing was deployed.', preflight.status ?? 1);

let credentials;
try {
  credentials = resolveCloudflareCredentials();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const env = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: credentials.accountId,
  CLOUDFLARE_API_TOKEN: credentials.token,
};

process.stdout.write(
  `\n[deploy:production] Deploying ${built.name} (no domain attached)\n` +
    `[deploy:production] Cloudflare credentials from ${credentials.source}\n`,
);

const deployResult = spawnSync(
  'npx',
  [
    'vinext-cloudflare',
    'deploy',
    // Never let the deploy rebuild: it would regenerate the config from the staging
    // `wrangler.jsonc` and discard the production overlay this script just asserted.
    '--skip-build',
    '--config',
    'dist/server/wrangler.json',
    // The name defaults to package.json's `name` — the staging Worker.
    '--name',
    built.name,
  ],
  { cwd: ROOT, env, shell: true, stdio: 'inherit' },
);

if (deployResult.error) process.stderr.write(`Spawn error: ${deployResult.error.message}\n`);
if (deployResult.status !== 0) fail(`Deploy exited with status ${deployResult.status}.`, deployResult.status ?? 1);

await verifyDeployedWorker(built, credentials);

const checkSecrets = spawnSync('node', ['scripts/check-build-secrets.mjs'], { cwd: ROOT, stdio: 'inherit' });
if (checkSecrets.status !== 0) fail('Post-deploy secret scan failed.', checkSecrets.status ?? 1);

process.stdout.write(
  `\n[deploy:production] ${built.name} is deployed and reachable only at its workers.dev name.\n` +
    `No DNS record was created and no custom domain was attached — himalayankoh.com is still WordPress.\n`,
);

/**
 * Read the deployed Worker back and prove it is the production one.
 *
 * The deploy's own output is not evidence: the run that went to the wrong Worker
 * printed its target clearly and still read as a success, because nothing compared
 * what was uploaded against what was intended. So the script asks Cloudflare which
 * script exists under the production name and which variables it carries, and fails
 * if the answer is not the expected one. Read-only: two GETs against the same
 * credentials the deploy already used.
 */
async function verifyDeployedWorker(config, credentials) {
  const { accountId, token } = credentials;

  // A token alone is enough to deploy, so an absent account id is a missing check
  // rather than a failed deploy. Saying so is the honest outcome: the upload happened,
  // and the claim "the deployed Worker carries the production variables" is what is
  // now unproven. It must not be reported as verified.
  if (!accountId) {
    process.stderr.write(
      `\n[deploy:production] CLOUDFLARE_ACCOUNT_ID is not set, so ${config.name} could not be read back\n` +
        `from Cloudflare. The deploy succeeded; the check that the deployed Worker carries the\n` +
        `production public variables did NOT run. Set CLOUDFLARE_ACCOUNT_ID and re-run with\n` +
        `--skip-build to complete the verification.\n`,
    );
    return;
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${config.name}/settings`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  );

  if (response.status === 404) {
    fail(
      `The deploy did not create ${config.name}. Cloudflare reports no such Worker, which is what a deploy that ` +
        `landed on a different name looks like. Check the deploy output above for the Worker it actually uploaded to.`,
    );
  }
  if (!response.ok) {
    fail(`Could not read ${config.name} back from Cloudflare (HTTP ${response.status}).`);
  }

  const body = await response.json();
  const deployedVars = Object.fromEntries(
    (body?.result?.bindings ?? [])
      .filter((binding) => binding.type === 'plain_text')
      .map((binding) => [binding.name, binding.text]),
  );

  const mismatched = Object.entries(EXPECTED_VARS).filter(([key, value]) => deployedVars[key] !== value);
  if (mismatched.length > 0) {
    fail(
      `${config.name} was deployed but its public variables are not the production ones:\n` +
        mismatched
          .map(([key, value]) => `  ${key}: deployed ${JSON.stringify(deployedVars[key] ?? null)}, expected ${JSON.stringify(value)}`)
          .join('\n'),
    );
  }

  process.stdout.write(
    `\n[deploy:production] Verified with Cloudflare: ${config.name} exists and carries the production public ` +
      `variables (${Object.keys(EXPECTED_VARS).length} checked).\n`,
  );
}
