# Production rollback runbook

Keep this open while the cutover is happening. The cutover is a **routing change**,
not a deployment and not a data change: the Next.js code, the WordPress install and
the WooCommerce database are all untouched by it. That is what makes rollback cheap
— you are putting the apex back where it was, and the store it serves is the same
store it served this morning.

Measured baseline, before anything changes (2026-10-08):

| Address | Serves | Where it points |
| --- | --- | --- |
| `himalayankoh.com` | WordPress 200 | Cloudflare (proxied) → origin `162.0.209.25`, Namecheap/shared hosting |
| `www.himalayankoh.com` | 301 → `https://himalayankoh.com/` | same origin |
| `preview.himalayankoh.com` | Worker `himalayan-koh-ecommerce` | Cloudflare Workers custom domain |
| `himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev` | Worker `himalayan-koh-ecommerce-prod` | Workers, no DNS record |

Write these three values down before touching anything, because they are what you
compare against if something looks wrong:

- the Worker version id currently serving (Cloudflare dashboard → Workers →
  `himalayan-koh-ecommerce-prod` → Deployments, or the `Current Version ID` line in
  the last `npm run deploy:production` output);
- the Cloudflare DNS record for the apex (name, type, target, proxied) exported from
  the dashboard;
- the WordPress backend hostname the Worker was built with
  (`scripts/production-target.mjs` → `PRODUCTION_BACKEND_ORIGIN`).

## Roll back

**1. Detach the domain.** Cloudflare dashboard → Workers & Pages →
`himalayan-koh-ecommerce-prod` → Settings → Domains & Routes → remove the
`himalayankoh.com` (and `www.himalayankoh.com`) custom domain / route.

Traffic returns to the existing DNS record and therefore to WordPress. This takes
effect within seconds and needs no redeploy, no code change and no build.

**2. Confirm WordPress is answering.**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://himalayankoh.com/
curl -sS https://himalayankoh.com/wp-json/ | head -c 80        # expect WordPress JSON
curl -sS -o /dev/null -w '%{http_code}\n' https://himalayankoh.com/wp-admin/
```

**3. Purge the Cloudflare cache** for the zone, so no Worker-rendered page is served
from cache under the restored origin.

**4. Check a real order path in WordPress** — WooCommerce → Orders should list what
it listed before, and the checkout should complete. If the Worker took any orders
while it was live, they were written *into WooCommerce* (the app has no order store
of its own), so they are already in the same place as every other order.

## Do not roll back by

- **Changing the DNS record's target.** Detaching the custom domain is enough, and
  a hand-edited record is how an apex ends up pointing somewhere nobody intended.
- **Redeploying anything.** The Worker's code and the WordPress code are both fine;
  only the routing changed.
- **Restoring a database backup.** Nothing in the application writes to the database
  schema. A restore would throw away orders placed after the backup for no reason.
- **Running `wrangler delete`** on the production Worker. Deleting it loses its
  secrets (three of them exist nowhere else) and makes the next attempt start from
  scratch.

## If the backend hostname is wrong

Symptom: the storefront renders but the catalogue is empty, or admin reads fail,
while the apex still answers WordPress JSON. The backend is a **runtime secret**, so
this is fixable without a rebuild for server-side reads:

```bash
cd himalayan-koh
npx wrangler secret put WORDPRESS_BASE_URL --config dist/server/wrangler.json
npx wrangler secret put WOOCOMMERCE_BASE_URL --config dist/server/wrangler.json
```

The `NEXT_PUBLIC_*` copies of those values are inlined at build time, so the two
must agree; changing only the secrets leaves browser-side reads pointed at the old
host. Rebuild (`npm run build:production`) and redeploy when they diverge.

## After a rollback

Record what you saw — the symptom, the endpoint, the timestamps — before changing
anything else. Then re-run `npm run check:production-backend` and
`npm run deploy:production` in that order; both are read-only until the deploy.
