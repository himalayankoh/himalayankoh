#!/usr/bin/env node
/**
 * Install and activate the Himalayan Koh WordPress plugins on a WordPress site.
 *
 * Why this exists: WordPress REST can install plugins only from the wordpress.org
 * directory — there is no route that accepts a local ZIP. Uploading through wp-admin is
 * the supported path for a private plugin, so this script drives that form the way a
 * person would: log in, upload each ZIP, activate.
 *
 * Credentials (never printed, never passed in an argument list — form bodies go to curl
 * through a --config file so they cannot appear in `ps` or in an error message):
 *
 *   WORDPRESS_ADMIN_USER      administrator login name
 *   WORDPRESS_ADMIN_PASSWORD  that user's password        (wp-login requires the real
 *                                                          password; an application
 *                                                          password only works for REST)
 *
 *   falls back to <repo>/../.freebuff/owner-secrets.local  WP_ADMIN_USER / WP_ADMIN_PASS
 *
 * Usage:
 *   npm run wp:install-plugins                         # build the ZIPs, install + activate
 *   npm run wp:install-plugins -- --dry                # report the current plugin state only
 *   npm run wp:install-plugins -- --update hk-wholesale  # replace an installed plugin in place
 *
 * Idempotent: a plugin already installed is skipped rather than re-uploaded (a second
 * upload collides with the existing folder), and an active plugin is left alone.
 *
 * `--update <slug>` is the exception, and it exists because "already installed" is not
 * the same as "up to date": WordPress exposes no REST route that replaces a private
 * plugin's files, so the only way to ship a fix to an installed plugin is to upload the
 * new ZIP over the old one with `overwrite=update-plugin`. It is opt-in per slug — never
 * a silent overwrite of a plugin someone may have edited on the server.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const SECRETS = resolve(PROJECT, '../.freebuff/owner-secrets.local');
const WORK = resolve(PROJECT, '.freebuff');
const JAR = resolve(WORK, 'wp-admin-cookies.txt');
const CONF = resolve(WORK, 'wp-admin-request.conf');
const UA = 'Mozilla/5.0 (compatible; HimalayanKoh-plugin-installer/1.0)';

const DRY = process.argv.includes('--dry');
/** `--update <slug>`: re-upload this plugin's artifact over the installed copy. */
const UPDATE_SLUG = (() => {
  const index = process.argv.indexOf('--update');
  return index > -1 ? String(process.argv[index + 1] || '').trim() : '';
})();

const PLUGINS = [
  { slug: 'himalayan-koh-storefront', version: '1.5.1' },
  { slug: 'himalayan-koh-leados', version: '1.0.0' },
  { slug: 'hk-wholesale', version: '1.1.0' },
];

function credentials() {
  const fromFile = {};
  if (existsSync(SECRETS)) {
    for (const line of readFileSync(SECRETS, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) fromFile[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  const base = (
    process.env.WORDPRESS_BASE_URL
    || fromFile.WP_STAGING_BASE
    || 'https://himalayankoh.com/staging'
  ).replace(/\/+$/, '');
  return {
    base,
    user: process.env.WORDPRESS_ADMIN_USER || process.env.WP_ADMIN_USER || fromFile.WP_ADMIN_USER || '',
    password: process.env.WORDPRESS_ADMIN_PASSWORD || process.env.WP_ADMIN_PASS || fromFile.WP_ADMIN_PASS || '',
  };
}

const decode = (html) => html.replace(/&#0?38;|&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'");
const escapeConf = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function curl(args) {
  return execFileSync(
    'curl',
    ['-sS', '--max-time', '90', '-A', UA, '-b', JAR, '-c', JAR, ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
}

/**
 * The host's rate limiter answers with a small interstitial page ("One moment,
 * please...") that reloads itself after five seconds.
 *
 * A browser executes that reload and never notices. `curl` cannot, so a burst of
 * requests — log in, read the plugin list, fetch the upload nonce, post the ZIP, read
 * the list again — ends with this page where an admin screen was expected, and the
 * installer used to report that as "unclear result". Pacing the requests and retrying
 * the way the page itself asks to be retried is the whole fix: nothing here bypasses
 * anything, it just stops hammering.
 */
const INTERSTITIAL = /One moment, please|<title>\s*Loader\s*<\/title>/i;
const RETRY_WAIT_MS = 7000;
const MAX_TRIES = 6;

const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`], { stdio: 'ignore' });

/** A page load that waits out the rate limiter instead of misreading it as content. */
function curlPage(url, { attempts = MAX_TRIES } = {}) {
  let body = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    body = curl([url]);
    if (!INTERSTITIAL.test(body)) return body;
    if (attempt < attempts) {
      console.log(`    rate limited (attempt ${attempt}/${attempts}) — waiting ${RETRY_WAIT_MS / 1000}s`);
      sleep(RETRY_WAIT_MS);
    }
  }
  return body;
}

/** POST form fields via a curl config file, so no value lands in the command line. */
function postForm(url, fields, outputFile) {
  writeFileSync(
    CONF,
    [...Object.entries(fields).map(([key, value]) => `data-urlencode = "${escapeConf(key)}=${escapeConf(value)}"`), ''].join('\n'),
  );
  try {
    return curl(['-L', '-o', outputFile, '-w', '%{url_effective}', '-K', CONF, url]);
  } finally {
    rmSync(CONF, { force: true });
  }
}

function logIn({ base, user, password }) {
  curlPage(`${base}/wp-login.php`);
  const landed = postForm(`${base}/wp-login.php`, {
    log: user,
    pwd: password,
    'wp-submit': 'Log In',
    redirect_to: `${base}/wp-admin/`,
    testcookie: '1',
  }, resolve(WORK, 'wp-login-response.html'));

  const body = readFileSync(resolve(WORK, 'wp-login-response.html'), 'utf8');
  const failed = /login_error/.test(body) || /<form[^>]*id="loginform"/.test(body);
  if (failed) {
    console.log('login: FAILED — the site returned the login form with an error');
    return false;
  }
  console.log('login: OK');

  // WordPress gates wp-admin behind "confirm your admin email" for a new admin address.
  if (/confirm_admin_email/.test(landed)) dismissEmailInterstitial(landed);
  return true;
}

function dismissEmailInterstitial(url) {
  const page = curl([url]);
  const form = page.match(/<form[^>]*confirm-admin-email[\s\S]*?<\/form>/i)?.[0] || '';
  const action = decode(form.match(/<form[^>]*action="([^"]*)"/)?.[1] || '');
  const fields = {};
  for (const match of form.matchAll(/<input[^>]*>/g)) {
    const name = match[0].match(/name="([^"]+)"/)?.[1];
    if (!name || /type="submit"/.test(match[0])) continue;
    fields[name] = decode(match[0].match(/value="([^"]*)"/)?.[1] || '');
  }
  const submit = form.match(/<input[^>]*type="submit"[^>]*name="([^"]+)"/)?.[1];
  if (!action || !Object.keys(fields).length) {
    console.log('admin-email interstitial: form not recognised — dismiss it in wp-admin');
    return;
  }
  if (submit) fields[submit] = "It's correct";
  const landed = postForm(action, fields, resolve(WORK, 'wp-interstitial.html'));
  console.log(`admin-email interstitial: ${/confirm_admin_email/.test(landed) ? 'still shown' : 'dismissed'}`);
}

function pluginRows(base) {
  const html = curlPage(`${base}/wp-admin/plugins.php`);
  if (!/data-plugin=/.test(html)) {
    const marks = ['loginform', 'login_error', 'confirm_admin_email', 'not allowed', 'sufficient permissions']
      .filter((marker) => html.includes(marker));
    console.log(`cannot read the plugin list (${html.length} bytes) — page markers: ${marks.join(', ') || 'none'}`);
    return null;
  }
  return (html.match(/<tr[^>]*data-plugin="[^"]+"[\s\S]*?<\/tr>/g) || []).map((row) => ({
    slug: row.match(/data-plugin="([^"]+)"/)?.[1] || '?',
    name: row.match(/<strong>([^<]+)<\/strong>/)?.[1] || '',
    active: /Deactivate/.test(row),
  }));
}

function uploadZip({ slug, version }, base, { overwrite = false } = {}) {
  // The artifact is `deploy/<slug>.zip`: WordPress wraps a single-file package in a
  // folder named after that file, so the destination folder is the plugin slug — and a
  // version in the filename would become a second, version-named copy of the plugin
  // (see scripts/pack-plugins.mjs).
  const zip = resolve(PROJECT, 'deploy', `${slug}.zip`);
  if (!existsSync(zip)) return `artifact missing (${zip}) — run npm run pack:plugins`;
  const page = curlPage(`${base}/wp-admin/plugin-install.php?tab=upload`);
  const nonce = page.match(/name="_wpnonce" value="([^"]+)"/)?.[1];
  if (!nonce) return 'no upload nonce — not authorised to install plugins';
  // The upload itself is the one request that cannot be retried blindly (a second POST
  // would be a second upload), so it goes out after the nonce was read cleanly above.
  sleep(1500);
  const out = resolve(WORK, 'wp-upload-result.html');
  // `overwrite=update-plugin` is what the "Replace current with uploaded" button on the
  // upload screen sends: without it WordPress refuses the upload because the destination
  // folder exists, and with it the folder is replaced rather than duplicated.
  const target = `${base}/wp-admin/update.php?action=upload-plugin${overwrite ? '&overwrite=update-plugin' : ''}`;
  // The headers a browser sends with this form. They are not a disguise: the form on
  // wp-admin sends exactly these, and a host WAF that expects them treats a bare
  // multipart POST as a bot. LiteSpeed (this host) answers 403 without them.
  curl([
    '-L', '-o', out, '-w', '%{http_code}',
    '-H', `Referer: ${base}/wp-admin/plugin-install.php?tab=upload`,
    '-H', `Origin: ${base}`,
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '-F', `pluginzip=@${zip}`,
    '-F', `_wpnonce=${nonce}`,
    '-F', `install-plugin-submit=${overwrite ? 'Replace current with uploaded' : 'Install Now'}`,
    target,
  ]);
  const body = readFileSync(out, 'utf8');
  // Success is checked **first**. The result page is a full wp-admin screen carrying
  // dozens of unrelated notices (this site has plenty), so scanning it for a failure
  // word finds one whether or not the upload worked — which is exactly how a successful
  // 1.1.0 update was once reported as "rejected".
  if (/Plugin installed successfully|Successfully installed|Plugin updated successfully|Updated successfully/i.test(body)) {
    return overwrite ? 'replaced in place' : 'installed';
  }
  if (/403 Forbidden|Access to this resource on the server is denied/i.test(body)) {
    return 'blocked by the host WAF (HTTP 403 from LiteSpeed) — upload this ZIP through wp-admin in a browser';
  }
  if (/Destination folder already exists/i.test(body)) {
    return 'the plugin folder already exists — re-run with --update <slug> to replace it in place';
  }
  if (/Plugin install failed|not allowed to upload/i.test(body)) {
    return `rejected: ${body.match(/<p>([^<]*(?:failed|not allowed)[^<]*)<\/p>/i)?.[1] || 'see wp-upload-result.html'}`;
  }
  if (overwrite) {
    // An overwrite that reported nothing may have removed the old folder without
    // installing the new file, so the outcome is stated rather than summarised.
    return `not confirmed — check whether ${slug} is still active before assuming either way (see wp-upload-result.html)`;
  }
  return 'unclear result';
}

function activate(slug, base, rows) {
  const row = rows.find((candidate) => candidate.slug.startsWith(`${slug}/`));
  if (!row) return 'not installed';
  if (row.active) return 'already active';
  const html = curlPage(`${base}/wp-admin/plugins.php`);
  const link = decode(
    (html.match(/<tr[^>]*data-plugin="[^"]+"[\s\S]*?<\/tr>/g) || [])
      .find((candidate) => candidate.includes(`${slug}/`))
      ?.match(/href="([^"]*action=activate[^"]*)"/)?.[1] || '',
  );
  if (!link) return 'no activation link';
  const absolute = link.startsWith('http') ? link : `${base}${link.startsWith('/') ? '' : '/wp-admin/'}${link}`;
  curl([absolute]);
  return 'activation requested';
}

const creds = credentials();
console.log(`site: ${creds.base}`);
if (!creds.user || !creds.password) {
  console.log('credentials: absent — set WORDPRESS_ADMIN_USER / WORDPRESS_ADMIN_PASSWORD, or place them in ../.freebuff/owner-secrets.local');
  process.exit(1);
}
console.log(`credentials: present (user configured: ${Boolean(creds.user)})`);

mkdirSync(WORK, { recursive: true });

if (!logIn(creds)) process.exit(1);

let rows = pluginRows(creds.base);
if (!rows) process.exit(1);

const report = () => {
  const hk = rows.filter((row) => /himalayan/i.test(row.slug) || /himalayan/i.test(row.name));
  console.log(`plugins on site: ${rows.length} · HK: ${hk.map((row) => `${row.slug}(${row.active ? 'active' : 'inactive'})`).join(' ') || 'none'}`);
};
report();

if (DRY) {
  console.log('dry run — no upload performed');
} else {
  // Only the named slug is touched when updating: an opt-in update must not also
  // install every plugin that happens to be missing from the site.
  const targets = UPDATE_SLUG ? PLUGINS.filter((plugin) => plugin.slug === UPDATE_SLUG) : PLUGINS;
  if (UPDATE_SLUG && !targets.length) {
    console.log(`--update ${UPDATE_SLUG}: not one of the packaged plugins (${PLUGINS.map((p) => p.slug).join(', ')})`);
    process.exit(1);
  }
  for (const plugin of targets) {
    // A folder that merely *contains* the slug counts as installed: this site has
    // `himalayan-koh-storefront-1/himalayan-koh-storefront.php` active, and re-uploading
    // the ZIP would collide with it — and spend a request the host may simply refuse.
    const installed = rows.some((row) => row.slug.includes(plugin.slug));
    if (installed && UPDATE_SLUG !== plugin.slug) {
      console.log(`${plugin.slug}: already installed, upload skipped`);
      continue;
    }
    const overwrite = UPDATE_SLUG === plugin.slug && installed;
    console.log(`${plugin.slug}: ${uploadZip(plugin, creds.base, { overwrite })}`);
  }
  rows = pluginRows(creds.base) || [];
  for (const plugin of targets) {
    console.log(`${plugin.slug}: ${activate(plugin.slug, creds.base, rows)}`);
  }
  rows = pluginRows(creds.base) || rows;
  report();
}

const namespaces = (() => {
  try {
    return (JSON.parse(curlPage(`${creds.base}/wp-json/`)).namespaces || []).filter((ns) =>
      /hk-storefront|crm|hk-wholesale/.test(ns)
    );
  } catch {
    // The interstitial is HTML, so this is also the answer when the site is throttling
    // us: say so rather than printing an empty list that looks like "no plugins".
    return null;
  }
})();
if (namespaces === null) {
  console.log('REST namespaces: could not be read (the host was still rate limiting) — re-run to confirm');
} else {
  console.log(`REST namespaces published: ${namespaces.join(', ') || 'none'}`);
}
