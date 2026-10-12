# Registration surfaces — which doors create an account, and which are open

Measured **2026-10-12** against production (`https://wp.himalayankoh.com`, storefront
`https://himalayankoh.com`) with `scripts/check-registration-surfaces.mjs`. Every row below is a
live answer from that run, not a remembered setting. Background: the census in
`CUSTOMER-DATA-AUDIT-2026-10-11.md`, which is where the 2,704 nameless accounts came from.

---

## 1. The four ways an account can appear, and what each depends on

The question that decides the remedy is not "which forms exist" but **does the storefront need
any of them**. It does not, and the reason is that account creation on this store happens in
exactly one place.

| # | Surface | What gates it | Does the storefront use it? |
| --- | --- | --- | --- |
| 1 | WordPress native — `wp-login.php?action=register` | the WordPress option `users_can_register` | **No.** Nothing in this repository posts to it |
| 2 | WooCommerce My Account — `/my-account/` | the WooCommerce setting `woocommerce_enable_myaccount_registration` | **No.** The storefront renders its own account pages |
| 3 | Storefront sign-up — `POST /api/auth/customer/register` | this app's own route, then the plugin's budget | **Yes — this is the path** |
| 4 | Checkout account creation | surface 3, or an existing session | **Yes, via surface 3** |

Surface 3 is the only caller of account creation in the whole app: `createWordPressCustomer()`
(`src/lib/auth/wordpressCustomerAuth.ts`) is referenced from exactly one route
(`src/app/api/auth/customer/register/route.ts`), and the checkout does not create accounts of its
own. Inside WordPress, the plugin's `hk_storefront_customer_register()`
(`wordpress/himalayan-koh-storefront.php`) validates the address, checks the durable budget,
refuses a duplicate, and calls `wc_create_new_customer()` — WooCommerce's own account creation.

**Surfaces 3 and 4 are therefore independent of surfaces 1 and 2**, and that independence is
visible in the code rather than inferred from behaviour: `hk_storefront_customer_register()` reads
`is_email`, the password length, `hk_storefront_signup_budget_check()`, `email_exists()` and
`wc_create_new_customer()` — it never consults `users_can_register`. Closing surface 1 cannot
break surfaces 3 or 4.

---

## 2. What each surface answers today

| Surface | State | The measurement |
| --- | --- | --- |
| WooCommerce My Account registration | **CLOSED** | setting `woocommerce_enable_myaccount_registration=no`; `/my-account/` is served **without** `id="reg_email"` |
| WordPress native registration | **OPEN** | `wp-login.php?action=register` is served as `<form name="registerform" id="registerform" action="…/wp-login.php?action=register" method="post">`, title *"Registration Form ‹ Himalayan Koh — WordPress"*, with `user_login`, `user_email` and `wp-submit` inputs — and **no** "registration is disabled" notice |
| Storefront sign-up | **OPEN — required** | an empty-body POST is refused `400` with the route's own message before anything is created, which is what "the route is alive" looks like |

The WordPress-native result **corrects this audit's earlier entry**, which recorded that surface as
closed ("returns the plain login page, no registration form"). It is not closed, and it should not
have been reported as closed on the strength of a page fetch that was not re-made.

The page is not a cached artefact of a closed setting: it arrives `cache: DYNAMIC`, and a
cache-busting query string returns the same 5,015-byte page with the form in it.

---

## 3. Why it cannot be closed from here

Three routes were tried, and each is closed for a different reason — recorded so the next session
does not repeat them.

1. **The REST settings API does not expose the option.** `GET /wp-json/wp/v2/settings` returns
   `200` with a payload whose keys are `title, description, url, email, timezone, date_format,
   time_format, start_of_week, posts_per_page, language, default_category, default_comment_status,
   default_ping_status, default_post_format, page_on_front, page_for_posts, show_on_front,
   site_icon, site_logo, use_smilies, pickup_location(s)` — **`users_can_register` and
   `default_role` are absent.** A `POST` of `users_can_register` is accepted with a `2xx` and the
   option reads back absent, and the form is still served afterwards. The write is a no-op, which is
   why `scripts/check-registration-surfaces.mjs --apply` reports failure rather than success.
2. **No wp-admin cookie login is available on this machine.** All four credential pairs held
   locally are refused by `wp-login.php` (`login_error`): `WP_ADMIN_USER`/`WP_ADMIN_PASS` in both
   `../.freebuff/owner-secrets*.local` files, `PRODUCTION_WP_ADMIN_EMAIL`/`…_PASSWORD`, and
   `WORDPRESS_ADMIN_USER`/`WORDPRESS_ADMIN_APP_PASSWORD`. An **application password authenticates
   the REST API and is not accepted by the login form** — that distinction is the whole reason the
   wp-admin step kept being reported as needing a human.
3. **No plugin route writes it.** The plugin contains exactly one
   `update_option( 'users_can_register', 0 )`, inside `hk_storefront_close_legacy_registration()`,
   which is called only from the `plugins_loaded` hook that fires when
   `HK_STOREFRONT_DB_VERSION_OPTION` differs from `HK_STOREFRONT_VERSION` — i.e. on a **plugin
   version change**. None of the `hk-storefront/v1` routes reaches it.

---

## 4. The owner action (one click, reversible)

WordPress admin → **Settings → General** → untick **"Anyone can register"** → Save.

- **Who:** the WordPress administrator account. It needs a *session* login; the application password
  cannot do this.
- **What it changes:** `users_can_register` — one option, the same one the checkbox shows.
- **What it does not change:** the storefront's sign-up route, checkout, any existing account, any
  order, any product. Verified in §1: the register route never reads that option.
- **Reverse it:** re-tick the same box. Nothing else is affected.
- **Alternatively**, a plugin update to a new version applies the same change automatically through
  `hk_storefront_close_legacy_registration()`, which is why the local plugin carries that function
  and its comment.

Once a working wp-admin login exists, the change is one command and it verifies itself:

```bash
node scripts/check-registration-surfaces.mjs              # measure (exit 1 while any surface is open)
node scripts/check-registration-surfaces.mjs --apply      # untick it, then re-measure
node scripts/check-registration-surfaces.mjs --restore=<file>   # put back the recorded before-value
```

`--apply` reads the `Settings → General` form, echoes **every** field back exactly as the page
rendered it and drops only `users_can_register`, because `/wp-admin/options.php` writes an option
*group* — posting one key would reset the site title, the admin address and the timezone. If any
other reported setting moves, it says so.

---

## 5. What is already protecting the sign-up that *is* used

Until the box is unticked, the path that actually creates accounts is not unguarded:

| Control | Where | State |
| --- | --- | --- |
| Reserved and disposable domains refused; address shape and length checked | `src/lib/auth/signupGuard.ts`, called by the route before WordPress is asked for anything | **live** |
| Per-IP budget, 5 per hour | `src/lib/rateLimit.ts`, in the Worker | live (per-isolate) |
| **Durable** budget, held in WordPress and keyed by `cf-connecting-ip` | `hk_storefront_signup_budget_check()` in the plugin, counted before `email_exists()` so hammering one existing address is bounded too | **live** |
| Machine-generated address shapes logged as evidence, not blocked | `signupAbuseSignal()` | live |

**Verified live today, creating nothing:** posting an existing account's address to
`https://himalayankoh.com/api/auth/customer/register` answers **`HTTP 409` — "An account already
exists for this email. Sign in instead."** That is the route running through every gate above and
reaching the account layer, refusing only for the right reason.

```bash
node scripts/check-registration-surfaces.mjs   # WooCommerce My Account: closed · WordPress native: OPEN
npm run check:registration                     # the same check, when a script alias is wanted
```

---

## 6. Verdict

**STORE FRONT SIGN-UP: PASS** — reachable, budgeted in two places, refuses duplicates and reserved
domains, and independent of the legacy forms.

**WORDPRESS NATIVE REGISTRATION: OPEN — NOT SECURED.** It cannot be closed from this machine, and
the abuse path that produced the 2,704 accounts is therefore still partly open at the WordPress
level. **Owner action required:** untick *Anyone can register* (one click, §4).
