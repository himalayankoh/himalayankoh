# Himalayan Koh — Wholesale Owner Data Readiness Pass

**Branch:** `integration/cloudflare-workers-migration` (`a5eaa4f558d47d90afa38ea5a46e4a29b60ce4dd`, pushed to `origin`)
**Preview:** https://preview.himalayankoh.com/admin/wholesale
**Code QA:** complete. No refactor of working wholesale logic. Preview-only; no production/WooCommerce mutation.

---

## 1. Product packaging audit — `src/lib/wholesale/engine.ts` + `src/lib/wholesale/types.ts` + live console

Enumerated from the live console (`GET /api/admin/wholesale/console`, authenticated Bearer token):

- **Products total:** 19
- **Products with `packaging` set:** 0  → every product has an empty `packaging: []`
- **Packaging complete (status `COMPLETE`):** 0
- **Packaging incomplete / needs review:** 19 (all `NEEDS_REVIEW` under the engine's `packagingCompleteness` — no required packaging field is present; the engine only counts unit `unitLengthCm/unitWidthCm/unitHeightCm` as optional/enrichment, not required)

Every product carries a `net_unit_weight_kg` and an `ex_factory_cost = 0`, and every product's note explicitly says both must be entered.

### All 19 products, audited live (no values invented)

| # | Product name | SKU | Net unit (kg) | Ex-factory cost | Packaging fields present |
|---|--------------|-----|---------------|-----------------|--------------------------|
| 1 | Himalayan Rock Salt — 45 lb | HK-LFC-45lbs | 20.412 | 0 | none |
| 2 | Himalayan Salt Block — 30 lb | — | 13.608 | 0 | none |
| 3 | Himalayan Salt Coarse Grain 3.0–6.0 mm — 45 lb | — | 20.412 | 0 | none |
| 4 | Himalayan Salt Medium Grain 1.0–3.0 mm — 45 lb | — | 20.412 | 0 | none |
| 5 | Himalayan Salt Fine Grain 0.5–1.0 mm — 45 lb | — | 20.412 | 0 | none |
| 6 | Himalayan Salt Coarse Grain pouch — 6 lb | — | 2.722 | 0 | none |
| 7 | Himalayan Salt Fine Grain pouch — 6 lb | — | 2.722 | 0 | none |
| 8 | Himalayan Salt Coarse Grain pouch — 3 lb | — | 1.361 | 0 | none |
| 9 | Himalayan Salt Fine Grain pouch — 3 lb | — | 1.361 | 0 | none |
| 10 | Himalayan Salt Lick 30 lb | — | 13.608 | 0 | none |
| 11 | Himalayan Salt Lick 12–14 lb | — | 6.35 | 0 | none |
| 12 | Himalayan Salt Lick 5–6 lb | — | 2.722 | 0 | none |
| 13 | Himalayan Salt Lick 3–4 lb | — | 1.814 | 0 | none |
| 14 | Himalayan Salt Lick 1–2 lb | — | 0.907 | 0 | none |
| 15 | Himalayan Salt Block (rectangular) 8" × 4" × 1" | — | 1.134 | 0 | none |
| 16 | Himalayan Pink Edible Salt Fine Grain — 6 lb pouch | — | 2.722 | 0 | none |
| 17 | Himalayan Pink Edible Salt Fine Grain — 3 lb pouch | — | 1.361 | 0 | none |
| 18 | Himalayan Pink Edible Salt Coarse Grain — 16 oz jar | — | 0.454 | 0 | none |
| 19 | Himalayan Pink Edible Salt Fine Grain — 16 oz jar | — | 0.454 | 0 | none |

No product has any of: `cartonQty`, `packagedUnitWeightKg`, `cartonLengthCm`, `cartonWidthCm`, `cartonHeightCm`, `cartonGrossWeightKg`, `palletLengthCm`, `palletWidthCm`, `maxStackHeightCm`, `palletDeckHeightCm`, `palletTareKg`. Every packaging array is `[]`.

**Net/gross inconsistency with default packaging (observed, not invented):**

- Live 1000-unit calc: 250 cartons, 5 pallets, **net 20,412 kg**, **gross 2,925 kg**, 8.040 CBM → net > gross by 17,487 kg.
- This is caused by `src/lib/wholesale/types.ts` `DEFAULT_PACKAGING_PROFILE`:
  - `packagedUnitWeightKg: 2.72` (a 2.72 kg unit)
  - `cartonQty: 4` → net cargo = 1000 × 2.72 = 2,720 kg  ✓ (matches `net_unit_weight_kg` contract)
  - `cartonGrossWeightKg: 11.3` (gross 2,925 kg)
  - `palletTareKg: 20`
  - The **unit weight 2.72 kg governs net cargo**; the **carton+gross 11.3 kg governs the pallet math**. They are different quantities, so the default profile does not reproduce the net value, and with real (empty) data the engine substitutes `DEFAULT_PACKAGING_PROFILE` everywhere, netting 20,412 kg from the unit weight alone.
- Net basis (`units × netUnitWeightKg`) is **correct and untouched**; the inconsistency is purely a missing-`packaging` data state, not a formula error.

### Engine / numerical confirmation (verified live via the deployed API)

- 1000 units → 250 cartons, 5 pallets (4 full / 1 partial ≈ 83%), 2,925 kg gross, 20,412 kg net, 8.040 CBM → recommendation **LCL** (no economics available, so physical threshold LCL).
- Mixed 1000 + 500 = 1,500 units → 375 cartons, 8 pallets, 4,397.5 kg gross, 12.144 CBM → computed LCL. Builder tiles show partial-only per line; there is no dedicated totals-row tile — a minor UI gap.
- `packagingCompleteness(DEFAULT)` → `INCOMPLETE` (unit dims missing). Adding unit L/W/H → `NEEDS_REVIEW` (6 missing). Only when full carton + pallet + stack fields and unit dims are present does it return `COMPLETE`. Verified live via console API and `calculate`.
- Post-bundle-delete inventory verified: 19 products, 0 cost profiles, 25 tiers.
- Freight: no live provider, 0 manual rates, 0 port charges.

### `recommendShipmentMode` economics branch — FIXED

- With `freightRates=[]`, the engine falls back to physical thresholds (LCL when `cbm < 13` and `grossWeightKg < 10000`).
- Previously, cheapest FCL was filtered by exact string equality between a rate's free-text `containerType` and a container profile's `id`. A rate written the way a forwarder writes it (`20' DV`, `20GP`, `40HQ`, `40' High Cube`) matched no id, so `applicableFclRates` came back empty and the branch silently fell through to the physical threshold — LCL on a small load even when FCL was cheaper.
- **Fixed:** rates and profiles are now compared on a canonical key (`normalizeContainerKey` in `src/lib/wholesale/engine.ts` — size + high-cube, ignoring spacing, quotes, `ft`/`feet` and dry-van markers `GP`/`DV`/`standard`), matched only against containers the load actually fits in. The recommendation returns the matched profile's own `id`, not the forwarder's spelling.
- Regression coverage: `engine.test.ts` 5b (provider wording still beats LCL), 5c (high-cube wordings resolve to `40HC`), 5d (a rate for a container the load does not fit in is still ignored), 5e (`normalizeContainerKey` equivalences). 5b and 5c were confirmed to fail against the previous exact-match logic.

---

## 2. Cost profile — 0 permanent cost profiles
- `GET /api/admin/wholesale/cost_profiles` → `[]` (confirmed live).
- **Fields the owner must provide to create the first real production cost profile** (from `src/lib/wholesale/types.ts` `CostProfile` and `src/lib/wholesale/mapping.ts` `costProfileFromRow` / `costProfileToRow`, and `ConfigPanels.tsx`):

**REQUIRED** (no default, must be entered for a real cost profile):
- `name` (profile label)
- `originId` (reference to a `wholesale/origins` row; origin → load port for FOB)
- `currency`
- `inlandTransport` (USD) — factory → port
- `stuffing` (USD) — loading
- `documentation` (USD) — export docs
- `originTerminal` (USD) — origin terminal/port
- `originCustoms` (USD) — origin customs/export handling
- `inspection` (USD) — third-party QC
- `forwarding` (USD) — forwarder
- `packagingSurcharge` (USD) — packaging above the ex-factory cost
- `insurancePct` (%) — on (merchandise + freight)
- `dutyPct` (%) — on customs value; set 0 when unknown
- `includeDestination` (bool) — include destination charges in landed total
- `dutyInLanded` (bool) — include duty in landed total
- `costs`: `otherLabel` (string) + `otherAmount` (USD) — optional label/amount

**OPTIONAL** (default when omitted):
- `supplierId` — reference to a `wholesale/suppliers` row
- `destinationTerminal`, `destinationHandling`, `destinationCustomsBroker`, `destinationDelivery`, `destinationWarehouse`, `destinationOther` (all USD, the destination-side ladder; only shown when `includeDestination` is true)

**DERIVED** (engine computes):
- Inland transport, stuffing, documentation, origin terminal, origin customs, inspection, forwarding, packaging surcharge, other, insurance, duty, ocean freight, and the landed total are all derived from the above by `buildCostLines`.
- Per-unit cost = `tier ? tier.unitPrice : exFactoryCost`; the first production profile's per-unit cost is the **ex-factory cost of the heaviest/highest-volume product** (see owner data entry plan).

**Owner note:** the engine refuses a product with `exFactoryCost = 0` and records "counted as free" in `assumptions`. Cost profiles and per-product ex-factory cost are independent: a profile can exist with 0 in it (then it is silently ignored), and the first *usable* profile is one whose per-product ex-factory costs are also entered.

---

## 3. Freight — 0 rates, no live provider

- **Live freight provider configured:** NO
  - Console `freightProvider` in the overview report: `provider: null`, `source: 'none'`, `ready: false`, `missing: []`.
  - `GET /api/admin/wholesale/freight_rates` → `[]` (0 manual rates).
- **Manual freight rates count:** 0
- **Port charges count:** 0
- **Required fields for the first usable LCL rate** (from `src/lib/wholesale/mapping.ts` `freightRateToRow` + live row shape):
  - `source` = `'manual'` or `'api'`
  - `provider` (label)
  - `originPort`
  - `destinationPort`
  - `containerType` = `'LCL'`
  - `oceanFreight` (USD)
  - optional: `surcharges[]` (label + amount), `carrier`, `transitDays`, `validUntil`, `providerReference`, `notes`
- **Required fields for the first usable FCL rate:** exactly the same set, with `containerType` = `'FCL'` (or a `container id` such as `20FT`/`40FT` that matches a `container_profiles` `id`), plus at least one `container_profiles` id that the rate's `containerType` resolves to.
- Live provider (e.g. Freightos) path: requires an `api` adapter + API key — not configured. LCL/FCL comparison is therefore **not available** right now; it is a data limitation, not a code defect.

### The LCL/FCL split — FIXED

- The split read the literal string `LCL`, so a rate stored the way a forwarder writes it — `lcl`, `Lcl`, ` LCL `, `L.C.L.`, `LCL freight`, `Less than Container Load` — was counted as FCL, named no container (`matchContainerProfile` → `null`), and was dropped. That left `lowestLcl` null, skipped the economics comparison entirely, and fell back to the physical threshold: a load that LCL priced cheaper could be recommended as FCL, and vice versa.
- **Fixed:** `isLclRate` in `src/lib/wholesale/engine.ts` recognises LCL by casing/punctuation-insensitive wording, and both sides of the split use it. Container and truckload values (`20GP`, `20FT`, `40HC`, `40HQ`, `40' High Cube`, `LTL`) and blank values are **not** LCL and still travel the container-profile path.
- Regression coverage: `engine.test.ts` 5f (LCL wordings still win on economics), 5g (`isLclRate` equivalences, including containers − and blanks → false), 5h (FCL wordings still resolve through `normalizeContainerKey` to `20FT`/`40HC`). 5f and 5h were confirmed to fail against the previous literal comparison; 5b–5e for the container fix still pass.
- **Still a data limitation:** the freight-rate form's Container select offers only `20FT`/`40FT`/`40HC`, so an LCL rate cannot be typed in the console at all — it can only arrive from the DB or a provider API. No LCL rate exists, so the economics branch cannot be exercised end-to-end in the live console.

---

## 4. AI provider — live is 402, not PASS

- The wholesale AI panel now goes through `askWholesaleAi` in `src/lib/admin/wholesaleConsoleApi.ts` (`POST /api/admin/wholesale/ai` with the admin `Authorization: Bearer` header). The bare-fetch 401 defect is fixed.
- Live: authenticated POST returns **HTTP 402 "AI provider has no credit"**.
- **Provider/model path:** single server-side key (`resolveAiSeoConfig` in `src/lib/ai/gemini.ts`) drives the only model path — OpenRouter first (`https://openrouter.ai/api/v1/chat/completions`), direct Gemini second. `askModel` in `src/lib/ai/askModel.ts` throws `AiAskError(..., 402)` when OpenRouter returns 402.
- **Billing/config issue:** the Admin Settings key points at OpenRouter (`google/gemini-2.5-flash`) and the account has no credits. No separate provider key exists (one key across the whole app), and the route does not create or fall back to a second key.
- **What must happen before AI PASS:** the owner supplies a credited OpenRouter (or the provider whose key is stored) key in Admin Settings, then `ASK` must return real output. Until one real model response succeeds, the AI row is **FAIL**.

---

## 5. Net/gross safety — UI warning (IMPLEMENTED and VERIFIED in Preview — see §8)

- No engine change. The engine is correct; the inconsistency is the owner having entered no packaging at all.
- **Implemented** as a UI-only banner driven by one pure helper, `getPackagingWarning` in `src/views/admin/wholesale/packagingWarning.ts`:
  - **error** when `line.netWeightKg > line.grossWeightKg` — title *“Net weight exceeds gross weight”*, message *“Net weight exceeds gross weight because packaging data is incomplete. Do not use this calculation for a final quote.”*
  - **warn** when packaging completeness is `INCOMPLETE` or `NEEDS_REVIEW` but net ≤ gross — title *“Packaging data incomplete”*, message *“Default packaging is being used, so weight and pallet calculations may be inaccurate. Enter the factory's actual carton and pallet data before relying on this quote.”*
  - **nothing** when completeness is `COMPLETE` or absent (no false warning).
- **Placement** (`src/views/admin/wholesale/CalculatorPanel.tsx`): the load/results panel of the pallet calculator (above the weight/pallet/CBM tiles), and in the container builder above the Auto/Best-Fit recommendation, over the container-fit figures, and at the top of the landed-cost panel — before any weight, pallet, CBM, recommendation or cost output is read.
- The pre-existing “Packaging Profile Incomplete / Needs Review — Missing: …” notice is retained below the tiles; this new banner adds the *net-vs-gross* meaning and the do-not-quote instruction.
- Regression coverage: `src/views/admin/wholesale/packagingWarning.test.ts` pins net>gross → error, incomplete → warn, complete/absent → null.
- The default packaging is a **copyable starting point**, not a real measurement — every product's own note already says exactly this, so the warning is consistent with the app's own message.

---

## 6. Owner data entry plan

### A. Product packaging (19 products)
For each product, enter a `PackagingProfile`:

| Field | Required | Optional | Derived |
|-------|----------|----------|---------|
| `cartonQty` (units/carton) | **Yes** | — | — |
| `packagedUnitWeightKg` (kg/unit) | **Yes** | — | — |
| `cartonLengthCm` | **Yes** | — | — |
| `cartonWidthCm` | **Yes** | — | — |
| `cartonHeightCm` | **Yes** | — | — |
| `cartonGrossWeightKg` (carton weight) | **Yes** | — | — |
| `palletLengthCm` | **Yes** | — | — |
| `palletWidthCm` | **Yes** | — | — |
| `maxStackHeightCm` (incl. deck) | **Yes** | — | — |
| `palletDeckHeightCm` | **Yes** | — | — |
| `palletTareKg` | **Yes** | — | — |
| `maxPalletGrossWeightKg` (kg ceiling) | Optional | — | — |
| `cartonsPerLayer` (override) | Optional | — | — |
| `layers` (override) | Optional | — | — |
| `unitLengthCm` (product's own size, enrichment) | Optional | — | — |
| `unitWidthCm` | Optional | — | — |
| `unitHeightCm` | Optional | — | — |
| `unitsPerInnerPack` | Optional | — | — |
| `cartonNetWeightKg` | Optional | — | — |
| `stackable`, `maxStackedPallets`, `rotationAllowed`, `handlingNotes` | Optional | — | — |

Reach `packagingCompleteness = COMPLETE` once every field above that is **RB** (red) is filled. Unit L/W/H is the only optional group.

### B. Cost profile (first one)
See §2. First *usable* production profile additionally requires real `exFactoryCost` per product (engine warning "counted as free" otherwise).

### C. Freight
See §3. First usable LCL and FCL rate need at least the 6 required fields plus container id; a live provider needs an `api` adapter + key (out of scope for this turn).

### D. AI provider
Admin Settings → add a credited OpenRouter (or the configured provider) API key. Then `ASK` returns a real `text` model pair. No separate key exists.

---

## 7. Production mutation — none
- No WooCommerce retail mutation, no wholesale row written, no invented data. Preview only.

---

## 8. FINAL REPORT

```text
PREVIEW SHA (browser-verified code build): 18c8e67c9a805b9580eeffd069a5cca4db622b49
  — the document you are reading is a later report-only commit on the same code; the Worker is redeployed from it and /api/version must equal that commit.

NET/GROSS WARNING: PASS — verified live in the Preview console. A 1,000-unit line for “Himalayan Rock Salt — 45 lb” (no packaging) rendered a red banner: “Net weight exceeds gross weight — Net weight exceeds gross weight because packaging data is incomplete. Do not use this calculation for a final quote.”, at the top of the Landed cost panel (and in the load/container blocks).
INCOMPLETE PACKAGING WARNING: PASS — same live run; the banner is the helper's `warn`/`error` state driven by `packagingCompleteness ≠ COMPLETE`.
COMPLETE PACKAGING FALSE WARNING: PASS — verified live with a temporary COMPLETE-packaging QA product: the calculation succeeded and rendered **no** warning banner (fixture deleted). Also pinned by `packagingWarning.test.ts`.
PRODUCT PACKAGING SAVE/RELOAD: PASS — a temporary QA product was saved with all 17 packaging fields (11 required + 3 unit dimensions + 3 optional) through the live Preview API; read back with all 17 values intact, and the edit form displayed all 17 saved values. Fixture deleted. Form field coverage is also pinned by `packagingForm.test.ts` and the mapping round-trip test.
COST PROFILE EMPTY-STATE: PASS — verified live: with 0 cost profiles both calculator panels show “Cost profile required for a priced quote”, the Cost profiles tab shows “No cost profiles yet. A quote cannot be priced without one.”, and the engine itself refuses to price (“No cost profile with id 0…”).
FREIGHT EMPTY-STATE: PASS — verified live: the Ocean freight tab shows “No freight configured” plus the “No live freight provider is connected…” summary; rate provenance stays MANUAL / LIVE API / FALLBACK / EXPIRED, so a typed rate is never shown as fetched.
AI STATUS MESSAGE: PASS for routing/honesty (authenticated route reaches the provider; the panel now states the provider is configured but unavailable for billing/credit reasons). AI CAPABILITY: FAIL — provider returns HTTP 402 until the owner adds credit.

TYPECHECK: PASS
TESTS: 1690 passed / 19 skipped (adds packagingWarning + packagingForm + full-field mapping round-trip)
BUILD: PASS (secret scan clean)

PRODUCTS TOTAL: 19
PACKAGING COMPLETE: 0
PACKAGING INCOMPLETE: 19
COST PROFILES: 0
FREIGHT RATES: 0
LIVE FREIGHT PROVIDER: NO
OWNER DATA INVENTED: NO
PRODUCTION TOUCHED: NO
OWNER DATA CHECKLIST: INCOMPLETE
PRODUCTION READY: NO

PRODUCTION READY = YES only when real owner packaging, pricing, freight and AI configuration are present and re-tested.
```

---

## 9. Owner packaging entry workflow (IMPLEMENTED and VERIFIED in Preview)

The products screen (`Products & pricing`) now leads with a **Packaging readiness** worklist, so the 19 incomplete products are a queue the owner works down instead of a number in a report.

- A progress bar reports *“N of 19 products complete”*; with the current live data it reads **0 of 19** (`role="progressbar"`, `aria-valuenow=0 aria-valuemax=19`).
- One row per outstanding product, naming exactly the fields still blank (e.g. *“Missing: Units per carton, Packaged unit weight (kg), Carton length (cm), … Unit height (cm)”*) with an **Incomplete** pill.
- **Fill in packaging →** opens that product's editor and scrolls it into view, so entry is one pass per product rather than a hunt through the table.
- The editor shows a **live** completeness notice that updates as the owner types (*“Still missing (14) — profile is incomplete”* → *“Still missing (13) …”* → *“Packaging complete”* once every required field is filled); nothing is saved until **Save** is pressed.
- A **Packaging** status pill on each products-table row gives the same verdict at a glance.

The verdict is computed once, in the React-free `src/lib/wholesale/packagingReadiness.ts` (field list in `src/lib/wholesale/packagingFields.ts`), and shares `packagingCompleteness` + `packagingFromJson` with the pricing engine — so the worklist, the row pill, the editor notice and the calculator's completeness warning cannot tell different stories. `packagingCompleteness` gained an optional second argument (`defaultsUsed`), so a field running on a documented default now counts as *not yet entered*; the single-argument call still behaves exactly as before.

Verified live on Preview (`e9756d1`, cache-busted) with a real admin session:

- 19 product rows, **0 complete / 19 incomplete**, progress bar 0/19.
- 19 **Fill in packaging →** buttons; clicking one opened *“Edit wholesale product”* with the editor scrolled into view; the live notice read *“Still missing (14) — profile is incomplete”*.
- Typing `cartonQty = 4` moved the notice to *“Still missing (13) …”*; filling all 14 required fields moved it to *“Packaging complete”*. Form then closed with **Cancel** — nothing saved.
- 38 **Incomplete** pills (19 in the worklist + 19 in the products table); no horizontal overflow at 390 px (`scrollWidth 390 / innerWidth 390`).
- Unit tests: `src/lib/wholesale/packagingReadiness.test.ts` (blank → all 14 required keys, measured → none, one blank → `NEEDS_REVIEW` naming just that field, form-typed strings read identically); `packagingForm.test.ts` still covers every field key.

---

## Checklist items for the owner (in order of dependency)

1. **A — Packaging.** For each of the 19 products enter the 11 required carton/pallet fields (+ optional unit L/W/H) → `packagingCompleteness = COMPLETE`. This fixes net/gross.
2. **B — Cost profile.** Create the first cost profile with the required charges + `insurancePct` + `dutyPct`; then enter real `exFactoryCost` on the heaviest/highest-volume product.
3. **C — Freight.** Enter a manual LCL rate and, in parallel, a manual FCL rate so `recommendShipmentMode` can switch on economics.
4. **D — AI.** Add a credited OpenRouter API key in Admin Settings so the wholesale AI panel returns real output.

Order matters: without step 1 the engine substitutes `DEFAULT_PACKAGING_PROFILE` and nets physically impossible weights; without step 3 LCL/FCL economics are empty; without step 4 the AI panel reads 402.
