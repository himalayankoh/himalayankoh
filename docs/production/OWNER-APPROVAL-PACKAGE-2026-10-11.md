# Owner approval package — 2026-10-11

One document to decide from. Every wording change the site needs is here as a row: the exact text
that is live now, the replacement to paste, the record it lives in, why it should change, and what
stays at risk if it does not. Nothing in Parts A and B has been applied unless the row says
**APPLIED**. Part C is the one live change that was made today, with its rollback.

Companion documents: `docs/production/ADSENSE-CONTENT-ACCURACY-SPRINT-2026-10-11.md` (what was
fixed and verified today) and `docs/content/GUIDE-AUTHORING-BRIEF.md` (the sources behind the six
guide drafts).

Legends: **APPLIED** = already live · **PROPOSED** = waiting for your yes · **BLOCKED** = needs an
asset or a decision from you.

---

## Part A — Critical WordPress claims (read this part first)

### A1. WordPress post 2268 — the highest-priority edit on the site

| | |
| --- | --- |
| Record | post **2268**, slug `why-do-dairy-cows-need-trace-minerals`, author 16, category 28 |
| Status | `publish`, **indexable** (no `noindex`), 209 words, last modified 2023-09-06 |
| Why it is first | it is the one legacy article a search engine can still surface, and its closing paragraph tells a dairy producer that one salt purchase covers every mineral need |

**Exact current wording (final paragraph):**

> Try our premium-quality Himalayan rock salt, which contains 84 trace minerals — all the essential
> minerals your dairy cows need to stay healthy. Click here to order.

**Proposed replacement:**

> A salt product supplies sodium and chloride. Copper, zinc, selenium, iodine and cobalt come from a
> trace-mineral supplement formulated for dairy cattle, given in the amount its label directs and as
> your nutrition adviser specifies.

**Reason.** The article's body correctly lists copper, zinc, manganese, selenium, iodine and cobalt as
the trace minerals dairy cattle need. Its call to action then contradicts that: rock salt is not
fortified with them, the "84 trace minerals" figure is not supported by the published analyses
reviewed for the guides, and the sentence reads as a promise that a salt purchase solves a
mineral-requirement problem it cannot solve.

**Risk if unchanged.** A factual error with an animal-health consequence, on the only indexable
legacy post, is the strongest single reason an AdSense reviewer or a reader would distrust the site's
editorial content. It is also the sentence most likely to generate a complaint from a dairy customer.

*Optional, separate:* the post has no SEO title or meta description set (`_yoast_wpseo_*` are empty),
so the excerpt is used. If you want the guide, the excerpt can stay as it is — it is accurate.

### A2. WordPress post 233 — title and five claim sentences

| | |
| --- | --- |
| Record | post **233**, slug `himalayan-pink-vs-white-salt`, author 1, category 28 |
| Status | `publish`, **noindexed** by the storefront (off-niche title), excluded from the blog listing and the sitemap, but **still publicly readable** |

| # | Exact current wording | Proposed replacement | Reason | Risk if unchanged |
| --- | --- | --- | --- | --- |
| 1 | Title: "Himalayan Pink Vs. White Salt – Why Farmers, Ranchers and Dairies Are Switching to Pink Himalayan for Purity and Nutrients" | "Himalayan Pink Salt and White Salt: What Actually Differs" | "Purity and Nutrients" promises two measured properties the article never measures | A title that promises more than the page delivers; keeps the page flagged off-niche |
| 2 | "Pink Himalayan Rock Salt has the advantage of being the world's purest salt. And it contains up to 84 trace elements good for livestock health." | "Pink Himalayan rock salt is largely sodium chloride, like other rock salts. It contains trace elements from its deposit, in small and variable amounts that are not a substitute for a formulated trace-mineral supplement." | "world's purest salt" is unsubstantiated; the mineral count is unsupported; "good for livestock health" is a health claim | An unsupported purity and health claim on a public page |
| 3 | "This higher quality sodium helps prevent severe performance issues. You get healthier fertility, improved milk production, faster growth, and improved overall health." | Delete. If a closing line is wanted: "Salt supplies the sodium and chloride a ration needs every day. Other outcomes depend on the whole ration, not on the salt alone." | Five production and health promises in one sentence, none of them supported | The single clearest health-claim block in the blog |
| 4 | "They will absorb more healing magnesium." | "Sodium and chloride are the nutrients salt is there to supply." | "healing" is a therapeutic claim | A therapeutic claim in body copy |
| 5 | "Illness and lower production could easily be caused by things in your livestock's salt." | Delete | Suggests competing products cause illness — an unsupported safety allegation about other people's products | A comparative safety allegation, which is the kind of claim that attracts complaints |
| 6 | "Try our best and premium quality Pink Himalayan Rock Salt today and see the improvement it can make in your herd." | "Try our Pink Himalayan rock salt and see how your animals use it." | Promises an improvement | A performance promise in the closing line |

### A3. WooCommerce product descriptions and search snippets — five published products

These are the words under the price and, in the Yoast field, the snippet Google shows. All five are
live and indexable today.

**2544 — `HK-LB-30LBS`, "Himalayan Koh 30 lb Red Rock Salt Lick for Cattle"**

- Current short description: *"This 30Lbs bag of Himalayan Red Rock Salt is specifically developed for beef cattle, suitable for all breeds. It provides essential minerals and nutrients for proper growth, good health, and impressive development."*
- Current Yoast meta description: *"Premium 30 Lbs Himalayan Red Rock Salt for cattle. Provides essential minerals for growth, health, and development. Supports all breeds."*
- Proposed short description: *"This 30 lb bag of Himalayan Red Rock Salt is for beef cattle and suits all breeds. Unrefined rock salt for free-choice feeding: it supplies sodium and chloride, and it is not a trace-mineral supplement."*
- Proposed meta description: *"30 lb Himalayan Red Rock Salt for cattle. Unrefined rock salt for free-choice sodium and chloride. Not a trace-mineral supplement."*
- Reason / risk: growth, development and health outcomes are promised by a salt. Left unchanged, the store's own listing makes the claim the guides exist to correct.

**2543 — `HK-LFH-2lbs`, "Himalayan Pink Salt Licks for Horses 2 lbs"**

- Current short description: *"Himalayan Pink Salt Licks for Horses provide essential minerals and electrolytes. Available in two weight options, these natural salt licks support horse health and energy levels."*
- Current Yoast meta description: *"Natural Himalayan pink salt licks for horses, 2 lbs. Provides essential minerals, sodium, and electrolytes to support horse health and energy levels."*
- Also in the long description: *"…also animal feed salt available in coarse salt grains, salt lumps and salt plate blocks for deer."*
- Proposed short description: *"Himalayan Pink Salt Licks for Horses, sold in two weight options. The salt supplies sodium and chloride, which horses need in the ration; it is not a trace-mineral supplement."*
- Proposed meta description: *"Natural Himalayan pink salt licks for horses, 2 lbs. Supplies sodium and chloride for the ration; not a trace-mineral supplement."*
- Proposed long-description fix: drop "and salt plate blocks for deer" — the store sells no deer product.
- Reason / risk: a health and energy claim attached to a salt lick, plus a deer reference for a product line that does not exist.

**2539 — `HK-LFC-45lbs`, "Bag of Himalayan Pink Salt for Livestock (45 lbs.)"**

- Current short description: *"This 45 lbs bag of Himalayan pink salt is designed for livestock, including horses, cattle, and deer. It is available in three grain sizes and can be mixed with feed or offered as treats. The salt provides essential nutrients for animal wellness and growth."*
- Current Yoast meta description: *"Provide essential minerals to your livestock with our 45 lbs bag of Himalayan pink salt. Available in three grain sizes for horses, cattle, and deer."*
- Proposed short description: *"This 45 lb bag of Himalayan pink salt is for livestock, including horses and cattle. It comes in three grain sizes and can be offered free-choice or mixed into feed. It supplies sodium and chloride, and it is not a trace-mineral supplement."*
- Proposed meta description: *"45 lb bag of Himalayan pink salt for livestock, in three grain sizes. Supplies sodium and chloride; not a trace-mineral supplement."*
- Reason / risk: "essential nutrients … wellness and growth" is a health claim, and deer is not a product line; this snippet is what appears in search results.

**2536 — `HK-ESF-6lbs`, "Himalayan Pink Salt for Livestock – 6 lbs Fine or Coarse Grain"**

- Current short description: *"Himalayan Pink Salt pouches, meticulously crafted to cater to the unique dietary needs of livestock. Each pouch is available in a generous 6 lbs size, offering a tailored mineral solution to promote optimal health. Choose between two distinct grain sizes: Fine Grain and Coarse Grain."*
- Current Yoast meta description: *"Himalayan Koh offers 6 lb pouches of Himalayan Pink Salt for livestock. Available in fine or coarse grain for natural mineral supplementation."*
- Proposed short description: *"Himalayan Pink Salt pouches for livestock, in a 6 lb size and two grain sizes: fine and coarse. The salt supplies sodium and chloride; it is not a trace-mineral supplement."*
- Proposed meta description: *"6 lb pouches of Himalayan pink salt for livestock, in fine or coarse grain. Supplies sodium and chloride; not a trace-mineral supplement."*
- Reason / risk: "tailored mineral solution to promote optimal health" claims a health outcome and implies a mineral formulation the product does not have.

**2531 — `HK-ESF-3lbs`, currently hidden (see Part C)**

- Current short description: *"Elevate your cooking and wellness routines with Himalayan Koh Fine Grain Himalayan Pink Salt. Hand-mined from ancient sea salt deposits, it is naturally rich in minerals like calcium, magnesium, and potassium. This salt is prized for its purity, mild flavor, and beautiful pink hue."*
- Current Yoast meta description: *"Premium Himalayan Koh fine grain pink salt for livestock. Unprocessed, halal, and naturally rich in minerals. Sourced from ancient Himalayan deposits."*
- **Title conflict to fix as well:** the product is the *edible* fine-grain salt, but its title, meta description and SEO keywords describe it as livestock feed ("animal feed supplement"). A shopper searching for cooking salt and a farmer searching for feed salt both land on the wrong page.
- Proposed title: *"Himalayan Koh Fine Grain Edible Pink Salt – 0.5–1 mm"*
- Proposed short description: *"Fine-grain Himalayan pink salt for cooking, hand-mined and unrefined, with a 0.5–1 mm grain. Sold for kitchen use."*
- Proposed meta description: *"Fine-grain Himalayan pink salt for cooking, 0.5–1 mm, unrefined and halal. Hand-mined Himalayan rock salt in a resealable pack."*
- Reason / risk: the words "wellness routines" and "prized for its purity" make claims about an edible salt, and the livestock/cooking mix-up mis-sells the product to both audiences.

### A4. WordPress post 2475 — the YouTube link text

| | |
| --- | --- |
| Record | post **2475**, slug `how-to-cook-with-himalayan-pink-salt`, author 1, category 1 · mirrored in `docs/content/how-to-cook-with-himalayan-pink-salt.html:39` |
| Current wording | "Visit the **Himalayan Koh Salt That Heals** YouTube channel for more from the brand. The channel includes salt block videos; use the edible product listing for questions about cooking salt." |
| Proposed replacement | "Visit the [Himalayan Koh YouTube channel](https://www.youtube.com/@himalayankohsaltthatheals3451) for more from the brand. The channel includes salt block videos; use the edible product listing for questions about cooking salt." |
| Reason | The channel keeps its name and its URL handle — nothing about your channel changes. On an indexable page, "Salt That Heals" as link text reads as the site asserting a healing property of salt. |
| Risk if unchanged | Read by an AdSense reviewer as an unsupported health claim in body copy on the store's flagship guide. |
| Your call | This is your approved tagline, and the app's own claim scanner deliberately allows `Himalayan Koh — Salt that Heals` as the brand name. Keeping the link text is a legitimate commercial decision; only the body-copy framing is the exposure. |

### A5. Two customer testimonials on `/about`

| | |
| --- | --- |
| Record | `src/views/AboutPage.tsx`, lines 69–70 (Darolyn Butler) and 75–76 (James A. Brenek) — app-rendered, so a change ships with the app, not WordPress |

Both statements are the customers' own words, published with their names and towns, so they are not
mine to rewrite. What is live today is a customer's *belief that a product change produced a health
improvement*, on the page a reviewer opens to judge trustworthiness.

- **Darolyn Butler (Cypress Trails Equestrian Center, Humble, TX):** *"…I have been feeding it for about 15 months. I believe my horses are the healthier and able to thrive in this Texas heat due to this change to Himalayan Koh salt."*
- **James A. Brenek (Conroe, TX):** *"…their products are by far the best salt blocks we have purchased for our deer ranch."*

Options, in the order I would recommend them:

1. **Keep both verbatim and label them** — e.g. a small heading "What customers say" and a line noting these are customers' own comments, not claims by Himalayan Koh. Lowest effort, keeps the goodwill, removes the impression that the site asserts the outcome.
2. **Ask each customer** whether they are happy for a factual version to be published (for example, Darolyn's could simply end: *"…I have been feeding it for about 15 months, and salt is a daily part of their ration."*). Requires their consent; do not do it silently.
3. **Retire them** — remove the causal health statement and keep the page to sourcing, policies and the editorial team.

Risk if unchanged: testimonials that attribute health outcomes to a product are exactly what the
AdSense content rules and FTC-style endorsement guidance single out, and they sit on a page whose
job is to look trustworthy.

### A6. Home page durability claims (`src/views/HomePage.tsx`)

| | |
| --- | --- |
| Record | `src/views/HomePage.tsx` — the `saltBenefits` list (line 12) and the `healthCards` list (line 19), both rendered on the home page |

| Exact current wording | Why it is flagged | Proposed replacement |
| --- | --- | --- |
| "Solid rock salt licks withstand rain, wind, and pasture weathering **significantly better than compressed salt blocks**." | A comparative performance claim about another product type. No published source supports "significantly better", and my own fact-check for the guides recorded this comparison as **not verifiable**. It is also commercial positioning, which the mission reserves for you. | "Solid rock salt licks are easy to see and check, and they do not blow away." |
| Card "Essential Electrolyte Support" / "Sodium and chloride are fundamental nutrients required for normal osmotic balance, cellular function, and feed consumption." | The body text is defensible; the marketing title makes it read as a benefit claim | Retitle to "Sodium and Chloride", keeping the factual body copy |
| Card "Weather-Resistant Durability" / "Dense, natural crystal rock salt blocks resist dissolving in rain and humidity, reducing waste in outdoor pastures and paddocks." | "reducing waste" is an unmeasured benefit | Retitle to "For Outdoor Placement"; body: "Rock salt dissolves in water, so a block kept off the ground and out of standing rain lasts longer." |
| Card "Naturally Sourced Minerals" / "…retains naturally occurring trace elements with zero added binders." | "zero added binders" is fine if true of the supplied product (it is presented as unrefined rock salt); "Naturally Sourced Minerals" as a title leans on the mineral framing | Retitle to "Unrefined Rock Salt" |

These four are the only remaining claim-shaped statements the app itself renders. Everything else
the live sweep found belongs to WooCommerce or to your articles (Parts A1–A4).

---

## Part B — The nine owner-approval items

| # | Item | Where | Status |
| --- | --- | --- | --- |
| 1 | Approve or decline the six guide drafts (Part E) | `docs/content/*.html` | awaiting your decision |
| 2 | Post 2268 closing paragraph | WordPress 2268 | PROPOSED (A1) |
| 3 | Post 233 title + six edits | WordPress 233 | PROPOSED (A2) |
| 4 | YouTube link text | WordPress 2475 + the local mirror | PROPOSED (A4) |
| 5 | Five WooCommerce descriptions and Yoast snippets | products 2544, 2543, 2539, 2536, 2531 | PROPOSED (A3) |
| 6 | Two `/about` testimonials | `src/views/AboutPage.tsx` | your call (A5) |
| 7 | Home page durability bullets and card titles | `src/views/HomePage.tsx` | your call (A6) |
| 8 | Review the three copy changes already deployed (hero, pasture section, sitewide description) | live since `76310c1` | **APPLIED** — revert in one commit if you disagree |
| 9 | Supply the 3 lb packaging photograph | Part D | **BLOCKED** |

### How each item will be applied once you say yes

- **WordPress articles and products:** edited in WordPress admin by the app's existing CMS path
  (posts) and the WooCommerce product editor (descriptions + Yoast fields). Only the fields named in
  the row are written. Price, stock, SKU, images, categories and attributes are read back before and
  after, as `scripts/set-listing-status.mjs` does for status.
- **App copy (A5, A6):** small edits to `src/views/AboutPage.tsx` and `src/views/HomePage.tsx`,
  verified by typecheck, lint, the full test suite and the production build, then the normal
  guarded deploy.
- **Guides:** published one at a time, never as a batch, each after you have read it.

---

## Part C — The live change made today: 3 lb product hidden

You asked for this one, so it is done rather than proposed. Recorded here in full because it is a
production store change.

| | |
| --- | --- |
| Target | WooCommerce product **2531**, SKU **`HK-ESF-3lbs`**, type simple (not a variation — verified from the store, which is why this was a one-field change) |
| Change | `status`: `publish` → **`draft`** |
| Tool | `scripts/set-listing-status.mjs` (new, dry-run by default: it resolves the SKU, refuses unless exactly one product matches, prints the before-state, writes only `{ status }`, saves the before-state under `.git/`, then re-reads and fails if any other field drifted) |
| Backup | `.git/listing-status-production-HK-ESF-3lbs-*.json` (private, never committed) |
| When | 2026-10-11, after the production deploy of `76310c1` |

**Preserved, read back from the store after the write** (the script asserts each one): SKU
`HK-ESF-3lbs`, price `19.95`, regular price `19.95`, no sale price, stock status `instock`, stock
quantity `10`, `manage_stock` true, catalog visibility `visible`, slug, name, 4 gallery images. No
other product was written, no order was read or changed, and nothing was deleted.

**Verified on the live storefront:**

| Check | Result |
| --- | --- |
| Product page `/products/<slug>` | **404** |
| `/api/catalog` | dropped 2531 within ~100 s (60 s fresh + stale-window revalidation that nothing else had purged), 6 → 5 products |
| `/products` listing | 3 lb link gone after ~50 s |
| `sitemap.xml` | 27 → 26 URLs; the 3 lb URL is no longer listed (the 5 remaining products are) |
| Buy attempt, `POST /api/cart {productId: 2531}` | **HTTP 400** — "…is not available for purchase", and the cart stayed empty |
| Other products still sell | 2 lb horse licks added successfully (HTTP 200, total 19.95), then the QA cart was cleared to 0 items |
| `/checkout`, `/api/cart`, `/api/stripe/config` | 200 / 200 / 200, Stripe live and configured |
| Stripe, Shippo, weights, orders | untouched — no write to any of them |

**To reactivate** once the genuine photograph is in place:

```bash
node scripts/set-listing-status.mjs --sku=HK-ESF-3lbs --status=publish          # dry run
node scripts/set-listing-status.mjs --sku=HK-ESF-3lbs --status=publish --apply
```

**Rollback right now**, if you want it visible again before the photo: the same command above with
`--apply`. Everything else about the product is exactly as it was.

---

## Part D — 3 lb photograph requirement (BLOCKED)

**Why the product is hidden:** the retained images for this listing are the 6 lb pouch, and putting a
6 lb package on a 3 lb listing is a mislabelled product rather than a cosmetic problem. There is no
3 lb photograph to map to: WordPress media searches for `3lb`, `3-lb` and `6lb` return zero items.

**Required asset — SKU `HK-ESF-3lbs`, product 2531:**

1. One **original photograph of the actual 3 lb package as it ships** — the pouch the customer
   receives, not the 6 lb pack, not a stock image, with the package's own net-weight line legible in
   frame.
2. Recommended companions from the same shoot: a second angle, a close-up of the grain, and one shot
   with the pack in hand for scale. Four images matches what the other listings carry.
3. If the 3 lb pack and the 6 lb pack share artwork, please say so explicitly — then the two listings
   need a shot each that shows the weight, or the same ambiguity returns.
4. Format: JPEG or PNG, at least 1200 px on the long edge, taken in daylight or even light.

**Exact upload instructions:**

1. WordPress admin → **Media → Add New** → upload the files. Do not rename them to something that
   implies a size they are not; the filename is part of the evidence trail.
2. Open **Products → "Himalayan Koh Fine Grain…" (`HK-ESF-3lbs`)** in WooCommerce.
3. In **Product image**, remove the current 6 lb images and add the new 3 lb photograph as the
   featured image; add the extra angles to the **Product gallery** in the order you want them shown.
4. While you are in there, apply the A3 corrections to that product's title, short description and
   Yoast meta description — it is hidden either way, and fixing it in one visit avoids a second one.
5. Tell me when it is saved, and I will verify the live gallery, confirm the product then reactivate
   it with the command in Part C and check the storefront, the catalogue and the sitemap again.

Until those steps are done the listing stays `draft`, so nobody can buy a 3 lb pack whose picture
shows 6 lb.

---

## Part E — Review of the six guide drafts

Each draft was checked against the brief's sourced fact blocks, and the automated guard
(`src/lib/content/guideDrafts.test.ts`, 34 tests) refuses a prohibited claim, an unsupported mineral
count, a missing source link, a missing internal link or a broken metadata header in any of them.

| Dimension | Finding |
| --- | --- |
| **Factual accuracy** | Every number is quoted from the source in the brief (extension services, the Merck Veterinary Manual, Codex, eCFR/CFR, peer-reviewed analyses). Two passages that reached past the verified facts during drafting — a "unrefined salt in humid air" generalisation and an unverified loose-salt-versus-block moisture comparison — were corrected before the test was written. |
| **Reliable sources** | 5–11 primary links per guide; nothing cites the store as its own evidence, and every "not verified" item in the brief is written as absence rather than padded into a claim. |
| **Product relevance** | Each guide maps to what the store sells: licks and loose salt (1, 6), livestock minerals (2), edible grades (3), storage of both (4), and a buying-literacy piece (5). |
| **Original usefulness** | These are not summaries of each other: intake ranges and their disagreement, the grams-versus-ppm argument, volume-versus-weight in the kitchen, caking as a moisture signal, how to read a certificate of analysis, and water-first handling. |
| **Safety language** | The toxicology figures are labelled as toxicology figures, not feeding limits; a suspected poisoning is directed to a veterinarian; the storage/curing boundary states that salt alone does not make food safe. |
| **SEO title and description** | Present in each header, 30–60 and 110–160 characters, claim-free, asserted by the test. |
| **Internal links** | 2–4 per guide, all to live 200 pages; the redirect-only `/products/himalayan-edible-pink-salt` is not used. |
| **Author attribution** | **None, deliberately.** The brief forbids inventing an author or credentials, and the store has two WordPress users: `James Thover` (id 1) and `Ayaz Bashir` (id 16). Whichever byline you choose must be a real, identifiable person; publishing six educational guides under a persona is an E-E-A-T and compliance risk. Please decide this before publication. |
| **Publication readiness** | Text is ready to paste. What is missing is not text: a byline decision, a category, an excerpt, and — for the illustrated guides — your own photographs, since the brief forbids inventing them. The existing published guide (post 2475) has **no featured image**, so an image is not a blocker, but a guide with no image converts worse. |

**Classification:**

| Bucket | Guides | Note |
| --- | --- | --- |
| **READY FOR OWNER REVIEW** | 1 `horse-salt-licks-vs-loose-salt`, 2 `salt-vs-complete-livestock-minerals`, 3 `fine-vs-coarse-himalayan-edible-salt`, 4 `storing-himalayan-pink-salt`, 6 `livestock-salt-handling-and-safety` | every figure traced to a source that was read while writing |
| **NEEDS FACTUAL REVISION** | 5 `reading-a-salt-analysis-report` | one number must be confirmed before publication: Codex CXS 150-1985's 97 % sodium-chloride minimum. The Codex PDF was not machine-readable during research (and the EUR-Lex page for Regulation 2023/915 timed out), so the guide states the figure with an in-line caveat. Confirm the current standard text, then delete the caveat. The EU lead/mercury limits it quotes are safe as written: they are attributed to the peer-reviewed review that was read, not to the regulation directly. |
| **NEEDS ORIGINAL MATERIAL** | none | No guide requires invented material to publish. Recommended (not required) owner assets: a photograph of the storage setup and a block in the pasture for guide 4, an in-use lick shot for guide 1, and a grain-size comparison for guide 3. |

**How to publish one, when you approve it:**

1. WordPress → Posts → Add New. Set the title and slug from the draft's header comment.
2. Paste the HTML body (it is plain semantic HTML; the WordPress editor accepts it in Code view).
3. Set the excerpt to the guide's meta description, category to the guides category (the existing
   guide sits in category 1), author to the byline you choose.
4. Leave the SEO title/description empty so they inherit, or paste the header's values into Yoast.
5. Publish **one guide at a time**. `/blog` and the sitemap pick it up automatically, and the
   noindex rule in the app only affects livestock-trade posts, so a salt guide is indexable by default.

I will not publish any of these until you say which.

---

## AdSense readiness

**Not approved, and not something this side can claim.** What today changes: the storefront no longer
carries an unsupported animal-health or productivity promise on any page the app renders, the sitewide
announcement no longer advertises a product line that does not exist, nonexistent article URLs return
404 instead of thin 200s, an unverifiable 3 lb listing is no longer purchasable, and six sourced,
substantive guides are ready to give the blog real content.

What still counts against it, honestly:

- Five live WooCommerce listings and their search snippets still make growth, health, wellness and
  energy claims (A3). These are the largest remaining content risk, and they are indexed.
- Post 2268 is indexable and its call to action still asserts a complete-mineral claim (A1).
- Two testimonials attribute health outcomes to the product (A5).
- One published guide plus six drafts is thin for a content-led site; AdSense wants more substance.
- Beyond content, the previously reported hosting resource pressure, LCP and CMP-certification items
  are untouched by this sprint.

## Next actions

1. Say yes or no to A1 — one paragraph on the only indexable legacy post.
2. Approve or decline the six drafts, and pick the byline.
3. Decide A5 (testimonials) and A6 (home page bullets).
4. Approve the A3 product copy, or tell me which listings to leave alone.
5. Supply the 3 lb photograph so `HK-ESF-3lbs` can come back.
6. Confirm the Codex figure so guide 5 can be published without its caveat.

```text
CRITICAL WORDPRESS CLAIMS: 2 posts. Post 2268 (indexable) tells dairy producers that rock salt supplies every essential mineral they need, in its closing call to action. Post 233 (noindexed but public) carries a purity claim, an unsupported mineral count, and five health/production promises. Exact wording and paste-ready replacements in A1 and A2.
OWNER APPROVAL ITEMS: 9 — six guides (1), post 2268 (2), post 233 (3), YouTube link text (4), five WooCommerce descriptions + Yoast snippets (5), two testimonials (6), four home page claim lines (7), the three already-deployed copy changes (8), the 3 lb photograph (9).
GUIDES READY FOR REVIEW: 5 — horse salt licks vs loose salt; salt vs complete livestock minerals; fine vs coarse edible salt; storing pink salt; livestock salt handling and safety.
GUIDES NEEDING REVISION: 1 — "reading a salt analysis report" needs the Codex CXS 150-1985 97 % figure confirmed from the current standard text before publication. No guide needs original material to publish; none will be published without your approval.
3 LB PHOTO REQUIREMENT: product 2531 / SKU HK-ESF-3lbs, currently set to draft and verified unpurchasable. Required: an original photograph of the actual 3 lb package as shipped, its net-weight line legible, plus optional angle/grain/scale shots; upload steps in Part D. The 6 lb packaging image is not used as a stand-in.
ADSENSE READINESS: improved, not approved, not claimed. Remaining risks are owner-authored product copy (5 live listings + snippets), post 2268's call to action, two health-outcome testimonials, thin published article count, and the previously reported hosting/LCP/CMP items.
NEXT ACTIONS: approve or decline A1; approve the guides and choose a byline; decide A5 and A6; approve or defer the A3 copy; supply the 3 lb photograph to reactivate 2531; confirm the Codex figure for guide 5.
```
