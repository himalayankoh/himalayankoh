import type { Product } from '../../data/products';
import { products as fallbackProducts } from '../../data/products';
import type { Inventory, ProductWithCategory } from '../commerce/databaseTypes';
import type { StockStatus } from '../../data/products';
import { collectMissingCatalogFields, priceDisplayFromRange } from './price';
import { getFallbackProductBySlug as findFallbackBySlug, normalizeProductSlug, productSlugFromName, slugsMatch } from './slug';

function inventoryRow(inventory: ProductWithCategory['inventory']) {
  if (!inventory) return null;
  return Array.isArray(inventory) ? inventory[0] : inventory;
}

/**
 * Supabase product row -> `Product`.
 *
 * This is the ONLY place `compare_at_price` is interpreted, and it means the
 * top of a *variant* price range (the storefront renders it as "$9.95 - $17.95"
 * and sets `priceRange`). It is not a compare-at/discount price. The
 * WooCommerce mapper must not reinterpret the field or invent a second meaning
 * for it — see `src/lib/backend/woocommerce.ts`.
 */
export function mapSupabaseProduct(product: ProductWithCategory): Product {
  const inventory = inventoryRow(product.inventory) as Inventory | null;
  const availableUnits = inventory ? inventory.quantity - inventory.reserved_quantity : null;
  // No inventory row is *unknown*, not "in stock". The previous default of true
  // asserted availability the source never reported, and the Add to Cart button
  // acted on it — the one place the storefront claimed stock it did not have.
  const inStock = availableUnits !== null && availableUnits > 0;
  const sku = product.sku?.trim() ? product.sku.trim() : null;

  const priceMin = product.price;
  const priceMax = product.compare_at_price || undefined;
  const stockStatus: StockStatus = availableUnits === null ? 'unknown' : inStock ? 'in_stock' : 'out_of_stock';
  const stockQuantity = inventory && inventory.track_inventory !== false ? availableUnits : null;

  // `images` is deliberately NOT set here. ProductDetailView renders its
  // gallery as `product.images?.length ? product.images : [product.image]`, so
  // populating it would silently switch the Supabase PDP from one image to the
  // full set. The Supabase storefront ships a single-image PDP today; keep it
  // that way until that is a deliberate product change.
  const primaryImage = product.thumbnail || product.images?.[0] || '';

  return {
    id: product.id,
    slug: productSlugFromName(product.name, product.slug),
    name: product.name,
    price: priceDisplayFromRange(priceMin, priceMax),
    priceRange: Boolean(product.compare_at_price),
    priceMin,
    priceMax,
    image: primaryImage,
    category: product.category?.name || 'Uncategorized',
    description: product.description || product.short_description || undefined,
    grainSizes: product.grain_sizes,
    inStock,
    metaTitle: product.meta_title || undefined,
    metaDescription: product.meta_description || undefined,
    isFeatured: product.is_featured,
    sku,
    stockStatus,
    stockQuantity,
    updatedAt: product.updated_at ?? null,
    missing: collectMissingCatalogFields({
      priceMin: Number.isFinite(priceMin) ? priceMin : null,
      sku,
      stockStatus,
      images: primaryImage ? [primaryImage] : [],
    }),
  };
}

export function getFallbackProductBySlug(slug: string): Product | undefined {
  return findFallbackBySlug(fallbackProducts, slug);
}

export { normalizeProductSlug, productSlugFromName, slugsMatch };

export { buildProductStructuredData as buildProductJsonLd } from './productSchema';
