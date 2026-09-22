# LeadOS & CRM on WordPress — contract and setup

The LeadOS prospect engine and the CRM lead inbox no longer use Supabase. Their
data lives in custom tables on WordPress, reached through our own REST namespace.
This document is the contract between the two sides.

- **WordPress side:** `wordpress/himalayan-koh-leados.php` — schema and endpoints
  in one file, so the tables and the API can never drift apart.
- **App side:** `src/lib/leados/db.ts` (LeadOS) and `src/lib/leados/crm.ts` (CRM).
- The eight `/api/admin/leados/*` routes were **not** changed: `db.ts` kept its
  exported names and signatures on purpose.

---

## 1. Setup

### 1.1 Install the plugin

Copy `himalayan-koh-leados.php` to the WordPress site as:

```
wp-content/plugins/himalayan-koh-leados/himalayan-koh-leados.php
```

…or zip that folder and use **Plugins → Add New → Upload Plugin**. Then
**activate** it. Activation runs `dbDelta`, which creates the tables and the
default workspace + project.

Deactivating does **not** drop the tables — deleting the owner's leads should
never be a side effect of turning a plugin off.

Confirm it is live:

```
curl -s https://himalayankoh.com/staging/wp-json/leados/v1/projects
# 401 rest_forbidden  →  plugin is active and correctly refusing anonymous access
# 404 rest_no_route   →  plugin is not active
```

### 1.2 Create the application password

The app talks to these endpoints as an **administrator**. In WordPress:

1. **Users → Profile**, with an administrator account selected.
2. Scroll to **Application Passwords**, type a name (`himalayan-koh app`), click
   **Add New Password**.
3. Copy the generated password — it is shown once.

Application passwords require HTTPS. Over plain HTTP WordPress refuses Basic auth
outright, so this cannot be made to work on an http:// origin.

### 1.3 Environment variables

Server-only. Never `NEXT_PUBLIC_` — an administrator application password is full
site access.

```
WORDPRESS_BASE_URL=https://himalayankoh.com/staging
WORDPRESS_ADMIN_USER=<the administrator's WordPress username>
WORDPRESS_ADMIN_APP_PASSWORD=<the generated application password>
```

Spaces in the password are cosmetic and are stripped by both sides, so it can be
pasted exactly as WordPress displayed it.

---

## 2. Authentication

Every endpoint requires the `manage_options` capability. WordPress decides who
is allowed in; the app does not invent a second password or a shared secret.
Requests use HTTP Basic with the application password, which WordPress resolves
to that administrator's user.

A `401` means the credential is wrong or missing. A `403` means the credential is
valid but the account is not an administrator.

---

## 3. Tables

All names are prefixed with the site's `$wpdb->prefix`.

| Table | Holds |
|---|---|
| `leados_workspaces` | The tenant row (`himalayan-koh`). One row today. |
| `leados_projects` | ICP definitions — the default one is created on activation. |
| `leados_leads` | The saved-lead library. |
| `leados_project_leads` | Lead ↔ project links, with fit score and outreach angles. |
| `leados_searches` | Search history. |
| `leados_audit_logs` | Activity trail (saves, updates, outreach). |
| `crm_leads` | The CRM lead inbox behind `/api/crm/*`. |

Fixed ids the app assumes exist:

```
workspace 00000000-0000-0000-0000-000000000001
project   00000000-0000-0000-0000-000000000002
```

**JSON columns** (`industries`, `tags`, `opportunity_signals`, `metadata`, …) are
stored as JSON text and returned **decoded**, so the app sees arrays and objects,
not strings.

**Booleans** (`starred`, `coupon_used`, `opted_in`) are `tinyint(1)`. MySQL
returns them as `"0"`/`"1"`, and `"0"` is truthy in JavaScript — `lib/leados/crm.ts`
converts them in one place so the JSON view and the CSV export agree.

---

## 4. Endpoints

Base: `{WORDPRESS_BASE_URL}/wp-json`

### LeadOS

| Method | Path | Body / query | Returns |
|---|---|---|---|
| `POST` | `/leados/v1/ensure-default` | — | the default project |
| `GET` | `/leados/v1/projects` | — | `{ projects: [...] }` (each with `lead_count`) |
| `POST` | `/leados/v1/projects` | project (camelCase or snake_case) | the saved project |
| `GET` | `/leados/v1/projects/{id}` | — | the project, or `null` |
| `GET` | `/leados/v1/leads` | `search`, `status`, `page`, `limit`, or `id` for one row | `{ leads: [...], total: n }` |
| `POST` | `/leados/v1/leads` | `{ lead: {...}, projectId }` | `{ lead: {...} }` |
| `PATCH` | `/leados/v1/leads/{id}` | `status`, `starred`, `notes`, `tags`, `email`, `phone`, `website` | `{ lead: {...} }` or `{ lead: null }` |
| `DELETE` | `/leados/v1/leads/{id}` | — | `{ deleted: bool }` |
| `POST` | `/leados/v1/searches` | `{ category, location, resultsCount }` | `{ ok: true }` |
| `POST` | `/leados/v1/audit` | `{ action, entityType, entityId, details }` | `{ ok: true }` |
| `GET` | `/leados/v1/stats` | — | `{ stats: {...} }` |
| `POST` | `/leados/v1/import` | `{ table, rows: [...] }` | `{ table, imported, skipped, errors: [...] }` |

`/import` exists for the one-off migration only (see §6). It writes rows with
**ids preserved** via `REPLACE`, so re-running it is idempotent, and it filters
every row to a fixed allowlist of tables and columns — an import path that
accepts arbitrary column names is a way to write to columns the app never meant
to expose. It is administrator-only, like every other endpoint here.

### CRM

| Method | Path | Body / query | Returns |
|---|---|---|---|
| `POST` | `/crm/v1/leads` | `email` (required), `name`, `phone`, `company`, `source`, `page_url`, `coupon_code`, `metadata`, `opted_in` | `{ lead: {...} }` |
| `GET` | `/crm/v1/leads` | `search`, `source`, `couponUsed` (`0`/`1`) | `{ leads: [...] }` |

Errors use WordPress's own shape — `{ code, message, data: { status } }` — and the
app's `WordPressApiError` turns that into a message that names the endpoint rather
than a raw HTML body.

---

## 5. Behaviour worth knowing

**Lead de-duplication is server-side.** When a lead carries an OSM identity
(`osm_type` + `osm_id`), `POST /leados/v1/leads` updates the existing row for the
same `(workspace, data_source, osm_type, osm_id)` instead of inserting a
duplicate. It deliberately does **not** overwrite `status`, `notes`, `starred` or
`tags` — those are the owner's triage, and re-running a search must not undo it.

**`PATCH` accepts a narrow field list.** A patch can change status, stars, notes,
tags and contact details; it cannot rewrite a lead's identity. Setting `email`
also sets `email_source` to `manually_entered`.

**Deletes cascade by hand.** `DELETE /leados/v1/leads/{id}` removes the lead's
`leados_project_leads` rows first. There are no database-level foreign keys, which
is deliberate: `dbDelta` cannot express `ON DELETE CASCADE` reliably, and a failed
delete that leaves links behind is easier to see than a mangled constraint.

**No in-memory fallback.** The old Supabase layer quietly kept leads in a Map when
the tables were missing, which made a broken deployment look like a working one —
leads appeared saved and then vanished. Failures now surface as errors.

---

## 6. Porting existing data

```
npm run migrate:leados                            # DRY RUN — reads both sides, writes nothing
npm run migrate:leados -- --apply                 # perform the import
npm run migrate:leados -- --apply --tables=leados_leads,crm_leads
```

`scripts/migrate-leados-to-wordpress.mjs` reads the `leados_*` tables and
`crm_leads` from Supabase and posts them to `/leados/v1/import`.

**Dry run is the default.** This rewrites tables holding the owner's lead
library, so writing has to be asked for by name. The dry run still reads both
sides, which is what makes it a useful check: it proves the credentials work and
prints the row counts that the real run will have to match.

**It is idempotent.** Rows are written with `REPLACE` and their source ids, so
running it twice leaves one copy rather than two.

**Ids.** `leados_*` ids are UUID strings in both systems and are preserved — which
matters, because `leados_project_leads` points at them. Two are reassigned:

- `crm_leads.id` was a UUID in Supabase and is a `bigint` here. Nothing references
  it, so it is reassigned. Keep the old value in `metadata` first if you ever need
  the link back to another system.
- `leados_audit_logs.id` is an auto-increment log, so WordPress assigns it.

**Order.** Tables are imported in dependency order (workspaces → projects → leads
→ project↔lead links → searches → audit → crm), so a row is never written before
the row it points at.

**Reading the result.** The script finishes with a source-vs-target comparison
using the counts from `/leados/v1/stats`. Once the console has been used, the
WordPress count being *greater* than the source count is expected — those are
rows created after the plugin went live. It exits non-zero on a mismatch.

Nothing is ever deleted from Supabase by this script. The Supabase tables remain
the only copy of that history until you decide otherwise, so verify the counts and
exercise the console before retiring the project.

---

## 7. Where Supabase is still used

Deliberately out of scope for this phase, and still on Supabase:

- Customer auth and profiles (`lib/supabase/api/*`, `lib/supabase/client.ts`)
- Orders, cart, wishlist, notifications, settings, Stripe/Shippo payments side
  effects

Those are the remaining phases of the migration. `lib/stripe/server/supabaseAdmin.ts`
stays until the last of them is done.
