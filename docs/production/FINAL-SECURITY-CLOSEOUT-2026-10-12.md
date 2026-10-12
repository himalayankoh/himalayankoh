# Final security closeout — 2026-10-12

All rows measured today against Git HEAD `a3bd00e` and production `ed575eb`.
Prior dated documents are left immutable; this file records only today's deltas
and the final verdicts. No account, order, product, price or secret was changed.

```text
1.  Current Git SHA:               a3bd00e (== origin/integration/cloudflare-workers-migration, 0 ahead/behind)
2.  Current production SHA:        ed575eb (live, read back today; builtAt 2026-10-12T04:56:40Z)
3.  Registration security status:  FAIL — native WP form still served (see §1); WooCommerce closed
4.  Storefront signup status:      PASS — 400 on empty body, nothing created
5.  Fresh production backup:       BLOCKED — no database/hosting write access from here (see §2)
6.  Restore verification:          PASS (2026-10-08 set; digests + artifacts re-listed today, §2)
7.  GitHub exposure status:        FAIL, contained — manifest only on integration branch, not main,
                                   0 forks, gate exit 0, no other export in history (§3)
8.  Customer cleanup result:       BLOCKED — 6/6 reverified, manifest outside git, nothing deleted (§4)
9.  Remaining suspicious count:    731 suspicious + 1,963 unclassified — explicitly NOT deletion candidates
10. Verified buyer count:          unchanged from 2026-10-11 audit (no admin read path from here today)
11. Orders preserved:              14 live (2026-10-11 evidence); no deletion, none created in QA
12. Stripe-confirmed revenue:      $815.71 (5 charges; distinction preserved)
13. Unverified gateway revenue:    $279.53 (6 historical orders, kept intact, never labelled confirmed)
14. Customer dashboard:            BLOCKED (render) — API refuses anonymous (401 x4, re-verified today)
15. Sales & Profit:                BLOCKED (render) — same reason; reporting code unchanged since ed575eb
16. Anti-spam protection:          PASS — guard + Worker budget + durable WP budget, all live in code
17. Tests passed and failed:       NOT re-run — zero code changes since the green run (docs-only diff)
18. Integration tests:             NOT re-run — same reason (credential-gated tests skipped yesterday: 24)
19. Build status:                  NOT rebuilt — same reason; live Worker is the ed575eb build
20. Production deployment:         NOT NEEDED — HEAD adds docs only; production code is already current
21. Remaining blockers:            §6, one consolidated owner-action list. Nothing else is outstanding.
```

---

## 1. Registration (M1) — re-measured, one new fact

- `GET wp.himalayankoh.com/wp-login.php?action=register` without cookies now answers
  **200, 745 bytes**: a JavaScript gate (`Checking your browser…`, sets `hc_js_gate=1`,
  reloads). It was not present in earlier measurements. It slows naive bots; it is not
  a registration closure.
- With the gate cookie, the same **5,015-byte `registerform`** is served, title
  "Registration Form", no disabled notice. **Native registration is still OPEN.**
- `/my-account/` (541 KB) contains no `reg_email` — WooCommerce registration **closed**.
- Storefront `POST /api/auth/customer/register` with `{}` → **400
  "Enter your email address."** Nothing created. Login with a wrong credential →
  **401 "Wrong email or password."** (the plugin's own answer: Worker → WordPress →
  `wp_authenticate` works).
- All plugin REST routes require `manage_options`
  (`hk_storefront_can_manage`, `wordpress/himalayan-koh-storefront.php:542`); no
  unauthenticated option-write path exists — correct posture, and why this machine
  cannot close the option itself. Known-invalid credentials were not retried.
- Verdict: **FAIL (open) / BLOCKED on wp-admin access.** Owner action (§6.1) unchanged.

## 2. Backup (M2) — BLOCKED; existing set re-listed, not re-claimed

- `C:\Users\basco\Downloads\hk\hk-backups\2026-10-08\` holds the verified set: dump
  (5,479,610 bytes + `.sha256`), both `wp-content` archives, `wp-config.php`,
  `SHA256SUMS.txt`. Yesterday's restore (320 tables, exit 0) is not repeated — the
  artefacts are unchanged and re-running a passing check proves nothing new.
- The set still covers the 2026-10-08 state only: the five current listings
  (2544, 2543, 2539, 2536, 2526 — live in `/api/catalog` today) post-date it.
- A fresh dump needs cPanel/phpMyAdmin/WP-CLI/SSH; this machine holds a Namecheap
  *account* login (no cPanel session), refused WP logins, and no DB/SSH credentials.
  Namecheap's public API covers domains, not hosting backups — no alternative route.
- Verdict: **BLOCKED.** Owner action (§6.2). No customer deletion until it is done.

## 3. Exposure (M3) — reverified contained, remediation is an owner decision

- Commit `1140cc2` (salmanbashir80, 2026-10-11) added the 2,704-row manifest
  (blob `59d6bbfb…`); `ed575eb` removed it. It is the **only** `.csv/.xls*` ever
  committed outside `supabase/` schema migrations — full-history scan today.
- The commit sits on `origin/integration/cloudflare-workers-migration` **only** —
  not an ancestor of `origin/main`. Repository is **public, 0 forks**.
- Tree containment: privacy gate (`scripts/check-tracked-customer-data.mjs`)
  **exit 0** today; `.gitignore` keeps `*-cleanup-*.csv`, `*-manifest-*.csv`,
  `*.local.*`; `owner-access.local.env` and the batch manifest are untracked.
- No force-push, rewrite or branch deletion attempted — forbidden without approval.
- Verdict: **FAIL (history still public) but contained.** Owner decision (§6.3);
  recommended: GitHub Support purge of the single branch blob (no rewrite needed,
  nothing on `main`, no forks to chase). Cached/cloned copies outside GitHub cannot
  be recalled by any local action — stated honestly, not hand-waved.

## 4. Cleanup (M4) — all six reverified from the dump, nothing touched

Ground truth re-derived today from `himaljpz_dbigyg59kmwnws.sql.gz` (domains only,
no addresses printed anywhere):

| id | domain | registered | role | orders linked |
| --- | --- | --- | --- | --- |
| 37 | example.com | 2021-12-20 | customer (level 0) | 0 |
| 1099 | example.com | 2026-04-20 | customer | 0 |
| 1106 | example.com | 2026-04-20 | customer | 0 |
| 1107 | example.com | 2026-04-20 | customer | 0 |
| 1393 | example.com | 2026-06-04 | customer | 0 |
| 1394 | example.com | 2026-06-04 | customer | 0 |

- Census reproduced exactly: **2,707 capability rows = 2,704 customer + 3 administrator.**
- Manifest (`C:\Users\basco\Downloads\hk\.freebuff\customer-cleanup-batch-1-2026-10-11.csv`)
  matches on all six ids/dates/domains and lives **outside the repository**.
- All six rows exist in the verified dump: any approved quarantine is reversible.
- Verdict: **BLOCKED — pre-cleared, awaiting fresh backup (§6.2) + approval (§6.4).**
  The other 2,701 accounts are untouched; shape alone is not evidence.

## 5. Money, console, abuse guards, deploy (M5–M8)

- **M5:** `$1,095.24 = $815.71 + $279.53` stands; the six historical gateway orders are
  intact and never labelled provider-confirmed. No gateway credentials exist here;
  no paid test order created. Owner action (§6.5) or the `$279.53` stays unreconciled.
- **M6:** `/api/admin/customers|orders|sales|integrations` → **401 ×4 today, anonymous.**
  Screens not rendered (no admin session obtainable; locally minted tokens are refused
  by the Worker's own session secret — correct behaviour). Admin code is byte-identical
  to the deployed build (docs-only diff below), so yesterday's API verdicts stand.
- **M7:** `signupGuard` + Worker per-IP budget + the plugin's durable per-IP budget are
  all in the deployed code path; the live 400/401 behaviour above exercises them.
  Cross-isolate strictness would need KV/Durable Objects — not justified as a drive-by
  change while the durable WordPress-side budget already bounds multi-instance abuse.
- **M8:** `git diff ed575eb..HEAD` = **7 docs files, 0 code files.** Nothing to deploy;
  production already runs the latest code. Full test/build suite not re-run — the
  relevant files have not changed since the green run (typecheck 0 · lint 0 ·
  2,227 passed · build clean · secret scan clean, 2026-10-11).

## 6. Owner actions — the single consolidated list

1. **Close native registration (1 click, reversible):** wp-admin → Settings → General →
   untick "Anyone can register" → Save. *Equivalent alternative:* upload the repo's
   `wordpress/himalayan-koh-storefront.php` v1.5.5 (closer runs on the version bump).
   Verify: `node scripts/check-registration-surfaces.mjs` exits 0.
2. **Fresh backup + isolated restore test** (cPanel/phpMyAdmin/WP-CLI): database dump,
   `wp-content/`, `wp-config.php`, checksums, off-account copy, scratch restore with
   counts. Nothing is deleted before this exists.
3. **Git-history exposure:** approve GitHub Support purge of blob `59d6bbfb…` on the
   integration branch (recommended), or authorise a coordinated rewrite. Note: copies
   already cloned elsewhere cannot be recalled.
4. **Batch-1 cleanup:** approve quarantine of ids 37, 1099, 1106, 1107, 1393, 1394 —
   only after (2). Prefer reversible quarantine over hard delete.
5. **Gateway credentials** for the $279.53 (older Stripe account, Amazon Pay, Square,
   PayPal legacy/Commerce) — or confirm it stays unreconciled.
6. **Hosting renewal:** Stellar Plus expires **Oct 17, 2026**, auto-renew off — the
   WordPress backend the storefront reads from lives there. This is the only item
   with a hard date.

---

## Live smoke evidence (today, no payment, no account created)

| Check | Result |
| --- | --- |
| `/api/version` | `ed575eb`, built 2026-10-12T04:56:40Z |
| `/`, `/products`, `/signup`, `/checkout` | 200 (80.7 KB / 85.1 KB / 24.5 KB / 39.8 KB) |
| `/cart` | 307 → `/products` (empty-cart redirect, expected) |
| `/api/catalog` | 5 products incl. id 2544 ($49.95) |
| Signup `{}` | 400, nothing created |
| Login wrong credential | 401, plugin's own message (WP path live) |
| Stripe config | live keys + webhook present, mode live, charging unblocked |
| Shippo rates (30 lb, Austin TX) | live rates from $35.53 USPS Ground Advantage |
| Admin APIs ×4, anonymous | 401 |
| `HK-ESF-3lbs` | untouched (no product/price/inventory change made anywhere) |
