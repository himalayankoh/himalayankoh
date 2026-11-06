/**
 * Unified product loader for admin console views.
 *
 * Hydrates `Product[]` for `AppProvider` and tools like `ASEOEngine`, `AMarketingGen`,
 * and `AVariantGen` which need a populated product dropdown.
 *
 * Performance Architecture:
 * 1. Synchronous Cache (`getCachedAppProducts`):
 *    Returns in-memory or sessionStorage cached products instantly (0ms) so components
 *    render with populated product dropdowns on initial paint without blocking.
 * 2. Single-Flight De-duplication:
 *    Multiple components mounting simultaneously share a single in-flight promise.
 * 3. Fallback Hierarchy:
 *    - Authenticated `/api/admin/products`
 *    - Authenticated `/api/admin/catalog`
 *    - Storefront `/api/catalog`
 *    - Static fallback `products.ts`
 */

import type { Product } from '@/App';

const SESSION_CACHE_KEY = 'hk_admin_products_v1';
const CACHE_TTL_MS = 180_000; // 3 minutes

interface StoredCache {
  products: Product[];
  timestamp: number;
}

let memoryProductsCache: StoredCache | null = null;
let inflightLoadPromise: Promise<Product[]> | null = null;

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

/**
 * Synchronous cache reader: returns in-memory or sessionStorage products immediately.
 * Use this to initialize React state on first render.
 */
export function getCachedAppProducts(): Product[] {
  if (memoryProductsCache && Array.isArray(memoryProductsCache.products) && memoryProductsCache.products.length > 0) {
    return memoryProductsCache.products;
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage?.getItem(SESSION_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredCache;
        if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
          memoryProductsCache = parsed;
          return parsed.products;
        }
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
  }

  return [];
}

/**
 * Saves products into in-memory and sessionStorage cache.
 */
export function setCachedAppProducts(products: Product[]): void {
  if (!Array.isArray(products) || products.length === 0) return;
  const entry: StoredCache = { products, timestamp: Date.now() };
  memoryProductsCache = entry;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage?.setItem(SESSION_CACHE_KEY, JSON.stringify(entry));
    } catch {
      // Ignore quota errors
    }
  }
}

/**
 * Clears cached products (e.g. after a catalog update or in tests).
 */
export function clearAppProductsCache(): void {
  memoryProductsCache = null;
  inflightLoadPromise = null;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage?.removeItem(SESSION_CACHE_KEY);
    } catch {}
  }
}

async function executeProductLoad(): Promise<Product[]> {
  // 1. Try authenticated /api/admin/products
  try {
    const { listWooAdminProducts } = await import('@/lib/admin/wooProductApi');
    const wooProducts = await listWooAdminProducts({ status: 'any' });
    if (Array.isArray(wooProducts) && wooProducts.length > 0) {
      const mapped = wooProducts.map(toAppProduct);
      setCachedAppProducts(mapped);
      return mapped;
    }
  } catch {
    // If admin auth failed or route not ready, fall through
  }

  // 2. Try listProducts from catalog repository (/api/admin/catalog with fallback)
  try {
    const { listProducts } = await import('@/features/catalog/repository');
    const catalogProducts = await listProducts();
    if (Array.isArray(catalogProducts) && catalogProducts.length > 0) {
      const mapped = catalogProducts.map(toAppProduct);
      setCachedAppProducts(mapped);
      return mapped;
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
        const mapped = data.products.map(toAppProduct);
        setCachedAppProducts(mapped);
        return mapped;
      }
    }
  } catch {
    // Fall through
  }

  // 4. Try static products.ts fallback
  try {
    const { products } = await import('@/data/products');
    if (Array.isArray(products) && products.length > 0) {
      const mapped = products.map(toAppProduct);
      setCachedAppProducts(mapped);
      return mapped;
    }
  } catch {
    // Fall through
  }

  return [];
}

/**
 * Loads products for admin views, returning cached data instantly if fresh,
 * or deduplicating in-flight network requests.
 */
export async function loadAppProducts(options: { forceFresh?: boolean } = {}): Promise<Product[]> {
  if (!options.forceFresh) {
    if (memoryProductsCache && Date.now() - memoryProductsCache.timestamp < CACHE_TTL_MS) {
      return memoryProductsCache.products;
    }

    const cached = getCachedAppProducts();
    if (cached.length > 0 && memoryProductsCache && Date.now() - memoryProductsCache.timestamp < CACHE_TTL_MS) {
      return cached;
    }
  }

  if (inflightLoadPromise) {
    return inflightLoadPromise;
  }

  inflightLoadPromise = executeProductLoad().finally(() => {
    inflightLoadPromise = null;
  });

  return inflightLoadPromise;
}
