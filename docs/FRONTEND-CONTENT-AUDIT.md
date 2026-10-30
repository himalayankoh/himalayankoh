# Frontend content audit — production WordPress vs. the new storefront

Read-only audit run for the frontend content + product migration phase. Production
(`https://himalayankoh.com`, WordPress/WooCommerce) is the primary business-content
reference; staging (`https://himalayankoh.com/staging/`) is the newer copy of the same
content and the only environment anything may be written to. Neither was modified.

Method: every public URL below was fetched with plain GETs, the HTML stripped to text
(captures kept outside the repo in `.freebuff/wp-capture/`), and the product catalogue
read from the public `wp/v2/product` collection plus the product pages themselves. The
Woo Store API is not usable as a source: `wp-json/wc/store/v1/products` answers **HTTP
500 on production and staging alike**, so prices, SKUs and stock were read from the
rendered product pages instead.

## 1. Production public pages

| URL | What it holds | Niche verdict | Action in the new storefront |
|---|---|---|---|
| `/` | Hero + livestock copy ("World's Best for Livestock"), salt blocks for deer, lumps for cattle, licks for horses, three equestrian/deer-ranch testimonials | livestock | **Not migrated.** Homepage copy is written fresh for the human pink-salt store; only facts (Khewra origin, 80+ minerals, Houston warehouse) carry over |
| `/about-us/` | Company story: founded to serve the livestock/feed gap; Khewra Salt Mine (Jhelum District, Punjab, Pakistan); hand-picked exporters; 80+ minerals; livestock-health claims; same three testimonials | mixed | **Migrated with the animal framing removed.** Kept: Khewra origin, hand-picked exporters, mineral count, Houston packing, bulk/wholesale. Dropped: livestock health claims, equestrian testimonials |
| `/contacts/` | Contact form (with data-collection consent), mailing address, phone | usable | **Migrated** — real address, phone and consent line |
| `/faqs/` | 10 real Q&A: returns criteria, 30-day window, refund timing (15 days), return e-mail, 1–2 day dispatch, accepted cards, trademark statement ("KOH" = Mountain, no exclusive right to "HIMALAYAN"), salt safe for bath & beauty, wholesale note | usable, one animal-framed question | **Migrated** to a new `/faqs` page; the "Deer Salt blocks for bath & beauty" question is re-framed as the salt-block bath/beauty question it actually answers |
| `/privacy-policy/` | Classic WooCommerce privacy notice: collection/use/sharing, access & control, security, registration, orders, cookies; support line (201) 401-5104 | usable | **Migrated**: the frontend policy keeps its clearer structure and gains production's guarantees (sole owner of the data, never sold or rented, opt-out of future contact, offline safeguards) |
| `/return-policy/` | Return terms (30 days, unopened/original packaging, refund in the manner paid, free shipping not refunded unless faulty) concatenated with the privacy text twice — the page itself is broken and repeats itself | usable, conflicting | **Migrated as the refund/return terms** (see conflict 5.1) |
| `/terms-conditions/` | Payment methods (Visa, MC, Amex, Discover), phone orders, cancellation window (shipped same day / within 8 hours), returns and non-returnable custom items (salt bags, blocks, lumps over 20 lb), returns address (10909 Jones Rd #425, Houston TX 77065), full shipping & delivery terms (Houston TX warehouse, 1–2 business days, USPS + FedEx, expedited options, tracking e-mail, phone hours Mon–Fri 8–5 CST) | usable | **Migrated in full** into Terms, plus the shipping half extracted into its own Shipping & Delivery page |
| `/shop/`, `/products/` | Catalogue listing | usable | Replaced by the storefront catalogue from WooCommerce |
| `/blog/`, `/himalayan-pink-vs-white-salt/` | Real editorial: pink vs white salt | usable | Kept for a later blog migration (out of scope for this pass — no blog import without owner sign-off) |
| `/why-do-dairy-cows-need-trace-minerals/` | Livestock post | livestock | Not migrated |
| `/free-samples/`, `/photos/`, `/videos/`, `/product-locator/` | Marketing/utility pages of the old site | mixed | Not migrated; no equivalent in the new navigation |
| `/services/…` (`salt-lick-for-horses`, `salt-lumps-for-cattle`, `salt-for-live-stock`, `fresh-dairy-products`) | Four livestock service pages | livestock | **Not migrated.** These are the legacy URLs that most need redirects for the livestock traffic that still lands on them |
| `/category/blog-post/`, `/product-category/animal-feed/` | Taxonomy archives, `animal-feed` is the livestock category | livestock | Not carried; the new category set is pink-salt only |
| `/product-category/bulk-order/`, `/product-category/uncategorized/` | Real Woo categories used by the catalogue | usable | `Bulk Order` maps to the new Bulk & Wholesale shelf; `Uncategorized` products need shelf assignment |
| Theme demo pages (`/classic-2/`, `/chess-4/`, `/grid/`, `/masonry/`, `/cobbles/`, `/typography/`, `/shortcodes/`, `/home-2/`, `/portfolio-2…4/`, `/video-downloader/`, `/stripe-checkout-result/`, `/cart/`, `/my-account/`) | Theme/plugin scaffolding | not business content | Not migrated |
| `/team/*`, `/testimonials/*`, `/portfolio/` | Theme demo content (Robert Gilbert, Miranda Brooks, …; three generic testimonials) | not business content | Not migrated |

## 2. Staging vs. production — same or different?

Every content page was compared text-by-text. **The pages are the same content.**
Staging differs only in ways that do not change meaning:

| Page | Difference found | Verdict |
|---|---|---|
| `/about-us/` | Staging adds an `About Himalayan Koh` page title; e-mail address obfuscation differs | same |
| `/contacts/` | Staging adds `Contact Himalayan Koh`; consent line loses the "see our Privacy Policy" link | same (production's fuller consent line used) |
| `/faqs/` | Staging adds `Himalayan Salt: Frequently Asked Questions`; one phone number | same |
| `/privacy-policy/`, `/return-policy/`, `/terms-conditions/` | Identical apart from e-mail obfuscation | same |

There is therefore **no staging-only business content to rescue** on the pages; production
is used verbatim wherever the wording is carried over. The staging-only material that does
matter is in the catalogue (renamed product titles) and is recorded in
`docs/PRODUCT-MIGRATION-MATRIX.md`.

## 3. Products

14 product URLs appear in the production sitemap, 13 product records are published, and 11
are published on staging. The full reconciliation lives in
`docs/PRODUCT-MIGRATION-MATRIX.md`; the summary:

| Classification | Count | Products |
|---|---|---|
| Approved pink-salt, already in staging WooCommerce | 9 | edible salt grain (2461), edible pink salt jar (2446), rock salt bag (2372), salt pouches (2367), pouches 6 lb (2321), salt lamp (2295), Himalayan Chef fine (2185), Himalayan Chef coarse (2192), salt licks (2352 — see flag) |
| Pink-salt but needs owner review | 1 | `salt-licks` (2352) — the name is used for both animal licks and food-grade "salt licks"; category `Bulk Order`, no price set |
| Animal / livestock product | 4 | `bag-of-salt-for-livestock-45-lbs` (271), `salt-licks-for-horses` (281), `block-of-salt` / salt block for deer (286), `rock-of-salt` / salt rock for cattle (291) |
| Duplicate | 2 pairs | `himalayan-koh-edible-salt-grain` (2461) and `himalayan-edible-pink-salt` (2446) are both fine-grain edible salt; `himalayan-salt-pouches` (2367) and `pouches` (2321) are both pouches |

**Nothing was deleted, archived or edited.** Two of the four animal products (`281`, `286`)
also exist on staging; hiding them there is a staging-only action that waits for the write
credential so the change is recorded in WooCommerce rather than invented in code.

## 4. Policy migration matrix

| Item | Production value | Staging value | Same? | Action |
|---|---|---|---|---|
| Return window | Contact within 30 days of order date | same | yes | Carried into the new Return & Refund Policy |
| Return condition | Unopened, original packaging | same | yes | Carried |
| Refund method | Same manner as purchase (card, check, …) | same | yes | Carried |
| Return shipping | Free shipping not refunded unless faulty/damaged | same | yes | Carried |
| Refund timing | ~15 days to process | same | yes | Carried |
| Non-returnable | Salt bags, salt blocks and salt lumps over 20 lb | same | yes | Carried |
| Returns address | Himalayan Koh, Attn: Returns, 10909 Jones Rd #425, Houston TX 77065 | same | yes | Carried |
| Cancellation | Same day / within 8 hours; call as soon as possible | same | yes | Carried |
| Payment methods | Visa, Mastercard, American Express, Discover; phone orders | same | yes | Carried |
| Dispatch | Packaged and shipped from the Houston TX warehouse in 1–2 business days | same | yes | Carried |
| Carriers | USPS + FedEx; FedEx Next Day Air, 2 Day Air, 3-Day Select; tracking e-mail | same | yes | Carried |
| Phone hours | Mon–Fri 8:00 AM–5:00 PM CST, no weekends/holidays | same | yes | Carried (replaces the invented hours the frontend had) |
| Privacy guarantees | Sole owner of the data; never sold or rented; opt out any time; offline safeguards | same | yes | Carried into the frontend privacy policy |
| Cookies | Cookie use, tracking, and the "not linked to personally identifiable information" statement | same | yes | Carried |
| Support line | (201) 401-5104 (returns/support), (832) 224-6466 (site-wide) | same | yes | Both carried, each labelled with what it is for |
| Trademark statement | HimalayanKoh is a registered trademark; "KOH" = Mountain; no exclusive right to "HIMALAYAN" | same | yes | Carried into the FAQ |

## 5. Conflicts flagged (owner decisions, not silently resolved)

1. **Refunds.** Production promises refunds ("Refunds will be issued in the same manner
   that the purchase was made"). The storefront as it stood said the opposite — a
   *No Refund Policy* section stating "We do not offer refunds; eligible returns are
   replaced with the same product". Following production (and the instruction not to
   rewrite policy into different promises), the page now carries the production refund
   terms, and the replacement path is kept only as the remedy for damaged or incorrect
   orders. **Owner should confirm which promise is current.**
2. **Business hours.** The storefront listed "Mon–Fri 9–6, Sat 10–4". Production lists
   Mon–Fri 8–5 CST with no weekend service. Production's hours are used; the previous
   hours appear to have been invented on the new site.
3. **Response promise.** The contact page promised a reply "within 24 hours". No such
   promise exists in the production content, so it is now "we reply during business
   hours".
4. **Salt licks.** Whether `salt-licks` (2352) is a food-grade product or an animal lick
   changes both its shelf and whether it belongs at all. Left in place, flagged, no price
   set in Woo.
5. **Livestock SEO surface.** Production ranks for livestock queries and has four service
   pages plus a blog post on the subject. Those URLs will exist on the new storefront as
   404s until the redirect map below is activated; a plain redirect to the homepage loses
   the intent, so each is mapped to the closest pink-salt page instead.

## 6. Old URL → new URL map (prepared, not activated)

Production redirects must not be touched in this pass; this is the plan to hand over.

| Old production URL | New storefront URL | Match type | Redirect needed |
|---|---|---|---|
| `/` | `/` | exact | no |
| `/shop/`, `/products/` | `/products` | equivalent | yes |
| `/about-us/` | `/about` | equivalent | yes |
| `/contacts/` | `/contact` | equivalent | yes |
| `/faqs/` | `/faqs` | exact | yes (new page) |
| `/privacy-policy/` | `/privacy` | equivalent | yes |
| `/return-policy/` | `/return` | equivalent | yes |
| `/terms-conditions/` | `/terms` | equivalent | yes |
| `/blog/` | `/blog` | equivalent | yes |
| `/himalayan-pink-vs-white-salt/` | `/blog` (until the post is migrated) | partial | yes |
| `/product/…` (9 approved products) | `/products/<new-slug>` | equivalent, per product | yes — slug confirmed per product in the matrix |
| `/product-category/bulk-order/` | `/products?category=bulk-wholesale` | equivalent | yes |
| `/product-category/uncategorized/` | `/products` | partial | yes |
| `/services/salt-lick-for-horses/`, `/services/salt-lumps-for-cattle/`, `/services/salt-for-live-stock/`, `/services/fresh-dairy-products/`, `/why-do-dairy-cows-need-trace-minerals/` | `/products?category=cooking-serving` | partial (intent closest match) | yes |
| `/product-category/animal-feed/` | `/products` | partial | yes |
| `/product/bag-of-salt-for-livestock-45-lbs/`, `/product/salt-licks-for-horses/`, `/product/block-of-salt/`, `/product/rock-of-salt/` | `/products` | partial | yes |
| `/free-samples/`, `/photos/`, `/videos/`, `/product-locator/`, `/team/*`, `/testimonials/*`, `/portfolio/*`, theme demo pages | `/` | drop with redirect | yes |
| `/my-account/` | `/login` | equivalent | yes |
| `/cart/` | `/cart` if implemented, else `/products` | equivalent | yes |

## 7. Sitemap plan

Included in the production sitemap when the new build ships: `/`, `/products`, `/about`,
`/contact`, `/faqs`, `/privacy`, `/terms`, `/return`, `/shipping`, `/blog` (only if posts
are migrated), and one entry per approved pink-salt product and per live shelf.

Excluded: `/admin/*`, `/login`, `/signup`, `/account`, `/cart`, `/checkout`, `/track`,
`/wishlist`, `/order-confirmation`, `/reset-password`, `/verify-email`, anything on the
preview hostname, test products, and every legacy livestock URL.

The preview build keeps `X-Robots-Tag: noindex, nofollow` and `robots.txt: Disallow: /`;
its sitemap is generated for inspection only and must not be submitted anywhere.
