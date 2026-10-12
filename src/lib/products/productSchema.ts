import type { Product } from '../../data/products';
import { ORGANIZATION_JSON_LD, SITE_URL } from '../seo/constants';
import { buildProductPageSeo } from './productSeo';
import { getProductContent } from './productContent';

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export function buildOrganizationRef() {
  return { '@id': ORGANIZATION_ID };
}

/** Google's rich-results validator rejects a relative Product.image URL. */
function absoluteImageUrl(image: string | null | undefined): string | undefined {
  if (!image) return undefined;
  if (/^https?:\/\//i.test(image)) return image;
  return `${SITE_URL}${image.startsWith('/') ? image : `/${image}`}`;
}

export function buildProductStructuredData(product: Product) {
  const content = getProductContent(product);
  const { title, description } = buildProductPageSeo(product);
  const productUrl = `${SITE_URL}/products/${product.slug}`;

  const { '@context': _ctx, ...orgBase } = ORGANIZATION_JSON_LD;
  void _ctx;
  const organization = {
    ...orgBase,
    '@id': ORGANIZATION_ID,
    publisher: {
      '@type': 'Organization',
      name: ORGANIZATION_JSON_LD.name,
      url: `${SITE_URL}/`,
    },
  };

  const productNode: Record<string, unknown> = {
    '@type': 'Product',
    '@id': `${productUrl}#product`,
    name: content.displayName,
    description,
    image: absoluteImageUrl(product.image),
    // Only a SKU the source actually reported. This previously emitted the
    // product's internal id as its SKU, which published a fabricated
    // identifier to Google for every product (and would have published
    // "2461" for a WooCommerce product).
    sku: product.sku || undefined,
    url: productUrl,
    brand: {
      '@type': 'Brand',
      name: ORGANIZATION_JSON_LD.name,
    },
    manufacturer: buildOrganizationRef(),
  };

  // An Offer without a price is not valid structured data, and inventing one
  // would be a fabricated commercial claim. Omit the offer entirely until the
  // source can report a real price.
  if (product.priceMin !== null) {
    productNode.offers = {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'USD',
      price: product.priceMin,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: buildOrganizationRef(),
    };
  }

  const graph: Record<string, unknown>[] = [organization, productNode];

  if (content.faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${productUrl}#faq`,
      mainEntity: content.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
  }

  const webPage = {
    '@type': 'WebPage',
    '@id': `${productUrl}#webpage`,
    url: productUrl,
    name: title,
    description,
    isPartOf: { '@type': 'WebSite', url: `${SITE_URL}/`, name: ORGANIZATION_JSON_LD.name },
    publisher: buildOrganizationRef(),
    mainEntity: { '@id': `${productUrl}#product` },
  };

  graph.push(webPage);

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
