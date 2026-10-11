# Customer, order and content-accuracy audit — 2026-10-11

Production `himalayankoh.com` · WordPress/WooCommerce origin `wp.himalayankoh.com`
Branch `integration/cloudflare-workers-migration` · every read below is a GET; every
write is named with its rollback.

---

## 1. What was asked, and what was actually found

The owner reported **2,704 WooCommerce customer records** with random-looking
usernames, "Orders: Not reported" and "Spend: Not reported", and believed many
existing orders were test orders.

Both suspicions are confirmed **in part**, and the parts that are *not* confirmed are
the important ones — 2,704 is not a number that can be deleted wholesale on the
evidence that exists.

| Question | Answer | Evidence |
| --- | --- | --- |
| How many customer records are there? | **2,704** customers, **2,707** WordPress users (3 non-customer) | `/wc/v3/customers` `x-wp-total=2704`; `/wp/v2/users` `x-wp-total=2707` |
| Does the store report orders/spend per customer? | **No — neither field exists on any record** | `GET /wc/v3/customers/1` returns keys `…role, shipping, username` with **no** `orders_count` and **no** `total_spent` |
| So are the 2,704 all non-buyers? | **Not established by that field.** It is absent, not zero | same |
| How many orders exist? | **16** before cleanup, **14** live + **2** trashed after | `x-wp-total`, `reports/orders/totals` |
| How many customers have an order? | **3** (ids 16, 17, 20 — id 16 is the administrator) | orders carry `customer_id` 16, 17, 20 only |
| How many orders are payment-backed by Stripe? | **5 captured, live mode, `succeeded`** — $815.71 | `GET /v1/payment_intents/<_stripe_intent_id>` → `livemode: true`, `status: succeeded` |
| Confirmed test orders? | **2** (orders 2521, 2522) — now trashed, reversibly | see §4 |

### The "Not reported" columns are a store-side gap, not a rendering bug

`orders_count` and `total_spent` are **absent from the API response itself**, checked
on a single-customer read with no `_fields` filter. The console's honest rendering
("Not reported" rather than 0) was correct. What was *wrong* was the **"Buyers only"
toggle**, which filtered on `orders_count > 0` — a predicate that can never be true
on this store, so the filter could only ever return an empty list. That is fixed in
§5.

---

## 2. Provenance: how the accounts were created (Phase 2)

Read-only analysis of all 2,704 records (`scripts/audit-store-data.mjs`,
`scripts/probe-registration-source.mjs`):

| Finding | Count | What it means |
| --- | --- | --- |
| Accounts carrying any name | **3 of 2,704** | the registration path never collected a name |
| Local part is a 12+ character hex run with a digit | **674** | e.g. `a9f3aedfbbed4baf@…` — machine-generated |
| WordPress username is the same random hex string | 674 | `woocommerce_registration_generate_username = yes` derives it from the address |
| Distinct creation timestamps | 2,699 of 2,704 | **no bulk insert**: only 5 timestamps are shared, and by 2 accounts each |
| Id order vs creation order | **0 inversions** | ids and dates agree — accounts were created one at a time, not imported in one batch |
| Creation range | 2019-09-29 → 2026-09-29 | the store's whole life |
| Busiest days | 2026-09-26 (138), 09-23 (132), 09-28 (130), 09-27 (115), 09-22 (69), 2026-03-28 (68), 2025-06-26 (58) | recurring daily batches, roughly monthly, Jul 2025 → Sep 2026 |
| Domains | gmail 1,938 · hotmail 118 · yahoo 117 · aol 40 · comcast 24 · 239 domains total | consumer mailboxes |
| Reserved-domain accounts | 6 at `example.com` | **no customer can own one** |
| Name fields containing promotional text | 0 | not a comment-spam pattern |

**Root cause, with the store's own settings as evidence:**

```
GET /wc/v3/settings/account
  woocommerce_enable_myaccount_registration = "yes"
  woocommerce_registration_generate_username = "yes"
  woocommerce_registration_generate_password = "yes"
GET https://wp.himalayankoh.com/my-account/  →  HTTP 200, register form present (id="reg_email")
```

A **publicly reachable WooCommerce "My Account" registration form** was serving a
form that accepts nothing but an email address, generates the username from it and
generates the password — which is exactly the observed output: a random-looking
username, a matching address, no name, and an account that never buys anything. A
bot needs no more than that.

**What is *not* proven:** that a given one of the 674 is a bot rather than a person.
The form collected no name, so **every** account it ever created looks nameless —
which is why "no name" is the property of the path, not of the account.

---

## 3. Classification and the cleanup manifest (Phase 3)

Full per-record manifest: **[customer-cleanup-manifest-2026-10-11.csv](customer-cleanup-manifest-2026-10-11.csv)**
(2,704 rows. `email_local_sha256` is the first 10 hex characters of the SHA-256 of
 the address's local part, with the domain kept in clear — so the column is a
 digest, never the address, and one row cannot be turned back into a customer.
 Verified: for customer
 #2035 the value in this column (`413c4d502c`) is exactly the SHA-256 prefix of the
 live record's local part, which is 16 characters long — so the column is a digest
 and not the address. Use the
 `id`, not the address, to look a row up in wp-admin.) Counts:

| Class | Count | Evidence | Proposed action |
| --- | --- | --- | --- |
| `A_has_order` | **3** | an order carries this id or billing address | **preserve — never touch** |
| `B_reserved_domain` | **6** | `example.com` etc. (IANA-reserved) | quarantine, on approval |
| `C_machine_generated_no_name` | **616** | no name **and** a 12+ hex local part | quarantine, on approval |
| `D_nameless_suspicious` | **115** | no name, machine-shaped but unproven | review |
| `E_nameless_other` | **1,963** | no name, human-looking address | **review — cannot be decided from the data** |
| `F_named_review` | **1** | a name is present | review |

**No bulk deletion was performed, and none should be.** The mission's own rule —
present the manifest and counts for approval before anything beyond a small,
individually verified batch — is what applies here: 616 is not a small batch, and
the 1,963 in `E` are indistinguishable from genuine legacy registrations made
through the same nameless form. `E` is the class that needs the owner's knowledge
("do you recognise any of these? check against your MailerLite list"), not SQL.

**Recommended path for `C` and `B`:** the owner reviews the manifest, then a
reversible deactivation (role change or a quarantine flag) applied in batches of a
few hundred, each batch verified against its counts before the next. Irreversible
deletion only after retention obligations are checked, and never for `A`.

---

## 4. Orders: reconciliation, and the two confirmed test orders (Phases 4–5)

All 16 orders were classified individually by `scripts/audit-orders.mjs`, which reads
each transaction reference from order meta and asks the payment provider directly.
Result:

| Class | Count | Orders |
| --- | --- | --- |
| `A_verified_real_paid` | **5** | 1627 ($249.90), 1653 ($499.80), 1731 ($44.90), 1773 ($0.60), 2110 ($20.51) — Stripe `payment_intents` recognised, `livemode: true`, `succeeded` |
| `B_real_awaiting_payment` | 1 | 2468 (pending, Amazon Pay, no transaction reference) |
| `E_confirmed_manual_test` | **2** | **2521, 2522** |
| `F_failed_genuine_attempt` | 2 | 1772 ($0.49, Stripe, failed), 2469 ($299.85 → intent `requires_payment_method`, amount 0) |
| `G_unknown_needs_review` | 6 | 1733, 2113 (Amazon Pay), 2259 (Square), 2260 (PayPal), 2362, 2363 — completed but no provider I hold credentials for |

**Verified captured revenue: $815.71 across 5 orders.** The store's own completed
total is $1,506.01 across 11, so about $690 of "revenue" is unrealised — pending,
failed, gateway-test or unverifiable. That is the Sales & Profit accuracy finding.

### The two test orders — archived, reversibly

Orders **2521** and **2522** (both 2026-10-11) carried a `@example.com` billing
address, were created through the REST API rather than a checkout, and held a
`_hk_payment_intent` in Stripe state `requires_payment_method` with `amount: 0` — no
money, no customer, a placeholder address.

They were moved to WooCommerce's own trash:

```
node scripts/archive-test-orders.mjs --ids=2521,2522 --apply
```

`status: 'trash'` is rejected by this store's REST API (`rest_invalid_param` — the
field `trash` is not in the status enum, verified), so the supported path is
`DELETE /orders/<id>` **without** `force`: WooCommerce moves the record into its bin
and keeps the row, lines, meta and transaction references. The previous state is
written to `_hk_status_before_trash` first, so `--restore` puts each back where it
was.

Verified after: `orders?status=any` **16 → 14**, `status=trash` **2**,
`status=pending` **3 → 1**, `reports/orders/totals` pending **3 → 1**, both records
still readable with their line items and meta intact.

**Deliberately not archived:** orders 2362, 2363 and 2468 were placed by the
administrator's own account (#16) and look like gateway tests ($0.10, $46.78), but
they are *completed* Amazon Pay / PayPal records with no provider I can check. Under
"do not treat every unpaid order as a test", they are reported, not moved.

---

## 5. The console's "Buyers only" filter, fixed (Phase 6)

- **Before:** filtered on `orders_count > 0`, a field this store never sends ⇒ the
  filter's only possible output was an empty list, and the "N bought" line always
  said zero.
- **Now:** `src/lib/woo/customerActivity.ts` derives buyer status from the store's
  **orders**, matched by customer id first and by billing address for guest orders,
  in three bounded page reads. `src/lib/woo/customers.ts` filters on that, and the
  console labels each figure with where it came from ("from the order book" / "from
  a guest order").
- **The rule that matters:** a **truncated** order read yields `null` — *unknown* —
  never `0`. A console that cannot say who bought must not say nobody did. That is
  pinned in `customerActivity.test.ts`, and a *checked* zero is labelled as checked
  (`no-matching-order`) rather than as unknown, so the label never contradicts the
  figure beside it.

### The list was also not the whole list (found by running the filter live)

Running the new filter against the live store turned up a second defect: it returned
three accounts, and **customer #16 was missing from it although it has three orders**.

- `/wc/v3/customers` with no `role` parameter answers with role **`customer` only**:
  `x-wp-total=2704`. The store actually holds **2,707** accounts (`role=all`), and the
  three it withholds are **administrator** accounts. One of them is the owner's own
  account (`username ayazbashir`, created 2019-08-27), and it carries orders
  **#2362, #2363 (both completed, 2023) and #2468 (pending)**.
- So the screen's "2,704 customers" was the store's *default listing*, not its
  account count, and a buyer filter built on it could never show the store's two
  earliest completed orders. `src/lib/woo/customers.ts` now forwards a `role`, the
  console asks for `all`, the row carries the role, and the screen labels any
  non-customer account with a chip instead of passing it off as a shopper.
- **Verified live** (`role=all`): 2,707 accounts walked over 28 pages (2,704 `customer`
  + 3 `administrator`); the filter returns **4 accounts** — `#16` (administrator, 3
  orders), `#17` (2), `#979` (2, matched as a **guest order** by billing address) and
  `#20` (2). Every customer id an order points at (`16, 17, 20`) is now reachable.
- Pinned in `src/lib/woo/customers.test.ts` against a stubbed store: `role` is
  forwarded, the store's default stands when it is not asked for, an account with no
  order is dropped by the filter, and an account the read could not cover is not
  called a buyer.

---

## 6. Preventing the next 2,704 (Phase 7)

| Control | State | Evidence |
| --- | --- | --- |
| Our own sign-up route: per-IP budget (5/hour), reserved and disposable domains refused, abuse shape logged | **DONE** | `src/app/api/auth/customer/register/route.ts`, `src/lib/auth/signupGuard.ts` + 20 tests. An empty-body POST is refused `400` before any account is created; the route now also rejects `example.com`-class addresses, which the store's own junk records used |
| Store-side root cause: the public WordPress/WooCommerce registration form | **BLOCKED — needs a click in wp-admin** | `PUT /wc/v3/settings/account` answers **404 `rest_no_route`** for both the store's consumer key and the administrator application password, so this setting cannot be changed over the API from here. `GET` works, which is how the setting was read |
| WordPress's own registration form (`wp-login.php?action=register`) | closed | returns the plain login page, no registration form |

**Owner action (one checkbox, reversible):** WordPress admin → WooCommerce →
Settings → Accounts and Privacy → untick **"Allow customers to create an account on
the My Account page"**. Login is unaffected; the storefront's own sign-up at
`himalayankoh.com` is unaffected; re-ticking it restores the current behaviour. Until
that is done the public form at `wp.himalayankoh.com/my-account/` keeps accepting
bot sign-ups.

---

## 7. Content corrections applied (Phase 8)

Every write below used a script that snapshots the record first
(`backups/2026-10-11-content-backup/` **and** `.git/`), writes only named fields, and
re-reads the record to assert that everything else is byte-identical.

### WordPress posts

| Record | Change | Verified |
| --- | --- | --- |
| **2268** `why-do-dairy-cows-need-trace-minerals` (indexable) | closing "contains 84 trace minerals – all the essential minerals your dairy cows need" replaced; the article now states that salt supplies sodium and chloride and is **not** a complete mineral supplement | content matches file; title, slug, status unchanged |
| **1940** (draft twin, same claim) | same correction | status still **draft** |
| **233** `himalayan-pink-vs-white-salt` | title changed to "Himalayan Pink Salt vs. White Salt for Livestock and Dairy"; "world's purest salt", "up to 84 trace elements", the five-outcome sentence, "healing magnesium", the competitor-illness allegation and the closing performance promise all removed | content matches; slug/status unchanged |
| **2475** `how-to-cook-with-himalayan-pink-salt` | link text "Himalayan Koh **Salt That Heals** YouTube channel" → "Himalayan Koh YouTube channel" (the channel keeps its name and URL) | content matches; 0 occurrences remain |

Source files: `docs/production/content-corrections/post-2268.html`, `-233.html`,
`-2475.html`; the local mirror `docs/content/how-to-cook-with-himalayan-pink-salt.html`
was updated to match.

### WooCommerce listings — copy corrected, commerce untouched

| Product | SKU | What was removed |
| --- | --- | --- |
| 2544 | `HK-LB-30LBS` | "essential minerals and nutrients for proper growth, good health, and impressive development" |
| 2543 | `HK-LFH-2lbs` | "essential minerals and electrolytes… support horse health and energy levels"; the deer reference for a product line that does not exist |
| 2539 | `HK-LFC-45lbs` | **"up to 84 nutritious minerals"**, "stay healthy and be more productive" |
| 2536 | `HK-ESF-6lbs` | "tailored mineral solution to promote optimal health" |
| 2531 | `HK-ESF-3lbs` **(stays draft)** | "naturally rich in minerals… prized for its purity", "wellness routines", beauty-treatment use |
| 2526 | `HK-ESF-16oz` | "**the purest pink salt on the market**", "unique mineral composition" |

Short description, long description, `_yoast_wpseo_metadesc` and `_yoast_wpseo_title`
were written. Read back for every product: `shortDescriptionMatches: true`,
`yoastMatches: true`, **`commercialFieldsChanged: []`** — SKU, price, regular/sale
price, stock status, stock quantity, images, categories, attributes, slug and status
all byte-identical. Product **2531 remains a draft**.

### App-rendered copy

| Record | Change |
| --- | --- |
| `src/views/AboutPage.tsx` | the Darolyn Butler testimonial — which credited a change of salt with horses being "the healthier and able to thrive" — is **removed from display** and retained verbatim in `content-corrections/removed-testimonial-darolyn-butler.md`. Not rewritten: rewording a customer's words would misquote them. James A. Brenek's product-quality testimonial is kept, now published under a line stating these are customers' own comments |
| `src/views/HomePage.tsx` | "significantly better than compressed salt blocks" → "easy to see and check, and they do not blow away"; card titles "Essential Electrolyte Support" → "Sodium and Chloride", "Weather-Resistant Durability" → "For Outdoor Placement" (claim of "reducing waste" removed), "Naturally Sourced Minerals" → "Unrefined Rock Salt" |

Re-run claim sweep over posts, pages and products: the only remaining matches for
"mineral supplement" are the **disclaimers** — "it is not a trace-mineral
supplement".

---

## 8. The legacy WordPress theme pages (Phase 9)

The **WordPress origin `wp.himalayankoh.com` is publicly reachable and serves a
legacy ThemeForest-era theme** with 39 pages, including a demo home page. The claim
sweep found unsupported content there that exists nowhere in the app:

| Page | Found | Action taken |
| --- | --- | --- |
| **35** `home` | "~ World's Best for Livestock ~" (twice, as a heading and a subtitle); "up to 84 nutritious minerals and trace elements… stay healthy and be more productive"; the magnesium **"naturally heal, stay well, and become stronger"** sentence; a deer reference; "growth can peak out earlier"; lorem-ipsum demo blocks in the mineral tabs | **corrected** — 5 exact-string replacements via `scripts/apply-text-replacements.mjs`, each required to match exactly once. No shortcode was touched and the layout is unchanged |
| **42** `about-us` | "considered the finest in the world for both humans and animals"; "filled with many of the minerals and trace elements mammal bodies need to stay healthy"; "milk production"; heading "Over 80 Minerals Available in Himalayan Salt" | **corrected** — 2 replacements (heading + paragraph) |
| **688** `home-2` | the same lorem-ipsum demo blocks | **left alone** — text with no claim in it; this is a "should this page be published at all" decision |

Corrections are in `docs/production/content-corrections/legacy-theme-pages.json`
(round 1) and `-round2.json` (the duplicate superlative the re-run sweep caught).
Existing content was snapshotted to `backups/2026-10-11-content-backup/page-*.json`
and `.git/` before each write.

**Still recommended, and still the owner's call:** the WordPress origin is a
backend. Restricting or deindexing it would remove the duplicated, placeholder-heavy
legacy pages from any search result entirely — a larger and more durable fix than
editing them sentence by sentence. Demo pages 688 and the remaining filler on 35
should be unpublished if the theme is no longer in use.

A claim sweep after the corrections (`node scripts/verify-live-claims.mjs`) reports
**0 claim shapes** across 5 posts, 39 pages and 6 products, and **8/8** expected
corrected wording present on the storefront and in the store.

---

## 9. Three-pound product (Phase 10)

Product **2531** / `HK-ESF-3lbs` **remains a draft** and unpurchasable — verified
again after this mission's copy write: `statusUnchanged: true`, price 19.95, stock
10, SKU and images intact. Only its description text was corrected. It must stay
inactive until the owner supplies a photograph of the actual 3 lb packaging; the
existing images show 6 lb packaging.

---

## 10. Verdict

| Item | Result |
| --- | --- |
| Phase 1 backup / inventory | **PASS** — read-only logical export of products, orders, customers (2,704), users, posts, pages, media, plugins in `backups/2026-10-11T21-25-50-048Z-store-export/`; row counts above. A **database-level** backup remains the host's (cPanel) and was not taken from here — stated as a limitation, not a pass |
| Phase 2 provenance | **PASS** — root cause identified with the store's own settings; no batch insert exists |
| Phase 3 cleanup manifest | **PASS (no execution)** — 2,704 classified; bulk action deliberately withheld for owner approval |
| Phase 4 order reconciliation | **PASS for Stripe; PARTIAL overall** — Amazon Pay, Square and PayPal orders cannot be verified without those credentials, and are reported as `G_unknown` |
| Phase 5 order cleanup | **PASS (2 orders, reversible)** — verified before and after |
| Phase 6 customer dashboard | **PASS** — filter now answers from orders; unknown is never rendered as zero |
| Phase 7 spam prevention | **PARTIAL** — app-side done and tested; store-side setting **BLOCKED** (API route not registered) pending one wp-admin click |
| Phase 8 content corrections | **PASS for posts 2268/233/1940/2475, six product listings and the two app copy blocks** |
| Phase 9 relevance | **PASS for the claims** — 5 unsupported claims removed from the two public legacy theme pages; demo filler on pages 35/688 still published, and restricting the WP origin is recommended |
| Phase 10 3 lb product | **PASS** — still draft |
| Phase 12 guides / AdSense | **not published, not claimed** — unchanged from the approval package |
| Phase 13 tests | **PASS** — typecheck ✔, lint ✔ (0 errors, pre-existing warnings), vitest **2,202 passed / 19 skipped / 0 failed**, production build ✔ with the build's own origin and secret scans clean. The live buyer-filter and role results above came from a temporary live test (real modules, real store) that was **not** committed, so the suite stays offline |
| Phase 14 deployment | see the commit/push/deploy record below |

**LIMITATIONS, stated plainly**

1. The customer list still holds 2,704 records (2,707 accounts including the 3
   administrator accounts). Nothing bulk was removed, by design:
   classes `C`/`D`/`B` (737 records) need the owner's approval, and `E` (1,963) cannot
   be decided from the data available here.
1a. The WordPress origin remains publicly browsable, with legacy demo pages still
   published. The unsupported claims were removed from them; the placeholder content
   was not, because it is a publication decision rather than a compliance one.
2. Two documents were modified by a verification write on post 2268 (a no-op
   re-write of identical content, which WordPress stamps a new `modified` time).
   No content changed; noted for completeness.
3. Amazon Pay, Square and PayPal payments are unreconciled — no credentials for them.
   Two of the three orders on the owner's own account (#2362 $46.78, #2363 $0.10,
   both completed, 2023) look like gateway tests but carry no provider reference that
   can be checked from here, so they are **reported, not moved** — the owner can
   confirm whether they were tests.
4. The store-side registration setting is unchanged, so the public form keeps
   accepting sign-ups until the owner unticks it.
5. Rate limiting in the app is in-process (the existing `rateLimit.ts`), so on
   Cloudflare Workers it is per-isolate and porous under scale. It is not presented
   as bot protection on its own.
6. No native-device mobile QA for these changes; the affected surfaces are the
   console table and two content pages.
