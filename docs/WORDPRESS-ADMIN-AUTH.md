# Admin login — how it works now

Admin sign-in used to be Supabase Auth plus a hardcoded list of admin emails.
Supabase is being retired, so the admin console now has two credential sources.
Either one issues the same signed session token, and every `/api/admin/*` route
accepts that token via `verifyAdminRequest`.

## 1. Configured admin accounts — your existing login

This is the login the console used before: the same email, the same password.

```
ADMIN_LOGIN_ACCOUNTS=admin@himalayankoh.com:<sha256 of the password>
```

Several accounts are comma-separated:

```
ADMIN_LOGIN_ACCOUNTS=admin@himalayankoh.com:<hash>,8002salman@gmail.com:<hash>
```

Rules:

- The identifier is case-insensitive. A password never is.
- Only the **SHA-256 digest** is configured. The password itself is never
  written to an environment file and cannot be read back out of the deployment,
  by us or by anyone else. Keep your own copy somewhere safe.
- Malformed entries are skipped rather than guessed at, so a typo cannot become a
  working login — and it does not take the well-formed entries down with it.
- These logins need no WordPress round trip, so the console still opens when
  WordPress is unreachable, mid-migration, or has no matching user.

Generate an entry:

```
npm run admin:hash -- "your password" "admin@himalayankoh.com"
```

It prints the whole `identifier:hash` ready to paste. Passwords shorter than 8
characters are refused — this is the password on the owner's admin console.

## 2. WordPress administrators — application passwords

For anyone who should be able to get in *because they are a WordPress
administrator*, rather than because they are on the configured list:

1. WordPress → **Users → Profile → Application Passwords → Add New Password**.
2. Sign in with your **WordPress username** and that generated password.

The credential is verified server-side against
`GET /wp-json/wp/v2/users/me?context=edit`, and the account must hold the
`administrator` role. WordPress does the authorising; the app invents no second
password. Note that WordPress resolves application passwords by **login name** —
if your WordPress account's login name is your email address, then typing the
email works too.

Requires HTTPS. Over plain HTTP WordPress refuses Basic auth entirely.

## Required on every deployment

```
ADMIN_SESSION_SECRET=<at least 16 characters>
```

This is the key that signs admin sessions. Without it, admin sign-in answers
`503` honestly rather than issuing a token nothing could verify.

Rotate it to sign every admin out at once — the tokens are stateless, so there is
no session table to clear.

## Which source answered?

```
curl -s https://your-site/api/auth/admin/login
```

```json
{
  "configured": true,
  "signingConfigured": true,
  "loginAccountsConfigured": true,
  "wordpressConfigured": true
}
```

It deliberately never reports *which* identifiers exist: "is sign-in configured?"
is a fair question for an anonymous caller, "which email addresses are
administrators?" is not.

## Deploying the credentials

These are server-side credentials, so they go where this project already keeps
its other credentials — a platform secret, never a tracked config file.
`wrangler.jsonc` states the rule in its own header: `vars` is readable by anyone
with the deployment and holds only public values.

```
# Cloudflare (staging Worker — account fd383fa3284298b20cd3ca9ba8b1dffa)
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ADMIN_LOGIN_ACCOUNTS

# Vercel
vercel env add ADMIN_SESSION_SECRET production
vercel env add ADMIN_LOGIN_ACCOUNTS production
```

`ADMIN_LOGIN_ACCOUNTS` is **not** a `NEXT_PUBLIC_` variable and must never
become one: it would then be inlined into the browser bundle. The build already
enforces this — `scripts/check-build-secrets.mjs` scans the build output for the
values of server-side variables and fails the build on a hit.

## Things to be careful about

- **A hash in the repository is still a credential.** A SHA-256 digest cannot be
  replayed, but a weak password can be cracked from it offline. Keep these values
  in the secret store, and prefer a strong password.
- **The password you gave me for `admin@himalayankoh.com` is now in a chat
  transcript.** Rotate it (`npm run admin:hash -- "new password"` and update the
  secret) once you are settled. Nothing else depends on that particular string.
- **`ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` are gone.** They were
  a stopgap in the same session; the hashed account list replaces them and does
  not put a plaintext password in the environment.

## Signing out — one owner

A browser can hold **two** credentials at once, in two different stores:

| Credential | Store | Owner |
|---|---|---|
| Admin session | `luxedge_sb_session` (localStorage) | `services/wordpressAdminAuth.ts` |
| Customer Supabase session | `sb-*` keys + cookie | `lib/supabase/client.ts` |

Neither module may clear the other's store, so the composed operation has its own
single home: **`lib/auth/browserSignOut.ts` → `signOutOfBrowser()`**. Every screen
that offers a sign-out calls it (console account menu, console sidebar, storefront
header menu, account deletion, `AuthContext.signOut`), and nothing else may. The
suite enforces that — `browserSignOut.test.ts` fails if a second file starts
calling `clearSupabaseSession()`.

It is **synchronous on purpose**. Clearing storage after an `await`, or after the
caller has already navigated, leaves the token on disk; the next page load reads
it back, restores the session, and — because `/login` sends an authenticated
visitor to their role's landing page — bounces the admin straight into `/admin`.
That was the bug: the console cleared only the Supabase keys, so the admin token
was never touched and sign-out appeared not to work.

Server-side, the token stays valid until it expires (it is stateless, and the
app cannot revoke it without a store of used tokens). Sign-out is therefore
*this browser* discarding the credential. To revoke every admin session at once,
rotate `ADMIN_SESSION_SECRET`.

## Where Supabase still authenticates

Customer auth is untouched by this document — sign-up, customer sign-in,
password reset and profiles still run through Supabase
(`lib/supabase/api/auth.ts`). Only the **admin** console moved. Phase 4/5 of the
migration covers the rest; see `docs/WORDPRESS-WOOCOMMERCE-MIGRATION.md`.
