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
