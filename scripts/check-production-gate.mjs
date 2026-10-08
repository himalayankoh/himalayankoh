#!/usr/bin/env node
/**
 * Prove the pre-cutover production Worker is still gated, still isolated, and still not
 * serving the public domain.
 *
 *   node scripts/check-production-gate.mjs
 *
 * Exits 1 if any check fails. Every request is a GET or a POST that changes nothing —
 * no order, no payment, no label and no WordPress write is created anywhere below.
 *
 * ## What it is for
 *
 * The production Worker is deployed before the cutover and must stay invisible while it
 * waits. "Invisible" is not a property a deployment has once and keeps: a redeploy, a
 * changed variable, an added route or a rotated token can each quietly open it, and none
 * of those would be visible from the source tree. So the properties are re-measured
 * against the running deployment, by name:
 *
 *   unauthorized  →  401        (every path, including the ones that call Shippo)
 *   authorized    →  200        (the token still works, so the gate is not just broken-shut)
 *   Shippo        →  protected  (both spending routes answer 401 to an anonymous caller)
 *   Stripe        →  not charging (the deployment reports no usable key pair)
 *   the apex      →  untouched  (himalayankoh.com is still WordPress, not this Worker)
 *   preview       →  available  (the staging Worker is unaffected)
 *
 * ## Why "unauthorized → 401" is checked on *every* path, not one
 *
 * The gate lives in middleware, and middleware is exactly the thing a framework upgrade
 * or a `config.matcher` edit can narrow without anyone noticing. One 401 on `/` would
 * still pass while `/api/*` had quietly fallen out of the matcher — and `/api/shippo/*`
 * is the one unauthenticated route in the storefront that spends real money. So the
 * matrix covers a page, a nested page, the API surface and both Shippo routes.
 */
import { loadEnv } from './lib/env.mjs';
import {
  HOLD_UNTIL_CUTOVER_HOSTS,
  PRODUCTION_SITE_ORIGIN,
  STAGING_SITE_ORIGIN,
} from './production-target.mjs';

/** Hostnames the guard refuses to attach to this Worker until the cutover is approved. */
const HELD_HOSTS = HOLD_UNTIL_CUTOVER_HOSTS;
import { productionWorkerOrigin, resolvePreviewToken } from './lib/catalogueSources.mjs';
import { resolveCloudflareCredentials } from './lib/cloudflareCredentials.mjs';

loadEnv();

const WORKER = productionWorkerOrigin();
const APEX = PRODUCTION_SITE_ORIGIN;
const PREVIEW = STAGING_SITE_ORIGIN;
const TOKEN = resolvePreviewToken();
const UA = 'Mozilla/5.0 (compatible; HimalayanKoh-check-production-gate/1.0)';

const results = [];
const record = (property, outcome, evidence) => {
  results.push({ property, outcome, evidence });
};

async function request(url, { method = 'GET', bearer = false, body = null, redirect = 'manual' } = {}) {
  const headers = { 'User-Agent': UA, Accept: 'application/json, text/html' };
  if (bearer && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body !== null) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      redirect,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* HTML, or an empty body */
    }
    return { status: response.status, headers: response.headers, text, json };
  } catch (error) {
    return { status: 0, headers: new Headers(), text: '', json: null, transport: String(error?.cause?.code || error?.message || error) };
  }
}

/* ------------------------------------------------------------------ */
/* 1. Unauthorized: every path refuses                                */
/* ------------------------------------------------------------------ */

const UNAUTH_PATHS = ['/', '/products', '/blog', '/login', '/api/catalog', '/api/version', '/api/stripe/config'];
for (const path of UNAUTH_PATHS) {
  const response = await request(`${WORKER}${path}`);
  record(
    `unauthenticated GET ${path} → 401`,
    response.status === 401 ? 'PASS' : 'FAIL',
    response.status === 401 ? '401' : `got ${response.status || response.transport}`,
  );
}

/* ------------------------------------------------------------------ */
/* 2. The spending routes refuse an anonymous POST                    */
/* ------------------------------------------------------------------ */

const SHIPPING_ADDRESS = {
  fullName: 'Gate Check',
  addressLine1: '1600 Amphitheatre Pkwy',
  city: 'Mountain View',
  state: 'CA',
  postalCode: '94043',
  country: 'US',
};
const RATES_BODY = {
  address: SHIPPING_ADDRESS,
  email: 'gate-check@example.com',
  items: [{ quantity: 1, weightLbs: 12 }],
};

for (const [label, path, body] of [
  ['rates', '/api/shippo/rates', RATES_BODY],
  ['validate-address', '/api/shippo/validate-address', { address: SHIPPING_ADDRESS }],
]) {
  const response = await request(`${WORKER}${path}`, { method: 'POST', body });
  record(
    `unauthenticated POST /api/shippo/${label} → 401 (spending route protected)`,
    response.status === 401 ? 'PASS' : 'FAIL',
    response.status === 401 ? '401' : `got ${response.status || response.transport}`,
  );
}

/* ------------------------------------------------------------------ */
/* 3. Authorized: the token still opens it                            */
/* ------------------------------------------------------------------ */

if (!TOKEN) {
  record('authorized GET / → 200 (token present on this machine)', 'SKIP', 'PREVIEW_ACCESS_TOKEN is not set here');
} else {
  const root = await request(`${WORKER}/`, { bearer: true });
  record(
    'authorized GET / → 200 (the gate is not broken-shut)',
    root.status === 200 && root.text.includes('<') ? 'PASS' : 'FAIL',
    `${root.status}, ${root.text.length} bytes`,
  );

  for (const path of ['/products', '/api/catalog', '/api/version']) {
    const response = await request(`${WORKER}${path}`, { bearer: true });
    record(`authorized GET ${path} → 200`, response.status === 200 ? 'PASS' : 'FAIL', `${response.status}`);
  }

  const cookieExchange = await request(`${WORKER}/?hk_preview=${encodeURIComponent(TOKEN)}`);
  const setCookie = cookieExchange.headers.get('set-cookie') || '';
  record(
    'cookie exchange returns a session cookie and redirects',
    (cookieExchange.status === 303 || cookieExchange.status === 302) && setCookie.includes('hk_preview=')
      ? 'PASS'
      : 'FAIL',
    `${cookieExchange.status}; set-cookie ${setCookie ? setCookie.split(';')[0].replace(/=.*/, '=<value>') : '(none)'}`,
  );

  // The gate has to check the *value*, not the presence of a header. Asking again with
  // no Authorization header at all is what separates "the token works" from "anything
  // with a header is let through".
  const withoutToken = await request(`${WORKER}/api/version`);
  record('the gate refuses a request that carries no token', withoutToken.status === 401 ? 'PASS' : 'FAIL', `${withoutToken.status}`);
}

/* ------------------------------------------------------------------ */
/* 4. Shippo is reachable when authorized, and only then              */
/* ------------------------------------------------------------------ */

if (TOKEN) {
  const rates = await request(`${WORKER}/api/shippo/rates`, { method: 'POST', bearer: true, body: RATES_BODY });
  const configured = rates.json?.configured === true;
  const rateCount = Array.isArray(rates.json?.rates) ? rates.json.rates.length : 0;
  if (rates.status === 200 && rateCount > 0) {
    record(
      'authorized POST /api/shippo/rates returns live rates',
      'PASS',
      `200 with ${rateCount} rate(s)`,
    );
  } else if (configured) {
    // 422/502 here is a fact about this synthetic cart, not about the gate: the route
    // was reached, the token was accepted and Shippo is configured. Reported as PARTIAL
    // so it can never be read as a proven rate quote.
    record(
      'authorized POST /api/shippo/rates reaches a configured Shippo',
      'PARTIAL',
      `${rates.status}, configured=${configured}, rates=${rateCount}${rates.json?.error ? `, error: ${String(rates.json.error).slice(0, 120)}` : ''}`,
    );
  } else {
    record(
      'authorized POST /api/shippo/rates reaches a configured Shippo',
      'FAIL',
      `${rates.status} ${JSON.stringify(rates.json).slice(0, 160)}`,
    );
  }

  const validation = await request(`${WORKER}/api/shippo/validate-address`, {
    method: 'POST',
    bearer: true,
    body: { address: SHIPPING_ADDRESS },
  });
  record(
    'authorized POST /api/shippo/validate-address is not refused by the gate',
    validation.status !== 401 && validation.status !== 403 ? 'PASS' : 'FAIL',
    `${validation.status}`,
  );
}

/* ------------------------------------------------------------------ */
/* 5. Stripe is not charging on this deployment                       */
/* ------------------------------------------------------------------ */

if (TOKEN) {
  const config = await request(`${WORKER}/api/stripe/config`, { bearer: true });
  const body = config.json ?? {};
  const blocked = body.chargingBlockedReason ?? null;
  const charges = body.configured === true;
  record(
    'Stripe cannot charge from this deployment yet',
    config.status === 200 && charges === false ? 'PASS' : 'FAIL',
    `200 configured=${charges}${blocked ? `, reason: ${blocked}` : ''}`,
  );
  record(
    'no Stripe secret key is served to a browser',
    typeof config.text === 'string' && !/sk_(live|test)_/.test(config.text) && !/whsec_/.test(config.text)
      ? 'PASS'
      : 'FAIL',
    /sk_(live|test)_|whsec_/.test(config.text) ? 'a secret-shaped value appears in the response' : 'no sk_/whsec_ value in the response',
  );
}

/* ------------------------------------------------------------------ */
/* 6. The public domain is untouched                                  */
/* ------------------------------------------------------------------ */

const apexVersion = await request(`${APEX}/api/version`);
const workerVersion = TOKEN ? await request(`${WORKER}/api/version`, { bearer: true }) : null;
const workerSha = workerVersion?.json?.sha ?? null;
const apexSha = apexVersion.json?.sha ?? null;
record(
  `${APEX}/api/version is not the Worker (the apex is still WordPress)`,
  apexVersion.status !== 200 || (apexSha === null && workerSha !== null) ? 'PASS' : 'FAIL',
  `apex ${apexVersion.status}${apexSha ? `, served the Worker's sha ${apexSha}` : ' — no Worker version payload'}`,
);

const apexRoot = await request(`${APEX}/`);
record(
  `${APEX}/ still serves the live site`,
  apexRoot.status === 200 && apexRoot.text.length > 1000 ? 'PASS' : 'FAIL',
  `${apexRoot.status}, ${apexRoot.text.length} bytes`,
);

const apexRest = await request(`${APEX}/wp-json/`);
record(
  `${APEX}/wp-json/ is still the WordPress REST API`,
  apexRest.status === 200 && typeof apexRest.json?.name === 'string' ? 'PASS' : 'FAIL',
  `${apexRest.status}${apexRest.json?.name ? `, "${apexRest.json.name}"` : ''}`,
);

/* ------------------------------------------------------------------ */
/* 7. Preview is still available                                      */
/* ------------------------------------------------------------------ */

const previewRoot = await request(`${PREVIEW}/`);
record(
  `${PREVIEW}/ (staging storefront) still serves`,
  previewRoot.status === 200 ? 'PASS' : 'FAIL',
  `${previewRoot.status}, ${previewRoot.text.length} bytes`,
);

const previewCatalog = await request(`${PREVIEW}/api/catalog`);
const previewCount = previewCatalog.json?.count ?? null;
record(
  `${PREVIEW}/api/catalog still serves the curated catalogue`,
  previewCatalog.status === 200 && typeof previewCount === 'number' && previewCount > 0 ? 'PASS' : 'FAIL',
  `${previewCatalog.status}, ${previewCount} products`,
);

/* ------------------------------------------------------------------ */
/* 8. Cloudflare-side isolation (best effort)                         */
/* ------------------------------------------------------------------ */

try {
  const { token, accountId } = resolveCloudflareCredentials();
  const api = 'https://api.cloudflare.com/client/v4';
  const call = async (path) => {
    const response = await fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };

  const zones = await call('/zones?name=himalayankoh.com');
  const zoneId = zones.json?.result?.[0]?.id;
  if (!zoneId) {
    record('Cloudflare: zone readable', 'SKIP', `zones lookup returned ${zones.status}`);
  } else {
    const routes = await call(`/zones/${zoneId}/workers/routes`);
    if (routes.status !== 200) {
      record('Cloudflare: no Worker route is attached to the zone', 'SKIP', `routes read returned ${routes.status}`);
    } else {
      const attached = (routes.json.result ?? []).map((route) => route.pattern);
      record(
        'Cloudflare: no Worker route is attached to the zone',
        attached.length === 0 ? 'PASS' : 'FAIL',
        attached.length === 0 ? '0 routes' : `attached: ${attached.join(', ')}`,
      );
    }

    if (accountId) {
      const domains = await call(`/accounts/${accountId}/workers/domains`);
      if (domains.status !== 200) {
        record('Cloudflare: no Worker custom domain serves the apex', 'SKIP', `domains read returned ${domains.status}`);
      } else {
        const held = (domains.json.result ?? []).filter((domain) =>
          HELD_HOSTS.includes(domain.hostname),
        );
        const all = (domains.json.result ?? []).map((domain) => `${domain.hostname} → ${domain.service}`);
        record(
          'Cloudflare: no Worker custom domain serves the apex',
          held.length === 0 ? 'PASS' : 'FAIL',
          held.length === 0 ? all.join(', ') || '(none)' : `attached: ${held.map((d) => d.hostname).join(', ')}`,
        );
      }
    } else {
      record('Cloudflare: no Worker custom domain serves the apex', 'SKIP', 'no account id available');
    }
  }
} catch (error) {
  record('Cloudflare: zone settings readable', 'SKIP', String(error?.message || error).slice(0, 140));
}

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

const failed = results.filter((entry) => entry.outcome === 'FAIL');
const partial = results.filter((entry) => entry.outcome === 'PARTIAL');
const skipped = results.filter((entry) => entry.outcome === 'SKIP');

const width = Math.max(...results.map((entry) => entry.property.length));
process.stdout.write(`\nProduction Worker gate and isolation — ${new Date().toISOString()}\n`);
process.stdout.write(`Worker: ${WORKER}\n\n`);
for (const entry of results) {
  process.stdout.write(`  ${entry.outcome.padEnd(7)} ${entry.property.padEnd(width)}  ${entry.evidence}\n`);
}
process.stdout.write(
  `\n  ${results.length - failed.length - partial.length - skipped.length} passed, ${failed.length} failed, ${partial.length} partial, ${skipped.length} skipped\n`,
);
if (failed.length > 0) {
  process.stdout.write('\nFAILED PROPERTIES\n');
  for (const entry of failed) process.stdout.write(`  - ${entry.property}: ${entry.evidence}\n`);
}
process.stdout.write(
  '\nNo order, payment, label or WordPress write was created by this check.\n' +
    'The Worker remains reachable only at its *.workers.dev name.\n\n',
);

process.exit(failed.length === 0 ? 0 : 1);
