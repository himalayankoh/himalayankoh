/**
 * The console's catalog read, for **browser** code.
 *
 * Admin screens are client components, and they used to call the server read
 * model directly: `readAdminCatalogPage()` runs `readCatalogProducts()`, which
 * reaches the WooCommerce client and the credential reads. Shipping that into
 * the admin bundle meant the console performed its catalog read in the browser
 * with no credentials, silently falling back to the public WordPress route — so
 * the list worked while price, SKU and stock stayed "unknown" on a connection
 * that could answer all three.
 *
 * The split is the same one the storefront already uses: the read happens on
 * the server (`/api/admin/catalog`), and this module is the only catalog read a
 * client component may call. Types are imported type-only, so they are erased at
 * compile time and cannot pull the read model back in.
 *
 * This is not `/api/catalog`: that read is sealed by the storefront's niche
 * guard on purpose, and the console must be able to see a withheld product in
 * order to archive it.
 */

import { getAccessToken } from '@/services/wordpressAdminAuth';
import type {
  AdminCatalogPage,
  AdminCatalogQuery,
  AdminCatalogStats,
} from '@/lib/backend/adminCatalog';

const ENDPOINT = '/api/admin/catalog';

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new Error('Your admin session has expired. Sign in again to read the catalog.');
  return { Authorization: `Bearer ${token}` };
}

function toQueryString(query: AdminCatalogQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.listing) params.set('listing', query.listing);
  if (query.isFeatured) params.set('isFeatured', '1');
  if (query.lowStock) params.set('lowStock', '1');
  if (query.sort) params.set('sort', query.sort);
  if (query.page) params.set('page', String(query.page));
  if (query.perPage) params.set('perPage', String(query.perPage));
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

interface AdminCatalogResponse {
  page: AdminCatalogPage;
  stats: AdminCatalogStats;
}

async function read(query: AdminCatalogQuery = {}): Promise<AdminCatalogResponse> {
  const headers = await authHeaders();
  const response = await fetch(`${ENDPOINT}${toQueryString(query)}`, { headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `The catalog could not be read (HTTP ${response.status}).`);
  }
  return (await response.json()) as AdminCatalogResponse;
}

/** One page of the console's catalog, plus the stats that describe it. */
export async function fetchAdminCatalog(
  query: AdminCatalogQuery = {}
): Promise<AdminCatalogResponse> {
  return read(query);
}

export async function fetchAdminCatalogPage(
  query: AdminCatalogQuery = {}
): Promise<AdminCatalogPage> {
  return (await read(query)).page;
}

export async function fetchAdminCatalogStats(): Promise<AdminCatalogStats> {
  return (await read({ perPage: 1 })).stats;
}

export type { AdminCatalogPage, AdminCatalogQuery, AdminCatalogStats };
