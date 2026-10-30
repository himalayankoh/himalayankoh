/**
 * The one rule that decides whether a product is on the storefront.
 *
 * Products created through the production shipping-ready workflow carry an
 * encoded packing profile tag. Legacy and demo products do not, so they stay
 * available to admins for reference but never appear in the real storefront.
 *
 * It lives here, not in `lib/supabase/api/products.ts`, because that module opens
 * with a `supabase` client import — and this predicate is read by callers that
 * must not carry one. `lib/seo/server.ts` is the sharp edge: `app/layout.tsx`
 * imports it, so re-pointing this one pure function is what keeps the SDK out of
 * the root layout's graph.
 *
 * `isHiddenActiveProduct` looks like its sibling and deliberately stayed behind:
 * it queries the products table, so it is data access, not a rule.
 */

export const PACKING_PROFILE_TAG_PREFIX = 'packing_profile:';

export function isRealCatalogProduct(product: { tags?: string[] | null }): boolean {
  return Array.isArray(product.tags) && product.tags.some((tag) => tag.startsWith(PACKING_PROFILE_TAG_PREFIX));
}
