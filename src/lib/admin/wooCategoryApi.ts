/**
 * Product categories for the admin console — browser side.
 *
 * The console writes categories to WooCommerce through `/api/admin/categories`,
 * exactly as it reads the catalog through `/api/admin/catalog`. Same reason: the
 * WooCommerce consumer key/secret are server-only, and the browser must never
 * hold them.
 *
 * Nothing here falls back to another store. A failure is thrown with the store's
 * own message — including the two refusals the server enforces, a slug that is
 * already taken and a delete that would orphan products — because both are
 * decisions the owner has to see rather than have smoothed over.
 */

import { getAccessToken } from '@/services/wordpressAdminAuth';

/** A WooCommerce product category as the console edits it. */
export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  /** Published products filed under the term, as WooCommerce counts them. */
  count: number;
}

export interface AdminCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  parent?: number;
}

const ENDPOINT = '/api/admin/categories';

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new Error('Your admin session has expired. Sign in again to edit categories.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!response.ok) {
    throw new Error(body.error || `WooCommerce answered HTTP ${response.status}.`);
  }
  return body as T;
}

/** Every category in the store's taxonomy. */
export async function listAdminCategories(): Promise<AdminCategory[]> {
  const response = await fetch(ENDPOINT, { headers: await authHeaders() });
  const { categories } = await parse<{ categories: AdminCategory[] }>(response);
  return categories ?? [];
}

export async function createAdminCategory(input: AdminCategoryInput): Promise<AdminCategory> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  return (await parse<{ category: AdminCategory }>(response)).category;
}

export async function updateAdminCategory(
  id: number,
  input: Partial<AdminCategoryInput>
): Promise<AdminCategory> {
  const response = await fetch(`${ENDPOINT}/${id}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  return (await parse<{ category: AdminCategory }>(response)).category;
}

export async function deleteAdminCategory(id: number): Promise<AdminCategory> {
  const response = await fetch(`${ENDPOINT}/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return (await parse<{ category: AdminCategory }>(response)).category;
}
