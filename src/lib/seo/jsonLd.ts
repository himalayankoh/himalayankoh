import { ORGANIZATION_JSON_LD, SITE_NAME } from './constants';
import { absoluteUrl } from './server';
import { absoluteImage } from './metadata';

/**
 * Product structured data for a product page is built by
 * `src/lib/products/productSchema.ts` (`buildProductStructuredData`), which
 * emits the full Product + Offer + FAQPage + WebPage graph and omits the SKU or
 * the Offer when the catalog source could not report them.
 *
 * A second builder used to live here. It had no callers and hardcoded an always-
 * present Offer, so it was the obvious route back to publishing a price or SKU
 * the source never supplied. It is deliberately gone: one owner for product
 * structured data.
 */

interface ArticleLdInput {
  title: string;
  description?: string | null;
  slug: string;
  image?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  authorName?: string | null;
  authorType?: 'Person' | 'Organization';
  /** Canonical article path; resources must not claim a /blog/resources/ identity. */
  path?: string;
}

export function articleJsonLd(input: ArticleLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description || undefined,
    image: absoluteImage(input.image),
    datePublished: input.publishedAt || undefined,
    dateModified: input.updatedAt || input.publishedAt || undefined,
    author: input.authorName
      ? { '@type': input.authorType ?? 'Person', name: input.authorName }
      : { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/logo.svg') },
    },
    mainEntityOfPage: absoluteUrl(input.path ?? `/blog/${input.slug}`),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    ...ORGANIZATION_JSON_LD,
    '@id': `${absoluteUrl('/')}#organization`,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/logo.svg'),
  };
}

/**
 * Site-level entity. Lets Google associate the domain with the brand name for
 * sitelinks and knowledge-panel matching, independent of any single page.
 */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${absoluteUrl('/')}#website`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    publisher: { '@id': `${absoluteUrl('/')}#organization` },
  };
}

/**
 * Aggregate offer for product listing pages. Shows price range and availability
 * across all products, enabling Google rich snippets like "Starting at $X.XX".
 */
interface AggregateOfferInput {
  minPrice: number;
  maxPrice: number;
  priceCurrency: string;
  offerCount: number;
  availability: 'InStock' | 'OutOfStock';
}

export function aggregateOfferJsonLd({
  minPrice,
  maxPrice,
  priceCurrency,
  offerCount,
  availability,
}: AggregateOfferInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'AggregateOffer',
    priceCurrency,
    lowPrice: minPrice.toFixed(2),
    highPrice: maxPrice.toFixed(2),
    offerCount,
    availability: `https://schema.org/${availability}`,
  };
}

/**
 * LocalBusiness schema for service area businesses. Helps with local search
 * visibility and enables Google rich results with contact information.
 */
export function localBusinessJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${absoluteUrl('/')}#localbusiness`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    telephone: '+1-832-224-6466',
    contactType: 'Customer Service',
    areaServed: {
      '@type': 'Country',
      name: 'US',
    },
    priceRange: '$$',
    image: absoluteImage(),
    // The store's own positioning, and only what it actually sells. The earlier
    // wording ("for cooking and the home … lamps") was a leftover from the
    // cooking-only rewrite: it contradicted the approved storefront copy and
    // advertised a product line the catalogue does not carry.
    description:
      'All natural Himalayan pink salt for livestock and the kitchen — edible grades, salt licks and blocks, and bulk bags.',
  };
}

/**
 * FAQ schema for product pages. Displays common questions and answers in
 * Google search results, improving CTR and user experience.
 */
interface FAQItem {
  question: string;
  answer: string;
}

export function faqJsonLd(items: FAQItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
