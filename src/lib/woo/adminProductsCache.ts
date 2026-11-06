/**
 * In-memory cache for admin products collection on the server.
 *
 * Avoids repeated 6-8 second WordPress REST API round-trips for admin views.
 * TTL is 60 seconds, and writes (create/update/delete) invalidate immediately.
 */

interface CacheEntry {
  products: any[];
  timestamp: number;
}

let adminProductsCache: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;

export function getCachedAdminProducts(): any[] | null {
  if (adminProductsCache && Date.now() - adminProductsCache.timestamp < CACHE_TTL_MS) {
    return adminProductsCache.products;
  }
  return null;
}

export function setCachedAdminProducts(products: any[]): void {
  adminProductsCache = {
    products,
    timestamp: Date.now(),
  };
}

export function invalidateCachedAdminProducts(): void {
  adminProductsCache = null;
}
