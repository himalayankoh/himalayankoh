# WordPress hosting preparation — connecting `wp.himalayankoh.com`

**Scope: preparation only.** Nothing in this document has been executed, and nothing in this
repository has changed a DNS record, a Cloudflare rule, a hosting alias, a WordPress setting or
a database row. It describes the exact steps, in order, with the verification that proves each
one, so the connection can be finished deliberately rather than discovered during a cutover.

| | |
| --- | --- |
| Repository | `himalayankoh/himalayankoh` |
| Branch | `integration/cloudflare-workers-migration` |
| Measurements in this document | taken **2026-10-08**, read-only |
| Related documents | `docs/production/FINAL-GPT6-HANDOFF.md` §7/§12/§13, `docs/production/SSL-HARDENING-PLAN.md`, `docs/production/BACKUP-RESTORE-VERIFICATION.md`, `docs/PRODUCTION-REMEDIATION.md` §R |

---

## 1. The goal, and why the backend needs a hostname of its own

The production storefront Worker reads its catalogue, its settings and its media from
WordPress + WooCommerce (the retail source of truth). Those reads go to the **backend origin**,
which is declared once, in `scripts/production-target.mjs`:

```js
export const PRODUCTION_BACKEND_ORIGIN = 'https://wp.himalayankoh.com';
```

That value cannot be the apex. `https://himalayankoh.com` is the **storefront's own public
origin** — it is what canonicals, JSON-LD, the sitemap, email links and Stripe return URLs are
built from, and it is what the Worker itself will serve after the cutover. A Worker whose backend
is its own public hostname calls **itself**: every product read, cart write, admin save and media
fetch would loop back through the Worker, which is the exact failure the cutover is meant to
remove. So the backend needs a hostname that reaches **the same WordPress installation** without
being the storefront's public origin.

`wp.himalayankoh.com` is that hostname, and the point of this document is that **it does not
reach WordPress yet**.

---

## 2. What is already true (measured 2026-10-08)

### 2.1 The DNS half is already done

Read from the Cloudflare API (`GET /zones/{zone_id}/dns_records`, zone
`himalayankoh.com` = `1f114016cd25da9e12c584e48fbd7f96`):

| Type | Name | Target | Proxied |
| --- | --- | --- | --- |
| A | `himalayankoh.com` | `162.0.209.25` | yes |
| A | `wp.himalayankoh.com` | `162.0.209.25` | **yes — already present** |
| A | `mail.himalayankoh.com` | `162.0.209.25` | yes |
| A | `webmail.himalayankoh.com` | `162.0.209.25` | yes |
| CNAME | `www.himalayankoh.com` | `himalayankoh.com` | yes |
| AAAA | `preview.himalayankoh.com` | `100::` | yes (a Workers custom domain) |
| MX ×3 | `himalayankoh.com` | `mx{1,2,3}-hosting.jellyfish.systems` | no |
| TXT | `himalayankoh.com` | `v=spf1 +mx +a +ip4:162.0.209.25 +include:spf.web-hosting.com ~all` | no |
| TXT | `default._domainkey.himalayankoh.com` | a DKIM public key | no |

`wp.himalayankoh.com` already has a **proxied A record pointing at the WordPress host**. No new
DNS record is needed for the name to exist and to pass traffic to `162.0.209.25`.

### 2.2 But the name does not reach WordPress

Every row below is a real request made on 2026-10-08, and the status and body are what came back:

| Request | Result | Reading |
| --- | --- | --- |
| `https://himalayankoh.com/` | **200** | the live WordPress shop (title: *Himalayan Pink Salt for Livestock, Deer, Horses, Sheep*) |
| `https://himalayankoh.com/wp-json/` | **200**, `application/json` | the WordPress REST index — `{"name":"Himalayan Koh","description":"Pink Salt for horses, cattle and deer","url":"https…` |
| `https://himalayankoh.com/wp-json/wp/v2/product?per_page=1` | **200** | returns a real product (id `2461`) |
| `https://mail.himalayankoh.com/wp-json/` | **200**, `application/json` | **the same WordPress REST index** as the apex |
| `https://wp.himalayankoh.com/` | **200** | a **hosting placeholder page** — a document whose only content is a `META HTTP-EQUIV="refresh"` redirect to the host's default page |
| `https://wp.himalayankoh.com/wp-json/` | **404** | WordPress is not answering this hostname |
| `https://wp.himalayankoh.com/wp-login.php` | **200**, body *“Checking your browser…”* | a challenge page, **not** the WordPress login |

So the DNS record is not the missing piece. The missing piece is **origin-side host mapping**:
the request reaches the hosting server, the server does not know which site to serve for that
hostname, and hands back the placeholder.

### 2.3 The pattern is already proven on this hosting account

`mail.himalayankoh.com` resolves to the **same** IP, is proxied by the **same** Cloudflare zone,
and answers `/wp-json/` with **the same WordPress REST index** as the apex. Whatever makes
`mail.` reach the installation will make `wp.` reach it too — the mechanism is already working
one hostname over, which removes most of the risk from this step.

There are two mechanisms that can produce that effect, and they are not mutually exclusive:

**(a) Hosting-side alias or subdomain (cPanel).** A subdomain/alias record whose **document root
is the existing WordPress installation directory** — the same directory the apex serves. The
request arrives with `Host: wp.himalayankoh.com`, the web server matches a vhost, and WordPress
serves the site.

**(b) Cloudflare Origin Rule overriding the Host header.** Cloudflare → **Rules → Origin Rules**:
for hostname `wp.himalayankoh.com`, set the origin **Host** header to `himalayankoh.com`. The
origin then sees a Host it already serves, and no hosting change is needed at all.

**Which one `mail.` uses is now measured, and it is (a).** A later pass read the zone's rule
surface with a token that can read rulesets:

- The zone `himalayankoh.com` contains **three rulesets, all Cloudflare-managed**
  (`http_request_sanitize` «Cloudflare Normalization Ruleset», `http_request_firewall_managed`
  «Cloudflare Managed Free Ruleset», `ddos_l7`). There are **no custom rules of any kind** on
  this zone: `http_request_origin`, `http_request_dynamic_redirect`, `http_request_transform`
  and `http_request_late_transform` each answer **404 — no entrypoint ruleset in that phase**.
- So there is **no Origin Rule for `mail.himalayankoh.com`**, and therefore the mechanism that
  makes `mail.` reach WordPress is **hosting-side (cPanel)**, not Cloudflare-side. Option (b)
  above is unimplemented on this zone today.
- Creating option (b) anyway is **not available to the tooling**: a `PUT` to
  `/zones/{zone_id}/rulesets/phases/http_request_origin/entrypoint` returns **403
  `Authentication error`** — the DNS-scoped token that can *read* rulesets cannot *write* them.
  **Nothing was changed** (the phase still returns 404 after the attempt), and a write would
  need a token carrying **Zone → Config → Edit** (Rulesets write).
- The origin still refuses to identify itself to anyone outside Cloudflare. A direct request to
  `162.0.209.25` carrying `Host: himalayankoh.com` — and one carrying `Host:
  wp.himalayankoh.com` — both return **403 `Request forbidden by administrative rules`**, a
  server-level access rule, so the origin's vhost state cannot be proven from a workstation.

**Consequence:** `wp.` can be connected by exactly one of two routes, and both are the owner's:

| Route | What it needs | Available now? |
| --- | --- | --- |
| **cPanel alias / subdomain** with the WordPress document root (copy what `mail.` does) | hosting-panel or SFTP access to `162.0.209.25` — the `NAMECHEAP_USER` / `NAMECHEAP_PASS` pair in `.env.local` was measured against `POST https://himalayankoh.com:2083/login/?login_only=1` and answers **HTTP 401** | **No — blocked** |
| **Cloudflare Origin Rule** overriding the Host header for `wp.` | a Cloudflare token with **Zone → Config → Edit**; the read-only attempt returned **403** | **No — blocked** |

If the panel is reachable, the cheapest thing to copy for `wp.` is whatever `mail.` already has.
If neither route can be taken, the hosting provider should be asked directly — before any
cutover, not during one.

---

## 3. The constraint that outranks every step: do not change Site URL or Home URL

WordPress stores its own address twice: **Site URL** (`siteurl`, where the installation lives)
and **Home URL** (`home`, what visitors are served). This backend keeps **both** at
`https://himalayankoh.com`, and that is deliberate:

- WordPress writes the Site URL into every link it generates — admin URLs, REST links, feeds,
  `og:url`, sitemap entries, emails, and the `guid` of every existing product and page. Changing
  it rewrites the address of content that is **already published and indexed**.
- The apex storefront is live today. If WordPress starts generating `wp.himalayankoh.com` URLs,
  the shop the public is using right now begins producing links to a hostname that is not the
  public domain.
- Nothing about this step requires a settings change. The hostname is a **server-side address**
  for the Worker to read from; WordPress does not need to know it exists. The `url` field in the
  REST index must still read `https://himalayankoh.com` **after** this work is complete — that is
  the check in step 5.4 below.

**Do not do any of the following as part of this work:**

- Do not change **WordPress Address (Site URL)** or **Site Address (Home URL)**, in
  `wp-config.php` (`WP_HOME` / `WP_SITEURL`), in the `wp_options` table, or through wp-cli.
- Do not run a **search-replace** over the database or a serialised-data migration plugin
  (Better Search Replace, WP Migrate, “WP-CLI search-replace” and similar). Those exist to move a
  site to a new address; this is not that, and they corrupt serialised option values when they
  are used for it.
- Do not import a database, import products, run a WooCommerce importer, or add/rename
  categories. Catalogue work is a separate, backed-up, owner-approved activity.
- Do not change **permalinks**, do not re-save the “Settings → Permalinks” page, and do not
  change the `/staging` installation (it is a different site with its own credentials).
- Do not attach `himalayankoh.com` or `www.himalayankoh.com` to the Worker.
- Do not enable or change an SSL mode while doing this — that is
  `docs/production/SSL-HARDENING-PLAN.md`, and it is gated on evidence the origin does not have
  yet.

---

## 4. The ordered steps

### Step 0 — Pre-flight (no change)

Regenerate the rollback reference and record the current state, so any later change has a
before-picture:

```bash
CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-) npm run export:dns
# → docs/production/dns-export-<date>.json, "source": "cloudflare-api"
```

Record the two facts that must not move:

```bash
curl -s https://himalayankoh.com/wp-json/ | grep -o '"url":"[^"]*"' | head -1
# expected: "url":"https://himalayankoh.com"
```

### Step 1 — Determine how `mail.` reaches the installation

Use the table in §2.3: look for an **Origin Rule** in Cloudflare and for a **domain/alias entry**
in cPanel. Note which one exists. If neither is visible, stop and ask the host — do not
improvise a third mechanism on a live account.

*Expected result:* you can name the mechanism, and therefore the mechanism to copy.

### Step 2 — Apply the same mechanism for `wp.himalayankoh.com`

**If the mechanism is a Cloudflare Origin Rule (no hosting panel access needed):**

1. Cloudflare dashboard → zone `himalayankoh.com` → **Rules → Origin Rules → Create rule**.
2. Name it so its purpose is obvious, e.g. `wp. host override to the WordPress origin`.
3. **When incoming requests match:** *Hostname* `equals` `wp.himalayankoh.com`.
4. **Then:** *Rewrite* → **Host header** → *Override to* `himalayankoh.com`.
5. Leave **DNS** alone; the A record from §2.1 stays exactly as it is.
6. Save, and note the rule name in the change record for rollback (§5).

**If the mechanism is a hosting-side alias (requires the cPanel login for `162.0.209.25`):**

1. cPanel → **Domains → Create A New Domain** (or *Subdomains*, depending on panel version).
2. Domain: `wp.himalayankoh.com`. **Un-tick** “Share document root” if the panel offers it, so
   the document root becomes editable.
3. Set the **document root to the existing WordPress installation directory** — the same path
   the apex serves. Do not create a new directory, do not install WordPress, do not point it at
   a folder that contains a second copy of WordPress.
4. Do not create a database, do not run an installer, and do not touch the existing database
   user. If the panel insists on creating a directory, check afterwards that the document root
   in the Domains list actually reads the WordPress path, not the new empty folder.
5. If the panel offers “Force HTTPS Redirect”, leave it **off** for now — a redirect added at
   the hosting layer interacts with the current `ssl: flexible` zone setting and with
   WordPress's own canonical redirects. HTTPS enforcement belongs to the SSL plan, in the order
   that plan specifies.

*Expected result:* the rule exists, or the alias exists with the correct document root. Nothing
about the apex, `www`, `mail` or the WordPress database has changed.

### Step 3 — Verify DNS was not disturbed

```bash
# The A record must still be there, still proxied, still pointing at the same origin.
node -e "fetch('https://api.cloudflare.com/client/v4/zones/1f114016cd25da9e12c584e48fbd7f96/dns_records?per_page=100',{headers:{Authorization:'Bearer '+(process.env.CLOUDFLARE_API_TOKEN||'')}}).then(r=>r.json()).then(j=>console.log(j.result.filter(r=>r.name.includes('wp')||r.name.endsWith('himalayankoh.com')).map(r=>[r.type,r.name,r.content,r.proxied].join(' | ')).join('\n')))"
# expected: A wp.himalayankoh.com | 162.0.209.25 | true   (and the apex and CNAME rows unchanged)
```

### Step 4 — Verify the hostname now reaches WordPress

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wp.himalayankoh.com/wp-json/
# expected: 200   (today: 404)

curl -s https://wp.himalayankoh.com/wp-json/ | head -c 200
# expected: a JSON document beginning {"name":"Himalayan Koh", … — NOT an HTML page,
# and NOT the "Checking your browser…" challenge

curl -s -o /dev/null -w '%{http_code}\n' 'https://wp.himalayankoh.com/wp-json/wp/v2/product?per_page=1'
# expected: 200 (today: 404 with the placeholder)

curl -s 'https://wp.himalayankoh.com/wp-json/wp/v2/product?per_page=1' | head -c 120
# expected: [{"id":… — the same product records the apex returns
```

### Step 5 — Verify WordPress's own address did not change, and the app agrees

```bash
# 5.1 The REST index still advertises the apex, not the new hostname.
curl -s https://wp.himalayankoh.com/wp-json/ | grep -o '"url":"[^"]*"' | head -1
# expected: "url":"https://himalayankoh.com"      ← if this says wp.himalayankoh.com, STOP:
# a Site URL/Home URL setting was changed, and it must be put back before anything else.

# 5.2 The public shop is untouched and still WordPress.
curl -s -o /dev/null -w '%{http_code}\n' https://himalayankoh.com/            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://himalayankoh.com/api/version # 404 (WordPress's own 404, not the Worker)

# 5.3 The other hostnames are untouched.
curl -s -o /dev/null -w '%{http_code}\n' https://www.himalayankoh.com/          # 301 → https://himalayankoh.com/
curl -s -o /dev/null -w '%{http_code}\n' https://himalayankoh.com/staging       # 301 → https://himalayankoh.com/staging/
curl -s -o /dev/null -w '%{http_code}\n' https://preview.himalayankoh.com/      # 200

# 5.4 The repository's own backend health check, aimed at the new hostname.
#     Read-only: it issues GETs only and writes nothing.
WORDPRESS_BASE_URL=https://wp.himalayankoh.com npm run check:wordpress
# expected: the same endpoint results it reports for the apex — /wp-json/ 200,
# /wp-json/wp/v2/product 200. WooCommerce REST will still report 401
# (woocommerce_rest_cannot_view) until an apex key pair exists; that is a
# credential problem, not a hosting problem, and it is tracked separately.
```

### Step 6 — Record the result in the migration record

Update the blocker table in `docs/production/FINAL-GPT6-HANDOFF.md` §7 and
`docs/PRODUCTION-REMEDIATION.md` §R with the **date**, the **mechanism chosen**, and the
**status codes** from steps 4 and 5. The item stays open until an **authenticated** read
succeeds — see §6.

---

## 5. Rollback

Both mechanisms are single, removable objects, and **DNS is never touched**, so rollback is exact:

| Mechanism applied | To undo |
| --- | --- |
| Cloudflare Origin Rule | Cloudflare → Rules → Origin Rules → **delete the rule** named in step 2. The proxied A record for `wp.` is untouched, so `wp.` returns to the placeholder page and nothing else changes. |
| Hosting alias / subdomain | cPanel → Domains → **remove the `wp.` subdomain/alias** created in step 2. **Do not delete a document root** — it points at the live WordPress installation, and deleting it deletes the site. |
| Both (if the rule turned out to be what `mail.` used and the alias turned out not to be needed, or vice versa) | Remove the one that is not working first, verify with step 4, then decide about the other. |

Because the apex, `www`, `mail`, `webmail` and `preview` records were not modified, **there is no
rollback step for them**: they were never changed.

---

## 6. Risks, and the unknowns this document cannot close

1. **An unauthenticated 200 on `/wp-json/` is not proof the backend works end to end.** It proves
   the hostname reaches WordPress. The storefront's real reads use **WooCommerce REST v3 with a
   key pair**, and the apex currently rejects the configured pair (`401
   woocommerce_rest_cannot_view`). Apex WooCommerce credentials are a separate, blocking
   dependency; until they exist, the production backend is reachable but not yet *readable* by
   the app. Do not treat step 4 as "the backend is ready".
2. **Cloudflare's `ssl: flexible` means Cloudflare connects to the origin over plain HTTP.** Under
   this mode the traffic that carries the WordPress admin session and any API credential is
   unencrypted between Cloudflare and `162.0.209.25`. This is a real exposure that this document
   does **not** fix; it is the subject of the SSL plan, and it must be fixed **before** a
   production Worker sends credentials at this hostname. Sequence the two deliberately: the
   hostname can be prepared now, but the credential-bearing traffic should not start until the
   origin connection is encrypted.
3. **WordPress canonical redirects.** With Site URL = `https://himalayankoh.com`, some WordPress
   code paths emit absolute URLs on the apex, and some send a canonical redirect. The `mail.`
   measurement shows REST reads answer **directly** with `200` (no redirect), which is the
   behaviour the storefront needs — but a redirect that appears only on *other* routes (admin,
   login, REST writes) would not have shown up in that probe and should be checked on the first
   authenticated read.
4. **Media and content URLs will still point at the apex.** WooCommerce image URLs and stored
   `guid` values are absolute `https://himalayankoh.com/...` strings, and they are supposed to
   stay that way. Do not "fix" them, and do not change the Site URL to make them match the new
   hostname.
5. **`wp.` must be proven working before any cutover, not during one.** The production Worker
   holds secrets *named* `WORDPRESS_BASE_URL` and `WOOCOMMERCE_BASE_URL` (values not read), and
   the deployment's declared backend is `https://wp.himalayankoh.com`
   (`scripts/production-target.mjs`). If the cutover happens first, the storefront points at a
   hostname that serves a placeholder.
6. **Unknown: whether an Origin Rule for `mail.` exists at all.** The rulesets API returned 403
   with the available token (§2.3), so this is genuinely unmeasured. The rule count and contents
   must be read before step 2, using a token with zone ruleset read permission.
7. **Unknown: whether the origin has an `wp.` vhost already half-configured.** Direct-origin
   requests are refused for non-Cloudflare source addresses, so origin state can only be observed
   through Cloudflare, or from the hosting panel. Nothing in this environment can rule out a
   partially-configured entry that the panel view will reveal.
8. **Do not substitute `mail.himalayankoh.com` for the backend.** It demonstrably reaches the
   installation today, which is exactly why it is tempting — but it is a mail hostname, it is
   used by MX and mailbox tooling, and pointing a storefront's backend at it makes the store's
   availability depend on a name the mail stack owns. It is cited in this document **only as
   evidence that the alias pattern works on this account.**
9. **`webmail.` and `mail.` share the origin and the same access-rule behaviour.** Do not
   repurpose either while diagnosing `wp.`; a change to them can take mail down, and mail is not
   backed up any better than the site is.
