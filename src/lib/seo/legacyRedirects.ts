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

/** Shelf keys that exist in `lib/catalog/niche.ts` today. */
const SHELF = {
  edible: 'edible-pink-salt',
  cooking: 'cooking-serving',
  lamps: 'lamps-decor',
  bulk: 'bulk',
} as const;

const shelf = (key: (typeof SHELF)[keyof typeof SHELF]) => `/products?category=${key}`;

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
  // The store no longer sells livestock salt, so the old animal-feed service
  // pages point at the nearest shelf the shop does stock — not at a retired
  // `?category=` value, which would fall back to the full catalogue.
  { source: '/services', destination: shelf(SHELF.cooking), permanent: true },
  { source: '/services/fresh-dairy-products', destination: shelf(SHELF.edible), permanent: true },
  { source: '/services/salt-for-live-stock', destination: shelf(SHELF.bulk), permanent: true },
  { source: '/services/salt-lick-for-horses', destination: shelf(SHELF.cooking), permanent: true },
  { source: '/services/salt-lumps-for-cattle', destination: shelf(SHELF.bulk), permanent: true },
  {
    source: '/why-do-dairy-cows-need-trace-minerals',
    destination: shelf(SHELF.bulk),
    permanent: true,
  },

  // --- WooCommerce products: live pink-salt products keep their slug ---------
  // These products still exist in WooCommerce under the same slug, so the old URL
  // resolves to the same product on its new URL rather than to a shelf.
  { source: '/product/himalayan-koh-edible-salt-grain', destination: '/products/himalayan-koh-edible-salt-grain', permanent: true },
  { source: '/product/himalayan-edible-pink-salt', destination: '/products/himalayan-edible-pink-salt', permanent: true },
  { source: '/product/pouches', destination: '/products/pouches', permanent: true },
  { source: '/product/himalayan-salt-pouches', destination: '/products/himalayan-salt-pouches', permanent: true },
  { source: '/product/himalayan-rock-salt-bag', destination: '/products/himalayan-rock-salt-bag', permanent: true },
  { source: '/product/chef-himalayan-pink-salt', destination: '/products/chef-himalayan-pink-salt', permanent: true },
  {
    source: '/product/himalayan-chef-himalayan-pink-salt-coarse-grain-jar-1-lbs',
    destination: '/products/himalayan-chef-himalayan-pink-salt-coarse-grain-jar-1-lbs',
    permanent: true,
  },
  {
    source: '/product/himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control',
    destination: '/products/himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control',
    permanent: true,
  },

  // --- Retired livestock SKUs ------------------------------------------------
  // These products are not part of the Himalayan pink salt storefront, so their
  // indexed URLs land on the shelf that replaced them rather than on a 404.
  { source: '/product/salt-licks-for-horses', destination: shelf(SHELF.bulk), permanent: true },
  { source: '/product/bag-of-salt-for-livestock-45-lbs', destination: shelf(SHELF.bulk), permanent: true },
  { source: '/product/bag-of-salt-for-livestock-55-lbs', destination: shelf(SHELF.bulk), permanent: true },
  // "Block of salt" was the deer block; salt blocks are now the cooking and
  // serving shelf, which is the closest live equivalent.
  { source: '/product/block-of-salt', destination: shelf(SHELF.cooking), permanent: true },
  { source: '/product/rock-of-salt', destination: shelf(SHELF.bulk), permanent: true },
  { source: '/product/lump-of-salt', destination: shelf(SHELF.bulk), permanent: true },
  // `salt-licks` still exists in WooCommerce but is flagged for owner review
  // (it may be an animal lick), so it points at the shelf it is filed under
  // rather than at a product page that may be withdrawn.
  { source: '/product/salt-licks', destination: shelf(SHELF.bulk), permanent: true },

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
