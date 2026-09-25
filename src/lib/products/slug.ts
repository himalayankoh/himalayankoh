import type { Product } from '@/data/products';

/**
 * Shared product slug helpers for PDP links and lookup.
 */
export function generateProductSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Normalize route param / DB slug for comparison. */
export function normalizeProductSlug(slug: string | undefined | null): string {
  if (!slug) return '';
  try {
    return decodeURIComponent(slug).trim().toLowerCase().replace(/\/+$/, '');
  } catch {
    return slug.trim().toLowerCase().replace(/\/+$/, '');
  }
}

export function slugsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = normalizeProductSlug(a);
  const right = normalizeProductSlug(b);
  return Boolean(left && right && left === right);
}

export function getFallbackProductBySlug(
  catalog: Product[],
  slug: string
): Product | undefined {
  const normalized = normalizeProductSlug(slug);
  if (!normalized) return undefined;
  return catalog.find((product) => slugsMatch(product.slug, normalized));
}

export function productSlugFromName(name: string, existing?: string | null): string {
  const normalized = normalizeProductSlug(existing);
  if (normalized) return normalized;
  return generateProductSlug(name);
}
