import { SITE_ORIGIN } from '@/lib/site/origin';

/**
 * The canonical origin, resolved by `@/lib/site/origin` and nowhere else.
 *
 * `VERCEL_URL` is deliberately never read: Vercel sets it to the unique
 * per-deployment hostname (e.g. `himalayan-<hash>-<team>.vercel.app`), not the
 * stable alias, so it leaked a dead preview URL into Product/FAQ/WebPage JSON-LD.
 * `VERCEL_PROJECT_PRODUCTION_URL` is no longer consulted either — the origin is
 * one decision made in one module, and a second environment-specific branch here
 * is exactly how the two can disagree.
 */
export const SITE_URL = SITE_ORIGIN;
export const SITE_NAME = 'Himalayan Koh';
export { SITE_ORIGIN_STAGING, SITE_ORIGIN_PRODUCTION } from '@/lib/site/origin';
// Restored to the approved public metadata. The migration had rewritten both into
// a kitchen-only voice, which is a content change rather than part of moving the
// runtime, so the wording the owner approved is back.
export const DEFAULT_TITLE =
  'Himalayan Koh - Premium Pink Salt for Livestock & Cooking';
// The species named here are the ones the live catalogue actually serves: rope licks for
// horses, a red rock block for cattle, loose salt for livestock, and edible grades for the
// kitchen. "deer" was in this sentence and in the announcement bar, and the catalogue has no
// deer product, so a sitewide description was claiming a line that does not exist. Only that
// word was removed; the owner's wording is otherwise untouched and this is flagged for review.
export const DEFAULT_DESCRIPTION =
  'Premium Himalayan Pink Salt for horses, cattle, and edible cooking. All natural, mineral-rich Himalayan salt products.';
/**
 * Social crawlers (Facebook, X, LinkedIn) and Google's rich results do not
 * accept SVG for og:image — this must stay a raster URL. Served as a real
 * 1200x630 PNG by src/app/og.png/route.tsx.
 */
export const DEFAULT_OG_IMAGE = '/og.png';

/**
 * Google Search Console site-verification token, when the owner has run the
 * verification step.
 *
 * Empty by default and never invented: the token is issued per property in Search
 * Console, so the only correct source is the owner pasting it into the
 * environment. While it is empty no `google-site-verification` tag is emitted at
 * all, rather than an empty one that would fail verification confusingly.
 *
 * Server-side on purpose (not `NEXT_PUBLIC_*`): the tag is public once rendered,
 * but nothing in the browser needs to read the variable, and keeping it off the
 * client avoids carrying it in every bundle.
 *
 * This does **not** make staging indexable. Indexing is decided per request by
 * `lib/seo/indexing.ts` — an allowlist of production hosts — and every host that
 * is not `himalayankoh.com` stays `noindex, nofollow` whether or not this token is
 * set. Verifying a staging property in Search Console is therefore pointless by
 * design; verify the production property.
 */
export const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() || '';

/**
 * The SEO configuration surface the later SEO phase reads, gathered so a new
 * origin, token or sitemap path is added in one place rather than found by
 * grepping for string literals.
 */
export const SEO_CONFIG = {
  siteUrl: SITE_URL,
  canonicalOrigin: SITE_URL,
  siteName: SITE_NAME,
  sitemapPath: '/sitemap.xml',
  robotsPath: '/robots.txt',
  googleSiteVerification: GOOGLE_SITE_VERIFICATION,
} as const;

export const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/logo.svg`,
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+1-832-224-6466',
    contactType: 'customer service',
    areaServed: 'US',
  },
};
