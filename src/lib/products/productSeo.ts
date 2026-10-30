import type { Product } from '../../data/products';
import { SITE_NAME } from '../seo/constants';
import { nicheSectionKeyFor } from '../catalog/nicheSections';
import { getProductContent, getProductDisplayName } from './productContent';

const BRAND_SUFFIX = ` | ${SITE_NAME}`;
const MAX_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 160;

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function normalizeTitle(title: string): string {
  const withoutBrand = title.replace(/\s*\|\s*Himalayan Koh\s*$/i, '').trim();
  return `${withoutBrand}${BRAND_SUFFIX}`;
}

function buildFallbackDescription(product: Product, displayName: string): string {
  // The price sentence is dropped entirely when the source reported no price,
  // rather than printing "$0.00" or "null" into a meta description. When the
  // price IS known the emitted strings are byte-for-byte what they were before
  // this change: `${price}.` with a leading space.
  const priceMin = product.priceMin;
  const price =
    priceMin === null
      ? ''
      : product.priceRange && product.priceMax
        ? `From $${priceMin.toFixed(2)}`
        : `$${priceMin.toFixed(2)}`;
  const priceClause = price ? ` ${price}.` : '';

  // The description follows the shelf the product is listed under, from the same
  // placement function the shop grid uses — so meta copy and on-page category can
  // never disagree about what kind of salt this is.
  switch (nicheSectionKeyFor(product)) {
    case 'edible-pink-salt':
      return `${displayName} — unrefined Himalayan pink salt with its natural trace minerals.${priceClause} Free U.S. shipping on orders over $50.`;
    case 'cooking-serving':
      return `${displayName} — a Himalayan pink salt block for grilling and serving.${priceClause} Unrefined, additive-free salt from ${SITE_NAME}.`;
    case 'lamps-decor':
      return `${displayName} — a hand-carved Himalayan pink salt piece for the home.${priceClause} Shop salt lamps and décor at ${SITE_NAME}.`;
    case 'bulk':
      return `${displayName} — bulk unrefined Himalayan pink salt for kitchens and shops.${priceClause} Order bulk salt from ${SITE_NAME}.`;
    default:
      return `${displayName}. Himalayan pink salt —${priceClause} Shop ${SITE_NAME} for unrefined, mineral-rich salt.`;
  }
}

export function buildProductPageSeo(product: Product): { title: string; description: string } {
  const content = getProductContent(product);
  const displayName = content.displayName;

  let title: string;
  if (product.metaTitle && product.metaTitle.trim()) {
    title = normalizeTitle(product.metaTitle);
  } else if (content.metaTitle && content.metaTitle.trim()) {
    title = normalizeTitle(content.metaTitle);
  } else {
    title = normalizeTitle(displayName);
  }

  let description: string;
  if (product.metaDescription && product.metaDescription.trim()) {
    description = product.metaDescription.trim();
  } else if (content.metaDescription && content.metaDescription.trim()) {
    description = content.metaDescription.trim();
  } else if (product.description) {
    const leadMatch = product.description.match(/^([\s\S]*?(?<!\d)[.!?])(?:\s+|$)/);
    const lead = (leadMatch ? leadMatch[1] : product.description).trim().replace(/[.!?]+$/, '');
    description = truncateAtWord(
      lead ? `${displayName}. ${lead}.` : buildFallbackDescription(product, displayName),
      MAX_DESCRIPTION_LENGTH
    );
  } else {
    description = truncateAtWord(buildFallbackDescription(product, displayName), MAX_DESCRIPTION_LENGTH);
  }

  return { title, description };
}

export { getProductDisplayName };
