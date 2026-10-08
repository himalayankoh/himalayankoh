#!/usr/bin/env node
/**
 * Build the production artifact, in the order the guards can actually enforce.
 *
 *   node scripts/build-production.mjs
 *
 * `npm run build:deploy` builds for staging. This is its production sibling, and it
 * exists because three of the production steps have to happen in a specific order
 * that a shell one-liner cannot express safely:
 *
 *   1. **The deploy env first.** `NEXT_PUBLIC_*` is inlined at build time, so the
 *      origin and the backend have to be in `.env.production.local` *before* the
 *      build starts. Setting them afterwards changes nothing about the shipped
 *      bundle, which is the trap `scripts/prepare-deploy-env.mjs` was written to
 *      close.
 *   2. **The overlay after the build, before the guard.** vinext reads the staging
 *      `wrangler.jsonc`; the production name and public variables are applied to
 *      `dist/server/wrangler.json` next, and the guard reads the result back. There
 *      is no window in which an assertive deploy could pick up the staging Worker.
 *   3. **The artifact scan last.** It is the only check that can see a staging
 *      value that was compiled into the bundle, and it is only meaningful once the
 *      build is complete.
 *
 * Every step runs with the production environment exported, so none of them can
 * quietly inherit a developer's `.env.local` origin.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_BACKEND_ORIGIN, PRODUCTION_SITE_ORIGIN } from './production-target.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const env = {
  ...process.env,
  DEPLOY_SITE_ORIGIN: PRODUCTION_SITE_ORIGIN,
  DEPLOY_BACKEND_ORIGIN: PRODUCTION_BACKEND_ORIGIN,
};

function run(label, command, args) {
  process.stdout.write(`\n[build:production] ${label}\n`);
  const result = spawnSync(command, args, { cwd: ROOT, env, shell: true, stdio: 'inherit' });
  if (result.error) {
    process.stderr.write(`[build:production] ${command} could not start: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(`\n[build:production] Failed: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(
  `[build:production] origin=${PRODUCTION_SITE_ORIGIN} backend=${PRODUCTION_BACKEND_ORIGIN}\n`,
);

run('Writing the deploy env (origin, backend, commit, timestamp)', 'node', ['scripts/prepare-deploy-env.mjs']);
run('Clearing stale Next route types', 'node', ['scripts/clean-next-route-types.mjs']);
run('Building with vinext', 'npx', ['vinext', 'build']);
run('Applying the production Worker config', 'node', ['scripts/apply-production-config.mjs']);
run('Asserting the production config and artifact', 'node', ['scripts/assert-production-config.mjs']);
run('Checking that no loopback origin shipped', 'node', ['scripts/check-public-origin.mjs']);
run('Checking that no server credential shipped', 'node', ['scripts/check-build-secrets.mjs']);

process.stdout.write(
  '\n[build:production] Production artifact is ready and passed every guard.\n' +
    'It is NOT deployed and NOT attached to any hostname by this script.\n',
);
