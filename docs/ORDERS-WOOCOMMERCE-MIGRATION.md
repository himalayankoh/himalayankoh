# Orders → WooCommerce: migration design

**Status: the new-order lifecycle is implemented; the historical import is not.
No production data has been migrated and no production table has been dropped.**

What has landed (see §7 for the step-by-step status):

- WooCommerce is the source of truth for **new** orders, end to end — creation at
  payment-intent time, the Stripe webhook, status and tracking writes, emails,
  customer history and the admin console.
- `stripe_checkout_sessions` is **gone** (no WordPress table replaced it: the
  PaymentIntent's own metadata names the WooCommerce order).
- The Supabase `orders`/`order_items` tables are read by **one** place —
  `src/lib/orders/legacyOrders.ts`, a read-only adapter for orders placed before
  this migration. Nothing writes them.

Still open: the historical import (§3.10), the Shippo packing inputs (§3.5, still
reads `product_packing_profiles`) and the admin screens that still read Supabase
through `lib/supabase/api/admin.ts` (`getShippingLabelOrders`, the dashboard
analytics). Those are named in §7.

Companion to `WORDPRESS-WOOCOMMERCE-MIGRATION.md` (§7 cart/checkout, phase 9) and
`STOREFRONT-WORDPRESS-CONTRACT.md`. The numbers below are measured by
`npm run audit:supabase`, not remembered.

---

## 1. Where orders are today

The migration is further along than the remaining table list suggests, and further
from finished than the "orders already go to WooCommerce" summary suggests. Both
halves are true at once:

**Already WooCommerce's:**

| Concern | Where it lives now |
| --- | --- |
| Order creation | `src/lib/woo/orders.ts` → `createWooOrder()`, called by `serverCreateOrder()` |
| Fulfilment status | two-way mapping in `woo/orders.ts`: native Woo status **plus** `_hk_status` meta for `packed`/`shipped`, which Woo has no status for |
| Payment status | `date_paid_gmt` first, `_hk_payment_status` meta second (`paymentStatusFromWoo`) |
| Totals | Woo's own fields — never recomputed here (`orderFromWoo`) |
| Customer history | `listWooOrdersForEmail()` — by billing email, because no Supabase row carries a Woo customer id |
| Order status writes | `updateWooOrderStatus()`, `markWooOrderPaid()`, `setWooOrderShipping()` |
| Admin stats | `statsFromWooOrders()` |
| Cart | `wc/store/v1` via `lib/woo/storeCart.ts` |

The Supabase order **insert** path is already deleted: `serverCreateOrder()` throws
if the Woo data source is off, rather than writing `order_items` rows whose
`product_id` would be a WooCommerce id (see the comment at the end of that
function).

**Still Supabase — the actual remaining work (7 modules read/write `orders`):**

| Module | What it does with `orders` | Table(s) |
| --- | --- | --- |
| `app/api/orders/get/route.ts` | reads one order for the confirmation page | `orders`, `order_items` |
| `app/api/orders/track/route.ts` | looks an order up by number + email for the tracker | `orders` |
| `app/api/admin/orders/legacy/route.ts` | the Supabase-era admin reader | `orders` |
| `app/api/shippo/create-label/route.ts` | reads the order to build a label | `orders` |
| `lib/orders/notifyOrderEvents.ts` | reads the order summary to send the emails | `orders` |
| `lib/stripe/server/updateOrderPayment.ts` | writes payment status after a Stripe event | `orders` |
| `lib/supabase/api/admin.ts` | the admin console's order list, order items, inventory | `orders`, `order_items`, `inventory` |

Plus two tables that only exist because the current design put them there:

- **`stripe_checkout_sessions`** (`lib/stripe/server/checkoutSessions.ts`) —
  pre-payment state: which cart, which amount, which payment intent.
- **`product_packing_profiles`** (`lib/shippo/packing/enrichLineItems.ts`) — the
  box-selection inputs for a Shippo quote.

And one integration log: **`hermes_evidence`** (`lib/hermes/evidenceStore.ts`),
which already has an in-memory fallback and is not on the order path.

### 1.1 Two live defects found while mapping this

Both are in the checkout path and both are consequences of the identity move, so
they are step 1 rather than a footnote:

1. **`/api/orders/create` still verifies a Supabase token.** `resolveUserId()`
   calls `supabase.auth.getUser(token)`, and customer sign-in has not minted a
   Supabase session since accounts moved to WooCommerce — so that lookup can only
   fail or return nothing. It then **falls back to `body.userId`**, a value the
   browser chose. The order is created with `meta._hk_user_id` set from it.
2. **Every Woo order therefore has `_hk_user_id = null`**, and a null there means
   the app cannot answer "this customer's orders" from the order itself. The
   customer history already works around that by reading **by billing email**
   (`listWooOrdersForEmail(includeGuests: true)`), which is why nobody noticed —
   but the workaround breaks the moment a customer changes their email address,
   and it silently merges a guest order into an account that shares the address.

Step 1 fixes both by deriving the identity from the customer session, which is what
every other route already does.

---

## 2. Target architecture

> **WooCommerce owns orders. This app owns no order rows, and its order shape is a
> projection of Woo's record, not a copy of it.**

Three consequences, all of which the existing `lib/woo/orders.ts` already respects:

1. **The app never recomputes money.** Totals, tax, discounts and shipping come
   from the order the store wrote. Where the app disagrees with Woo, Woo is right —
   the customer was charged Woo's number.
2. **App-only facts live in order meta, prefixed `_hk_`.** `woo/orders.ts::HK_META`
   is the single list. A fact that fits a native Woo field goes in the native field
   (status, `date_paid_gmt`, weight, tracking); meta is for what Woo has no field
   for.
3. **Nothing writes an order except WooCommerce + four named call sites**: order
   creation (post-payment), the Stripe webhook's paid/failed transition, the Shippo
   label write, and the admin status change. Each one goes through a function in
   `woo/orders.ts`, so "who can change an order" is a list of four, not a search.

A checkout session is deliberately **not** an order: it is payment-in-progress
state, it exists for minutes, and putting it in the order table means abandoned
checkouts become Woo orders the operator has to filter out of their own queue.
That decision is §3.2.

---

## 3. The ten areas

### 3.1 Order creation — Woo, already

`createWooOrder()` stays the only insert. What changes:

- the identity (`_hk_user_id`) comes from the **customer session**, not the body
  (step 1);
- the customer id is the **WooCommerce customer id**, so `createWooOrder` should
  also set Woo's native `customer_id` when the shopper is signed in, instead of
  only recording the id in meta. Native is what makes the order appear under the
  customer in Woo's own admin; meta alone is invisible there.
- guest checkout keeps working with no `customer_id`, as it does today.

**Acceptance:** a signed-in checkout produces a Woo order with
`customer_id = <the session's customer id>` and `meta._hk_user_id` the same value;
a guest checkout produces the same order with both absent and the billing email set.

### 3.2 Payment initiation — one new plugin table, not a new order status

Today: create `stripe_checkout_sessions` row → create Stripe PaymentIntent → webhook
on `payment_intent.succeeded` → finalize the session → create the Woo order.

After: the same sequence with the session row in **WordPress** instead of Supabase —
`hk_checkout_sessions`, in the plugin beside `hk_wishlist`/`hk_cart_sessions`, with
`state` (`open | processing | paid | failed`), `cart_token`, `amount`, `email`,
`payment_intent_id`, `order_id`, `expires_at`.

Why not create the Woo order first and promote it after payment: Woo's own checkout
does exactly that (its Store API writes a `checkout-draft` order), but that status
is managed by Woo's checkout flow, not a stable REST-v3 field this app can set and
promote reliably. Depending on it would make the app's most failure-prone sequence
depend on an internal Woo state. The session row is the smaller, honest dependency —
and it keeps the property the current code deliberately has: **no unpaid order ever
enters the store's order list.**

Conditions that would change this decision: if the owner wants abandoned checkouts
visible in Woo's own admin, or wants a single admin surface for "everything in
progress", then this becomes a Woo draft order and the session table goes away.
That is a product decision, not a technical one, and it is listed in §6.

**The row must expire.** A session with no `expires_at` sweep would accumulate
forever: the plugin's own `plugins_loaded` sweep deletes `open` rows older than
24 hours. Nothing but a session row is ever deleted by that sweep.

**Acceptance:** with the plugin inactive, checkout reports the missing plugin by
name (as the customer-account routes already do) instead of failing obscurely; a
completed payment creates exactly one Woo order; an abandoned session leaves no
Woo order at all and is swept.

### 3.3 Stripe metadata and idempotency

Three keys, and the current design's shape is kept because it is correct:

| Where | Key | Purpose |
| --- | --- | --- |
| PaymentIntent metadata | `checkout_ref` | the session id — the webhook's only way back to what was being bought |
| PaymentIntent metadata | `customer_id` | Woo customer id, when signed in (Stripe-side reporting) |
| Woo order meta (`_hk_payment_intent`) | the intent id | which payment paid this order |

Rules:

- **The idempotency key for intent creation is the checkout ref**, so a double-click
  or a retried request returns the same intent rather than charging twice.
- **The webhook is idempotent on the order, not on the event.** Woo order meta
  `_hk_payment_intent` is the lock: a webhook whose intent id is already recorded on
  an order that is already paid is a no-op. Stripe retries events by design, so
  "process every delivery" is not an option.
- **Amount comes from the session, and the session's amount comes from the Woo
  cart** (`wc/store/v1/cart` totals) — so the charged number is the store's cart
  total, not a client-side sum.
- The webhook path must never *create* an order it cannot match to a session:
  an unmatched intent is logged and ignored, because the alternative is an order the
  store cannot explain.

**Acceptance:** replaying the same `payment_intent.succeeded` twice leaves one paid
order; an intent whose ref matches no session creates nothing and logs once.

### 3.4 Woo order status mapping — done, no work

`woo/orders.ts` already carries the two-way mapping and prefers meta on read. The
migration does not touch it. What changes is only *who reads it*: the admin console
(`admin/orders`, `admin/orders/[id]`, `update-status`, `gift-drop`) moves from
`lib/supabase/api/admin.ts` to the projection, and `app/api/admin/orders/legacy`
is deleted with the table.

**Acceptance:** an order set to `shipped` in the console reads back as `shipped`
(not `processing`) from a fresh read, and shows as "Processing" plus a `_hk_status`
private note in Woo's own admin.

### 3.5 Shippo — rates from the cart, the label on the order, packing profiles in Woo

Already Woo-side: rates are quoted from the Woo cart, and a bought label is written
with `setWooOrderShipping()` (`_hk_tracking_number`, `_hk_tracking_url`,
`_hk_label_url`, `_hk_shippo_*`, carrier, service).

The remaining Supabase dependency is `product_packing_profiles` — the per-product
inputs the box-selection code needs (`lib/shippo/packing/enrichLineItems.ts`). It
should **not** become another plugin table. Woo already has the physical facts
natively, and they are editable in Woo's product editor where the owner can see
them:

| Fact | Home after migration |
| --- | --- |
| weight | Woo product `weight` (native) |
| dimensions | Woo product `dimensions` (native) |
| which box a product prefers | Woo product meta `_hk_packing_profile` (app-owned, same `_hk_` namespace as orders) |

`SHIPPO-PACKING.md` describes the box rules; this table is only where the inputs
come from. A product with no weight gets the existing honest failure (unknown
weight → no quote) rather than a default that would under-charge postage.

**Acceptance:** for the staging catalogue, a rates request for a cart of products
with Woo weight/dimensions set returns rates without reading any Supabase table; a
product with no weight is reported as unquotable rather than silently quoted.

### 3.6 Hermes / event integration

`hermes_evidence` is a **log**, keyed by order, with an in-memory fallback already in
place — meaning the Supabase write is already best-effort and nothing reads it that
cannot survive its absence (`lib/hermes/evidenceStore.ts`). Two honest options:

1. **Order-scoped evidence → Woo order notes** (`POST /wc/v3/orders/<id>/notes`,
   native). It lands where the operator already works, needs no new table, and is
   visible in Woo's admin next to the order it describes. This covers what Hermes
   records about an order.
2. **Anything not about an order** → a plugin table (`hk_hermes_evidence`), or
   nothing at all until a reader exists.

Recommended: (1) for order-scoped rows, (2) only when a reader exists — with the
same rule the notifications cleanup followed: a writer with no reader is not a
feature, it is dead code with a database bill.

**Acceptance:** the Hermes ingest path writes a note on the Woo order and the
console's evidence view reads it back; no Supabase table is read.

### 3.7 Transactional email — one owner per message

Two systems can send mail about an order, and the failure mode is the customer
getting two of everything. Split by who can do it better:

| Message | Owner after migration |
| --- | --- |
| "Order received" / processing / completed | **WooCommerce** (its own customer emails, already enabled per status) |
| "Your payment was received — ship it" (internal) | this app → `sendAdminPaymentReceived`, from the webhook |
| "Your order shipped" + tracking | this app → `sendBuyerShippedEmail`, because the tracking number is Shippo's and Woo's email would have to be re-templated to carry it |
| Password/account email | WordPress (already) |

`lib/email/orderEmails.ts` is provider-agnostic and takes an `OrderEmailSummary` —
the migration changes only where that summary is read from (`orderFromWoo`), not
the templates. Turning Woo's own "order received" email on is a Woo setting, and it
must be done in the same change that keeps the app's copy quiet, or the duplicate
starts immediately.

**Acceptance:** one paid order produces exactly one customer "order received" email
(sender Woo), one internal alert, and no duplicate from the app.

### 3.8 Customer order history

Target: read by **customer id** — `listWooOrders({ customerId })` — with the email
read kept only as a **guest fallback**, because most historical orders were placed
as guests and carry no customer id.

`/api/account/orders` already picks email-vs-id at the route boundary; the change is
that new orders make the id path the normal one, so the email fallback narrows to
pre-migration orders and guests. The route must keep passing `includeGuests: true`
for the fallback only, and must never merge on email alone once the customer id is
known.

**Acceptance:** a signed-in customer's history contains their Woo orders by customer
id; an order placed as a guest with the same email still appears; an order belonging
to a *different* customer with a similar address never does.

### 3.9 Admin order management

`app/api/admin/orders*` moves to the Woo projection behind the same admin
authentication (`verifyAdminRequest`), with these rules:

- **list** → `listWooOrders()` with the console's filters mapped to Woo query params;
  `statsFromWooOrders()` replaces the Supabase aggregate;
- **detail** → `getWooOrder(id)` → `orderWithItemsFromWoo()`;
- **status change** → `updateWooOrderStatus(id, appStatus)`;
- **cancel/refund** → Woo's status plus Stripe refund, in that order (Woo is the
  record; a refund that succeeds in Stripe while Woo still says `processing` is the
  one unrecoverable inconsistency);
- **`admin/orders/legacy`** → deleted with §3.10, since it exists only to read the
  Supabase table.

Note the admin console is the one surface the owner asked to leave alone
(`/admin/*` routes are deliberately still on Supabase). This step is therefore
last, and it is a *repoint*, not a redesign: the screens keep the shapes they render
today, because the projection was written to match them.

**Acceptance:** the console lists, opens, filters and changes status of live Woo
orders, with the same column values as the Woo admin for the same orders.

### 3.10 Historical Supabase orders

Requirement: an existing customer who placed an order before the migration must
still find it, and the operator must still find it.

Chosen approach — **import into Woo, once, idempotently**:

- rows from Supabase `orders` (+ `order_items`) become Woo orders with the original
  `date_created_gmt`, the original totals (sent as line prices), `_hk_legacy_id`
  meta, and a private order note: "Imported from the Supabase order record".
- the import is keyed on `_hk_legacy_id`, so re-running it updates rather than
  duplicates, and it can be run in staging, re-run, and diffed.
- statuses map through the same two-way table as everything else; `payment_status`
  is carried in `_hk_payment_status` so a legacy paid order does not look unpaid.
- **no email is sent** for an imported order — it already happened, years ago in some
  cases. Woo's order-email suppression per import is a required part of the step.

Kept as a temporary alternative: `admin/orders/legacy` continues to read Supabase,
read-only, until the import's row counts match. That is the dual-*read* window of §4.

**Acceptance:** for every paid Supabase order, an order exists in Woo with the same
number, total, email and payment status; a legacy order is visible to its customer in
account history and to the operator in the console; re-running the import creates no
duplicate.

#### Status (measured 2026-09-22, `npm run migrate:orders` — dry run)

The importer exists and is measured. `scripts/migrate-legacy-orders.mjs` reads both
sides, prints the migration report and writes it to
`supabase-backup/legacy-orders-migration-report.json`; it writes nothing unless it is
given `--apply`. The deployed order set is small and entirely mappable:

| Measured | |
| --- | --- |
| Orders | **14** (23 line items) |
| Date range | 2026-07-16 → 2026-08-19 |
| Statuses | `pending` 10, `delivered` 2, `shipped` 2 |
| Payment statuses | `pending` 10, `paid` 4 |
| Currency | USD 14/14 |
| Orders with no line items | **0** |
| Orders with no email | **0** |
| Line items that do not sum to the stored subtotal | **0** |
| Orders whose own arithmetic (subtotal + shipping + tax − discount) misses the stored total | **0** |
| Product mapping | not needed — line items are written with their own name, grain size and price, so nothing depends on a Supabase product id surviving |

One correction worth recording: the first version of the check compared the line-item
sum against the *grand* total and reported 12 of 14 orders as inconsistent. They were
all correct — the difference was the shipping the total includes. A reconciliation
that cries wolf on correct data is worse than none, so the check now models the total.

**Blocker (one, and it is a credential):** `--apply` posts each order to
`POST /hk-storefront/v1/legacy-orders/import`, which silences every WooCommerce email
for the duration of the request. That endpoint needs an administrator application
password (`WORDPRESS_ADMIN_USER` + `WORDPRESS_ADMIN_APP_PASSWORD`), and none is
configured in this environment. It cannot be replaced by the WooCommerce REST API:
that API has no way to create an order without firing the customer emails, so an
import through it would email fourteen customers about orders from last month.

**The single human action required:** WordPress → Users → Profile → Application
Passwords → add one, then set `WORDPRESS_ADMIN_USER` and
`WORDPRESS_ADMIN_APP_PASSWORD` in the deployment's environment and run
`npm run migrate:orders -- --apply`. Nothing else in this migration is waiting on a
person.

---

## 4. Dual read/write policy

**No dual writes, at any point.** Two writers for one order is how a store ends up
with an order that was shipped according to Woo and refunded according to Supabase.
The Supabase tables become **read-only** the moment step 1 lands, and are deleted
only after the conditions below.

**Temporary dual read** — one case only: the historical-order importer (§3.10) reads
Supabase while the console can also read it through `/api/admin/orders/legacy`.

| | |
| --- | --- |
| **Start condition** | Step 1 (identity fix) merged, and steps 2–4 read orders from Woo in staging with a Woo order created end to end. |
| **End condition** | Both, measured, for 14 consecutive days: (a) `/api/admin/orders/legacy` receives no requests, and (b) a reconciliation query reports the same count of paid orders in Woo (`_hk_legacy_id` or native) as in Supabase `orders` with `payment_status = 'paid'`. |
| **Rollback path** | This is why the start condition is what it is: from step 1 onward, **new orders exist only in Woo**. Rolling back means redeploying the previous Worker version — the app's old reader would then be blind to orders placed in the interim, while those orders are safe in Woo. No data is lost in either direction, which is what makes the switch safe; the residual risk is a *visibility* gap in the old app, not a correctness one. Supabase rows are never mutated by the new path, so rolling back the code restores exactly the old behaviour with no repair step. |

**What is deleted when:** `stripe_checkout_sessions` is dropped from Supabase only
after the plugin's session table has served a full payment cycle in production;
`orders`, `order_items` only after the end condition above; `hermes_evidence` only
after its reader has moved — which it now has, so that table's remaining question is
the data copy, not the code.

**`product_packing_profiles` has moved to Woo but its rows have not.** The packing
profile is now product meta `_hk_packing_profile` (`lib/woo/packingProfile.ts`), and
that is the only read path Shippo uses. Until the old rows are copied, a product whose
box dimensions were recorded only on the old database rates from its weight instead,
which can mean more parcels than the old system quoted. The copy is a data migration
with one open mapping question — the old rows are keyed by a Supabase product id, and
only SKU or slug bridges that to a WooCommerce product — so it needs a decision about
what to do with a row whose product no longer exists, exactly like the orders import.

---

## 5. Step sequence

Each step is independently shippable, and the one before it is the check that it is
safe. Steps 1–2 are small; the bulk of the work is 3–5.

| # | Step | Blocked by | Measured acceptance |
| --- | --- | --- | --- |
| 1 | **Identity fix**: `/api/orders/create` takes the customer id from the session (never the body); `createWooOrder` sets Woo's native `customer_id`; delete the Supabase `getUser()` call | nothing | the two §1.1 defects are gone; `npm run check:client-supabase` unchanged |
| 2 | **Checkout sessions in WordPress**: plugin `hk_checkout_sessions` + app store module; `/api/stripe/create-payment-intent` and the webhook repointed; idempotency per §3.3 | 1 | one completed payment = one Woo order; replaying the webhook changes nothing; an unmatched intent creates nothing |
| 3 | **Order reads from Woo**: `/api/orders/get`, `/api/orders/track`, account history by customer id with the guest fallback | 1 | the confirmation page and tracker serve live Woo orders; history contains both a post-migration and a pre-migration order |
| 4 | **Emails and shipping**: order summary from the projection; Woo customer emails on, app's duplicate off; packing inputs from Woo weight/dimensions + `_hk_packing_profile`; label write unchanged | 3 | §3.5 and §3.7 acceptances |
| 5 | **Admin console** (`/admin/orders*`) repointed to the projection; `admin/orders/legacy` deleted with the table | 3, 4 | §3.9 acceptance; the console shows no order the Woo admin does not |
| 6 | **Historical import** + the dual-read window of §4 | 5 | §3.10 acceptance; then the Supabase order tables are dropped |

`npm run audit:supabase` is the progress measure throughout: its `orders` /
`order_items` / `stripe_checkout_sessions` lines should each reach zero, and the
`SERVER` section of the source audit should shrink by the same seven modules.

---

## 6. Open decisions (owner input needed, not technical)

1. **Abandoned checkouts in Woo, or not?** §3.2. Keeping sessions out of the order
   table means an operator cannot see a half-finished checkout in Woo's admin. If
   that visibility matters, this design changes shape (session → Woo draft order).
2. **Who owns the customer's "order received" email?** §3.7 recommends Woo, which
   means the app's own confirmation copy is retired and the message the customer has
   been receiving changes. That is a customer-visible change and should be a
   deliberate one.
3. **Guest orders and email-based history.** Today a guest order can be found by
   email. After step 3 the fallback stays, which means anyone who knows an email can
   see those orders. That is the status quo, not a regression — but the alternative
   (claim-by-email-then-verify) is a real decision if it should change.
4. **Refunds.** Woo refunds and Stripe refunds are two systems; §3.9 says Woo is the
   record. Deciding which one the operator triggers, and whether a partial refund is
   in scope, is a workflow decision.
5. **`hk-storefront` is inactive on staging.** The customer-account, address and
   password-reset routes cannot be verified until the plugin is uploaded and
   activated there. This is the same blocker the customer-account and address work
   already reports by name. **The orders migration no longer depends on it**: the
   new-order lifecycle needs only `wc/v3`, which is already live on staging.

---

## 7. What is implemented, and what is not

Measured on this checkout: `npm run audit:supabase` reports the `orders` table read
by **2** modules and written by **none**, down from 7.

### Steps 1–5: done

| # | Step | Where it landed |
| --- | --- | --- |
| 1 | **Identity** | `lib/auth/customerRequest.optionalCustomerRequest` derives the customer id from the session; `/api/orders/create` and `/api/stripe/create-payment-intent` no longer read `body.userId`, and no longer call `supabase.auth.getUser`. `createWooOrder` sets Woo's native `customer_id`. |
| 2 | **Checkout sessions** | **Deleted, not ported.** There is no `hk_checkout_sessions` table: the WooCommerce order is reserved before the PaymentIntent (`lib/orders/serverCreateOrder.reserveOrderForCheckout`) and its id travels in `metadata.woo_order_id`. The order is matched to a repeat attempt on `_hk_cart_fingerprint`. |
| 3 | **Order reads** | `/api/orders/get` (Woo + ownership by session, legacy fallback), `/api/orders/track` (Woo by number + legacy fallback), `/api/account/orders` and `/[id]` (Woo by customer id/email). |
| 4 | **Emails and shipping** | `lib/orders/notifyOrderEvents` reads the summary from `orderFromWoo`; `/api/shippo/create-label` reads/writes the Woo order and records the label cost as a WooCommerce order note. |
| 5 | **Admin console** | `/api/admin/orders`, `/[id]` and `/update-status` were already on WooCommerce; `/api/admin/gift-drop` was the last Supabase order reader in the console and now reads the store. |

### §11 exit classification of every remaining `orders` use

The requirement was to classify each one rather than leave the answer implied.

| Use | Class | Action |
| --- | --- | --- |
| `lib/orders/legacyOrders.ts` | **LEGACY historical read** | **Deleted.** It existed to serve the orders the Supabase table held; all 14 are Woo orders now, so the console reads them from WooCommerce like any other order. |
| `app/api/admin/orders/legacy/route.ts` | **LEGACY historical read** | **Deleted** with the adapter above; `adminApi.getOrders` went earlier with `lib/supabase/api/admin.ts`. |
| `adminApi.updateOrderStatus`, `updateOrderPaymentStatus`, `getOrderAnalytics`, `getDashboardStats`, `AdminOrderAnalytics` | **DEAD** | **Deleted.** No caller since the console moved to `lib/woo/orders`; order figures now come from `statsFromWooOrders`. |
| `adminApi.getShippingLabelOrders` | **NEW-path gap** | **Closed**: `/admin/labels` reads `listWooOrders` and the Shippo metadata those orders carry. |
| `adminApi.getDashboardAnalytics` (orders + order_items), `adminApi.deleteProduct`'s `order_items` cascade | **UNRELATED to the order source of truth** | **Closed** with the admin catalog block: dashboard figures come from Woo orders, and trashing a product no longer consults an order table. |

Nothing in the **new-order lifecycle** reads or writes Supabase, and no remaining
runtime path reads `orders` or `order_items` at all.

### Step 6: applied

The historical import (§3.10) has **run against staging**: `npm run migrate:orders -- --apply`
reported 14 created, 0 failed, and a second run created nothing — idempotency is the
plugin endpoint answering `exists` for an id it has already imported. Each imported
order carries `_hk_legacy_supabase_order_id`, its original `date_created_gmt` and the
source totals, with WooCommerce email silenced for the duration of the request and the
line items written free-standing so no inventory moved. No production table has been
dropped or altered.

With the Woo orders present, `lib/orders/legacyOrders.ts` and its route were
**deleted** rather than kept as a carrier — the archive file
(`supabase-backup/legacy-orders.archive.json`) stays untracked as the offline record,
and its only remaining use is letting `migrate:orders` re-run somewhere that no longer
has Supabase credentials. `lib/supabase/adminClient.ts` and `lib/supabase/client.ts`
are **deleted** with the last importers, and `lib/stripe/server/supabaseAdmin.ts` was
already gone: nothing in the Stripe runtime touches Supabase any more.
