// ============================================================================
// Supplier source presets + marketplace search links (Quick Add).
//
// The presets are the single source of truth for the Quick Add / Detail Add
// "Supplier source" dropdown. They are written into supplierSource (the
// free-text field the filters and deriveSourceType key off): CJ derives to
// CJ_DROPSHIPPING, the marketplaces to OTHER_VERIFIED (a verified purchasing
// path).
//
// supplierSearchUrl builds the marketplace's own product-search page for a
// product name — a truthful starting point the seller can open to find the
// real listing (which they then paste back as the verified supplier URL).
// ============================================================================

export const SUPPLIER_SOURCE_PRESETS = ['Own Stock', 'Amazon', 'eBay', 'Walmart'] as const;

export type SupplierSourcePreset = (typeof SUPPLIER_SOURCE_PRESETS)[number];

/** Lowercase, hyphenated search slug. */
function searchSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The marketplace's own search URL for a product name, or null when the source
 * is not a preset marketplace or the name is blank. Result is a search page,
 * never a claimed product page — callers must not treat it as supplier proof.
 */
export function supplierSearchUrl(source: string, productName: string): string | null {
  const name = productName.trim();
  if (!name) return null;
  const q = encodeURIComponent(name);
  switch (source.trim().toLowerCase()) {
    case 'amazon':
      return `https://www.amazon.com/s?k=${q}`;
    case 'ebay':
      return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
    case 'walmart':
      return `https://www.walmart.com/search?q=${q}`;
    default:
      return null;
  }
}
