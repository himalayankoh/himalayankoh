/**
 * The Cloudflare credentials a deploy needs, from wherever they are actually kept.
 *
 *   import { resolveCloudflareCredentials } from './lib/cloudflareCredentials.mjs';
 *   const { accountId, token, source } = resolveCloudflareCredentials();
 *
 * ## Why this exists
 *
 * Both deploy scripts used to require a workspace-level shell helper
 * (`../.freebuff/cf-env.mjs`) and hard-fail without it:
 *
 *     if (!existsSync(CF_ENV_SCRIPT)) fail('cf-env.mjs was not found …');
 *
 * That made the deploy path depend on a file outside the repository, in a directory
 * that is neither tracked nor documented — so it survived exactly until someone tidied
 * up the workspace, and then `npm run deploy:production` became unrunnable with no code
 * change to blame. That is what happened: the helper is gone and the guard refuses the
 * deploy even though working credentials are present in the environment.
 *
 * The dependency was also the wrong shape for a credential. A helper that *prints*
 * `export CLOUDFLARE_API_TOKEN=…` for `eval` puts a token into a shell's history and
 * into the process table of whatever reads it, and it lets one token stand in for
 * several. The same variables are already exported in this environment, so the honest
 * order is the environment first, the helper second, and a precise message last.
 *
 * ## Order, and why it is this order
 *
 * 1. `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` from the environment. This is
 *    also what `wrangler` itself reads, so a deploy that works here works when run by
 *    hand.
 * 2. `.env.local`, the project's own gitignored secret store — the same file
 *    `scripts/lib/env.mjs` already loads for every other script. Credentials living in
 *    the repository's own ignored file is a deliberate choice: it is one file, it is
 *    documented, and it cannot be tidied away by accident the way a helper outside the
 *    tree was.
 * 3. Fail, naming both accepted sources and the exact permissions the token needs.
 *
 * The account id is optional in an unusual but real case: `CLOUDFLARE_API_TOKEN` alone
 * is enough for `wrangler`, and the deploy only needs the account id to read the Worker
 * back. So a missing account id is reported by the caller as "deployed, not verified"
 * rather than being turned into a refusal here.
 *
 * Nothing is ever printed. The caller gets values and a `source` label to report, which
 * is enough to say where credentials came from without saying what they are.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The project's own gitignored secret store. Loaded last, and never printed. */
const LOCAL_ENV = join(ROOT, '.env.local');

/**
 * `KEY=value` pairs from `.env.local`, without touching `process.env`.
 *
 * Not `dotenv` and not `scripts/lib/env.mjs`: this resolver runs before the deploy has
 * decided anything, and silently mutating the process environment from a credential
 * lookup would hand these values to every later `spawnSync(..., { env })` in the script.
 */
function fromLocalEnvFile() {
  if (!existsSync(LOCAL_ENV)) return null;
  try {
    const found = {};
    for (const line of readFileSync(LOCAL_ENV, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i < 1) continue;
      found[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
    return found;
  } catch {
    return null;
  }
}

/**
 * The credentials to deploy with.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ accountId: string, token: string, source: 'environment' | '.env.local' }}
 * @throws when neither source supplies a token
 */
export function resolveCloudflareCredentials(env = process.env) {
  const envToken = (env.CLOUDFLARE_API_TOKEN || '').trim();
  if (envToken) {
    return { accountId: (env.CLOUDFLARE_ACCOUNT_ID || '').trim(), token: envToken, source: 'environment' };
  }

  const local = fromLocalEnvFile();
  const localToken = (local?.CLOUDFLARE_API_TOKEN || '').trim();
  if (localToken) {
    return {
      accountId: (env.CLOUDFLARE_ACCOUNT_ID || local?.CLOUDFLARE_ACCOUNT_ID || '').trim(),
      token: localToken,
      source: '.env.local',
    };
  }

  throw new Error(
    'No Cloudflare API token found. Set CLOUDFLARE_API_TOKEN in the environment (that is what\n' +
      'wrangler reads too) or in .env.local. Both are accepted; neither is printed.\n' +
      'The token needs, on the himalayankoh.com zone and this account:\n' +
      '  Account → Workers Scripts → Edit   (upload the Worker)\n' +
      '  Account → Workers Scripts → Read   (read it back after the deploy)\n' +
      '  Zone    → Workers Routes  → Read   (prove no route was attached)\n' +
      'It does NOT need Zone → DNS → Edit: this deployment attaches no hostname.',
  );
}
