# Customer cleanup — batch 1, the six reserved-domain accounts

Prepared **2026-10-11**. **Nothing has been deleted.** This is the exact, reversible manifest the
mission asked for, and the preconditions that must hold before any row in it is acted on.

---

## 1. The population, and why the batch is six

| Fact | Value | Source |
| --- | --- | --- |
| Accounts in the live installation | **2,707** | restored dump (`wp_users`) |
| of which role `customer` | **2,704** | `wp_usermeta` capabilities in the restore; live `/wc/v3/customers` `x-wp-total` agrees |
| of which role `administrator` | **3** | same measurement |
| Verified reserved-domain accounts (this batch) | **6** | the census, re-derived below |
| Suspicious (machine-shaped, unproven) | 731 | `CUSTOMER-DATA-AUDIT-2026-10-11.md` |
| Unclassified | 1,963 | same |

The 709-odd rows behind "suspicious" and "unclassified" are **not** in this batch and must not be
deleted. A random-looking username or a `<hex>@gmail.com` address is a strong *signal* — it is what
the sign-up guard now logs — but it is not proof: real people hold addresses that look random. Only
the reserved-domain rows are proof-grade, because the domain itself cannot receive mail, so no
account on it can ever be an order the store shipped.

## 2. Batch 1 — the six rows

| Account id | Registered | Domain | Name on record | Orders linked | Classification | Intended action |
| --- | --- | --- | --- | --- | --- | --- |
| 37 | 2021-12-20 | `example.com` | no | no | B_reserved_domain | quarantine (owner approval) |
| 1099 | 2026-04-20 | `example.com` | no | no | B_reserved_domain | quarantine (owner approval) |
| 1106 | 2026-04-20 | `example.com` | no | no | B_reserved_domain | quarantine (owner approval) |
| 1107 | 2026-04-20 | `example.com` | no | no | B_reserved_domain | quarantine (owner approval) |
| 1393 | 2026-06-04 | `example.com` | no | no | B_reserved_domain | quarantine (owner approval) |
| 1394 | 2026-06-04 | `example.com` | no | no | B_reserved_domain | quarantine (owner approval) |

`example.com` is reserved by IANA for documentation; the same domain the store's own sign-up guard
now refuses (`src/lib/auth/signupGuard.ts`, `RESERVED_DOMAINS`). Each of the six was created by the
open WordPress registration form — the abuse path in `REGISTRATION-SURFACES-2026-10-11.md` — and
each has no name and **no order**, which is what makes it safe to remove rather than merely
suspicious.

**Manifest file (the machine-readable form, with the same columns plus the address digest):**

```
C:\Users\basco\Downloads\hk\.freebuff\customer-cleanup-batch-1-2026-10-11.csv
```

It lives **outside this repository** (in `.freebuff/`, beside the untracked credential files), so it
cannot be committed even by accident — `git status` does not see it. This is deliberate: the
481-row export committed in `1140cc2` and described in `GIT-HISTORY-EXPOSURE-2026-10-11.md` is
exactly the mistake this placement avoids. The digest column is present there only so a row can be
matched back to its account; the document above carries no per-record data.

## 3. Why this is recoverable

Every one of the six rows is inside the verified **2026-10-08** dump — `wp_users` plus `wp_usermeta`
rows, for ids `37, 1099, 1106, 1107, 1393, 1394` — and that dump has been restored and counted in
an isolated database (`BACKUP-RESTORE-EVIDENCE-2026-10-11.md`). So a deletion can be undone from a
verified copy today. It stops being undoable the moment that backup is replaced by one taken after
the deletion, which is why the order of operations below matters.

## 4. Preconditions before a single row is deleted

1. **A verified backup that covers the current state exists.** The 2026-10-08 dump covers people and
   orders but is eight days old and predates the current catalogue. A database of the live
   installation as it is *now* must be taken and restore-tested first. (Requires database access
   this machine does not have — an owner action; see §5 of the backup document.)
2. **The owner approves this exact batch** — these six ids, and no others.
3. **The batch is recorded before it is applied**: the manifest file's SHA-256, so the thing deleted
   is provably the thing approved.
4. **The deletion returns what it removed.** Use a mechanism that reports the rows (`DELETE … SELECT`
   / `deleting` plugin with an export, and accounts deleted through WooCommerce rather than raw SQL
   so related meta is handled consistently), not a bulk query that reports a count.
5. **A post-check that the arithmetic moved by exactly the approved amount**: accounts
   `2,707 → 2,701`, customers `2,704 → 2,698`, and **no order, no product and no administrator
   touched** — orders `14`, administrators `3`, unchanged.

## 5. What is explicitly out of scope

- **No bulk deletion, now or later, on the strength of this document.**
- **The 731 suspicious and 1,963 unclassified rows stay.** They need per-row evidence — an order, a
  payment, a delivery — before any of them can be removed, and the audit's own conclusion was
  *review*, not delete.
- **No legitimate buyer is at risk from this batch**, because a reserved-domain address cannot have
  placed an order, and none of the six is a buyer.
- **No administrator account.** The three admins are the owner's access and are untouchable here.

## 6. Status

**CUSTOMER CLEANUP: BLOCKED — batch of 6 prepared and reversible, deletion withheld** pending (1) a
verified backup of the current state and (2) the owner's approval of these six ids. 2,701 accounts
other than these six are untouched by this document.
