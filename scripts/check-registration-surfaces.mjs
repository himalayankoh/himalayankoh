#!/usr/bin/env node
/**
 * Are any account-creation surfaces on the WordPress origin still open?
 *
 *   npm run check:registration
 *   npm run check:registration -- --base=https://himalayankoh.com/staging
 *
 * ## Why this is a check with an exit code
 *
 * The store's customer list grew to 2,704 accounts because two registration forms
 * were reachable by anybody and each one accepted nothing but an email address. One
 * of them (WooCommerce's My Account form) is a *setting*, and the other
 * (`wp-login.php?action=register`) is a WordPress option — both are one click in
 * wp-admin, and both can silently be turned back on by a plugin update or a
 * settings import. So the state is measured rather than remembered: this prints what
 * each surface currently does and fails while any of them would still create an
 * account.
 *
 * Read-only. Nothing here registers anything, logs in, or writes to the site.
 *
 * ## What each answer means
 *
 * | Surface | Closed means |
 * | --- | --- |
 * | WooCommerce My Account | `/my-account/` is served without `id="reg_email"` |
 * | WordPress native | `wp-login.php?action=register` is not served a `registerform` |
 * | Storefront sign-up | our own route answers its own validation, i.e. it is alive |
 *
 * The storefront route is *expected* to be open — it is how this store signs shoppers
 * up, and it is rate limited and shape-checked (`src/lib/auth/signupGuard.ts`,
 * `hk_storefront_signup_budget_check`). It is listed so a run shows all three
 * surfaces side by side rather than only the two being closed.
 */
import fs from 'node:fs';
import path from 'node:path';

const argOf = (name) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const root = process.cwd();
const envFile = path.join(root, argOf('env') || '.env.local');
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const base = (argOf('base') || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');

/**
 * The storefront origin, and only ever a real one: `.env.local` in this repository
 * points `NEXT_PUBLIC_SITE_URL` at a loopback port for local work, and checking
 * "is our own sign-up route alive" against a dev server that is not running would
 * report the one surface that must stay open as broken.
 */
const configured = argOf('storefront') || env.NEXT_PUBLIC_SITE_URL || '';
const storefront = (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(configured) ? 'https://himalayankoh.com' : configured || 'https://himalayankoh.com').replace(/\/+$/, '');
const wooAuth =
  'Basic ' +
  Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');

/**
 * The administrator application password, for the one surface that is a WordPress
 * *option* rather than a WooCommerce setting (`/wp/v2/settings`). Optional: without it
 * the run still measures everything and reports the WordPress surface as open with the
 * reason it could not be read, rather than guessing.
 */
const wpAuth =
  env.WORDPRESS_ADMIN_USER && env.WORDPRESS_ADMIN_APP_PASSWORD
    ? 'Basic ' +
      Buffer.from(
        `${env.WORDPRESS_ADMIN_USER}:${env.WORDPRESS_ADMIN_APP_PASSWORD.replace(/\s+/g, '')}`
      ).toString('base64')
    : null;

/**
 * `--apply` closes the WordPress-native surface, and nothing else.
 *
 * It is here rather than in a script of its own because the measurement and the remedy
 * are one fact about one option: a separate write tool would let the two disagree, and
 * the whole reason this file exists is that this particular setting was reported as
 * closed for a day while it was open. The rule `set-woo-setting.mjs` follows applies
 * unchanged — read the before-value, change exactly one option, read it back, and put
 * the old value somewhere a human can find it.
 */
const APPLY = process.argv.includes('--apply');
const WRITE_TIMEOUT_MS = 30_000;

/**
 * This host answers a request without its gate cookie with a small "Checking your
 * browser…" page, which contains no form and would read as "closed" if it were taken
 * at face value. `hc_js_gate` is the cookie that page's own script sets, and asking
 * with it is what a browser does after the reload.
 */
const GATE_COOKIE = 'hc_js_gate=1';

const get = async (url, headers = {}) => {
  const res = await fetch(url, { headers: { Cookie: GATE_COOKIE, ...headers }, cache: 'no-store', redirect: 'manual' });
  const body = await res.text();
  return { status: res.status, body, gated: /Checking your browser|One moment, please/.test(body), location: res.headers.get('location') };
};

const results = [];
const record = (surface, closed, detail) => results.push({ surface, closed, detail });

/* 1 — WooCommerce's My Account registration form. */
let accountSetting = null;
try {
  const res = await fetch(`${base}/wp-json/wc/v3/settings/account`, {
    headers: { Authorization: wooAuth, Cookie: GATE_COOKIE },
    cache: 'no-store',
  });
  const rows = res.ok ? await res.json() : [];
  accountSetting = Array.isArray(rows)
    ? rows.find((row) => row.id === 'woocommerce_enable_myaccount_registration')?.value ?? null
    : null;
} catch (error) {
  accountSetting = `could not be read (${error.message})`;
}

const myAccount = await get(`${base}/my-account/`);
const mcFormPresent = myAccount.body.includes('id="reg_email"') || myAccount.body.includes('woocommerce-form-register');
record(
  'WooCommerce My Account registration',
  myAccount.gated ? false : !mcFormPresent,
  myAccount.gated
    ? 'the host gate page was served instead of the page — re-run'
    : `setting woocommerce_enable_myaccount_registration=${accountSetting} · register form in the page: ${mcFormPresent}`
);

/* 2 — WordPress's own registration form. */

/** The WordPress option behind the form, read with the administrator credential. */
async function readUsersCanRegister() {
  if (!wpAuth) return { read: false, value: null, note: 'no WORDPRESS_ADMIN_USER/APP_PASSWORD' };
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/settings`, {
      headers: { Authorization: wpAuth, Cookie: GATE_COOKIE, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
    if (!res.ok) return { read: false, value: null, note: `wp/v2/settings answered HTTP ${res.status}` };
    const body = await res.json();
    return { read: true, value: body?.users_can_register ?? null, note: 'wp/v2/settings' };
  } catch (error) {
    return { read: false, value: null, note: `wp/v2/settings unreachable (${error.message})` };
  }
}

/**
 * Turn the option off, and prove it moved.
 *
 * This is the same change the storefront plugin's install step makes
 * (`hk_storefront_close_legacy_registration`), which is why it needs no filter and no
 * new endpoint: a plugin update re-applies it, and this closes the window between now
 * and that update. The old value is written under `.git/` so a revert is a recorded
 * decision rather than a guess.
 */
async function closeWordPressRegistration() {
  const before = await readUsersCanRegister();
  if (!before.read) {
    return { changed: false, error: `the option could not be read: ${before.note}` };
  }
  if (before.value === false) return { changed: false, error: null, alreadyClosed: true };

  const backup = `wp-option-users_can_register-${Date.now()}.json`;
  fs.writeFileSync(
    path.join('.git', backup),
    JSON.stringify({ origin: base, option: 'users_can_register', was: before.value }, null, 2)
  );

  const res = await fetch(`${base}/wp-json/wp/v2/settings`, {
    method: 'POST',
    headers: {
      Authorization: wpAuth,
      Cookie: GATE_COOKIE,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ users_can_register: false }),
    cache: 'no-store',
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
    return { changed: false, error: `HTTP ${res.status} writing users_can_register: ${text}`, backup };
  }

  const after = await readUsersCanRegister();
  return {
    changed: after.read && after.value === false,
    error: after.value === false ? null : `the option reads ${JSON.stringify(after.value)} after the write`,
    from: before.value,
    to: after.value,
    backup,
  };
}

/**
 * The WordPress-native surface, measured the way a browser meets it: the page, and the
 * option the page is generated from. Both are reported, because they disagreed — the
 * page served its form while a document here recorded the surface as closed.
 */
async function measureWordPressNative() {
  const page = await get(`${base}/wp-login.php?action=register`);
  const isRedirectToDisabled =
    (page.status === 301 || page.status === 302) && (page.location || '').includes('registration=disabled');
  let formPresent = page.body.includes('id="registerform"');
  let refused =
    isRedirectToDisabled ||
    /registration (is|has been) (currently )?(disabled|not allowed)|user registration is currently not allowed/i.test(
      page.body
    );

  if (!refused && (page.status === 301 || page.status === 302) && page.location) {
    const targetUrl = new URL(page.location, base).toString();
    const target = await get(targetUrl);
    if (
      /registration (is|has been) (currently )?(disabled|not allowed)|user registration is currently not allowed/i.test(
        target.body
      )
    ) {
      refused = true;
    }
  }

  const option = await readUsersCanRegister();
  if (page.gated) {
    return {
      closed: false,
      detail: 'the host gate page was served instead of the page — re-run',
      open: true,
    };
  }
  return {
    closed: !formPresent && refused,
    open: formPresent,
    detail:
      `registerform served: ${formPresent} · says registration is disabled: ${refused} · ` +
      `users_can_register: ${option.read && option.value !== null ? JSON.stringify(option.value) : isRedirectToDisabled ? 'false (redirects to registration=disabled)' : `not exposed in wp/v2/settings (${option.note || 'core default'})`}`,
  };
}

/**
 * Put the option back to the value recorded by an earlier `--apply`.
 *
 * The revert is a first-class path rather than a manual one, because the value this
 * option had before the change is only knowable from the file the write left behind —
 * and a remedy that cannot be undone on the spot is one nobody should run.
 */
async function restoreWordPressRegistration(file) {
  const name = path.basename(file);
  const full = path.join('.git', name);
  if (!fs.existsSync(full)) return { restored: false, error: `no such before-state: .git/${name}` };
  const saved = JSON.parse(fs.readFileSync(full, 'utf8'));
  const res = await fetch(`${base}/wp-json/wp/v2/settings`, {
    method: 'POST',
    headers: {
      Authorization: wpAuth,
      Cookie: GATE_COOKIE,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ users_can_register: saved.was }),
    cache: 'no-store',
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
    return { restored: false, error: `HTTP ${res.status} restoring: ${text}` };
  }
  const after = await readUsersCanRegister();
  return {
    restored: after.read && after.value === saved.was,
    error: after.value === saved.was ? null : `the option reads ${JSON.stringify(after.value)}, expected ${JSON.stringify(saved.was)}`,
    to: saved.was,
    file: `\`.git/${name}\``,
  };
}

let wpNative = await measureWordPressNative();
let wpCloseResult = null;

const restoreArg = process.argv.find((value) => value.startsWith('--restore='));
if (restoreArg && APPLY) {
  console.error('Use either --apply or --restore, not both.');
  process.exit(2);
}
if (restoreArg) {
  const outcome = await restoreWordPressRegistration(restoreArg.slice('--restore='.length));
  console.log(
    outcome.error
      ? `Restoring users_can_register failed: ${outcome.error}`
      : `users_can_register restored to ${JSON.stringify(outcome.to)} from ${outcome.file}\n`
  );
  wpNative = await measureWordPressNative();
} else if (APPLY && wpNative.open) {
  wpCloseResult = await closeWordPressRegistration();
  // Re-measured rather than assumed: the point of this file is that the page is what
  // says whether a form is being served.
  wpNative = await measureWordPressNative();
}
record('WordPress native registration', wpNative.closed, wpNative.detail);

/* 3 — our own sign-up route, which is *meant* to be reachable. */
let storefrontAnswer = 'no answer';
let storefrontAlive = false;
try {
  const res = await fetch(`${storefront}/api/auth/customer/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '', password: '' }),
    cache: 'no-store',
  });
  storefrontAnswer = `HTTP ${res.status} ${(await res.text()).slice(0, 120).replace(/\s+/g, ' ')}`;
  // An empty body is refused by the route's own validation before anything is created,
  // so a 400 here is the route being alive rather than a signup.
  storefrontAlive = res.status === 400;
} catch (error) {
  storefrontAnswer = `unreachable (${error.message})`;
}
record('Storefront sign-up (should be open)', storefrontAlive, storefrontAnswer);

/* Reporting. */
console.log(`Registration surfaces · backend ${base} · storefront ${storefront}\n`);
for (const { surface, closed, detail } of results) {
  console.log(`${closed ? 'closed  ' : 'OPEN    '} ${surface}`);
  console.log(`         ${detail}`);
}

if (wpCloseResult) {
  console.log('');
  if (wpCloseResult.error) {
    console.log(`Writing users_can_register failed: ${wpCloseResult.error}`);
    if (wpCloseResult.backup) console.log(`  before-state: .git/${wpCloseResult.backup}`);
  } else if (wpCloseResult.alreadyClosed) {
    console.log('users_can_register was already off; nothing written.');
  } else {
    console.log(
      `users_can_register: ${JSON.stringify(wpCloseResult.from)} → ${JSON.stringify(wpCloseResult.to)} ` +
        `(revert: node scripts/check-registration-surfaces.mjs --restore=${wpCloseResult.backup})`
    );
  }
}

const open = results.filter((result) => !result.closed && !/should be open/.test(result.surface));
console.log('');
if (open.length) {
  console.log(`${open.length} registration surface(s) still create accounts.`);
  console.log('  WooCommerce My Account:  node scripts/set-woo-setting.mjs --group=account \\');
  console.log('      --id=woocommerce_enable_myaccount_registration --value=no --apply');
  console.log('  WordPress native:        node scripts/check-registration-surfaces.mjs --apply');
  console.log('                           (or wp-admin → Settings → General → untick "Anyone can register")');
  console.log('                           (or upload the storefront plugin ZIP, whose install step does it)');
} else {
  console.log('No unneeded registration surface is open.');
}

process.exit(open.length ? 1 : 0);
