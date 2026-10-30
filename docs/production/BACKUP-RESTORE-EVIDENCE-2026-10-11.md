# Backup re-verification — an independent restore, and what the dump does and does not cover

Measured **2026-10-11** against the backup set at `hk-backups/2026-10-08/` (outside this
repository, on the owner's machine). Nothing below is a remembered result: the checksums were
recomputed, the restore was re-performed into a new schema on an isolated local MariaDB, and the
counts were read back from that restore and compared against the live store on the same day.

This document exists to settle a contradiction rather than to add a claim. `BACKUP-RESTORE-VERIFICATION.md`
still opens with **"Status: FAIL. No verified backup of the live installation exists."**, while
`CUTOVER-READINESS.md` records the backup as **PASS** on a `verify-backup.mjs` run of *16 passed, 0
failed*. Both were written in good faith. §6 says which one is true today and why the other is not
a lie.

---

## 1. The artefacts, and their integrity

| Artefact | Bytes | Recorded digest | Recomputed 2026-10-11 |
| --- | --- | --- | --- |
| `himaljpz_dbigyg59kmwnws.sql.gz` | 5,479,610 | `b4e5c7df…e53cc` (in its own `.sha256`) | **match** |
| `wp-content-uploads.tar.gz` | 2,730,202,043 | `ee5f4896…6dd78d` | **match** (`sha256sum -c`) |
| `wp-content-theme-plugin-files.tar.gz` | 285,394,041 | `0c3fc1d0…b8dc5bc` | **match** (`sha256sum -c`) |
| `wp-config.php` | 3,694 | `cf47bb16…2ea9b` | **match** (`sha256sum -c`) |

`sha256sum -c SHA256SUMS.txt` → `wp-content-uploads.tar.gz: OK`, `wp-content-theme-plugin-files.tar.gz: OK`,
`wp-config.php: OK`, exit `0`. The database dump is not listed in `SHA256SUMS.txt`; it carries a
sibling `.sha256` file instead, and recomputing it by hand matched that file exactly. That is a
slightly awkward split — one checksum file for the archives, a second for the dump — and worth
tidying in the next backup, but not a defect in this one.

Taken **2026-10-08** between 17:07 and 17:31. The dump header records `MariaDB dump 10.19-11.4.13`
from a server running `11.4.13-MariaDB-cll-lve-log` — i.e. it was produced by the database itself,
not assembled from an API or a product export.

---

## 2. The restore, re-performed today

| Step | Command | Result |
| --- | --- | --- |
| Start an isolated server | `mysqld --defaults-file=hk-scratch.my.ini` (port 33107, `bind-address=127.0.0.1`, datadir under `.freebuff/tmp/mariadb/data`) | `PING OK` after 1s, `11.4.13-MariaDB` |
| Create a fresh schema | `CREATE DATABASE hk_restore_check_20261011` | created |
| Import the dump | `gunzip -c himaljpz_dbigyg59kmwnws.sql.gz \| mariadb hk_restore_check_20261011` | **exit 0, 27.4 s** |
| Count what arrived | `information_schema.tables` | **320 tables** |

The live production database was not touched: the restore target is a loopback-only MariaDB on this
machine, and the dump contains no `USE` or `CREATE DATABASE` statement (checked), so the import
cannot address another schema even by accident.

---

## 3. What was backed up: three installations in one database

The dump is a whole-database dump (`himaljpz_dbigyg59kmwnws`) and that database holds **three**
WordPress installations, which is why "320 tables" is a larger number than any one site's table
count. The prefixes identify themselves through their own `siteurl`/`home` options — no inference
from table names:

| Prefix | Identity (`siteurl`) | Users | Orders | Products | What it is |
| --- | --- | --- | --- | --- | --- |
| `wp_` | `https://himalayankoh.com` | **2,707** | **14** | 18 (13 publish, 5 draft) + 33 variations | **the live apex installation** — the store |
| `stg_` | `https://himalayankoh.com/staging` | 1,007 | 36 | 27 + 27 variations | the staging installation |
| `afk_` | `http://himalayankoh.com` | 1 | 0 | 0 | an abandoned default install (`My WordPress`, theme `twentytwentytwo`, 3 plugins) |

The live installation's own settings, read from the restore:

| Option | Value at backup time |
| --- | --- |
| `theme` / stylesheet | `farmagrico` |
| `woocommerce_db_version` | **7.7.0** |
| `users_can_register` | **1** — native registration was open on 2026-10-08, recorded here as the backup's own evidence |
| `woocommerce_custom_orders_table_enabled` | absent → **HPOS was never enabled**; orders live in `wp_posts` + `wp_woocommerce_order_items`, and those tables are in the dump |
| `db_version` | `58975` |

Both content sets are populated: `wp_posts` holds 273 attachments, 42 pages, 18 products, 33
variations and 14 orders; `wp_users` holds 2,707 rows; `wp_woocommerce_order_items`,
`wp_woocommerce_sessions`, `wp_wc_order_stats` and the rest of the WooCommerce tables are present.
This is not a product-only or content-only dump.

---

## 4. Coverage against the live store, measured the same day

Read live through the WooCommerce REST API (read-only key) and compared row-for-row with the
restore:

| Fact | Live 2026-10-11 | In the 2026-10-08 dump | Verdict |
| --- | --- | --- | --- |
| Orders | 14 (`x-wp-total=14`) | 14 | **identical** — same ids, statuses and totals, newest `2469` dated 2026-04-28 |
| Completed orders | 11 | 11 | identical |
| Failed orders | 2 | 2 | identical |
| Customer accounts | 2,704 | 2,704 customer-role rows | identical |
| Administrators | 3 | 3 | identical |
| Published products | 5 (`2526, 2536, 2539, 2543, 2544`) | **0 of these** | **not covered** — the dump holds the superseded catalogue |
| Products at backup time | — | 18 (13 publish + 5 draft) | present only here |

So the dump is **complete for people and orders** and **stale for the catalogue**: the five
listings the store sells today were created after 2026-10-08, and the eighteen the dump holds are no
longer live. That is a fact about the catalogue replacement, not a defect in the backup — and it
gives the 2026-10-08 set a second value, because for the superseded listings it is the only copy
verified to exist.

**No order and no account has been added or changed since the backup was taken.** The gap between
this backup and today is therefore product content (and site activity), not commerce.

---

## 5. What this restore does not prove

Stated plainly, because a verified backup is exactly the claim that gets over-read:

- **The files were integrity-checked, not extracted.** Their digests match; nothing was unpacked
  into a web root and no page was served from the archive.
- **No WordPress core version is recorded.** The archives carry `wp-content` (themes, plugins,
  uploads) and `wp-config.php`; core is not in them. `db_version = 58975` is recorded as the schema
  fingerprint, and core is re-downloadable — but "which exact core version" is not in this set.
- **This is a database-into-scratch restore, not a site recovery.** Proving the dump loads is not
  the same as having rehearsed a full cutover back to WordPress.
- **The dump is eight days of activity old.** Anything written to WordPress between 2026-10-08 and
  today is not in it. §4 shows that, for orders and accounts, that is currently nothing.

---

## 6. The contradiction, resolved

- `BACKUP-RESTORE-VERIFICATION.md` **FAIL**: correct **when written** — no dump of the live
  installation existed, and the rule it encodes is right.
- `CUTOVER-READINESS.md` **PASS**: correct **for the artefacts that then existed**, and its own note
  identifies why the earlier FAIL looked wrong — the verifier had been run *without*
  `--restore-evidence` against a restore record already on disk, which the tool reports as a missing
  record rather than a failed restore.
- **Today (2026-10-11)**: the dump, both archives and `wp-config.php` exist, their digests verify,
  and a restore into an isolated scratch database has been performed and counted — §2 and §4. The
  three conditions in §1 of that document, plus its requirements 4 and 5 (a copy off the hosting
  account, and the configuration facts recorded), are met for the **2026-10-08** state.

The honest summary is one sentence: **a verified, restorable backup of the live installation as it
was on 2026-10-08 exists, and production has since moved past it in the catalogue only.**

### What a fresh backup must capture

1. The live database again — it is the only way to protect the current five listings and any
   WordPress-side change since 2026-10-08. It requires database access this machine does not have
   (cPanel/phpMyAdmin/WP-CLI were all refused — see §3 of `REGISTRATION-SURFACES-2026-10-11.md` for
   the same credential wall).
2. `wp-content/uploads` again, since product images for the new listings were uploaded after the
   dump.
3. One line added to `SHA256SUMS.txt` for the dump itself, so a single check covers the set.

Nothing in this document authorises the deletion of anything. The cleanup batch in
`CUSTOMER-CLEANUP-BATCH-1-2026-10-11.md` stays unapplied until a backup covering the current state
exists and the owner has approved the exact rows.
