# Himalayan Koh

Next.js 15 (App Router) e-commerce storefront backed entirely by Supabase (Auth, Postgres/RLS, Storage).

For environment variable reference and Vercel deploy settings, see [DEPLOYMENT.md](./DEPLOYMENT.md). For a walkthrough of creating a Supabase project by hand, see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). For how database migrations work in this repo (and which `supabase` CLI commands NOT to run), see [docs/MIGRATIONS.md](./docs/MIGRATIONS.md). The workflow below is the fast path that replaces most of that manual work.

## Prerequisites

- Node.js 18+
- A Supabase project (free tier is fine)
- `.env.local` populated with, at minimum:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_DB_URL` (Supabase Dashboard → Project Settings → Database → Connection string) — required for migrations/schema checks; without it, setup falls back to seeding only and `doctor`/`info` report the DB-dependent checks as unknown

## Developer workflow

Five commands cover the entire lifecycle from a fresh clone to a fully working demo environment. Each is idempotent — safe to run repeatedly, never duplicates data.

### `npm run doctor`

Read-only environment health check. **Never modifies anything.** Reports PASS/WARN/FAIL for:

Node version, npm version, environment variables, Supabase connectivity, PostgreSQL connectivity, required folders, pending migrations, storage buckets, required tables, RLS policies, required Postgres extensions, TypeScript (`tsc --noEmit`), and last build status.

Run this first on a fresh clone, and any time something seems off.

### `npm run setup`

One-command environment bootstrap. A brand-new developer clones the repo, fills in `.env.local`, and runs only this:

1. Verifies `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — stops immediately and names the exact missing variable(s) if any are absent.
2. Tests the Supabase connection — stops with the exact error if it fails.
3. Applies pending migrations directly via Postgres (`SUPABASE_DB_URL`), creating storage buckets and RLS policies as part of that SQL.
4. Seeds demo products/categories/inventory/blog content (`supabase/seed.sql`).
5. Seeds all demo accounts, orders, wishlists, and notifications.
6. Re-runs the required-tables/storage/RLS checks to verify the setup actually succeeded rather than assuming it did.
7. Prints a summary checklist plus verified login details for every demo account.

Safe to run multiple times — every step is `upsert`/idempotent, so re-running never creates duplicates.

### `npm run reset`

**Development only.** Prints a warning and the exact list of demo accounts it will touch, then requires typing `RESET` to continue (or `FORCE=true npm run reset` for CI/non-interactive use). It then:

- Deletes only the data belonging to the known demo accounts (orders, wishlist entries, notifications).
- Leaves schema, migrations, storage buckets, and every non-demo row untouched.
- Re-runs the same seeding used by `npm run setup` to leave you with a fresh demo environment.

### `npm run verify`

Automated PASS/FAIL check of the whole demo workflow: admin/customer login, orders, wishlist, notifications, anon-key API reads, and RLS isolation (public reads allowed, admin-only tables blocked). Exits non-zero on any failure — safe to wire into CI.

### `npm run info`

Prints project metadata at a glance: project version, schema version (migrations applied / total), latest migration, Supabase project ref, seed version, git commit + branch, last build time, and `NODE_ENV`.

## Demo accounts

Created by `npm run setup` (and refreshed by `npm run reset`):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@himalayankoh.com` | `Admin@123` |
| Manager | `manager@himalayankoh.com` | `Manager@123` |
| Sales | `sales@himalayankoh.com` | `Sales@123` |
| Customer | `customer@himalayankoh.com` | `Customer@123` |

## Other scripts

- `npm run dev` / `npm run build` / `npm run start` / `npm run lint` — standard Next.js scripts
- `npm run verify:rls` / `npm run verify:phase0` — narrower legacy verification scripts, superseded day-to-day by `npm run verify`
- `npm run check:stripe` / `npm run check:shippo` / `npm run check:packing` — third-party integration checks
- `npm run check:wordpress` — is the WordPress backend answering, and how does each route fail
- `npm run diagnose:store-products` — read-only, GET-only: narrows the Store API product fatal to its trigger and prints the WordPress-side change set that follows
- `npm run check:client-supabase` — which built routes still download Supabase to the browser. Needs a build and a running server (`--base-url`, default `http://127.0.0.1:3999`); exits 1 while any route is dirty
- `npm run audit:supabase` — how much of the app still depends on Supabase: modules by tier (browser UI / server routes / libs), value imports vs types-only, every table and Storage bucket, and how many modules already use each WordPress/WooCommerce backend. Read-only, no build or network needed

## Database migrations

Migrations live in `supabase/migrations/` and are applied by a custom runner (`scripts/lib/pg.mjs`), tracked in `public._hk_migrations` — **not** by the Supabase CLI's native migration system. Do not run `supabase db push`, `supabase migration up`, or `supabase migration repair` against this project. See [docs/MIGRATIONS.md](./docs/MIGRATIONS.md) for why, and for the correct way to add a new migration.
