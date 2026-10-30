# Staging Isolation Verification & Fail-Closed Guardrails

**Date:** 24 September 2026  
**Environment:** `https://preview.himalayankoh.com` (Cloudflare Worker) & `https://himalayankoh.com/staging` (WordPress / WooCommerce Backend)  
**Status:** **VERIFIED & ISOLATED**

---

## 1. Executive Summary

This document addresses **HK-04** and proves that the staging environment (`preview.himalayankoh.com` and its backing WooCommerce backend `https://himalayankoh.com/staging`) is architecturally isolated from production (`himalayankoh.com`).

No staging mutation can affect production orders, customers, inventory, or incur live payment or carrier postage charges.

---

## 2. WooCommerce Database & Target Isolation

### 2.1 Backend Routing & Endpoints
All API and console requests in staging preview are wired strictly to the staging backend:
- `WORDPRESS_BASE_URL=https://himalayankoh.com/staging`
- `WOOCOMMERCE_BASE_URL=https://himalayankoh.com/staging`
- `WORDPRESS_API_ROOT=https://himalayankoh.com/staging/wp-json`

### 2.2 Proof of Separate WordPress Instance / Database
1. **Site URL and Home Option Records:**
   - Production (`https://himalayankoh.com/wp-json`):
     - `url`: `https://himalayankoh.com`
     - `home`: `https://himalayankoh.com`
   - Staging (`https://himalayankoh.com/staging/wp-json`):
     - `url`: `https://himalayankoh.com/staging`
     - `home`: `https://himalayankoh.com/staging`
   These values are stored in the WordPress `wp_options` table (`siteurl` and `home`). Their differing values verify separate table namespaces or databases.

2. **Authentication Isolation:**
   - User endpoint probe (`/wp/v2/users/1023`):
     - Production: HTTP 401 Unauthorized (application password credentials for `salman` are not authorized on production).
     - Staging: HTTP 200 OK.
   - Rotated Application Password: UUID `e499598c-4ab3-444d-bcd5-d5c2d222666c` is valid solely on the staging WordPress instance.

3. **Order & User Mutation Boundary:**
   - Staging mutations execute only against `https://himalayankoh.com/staging/wp-json/wc/v3/*`.
   - Previous QA test accounts (WordPress users #1049, #1050, #1051) were created and removed on staging with zero trace on production.

---

## 3. Shippo Carrier & Postage Isolation

### 3.1 Live Key Block (Code-Enforced Fail-Closed Guard)
In `src/lib/shippo/server/client.ts`, an explicit fail-closed guard checks the deployment environment:
```typescript
const env = getDeploymentEnvironment();
if (env !== 'production' && apiKey.startsWith('shippo_live_')) {
  throw new Error(
    `Live Shippo API keys cannot be used in ${env} environment. Use a Shippo test key (shippo_test_...) or dry-run mode to prevent real postage charges.`
  );
}
```
If any administrator or environment variable inadvertently configures a live Shippo key (`shippo_live_...`) on staging or preview, any attempt to communicate with Shippo throws immediately, preventing live carrier charges.

### 3.2 Label Creation Eligibility Guard (HK-03)
In `/api/admin/labels` and `/api/shippo/create-label`:
- Orders with status `delivered`, `completed`, `shipped`, `cancelled`, `refunded`, or `failed` are **strictly barred** from entering the label purchase queue.
- Unpaid orders are barred.
- Historical delivered orders (e.g. order 2588) cannot be purchased.

### 3.3 Dry-Run & Test Mode
`purchaseShippoLabel` in `src/lib/shippo/server/labels.ts` supports dry-run simulation (`SHIPPO_DRY_RUN=true`), generating mock tracking numbers (`DRYRUN...`) and preview PDFs without contacting commercial postage networks.

---

## 4. Retail Payment Isolation (Stripe)

- Stripe card checkout is fail-closed.
- `createPaymentIntent` returns HTTP 503 unless explicit test keys (`sk_test_...`) are configured.
- Live Stripe keys (`sk_live_...`) are rejected on staging preview.

---

## 5. Summary of Fail-Closed Controls

| Action | Staging / Preview Guard | Outcome |
|---|---|---|
| Card payment | Test mode only; live mode prohibited. | HTTP 503 / Fail-closed without test keys. |
| Shippo label purchase | Live key check (`shippo_live_*` blocked) + order eligibility check. | Rejects live keys; excludes delivered/completed orders. |
| WooCommerce writes | Base URL anchored to `https://himalayankoh.com/staging`. | No production order/customer records affected. |
| Cart mutations | Authoritative reconciliation on timeout. | Prevents duplicate units on slow store response. |
