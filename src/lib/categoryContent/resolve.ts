import { CATEGORY_CONTENT_REGISTRY } from './registry';
import type { CategoryContentAvailability, CategoryContentBundle } from './types';
import { toCategoryContentKey } from './keys';

function buildAvailability(bundle: CategoryContentBundle): CategoryContentAvailability {
  return {
    gallery: bundle.gallery.length > 0,
    guides: bundle.guides.length > 0,
    articles: bundle.articles.length > 0,
    pdfs: bundle.pdfs.length > 0,
  };
}

/**
 * Resolve educational content for a shop category filter.
 * Returns null for "All" or unknown labels.
 */
export function getCategoryContent(key: string | null): CategoryContentBundle | null {
  // A `?category=` value can now be a WooCommerce category the registry has no
  // content for (the pills are built from the catalogue). The hub layout is for
  // the shelves the shop wrote copy for; a newer category renders the plain grid.
  const contentKey = toCategoryContentKey(key);
  if (!contentKey) return null;
  const bundle = CATEGORY_CONTENT_REGISTRY[contentKey];
  if (!bundle) return null;
  return bundle;
}

export function getCategoryAvailability(bundle: CategoryContentBundle): CategoryContentAvailability {
  return buildAvailability(bundle);
}
