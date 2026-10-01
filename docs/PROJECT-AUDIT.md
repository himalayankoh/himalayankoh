# Himalayan Koh — project audit

Date: 2026-10-01
Auditor: Codebuff (Buffy), at the owner's request
Scope: the active repository as it stands today — architecture, repository
state, quality gates, security posture, known defects, and next actions.
Status: **read-only findings.** Nothing in this audit changed production, and the
production migration it references is *held* on the owner's instruction.

---

## 1. What this project is

A Next.js storefront + admin console for Himalayan Koh, deployed as a **Cloudflare
Worker** and reading a **WordPress / WooCommerce** backend. WordPress is the retail
source of truth; the Worker serves the shopper-facing pages and the `/admin`
console, and calls the WooCommerce REST API for products, orders, customers and
media.

| Layer | Technology |
| --- | --- |
| Frontend + admin | Next.js (App Router) + React, rendered on Cloudflare Workers |
| Deployment | Cloudflare Worker `himalayan-koh-ecommerce` (staging: `preview.himalayankoh.com`) |
| Commerce backend | WordPress / WooCommerce at `https://himalayankoh.com/staging` |
| Payments | Stripe |
| Shipping | Shippo (labels) + WooCommerce shipping metadata |
| Caching | Cloudflare edge cache for rendered public pages; commerce data never cached |

Supabase is **historical only** — `.env.example` still lists Supabase variable names
and some archive files remain, but no runtime path resolves Supabase configuration.
This matches the intended direction but is worth a later cleanup pass.

Scale: **~433 source files**, **126 API routes**, **143 test files**.

---

## 2. Repository state (verified today)

| Item | Value |
| --- | --- |
| Local path | `C:\Users\basco\Downloads\hk\himalayan-koh` |
| Active remote (`origin`) | `https://github.com/himalayankoh/himalayankoh.git` |
| Reference remote (`old-origin`) | `https://github.com/salmanbashir80/himalayan-koh.git` |
| Branch | `integration/cloudflare-workers-migration` |
| HEAD | `026ef35` |
| In sync with `origin`? | **Yes** — `0` ahead, `0` behind after fetch |
| Working tree | Clean except two **untracked, non-repo** files (see §7) |

### Git history vs. the project's own rules
`AGENTS.md` states the old repository is `8002salman-ai/himalayan-koh`. The actual
configured `old-origin` is `salmanbashir80/himalayan-koh` (the account appears to
have been renamed). **Finding F7** below. No development has been pushed to
`old-origin`.

---

## 3. Quality gates (verified today)

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | **0 errors** |
| Lint | `npm run lint` | **0 errors** (only pre-existing `no-img-element` / unused-var warnings) |
| Tests | `npx vitest run` | **1537 passed**, 19 skipped, across 143 files |
| Build | `npm run build:deploy` | **Clean** — no loopback origin, no server secret in output |

The 19 skipped tests are live-store **integration** tests (`BACKEND_INTEGRATION=1`),
which refuse to run unless the configured backend is the staging install. That guard
is correct and should stay.

Build-output guardrails already in place and passing:
- `scripts/check-public-origin.mjs` — fails the build if a loopback URL is inlined.
- `scripts/check-build-secrets.mjs` — fails the build if a server-side credential
  value leaks into `dist/`.
- `scripts/assert-staging-config.mjs` — refuses to deploy anything that is not the
  staging Worker/origin/backend.

---

## 4. Security posture

| Check | Result |
| --- | --- |
| Secrets tracked in git? | **No.** Only `.env.example` (names, no values) is tracked. |
| `.env`, `.env.*`, `.dev.vars` ignored? | **Yes** (`.gitignore` lines 2–4, 19, 34–35). |
| Hard-coded live secrets in `src/`? | **None found.** `sk_test_`/`sk_live_` matches are placeholders and test sentinels. |
| Admin auth | WordPress application password → signed, expiring bearer session (`ADMIN_SESSION_SECRET`). Role comes from a server-signed token, never a browser flag. |
| Admin API routes | Guarded by `verifyAdminRequest`; verified live returning `401` unauthenticated. |
| Media download route | Same-origin fetch guard, size cap, admin-guarded. |
| Media delete | **Fails closed** — refuses (409/503) rather than deleting when the product list cannot be read. |

The clearest standing risk is **secret hygiene at cutover**: `ADMIN_SESSION_SECRET`
must be *new* in production, or a staging-issued admin token would validate against
production. This is called out in §6 and in the cutover plan.

---

## 5. Defects found and fixed in the current working period

These are recorded because each was a **real** wrong answer, not a cosmetic issue.

1. **Order trash moved nothing.** `trashWooOrders` wrote `status: 'trash'`, which
   WooCommerce rejects with `rest_invalid_param: Invalid parameter(s): status` —
   while the API still reported success. Fixed to a plain `DELETE` without `force`
   (the store's only reversible move).
2. **Order restore damaged a real order.** Order **1627** was `delivered`; the
   restore could not find a remembered state and fell back to `pending`. Repaired to
   `delivered` (verified) and the restore now **refuses** rather than guessing.
3. **Orders tab did not reload.** The loader was keyed on a stable refresh callback,
   so switching Orders ↔ Trashed changed the tab and banner while the table kept
   showing the other view's rows. Fixed; switching re-reads the store.
4. **Media library reported a draft product's photos as unused and would delete
   them.** The usage index was built from the storefront-scoped product list, which
   drops drafts. Now reads `status: 'any'`, excludes trash, and the delete fails
   closed.
5. **A fabricated order was presented as real.** A hard-coded `LX-1001` demo row
   (id `demo-order-001`) was prepended to `/admin/orders`, and its invented USPS
   tracking number was also the fallback printed for a real order with no tracking.
   Both removed.

All five are committed and pushed; 1–3 also verified live with throwaway orders.

---

## 6. Open findings

### F1 — Dead duplicate admin layout and router (medium, maintainability)
`src/admin/AdminSection.tsx` exports an `AdminLayout` (≈ line 80) and a
`default function AdminSection()` router (≈ line 6703) that renders a
`react-router` `<Routes>` tree. **Neither is imported anywhere** — only the named
`A*` screen exports are used, by `src/views/admin/*`. The live rail is
`src/components/admin/AdminLayout.tsx`.

Consequence: the file contains a *second*, stale navigation — still grouped as
`LeadOS / Catalog (with Promotions, Gift Drop, Campaigns)` — that no screen renders
but that anyone reading the code will mistake for the real rail. It also keeps
react-router routing alive in a Next.js App Router project. Recommend deleting the
dead `AdminLayout` and default export (and the now-unused router imports) in a
dedicated, tested change.

### F2 — "Blank media grid" on a second PC (open, not reproducible)
The owner reported `/admin/media` and the new-product image library showing an empty
grid on another computer; the page itself loads. It has **not** been reproduced:
a fresh browser profile with a real login renders 60+ tiles, the library API answers
`200`, and there are zero console errors; an expired session redirects to `/login`
cleanly. Likely a stale session or cached asset on that machine, but this is not
proven. **Needs:** the exact red-banner text, or a screenshot, from the machine where
it happens.

### F3 — ERP sync is not connected (by design, not a bug)
`/admin/orders` states plainly that no server-side ERP endpoint is configured, so no
order is pushed anywhere; the CSV export still works. Confirm this is intended
long-term before treating it as a gap.

### F4 — Staging holds 36 test orders (data, not code)
These are **real records in the staging WooCommerce store** (dated 2023 →
2026-09-30), not demo rows in code, so they will not exist in production. They are
now clearable from `/admin/orders` → **Select all** → **Move to trash** (reversible).
No such action was taken unilaterally.

### F5 — Production cutover pending (owner-held)
No production Worker exists yet. The plan is written and committed — see §8. The
owner has asked to **hold** this; nothing production-facing has been changed.

### F8 — Category hub pages logged a React hydration retry (`#418`) on the deployed preview — RESOLVED
A full load of a shelf with hub content that carries **more than one** product —
e.g. `/products?category=edible-pink-salt` — logged `Minified React error #418`
(hydration text mismatch, arg `text`). The page still rendered; React discarded the
server HTML and re-rendered client-side. `/products`, `/products?category=bulk` and
`/products?category=licks-blocks` were clean. **This predated the category-pill
work** — it reproduced on a build of the previous commit with no pill changes
present (verified 2026-10-01 by redeploying that build to preview), and it did not
reproduce in the dev runtimes (which run in the shopper's timezone).

**Root cause (2026-10-01):** the shelf hub's PDF row date. `ProductPdfLibrary`
formatted each resource's `publishedAt` with `new Date(iso).toLocaleDateString('en-US',
{ month: 'long', year: 'numeric' })` — no `timeZone`. Cloudflare Workers render in
UTC; a browser west of Greenwich does not. A date-only string like `'2026-03-01'`
is parsed as UTC midnight and lands on the **previous day** in every western zone, so
the same node read `"March 2026"` on the server and `"February 2026"` in the
browser. Only the edible shelf's grain-size guide is dated the 1st of a month, which
is why exactly that URL tripped #418 and the shelves dated the 5th or later stayed
clean. (A separate ordering bug in the same area was found in the same pass: landing
on a category URL and then choosing **All** left the stale shelf selected, because
`resolveCategoryFilterKey` fell back to the route's `initialCategoryKey` whenever the
address bar had no query string, even after a client-side query-only navigation to
`/products`. Fixed together.)

**Fix:** `formatPublishedMonthYear` (`src/lib/content/publishedDate.ts`) pins the
format to `timeZone: 'UTC'` so the label is the authored calendar date on every
runtime, and `resolveCategoryFilterKey` now treats a query-less `/products` as All
unless the browser is actually on the shelf *path* (`/products/shelf/<key>`). Pure
helpers, unit-tested, no suppression flag, no change to caching/ISR/SEO.

**Verified:** deployed to preview, 0 × #418 at 320/375/768/1440 on `/products`,
`?category=edible-pink-salt`, `?category=bulk`, `?category=licks-blocks`,
`?search=salt`, an invalid category, a PDP and `/blog`; All ⇄ category client
navigation and browser back/forward clean; server and hydrated SEO (title,
description, canonical, OG, JSON-LD, H1) agree; category shelf still answered from
edge cache.

### F6 — Documentation drift
`AGENTS.md` names the old repository as `8002salman-ai/himalayan-koh`; the configured
`old-origin` is `salmanbashir80/himalayan-koh`. Worth correcting so the rules file
matches reality. (F7 and F6 are the same issue; listed once here to avoid duplication.)

---

## 7. Untracked files that are not part of the repository

These exist in the working tree but are **not mine and were not staged**:

- `scripts/Himalayan Koh Project Audit.md` — an earlier, now-stale audit (it reports
  the old `8002salman-ai` remote and HEAD `02bcdbb`).
- `scripts/export-store-backup.mjs` — a store backup helper.

Recommend deciding deliberately whether either belongs in the repo.

---

## 8. Deployment and the production plan

**Staging (live now):** Worker `himalayan-koh-ecommerce`, origin
`https://preview.himalayankoh.com`, backend `https://himalayankoh.com/staging`.
Admin sign-in, media library, product editor, orders (including the new Trashed view)
and the public storefront have all been exercised live this period.

**Production (held):** the full cutover is in
[`docs/PRODUCTION-CUTOVER-PLAN.md`](PRODUCTION-CUTOVER-PLAN.md). In one paragraph:

> Production gets its **own second Worker** (`himalayan-koh-ecommerce-prod`) on
> `himalayankoh.com`, while **preview keeps running unchanged**. Because the two
> `NEXT_PUBLIC_*` origins are inlined at build time, production must be *built* for
> the production origin, and a production guard gets added beside — never by
> loosening — the staging guard. New per-environment secrets are set with
> `wrangler secret put` (above all a **fresh `ADMIN_SESSION_SECRET`**, then the live
> WooCommerce, Stripe and Shippo keys). Deploy to `*.workers.dev` first, attach the
> domain last, and roll back by moving the route back to preview — a routing change,
> not a redeploy.

---

## 9. Recommended next actions (in order)

1. **Decide F4**: clear the 36 staging test orders from preview, or keep them.
2. **Chase F2**: get the red-banner text or a screenshot from the second PC.
3. **Fix F1**: delete the dead admin layout/router (small, safe, test-covered).
4. **Correct F6**: update `AGENTS.md` old-remote name.
5. **When the owner is ready**: execute the production plan, Step 1 (production
   deploy path + guard) first, then secrets, then the domain move.

---

## Appendix — verified numbers this period

| Metric | Value |
| --- | --- |
| Images in the media library | 316 total — 55 on products, 261 unused |
| Products indexed | 6 (one, "Salt Rock for Cattle", is a **draft**) |
| Staging orders | 36 (live stats: 15 pending, 5 processing, 0 shipped, 15 delivered, 1 cancelled) |
| Test files | 143 (1537 passing, 19 skipped integration) |
| API routes | 126 |
| Commits pushed this period | `473580c`, `65a5e50`, `053cc78`, `36d433f`, `6ff4447`, `3d28a9b`, `026ef35` |
