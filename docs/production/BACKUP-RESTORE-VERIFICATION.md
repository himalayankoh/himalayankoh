# Backup and restore verification — the precondition for all catalogue work

> **Status: FAIL. No verified backup of the live installation exists.**
>
> This is not a warning about a risk that has been mitigated; it is the current, measured
> state. Nothing in the catalogue plan, the `wp.himalayankoh.com` work, or the cutover may run
> before this document's rule is satisfied, and no agent or engineer may record this item as
> PASS on the strength of anything in §7 below.

This document exists because "we have a backup" is the most over-claimed sentence in a
migration. It is claimed from a product CSV, from a DNS export, from a `.wpress` file whose own
filename says *staging*, and from a backup taken three months ago that the site has since moved
past. Each of those is a real artefact and none of them is a backup. The rule below is written
so that the difference is checkable by a person with no context, at 2am, from the file names and
the command output alone.

---

## 1. The rule

**The backup item stays FAIL until all three of the following are true.**

1. **A database dump of the live apex installation exists** — a real dump of the MySQL database
   behind `himalayankoh.com`, taken from the database itself, not assembled from an API.
2. **A files backup of the live apex installation exists** — `wp-content/` in full (uploads,
   plugins, themes) **and** `wp-config.php`.
3. **A restore of at least the database into a scratch location has been performed and
   verified** — table counts and a sample of row counts compared against the source, with the
   live database untouched throughout.

Additionally, and for the same reason:

4. **At least one copy of each exists somewhere other than the hosting account** — a copy that
   lives only on the server it is protecting is lost by the exact event it was taken for.
5. **The WordPress core version, the active theme version and the plugin list with versions are
   recorded alongside them.** These cannot be reconstructed from either the dump or the archive,
   and they are what makes a restore a restore rather than an archaeology project.

### The executable half of the rule

The archival half of this rule — is the dump intact, does it contain the tables that
matter, does the files archive hold `wp-config.php` and a real `uploads/` tree — is
checked by a script rather than by eye:

```bash
npm run check:backup -- --db ~/backups/hk-live-<date>.sql.gz \
                       --files ~/backups/hk-home-<date>.tar.gz \
                       --restore-evidence ~/backups/hk-restore-<date>.txt
```

`scripts/verify-backup.mjs` reads the archives and never extracts, restores, imports or
connects to anything. It exits non-zero unless the dump is intact and complete, the files
archive holds the plugin, theme and uploads trees, **and** the file named by
`--restore-evidence` exists with the §4.5 restore recorded in it. That last flag is the point:
the script cannot perform a restore, so it refuses to sign one off — without it the verdict
is `NOT PASS`, which is the honest answer for a dump nobody has ever restored. A logical
product export cannot be passed to it at all.

### What counts as evidence, and what does not

Accepted, for each artefact: the file itself, plus its **name, the date it was taken, its byte
size and its SHA-256**, plus the **command output** that shows what it contains (see §4). For
the database, the scratch restore's own output showing the comparison counts. For §1.5, the
saved system report.

**Not accepted, under any circumstances — each of these exists on this machine today:**

| Artefact | Why it is not a backup |
| --- | --- |
| A WooCommerce product export (CSV/JSON), or a read of `/wp-json/wp/v2/product` | Product *definitions* only. No orders, no customers, no settings, no users, no media files, no database structure. Re-importing it recreates a catalogue, not a store. |
| `scripts/export-store-backup.mjs` output | Its own header says it best: a **read-only logical export**. It cannot fetch plugin/theme/core files and cannot dump MySQL. If it collects nothing it even renames its own folder to `…-INCOMPLETE` so it cannot be mistaken for the real thing. |
| The DNS export (`docs/production/dns-export-2026-10-08.json`) | Zone records and settings. Needed for *rollback*, useless for recovery. |
| `docs/production/CATALOG-COMPARISON.md` | A read-only view of the public catalogue. |
| An All-in-One-WP-Migration archive of the **staging** install | Wrong installation. `backups/himalayankoh-staging-20260929-code-db.wpress` says `staging` in its own name, and `PRODUCTION-REMEDIATION.md` §7 records it as an extracted file tree rather than a database dump. |
| The 5 KB `dealer-wholesale-backup-20260815.sql` under `../.freebuff-backup/` | Predates the current catalogue. Its size alone says it is not this store. |
| A backup that has been *taken* but never *restored* | **Taken, unverified.** It counts only once §1.3 is done. This is the half-finished state that fails silently: a truncated dump extracts, lists and greps exactly like a good one. |

The distinction that matters: a *logical* export describes data the way the application already
sees it. A *backup* is a byte-level copy of the database and the files that can be restored onto
a damaged server. Only the second survives the failures in §5.

---

## 2. What a complete backup here is made of

Three parts, because each one is unrecoverable from the other two. The live installation is on a
Namecheap/cPanel account at origin `162.0.209.25` (the apex `himalayankoh.com` is an `A` record
to that address, proxied through Cloudflare; the zone is `himalayankoh.com`,
`1f114016cd25da9e12c584e48fbd7f96`).

### 2.1 The database

Every table in the WordPress database — not a subset, and not only the ones WooCommerce exposes
over REST. That means:

- **Core:** `wp_posts`, `wp_postmeta`, `wp_options`, `wp_users`, `wp_usermeta`, `wp_terms`,
  `wp_term_taxonomy`, `wp_term_relationships`, `wp_comments`, `wp_commentmeta`, `wp_links`.
- **WooCommerce:** `wp_woocommerce_order_items`, `wp_woocommerce_order_itemmeta`,
  `wp_woocommerce_tax_rates`, `wp_woocommerce_tax_rate_locations`, `wp_woocommerce_sessions`,
  `wp_wc_customer_lookup`, `wp_wc_order_stats`, `wp_wc_order_product_lookup`,
  `wp_wc_order_coupon_lookup`, `wp_wc_order_tax_lookup`, `wp_wc_product_meta_lookup`,
  `wp_wc_category_lookup`, `wp_wc_download_log`, `wp_wc_webhooks`, `wp_wc_admin_notes`.
- **High-performance order storage (HPOS), if enabled:** `wp_wc_orders`,
  `wp_wc_orders_meta`, `wp_wc_order_addresses`, `wp_wc_order_operational_data`. **Check whether
  HPOS is on** (WooCommerce → Settings → Advanced → Features). On a store where it is enabled,
  the orders are *not* in `wp_posts`, and a dump taken with the assumption that they are is a
  dump of a store with no orders.
- **Anything a plugin created inside the same database.** This is precisely the set that the
  logical export misses, which is why the dump is not optional.

The table **prefix is not necessarily `wp_`.** The accepted source of truth is `wp-config.php`
on the server: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` and `$table_prefix`. Read it before
writing any verification command, and use the prefix you find there in every command below.

### 2.2 The files

- `wp-content/uploads/` — every image, in every generated size, plus any downloadable product
  files. Binary, unrecoverable from any API, and the single largest part of a real backup.
- `wp-content/plugins/` and `wp-content/themes/` — including `mu-plugins/` if it exists.
- `wp-config.php` — salts, the table prefix, and the database credentials. Without it the dump
  cannot be reconnected to anything.
- `wp-content/` anything else in use: a page-builder's generated CSS/JS, cache folders (not
  essential but harmless), an uploads-based backup plugin's own directory, `.htaccess` files.
- Optional and cheap: the rest of the public document root (`index.php`, `.htaccess`,
  `robots.txt`). Not required, since WordPress core is downloadable, but a full home-directory
  archive gets them for free.

### 2.3 The versions

WordPress core, the active theme, and every plugin with its version, **saved as a file next to
the backup**. This is what a restore needs and neither the dump nor the archive contains:
`wp_options` records what was *installed*, not what the code *was*.

- WooCommerce → Status → **Get system report** (copy it to `system-report-<date>.txt`).
- Or, if the host offers WP-CLI: `wp core version`, `wp theme list`, `wp plugin list`.

---

## 3. How to take each one

All of this needs the **cPanel login for the account at `162.0.209.25`** — the blocking item in
`PRODUCTION-REMEDIATION.md` §R item 2. The Namecheap *account* login is not a cPanel login
(measured: `:2083/login/?login_only=1` answers `401 invalid_login`).

### 3.1 The database — pick one

**Option A — phpMyAdmin (no SSH needed).** cPanel → **Databases → phpMyAdmin** → select the
database named in `wp-config.php` → **Export** tab → method **Custom** → tick **Add DROP TABLE**
and **Add IF NOT EXISTS** (both make a restore idempotent) → format **SQL** → compression
**gzip** → Go. Save the `.sql.gz`.

Choose Custom over Quick for one reason: Quick gives no say over the structure options, and the
`DROP TABLE` statements are what let the dump be restored over an existing database rather than
failing on the first table.

**Option B — `mysqldump` (cPanel → Advanced → Terminal, or SSH).** The most reliable and the
easiest to record, because the command itself is the evidence:

```bash
# Names from wp-config.php. The dump is written outside public_html.
mysqldump --single-transaction --quick --routines --triggers \
  --default-character-set=utf8mb4 \
  -u DB_USER -p DB_NAME | gzip -9 > ~/hk-db-$(date +%F).sql.gz

sha256sum ~/hk-db-$(date +%F).sql.gz
ls -l ~/hk-db-$(date +%F).sql.gz
```

- `--single-transaction` gives a consistent snapshot of InnoDB tables without locking the store
  for the duration — the reason this is the right flag for a live shop.
- `--routines --triggers` because a plugin's stored procedure is not in the tables.
- If the host has no Terminal and no SSH, Option A is the whole path; do not skip it because the
  command above is unavailable.

**Option C — JetBackup or the host's own backup software**, if the account has it (cPanel →
JetBackup 5 → *Databases*). Take a full backup and additionally **ask the host to take a
snapshot** before the cutover. A snapshot is a useful extra and still does **not** satisfy §1:
it lives on infrastructure you do not control, and you cannot verify it by restoring it
yourself.

### 3.2 The files

**Option A — cPanel → Files → Backup Wizard → "Full Account Backup"** (or *Download a Home
Directory* for the smaller variant). Simplest, slowest, and the one `PRODUCTION-REMEDIATION.md`
§7 already names. It covers the database, home directory, e-mail and configuration in one
archive.

**Option B — File Manager → select `public_html` → Compress → Gzip.** More controllable, and
what you want if you only need the document root. Do not select a directory while a plugin or a
theme is mid-update.

**Option C — SFTP + `tar`**, if SFTP is available. Produces the cleanest archive and the easiest
content check:

```bash
# From the site's home directory on the server.
tar czf ~/hk-home-$(date +%F).tar.gz public_html/wp-content public_html/wp-config.php
sha256sum ~/hk-home-$(date +%F).tar.gz
```

`wp-content/uploads/` is the bulk of this and is also the part most likely to be partial, which
is why §4 checks it specifically rather than trusting the archive's existence.

### 3.3 Storage and naming

- **Store it off the hosting account.** At least one copy on the owner's machine or an external
  drive, and ideally one in separate cloud storage. A backup on the same server, in the same
  cPanel account, or in the same provider's control panel is destroyed by the failure it exists
  for — an account suspension, a disk failure, a botched plugin update, or a compromised account
  all take the copy with the original.
- **Never commit it to the repository.** A full backup contains `wp-config.php` (database
  credentials and salts) and customer data (names, e-mail addresses, shipping addresses) in
  `wp_users` and the order tables. `backups/` is already gitignored in this project for exactly
  that reason (`scripts/export-store-backup.mjs`: "`backups/` is gitignored so this cannot end up
  in a commit; keep it that way") — keep it that way, and do not add an export of a database
  anywhere under a tracked path.
- **Name it with the date, the installation and what it contains**, e.g.
  `hk-apex-db-2026-10-09.sql.gz`, `hk-apex-home-2026-10-09.tar.gz`. When a later step needs "the
  backup", the filename is what proves which one it is; `backup.sql` proves nothing.
- **Record the evidence** in §8 of this document (or a copy of it kept with the files).

---

## 4. How to verify — and the step that is the only real proof

Steps 4.1–4.4 are cheap and catch most broken backups. **Step 4.5 is the one that turns a
taken backup into a verified one**, and the only one that catches a dump of the wrong database.

### 4.1 Is the archive intact and not empty?

```bash
ls -l hk-apex-db-2026-10-09.sql.gz hk-apex-home-2026-10-09.tar.gz   # plausible sizes, not 0
gzip -t hk-apex-db-2026-10-09.sql.gz && echo "db archive OK"        # silence = intact
gzip -t hk-apex-home-2026-10-09.tar.gz && echo "home archive OK"
sha256sum hk-apex-db-2026-10-09.sql.gz hk-apex-home-2026-10-09.tar.gz
```

Expected: `gzip -t` prints nothing and exits 0. A gzip error here means the file is truncated —
a transfer that stopped early looks exactly like a finished one in a file listing, which is why
this runs before anything else.

**Sanity-check the size.** A WordPress database for a shop with orders is measured in tens or
hundreds of megabytes before compression, and a home directory with images in the hundreds. A
3 MB `.sql.gz` on a store with a product catalogue and order history is a dump of the wrong
database or a failed one. If the size surprises you, suspect it rather than proceeding.

### 4.2 Does the dump contain the tables that matter?

```bash
# How many tables are in the dump?
gunzip -c hk-apex-db-2026-10-09.sql.gz | grep -ci '^CREATE TABLE'

# Which of the load-bearing tables are present? (each must appear)
gunzip -c hk-apex-db-2026-10-09.sql.gz | grep -oE 'CREATE TABLE `[^`]+`' | sort > /tmp/dump-tables.txt
grep -E 'wp_(posts|postmeta|options|users|usermeta)$'       /tmp/dump-tables.txt
grep -E 'wp_woocommerce_(order_items|order_itemmeta)$'      /tmp/dump-tables.txt
grep -E 'wp_wc_orders|wp_wc_order_stats|wp_wc_customer_lookup' /tmp/dump-tables.txt   # HPOS-era tables
grep -E 'wp_wc_(product_meta_lookup|category_lookup)'       /tmp/dump-tables.txt
```

Expected: a `COUNT` in the dozens, and every `grep` above returning at least one line. Use the
prefix from `wp-config.php` if it is not `wp_`. Compare the dump's table list with the source's
own list (phpMyAdmin → the database → the table count in the left sidebar) — **the counts must
match.** A dump that has 41 tables where the source has 57 has silently missed a plugin's
tables.

### 4.3 Does the files archive contain the two things that matter most?

```bash
tar tzf hk-apex-home-2026-10-09.tar.gz | wc -l                          # thousands, not tens
tar tzf hk-apex-home-2026-10-09.tar.gz | grep -c 'wp-config.php'       # ≥ 1
tar tzf hk-apex-home-2026-10-09.tar.gz | grep -c 'wp-content/uploads/' # many
tar tzf hk-apex-home-2026-10-09.tar.gz | grep -c 'wp-content/plugins/' # many
# A non-trivial uploads tree: this should be a large number, not 0 or 3.
tar tzf hk-apex-home-2026-10-09.tar.gz | grep -E 'wp-content/uploads/[^/]+$' | wc -l
```

Expected: `wp-config.php` present; a plugin and theme tree present; and an `uploads/` directory
with a real number of files in it. An archive taken while the account's disk quota was full
extracts perfectly and contains an empty `uploads/` — nothing in §4.1 or §4.2 notices.

### 4.4 The versions file

Confirm `system-report-<date>.txt` exists and names the WordPress version, the theme and the
plugins. If WooCommerce's Status screen is unreachable, record at minimum the WordPress version
(`/wp-json/` → the `generator` field, or `readme.html`) and the plugin list from the admin.

### 4.5 The scratch restore — the only step that proves a backup

Restore the **database** into a scratch database and compare it with the source. **Do not restore
over the live database**: a restore on the live installation would throw away every order placed
since the backup, for no diagnostic benefit at all — `PRODUCTION-ROLLBACK.md` lists this under
"Do not roll back by" for the same reason. A rollback is a routing change; a restore is
destructive, and this one is a *test*.

Two ways to get a scratch target, both fine:

- **A second database on the same hosting account** (cPanel → MySQL Databases → create
  `hk_restore_check`), if the account allows it. Fastest, and closest to the real target.
- **A local MySQL/MariaDB or Docker container on the owner's machine.** Nothing on the hosting
  account is touched at all, which is the safest version of this test.

Then:

```bash
# 1. Import into the SCRATCH database only — never the live one.
gunzip -c hk-apex-db-2026-10-09.sql.gz | mysql -h SCRATCH_HOST -u SCRATCH_USER -p SCRATCH_DB

# 2. Table count in the restored copy — must equal §4.2's count and the source's count.
mysql -h SCRATCH_HOST -u SCRATCH_USER -p -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='SCRATCH_DB';"

# 3. Row counts for the tables a restore is judged on. Run on BOTH source and scratch.
mysql -h SCRATCH_HOST -u SCRATCH_USER -p SCRATCH_DB -e "
  SELECT 'posts' AS t, COUNT(*) FROM wp_posts
  UNION ALL SELECT 'postmeta', COUNT(*) FROM wp_postmeta
  UNION ALL SELECT 'options',  COUNT(*) FROM wp_options
  UNION ALL SELECT 'users',    COUNT(*) FROM wp_users
  UNION ALL SELECT 'usermeta', COUNT(*) FROM wp_usermeta;"

# 4. A specific product must survive, by name — proof enough that the data is real.
mysql -h SCRATCH_HOST -u SCRATCH_USER -p SCRATCH_DB -e \
  "SELECT ID, post_title, post_status FROM wp_posts WHERE post_type='product' AND post_status='publish';"
```

Expected: the import completes with no error; the table count matches; each row count matches the
source **exactly**; and the product list matches the live catalogue (13 published products today,
per `CATALOG-COMPARISON.md` — re-read it rather than trusting that number, the plan is to change
it). Record the numbers in §8. If HPOS is enabled, do the same for `wp_wc_orders`.

**A note on comparing row counts.** Do this within a short window of the dump on a live shop: an
order placed between the dump and the comparison moves `wp_posts`/`wp_wc_orders` by one and will
look like a discrepancy. Compare the same tables in the same minute, or note the drift.

Optionally, prove the files archive too by extracting it into a scratch directory and loading one
product page's featured image from it:

```bash
mkdir -p /tmp/hk-restore && tar xzf hk-apex-home-2026-10-09.tar.gz -C /tmp/hk-restore
ls -l /tmp/hk-restore/public_html/wp-content/uploads/ | head
```

**Only when §4.5 has passed may the backup item be recorded as PASS**, with the evidence in §8.

### 4.6 Re-verify after every later change of consequence

A verified backup is verified for the state of the site **when it was taken**. After a plugin
update, a catalogue import, a hostname change or a cutover step, either take and verify a fresh
one, or accept in writing that the recovery point is the older backup.

---

## 5. How a "backup" turns out to be useless

Every row below is a real failure mode of this specific setup, not a generic one. The third
column is the check in §4 that catches it — which is why §4 is written before anything is
declared PASS.

| Failure | How it happens here | Caught by |
| --- | --- | --- |
| **Truncated dump** | A browser download of a large `.sql.gz` that stops at a timeout, or a pipe that dies. The file exists and is listed. | §4.1 `gzip -t` |
| **Dump of the wrong database** | The account holds more than one database: the apex and `/staging` are "separate WordPress installations: separate databases" (`FINAL-GPT6-HANDOFF.md` §3), and the credentials in hand reach `/staging` only. Exporting the wrong one succeeds silently. | §4.2 table count vs source, §4.5 row counts |
| **Only one of the two halves** | The database is dumped and the files are never archived — the common shortcut. Uploads are irreplaceable; the database is not. | §1 (both required), §4.3 |
| **Archive that will not extract** | A partial `tar`/`zip` write, or a transfer that ended early. | §4.1, §4.3 |
| **Backup stored on the same host** | Convenient, and destroyed by the event it was taken for. | §3.3, §1.4 |
| **Backup older than the last content change** | Taken before a batch of product edits or after an order burst. Restoring it loses them. | §6 freshness check |
| **Empty `uploads/`** | Disk quota full at the moment of archiving; the archive is valid and contains no images. | §4.3 (the uploads file count, not the directory's existence) |
| **Orders absent because HPOS is on** | A dump taken expecting `wp_posts` to hold `shop_order` rows, on an installation where they live in `wp_wc_orders`. | §2.1 HPOS check, §4.2 |
| **Tables a plugin added are missing** | Only the WooCommerce tables were checked, not the table count against the source. | §4.2 count comparison |
| **Taken but never restored** | The most common state of all, and the reason §1.3 exists. | §4.5 |
| **Credentials or customer data committed** | A dump dropped into the repository "just in case". | §3.3, and the credential scan in the deployment guard |

---

## 6. Timing, sequencing and freshness

**Take and verify the backup before:**

1. **Any catalogue work** — any create, update, publish or import of a product, and any change to
   categories, prices or stock. This is the step the catalogue plan names as its precondition
   (`FINAL-GPT6-HANDOFF.md` §8 step 1).
2. **Any change to the WordPress hostname configuration** — adding the `wp.himalayankoh.com`
   alias, or an Origin Rule, or touching Site URL/Home URL.
3. **Any plugin, theme or core update**, on the same account, for the ordinary reason.
4. **The cutover itself** — every routing change on the apex.

**Freshness.** A backup is a recovery point, not a permanent qualification. Establish the last
content-change date and compare:

```sql
-- On the live database, read-only.
SELECT MAX(post_modified) AS last_content_change FROM wp_posts;
SELECT MAX(date_created)  AS last_order FROM wp_wc_orders;          -- if HPOS
-- Non-HPOS: order rows live in wp_posts with post_type='shop_order'
SELECT MAX(post_date)     AS last_order FROM wp_posts WHERE post_type='shop_order';
```

If the newest product edit or order is **after** the backup's timestamp, the backup does not
cover the current store: take a new one. A practical rule for this migration: take the verified
backup as the **first** action of the work session that will change anything, and record the
timestamp in §8 next to the same-day `MAX(post_modified)`.

**Ordering within the session.** Back up → verify (§4) → then change one thing → verify the
change → repeat. Never chain several catalogue or hostname changes behind a single unverified
backup: if the third one breaks something, the only recovery point is before the first.

---

## 7. What already exists, and why none of it is the backup

Recorded so nobody re-discovers these and mistakes one for the missing item:

- `docs/production/dns-export-2026-10-08.json` — DNS records and zone settings. Needed for the
  rollback plan; not a WordPress backup.
- `docs/production/CATALOG-COMPARISON.md` — a read-only view of the public catalogue, regenerable
  with `npm run compare:catalogues`.
- `scripts/export-store-backup.mjs` — a **logical** read-only JSON export by its own
  documentation, and its empty case is renamed `…-INCOMPLETE` on purpose.
- `backups/himalayankoh-staging-20260929-code-db.wpress` — an All-in-One-WP-Migration artefact
  from 2026-09-29 whose filename says **staging**. `PRODUCTION-REMEDIATION.md` §7 records the
  `backups/` contents as an extracted file tree rather than a database dump. Either way it is not
  the live apex installation and it predates the current catalogue.
- `backups/2026-09-29-cve-2026-87902/` — a CVE patch report, not a backup.
- `../.freebuff-backup/dealer-wholesale-backup-20260815.sql` — 5 KB, and older than the current
  catalogue.
- `supabase-backup/legacy-orders-migration-report.json` — a report from the historical Supabase
  order migration, not a WordPress backup.

None of these becomes the backup by being renamed, and none of them is the live database or the
live files.

---

## 8. Evidence record — fill this in; it is the PASS

Copy this block, fill it in as the work is done, and keep it with the files (not in the
repository if it names paths that reveal credentials — it should not need to).

```text
BACKUP EVIDENCE — Himalayan Koh live apex
Taken by:                          Date/time (UTC):
Installation backed up:            https://himalayankoh.com  (origin 162.0.209.25)
wp-config.php prefix / DB name:    (from wp-config.php; do not paste the password)

DATABASE
  file:                            hk-apex-db-<date>.sql.gz
  size (bytes):                    sha256:
  taken with:                      phpMyAdmin Custom export | mysqldump (flags: …) | JetBackup
  gzip -t:                         OK | FAILED
  CREATE TABLE count in dump:      source table count (phpMyAdmin):
  core tables present (y/n):       posts ___ postmeta ___ options ___ users ___ usermeta ___
  Woo tables present (y/n):        order_items ___ order_itemmeta ___ wc_orders (HPOS) ___
  HPOS enabled:                    yes | no   (WooCommerce → Settings → Advanced → Features)

FILES
  file:                            hk-apex-home-<date>.tar.gz
  size (bytes):                    sha256:
  entries in archive:              wp-config.php present: yes | no
  plugins/ present:                themes/ present:
  uploads/ file count:             (must be large, not 0)

VERSIONS
  system-report-<date>.txt saved:   yes | no
  WordPress core:                  theme + version:            plugins: <n>

SCRATCH RESTORE  (the proof)
  target:                          scratch DB <name> on hosting | local MySQL | docker
  import result:                   completed with no error | failed: …
  table count restored:            (must equal the source count above)
  row counts — posts/postmeta/options/users/usermeta:
      source: …   restored: …   match: yes | no
  published products in restore:   (expected: the current live count in CATALOG-COMPARISON.md)
  live database touched:           NO (required)

STORAGE
  copy off the hosting account:    <location>            taken on:
  committed to the repository:     NO (required — it contains credentials and customer data)

FRESHNESS
  backup timestamp:                MAX(post_modified) on the source:
  backup is newer than the last content change:   yes | no
```

**PASS condition:** every required line above is filled in, the scratch restore's counts match,
and the live database was not touched. Anything less is **NOT VERIFIED** and the catalogue work
stays blocked.

---

## 9. What remains unknown, and the access that resolves it

Stated explicitly, because a plan that hides its gaps is how a step gets skipped:

| Unknown | Why it is unknown | What resolves it |
| --- | --- | --- |
| Which backup mechanisms this account actually offers (Backup Wizard, JetBackup, WP Toolkit, host snapshots) | The hosting panel has never been accessed from this environment. `PRODUCTION-REMEDIATION.md` §J records that the Namecheap *account* login is not a cPanel login (`401 invalid_login`). | A cPanel login (or SFTP) for the account at `162.0.209.25` — `PRODUCTION-REMEDIATION.md` §R item 2 |
| Whether a host-side backup already exists, and how far back it goes | Same. Nothing in this environment can enumerate the host's backups. | The same login; then cPanel → Backup / JetBackup history |
| Retention settings and whether the host takes automatic snapshots | Same. | The same login, or the host's support |
| The database name, table prefix, and whether HPOS is enabled | `wp-config.php` is on the server and not readable from here. | The same login (File Manager), or one read of `wp-config.php` over SFTP |
| Which of the two installs a given `.wpress` artefact came from, and whether it contains a database | The archive is an opaque binary from 2026-09-29 and is not the live installation in any case. | Not worth resolving; take a fresh, verified backup of the apex instead |
| Whether SSH/Terminal is enabled on the account (Option B in §3.1) | Not measurable from outside. | The same login; if absent, use phpMyAdmin (§3.1 Option A) |
| Database size, and therefore whether the export will need chunking | Needs either the panel or a connection. | The same login, or the `information_schema` query in §4.5 once a scratch copy exists |

**One access unblocks all of it**, and it is the same one that unblocks the `wp.himalayankoh.com`
document root and the PHP error log behind the Store API fatal: a **cPanel (or SFTP) credential
for the hosting account at `162.0.209.25`**.

---

## 10. Relationship to the other production documents

- `FINAL-GPT6-HANDOFF.md` §12 — the current status ("Backup: NONE") and the rule that no
  production database write or catalogue import happens before a verified restore.
- `PRODUCTION-REMEDIATION.md` §7 — the backup blocker as first recorded, and its §R item 4.
- `docs/PRODUCTION-ROLLBACK.md` — routing rollback, which is a different operation from a
  restore and explicitly must not be performed by restoring a database.
- `docs/production/CATALOG-COMPARISON.md` — the catalogue diff whose reconciliation this backup
  gates.
