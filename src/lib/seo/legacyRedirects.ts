/**
 * Redirect map from the legacy WordPress/WooCommerce site to this app.
 *
 * himalayankoh.com currently runs WordPress, and none of its ranking URLs exist
 * here — every one of them would 404 the moment this app takes over the domain,
 * dropping the rankings and backlinks they have accumulated. Each entry below
 * points a live, indexed legacy URL at its closest equivalent so that link equity
 * transfers instead of evaporating.
 *
 * Two rules this file follows, both learned the hard way:
 *
 * 1. **Destinations must be routes this app actually serves.** The catalogue now
 *    comes from WooCommerce, so a product's URL is `/products/<woocommerce-slug>`.
 *    An earlier version of this map pointed old product URLs at hand-written slugs
 *    that no longer exist, which turned a ranking URL into a 404 one hop later.
 *    Live slugs were confirmed against the staging catalogue — see
 *    `docs/PRODUCT-MIGRATION-MATRIX.md`.
 * 2. **`?category=` destinations must be current shelf keys**, taken from
 *    `lib/catalog/niche.ts`. A retired key silently falls back to "All", so the
 *    link lands on the whole catalogue instead of the shelf it meant.
 *
 * Ordering matters: Next.js applies the first matching rule, so specific
 * product/page mappings must stay above the catch-all patterns at the end.
 *
 * When adding to this list, take the source URLs from Google Search Console
 * (Pages → Indexed) rather than guessing — anything indexed and omitted here
 * falls through to a catch-all and loses its specific ranking. The audit that
 * produced the list below is in `docs/FRONTEND-CONTENT-AUDIT.md` §6.
 *
 * These rules are inert towards production WordPress: they only run inside this
 * app, which does not serve the production domain yet.
 */
export interface LegacyRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

/** Shelf keys that exist in `lib/catalog/nicheSections.ts` today. */
const SHELF = {
  edible: 'edible-pink-salt',
  cooking: 'cooking-serving',
  licks: 'licks-blocks',
  livestock: 'live-stock',
  lamps: 'lamps-decor',
  bulk: 'bulk',
} as const;

const shelf = (key: (typeof SHELF)[keyof typeof SHELF]) => `/products?category=${key}`;

/**
 * The six products the live catalogue sells, read from `GET /api/catalog` on
 * 2026-10-11. Kept here as names rather than as bare strings because the slug of
 * the 3 lb fine-grain product is a hundred characters long and appears twice.
 */
const LIVE_PRODUCT = {
  licks2lb: 'himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh',
  cattle30lb: 'himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh',
  livestock45lb: 'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh',
  pouches6lb: 'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh',
  fine3lb:
    'himalayan-koh-authentic-pure-natural-halal-unprocessed-himalayan-edible-pink-cooking-salt-fine-grain-0-5mm-to-1mm-himalayan-koh',
  jar16oz: 'himalayan-edible-pink-salt-16-oz-jar-fine-grain',
} as const;

const product = (slug: string) => `/products/${slug}`;

/**
 * One retired slug, in both spellings, pointed at wherever that product lives now.
 *
 * Both spellings because the two failures are separate: WordPress served
 * `/product/<slug>`, and this app's own earlier catalogue served
 * `/products/<slug>` — and an earlier crawl of *this* site indexed the second
 * form, so a visitor can arrive by either. `/products/<slug>` is also what the
 * `/product/:slug` catch-all rewrites to, which is why the destinations here are
 * current slugs read back from the live catalogue and not hand-written ones.
 */
const retiredProduct = (slug: string, destination: string): LegacyRedirect[] => [
  { source: `/product/${slug}`, destination, permanent: true },
  { source: `/products/${slug}`, destination, permanent: true },
];

/**
 * Products that used to be sold under these slugs, and where a shopper should land
 * now. Retired by the preview catalog replacement
 * (`docs/production/PREVIEW-CATALOG-REPLACEMENT-2026-10-11.md`), which lists the
 * retired parent ids 2520, 2461, 2446, 2372, 2367, 2352, 2321, 271 and 281.
 */
const RETIRED_PRODUCTS: LegacyRedirect[] = [
  // The horse lick line: the retired aggregate "SALT LICKS" listing (2352) and the
  // 281 pink lick both became the one 2 lb lick the catalogue sells today.
  ...retiredProduct('salt-licks-for-horses', product(LIVE_PRODUCT.licks2lb)),
  ...retiredProduct('salt-licks', product(LIVE_PRODUCT.licks2lb)),
  // The 45 lb livestock bag kept its identity and its pack size, under a slug that
  // gained the brand suffix.
  ...retiredProduct('bag-of-salt-for-livestock-45-lbs', product(LIVE_PRODUCT.livestock45lb)),
  // An earlier 45 lb rock listing of the same bag.
  ...retiredProduct('himalayan-rock-salt-45-lbs-2-3-large-chunks', product(LIVE_PRODUCT.livestock45lb)),
  // The retired 18 lb rock-salt bag (2372): this line's live pack size is the 45 lb
  // livestock bag, so that is the nearest equivalent a shopper can actually buy.
  ...retiredProduct('himalayan-rock-salt-bag', product(LIVE_PRODUCT.livestock45lb)),
  // The live-apex cattle rock (id 291, "Himalayan Salt Rock for Cattle 18 Lbs
  // Bag", animal feed) is no longer sold; the cattle rock the catalogue carries is
  // the 30 lb one. Its WordPress slug is not recorded in the comparison document
  // and WP slugs are not reliably derived from titles (286's is `block-of-salt`,
  // not `himalayan-pink-salt-block-for-deer`), so this maps the one spelling the
  // title supports. If it never fires, nothing is lost — the catch-all below still
  // covers the URL, which is exactly the case this rule improves on.
  ...retiredProduct('himalayan-salt-rock-for-cattle-18-lbs-bag', product(LIVE_PRODUCT.cattle30lb)),
  // The granular pouch line: "pouches" (2321) and "HIMALAYAN SALT POUCHES" (2367)
  // are the live 6 lb fine-or-coarse pouch.
  ...retiredProduct('pouches', product(LIVE_PRODUCT.pouches6lb)),
  ...retiredProduct('himalayan-salt-pouches', product(LIVE_PRODUCT.pouches6lb)),
  // 2461 (SKU HK-ESF-3lbs) and 2446 (the 16 oz jar) are the two edible lines that
  // survive with different slugs.
  ...retiredProduct('himalayan-koh-edible-salt-grain', product(LIVE_PRODUCT.fine3lb)),
  ...retiredProduct('himalayan-edible-pink-salt', product(LIVE_PRODUCT.jar16oz)),
  // The two third-party "Himalayan Chef" jars are not in the public catalogue (a
  // competing brand, kept unpublished), so their URLs go to the edible shelf rather
  // than to a product page this storefront does not render.
  ...retiredProduct('chef-himalayan-pink-salt', shelf(SHELF.edible)),
  ...retiredProduct('himalayan-chef-himalayan-pink-salt-coarse-grain-jar-1-lbs', shelf(SHELF.edible)),
  // The salt lamp is not sold here at all, and no shelf holds one, so the catalogue
  // is the honest destination. (The lamp's own title is on the list of commercial
  // copy that still needs an owner decision — it is not being advertised by this.)
  ...retiredProduct('himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control', '/products'),
];

export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  // --- Core pages -----------------------------------------------------------
  { source: '/shop', destination: '/products', permanent: true },
  { source: '/about-us', destination: '/about', permanent: true },
  { source: '/contacts', destination: '/contact', permanent: true },
  { source: '/privacy-policy', destination: '/privacy', permanent: true },
  { source: '/terms-conditions', destination: '/terms', permanent: true },
  { source: '/terms-and-conditions', destination: '/terms', permanent: true },
  { source: '/return-policy', destination: '/returns', permanent: true },
  { source: '/refund-policy', destination: '/returns', permanent: true },
  { source: '/faq', destination: '/faqs', permanent: true },
  // `/verify-email` was this app's own Supabase-era page and is retired: a
  // WooCommerce account is usable the moment it is created, and
  // `wc_create_new_customer` mails a welcome, not a verification link — so there
  // was nothing left for the page to verify. Any link still in an inbox lands on
  // sign-in, which is where somebody who was told to "verify" should end up.
  { source: '/verify-email', destination: '/login', permanent: false },
  // `/my-account` used to send everyone to /login, which was right for a guest
  // and wrong for a signed-in customer. It now routes to the account portal
  // (`LEGACY_ACCOUNT_REDIRECTS` in lib/auth/roleRouting.ts), whose own guard
  // sends an unauthenticated visitor to /login with a `from` that comes back
  // here — the same destination for a guest, and the right one for everyone
  // else. Duplicate sources are ambiguous, so the rule lives in one place.
  // `/cart` has no page of its own — the cart is a drawer (CartDrawer.tsx) — so
  // the legacy WooCommerce URL is pointed at the catalogue.
  { source: '/cart', destination: '/products', permanent: false },
  // NOTE: `/checkout` deliberately has NO entry here. It was listed alongside
  // `/cart` as a legacy WooCommerce URL, but this app *serves* /checkout
  // (src/app/(main)/checkout/page.tsx) and `redirects()` runs before the
  // filesystem, so the rule shadowed the real page and sent every customer who
  // pressed Checkout in the cart drawer back to the catalogue. Legacy-redirect
  // sources must never name a route this app renders — `legacyRedirects.test.ts`
  // now asserts that, so the two lists cannot drift apart again.

  // The store's own FAQ page already lives at /faqs, so only the spelling
  // variants above need redirects.

  // Legitimate business pages whose content has no home in the new navigation.
  // Contact is the closest intent match for a sample request; the photo and video
  // galleries are not part of the new site, so they go to the catalogue rather
  // than to a page that does not exist.
  { source: '/free-samples', destination: '/contact', permanent: true },
  { source: '/product-locator', destination: '/contact', permanent: true },
  { source: '/photos', destination: '/gallery', permanent: true },
  { source: '/videos', destination: '/gallery', permanent: true },
  { source: '/portfolio', destination: '/gallery', permanent: true },
  { source: '/portfolio/:slug*', destination: '/gallery', permanent: true },
  { source: '/team', destination: '/about', permanent: true },
  { source: '/team/:slug*', destination: '/about', permanent: true },
  { source: '/testimonials/:slug*', destination: '/about', permanent: true },

  // --- Blog -----------------------------------------------------------------
  {
    source: '/himalayan-pink-vs-white-salt',
    destination: '/blog/himalayan-pink-vs-white-salt-farmers',
    permanent: true,
  },
  { source: '/category/blog-post', destination: '/blog', permanent: true },
  { source: '/category/blog-post/:slug*', destination: '/blog', permanent: true },

  // --- Legacy "services" pages (livestock) ----------------------------------
  // These pages sold salt for animals, and the store still sells exactly that:
  // the horse salt licks, the 30 lb cattle rock and the 45 lb livestock bag. They
  // therefore point at the shelves those products are actually filed on.
  //
  // They used to point at the cooking and edible shelves, and at `bulk`, on the
  // old assumption that the storefront had left the livestock trade. It had not —
  // and all three destinations carried no product at all, so every one of these
  // indexed URLs landed on an empty grid.
  { source: '/services', destination: shelf(SHELF.livestock), permanent: true },
  { source: '/services/fresh-dairy-products', destination: shelf(SHELF.livestock), permanent: true },
  { source: '/services/salt-for-live-stock', destination: shelf(SHELF.livestock), permanent: true },
  { source: '/services/salt-lick-for-horses', destination: shelf(SHELF.licks), permanent: true },
  { source: '/services/salt-lumps-for-cattle', destination: shelf(SHELF.licks), permanent: true },
  // A dairy-cow trace-mineral article with no equivalent article on this site. The
  // livestock shelf is the closest live destination; the previous `bulk` target
  // resolved to a category with no products in it.
  {
    source: '/why-do-dairy-cows-need-trace-minerals',
    destination: shelf(SHELF.livestock),
    permanent: true,
  },
  // The wholesale programme has its own module on this site.
  { source: '/whole-sale', destination: '/wholesale', permanent: true },

  // --- The live catalogue's own product URLs ----------------------------------
  //
  // The owner-approved preview catalog replacement retired the old listings and
  // re-created each one under a new slug, so *every* hand-written product
  // destination this map used to carry became a redirect to a 404 — the exact
  // failure mode rule 1 above exists to prevent, and the reason the sources below
  // are grouped by where the product lives now rather than by where it used to.
  //
  // Every slug here was read back from the live production catalogue
  // (`GET https://himalayankoh.com/api/catalog`, 2026-10-11) and each one answers
  // 200; the replacement itself is documented in
  // `docs/production/PREVIEW-CATALOG-REPLACEMENT-2026-10-11.md`. A retired slug is
  // added in *both* spellings — `/product/<slug>` (WordPress) and
  // `/products/<slug>` (this app, which is what an earlier crawl of this site
  // indexed) — because a URL that answers 404 either way sheds the same link.
  ...RETIRED_PRODUCTS,

  // --- Retired livestock SKUs ------------------------------------------------
  // Indexed URLs whose product is gone from the catalogue entirely, with no
  // current pack size to point at. Each lands on the shelf that holds the nearest
  // equivalent, not on a 404.
  { source: '/product/bag-of-salt-for-livestock-55-lbs', destination: shelf(SHELF.livestock), permanent: true },
  // "Block of salt" and "lump of salt" were the animal blocks and lumps; the
  // salt-lick shelf carries the live equivalents.
  { source: '/product/block-of-salt', destination: shelf(SHELF.licks), permanent: true },
  { source: '/product/lump-of-salt', destination: shelf(SHELF.licks), permanent: true },
  { source: '/product/rock-of-salt', destination: shelf(SHELF.livestock), permanent: true },

  // --- Catch-alls (must stay last) ------------------------------------------
  // Any WooCommerce URL not mapped above still lands somewhere relevant
  // instead of returning 404 and shedding the link.
  { source: '/product/:slug', destination: '/products/:slug', permanent: true },
  { source: '/product-category/:slug*', destination: '/products', permanent: true },
  { source: '/shop/:slug*', destination: '/products', permanent: true },
  { source: '/services/:slug*', destination: '/products', permanent: true },
  { source: '/product-tag/:slug*', destination: '/products', permanent: true },
  // Theme demo pages that were indexed by accident. Listed explicitly rather
  // than by pattern: Next.js source patterns do not accept a named parameter
  // glued to a prefix, and these are a known, finite set.
  { source: '/classic-2', destination: '/', permanent: true },
  { source: '/classic-3', destination: '/', permanent: true },
  { source: '/chess-2', destination: '/', permanent: true },
  { source: '/chess-4', destination: '/', permanent: true },
  { source: '/chess-6', destination: '/', permanent: true },
  { source: '/portfolio-2', destination: '/', permanent: true },
  { source: '/portfolio-3', destination: '/', permanent: true },
  { source: '/portfolio-4', destination: '/', permanent: true },
  { source: '/home-2', destination: '/', permanent: true },
  { source: '/grid', destination: '/', permanent: true },
  { source: '/masonry', destination: '/', permanent: true },
  { source: '/cobbles', destination: '/', permanent: true },
  { source: '/shortcodes', destination: '/', permanent: true },
  { source: '/typography', destination: '/', permanent: true },
  { source: '/video-downloader', destination: '/', permanent: true },
  { source: '/stripe-checkout-result', destination: '/', permanent: true },
  // WordPress feed endpoints — no equivalent, point at the content they mirrored.
  { source: '/feed', destination: '/blog', permanent: true },
  { source: '/blog/feed', destination: '/blog', permanent: true },
  { source: '/comments/feed', destination: '/blog', permanent: true },
];
