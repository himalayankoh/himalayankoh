/**
 * The console's product client.
 *
 * Browser code never talks to WooCommerce. It talks to `/api/admin/products`,
 * which holds the credentials and the write seam, so this module is a transport
 * with an honest error path: a failed save must surface the store's own reason
 * rather than reporting success, because the owner acts on what it says.
 *
 * Nothing here falls back to another backend. There is one product source, and
 * a write that cannot reach it fails loudly.
 */

import { getAccessToken } from '@/services/wordpressAdminAuth';
import type {
  AdminProductRecord,
  AdminVariationPatch,
  WooProductStatus,
  WooVariationLike,
} from '@/lib/woo/productPayload';

const ENDPOINT = '/api/admin/products';

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new Error('Your admin session has expired. Sign in again to save products.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || `${fallback} (HTTP ${response.status})`;
}

/** One product patch, as the editor sends it. Undefined fields stay untouched. */
export interface WooProductPatch {
  name?: string;
  slug?: string;
  status?: WooProductStatus;
  description?: string;
  shortDescription?: string;
  sku?: string;
  price?: number | null;
  compareAtPrice?: number | null;
  categoryIds?: number[];
  tags?: string[];
  images?: string[];
  type?: 'simple' | 'variable';
  manageStock?: boolean;
  stockQuantity?: number | null;
  stockStatus?: 'instock' | 'outofstock' | 'onbackorder';
  backorders?: 'no' | 'notify' | 'yes';
  lowStockAmount?: number | null;
  weight?: number | null;
  featured?: boolean;
  seo?: { title?: string | null; description?: string | null };
}

/** A variation edit, addressed by its Woo variation id. */
export type WooVariationPatch = AdminVariationPatch & { id: number };

export interface WooSaveResult {
  product: AdminProductRecord;
  /** What the store actually stored. */
  applied: string[];
  /** What it refused, and why — surfaced to the owner, never swallowed. */
  ignored: Array<{ field: string; reason: string }>;
  variations?: WooVariationLike[];
}

export async function listWooAdminProducts(params: {
  search?: string;
  status?: string;
  page?: number;
} = {}): Promise<AdminProductRecord[]> {
  const headers = await authHeaders();
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  const suffix = query.toString() ? `?${query}` : '';
  const response = await fetch(`${ENDPOINT}${suffix}`, { headers });
  if (!response.ok) throw new Error(await readError(response, 'The store catalog could not be read.'));
  const body = (await response.json()) as { products: AdminProductRecord[] };
  return body.products;
}

export async function getWooAdminProduct(
  id: number
): Promise<{ product: AdminProductRecord; variations: WooVariationLike[] }> {
  const headers = await authHeaders();
  const response = await fetch(`${ENDPOINT}/${id}`, { headers });
  if (!response.ok) throw new Error(await readError(response, 'The product could not be read.'));
  return (await response.json()) as { product: AdminProductRecord; variations: WooVariationLike[] };
}

export async function createWooAdminProduct(patch: WooProductPatch): Promise<WooSaveResult> {
  const headers = await authHeaders();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(await readError(response, 'The product could not be created.'));
  return (await response.json()) as WooSaveResult;
}

export async function updateWooAdminProduct(
  id: number,
  patch: WooProductPatch,
  variations: WooVariationPatch[] = []
): Promise<WooSaveResult> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = { ...patch };
  if (variations.length) body.variations = variations;

  const response = await fetch(`${ENDPOINT}/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response, 'The product could not be saved.'));
  return (await response.json()) as WooSaveResult;
}

/** Archives a product (WooCommerce trash — recoverable, and out of the storefront). */
export async function archiveWooAdminProduct(id: number): Promise<AdminProductRecord> {
  const headers = await authHeaders();
  const response = await fetch(`${ENDPOINT}/${id}`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error(await readError(response, 'The product could not be archived.'));
  const body = (await response.json()) as { product: AdminProductRecord };
  return body.product;
}

export async function restoreWooAdminProduct(id: number): Promise<WooSaveResult> {
  const headers = await authHeaders();
  const response = await fetch(`${ENDPOINT}/${id}?action=restore`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error(await readError(response, 'The product could not be restored.'));
  return (await response.json()) as WooSaveResult;
}

export async function duplicateWooAdminProduct(id: number): Promise<WooSaveResult> {
  const headers = await authHeaders();
  const response = await fetch(`${ENDPOINT}/${id}?action=duplicate`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error(await readError(response, 'The product could not be duplicated.'));
  return (await response.json()) as WooSaveResult;
}

/**
 * Whether the console can write to the store at all.
 *
 * Answered from the list read the console already performs, so the UI's
 * "connected / not connected" state costs no extra request and cannot disagree
 * with the data on screen.
 */
export async function probeWooWriteAccess(): Promise<{ connected: boolean; reason: string | null }> {
  try {
    await listWooAdminProducts({ status: 'any' });
    return { connected: true, reason: null };
  } catch (error) {
    return {
      connected: false,
      reason: error instanceof Error ? error.message : 'The store could not be reached.',
    };
  }
}
