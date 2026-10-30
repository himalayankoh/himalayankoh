# Gemini Antigravity — handoff prompt

Copy everything inside the fence below into Gemini Antigravity, started with its
working directory at `C:\Users\basco\Downloads\hk\himalayan-koh`.

---

You are taking over work on an existing, working Next.js e-commerce repo. Work
**entirely from the local files on disk** in your current working directory. Read the
code before you change it; do not assume a file's contents from its name and do not
invent APIs, credentials, prices or rates. If a fact is not in the files, say it is
missing instead of guessing.

## 0. Ground rules (non-negotiable)

1. **Do not deploy to production.** Production is `himalayankoh.com`. The only
   deployment you may touch is the staging Cloudflare Worker preview
   (`preview.himalayankoh.com`), and only after the owner explicitly approves it in the
   chat.
2. **Never enable live charging.** Do not set `STRIPE_ALLOW_LIVE` anywhere, do not
   enable a live-mode UI toggle, and do not change production config. Live keys must
   keep failing closed on staging.
3. **Do not introduce Supabase.** There is no Supabase in this project any more (the
   `supabase-backup/` folder is legacy and read-only reference). Verification is
   WordPress-backed only.
4. **Wholesale stays isolated from retail.** Admin → wholesale console, `hk-wholesale`
   WordPress plugin, and the `src/lib/wholesale/` engine. A wholesale order must never
   enter the retail cart, checkout, auth or order flow. Keep the retail read surface
   byte-identical when you are working on wholesale.
5. **Never print, log, commit or paste a secret.** Full secret values never leave the
   Settings store. Report secrets only as prefix + length (e.g. `sk_test_… (32 chars)`).
6. **Never reconcile a masked value.** The Settings API deliberately returns masked
   secrets. Writing a masked value back **destroys the stored secret**. This already
   happened once and deleted a stored live key. Any script that writes to those fields
   must snapshot the previous *raw* value first and restore it in a `finally`, and must
   refuse to run when a secret is already stored unless `--replace-existing` is passed.
   Keep that guard in place.
7. **Do not run a build while `next dev` is running** — it corrupts `.next`. Kill
   whatever owns the port first (`netstat -ano | findstr :3997`, then `taskkill /PID
   <pid> /F`).
8. Never invent ex-factory costs, carton dimensions or freight rates. Missing data is
   reported as missing, not filled with a plausible number.

## 1. Repo facts to internalise

- Branch in use: `integration/cloudflare-workers-migration`. Nothing in this work is
  committed (do not commit unless asked) and nothing is deployed.
- Stack: Next.js 15 App Router, React 19, TypeScript, Tailwind 4, Vitest, Cloudflare
  Workers (vinext/wrangler). WordPress is the data store for retail and wholesale
  (plugin `wordpress/hk-wholesale.php`, namespace `hk-wholesale/v1`, schema v6).
- Staging WordPress lives at `https://himalayankoh.com/staging`; the plugin is already
  installed and verified there.
- Origin rules live in `src/lib/site/origin.ts` (production `https://himalayankoh.com`,
  staging `https://preview.himalayankoh.com`).
- Read `docs/WHOLESALE.md` first for the business model and data shapes.
- Env: `.env.local` has `NEXT_PUBLIC_SITE_URL` and a publishable key but **no**
  `STRIPE_SECRET_KEY`, **no** `STRIPE_WEBHOOK_SECRET`, **no** `STRIPE_ALLOW_LIVE`.
  `.env.production.local` sets the staging origin. Never add secrets to a tracked file.
- Admin console: `/admin`, WordPress-admin credentials, session key `luxedge_sb_session`.
  Buyer portal session key: `hk_wholesale_session`. If you need a session in the browser
  for QA, use `scripts/qa-browser-bootstrap.mjs` (it mints real sessions through the
  app's own login routes and writes throwaway pages into `public/`; remove them with
  `--clean` afterwards).

## 2. Work already done and verified (do not redo it — verify it, then build on it)

**Stripe fail-closed gate (this is the most recent work).**

- `src/lib/stripe/server/readiness.ts` (+ `readiness.test.ts`, 16 tests) classifies key
  modes and requires **all** live conditions before live charging can happen: live
  publishable key, live secret key, live `whsec_`, a webhook endpoint that probed OK,
  `STRIPE_ALLOW_LIVE=true`, passing health checks — **and** the deployment must be the
  production origin. Unknown (`null`) counts as failing. Key-mode mismatch blocks.
  Blockers are severity-ordered, origin first.
- `src/lib/stripe/server/stripe.ts` exposes `evaluateCurrentStripeReadiness`,
  `stripeConfigError`, `getStripeClient`, `getStripeSignatureVerifier`
  (verification is deliberately **not** gated so a valid delivery is never reported as a
  bad signature), `mayApplyPaymentsForMode`, `resolveStripePublishableKey`.
  Secret/webhook resolution reads the Settings store first, env second.
- `src/app/api/stripe/webhook/route.ts` verifies with the non-gated verifier, and a
  live-mode delivery arriving at a non-production deployment is acknowledged
  `200 {received:true, applied:false, reason}` rather than applied.
- `src/app/api/admin/payments/route.ts` reports `stage / stageLabel / ready /
  readyForLive / chargingEnabled / orderSyncConfigured / blockers / checks`, sets
  `status:'ready'` only when genuinely usable, `action:'test'` is read-only, and the new
  `action:'health'` performs a read-only payment probe plus an HMAC-signed webhook probe
  against `/api/stripe/webhook`, recording `stripe_health_ok`,
  `stripe_webhook_endpoint_ok`, `stripe_health_at`, `stripe_health_detail` in the
  `payments` settings category (the flags the live gate reads).
- `src/admin/PaymentsSetup.tsx` shows honest stage words (`OFF` / `TEST` / `STAGING` /
  `LIVE` / `PRODUCTION`), reserves "Ready" for genuinely usable, adds a Health button and
  a blocker panel.
- `src/admin/ServiceKeysPanel.tsx` is a registry-driven key editor (Stripe secret /
  publishable / webhook, freight, Resend, Shippo, OpenRouter, …) mounted as accordion
  `serviceKeys` — "Service & API Keys" — in `src/admin/AdminSection.tsx`. Masked secrets
  are never echoed, only touched fields are posted, there are Clear buttons, and Stripe
  gets a "Test connection" button.
- `scripts/check-stripe-setup.mjs` (`npm run check:stripe`) was rewritten: no Supabase,
  read-only for live keys, creates+cancels a test PaymentIntent only in test mode.
- `scripts/qa-stripe-webhook.mjs` — 9/9 passing: signed delivery 200; unknown order
  acknowledged `applied:false`; bad signature 400; missing header 400; tampered body
  400; live-mode delivery 200 `applied:false`; duplicate idempotent; charging still 503.
- `scripts/qa-stripe-testmode.mjs` — 11/11 passing: with throwaway test keys the admin
  screen reads `TEST / STAGING`, `chargingEnabled=true`, `orderSyncConfigured=true`,
  `status=ready`, zero blockers; the gate stops 503-ing and reaches real validation
  (`HTTP 400 A valid email is required`); verify-payment reaches Stripe and Stripe's own
  masked error is surfaced honestly.

**Wholesale subsystem (already built and QA'd, unfinished business below).**

- Engine and libraries: `src/lib/wholesale/` — `engine.ts`, `plan.ts`, `pricing.ts`,
  `profit.ts`, `quoteLifecycle.ts`, `revisionLog.ts`, `freight.ts`, `freightProvider.ts`,
  `document.ts`, `mapping.ts`, `store.ts`, `session.ts`, `requireBuyer.ts`, `buyerView.ts`,
  `buyerAcceptance.ts`, `portalClient.ts`, `types.ts` plus tests. The pallet calculator
  uses pallet floor positions + stacking + weight, and container profiles carry internal
  dimensions (plugin schema v6). Products with no recorded ex-factory cost are refused,
  not priced with a guess.
- UI/routes: `src/views/wholesale/`, `src/views/admin/wholesale/`,
  `src/lib/admin/wholesaleConsoleApi.ts`, `src/app/(main)/wholesale/`,
  `src/app/admin/wholesale/`, `src/app/api/wholesale/`, `src/app/api/admin/wholesale/`.
- Catalogue: 19 HK SKUs were imported from the owner's price list by
  `scripts/import-wholesale-catalogue.mjs` (idempotent, `--dry-run` supported), reader
  `scripts/read-price-list.mjs`. Deliberately **not** invented: ex-factory cost and
  carton dimensions.
- QA harnesses: `scripts/qa-wholesale.mjs` (31 checks, end-to-end against a live server
  and real WordPress), `scripts/qa-wholesale-deep.mjs` (deep pass: `seed`, `maths`,
  `incoterms`, `orders`, `revisions`, `security`, `cleanup`; the maths are recomputed in
  the script from the documented packaging rules rather than imported from the engine, so
  agreement is evidence and disagreement is a real bug), `scripts/qa-browser-bootstrap.mjs`.

Last known green state: `npm test` **1130 passed / 12 skipped / 0 failed**,
`npx tsc --noEmit` clean, `npm run lint` 0 errors, `npm run build` clean, and the retail
read surface regression clean (`/ /products /checkout /track /contact /login /wholesale`
→ 200, `/cart` → 307, public APIs 200, gated admin APIs 401).

Re-derive that state yourself before you change anything:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npx next start -p 3997        # in background, after the build
BASE=http://127.0.0.1:3997 node scripts/qa-wholesale.mjs
BASE=http://127.0.0.1:3997 node scripts/qa-stripe-webhook.mjs
```

## 3. What is still pending — finish all of it

Do these in order. Where an item needs a credential or a commercial decision from the
owner, do everything that does not need it and then state precisely what you are blocked
on — do not stall the whole list on one blocker.

**A. Turn on real Stripe test mode and prove the money path end to end.**
The owner will paste a test publishable key (`pk_test_…`), a test secret key
(`sk_test_…`) and a test webhook signing secret (`whsec_…`) into
**Admin → Settings → Service & API Keys**. The stored secret key is currently unset
(it was deleted by the masked-write-back incident described in rule 6), so
`/api/stripe/config` currently reports `configured:false, mode:test,
webhookConfigured:false`. Once the keys are in, drive the real flow against the local
server: create a test PaymentIntent, complete it with the `4242…` test card, force a
decline card, submit a duplicate and a retry, run verify-payment, and confirm the
admin Payments screen reports `TEST / STAGING` with no blockers. Then register a Stripe
test webhook endpoint pointed at `/api/stripe/webhook` so a **real** delivery proves the
stored `whsec_` belongs to that endpoint. Report every result honestly, including
failures and Stripe's own error text (with secrets masked).

**B. Decide and act on the staging deploy.** The new gate is **not** on
`preview.himalayankoh.com` yet — the preview Worker still runs the older one-line live
guard. Ask the owner for explicit approval, and only then use
`node scripts/deploy-staging.mjs`. Re-verify `preview.himalayankoh.com` afterwards and
report whether the preview now refuses live mode.

**C. Finish and deliver the wholesale 18-section deep-QA report.** It was run but never
written up. Re-run the deep harness, capture the evidence, and produce the report as a
document in the repo — including every defect found, whether it is fixed, the test that
now covers it, and anything still open. Use:

```bash
BASE=http://127.0.0.1:3997 node scripts/qa-wholesale-deep.mjs seed maths incoterms orders revisions security
BASE=http://127.0.0.1:3997 node scripts/qa-wholesale-deep.mjs cleanup
```

**D. Produce the ocean freight research the owner asked for.** Never invent a rate. For
each lane — Pakistan Karachi (PKKHI) and Port Qasim, plus China Shanghai (CNSHA), to
Houston, New York/New Jersey, Los Angeles/Long Beach, Felixstowe and Jebel Ali — for 20ft,
40ft and 40HQ, find what is publicly documented and record it as: the figure, the exact
source URL, the date the source was published or retrieved, the currency, and precisely
what the figure includes and excludes (terminal handling, documentation, customs, inland,
surcharges, validity period). Where no reliable public figure exists, write
`RATE UNAVAILABLE FROM PUBLIC SOURCE` and say what would be needed to obtain it. Then
build the comparison table against the owner's manual rates in
`src/lib/wholesale/freight.ts` / the Settings freight registry, and state clearly which
figures are market data and which are the owner's own quotes.

**E. Wire the real-time freight provider behind the existing abstraction.**
`src/lib/wholesale/freightProvider.ts` and the Settings → "Ocean Freight — Live Rates"
category (`provider / api_key / api_secret / account_code / api_base`) already exist, but
there is no live credential, so only manual rates work. Keep manual rates as the fallback,
keep every rate labelled with its provenance, and make the UI never present a manual or
stale rate as if it were live.

**F. Implement the sourcing model.** Goods are sourced from Pakistan and China and
delivered to the USA. UK customers are served out of Pakistan but must be **billed as a
USA delivery**. Encode that lane/sourcing/billing distinction in the engine and the
documents, and cover it with tests.

**G. Ask the owner for the missing commercial data for the 19 imported SKUs:
ex-factory cost per unit and carton dimensions.** Until that arrives the engine must keep
refusing to price those products rather than approximating. When it arrives, import it
idempotently and re-run the maths QA.

**H. Prove email actually delivers.** WP Mail SMTP is active on staging but no mailer is
configured and no delivery has ever been tested. Run a controlled test to a QA mailbox,
diagnose WordPress/hosting/SPF/DKIM/DMARC/SMTP, and report the result. Do not make any
production email change.

**I. Clean up the staging QA residue and confirm it in writing.** Remove the QA buyers,
applications, quotations, orders and seeded pricing/freight rows created by the harnesses,
and remove the throwaway browser pages `public/_qa-admin.html`,
`public/_qa-buyer-alpha.html`, `public/_qa-buyer-bravo.html` (by
`node scripts/qa-browser-bootstrap.mjs --clean`; they only serve if present at build
time). Append-only audit rows cannot be deleted — say so explicitly and list what
remains. Then confirm what is left in the staging wholesale tables.

**J. Run the final regression** and report it: `npm test`, `npx tsc --noEmit`,
`npm run lint`, `npm run build`, the retail read surface check, `npm run check:stripe`,
and both QA harnesses. Then list every commercial value still owed by the owner: product
costs, packaging/carton dimensions, freight lane rates, commission agreements, quotation
terms and validity, and the company header for documents.

## 4. How to report back

For each of A–J: state **done / partially done / blocked**, the exact commands you ran,
the observed result, the files you changed, and any test you added. If you find a bug,
fix it and add the regression test that would have caught it. If you disagree with one of
the ground rules in section 0, say so and stop — do not quietly work around it.
