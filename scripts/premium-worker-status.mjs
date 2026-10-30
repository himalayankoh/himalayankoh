/**
 * Read the staging Worker's deployment history and record it for a visual-artifact run.
 *
 * Credentials come from `lib/cloudflareCredentials.mjs` — the environment first, then
 * `.env.local`. This script used to `execFileSync` a helper outside the repository
 * (`../.freebuff/cf-env.mjs`), which is the dependency the deploy scripts were freed from
 * for good reason: it is untracked, undocumented, and disappears whenever the workspace is
 * tidied, taking this script with it.
 */
import { writeFileSync } from 'node:fs';
import { resolveCloudflareCredentials } from './lib/cloudflareCredentials.mjs';

const { accountId, token } = resolveCloudflareCredentials();
if (!accountId) {
  throw new Error(
    'CLOUDFLARE_ACCOUNT_ID is required to read a Worker back. Set it in the environment or in .env.local.',
  );
}

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/himalayan-koh-ecommerce`;
const res = await fetch(base + '/deployments', { headers: { Authorization: `Bearer ${token}` } });
const data = await res.json();
if (!res.ok || !data.success) throw new Error('Could not read staging deployment status: ' + res.status);
const record = { checkedAt: new Date().toISOString(), worker: 'himalayan-koh-ecommerce', deployments: data.result };
writeFileSync(`qa-visual-artifacts/premium-upgrade/${process.argv[2] || 'before'}-worker.json`, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record));
