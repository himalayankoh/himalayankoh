/**
 * The production deployment's fixed facts, in exactly one place.
 *
 * Every production script reads these instead of repeating a literal, because the
 * failure this migration keeps producing is a value that is right in one place and
 * stale in another: a build compiled against the staging backend, a Worker whose
 * runtime variables disagree with its bundle, a guard that asserts a hostname
 * nobody types any more. One module, imported by the build, the guard and the
 * deploy, makes drift a failing check rather than a discovery in production.
 *
 * Nothing here is a secret. Secrets are set with `wrangler secret put` and never
 * live in a tracked file — see docs/PRODUCTION-CUTOVER-PLAN.md.
 */

/** The Worker that will serve https://himalayankoh.com once the cutover is approved. */
export const PRODUCTION_WORKER_NAME = 'himalayan-koh-ecommerce-prod';

/**
 * The public storefront origin. Canonicals, JSON-LD, the sitemap, email links and
 * Stripe return URLs are all built from it, and it is inlined at build time.
 */
export const PRODUCTION_SITE_ORIGIN = 'https://himalayankoh.com';

/**
 * The WordPress/WooCommerce backend the production storefront reads and writes.
 *
 * Production may not use `https://himalayankoh.com` for this. The apex is the
 * storefront's own public origin, so a backend pointed at the apex would have the
 * Worker calling itself the moment the domain is attached — every product read, cart
 * write, admin save and media fetch would loop through the Worker and fail. It is
 * also why a new hostname is needed at all: WordPress is served today by the apex
 * (a Namecheap/shared-host account behind Cloudflare), so the backend needs a
 * hostname of its own that still reaches that same installation.
 *
 * BEFORE CUTOVER this hostname must exist and answer `/wp-json/`:
 *
 *   1. Cloudflare DNS: an `A wp` record pointing at the WordPress origin
 *      (the same target as the existing `mail` record — 162.0.209.25 at the time of
 *      writing), proxied.  OR  Cloudflare → Rules → Origin Rules: an “Override host
 *      header” rule for hostname `wp.himalayankoh.com` setting Host to
 *      `himalayankoh.com`, which removes the need for the next step.
 *   2. On the hosting account (cPanel): add `wp.himalayankoh.com` as an alias /
 *      subdomain whose document root is the WordPress installation.
 *
 * Measured 2026-10-08: the origin answers `/wp-json/` for Host `himalayankoh.com`
 * and `mail.himalayankoh.com` and answers 404 for an unknown Host, so step 2 (or the
 * Origin Rule) is what makes the new name work.
 *
 * WordPress Site URL / Home URL are deliberately NOT changed: the backend keeps
 * `https://himalayankoh.com` as its own address so nothing in WordPress, the
 * database or the existing storefront has to move.
 */
export const PRODUCTION_BACKEND_ORIGIN = 'https://wp.himalayankoh.com';

/**
 * The production **publishable** Stripe key, and the one production input that used
 * to come from a developer's laptop.
 *
 * ## Why this is committed, and why that is not a secret leak
 *
 * A publishable key is not a credential. Stripe ships it to every visitor inside the
 * page — `src/app/api/stripe/config/route.ts` serves it to the browser and
 * `src/lib/stripe/config.ts` imports it — so it is already public in the deployed
 * artifact, in DevTools, and in view-source. Stripe's own guidance is that it may be
 * committed. `scripts/check-build-secrets.mjs` reflects that by treating
 * `NEXT_PUBLIC_*` as public by intent, and `production-target.mjs` is documented as
 * carrying no secrets.
 *
 * What *was* a real defect is the shape of the previous risk: the value lived only in
 * the developer's gitignored `.env.local`, which meant
 *
 *   - `npm run build:production` on any other machine silently produced a bundle
 *     with **no** publishable key, so `/api/stripe/config` reported payments as
 *     unconfigured and the checkout rendered no card form — a payments outage that
 *     looks exactly like a Stripe problem;
 *   - a machine whose `.env.local` held a `pk_test_` key produced a production build
 *     for a `pk_live_` secret key, which `src/lib/stripe/server/configStatus.ts`
 *     exists to report as unusable.
 *
 * Naming the value here makes the production build reproducible and reviewable: it is
 * the same input on the owner's machine, on CI, and on a fresh clone. It is written
 * into `.env.production.local` by `scripts/prepare-deploy-env.mjs`, which has higher
 * precedence than `.env.local` in both Next's and Vite's env-file order, so the
 * developer's file cannot overwrite it. `assert-production-config.mjs` then proves it
 * is actually inlined in the built bundle and that no `pk_test_` value is.
 *
 * **Rotating this key is a code change**, deliberately: a key that silently differs
 * per machine is the failure this constant removes. The `sk_live_` secret key is
 * still a Worker secret and is never in this repository.
 */
export const PRODUCTION_STRIPE_PUBLISHABLE_KEY = 'pk_live_bScMJ0xIRFCAbr3IQJM5YWfY004PNn0fn2';

/**
 * Does the production storefront accept orders yet? It does not — and this constant
 * is what makes that a property of the deployment rather than of a screen.
 *
 * The storefront goes public before its payments are finished: `sk_live_` is not on
 * the Worker, no webhook endpoint exists at the apex yet, and until both are true an
 * order the storefront wrote could be charged without ever being marked paid. The
 * catalogue, the product pages and the shipping information are all fine to serve in
 * that state; taking an order is not.
 *
 * Declared here, in the overlay and in `EXPECTED_VARS`, for the same reason the
 * publishable key is: this is the switch that keeps a launch from accepting an order
 * it cannot complete, so it must not be a value that can quietly go missing. The
 * guard refuses a production artifact whose variables lost it, and the deploy reads
 * it back off the running Worker. Turning ordering on is a deliberate `'false'` in
 * two reviewed files after the Stripe webhook has been verified — never a deletion.
 */
export const PRODUCTION_ORDERS_PAUSED = 'true';

/**
 * The same fact in the one form a browser bundle can read (`NEXT_PUBLIC_ORDERS_PAUSED`).
 *
 * Derived rather than written out a second time: the server refuses an order from the
 * runtime variable and the product pages hide the cart control from this one, and if the
 * two could disagree the shop would advertise a purchase its own routes would reject.
 * `scripts/assert-production-config.mjs` requires both names in the deployed variable set
 * and checks each against these constants.
 */
export const PRODUCTION_ORDERS_PAUSED_PUBLIC = PRODUCTION_ORDERS_PAUSED;

/**
 * `pk_live_…`, and nothing else, for a production build.
 *
 * The shape check is deliberately loose about the body — Stripe has changed key
 * lengths more than once — and strict about the prefix, because the prefix is the
 * only part that decides whether the two halves of a Stripe configuration are in the
 * same mode.
 */
export function isLiveStripePublishableKey(value) {
  return typeof value === 'string' && /^pk_live_[A-Za-z0-9]{8,}$/.test(value.trim());
}

/**
 * The publishable key a production build must use.
 *
 * `DEPLOY_STRIPE_PUBLISHABLE_KEY` overrides the committed constant, so the key can be
 * rotated for one build without a commit — but a `pk_test_` value is refused either
 * way, because a production bundle carrying a test key is the mismatch
 * `configStatus.ts` reports.
 */
export function resolveProductionStripePublishableKey(env = process.env) {
  const supplied = (env.DEPLOY_STRIPE_PUBLISHABLE_KEY || '').trim();
  const value = supplied || PRODUCTION_STRIPE_PUBLISHABLE_KEY;
  if (!isLiveStripePublishableKey(value)) {
    const which = supplied ? 'DEPLOY_STRIPE_PUBLISHABLE_KEY' : 'PRODUCTION_STRIPE_PUBLISHABLE_KEY';
    throw new Error(
      `${which} is not a live Stripe publishable key. A production build must carry a pk_live_ key, ` +
        `because the production Worker holds a pk_live_/sk_live_ pair — a pk_test_ value here ships a ` +
        `checkout that cannot complete a live payment.`,
    );
  }
  return value;
}

/** Staging's backend, used by the cutover-time route work and by the guards. */
export const STAGING_BACKEND_ORIGIN = 'https://himalayankoh.com/staging';

/** Staging's public origin. */
export const STAGING_SITE_ORIGIN = 'https://preview.himalayankoh.com';

/**
 * Hostnames that must NOT be attached to anything until the owner approves the
 * cutover. The guard refuses any route or custom domain naming one of these, so the
 * pre-cutover production Worker is reachable only at its `*.workers.dev` name.
 */
export const HOLD_UNTIL_CUTOVER_HOSTS = ['himalayankoh.com', 'www.himalayankoh.com'];

/**
 * Values a production artifact must never contain. Finding one means the bundle was
 * built with the staging environment, which is the single most expensive mistake
 * available here: staging prices, staging stock and staging orders served to real
 * customers under the production domain.
 */
export const FORBIDDEN_IN_PRODUCTION_ARTIFACT = [STAGING_SITE_ORIGIN, STAGING_BACKEND_ORIGIN];

/**
 * Files under `dist/` that legitimately carry local/staging values because nothing
 * serves or uploads them. `dist/server/.dev.vars` is a copy of the developer's env
 * file that the Cloudflare plugin stages beside its generated config; the Worker's
 * assets come from `dist/client`.
 */
export const UNSERVED_ARTIFACT_FILES = new Set(['server/.dev.vars']);

/**
 * Parse a JSON-with-comments config file.
 *
 * `wrangler.jsonc` is JSONC and `jsonc-parser` is not a dependency of this project
 * (wrangler vendors its own), so comments are removed here — string-aware, because
 * every URL in the file contains `//`. The file is otherwise strict JSON: no
 * trailing commas, no single quotes. Anything this cannot parse should fail loudly,
 * which `JSON.parse` does.
 */
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}
