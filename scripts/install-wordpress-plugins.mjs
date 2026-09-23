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
 *   npm run wp:install-plugins             # build the ZIPs, then install + activate
 *   npm run wp:install-plugins -- --dry    # report the current plugin state only
 *
 * Idempotent: a plugin already installed is skipped rather than re-uploaded (a second
 * upload collides with the existing folder), and an active plugin is left alone.
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

const PLUGINS = [
  { slug: 'himalayan-koh-storefront', version: '1.5.1' },
  { slug: 'himalayan-koh-leados', version: '1.0.0' },
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
  curl([`${base}/wp-login.php`]);
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
  const html = curl([`${base}/wp-admin/plugins.php`]);
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

function uploadZip({ slug, version }, base) {
  // The artifact is `deploy/<slug>.zip`: WordPress names the destination folder
  // after the uploaded filename, so a version in the name becomes a second,
  // version-named copy of the plugin (see scripts/pack-plugins.mjs).
  const zip = resolve(PROJECT, 'deploy', `${slug}.zip`);
  if (!existsSync(zip)) return `artifact missing (${zip}) — run npm run pack:plugins`;
  const page = curl([`${base}/wp-admin/plugin-install.php?tab=upload`]);
  const nonce = page.match(/name="_wpnonce" value="([^"]+)"/)?.[1];
  if (!nonce) return 'no upload nonce — not authorised to install plugins';
  const out = resolve(WORK, 'wp-upload-result.html');
  curl([
    '-L', '-o', out,
    '-F', `pluginzip=@${zip}`,
    '-F', `_wpnonce=${nonce}`,
    '-F', 'install-plugin-submit=Install Now',
    `${base}/wp-admin/update.php?action=upload-plugin`,
  ]);
  const body = readFileSync(out, 'utf8');
  if (/Plugin install failed|Destination folder already exists|not allowed to upload/i.test(body)) {
    return `rejected: ${body.match(/<p>([^<]*(?:failed|already exists|not allowed)[^<]*)<\/p>/i)?.[1] || 'see wp-upload-result.html'}`;
  }
  if (!/Plugin installed successfully|Successfully installed/i.test(body)) return 'unclear result';
  return 'installed';
}

function activate(slug, base, rows) {
  const row = rows.find((candidate) => candidate.slug.startsWith(`${slug}/`));
  if (!row) return 'not installed';
  if (row.active) return 'already active';
  const html = curl([`${base}/wp-admin/plugins.php`]);
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
  for (const plugin of PLUGINS) {
    if (rows.some((row) => row.slug.startsWith(`${plugin.slug}/`))) {
      console.log(`${plugin.slug}: already installed, upload skipped`);
      continue;
    }
    console.log(`${plugin.slug}: ${uploadZip(plugin, creds.base)}`);
  }
  rows = pluginRows(creds.base) || [];
  for (const plugin of PLUGINS) {
    console.log(`${plugin.slug}: ${activate(plugin.slug, creds.base, rows)}`);
  }
  rows = pluginRows(creds.base) || rows;
  report();
}

const namespaces = (() => {
  try {
    return (JSON.parse(curl([`${creds.base}/wp-json/`])).namespaces || []).filter((ns) => /hk-storefront|crm/.test(ns));
  } catch {
    return [];
  }
})();
console.log(`REST namespaces published: ${namespaces.join(', ') || 'none'}`);
