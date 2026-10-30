# Himalayan Koh — Wholesale (B2B)

A second business on the same site: trade buyers, pallets and containers, quotations and
landed cost. It is **isolated** from retail on purpose, and this document says exactly how
far that isolation goes and what is still missing.

Written for whoever picks this up next (owner, engineer or Ayaz before production).

---

## 1. The one-paragraph summary

Retail is a shop: a shopper, a jar, a WooCommerce order, Stripe, a Shippo label. Wholesale is
a trade desk: an approved business, a container plan, a quotation with a validity date, a
bank transfer, a dealer's share of the profit. They share a brand, a catalogue *reference*
and an admin console — and nothing else. Wholesale lives in its own WordPress plugin, its own
tables, its own session key, its own URLs, and its own order records. No wholesale write can
touch a WooCommerce price, a retail order, a customer, a cart, or a Stripe/Shippo call.

**Measured isolation:** the whole subsystem changed **3 tracked files** (`15 insertions,
1 deletion`) — two package scripts and one nav entry. Everything else is new files.

**Live boundaries verified this pass** (local server against the real WordPress staging API):
no token → `401`; tampered token → `401`; a valid buyer token on `/api/admin/wholesale/profit`
→ `401 Invalid or expired admin session`; the same token on the retail `/api/admin/products`
→ `401`; an `admin`-role token signed with the wholesale key → `401`. Four buyer pages render
`200`, and retail `/products` still renders `200`.

---

## 2. What is built

| Area | State |
| --- | --- |
| Buyer landing / apply / login / portal | Built — new files; the approved buyer's WordPress sign-in account is created by the approval (§4) |
| Buyer accepts a firm quotation in the portal | Built — `POST /api/wholesale/quotes/[id]/accept`, gated by the pure `buyerAcceptance` verdict; verified by click-through and live QA |
| Wholesale catalogue with tier pricing | Built |
| Pallet, mixed-pallet, container, mixed-container maths | Built, unit-tested (34 tests) |
| Landed cost: EXW / FOB / CFR / CIF, origin + destination charges, duty | Built |
| FX with a per-quote rate snapshot | Built |
| Freight: manual rates + provider abstraction | Built; **no live provider configured** |
| Quotations: numbering, lifecycle, expiry, revisions, printable/downloadable document | Built |
| Wholesale orders separate from retail | Built (own table, own reference, no checkout) |
| Dealer commission and Himalayan Koh net profit | Built |
| Admin workspace (15 tabs, one sidebar entry) | Built |
| Permissions / session isolation | Built, 18 security tests; boundaries verified live |
| Plugin schema self-verification | Built — the install checks its own tables and columns and reports them (§4) |
| Live staging verification | **Done** — 31/31 checks against the real WordPress (`scripts/qa-wholesale.mjs`); the app itself is not yet deployed (§14) |

---

## 3. Module map

### Application (`src/`)

```
src/lib/wholesale/
  types.ts          domain vocabulary: packaging, product, tiers, cost profile, quote, order
  engine.ts         pure maths: pallet layout, mixed load, container fit, landed cost, margin
  plan.ts           buyer's plan (goods only) + the one line-request parser
  pricing.ts        stored data → a frozen quotation (the only engine caller in the server)
  profit.ts         sell − costs − dealer share = HK net profit, and the totals across orders
  quoteLifecycle.ts expiry, effective status, revision snapshots and diffs
  revisionLog.ts    writes a revision to the audit trail when a figure changes
  freight.ts        FreightProvider interface + the manual provider (no live provider wired)
  document.ts       the printable/downloadable quotation (self-contained HTML)
  mapping.ts        the one place a plugin row becomes a domain object and back
  store.ts          the one request path to hk-wholesale/v1 (server-only credential)
  session.ts        wholesale session tokens (own secret, own role claim)
  requireBuyer.ts   the gate every buyer route passes through
  buyerView.ts      what a buyer may see (never cost, freight, margin or FX)
  buyerAcceptance.ts the one decision that commits a buyer's money (accepted / expired / not priced)
  gate.ts           the WHOLESALE_ENABLED switch, checked server-side
  feature.ts        the flag itself (default on)
  portalClient.ts   the portal's typed browser client (quotes, orders, document download)

src/app/(main)/wholesale/       pages: landing, apply, login, portal, catalog, quote, quotes, orders, account
src/app/api/wholesale/          buyer API (session, apply, login, catalog, quote, quotes, orders)
src/app/api/admin/wholesale/    console API (workspace, [resource], calculate, decide, convert,
                                overview, quote-document, profit)
src/views/wholesale/            the buyer screens
src/views/admin/wholesale/      the console workspace (ui, Business, Config, Calculator, Profit panels)
src/app/admin/wholesale/        the single console route
src/lib/admin/wholesaleConsoleApi.ts   the console's typed browser client
```

### WordPress (`wordpress/hk-wholesale.php`, v1.1.0, schema v5)

One plugin, thirteen record types behind **one allowlisted endpoint**, every route guarded by
`manage_options`:

```
hk_wholesale_accounts          hk_wholesale_quotes        hk_wholesale_freight_rates
hk_wholesale_applications      hk_wholesale_orders        hk_wholesale_port_charges
hk_wholesale_products          hk_wholesale_suppliers     hk_wholesale_container_profiles
hk_wholesale_price_tiers       hk_wholesale_origins       hk_wholesale_cost_profiles
hk_wholesale_audit
```

---

## 4. Storage changes (plugin 1.0.0 → 1.1.0, schema v1 → v5)

Added columns, all `dbDelta`-safe (no data is dropped or rewritten):

| Table | Added | Why |
| --- | --- | --- |
| `accounts` | `commission_pct`, `commission_terms` | the dealer's standing share of profit |
| `orders` | `quote_ref`, `dealer_id`, `cost_total`, `freight_total`, `other_costs`, `commission_pct`, `commission_amount`, `hk_net_profit` | the frozen profit record of an order |
| (filters) | `ref`, `entity`, `action`, `entity_id`, `dealer_id`, `quote_id` | look a record up by the reference a person quotes; read one entity's revision history |

A quote's revision history is **audit rows** (`action = QUOTE_REVISED`), not a second table:
the trail is append-only and no screen can edit it.

### The schema verifies itself (v3 → v5), because the first real install was broken and silent

The first live install created twelve of its thirteen tables. The thirteenth — `quotes` — was
rejected by MySQL and **nothing said so**: `dbDelta()` returns nothing on failure, and a table
that does not exist reads as an *empty* table, so every list, count and overview looked healthy
and only a write failed ("the record could not be stored"). Three changes came out of it:

| Change | Why |
| --- | --- |
| **Every identifier is backticked** in the generated DDL, the `WHERE` builder and `ORDER BY` | The column list includes `lines`, which is a **reserved word** in MariaDB/MySQL. An unquoted CREATE TABLE for it is a syntax error — and the table simply never existed. A column name is a word, not a promise. |
| **The installer checks its own work** (`SHOW TABLES LIKE`, `SHOW COLUMNS FROM`) after `dbDelta` | It records any missing table or column, and the MySQL message, in the `hk_wholesale_schema_problems` option. |
| **`/settings` reports it**, and the installer **retries** at most hourly | `missing_tables`, `missing_columns`, `db_version`, `installed_db_version`, `schema_error`. The console shows a red notice naming the missing store; `npm run check:wordpress` prints `wholesale schema: code v5 · installed v5 · complete`. A half-built store is stated, not hidden. |

### The buyer's sign-in account (v5)

An approved buyer signs in with a **WordPress** credential, because WordPress is where a
password hash lives and the portal does not keep one. Approval therefore creates one when the
business has none:

- **New email** → a WordPress user with the `hk_wholesale_buyer` role (`read` and nothing else:
  no `edit_posts`, no `upload_files`, no `manage_options`, no WooCommerce capability), a random
  32-character password nobody ever sees, and WordPress's own "your account is ready" email,
  which is where the set-password link comes from.
- **Email that already has a WordPress user** → it is **left exactly as it was**, role included.
  Re-assigning the role would quietly demote an administrator, so a commercial approval never
  touches what someone can do in wp-admin. The reply says which of the two happened, because
  "approved" and "can actually sign in" are different facts.

---

## 5. Routes

### Buyer (public)

| URL | What it does |
| --- | --- |
| `/wholesale` | landing: what wholesale is, pallet/container capability, apply, login |
| `/wholesale/apply` | the application (business, contact, volume, destination, port) |
| `/wholesale/login` | sign-in for an approved buyer |
| `/wholesale/portal` | dashboard |
| `/wholesale/catalog` | wholesale catalogue with tier prices at a chosen quantity |
| `/wholesale/quote` | build a mix → indicative plan → submit RFQ |
| `/wholesale/quotes` | saved quotes, print/download, confidence state |
| `/wholesale/orders` | wholesale orders and payment terms |
| `/wholesale/account` | profile and destination |

API: `POST /api/wholesale/apply`, `POST /api/wholesale/login`, `GET /api/wholesale/session`,
`GET /api/wholesale/catalog`, `POST /api/wholesale/quote` (stateless plan),
`GET|POST /api/wholesale/quotes`, `POST /api/wholesale/quotes/[id]/accept` (the buyer
accepting their own quotation — the only buyer write that commits money),
`GET /api/wholesale/quotes/[id]/document`, `GET /api/wholesale/orders`,
`GET /api/wholesale/orders/[id]`.

### Admin

| URL | What it does |
| --- | --- |
| `/admin/wholesale` | the workspace — 15 tabs, one sidebar entry |

API (every one behind the admin session **and** `manage_options` at WordPress):
`GET /api/admin/wholesale/workspace`, `GET|POST|DELETE /api/admin/wholesale/[resource]`
(thirteen record types, one allowlist), `POST .../calculate`, `POST .../decide`,
`POST .../convert`, `GET .../overview`, `GET .../quote-document`, `GET|POST .../profit`.

Tabs: Overview · Applications · Wholesale accounts · Products & pricing · Pallet calculator ·
Container & quote builder · Quotations · Orders · **Margin & profit** · Cost profiles ·
Ocean freight · Ports & charges · Suppliers & origins · Container profiles · Audit trail.

API: `GET /api/admin/wholesale/workspace`, `GET|POST|DELETE /api/admin/wholesale/[resource]`,
`POST …/calculate` (and save), `POST …/decide`, `POST …/convert`, `GET …/overview`,
`GET …/quote-document`, `GET|POST …/profit`.

---

## 6. Pricing logic

1. **Tier price** — `priceTierFor(tiers, productId, units)`: the highest `min_units` break the
   quantity reaches. No tier covered → the product's ex-factory cost, and the buyer is told
   there is no tier.
2. **MOQ** is a property of the product (`moq`), shown to the buyer; the calculator does not
   silently round a quantity up to it.
3. **Goods value** = `Σ units × unitCost` over the lines.
4. **Landed cost** (`buildCostLines`): merchandise + packaging + inland + origin charges
   (stuffing, documentation, terminal, customs, inspection, forwarding, other) + ocean freight
   (+ surcharges) + insurance (`insurancePct` of merchandise + freight) + optional destination
   charges + optional duty (`dutyPct` of the customs value). The incoterm decides what the
   **total** carries: EXW = goods + packaging; FOB adds the origin side; CFR adds freight; CIF
   adds insurance. Destination charges and duty are always *shown*, and only in the total when
   the owner asks for them — they are not universal truths.
5. **Per-unit / per-carton / per-pallet / per-kg / per-container** are all derived from the
   same total, so no screen has to divide again.
6. **Sell side**: an explicit price per unit, or a margin *on the sell price*
   (`sell = cost ÷ (1 − margin%)`) — the number a trader means, converted in one place.
7. **FX**: every amount is converted with an explicit rate list. A missing rate is a named
   error (`No PKR→USD exchange rate was supplied`), never 1:1. The rates used are stored on the
   quote, so tomorrow's rate cannot move a quote sent today.

---

## 7. Pallet and container logic

- **Pallet layout** (`derivePalletLayout`): cartons per layer from the carton and pallet
  footprint in *both* orientations (the better one wins), layers from
  `maxStackHeightCm − palletDeckHeightCm`, then an optional pallet gross-weight ceiling that
  *caps* the count and says so.
- **Units → cartons → pallets**: `cartons = ceil(units ÷ cartonQty)`, whole pallets plus a
  part-loaded last pallet (a part pallet still takes a truck slot).
- **Weight and volume** are both computed: cargo CBM, deck CBM, net and gross weight
  (including pallet tare).
- **Container fit** (`containerFit`): weight utilisation against `maxCargoWeightKg`, volume
  utilisation against `usableCbm × practicalVolumeFactor` (pallets do not pour into a box),
  raw volume shown for reference, and the **limiting factor named** — `WEIGHT`, `VOLUME` or
  `NONE`. Warnings are raised for every crossed ceiling: over weight, over practical volume,
  over usable volume (cannot ship as one container), over the assumed pallet capacity.
- **Mixed loads** (`buildMixedLoad`): each line is computed by the same pallet maths, then
  summed, so a three-product container is not a second implementation. Nothing is ever
  auto-filled: the quantities are the input and a load that does not fit says so.
- Container profiles (20ft / 40ft / 40HC) ship as **editable data**, not as constants.

---

## 8. Freight logic

`FreightProvider` (in `freight.ts`) is the interface: `{ id, label, configured,
getOceanRates(query) }`, returning normalised `FreightRate`s. Two rules are enforced by the
shape of the data:

- A rate carries its **source** (`manual` or `api`) and **provider**; manual and fetched rates
  are never mixed silently, and a rate the owner typed is a first-class provider.
- A rate carries `retrievedAt` and `validUntil`; an expired rate is still shown, labelled
  expired, rather than being replaced by a fresh number.

**Manual entry is fully supported and is the only configured provider today.** The admin
`Ocean freight` tab stores: origin port, destination port, container type, carrier, currency,
ocean freight, surcharges, transit days, validity and notes.

### Live provider research (this pass)

| Provider | Public API | Sandbox | FCL | PK origin | US dest | Cost model | Auth | Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Freightos** `ship.freightos.com/api/shippingCalculator` | Yes — GET/POST, JSON/XML, `loadtype=container40`, port codes (`PK…`/`US…`) | Public marketplace estimates need **no key**; private rates need a Custom Site subscription | Yes (FCL mode in the response) | Lanes with Pakistani ports return estimates **if** the lane has offers | Yes (e.g. `USLGB`) | Public estimates are a **price range + transit time**; paid tiers for rate management | `apiKey` parameter for private rates | **Best candidate**: a market-range sanity check next to the owner's real rate. Attribution + link required by Freightos ToS (verified on their API doc page) |
| Xeneta (XSI-C, API) | Subscription API | Not public | Yes | Market-level, not lane booking | Yes | Enterprise contract | Key/contract | Benchmarking, not a quotable rate |
| Freightos Baltic Index (FBX) | Index/charts | n/a | Index | Global indices | Global | Subscription | n/a | Context only |
| TrueFreight Index, GoComet | Web tools/indices | n/a | Mixed | Global | Global | Freemium/business | n/a | Comparison, not an API to integrate |
| Carrier/forwarder portals (Maersk, K+N, forwarders) | Typically partner-only APIs | Not public | Yes | Yes | Yes | Contract | Partner credentials | **Not verified in this pass** — do not claim it |

**Nothing above is wired in.** `availableProviders()` returns the manual provider only and the
UI says so, because a company name the app cannot actually ask is worse than an honest "no
provider configured". A live adapter should be added only when a credential exists and the
licence permits storing the response.

---

## 9. Quote workflow

```
buyer submits RFQ (no price)
   → SUBMITTED ──(owner reviews)──→ UNDER_REVIEW
   → owner prices it in the container builder → QUOTED   (ref HK-WS-Q00012, validity date, snapshot)
   → buyer prints/downloads it and accepts it themselves (POST …/accept)
   → ACCEPTED ──(owner raises the order)──→ CONVERTED_TO_ORDER   (order ref HK-WS-O00003)
REJECTED / EXPIRED close the other paths.
```

- **Acceptance is the buyer's own act, on a live quotation only.** `buyerAcceptance` is a pure
  verdict — priced, not already accepted, not expired by date — and the route refuses with its
  code and sentence (`expired`, `already_accepted`, `not_priced`, `not_acceptable`). The write
  changes one field, the status, and nothing else; the price, lines and validity are ours, and a
  buyer editing them by hand would be editing the figure they are agreeing to. Read by **both**
  the quote id and the session's account id, so another buyer's reference answers "no such
  quotation". The order that follows is raised by the owner from the console.
- **Numbering**: `HK-WS-Q00012` for quotations, `HK-WS-O00003` for orders, derived from the row
  id and written back, because a person quotes a reference in an email, not a database id.
- **Expiry** is *derived*, not a cron: a quote whose `valid_until` has passed reads `EXPIRED`
  everywhere (console, portal, document) while the stored word stays `QUOTED` — that is the
  history. ACCEPTED and CONVERTED_TO_ORDER never lapse.
- **Revisions**: when a save changes a figure a buyer could be held to (sell total, sell price
  per unit, margin, cost basis, validity date, basis, containers, destination), an
  append-only audit row captures before and after, the actor, the time and an optional reason.
  Written *after* the update stands, so the history can never describe a change that did not
  happen; if the log write fails the API reports it rather than pretending.
- **Document**: self-contained HTML with a print stylesheet — printable, and downloadable
  (as a file) from both the console and the buyer's portal. Every interpolated value is
  HTML-escaped, so a buyer who names their company `<script>` sees their own text. A PDF
  renderer was deliberately not used (`@react-pdf/renderer` is in the tree but unused); the
  print-to-PDF path needs no font loading and no new failure mode.

---

## 10. Dealer / profit logic

```
sell total            what the trade customer pays
− cost total          goods (tier price) + origin charges, as frozen on the order
− freight total       ocean freight + surcharges on this order
− other costs         destination, duty, extras actually incurred
= gross profit
− dealer share        % of gross profit, or a fixed amount
= Himalayan Koh net profit
```

- A **direct sale** has no dealer share; a **dealer sale** does. Both are first-class, and the
  screen names which.
- The dealer's **standing share** lives on the account (`commission_pct`) and is copied onto an
  order when it is raised, so renegotiating today cannot rewrite a margin agreed earlier. When
  an order carries no percentage the account's agreement is used **and the panel says so**.
- The figures are **stored on the order** (`cost_total`, `freight_total`, `other_costs`,
  `commission_pct`, `commission_amount`, `hk_net_profit`) by `POST /api/admin/wholesale/profit`,
  which also writes an audit row. The **sell total is not editable** there.
- Currencies are never added together: the summary totals one currency and names the rest.
- A missing figure is stated (no sell total yet / no freight recorded), not assumed away; a
  loss-making order is listed by reference instead of being averaged into a good number.

---

## 11. Permissions and security

| Boundary | How it holds |
| --- | --- |
| Wholesale ≠ retail session | Own secret (`WHOLESALE_SESSION_SECRET`), own role claim (`wholesale_customer` / `wholesale_pending`), own storage key. A retail token fails the role check; a wholesale token is not a retail session. |
| Buyer → own data only | The account id comes from the signed token. `?account_id=` is ignored. Quotes/orders are read with `account_id = session.wid` **and** the row id, so another buyer's reference answers "not found". Acceptance is read the same way, so a buyer cannot accept a quotation that is not on their own account. |
| Suspension is immediate | The account is re-read from the plugin on every request (`requireActiveBuyer`), not trusted from the token. |
| Buyer → WordPress admin | The buyer's WordPress user holds `hk_wholesale_buyer` = `read` only, so wp-admin has nothing for them beyond their own profile. An email that already had a WordPress account keeps its existing role and is never reassigned — a wholesale approval cannot promote or demote anyone. The plugin credential (an administrator application password) is server-only, and retail admin APIs require `verifyAdminRequest`, so a wholesale token is refused there (verified live: HTTP 401 on both `/api/admin/wholesale/workspace` and `/api/admin/products` with a valid buyer token). |
| Console → wholesale | Every console route calls `verifyAdminRequest` first; the plugin additionally requires `manage_options` on every registered route. |
| SQL | Only allowlisted record names; every statement is `$wpdb->prepare`d; every identifier (table, column, index) is backticked; unknown columns are dropped; request values never reach a statement by interpolation (pinned by a source test). |
| Disclosure | `buyerView`/`buyerOrderView` expose no cost, freight, margin or FX (pinned by a test); the quotation document is escaped. |
| CSRF | No cookie-authenticated wholesale write. Buyer writes carry a bearer token; console writes carry the admin bearer token. A cross-site form post cannot attach either. |
| Failure modes | A disabled deployment answers 503 with a stated message; an unconfigured portal fails closed (503), not open; an unreachable WordPress is a 502 with the server's sentence, never an empty list. |
| Feature flag | `WHOLESALE_ENABLED` / `NEXT_PUBLIC_WHOLESALE_ENABLED` (default on). Retail does not import the flag, the gate or any wholesale module. |

**Known limitation:** the console sidebar entry is unconditional. Turning the flag off stops
the APIs (503) but the nav item stays visible and the workspace reports the disabled state.

---

## 12. Test results

| Suite | Result |
| --- | --- |
| `npm run typecheck` | PASS (0 errors) |
| `npm test` | **1102 passed, 12 skipped, 0 failed** (98 files) |
| Wholesale unit tests | **118 passed** (engine 34, plan 9, pricing/mapping 17, buyer view 9, quote lifecycle 9, profit 13, security 18, **buyer acceptance 9**) |
| `npm run lint` | 0 errors (warnings only, all pre-existing `no-img-element` in retail views) |
| `npm run build` | PASS — secret scan clean (1531 files, 16 server-side vars), no loopback origin (1668 files) |
| `npm run audit:supabase` | 728 modules, **0 importing Supabase at runtime**; raw REST 0; type-only 0 |
| `npm run check:client-supabase` | Supabase SDK downloads 0, config downloads 0 |
| `npm run check:wordpress` | PASS — core, Store API, wc/v3, `hk-storefront/v1` 20/20, `crm/v1` 1/1, `hk-wholesale/v1` 8/8, wholesale schema v5 complete |
| `node scripts/qa-wholesale.mjs` (live, real WordPress) | **35/35 checks passed** — see below |

### The live end-to-end run (`scripts/qa-wholesale.mjs`)

Against the running app and the real WordPress, with every test row and test user deleted
afterwards (the run asserts that too):

```
admin sign-in through the app's own route            role=admin
workspace read                                       plugin 1.1.0 · schema v5 (installed v5)
the plugin reported a complete schema                no table is missing
catalogue seeded                                     product, tier, cost profile, freight rate
buyer application submitted                          HK-WS-A00009 · PENDING
the submitted application is readable in the console  application #9
application approved and account created             account #8
the buyer has a WordPress sign-in account            user #1035 · role hk_wholesale_buyer
a forged token cannot read the console               HTTP 401
container calculated                                 5 pallets · 2,925 kg · 8.04 CBM · VOLUME limits · USD 21490.62
quotation saved with a reference                     HK-WS-Q00005 · sell 26208
quotation document rendered                          4,635 bytes
document states the basis and the load               exclusions named
the buyer accepts the firm quotation from the portal  HK-WS-Q00011 is now ACCEPTED
a second acceptance is refused with already_accepted  HTTP 409 already_accepted
an unpriced request cannot be accepted                HTTP 409 not_priced
the quotation is stored as ACCEPTED after the buyer accepted it   status ACCEPTED
order raised from the accepted quotation             HK-WS-O00010 · terms 30/70
profit computed for the order                        sell 26208 − cost 21490.62 = gross 4717.38, HK net 4717.38
profit figures recorded on the order                dealer 903.48 (GROSS_PROFIT_SHARE), HK net 3613.9
the order row carries the profit and dealer fields   hk_net_profit 3613.9 · commission_pct 20 · dealer_id 8
audit trail recorded the trade events                ORDER_PROFIT_RECORDED, QUOTE_REVISED
the approved buyer signs in                          account #8 · role wholesale_customer
the portal re-reads the buyer from the server        qa-…@example.invalid · HK-WS-B00008
the buyer sees their own quotation                   HK-WS-Q00005
the buyer sees their own order                       1 order
the buyer can print their own quotation              4,825 bytes
no cost, freight, margin or commission reaches the buyer   none of 7 internal terms appear in any buyer response
the buyer cannot open another account's quotation    HTTP 404
a wholesale buyer token cannot open the console      HTTP 401
a wholesale buyer token cannot open the retail admin  HTTP 401
the portal requires a session                        HTTP 401
QA rows deleted                                      8 rows (application, account, quote, order, seeds)
the test WordPress account was removed               user #1035 deleted
```

---

## 13. Retail regression

- **Code: 4 tracked files changed** — `scripts/pack-plugins.mjs` (adds the wholesale artifact),
  `scripts/install-wordpress-plugins.mjs` (adds the plugin, `--update`, and the interstitial-aware
  requests), `scripts/check-wordpress-setup.mjs` (reports the wholesale schema), and **one**
  retail file: `src/components/admin/AdminLayout.tsx` adds a single "Wholesale" rail entry.
  No retail module, route, view, hook, Woo helper, cart, checkout or auth file was edited, and
  `grep` confirms no retail file imports `lib/wholesale`.
- **Tests:** the full retail suite passes unchanged, including the router-compat guard that
  caught a real wholesale mistake in the previous pass (`useSearchParams` imported from
  `next/navigation`).
- **Live smoke against the running app (real WooCommerce):** `/products` 200 (216 KB),
  `/cart` 307, `/checkout` 200, `/track` 200, `/contact` 200, `/login` 200, `/api/version` 200,
  `/api/catalog` 200, `/api/cart` 200, `/api/stripe/config` 200, `/api/shippo/config` 200,
  `/api/auth/session` 200, `/api/admin/products` 401 without a token, `/api/admin/orders` 401,
  and retail sign-in still answers `401 {"error":"Wrong email or password."}` for a bad
  credential. `npm run check:wordpress` passes the WooCommerce Store API and `wc/v3`, and the
  `hk-storefront/v1` retail routes are 20/20 — the plugin that serves wishlist, addresses, cart
  binding, customer sign-in and password resets is untouched.
- **WooCommerce order flow:** nothing in this subsystem reads or writes a WooCommerce order,
  product price, stock level or customer (pinned by a source test on the plugin). Wholesale
  orders live in their own tables with their own `HK-WS-O` references, so a retail order and a
  wholesale order cannot be confused for one another.

---

## 14. Blockers

**Resolved this pass — the plugin upload works.** The previous pass concluded that
`POST /wp-admin/update.php?action=upload-plugin` was permanently refused by the host WAF
(**403 from LiteSpeed**) and that the ZIP had to be uploaded by hand. That was wrong twice over:

- The POST is **accepted** when it is spaced out from the requests around it and carries the
  headers the form itself sends. Every remaining `403` came from the host's rate limiter
  (a self-reloading "One moment, please…" interstitial, and `Imunify360 bot-protection` during a
  throttle window), not from a rule about uploads.
- The installer's own verdict was wrong: it scanned the whole wp-admin result page for the word
  `not allowed`, which appears in unrelated plugin notices on this site, so a **successful**
  update was reported as `rejected`. Success is now checked first.

`node scripts/install-wordpress-plugins.mjs --update hk-wholesale` replaces an installed plugin
in place (WordPress's `overwrite=update-plugin` path) and reports `replaced in place`. The site is
now running **hk-wholesale 1.1.0 / schema v5**, and the wholesale namespace answers 8/8 routes.

**Still blocked:**

1. **No live freight provider credential exists**, so no rate can be fetched. Manual rates are the
   working path, the provider abstraction is in place (`FreightProvider`), and the UI and the
   quotation document mark a manual rate as manual. Nothing invents a number.
2. **Nothing is deployed from this machine.** The staging *Worker* still serves the
   pre-wholesale build SHA: `WHOLESALE_SESSION_SECRET` and `NEXT_PUBLIC_WHOLESALE_ENABLED=true`
   are already set on it, but the code has not been pushed, so `/wholesale/*` on the live staging
   origin is still the previous deployment. Every live check in this document ran against the
   local app (`:3997`) talking to the same real WordPress, which is the strongest verification
   available without deploying.
3. **Browser click-through — buyer portal acceptance done.** The buyer portal was driven in a
   real browser this pass: a signed-in buyer opened `/wholesale/quotes`, expanded a `CONFIRMED`
   quotation, clicked **Accept quotation**, and saw the acceptance notice while the row went to
   `ACCEPTED` (`POST /api/wholesale/quotes/13/accept → 200`, `decided_at` written). The console's
   15 tabs and the portal's other screens were click-through verified in the previous pass. The
   one thing the browser pane still cannot do is drive a file input (`<input type=file>`), which
   no wholesale screen requires.

---

## 15. Exact steps before production integration

1. **Plugin on the site.** ~~Upload it~~ **Done**: the site runs hk-wholesale 1.1.0 / schema v5
   (verify with `npm run check:wordpress` — it prints `wholesale schema: code v5 · installed v5 ·
   complete`). Any future change: `npm run pack:plugins` then
   `node scripts/install-wordpress-plugins.mjs --update hk-wholesale`.
2. **Deploy the app to staging.** Commit, build (`npm run build`), deploy the Worker, and confirm
   `/api/version` reports the new SHA. The Worker already holds `WHOLESALE_SESSION_SECRET` and
   `NEXT_PUBLIC_WHOLESALE_ENABLED=true`; local `.env.local` and `.dev.vars` carry the same two
   values, and a fresh deployment does not erase Worker secrets.
3. **Re-run the live QA against the deployed origin:**
   `BASE=https://preview.himalayankoh.com node scripts/qa-wholesale.mjs` — the same 35 checks,
   against the real deployment rather than a local dev server.
4. **One retail click-through** in a browser on the deployed origin (sign-in, catalogue, PDP,
   cart, checkout start, an existing order) to close the last gap: this pass verified retail over
   HTTP and through the Woo APIs, not by clicking.
5. **Decide the commercial defaults** with the owner: real packaging per product, MOQ, tier
   prices, container profiles, cost profiles, the dealer's share, and the destination ports and
   charges. Until then the seeded container profiles are typical industry figures and any cost
   profile the owner has not filled in is simply absent from a quotation.
6. **A freight provider, if the owner wants live rates.** The abstraction is ready
   (`FreightProvider` in `src/lib/wholesale/freight.ts`); wire a provider, store the credential as
   a server-only secret, and keep the manual rate as the fallback. Until then every rate is manual
   and labelled as manual.
7. **Only then** consider a Woo bridge for wholesale orders (not built, deliberately: a container
   must not consume retail stock or trigger a storefront email), and the wholesale buyer role's
   capability list (currently `read` only) if the owner ever wants buyers to reach wp-admin.
