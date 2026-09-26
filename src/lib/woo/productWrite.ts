/**
 * WooCommerce product writes — server-only, and the only place a product is
 * created or changed.
 *
 * Why this module exists at all: the admin console used to persist products to
 * Supabase, which made the store have two catalogs with two owners and no rule
 * about which one a customer saw. WooCommerce is now authoritative, so every
 * write goes here and nothing falls back anywhere else. A write that cannot
 * reach the store throws; it never quietly succeeds locally.
 *
 * ## What a write reports back
 *
 * WooCommerce accepts fields it will ignore, and the interesting one on this
 * catalog is price: almost every product is *variable*, so `regular_price` on
 * the parent is a no-op and the real prices are on the variations. Silently
 * accepting that would let the owner "change a price" and see nothing change in
 * the store. So the caller gets `applied` / `ignored` back and can say so.
 */

import { wordpressRequest } from '../backend/wordpress';
import { requireWooCredentials } from '../backend/credentials';
import {
  fromWooProduct,
  toWooProductBody,
  toWooVariationBody,
  variationPriceRange,
  type AdminProductPatch,
  type AdminProductRecord,
  type AdminVariationPatch,
  type WooProductLike,
  type WooVariationLike,
} from './productPayload';

const REST_V3 = '/wc/v3';

/** Fields WooCommerce ignores on a variable product's parent row. */
const VARIABLE_PARENT_IGNORED = ['price', 'compareAtPrice', 'stockQuantity', 'stockStatus'] as const;

export interface WooWriteResult {
  product: AdminProductRecord;
  /** Patch keys WooCommerce actually stored. */
  applied: string[];
  /**
   * Patch keys the store ignored, with the reason. A caller must surface these
   * — an ignored price edit reported as a success is the exact failure this
   * module is built to prevent.
   */
  ignored: Array<{ field: string; reason: string }>;
}

/** A write failed. Distinguishable from a read failure so routes can answer 502. */
export class WooWriteError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'WooWriteError';
    this.status = status;
  }
}

/**
 * Which patch keys a variable parent cannot honour, so callers can label them
 * before the store silently drops them.
 */
export function ignoredOnVariable(patch: AdminProductPatch): Array<{ field: string; reason: string }> {
  const ignored: Array<{ field: string; reason: string }> = [];
  for (const field of VARIABLE_PARENT_IGNORED) {
    if (patch[field] !== undefined) {
      ignored.push({
        field,
        reason:
          'This is a variable product: WooCommerce keeps price and stock on its variations, not on the parent. Edit the variation.',
      });
    }
  }
  return ignored;
}

function asRecord(row: WooProductLike): AdminProductRecord {
  return fromWooProduct(row);
}

/** Reads one product (any status) with credentials. Throws on 404 as a write error. */
export async function getWooProduct(id: number): Promise<WooProductLike> {
  requireWooCredentials();
  return wordpressRequest<WooProductLike>(`${REST_V3}/products/${id}`, {
    useCredentials: true,
    timeoutMs: 20000,
  });
}

/** All products, any status. The admin list's authoritative read. */
export async function listWooProducts(params: {
  perPage?: number;
  page?: number;
  search?: string;
  status?: string;
  categoryId?: number;
} = {}): Promise<WooProductLike[]> {
  requireWooCredentials();
  return wordpressRequest<WooProductLike[]>(`${REST_V3}/products`, {
    useCredentials: true,
    params: {
      per_page: params.perPage ?? 100,
      page: params.page ?? 1,
      status: params.status ?? 'any',
      search: params.search,
      category: params.categoryId,
    },
    timeoutMs: 25000,
  });
}

/** The variations of a variable product. */
export async function listWooVariations(productId: number): Promise<WooVariationLike[]> {
  requireWooCredentials();
  return wordpressRequest<WooVariationLike[]>(`${REST_V3}/products/${productId}/variations`, {
    useCredentials: true,
    params: { per_page: 100 },
    timeoutMs: 25000,
  });
}

/**
 * Creates a product.
 *
 * New products from this console are **simple** unless the caller says
 * otherwise: a variable product needs attributes and variations to be usable,
 * and WooCommerce will happily create an unsellable empty shell if asked for
 * one. Status defaults to `draft` so an incomplete product never reaches the
 * storefront by accident.
 */
export async function createWooProduct(patch: AdminProductPatch): Promise<WooWriteResult> {
  requireWooCredentials();
  const type = patch.type ?? 'simple';
  const body = toWooProductBody({
    status: 'draft',
    type,
    ...patch,
  });

  try {
    const created = await wordpressRequest<WooProductLike>(`${REST_V3}/products`, {
      useCredentials: true,
      method: 'POST',
      body,
      timeoutMs: 30000,
    });
    return {
      product: asRecord(created),
      applied: Object.keys(body),
      ignored: type === 'variable' ? ignoredOnVariable(patch) : [],
    };
  } catch (error) {
    throw new WooWriteError(`Product could not be created in the store: ${message(error)}`);
  }
}

/** Updates a product. Partial: only the keys the caller supplied are sent. */
export async function updateWooProduct(
  id: number,
  patch: AdminProductPatch
): Promise<WooWriteResult> {
  requireWooCredentials();

  // The store's own answer decides whether a parent-level price edit means
  // anything, so read the type rather than trusting the caller's idea of it.
  const existing = await getWooProduct(id);
  const isVariable = existing.type === 'variable';
  const variations = isVariable ? await listWooVariations(id) : [];

  // Build clean patch for parent product
  const parentPatch: AdminProductPatch = { ...(isVariable ? stripVariableParentFields(patch) : patch) };

  // Handle SKU ownership and uniqueness:
  if (parentPatch.sku !== undefined) {
    const requestedSku = parentPatch.sku.trim();
    const existingSku = (existing.sku ?? '').trim();

    if (!requestedSku) {
      // Blank SKU is explicitly allowed: clears the SKU
      parentPatch.sku = '';
    } else if (requestedSku.toLowerCase() === existingSku.toLowerCase()) {
      // Unchanged SKU on self: omit from body so WooCommerce doesn't re-validate
      delete parentPatch.sku;
    } else if (isVariable) {
      const ownVariationSkus = new Set(
        variations.map((v) => (v.sku ?? '').trim().toLowerCase()).filter(Boolean)
      );
      if (ownVariationSkus.has(requestedSku.toLowerCase())) {
        // The SKU belongs to one of this variable product's own variations (e.g. HK-SFL-C-6lbs).
        // It is THIS product's SKU, not a duplicate from a different product.
        // In WooCommerce, a parent cannot share a variation's SKU in postmeta,
        // so omit from parent body to allow the save without false duplicate-SKU rejection.
        delete parentPatch.sku;
      }
    }
  }

  const body = toWooProductBody(parentPatch);
  let updatedProduct: WooProductLike = existing;
  const applied: string[] = [];

  if (Object.keys(body).length) {
    try {
      updatedProduct = await wordpressRequest<WooProductLike>(`${REST_V3}/products/${id}`, {
        useCredentials: true,
        method: 'PUT',
        body,
        timeoutMs: 30000,
      });
      applied.push(...Object.keys(body));
    } catch (error) {
      throw new WooWriteError(`Product ${id} could not be updated: ${message(error)}`);
    }
  }

  // Handle price/stock propagation to variations when edited on variable parent
  const ignored = isVariable ? ignoredOnVariable(patch) : [];
  if (isVariable && variations.length > 0) {
    const priceEdit = patch.price !== undefined || patch.compareAtPrice !== undefined;
    const stockEdit = patch.stockQuantity !== undefined || patch.stockStatus !== undefined || patch.manageStock !== undefined;

    if (priceEdit || stockEdit) {
      const varPatch: AdminVariationPatch = {};
      if (patch.price !== undefined) {
        const pNum = Number(patch.price);
        if (Number.isFinite(pNum)) varPatch.regularPrice = pNum;
      }
      if (patch.compareAtPrice !== undefined) {
        const cNum = Number(patch.compareAtPrice);
        if (Number.isFinite(cNum) && typeof varPatch.regularPrice === 'number' && cNum > varPatch.regularPrice) {
          varPatch.salePrice = varPatch.regularPrice;
          varPatch.regularPrice = cNum;
        }
      }
      if (patch.manageStock !== undefined) varPatch.manageStock = patch.manageStock;
      if (patch.stockQuantity !== undefined) varPatch.stockQuantity = patch.stockQuantity;
      if (patch.stockStatus !== undefined) varPatch.stockStatus = patch.stockStatus;

      for (const v of variations) {
        if (v.id) {
          await updateWooVariation(id, v.id, varPatch);
        }
      }
      // Successfully applied to variations, so remove from ignored list
      if (priceEdit) {
        for (let i = ignored.length - 1; i >= 0; i--) {
          if (ignored[i].field === 'price' || ignored[i].field === 'compareAtPrice') {
            ignored.splice(i, 1);
          }
        }
      }
      if (stockEdit) {
        for (let i = ignored.length - 1; i >= 0; i--) {
          if (ignored[i].field === 'stockQuantity' || ignored[i].field === 'stockStatus' || ignored[i].field === 'manageStock') {
            ignored.splice(i, 1);
          }
        }
      }
    }
  }

  const record = asRecord(updatedProduct);
  // Ensure variable product record preserves its variation SKU if parent SKU is blank
  if (!record.sku && isVariable && variations.length > 0) {
    const firstSku = variations.find((v) => (v.sku ?? '').trim())?.sku?.trim();
    if (firstSku) record.sku = firstSku;
  }

  return {
    product: record,
    applied,
    ignored,
  };
}

/**
 * Removes the price/stock keys a variable parent cannot store.
 *
 * They are stripped rather than sent so the store's response cannot be read as
 * "accepted": the caller learns about them through `ignored` instead.
 */
function stripVariableParentFields(patch: AdminProductPatch): AdminProductPatch {
  const next: AdminProductPatch = { ...patch };
  for (const field of VARIABLE_PARENT_IGNORED) delete next[field];
  return next;
}

/** Updates one variation of a variable product. */
export async function updateWooVariation(
  productId: number,
  variationId: number,
  patch: AdminVariationPatch
): Promise<WooVariationLike> {
  requireWooCredentials();
  const body = toWooVariationBody(patch);
  if (!Object.keys(body).length) {
    throw new WooWriteError('No variation fields were supplied.', 400);
  }
  try {
    return await wordpressRequest<WooVariationLike>(
      `${REST_V3}/products/${productId}/variations/${variationId}`,
      { useCredentials: true, method: 'PUT', body, timeoutMs: 30000 }
    );
  } catch (error) {
    throw new WooWriteError(`Variation ${variationId} could not be updated: ${message(error)}`);
  }
}

/**
 * Trashes a product. Trash, never `force`: a product the owner deleted in a
 * console must be recoverable, and WooCommerce keeps trashed products out of
 * the storefront and every catalog read anyway.
 */
export async function trashWooProduct(id: number): Promise<{ product: AdminProductRecord }> {
  requireWooCredentials();
  try {
    const trashed = await wordpressRequest<WooProductLike>(`${REST_V3}/products/${id}`, {
      useCredentials: true,
      method: 'DELETE',
      params: { force: 'false' },
      timeoutMs: 30000,
    });
    return { product: asRecord(trashed) };
  } catch (error) {
    throw new WooWriteError(`Product ${id} could not be archived: ${message(error)}`);
  }
}

/**
 * Permanently deletes a product.
 *
 * Deliberately not reachable from the console: the only delete the admin offers
 * is `trashWooProduct`, because an owner who clicks delete should be able to
 * change their mind. This exists for one caller — the live write test, which
 * must not leave its throwaway product behind even in the trash.
 */
export async function permanentlyDeleteWooProduct(id: number): Promise<void> {
  requireWooCredentials();
  await wordpressRequest<unknown>(`${REST_V3}/products/${id}`, {
    useCredentials: true,
    method: 'DELETE',
    params: { force: 'true' },
    timeoutMs: 30000,
  });
}

/** Restores a trashed product to draft. */
export async function restoreWooProduct(id: number): Promise<WooWriteResult> {
  return updateWooProduct(id, { status: 'draft' });
}

/**
 * Duplicates a product as a draft.
 *
 * Copies the fields a duplicate is for — copy, images, pricing, taxonomy — and
 * deliberately drops the SKU. Two products sharing a SKU is a data-integrity
 * problem WooCommerce only warns about, and the duplicate is a draft anyway, so
 * the owner supplies its own SKU before publishing.
 */
export async function duplicateWooProduct(id: number): Promise<WooWriteResult> {
  requireWooCredentials();
  const source = await getWooProduct(id);

  const body: AdminProductPatch = {
    name: `${String(source.name ?? 'Product')} (copy)`,
    status: 'draft',
    type: source.type === 'variable' ? 'variable' : 'simple',
    description: source.description,
    shortDescription: source.short_description,
    slug: undefined,
    images: (source.images ?? []).map((image) => image.src).filter(Boolean) as string[],
    categoryIds: (source.categories ?? []).map((category) => Number(category.id)).filter(Number.isFinite),
    tags: (source.tags ?? []).map((tag) => String(tag.name ?? '')).filter(Boolean),
    featured: false,
  };

  if (source.type !== 'variable') {
    body.price = parsePrice(source.sale_price) ?? parsePrice(source.regular_price);
    body.compareAtPrice =
      parsePrice(source.sale_price) !== null ? parsePrice(source.regular_price) : null;
  }

  return createWooProduct(body);
}

function parsePrice(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Price range across a product's variations, or null when none report a price. */
export { variationPriceRange };
