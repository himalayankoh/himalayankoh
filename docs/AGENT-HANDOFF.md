# AGENT-HANDOFF — Himalayan Koh

This is the canonical handoff file for all coding agents (**Freebuff**, **Codex**, **Antigravity**).
Every coding agent must read this file **FIRST** before touching any code.
Every completed task must update this file **BEFORE** final commit.

---

## 1. Project Metadata & Deployment State

* **PROJECT PATH**: `C:\Users\basco\Downloads\hk\himalayan-koh`
* **BRANCH**: `integration/cloudflare-workers-migration`
* **LOCAL HEAD**: Synced with GitHub origin
* **GITHUB HEAD**: Synced with origin/integration/cloudflare-workers-migration
* **LIVE WORKER SHA**: Cloudflare staging deployment
* **LAST VERIFIED DATE**: September 19, 2026
* **PRIMARY STAGING URL**: `https://preview.himalayankoh.com`
* **ROLLBACK / REFERENCE URL**: `https://himalayan-koh.vercel.app`
* **PRODUCTION STATUS**: `https://himalayankoh.com` is **STRICT READ-ONLY / UNTOUCHED**.

---

## 2. Current Architecture

* **WooCommerce (`https://himalayankoh.com/staging`)**: Source of truth for products, categories, orders, coupons, and inventory. All public catalog and checkout actions flow through WooCommerce REST v3 APIs (`/api/catalog`, `/api/orders/*`, `/api/admin/catalog`).
* **Supabase**: Source of truth for customer authentication, user accounts/profiles, session management, and application-specific state (e.g. blog, reviews, CRM leads). Admin role is determined via `app_metadata.role` or authorized admin emails (`8002salman@gmail.com`, `basco.pk@gmail.com`).
* **OpenRouter**: Server-side AI provider powering customer-facing chat (`/api/openrouter`) and Admin SEO (`/api/admin/seo/*`) with model `google/gemini-2.5-flash`.
* **Cloudflare Workers (`vinext-cloudflare`)**: Primary hosting infrastructure serving `preview.himalayankoh.com` via KV cache (`VINEXT_KV_CACHE: 7e62970fbe5049dfb678409d6f28d064`).
* **Vercel**: Preserved strictly as rollback / visual reference.

---

## 3. Last Completed Work

* **Loading / Flash / Dead-Endpoint Pass (this pass)** — measured on the deployed Worker, not inferred:
  * *Admin first paint*: cold `GET /admin` renders the admin shell's own skeleton (`Loading the admin console…` at ~120ms), then the dashboard's data at ~330ms; the legacy `Loading admin panel` screen never reaches the DOM (`legacyLoader: false` at 25ms sampling from document-start). No animation-frame stall > 200ms on `/`, `/products`, `/blog`, `/admin`.
  * *Route walk* `/admin → products → seo → orders → /admin`: no full-screen loader flash, no Server Components error, console errors 0, exceptions 0. Cold loads were TTFB 91–1502ms (WooCommerce reads dominate; `/blog` 352ms).
  * *Top progress bar*: instrumented at 25ms; it goes 12% → 100% and hides within ~200ms of a route change, with **0ms spent crawling in 90–99%** — the old hang is gone.
  * *Duplicate reads removed*. Two real duplications were found and fixed:
    - `GET /api/admin/orders` made **two** WooCommerce list calls per request (page + a separate stats window). It now reuses the page read when that page already *is* the window (`src/lib/admin/orderStatsWindow.ts`, unit-tested) — the dashboard and orders screen no longer pay two ~1.2–1.8s round trips for one answer.
    - The products screen read the catalog **twice** per mount, because `listCategories()` derives its list from `listProducts()`. Concurrent reads now share one in-flight call (`src/lib/admin/singleFlight.ts`, unit-tested; deliberately not a cache, so a reload after a save still re-reads).
  * *Dead endpoints retired*. The Orders screen called `/api/checkout?action=orders` and `/api/admin/erp` on every visit — neither route exists, so opening it produced two 404s and an empty list. The list now reads the console's real WooCommerce route (`/api/admin/orders?limit=100`), and the ERP panel (Save/Test/Push buttons that could never succeed) is replaced by an honest status card that keeps the working CSV export.
  * *Public category rail*: `Bulk & Wholesale` is withheld from the storefront filter (`visibleInStorefront: false` in `src/lib/categoryContent/keys.ts`), verified live — its pill is absent and no footer link points at it. The remaining shelves were clicked with trusted mouse events on the deployed build: Edible Pink Salt → 8 products, Cooking & Serving → 2, Salt Licks & Blocks → 4, All → 18, each updating the URL, the active state, and the card list with 0 console errors.
* **Admin Loading & Flicker Root-Cause Fix**:
  Moved `<AppProvider>` to `src/app/admin/layout.tsx` so the entire admin section shares a single persistent context across client-side route transitions. Stripped 28 redundant `<AppProvider>` wrappers from `src/views/admin/*`, eliminating context destruction, state resets, and loading/flicker cascades on admin navigation.
* **Admin AI SEO Engine Rebuilt**:
  Updated `src/lib/ai/gemini.ts` to seamlessly power `/api/admin/seo/generate` and `/api/admin/seo/status` using the verified server-side OpenRouter provider (`google/gemini-2.5-flash`) with safe `max_tokens: 1000` to eliminate 402 credit errors.
  Enforced 100% English-only copy validation with non-Latin script rejection. Grounded copy strictly in real WooCommerce facts and scanned for prohibited claims.
* **Admin SEO Interface (`src/views/admin/AdminSeo.tsx`)**:
  Created full Himalayan Koh SEO Engine featuring source selector (**Product** vs **Category**), live WooCommerce catalog grounding, side-by-side **Generate → Review → Apply** workflow with character counters and copy buttons, and safe disabled Apply state explaining that staging Yoast REST write access requires custom meta registration.
* **AI SEO Connection Test**:
  Created `/api/admin/seo/status` returning connection state (`CONNECTED`, `NOT CONFIGURED`, `INVALID KEY`, etc.) and configured model name (`google/gemini-2.5-flash`) without exposing keys.
* **Blog Editorial Cleanliness**:
  Updated `src/admin/BlogManager.tsx` to Himalayan Koh editorial team and prompt, removing remaining off-brand references. Verified public `/blog` and `/blog/[slug]` match storefront aesthetics with AdSense placeholders disabled on staging.
* **Policy & Footer Canonicalization**:
  Verified `/privacy`, `/terms`, `/shipping`, `/returns`, `/faqs`, and `/contact`. Updated footer policy links to point directly to canonical `/returns` (200 OK) without 308 redirect hops.
* **Catalog & Duplicate Audit**:
  Verified live WooCommerce catalog on staging has exactly 18 published products with 0 duplicate SKUs, 0 duplicate slugs, and 1 draft SKU (`HK-LFH-6lbs`).
* **Comprehensive Regression Suite**:
  Added `src/lib/ai/adminSeoRegression.test.ts`, bringing the test suite to 34 test files, 474 passing tests. Verified clean TypeScript build (`tsc --noEmit`) and production vinext bundle (`npm run build:deploy`).
* **Hermes Ingest Backend & Evidence Store**:
  - Implemented authenticated `POST /api/hermes/ingest` accepting research evidence only, protected by `HERMES_INGEST_TOKEN` or `SALMAN_OS_TOKEN` (via `Authorization: Bearer <token>` or `x-hermes-token`).
  - Strict payload validation against the 12 whitelisted research types, confidence (0-100), ISO observed_at, and required stable dedupe_key.
  - Dedicated Supabase storage table `public.hermes_evidence` with unique DB-level index on `dedupe_key`. Idempotent response: returns 201 `CREATED` on first submission, 200 `ALREADY_EXISTS` on duplicate submission.
  - Rate limiting (120 req/min) and payload size limit (100KB) enforced.
* **Salman OS Himalayan Koh Bridge**:
  - Corrected project slug from stale `luxedge` to `himalayan-koh` in `src/services/salmanOs/contract.ts` and `types.ts` via dynamic `SALMAN_OS_PROJECT_SLUG`.
  - Stored target `project_slug = 'himalayan-koh'` in Supabase `site_settings`.
  - Added safe integration health endpoint at `GET /api/hermes/health`.
* **Admin AI Intelligence Interface (`src/admin/HermesIntel.tsx`)**:
  - Connected `/admin/ai-intelligence` to read live stored evidence via protected `GET & PATCH /api/admin/ai-intelligence`.
  - Added full tab filtering across all 8 tabs: Products, SEO, Free Marketing, Free Listings, Market, Marketing, Ads, and Catalog QA.
  - Added contextual navigation links (Open in Admin Products, Open SEO Engine, Open Blog) and review qualification status updates (`new`, `reviewed`, `accepted`, `dismissed`).
* **Integration Documentation**:
  - Created `docs/HERMES-SALMAN-OS-N8N.md` detailing architecture, security boundary, payload schema, dedupe behavior, and n8n workflow contract.

---

## 4. Current Known Issues & Safeguards

* **Admin Product Writes Blocked by Policy**: Direct write access in `CatalogAdmin.tsx` / `ProductEditorModal.tsx` remains intentionally blocked until a dedicated, fully audited WooCommerce REST write pipeline is validated for mutations (to avoid stale Supabase writes).
* **Draft Products in WooCommerce**: 14 legacy draft products without SKUs exist in WooCommerce staging (these do not display on the public storefront).
* **Salt Lamps & Décor Shelf**: Footer contains Salt Lamps & Décor but current shelf has zero products. Reported as `OWNER DECISION REQUIRED` without altering approved footer.
* **Admin Orders screen reads WooCommerce, but its Stripe-era extras do not**: the list, totals and statuses are the store's own records. The legacy per-order tabs (provider filter, gift-drop inclusion, ERP push) were removed in this pass because they described a payment pipeline the store does not have.
* **Catalog read latency is the dominant cost on admin screens**: `/api/admin/catalog` ~1.2–1.4s and `/api/admin/orders?limit=100` ~1.2–1.8s are WooCommerce reads. They are now issued once instead of twice per screen; making them *faster* means a short-TTL server cache with write invalidation, which is not done yet.

---

## 5. Owner Dependencies & Actions

* **OPENROUTER KEY ROTATION: OWNER ACTION REQUIRED BEFORE PRODUCTION**: The OpenRouter API key should be rotated prior to production launch.
* Final owner approval required before executing production cutover or DNS changes.
* Shippo and Stripe live credentials must remain in test mode on staging.
* Dedicated return facility address instructions: policy directs customers to contact `sales@himalayankoh.com` or `(832) 224-6466` for RMA authorization prior to return shipments.
