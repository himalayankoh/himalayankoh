/**
 * Unified product loader for admin console views.
 *
 * Hydrates `Product[]` for `AppProvider` and tools like `ASEOEngine`, `AMarketingGen`,
 * and `AVariantGen` which need a populated product dropdown.
 *
 * Tries:
 * 1. Authenticated `/api/admin/products` (WooCommerce store via Bearer token).
 * 2. Authenticated `/api/admin/catalog` (via `listProducts()` from repository).
 * 3. Storefront `/api/catalog`.
 * 4. Static fallback `products.ts`.
 */

import type { Product } from '@/App';

export function toAppProduct(p: any): Product {
  const id = String(p.id ?? '');
  const name = String(p.name ?? 'Untitled Product');
  const price = typeof p.price === 'number' && !isNaN(p.price)
    ? p.price
    : (parseFloat(String(p.price || 0)) || 0);
  const compareAt = typeof p.compareAtPrice === 'number' && !isNaN(p.compareAtPrice)
    ? p.compareAtPrice
    : (parseFloat(String(p.compareAtPrice || 0)) || price);

  let images: string[] = [];
  if (Array.isArray(p.images)) {
    images = p.images.map((img: any) => {
      if (typeof img === 'string') return img.trim();
      if (img && typeof img === 'object' && typeof img.url === 'string') return img.url.trim();
      if (img && typeof img === 'object' && typeof img.src === 'string') return img.src.trim();
      return '';
    }).filter(Boolean);
  } else if (typeof p.image === 'string') {
    images = [p.image.trim()];
  }
  if (images.length === 0 && Array.isArray(p.storefrontDefaultImages)) {
    images = p.storefrontDefaultImages.filter(Boolean);
  }

  const category = p.categoryName || (Array.isArray(p.categoryNames) && p.categoryNames[0]) || p.category || 'Uncategorized';
  const desc = p.description || p.shortDescription || p.shortDesc || '';
  const shortDesc = p.shortDesc || p.shortDescription || desc || name;

  const stock = typeof p.inventoryQty === 'number'
    ? p.inventoryQty
    : (typeof p.stockQuantity === 'number'
      ? p.stockQuantity
      : (typeof p.stock === 'number' ? p.stock : 10));

  return {
    id,
    name,
    shortDesc,
    description: desc,
    price,
    originalPrice: compareAt,
    category,
    stock,
    images,
    imageAlts: images.map(() => name),
    rating: typeof p.rating === 'number' ? p.rating : 5,
    reviews: typeof p.reviews === 'number' ? p.reviews : 0,
    isActive: p.isActive ?? (p.status === 'active' || p.status === 'publish' || p.isListed === true),
    brand: p.brand || 'Himalayan Koh',
    condition: 'New',
    tags: Array.isArray(p.tags) ? p.tags : [],
    weight: String(p.weight || p.specifications?.weightLbs || ''),
    dimensions: typeof p.dimensions === 'string' ? p.dimensions : '',
    origin: 'Pakistan',
    freeShipping: p.freeShipping ?? true,
    shippingCost: String(p.shippingCost ?? '0'),
    variants: Array.isArray(p.variants) ? p.variants : [],
    slug: p.slug || id,
    seoTitle: p.seoTitle || `${name} | Himalayan Koh`,
    seoDescription: p.seoDescription || shortDesc,
    seoKeywords: Array.isArray(p.seoKeywords) ? p.seoKeywords : [],
  };
}

export async function loadAppProducts(): Promise<Product[]> {
  // 1. Try authenticated /api/admin/products
  try {
    const { listWooAdminProducts } = await import('@/lib/admin/wooProductApi');
    const wooProducts = await listWooAdminProducts({ status: 'any' });
    if (Array.isArray(wooProducts) && wooProducts.length > 0) {
      return wooProducts.map(toAppProduct);
    }
  } catch {
    // If admin auth failed or route not ready, fall through
  }

  // 2. Try listProducts from catalog repository (/api/admin/catalog with fallback)
  try {
    const { listProducts } = await import('@/features/catalog/repository');
    const catalogProducts = await listProducts();
    if (Array.isArray(catalogProducts) && catalogProducts.length > 0) {
      return catalogProducts.map(toAppProduct);
    }
  } catch {
    // Fall through
  }

  // 3. Try public /api/catalog
  try {
    const res = await fetch('/api/catalog');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.products) && data.products.length > 0) {
        return data.products.map(toAppProduct);
      }
    }
  } catch {
    // Fall through
  }

  // 4. Try static products.ts fallback
  try {
    const { products } = await import('@/data/products');
    if (Array.isArray(products) && products.length > 0) {
      return products.map(toAppProduct);
    }
  } catch {
    // Fall through
  }

  return [];
}
