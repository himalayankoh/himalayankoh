#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertStagingConfig } from './assert-staging-config.mjs';
import { resolveCloudflareCredentials } from './lib/cloudflareCredentials.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Fail closed before loading credentials or contacting Cloudflare.
assertStagingConfig(JSON.parse(readFileSync(join(ROOT, 'dist/server/wrangler.json'), 'utf8')));
const preflight = spawnSync('node', ['scripts/check-build-secrets.mjs'], { cwd: ROOT, stdio: 'inherit' });
if (preflight.status !== 0) process.exit(preflight.status ?? 1);

let credentials;
try {
  credentials = resolveCloudflareCredentials();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const env = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: credentials.accountId,
  CLOUDFLARE_API_TOKEN: credentials.token,
};

const deployResult = spawnSync('npx', ['vinext-cloudflare', 'deploy', '--config', 'dist/server/wrangler.json'], {
  cwd: ROOT,
  env,
  shell: true,
  stdio: 'inherit',
});

if (deployResult.error) {
  console.error('Spawn error:', deployResult.error);
}

if (deployResult.status !== 0) {
  console.error('Deploy exited with status:', deployResult.status);
  process.exit(deployResult.status ?? 1);
}

const checkSecrets = spawnSync('node', ['scripts/check-build-secrets.mjs'], {
  cwd: ROOT,
  stdio: 'inherit',
});

process.exit(checkSecrets.status ?? 0);
