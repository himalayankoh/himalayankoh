# Environment lock — do not undo

This file records what is **working** as of the last verified deploy. If `.env.local` is deleted or reverted by mistake, use this checklist to restore **local** only. **Production (Vercel) keys stay on Vercel** — they are not in git.

## Live site (locked — verified OK)

| Check | URL / command | Expected |
|-------|----------------|----------|
| Home | https://himalayan-koh.vercel.app | 200 |
| Stripe API | `POST /api/stripe/create-payment-intent` | 200 |
| Shippo rates | `POST /api/shippo/rates` | 200 |
| Code on GitHub | `main` @ `dda0a3f` or newer | Stripe fix + Shippo integration |

Vercel Production already has (encrypted):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` = `https://himalayan-koh.vercel.app`
- `SHIPPO_API_KEY`, `NEXT_PUBLIC_SHIPPO_ENABLED`, all `SHIPPO_FROM_*`

**Do not delete these in Vercel** unless you intend to change providers.

## Local `.env.local` (you must maintain)

1. Copy `.env.local` from project root (template recreated) or duplicate `.env.example`.
2. Paste the **same** Supabase + Stripe values you use on Vercel (from each dashboard).
3. Shippo: paste your key when ready — **test** (`shippo_test_`) for safe label tests, **live** (`shippo_live_`) only when you accept real label charges.
4. Warehouse address is preset (Houston contact page); change only if your ship-from location differs.
5. Restart: `npm run dev:clean`
6. Verify:
   - `npm run check:stripe`
   - `npm run check:shippo` (after Shippo key is set)

## What NOT to re-apply (mistaken undo)

- Do **not** restore the old `api/stripe/` folder (deleted on purpose — it broke live Stripe).
- Do **not** switch Vercel output to `dist/` (legacy Vite).
- Do **not** rely on only `VITE_SUPABASE_*` on Vercel — use `NEXT_PUBLIC_SUPABASE_*`.

## Sync local keys to Vercel (after editing `.env.local`)

```bash
node scripts/sync-vercel-env.mjs
npx vercel --prod
```

## Demo logins (unchanged)

- Admin: `admin@himalayankoh.com` / `Admin123!`
- Customer: `customer@himalayankoh.com` / `Customer123!`

## Email delivery — WP Mail SMTP is **deactivated** on production

`wp-mail-smtp` is off on `wp.himalayankoh.com` on purpose. Its "Other SMTP" mailer
held a mailbox password the server rejects — `SMTP Error: Could not authenticate` —
so every message failed, including WordPress's own password reset, while callers
that only read `wp_mail()`'s boolean were told the mail had been sent.

With the plugin off, WordPress sends through PHP mail and the host's local MTA. The
customer verification email has been delivered end-to-end since: an external inbox
received it, the link opened, the address confirmed, and sign-in succeeded.

**Do not reactivate it without a mailbox password that actually authenticates.**
Prove a change with a real send — the signup flow or a password reset — not with a
boolean. Verification mail leaves with `From: … <ws@himalayankoh.com>`, which is
aligned with the domain's SPF/DKIM.

