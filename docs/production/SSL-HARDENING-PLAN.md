# SSL hardening plan — from `flexible` to Full (strict), with the certificate gate measured

**Nothing in this document has been applied.** The zone is exactly as it was found. This is a
plan with a blocking finding in it, not a change set.

| | |
| --- | --- |
| Zone | `himalayankoh.com` — id `1f114016cd25da9e12c584e48fbd7f96`, status `active`, plan **Free Website** |
| Date of the measurements below | 2026-10-08 |
| Live site affected by every step | `himalayankoh.com` (WordPress + WooCommerce — the live retail shop) |
| Owner approval required | **Yes, for every setting change.** See `FINAL-GPT6-HANDOFF.md` §15/C2 |
| Re-measure with | the origin prober in §7, the setting reader in §5.1 |

---

## Verdict

All three targets — **Full (strict)**, **HTTPS enforcement**, and a **TLS 1.2 minimum** — are
reachable on this zone, and none of them is a large change. But the first of them is gated on a
fact that is currently **not** satisfied: Cloudflare validates the certificate the **origin**
presents, and this origin presents a certificate for `*.web-hosting.com`, not for
`himalayankoh.com`. Measured today, a TLS handshake to `162.0.209.25:443` with SNI
`himalayankoh.com` — and with SNI `wp.himalayankoh.com` — returns a Sectigo DV certificate whose
CN is `*.web-hosting.com`; Node rejects it with `ERR_TLS_CERT_ALTNAME_INVALID`. So switching to
Full (strict) today would turn origin-validation failure into **HTTP 526** for every visitor to
the live shop. The order matters and is not optional: **a certificate the origin actually
presents for this domain first, Full (strict) second.** Until that certificate is installed and
proven, leave `ssl` on `flexible`, and leave `always_use_https` and `min_tls_version` alone
too — the second and third steps are cheap but they are the wrong side of the gate.

---

## 1. The four settings as they stand, and what each one actually risks

Read from the API today (`GET /zones/{id}/settings/{name}`):

| Setting | Value now | What it means in practice |
| --- | --- | --- |
| `ssl` | **`flexible`** | Cloudflare terminates TLS at the edge and talks to `162.0.209.25` over **plain HTTP on port 80**. The visitor's connection is encrypted; the leg that carries their session cookie, their login and their order is not. |
| `always_use_https` | **`off`** | `http://himalayankoh.com/` is served rather than redirected. An HTTP path exists into a shop that sets `Secure` cookies. |
| `min_tls_version` | **`1.0`** | The edge is permitted to negotiate TLS 1.0/1.1 with visitors — below current guidance (PCI DSS has required TLS 1.2 since 2018, which is the bar that matters for a shop taking card payments). |
| `automatic_https_rewrites` | `on` | Cloudflare rewrites in-page `http://` links to `https://` on the way out. |
| `opportunistic_encryption` | `on` | The edge offers an opportunistic HTTPS upgrade on port 443 for `http://` requests. |
| `tls_1_3` | `on` | TLS 1.3 is enabled at the edge. |

Two of these are better than their neighbours and are worth understanding before touching
anything:

- **`automatic_https_rewrites: on` is not HTTPS enforcement.** It rewrites links inside pages
  Cloudflare can see. It does not redirect a visitor who types `http://`, does not protect an
  API client that calls `http://`, and cannot rewrite a redirect that already went out. Turning
  on `always_use_https` is therefore a real change, not a formality.
- **`sl` `flexible` is the one that carries the risk**, and it is also the one whose name is
  most misleading. "SSL: Flexible" sounds like "encrypted". It means "encrypted to Cloudflare".
  Everything between Cloudflare and the WordPress origin — including an admin login form posted
  at `wp-admin` — crosses the hosting network in clear text today.

**The honest version of the Flexible failure mode.** The classic injury is a **redirect loop**:
an origin that has been configured to force HTTPS (a WordPress Site URL of `https://…`, a
`wp-admin` force-SSL, or an origin `.htaccess` rule) sees an `http://` request from Cloudflare,
redirects to `https://`, Cloudflare is already serving `https://` and asks the origin over
`http://` again, and the two bounce forever — `ERR_TOO_MANY_REDIRECTS` at the visitor. The
second injury is **mixed content and false confidence**: an origin generating `http://` URLs
inside HTML, which `automatic_https_rewrites` may or may not catch, so the page looks
encrypted while some subresource is not. Neither of those is happening on this site right now —
the apex answers `200` over HTTPS to a visitor today — but they are the reason this plan
installs a certificate *before* enabling strict mode and enforcement, rather than after.

Both are also why **Full (strict) is the target rather than plain `full`**: `full` would accept
*any* certificate, including the self-signed and expired ones, and would therefore close the
mixed-content complaint while leaving the origin-authentication hole open. This plan does not
recommend stopping at `full`.

---

## 2. The blocking fact: what the origin presents

This is the measurement the whole plan turns on.

```
TLS handshake → 162.0.209.25:443
  SNI himalayankoh.com        → CN *.web-hosting.com
  SNI wp.himalayankoh.com     → CN *.web-hosting.com
  issuer                        Sectigo Public Server Authentication CA DV R36 (Sectigo Limited, GB)
  SANs                          *.web-hosting.com, web-hosting.com
  validity                      2026-06-03 → 2026-12-18
  negotiated                    TLSv1.3
  Node's judgment               REJECTED — ERR_TLS_CERT_ALTNAME_INVALID
```

Four things follow from that, and each one decides part of the plan:

1. **The certificate is the hosting provider's default**, the name-based virtual-host
   placeholder a shared server presents when it has nothing specific for the requested SNI. It
   is a real certificate from a real CA — it is simply not a certificate **for this domain**.
2. **The port is fine; the certificate is not.** `TCP 80 OPEN`, `TCP 443 OPEN`, `TCP 8443
   TIMEOUT`. The origin does listen on 443. That rules out the simplest explanation ("the origin
   has no HTTPS") and leaves the correct one ("the origin has HTTPS with the wrong name on it").
3. **Full (strict) would fail origin validation for every proxied hostname.** Strict mode
   verifies the origin certificate against the hostname Cloudflare connected for: `himalayankoh.com`,
   `www.himalayankoh.com` (a `CNAME` to the apex), `wp.himalayankoh.com` and `mail.himalayankoh.com`.
   A `*.web-hosting.com` certificate fails all four. The visitor-visible symptom is **HTTP 526
   "Invalid SSL certificate"**, and it would affect the live shop immediately, because the live
   shop is behind exactly this path.
4. **What a visitor sees today proves nothing about the origin.** Probing the *edge*
   certificates with a TLS client returns Cloudflare's own **Universal SSL** certificates:
   issuer `Google Trust Services WE1`, SANs `himalayankoh.com` and `*.himalayankoh.com` (valid
   2026-10-05 → 2027-01-03) for `wp.`, `www.` and `mail.`, and SANs `himalayankoh.com`,
   `preview.himalayankoh.com`, `*.preview.himalayankoh.com` (valid 2026-09-18 → 2026-12-17) for
   the apex. TLS 1.3 negotiated cleanly in every case. Those certificates are Cloudflare's, they
   are valid, and they say nothing whatsoever about what Cloudflare finds when it turns around
   and calls the origin. Confusing the two is the single most common way a "our SSL is fine"
   answer gets given about a `flexible` zone.

**What cannot be established from here, and why it does not weaken the finding.** Direct HTTP to
the origin with `Host: himalayankoh.com` and `Host: wp.himalayankoh.com` both answer **403
"Request forbidden by administrative rules"** — a server-level rule that refuses non-Cloudflare
source addresses. So the origin's per-vhost behaviour cannot be probed directly from this
machine, and the certificate check above had to be done by connecting to the IP while sending an
SNI of our choosing (which the server answered before any HTTP request was involved, so the 403
does not apply to it). The certificate finding stands on its own: whatever vhost answers, the
name on the certificate it presents is not this domain.

---

## 3. The two acceptable ways to satisfy the gate

Either is sufficient. They differ in who can do it and in what a failure looks like.

### (a) A real certificate for the domain on the origin — cPanel AutoSSL / Let's Encrypt

cPanel → **SSL/TLS Status** → select the domain → **Run AutoSSL**, or the provider's Let's
Encrypt plugin. This issues publicly-trusted certificates, renews them automatically, and needs
no change on Cloudflare's side.

- **What it must cover:** the apex and every hostname Cloudflare proxies to this origin —
  `himalayankoh.com`, `www.himalayankoh.com`, `wp.himalayankoh.com`, `mail.himalayankoh.com`.
  A wildcard `*.himalayankoh.com` plus the apex covers all four; four single-name certificates
  cover them too.
- **The trap, and it is the important one.** With the zone proxied and in `flexible` mode, an
  ACME HTTP-01 challenge for this domain does not necessarily reach the origin: Cloudflare is
  answering for the domain, so the challenge can be served from cache or the edge, or refused by
  a WAF rule, and the validation result then reflects Cloudflare's behaviour rather than the
  origin's. It can appear to succeed while the origin still holds nothing, and it can fail for
  a reason that has nothing to do with cPanel. Specifically:
  - **Issue the certificate while `always_use_https` is still `off`.** This is a second reason
    the order in §4 is what it is. Once enforcement is on, every `http://` ACME challenge is
    redirected before it can be answered, and AutoSSL starts failing — a self-inflicted renewal
    outage that appears a cycle later, when the certificate expires.
  - If HTTP-01 keeps failing through the proxy, the two clean ways round it are **DNS-01
    validation** (a `_acme-challenge` TXT record — note this is a **DNS write**, so it needs the
    DNS-write token described in `PRODUCTION-REMEDIATION.md` §R item 10, and it is a change to
    the live zone), or **temporarily setting the record to DNS-only** ("grey cloud") for the
    minutes the validation takes. Both are changes to live DNS and need the owner's approval;
    neither is required if AutoSSL succeeds.
- **Verification is not "the panel said Success".** It is the origin probe in §7 returning
  `ACCEPTED` for every hostname, before Full (strict) is switched on.

### (b) A Cloudflare Origin CA certificate installed on the origin

Cloudflare dashboard → **SSL/TLS → Origin Server → Create Certificate**. Cloudflare signs a
certificate for the hostnames you list, valid up to 15 years, to be installed on the origin
(cPanel → SSL/TLS → Install an SSL Website, or the host's certificate store).

- **What it must cover:** the same four hostnames. Ask for `himalayankoh.com` **and**
  `*.himalayankoh.com` so a future subdomain does not need a new certificate.
- **The trade-off, stated honestly:** this certificate is trusted **only by Cloudflare**. It is
  not in the public CA set, so a browser that reaches the origin directly — the host's own
  "check your site" page, an email link to `https://162.0.209.25`, a monitoring probe pointed at
  the IP — will report an untrusted certificate. That is acceptable for this design (nothing
  public should be reaching the origin directly; Cloudflare is the only intended client), and it
  is exactly what Origin CA certificates are for. The public-facing side, what a visitor sees,
  remains Cloudflare's Universal SSL certificate and is unaffected.
- **The offsetting advantage:** it needs **no ACME validation at all**, so every trap in (a)
  disappears, and it does not depend on the hosting panel's AutoSSL working through the proxy.
- **It still needs the hosting panel** to install it, and it still has to be presented for the
  right SNI. A certificate installed in the panel but not selected for the vhost produces the
  same `*.web-hosting.com` default as today.

**Recommendation:** try (a) first, because it is renewable without a human and because an
untrusted-by-public-CA certificate on the origin is a detail that will need explaining to any
future auditor. Fall back to (b) — or use (b) alongside (a) — if AutoSSL cannot complete through
the proxy. **Both are blocked on the hosting panel, which the owner does not currently hold
(`PRODUCTION-REMEDIATION.md` §R item 2).** That is the real dependency: this plan cannot be
started until a cPanel/SFTP login for `162.0.209.25` exists.

---

## 4. The ordered plan

Each step is gated on the previous one being **verified**, not on it being done. Do not combine
steps. Do not reorder: the only reason the certificate comes first is that Full (strict) without
it is an outage, and the only reason enforcement comes after strict is that AutoSSL renewals
break under enforcement.

### Step 0 — obtain the hosting panel (not a change, a precondition)

- **Needed:** a cPanel or SFTP login for the account at `162.0.209.25`. The Namecheap *account*
  login is not it (`:2083/login/?login_only=1` answers `401 invalid_login` — measured, §R item 2).
- **Why first:** it is the only place a certificate can be installed, and the only place the
  origin's vhost list can be confirmed.
- **While there, record:** the vhost/hostname list, the document root, which certificate each
  hostname is bound to, and the AutoSSL state. That record is what §7's probe is compared
  against.

### Step 1 — get a certificate the origin presents for this domain

Takes route (a) or (b) from §3. `always_use_https` must still be `off` for route (a).

- **What changes:** the certificate bound to the origin's vhost(s). Nothing on Cloudflare.
- **Expected result:** the origin presents a certificate whose SANs cover `himalayankoh.com`
  (and the subdomains in use) — not `*.web-hosting.com`.
- **If it fails:** for (a), see the DNS-01/grey-cloud options in §3; do not proceed to step 2
  with a partial certificate. A certificate that covers the apex but not `wp.` will pass for
  visitors and fail for the backend host, which is a harder problem to notice.
- **Rollback:** none needed — the origin's previous certificate is untouched by installing
  another, and nothing public changes while `ssl` remains `flexible`.

### Step 2 — prove the origin certificate, before trusting it with anything

Run §7's prober. It connects to `162.0.209.25:443` with an SNI of your choosing and prints what
came back and whether Node accepts it.

- **Expected result:** `ACCEPTED` for `himalayankoh.com`, `www.himalayankoh.com`,
  `wp.himalayankoh.com` and `mail.himalayankoh.com`, each with the new issuer and SANs.
- **If it fails:** stop. Full (strict) would 526 the live site. The usual causes are: the
  certificate is installed but not selected for that vhost (SNI still falls through to the
  server default), or its SANs do not include the hostname being probed.
- **Note the caveat from §2:** a password-protected or IP-filtered origin can make this probe
  inconclusive. If it reports the old `*.web-hosting.com` certificate *after* the panel says the
  new one is installed, that is a real signal (the vhost is not binding it) rather than a
  transport trick — the handshake happens before the 403 rule applies.

### Step 3 — switch `ssl` to `Full (strict)`

`PUT /zones/{id}/settings/ssl` with `{"value":"strict"}` — the API's value for what the
dashboard calls **Full (strict)** is `strict` (`full` is the non-validating mode, and `flexible`
and `off` are the others). The dashboard path is **SSL/TLS → Overview → Full (strict)**. Whichever
route is used, **read the setting back** with §5.1 and confirm it is `strict` before believing it:
a typo'd `full` would silently accept any origin certificate, which is precisely the gap this
step exists to close.

- **What changes:** Cloudflare now validates the origin certificate and requires HTTPS on the
  origin leg.
- **Expected result:** the apex, `www`, `wp.` and `mail.` all still answer as they did — and the
  Cloudflare-to-origin leg is now encrypted *and* authenticated.
- **If it fails:** the symptom is `526` on requests that were `200` (see §6). Revert to
  `flexible` immediately (one setting, seconds to propagate) and return to step 1.
- **Rollback:** set `ssl` back to `flexible`. This is the single most important rollback in the
  plan and it is one setting.

### Step 4 — enable `always_use_https`

Only after step 3 has been verified for a while, and **only after** the certificate is in place
and renewing (step 1's second reason).

- **What changes:** plain-HTTP requests are 301-redirected to `https://`.
- **Expected result on the command line:**
  ```bash
  curl -s -o /dev/null -w '%{http_code} → %{redirect_url}\n' http://himalayankoh.com/
  # 301 → https://himalayankoh.com/
  ```
- **Expected result in a browser:** the shop loads over HTTPS, the padlock holds, and no
  resource is blocked as mixed content (the deliberate way to check is the browser's security
  panel, not the address bar).
- **If it fails:** a redirect loop (`ERR_TOO_MANY_REDIRECTS`) means something on the origin has
  started forcing HTTPS — see §1's failure mode — and if Cloudflare is now in strict mode *and*
  enforcement is on, the fix is to turn `always_use_https` back off first and make the change
  reversible, not to start editing the origin's `.htaccess` at speed.
- **Rollback:** set `always_use_https` back to `off`.

### Step 5 — raise `min_tls_version` to `1.2`

- **What changes:** the edge refuses TLS 1.0/1.1 handshakes from visitors.
- **Expected result:** a modern client is unaffected; `curl --tlsv1.0 --tls-max 1.0` fails the
  handshake rather than completing it. Expect a long tail of abandoned clients to be mobile
  browsers and older PHP/curl-based integrations (a shipping or payment webhook that calls
  *this* site — note that inbound webhooks from Stripe and Shippo currently go to the
  WordPress/PHP side, not to the Worker, so this needs checking against the real ones).
- **Inconclusive locally — say so rather than claiming it:** a TLS 1.0/1.1 handshake *test* was
  attempted from this machine and returned `no protocols available`, because the local OpenSSL
  3.5.7 client has those versions compiled out. It therefore tells you nothing about what the
  edge accepts, and it must not be recorded as a pass or a refusal. TLS 1.2 at the edge
  negotiates `ECDHE-ECDSA-CHACHA20-POLY1305`. To prove the 1.0/1.1 refusal you need a client
  that still speaks them, or Cloudflare's own TLS report.
- **Rollback:** set `min_tls_version` back to `1.0`. It is a rare step to need reverting, and
  doing so is one setting.

### Step 6 — re-run the whole matrix, and record it

Run §5 in full, then re-run `npm run export:dns` so the zone-settings half of the rollback
reference reflects reality rather than the pre-change values. Note that the export must be run
with the **settings-capable** token (`PRODUCTION-REMEDIATION.md` §R item 10): the DNS-write token
gets `403` on settings, so an export run with the wrong token silently loses them.

### Optional, and deliberately last: HSTS

`FINAL-GPT6-HANDOFF.md` §12 records a `security_header` object on this zone (an HSTS policy).
HSTS is only safe **after** `always_use_https` is on and verified: a browser that has cached an
HSTS policy for the domain will refuse plain HTTP for the whole `max-age`, so enabling it while
an HTTP path is still live — or while enforcement can still be rolled back — converts a
reversible configuration into an unrecallable one for every visitor who saw the header. Treat
HSTS as its own decision with its own approval, and start with a short `max-age`.

---

## 5. The verification matrix to re-run after every step

### 5.1 Read the zone settings (read-only; needs the settings-capable token)

```bash
T=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)
for s in ssl always_use_https min_tls_version automatic_https_rewrites opportunistic_encryption tls_1_3; do
  printf '%-28s ' "$s"
  curl -s -H "Authorization: Bearer $T" \
    "https://api.cloudflare.com/client/v4/zones/1f114016cd25da9e12c584e48fbd7f96/settings/$s" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).result.value)}catch{console.log("unreadable (wrong token?)")}})'
done
```

All six must print the value the step intended. A `403` or `unreadable` here means the token
cannot read settings — that is the *token*, not the setting, and it must not be read as a pass.

### 5.2 Every hostname in play, from outside

```bash
H=162.0.209.25
for h in himalayankoh.com www.himalayankoh.com wp.himalayankoh.com mail.himalayankoh.com preview.himalayankoh.com; do
  printf '%-34s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code} verify=%{ssl_verify_result}' "https://$h/")"
done
printf '%-34s %s\n' 'http://himalayankoh.com/' \
  "$(curl -s -o /dev/null -w '%{http_code} → %{redirect_url}' http://himalayankoh.com/)"
printf '%-34s %s\n' 'worker *.workers.dev' \
  "$(curl -s -o /dev/null -w '%{http_code}' https://himalayan-koh-ecommerce-prod.<account>.workers.dev/)"
```

| Hostname | Expected before the change | Expected after full success | Why it is in the matrix |
| --- | --- | --- | --- |
| `himalayankoh.com` | `200`, `verify=0` | `200`, `verify=0` | **The live shop.** Its staying `200` is the whole test. |
| `www.himalayankoh.com` | `301` → apex, `verify=0` | `301` → apex, `verify=0` | A `CNAME` to the apex, so it verifies through the same origin certificate. |
| `wp.himalayankoh.com` | `200` (hosting placeholder), `verify=0` | `200`, `verify=0` | The backend hostname, and the one whose SNI is most likely to miss a new certificate. |
| `mail.himalayankoh.com` | `200`, `verify=0` | `200`, `verify=0` | A proxied `A` record to the same origin, and today the hostname that actually serves the WordPress install (`PRODUCTION-REMEDIATION.md` §B). |
| `preview.himalayankoh.com` | `200`, `verify=0` | `200`, `verify=0` | The staging storefront — a **Workers custom domain** (`AAAA 100::`), so it never reaches this origin and must be unaffected by any of it. It is in the matrix to prove that. |
| worker `*.workers.dev` | `401` unauthenticated | `401` unauthenticated | The pre-cutover production Worker's access gate. None of these settings should change it; if it starts answering `200`, something else moved. |
| `http://himalayankoh.com/` | `200` (no redirect) | `301` → `https://…` | The one line that proves enforcement, and the one line that changes at step 4. |

`verify=0` is OpenSSL's "certificate verified successfully". A non-zero value there is the edge
certificate failing to verify, which is a different failure from the origin one in §2 — do not
confuse them.

### 5.3 What does **not** belong in this matrix, and why

- **Mail delivery.** Inbound mail depends on the `MX` records (`mx{1,2,3}-hosting.jellyfish.systems`,
  DNS-only, recorded in `FINAL-GPT6-HANDOFF.md` §13) and on the sending host's SPF/DKIM. None of
  them is touched by `ssl`, `always_use_https` or `min_tls_version`, and none of these settings
  can stop a message arriving. Recorded explicitly because "we changed TLS and mail stopped" is a
  correlation that will be raised, and it is not a mechanism.
- **The email *sending* configuration.** The SPF record
  (`v=spf1 +mx +a +ip4:162.0.209.25 +include:spf.web-hosting.com ~all`) and the
  `default._domainkey` DKIM record are both live and neither authorises Resend
  (`npm run check:email` exits 1, §11 of the handoff). That is an email task, entirely separate
  from this plan.
- **The WordPress Site URL / Home URL.** Not touched by any step here, and must not be: the
  origin serves WordPress with `home` = `https://himalayankoh.com` today, and changing it is a
  different project with different blast radius.

---

## 6. If Full (strict) breaks the live site: the 526 rollback

**Symptom.** Requests to `himalayankoh.com` that were `200` become **`526`** with Cloudflare's
"Invalid SSL certificate" page. The apex's content is unaffected; the failure is purely that the
edge refused the origin's certificate.

**Diagnose in ten seconds.** A `526` is specifically a *verification* failure — the certificate
was seen and rejected. A `525` is a *handshake* failure (nothing usable came back at all), and a
`522` is a connection timeout. If it is `526` and step 1/2's prober now says `REJECTED`, the
certificate is the cause. If it is `525`, look at whether the origin is still answering on 443 at
all. Getting this wrong wastes the incident on the wrong system.

**Fix, in order — do not debug on the live site.**

1. **Set `ssl` back to `flexible`.** Dashboard → SSL/TLS → Overview → Flexible; or
   `PUT /zones/{id}/settings/ssl {"value":"flexible"}`. This restores service immediately,
   usually within seconds, and it is why this setting is changed on its own and nothing else is
   changed with it.
2. Confirm recovery against §5.2 — `himalayankoh.com` must be `200` again.
3. Then, and only then, go back to §3 with the 526 as evidence: the certificate is not being
   presented for that hostname, or its SANs do not cover it.
4. Re-attempt step 3 only when §7's prober returns `ACCEPTED` for every hostname, and change
   nothing else at the same time.

Because the apex stays on WordPress until the cutover is separately approved, this rollback does
not interact with the Worker migration: there is no routing change to unwind, only a setting.

---

## 7. Re-measuring the origin certificate — the prober

This is the command that produced §2 and the one to re-run before step 3 and after step 1. It is
read-only: it opens a TLS connection, reads the peer certificate, and closes.

```bash
node -e "
const tls = require('tls');
const IP = '162.0.209.25';
for (const sni of ['himalayankoh.com','www.himalayankoh.com','wp.himalayankoh.com','mail.himalayankoh.com']) {
  const s = tls.connect({ host: IP, servername: sni, port: 443, rejectUnauthorized: false, timeout: 12000 }, () => {
    const c = s.getPeerCertificate();
    console.log(sni, s.authorized ? 'ACCEPTED' : 'REJECTED (' + s.authorizationError + ')');
    console.log('   subject:', c.subject && c.subject.CN, '| issuer:', c.issuer && c.issuer.O, '/', c.issuer && c.issuer.CN);
    console.log('   SANs:', c.subjectaltname, '| valid:', c.valid_from, '->', c.valid_to, '|', s.getProtocol());
    s.end();
  });
  s.on('error', e => console.log(sni, 'ERR', e.code || e.message));
  s.on('timeout', () => { console.log(sni, 'TIMEOUT'); s.destroy(); });
}
"
```

**Today's expected output is the failure**, i.e. `REJECTED (ERR_TLS_CERT_ALTNAME_INVALID)` with
subject `*.web-hosting.com` for every hostname. The step-2 pass condition is `ACCEPTED` for all
four. Also, if the apex's origin IP ever changes, the `A` records in the zone (recorded in
`FINAL-GPT6-HANDOFF.md` §13) are the source of truth for this address, not this document.

### What cannot be established from outside, and must be confirmed from the panel

- **The origin's vhost list, document roots and certificate bindings.** Direct HTTP to the origin
  is refused with `403 Request forbidden by administrative rules` for non-Cloudflare source
  addresses, so the only external view of the origin is the TLS handshake above.
- **Whether an HTTP-01 challenge can complete through the proxy.** It depends on the WAF, cache
  rules and Origin Rules in front of the origin, and the last of those could not be read with the
  available token: `GET /zones/{id}/rulesets` returned **`403 Authentication error`**, so whether
  a Cloudflare **Origin Rule** (a Host-header override) already exists for any hostname **could
  not be determined here**. That matters to §3(a) and it must be checked in the dashboard
  (Rules → Origin Rules) before concluding that an AutoSSL failure is the origin's fault.
- **Whether the edge refuses TLS 1.0/1.1 in practice.** Inconclusive as described in step 5.

---

## 8. Where this plan sits relative to the rest of the migration

- `docs/production/FINAL-GPT6-HANDOFF.md` §7 and §12 record the same settings as "wrong or risky
  today" and list any change to them under **§15/C2 — requires explicit approval**. This document
  is the plan behind that line item; it changes nothing by existing.
- `PRODUCTION-REMEDIATION.md` §R item 2 (the hosting panel) is the **gating dependency**: steps 1
  and 2 of §4 cannot be attempted without it, and the backups in item 4 need the same login.
- The WordPress hosting work (`wp.himalayankoh.com` reaching the install) is a **separate
  prerequisite of the cutover** and is documented in `PRODUCTION-REMEDIATION.md` §R item 2 / §B.
  It shares the dependency but not the steps: nothing in this plan needs `wp.` to serve
  WordPress, and the SSL plan must not be sequenced behind it.
- **Ordering recommendation for the owner:** panel access → certificate (this plan's step 1) →
  Full (strict) → enforcement → TLS 1.2, and only then the cutover work. Doing the TLS work
  *before* pointing the domain at the Worker means the cutover happens on a zone that is already
  strict and enforcing, rather than layering both changes into the same window.

## 9. What this document did not do

- No live setting was changed: `ssl`, `always_use_https` and `min_tls_version` are exactly as
  found, and no `PUT` was issued against the zone.
- No certificate was created or installed; no ACME validation was attempted.
- No DNS record was read-modify-written; the records quoted here were read read-only.
- No credential value appears in this document, and the prober prints only public certificate
  fields.
