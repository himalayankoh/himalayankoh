#!/usr/bin/env node
/**
 * Change exactly one WooCommerce setting, by name, with the rest of the group read back.
 *
 *   node scripts/set-woo-setting.mjs --group=account --id=woocommerce_enable_myaccount_registration --value=no
 *   node scripts/set-woo-setting.mjs --group=account --id=woocommerce_enable_myaccount_registration --value=no --apply
 *
 * ## Why this exists rather than a curl
 *
 * A settings group is replaced wholesale by a naive write: one key against a group
 * endpoint can reset its siblings. So this script fetches the current group, prints
 * the single option it will change, writes **only that option** through the
 * per-option route, then re-reads the whole group and asserts that every *other*
 * option is byte-identical. If any sibling moved, it says so and names it — a
 * settings write that silently reset five options is how a store loses guest
 * checkout.
 *
 * ## Why it asks the site which methods exist
 *
 * An earlier run of this change reported the store's registration setting as
 * impossible to change over the API, because the write answered
 * `404 rest_no_route`. Nothing was wrong with the credentials: on this store
 * `/wc/v3/settings/account` is registered **GET only**, and the route that accepts a
 * write is the per-option one, `/wc/v3/settings/account/<id>` (measured with OPTIONS:
 * `GET, POST, PUT, PATCH`). So the method is discovered here rather than assumed, and
 * a `rest_no_route` can only now mean something this script has already ruled out.
 *
 * `--apply` is required to write. Nothing else in the environment is touched, and
 * the before-state is recorded under `.git/` so a revert is a recorded decision.
 */

import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const argOf = (name) => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const group = (argOf('group') || '').trim();
const id = (argOf('id') || '').trim();
const value = argOf('value');

if (!group || !id || value === null) {
  throw new Error('Required: --group=<settings group> --id=<option id> --value=<new value>.');
}

const envFile = argOf('env') || '.env.local';
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = (argOf('base') || env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const auth = 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
const api = `${BASE}/wp-json/wc/v3/settings/${group}`;
const apiOne = `${api}/${id}`;

async function call(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  return { res, text };
}

async function request(method = 'GET', body) {
  const { res, text } = await call(api, method, body);
  if (!res.ok) throw new Error(`WooCommerce HTTP ${res.status} for settings/${group}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** The methods the site actually registered for a route. OPTIONS writes nothing. */
async function allowedMethods(url) {
  const res = await fetch(url, { method: 'OPTIONS', headers: { Authorization: auth }, cache: 'no-store' });
  return (res.headers.get('allow') || '').split(',').map((m) => m.trim().toUpperCase()).filter(Boolean);
}

/**
 * Writes one option, through whichever write method this store registers for the
 * per-option route. Returns the method used, so the log can say how it was done.
 */
async function writeOption(value) {
  const methods = await allowedMethods(apiOne);
  const method = ['PUT', 'PATCH', 'POST'].find((candidate) => methods.includes(candidate));
  if (!method) {
    throw new Error(
      `This store registers no write method on ${apiOne} (Allow: ${methods.join(', ') || 'none'}). Nothing was written.`
    );
  }

  const { res, text } = await call(apiOne, method, { value: String(value) });
  if (!res.ok) throw new Error(`WooCommerce HTTP ${res.status} writing ${id} with ${method}: ${text.slice(0, 200)}`);
  return method;
}

/** Every option's value, keyed by id — what "nothing else moved" is measured against. */
const snapshot = (rows) => Object.fromEntries(rows.map((r) => [r.id, String(r.value ?? '')]));

const before = await request();
if (!Array.isArray(before)) throw new Error(`settings/${group} did not answer a list.`);

const current = before.find((row) => row.id === id);
if (!current) throw new Error(`settings/${group} has no option "${id}".`);

const beforeMap = snapshot(before);
console.log(
  JSON.stringify(
    { mode: APPLY ? 'apply' : 'dry run', origin: BASE, group, option: id, from: String(current.value ?? ''), to: value, optionsInGroup: before.length },
    null,
    2
  )
);

const alreadySet = String(current.value ?? '') === String(value);
if (alreadySet) {
  console.log(`\n${id} is already "${value}". Nothing written.`);
} else if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to write this one option.');
} else {
  const backupFile = `.git/woo-setting-${group}-${id}-${Date.now()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify({ origin: BASE, group, id, value: String(current.value ?? '') }, null, 2));

  const method = await writeOption(value);

  const after = await request();
  const afterMap = snapshot(after);
  const drifted = Object.keys(beforeMap).filter((key) => beforeMap[key] !== afterMap[key]);
  const target = afterMap[id];

  console.log(
    JSON.stringify(
      {
        wrote: { group, option: id, from: beforeMap[id], to: target },
        method,
        backup: backupFile,
        changedOptions: drifted,
        onlyTheTargetMoved: drifted.length === 1 && drifted[0] === id,
      },
      null,
      2
    )
  );

  if (drifted.length > 1) {
    throw new Error(`Other options in settings/${group} changed: ${drifted.filter((k) => k !== id).join(', ')}. Reverting is in ${backupFile}.`);
  }
  if (target !== String(value)) throw new Error(`${id} is "${target}" after the write, expected "${value}".`);
}
