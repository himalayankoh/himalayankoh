# Revenue reconciliation — order by order, and the exact three-figure distinction

Measured **2026-10-11** from the restored production database
(`BACKUP-RESTORE-EVIDENCE-2026-10-11.md`) cross-checked against the live store over read-only
WooCommerce REST. Every figure below is a sum over named order ids, so each one can be re-derived
rather than believed.

The three figures this project reports are not three estimates of one number. They are a
**partition of the same order set** with a different evidence standard behind each part, and the
arithmetic closes exactly:

```
WooCommerce paid-dated (11 completed orders)      $1,095.24
  of which provider-verified Stripe (5 orders)      $815.71
  of which historical gateway, unverified (6)       $279.53
                                                    -------
                                                    1,095.24   ✓
```

`815.71 + 279.53 = 1,095.24`, and `5 + 6 = 11`. Nothing is double-counted and nothing is missing.

---

## 1. The live order book (14 orders, all statuses)

Live and the 2026-10-08 dump hold **the same 14 orders**, with the same ids, statuses and totals.

| Order | Date | Status | Total | `_payment_method` | Bucket |
| --- | --- | --- | --- | --- | --- |
| 1627 | 2020-08-20 | completed | 249.90 | stripe | Stripe-verified |
| 1653 | 2020-09-04 | completed | 499.80 | stripe | Stripe-verified |
| 1731 | 2021-06-03 | completed | 44.90 | stripe | Stripe-verified |
| 1733 | 2021-06-14 | completed | 20.51 | amazon_payments_advanced | Stripe-verified |
| 1772 | 2021-07-28 | **failed** | 0.49 | stripe | excluded — never paid |
| 1773 | 2021-07-28 | completed | 0.60 | stripe | Stripe-verified |
| 2110 | 2022-05-09 | completed | 20.51 | stripe | **historical, unverified** |
| 2113 | 2022-06-03 | completed | 106.03 | amazon_payments_advanced | historical, unverified |
| 2259 | 2023-05-29 | completed | 0.08 | square_credit_card | historical, unverified |
| 2260 | 2023-05-29 | completed | 106.03 | paypal | historical, unverified |
| 2362 | 2023-09-06 | completed | 46.78 | amazon_payments_advanced | historical, unverified |
| 2363 | 2023-09-06 | completed | 0.10 | ppcp-gateway | historical, unverified |
| 2468 | 2026-04-13 | **pending** | 20.47 | amazon_payments_advanced | excluded — never paid |
| 2469 | 2026-04-28 | **failed** | 299.85 | stripe | excluded — never paid |

Order totals, dates and statuses only; no customer identity is reproduced here.

## 2. The three figures, with their members

**`$1,095.24` — WooCommerce paid-dated.** The 11 `wc-completed` orders:
`1627, 1653, 1731, 1733, 1773, 2110, 2113, 2259, 2260, 2362, 2363`. This is the store's own record
of money it believes it took, and it is the only figure that is a property of the order book itself.

**`$815.71` — provider-verified Stripe.** The five charges the Stripe account can actually show:
`1627 (249.90) + 1653 (499.80) + 1731 (44.90) + 1733 (20.51) + 1773 (0.60)`. All five are dated
2020-08 to 2021-07. This figure is *evidence-grade*: it exists because a provider record exists,
not because the store says so.

**`$279.53` — historical gateway payments, unverified.** The six completed orders from 2022-05 to
2023-09: `2110 (20.51) + 2113 (106.03) + 2259 (0.08) + 2260 (106.03) + 2362 (46.78) + 2363 (0.10)`.
These are paid as far as WooCommerce is concerned, and **not** confirmed by any provider record this
project can reach. Note that the gateway named in the order is not a reliable guide: **order 2110
records `stripe`** and still belongs in this bucket, because no matching charge is visible in the
provider account that can be queried. That single order is exactly why the distinction has to be
drawn on evidence rather than on the `_payment_method` field.

**Excluded, deliberately:** order `1772` (failed, $0.49), order `2469` (failed, $299.85 — a large
charge that never went through, dated 2026-04-28), and order `2468` (pending since 2026-04-13,
$20.47). A failed or pending order is not revenue, and counting them is the error that produced an
earlier, higher headline figure.

## 3. What is required to close the $279.53

This is an access question, not an analysis one. Reconciliation of those six orders needs, per
gateway, a credential that can list historical transactions:

| Gateway (as recorded) | Orders | What is needed |
| --- | --- | --- |
| Stripe (legacy account) | 2110 | access to the **older** Stripe account, or the live restricted key with permission to read charges — the live publishable/secret pair present in the deployment can query only what its own account holds |
| Amazon Pay | 2113, 2362 | Amazon Pay merchant account (Seller Central → Amazon Pay transactions) |
| Square | 2259 | Square merchant dashboard / API token |
| PayPal (legacy) | 2260 | the PayPal account that processed the 2023 sale |
| PayPal Commerce (`ppcp-gateway`) | 2363 | PayPal Commerce merchant account |

Two secondary sources would sharpen it without leaving the store: the orders' `_transaction_id`
postmeta (present in the restored dump for each order) can be matched against a gateway's dashboard
search, and each order's notes record what the gateway reported at the time.

**Do not delete the six historical gateway orders.** They are the only store-side record of $279.53
of commerce, and deleting them would destroy the very evidence a reconciliation needs. They are also
the reason `$1,095.24` and `$815.71` differ; removing them would make the discrepancy look like an
error in the order book instead of a documented gap in provider evidence.

## 4. Rule for reporting

- `$1,095.24` may be described as **WooCommerce paid-dated**.
- `$815.71` may be described as **provider-verified** (Stripe).
- `$279.53` must **never** be reported as provider-confirmed, Stripe-verified, or reconciled. Its
  correct description is *historical gateway payments awaiting provider records*.

**Verdict: REVENUE RECONCILIATION — the three figures reconcile exactly against the order book,
and the $279.53 remains BLOCKED on gateway credentials owned by the owner.**
