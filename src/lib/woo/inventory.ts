/**
 * WooCommerce inventory — server only.
 *
 * The console's Inventory page used to be read through the storefront's catalog
 * adapter, which is built for what a *shopper* sees and so carries only a stock
 * status. Stock management is a different question — does the store track units,
 * what is the low-stock threshold, are backorders allowed — and it is answered
 * here, from the same authenticated product read the product editor uses.
 *
 * ## The fact this exists to state honestly
 *
 * On this store WooCommerce is not managing stock at all: every product is
 * `manage_stock: false`, so there is no quantity anywhere to show, and the low
 * stock alert has nothing to fire on. That is a *setting*, not a failed
 * connection, and the console now says so in those words instead of asking for a
 * credential it already holds. When the owner turns stock management on, the
 * quantities appear here with no code change.
 *
 * ## No N+1 requests
 *
 * A variable product keeps its stock on its variations, so answering for it needs
 * a second request per product. That is exactly the shape that made the old
 * catalogue slow. So the variations of a variable product are only read when the
 * store actually manages stock somewhere in the window being displayed — a store
 * that tracks nothing pays nothing — and the read is done for at most
 * `MAX_VARIATION_READS` products, with the console told how many products were
 * not expanded rather than being shown an incomplete total as if it were whole.
 */

import { wordpressRequest } from '../backend/wordpress';
import { requireWooCredentials } from '../backend/credentials';
import { purgePublicProduct, slugOf } from '../backend/publicCache';

const REST_V3 = '/wc/v3';

/** Products whose variations are read in one pass. Above this, the rest are listed unexpanded. */
const MAX_VARIATION_READS = 25;

export interface WooProductStock {
  id: number;
  name: string;
  sku: string | null;
  type: string;
  status: string;
  manage_stock: boolean;
  stock_status?: string;
  stock_quantity?: number | null;
  backorders?: string;
  low_stock_amount?: number | null;
  price?: string;
  variations?: number[];
}

export interface WooVariationStock {
  id: number;
  parentId: number;
  sku: string | null;
  stock_status?: string;
  stock_quantity?: number | null;
  manage_stock: boolean;
  low_stock_amount?: number | null;
  /** Variation attributes, flattened for display: "3 lbs". */
  label: string;
}

export interface InventoryRow {
  id: string;
  parentId: number | null;
  name: string;
  sku: string | null;
  type: 'simple' | 'variation';
  /** True when this record is the one that owns the count. */
  tracksQuantity: boolean;
  quantity: number | null;
  stockStatus: 'in_stock' | 'out_of_stock' | 'on_backorder' | 'unknown';
  backorders: string | null;
  lowStockThreshold: number | null;
  /** True when the count is at or below the threshold the store set. */
  lowStock: boolean;
  price: string | null;
}

export interface InventoryReport {
  rows: InventoryRow[];
  /** Products the store reports in this window. */
  productsRead: number;
  /** True when WooCommerce is managing units for at least one product. */
  tracksQuantities: boolean;
  /** Products with stock managed but no readable count. */
  missingCounts: number;
  outOfStock: number;
  lowStock: number;
  onBackorder: number;
  /** Variable products whose variations were not read, when the cap was reached. */
  unexpanded: number;
  notes: string[];
}

function normalizeStatus(raw: string | undefined): InventoryRow['stockStatus'] {
  if (raw === 'instock') return 'in_stock';
  if (raw === 'outofstock') return 'out_of_stock';
  if (raw === 'onbackorder') return 'on_backorder';
  return 'unknown';
}

function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function variationLabel(attributes: Array<{ name?: string; option?: string }> | undefined): string {
  const parts = (attributes ?? [])
    .map((entry) => String(entry.option ?? '').trim())
    .filter(Boolean);
  return parts.join(' · ');
}

/** Every product the store holds, with the fields stock management depends on. */
async function readProductWindow(): Promise<WooProductStock[]> {
  requireWooCredentials();
  const rows = await wordpressRequest<WooProductStock[]>(`${REST_V3}/products`, {
    useCredentials: true,
    params: { per_page: 100, status: 'any', orderby: 'title', order: 'asc' },
    timeoutMs: 30_000,
  });
  return Array.isArray(rows) ? rows : [];
}

/**
 * The store's inventory position.
 *
 * Read once per console refresh. Nothing is cached: a stock figure that is stale
 * by an hour is worse than no figure at all on a page whose whole purpose is
 * knowing what can be sold.
 */
export async function readInventoryReport(): Promise<InventoryReport> {
  const products = await readProductWindow();
  const notes: string[] = [];

  const tracksQuantities = products.some((product) => product.manage_stock === true);
  const rows: InventoryRow[] = [];
  const variableProducts = products.filter(
    (product) => product.type === 'variable' && product.manage_stock !== true
  );
  const toExpand = tracksQuantities ? variableProducts.slice(0, MAX_VARIATION_READS) : [];
  const unexpanded = tracksQuantities ? Math.max(0, variableProducts.length - toExpand.length) : 0;

  for (const product of products) {
    const quantity = count(product.stock_quantity);
    const threshold = count(product.low_stock_amount);
    rows.push({
      id: String(product.id),
      parentId: null,
      name: product.name,
      sku: product.sku?.trim() || null,
      type: 'simple',
      tracksQuantity: product.manage_stock === true,
      quantity,
      stockStatus: normalizeStatus(product.stock_status),
      backorders: product.backorders && product.backorders !== 'no' ? product.backorders : null,
      lowStockThreshold: threshold,
      lowStock:
        product.manage_stock === true && quantity !== null && threshold !== null && quantity <= threshold,
      price: product.price?.trim() ? product.price.trim() : null,
    });
  }

  // Only when the store tracks units somewhere: otherwise there is nothing to
  // find on a variation, and reading each variable product would be the N+1
  // pattern this module exists to avoid.
  const variationReads = await Promise.allSettled(
    toExpand.map(async (parent) => {
      const variations = await wordpressRequest<
        Array<{
          id: number;
          sku?: string;
          stock_status?: string;
          stock_quantity?: number | null;
          manage_stock?: boolean;
          low_stock_amount?: number | null;
          attributes?: Array<{ name?: string; option?: string }>;
        }>
      >(`${REST_V3}/products/${parent.id}/variations`, {
        useCredentials: true,
        params: { per_page: 100 },
        timeoutMs: 25_000,
      });
      return { parent, variations: Array.isArray(variations) ? variations : [] };
    })
  );

  for (let i = 0; i < variationReads.length; i++) {
    const res = variationReads[i];
    const parent = toExpand[i];
    if (res.status === 'fulfilled') {
      for (const variation of res.value.variations) {
        const quantity = count(variation.stock_quantity);
        const threshold = count(variation.low_stock_amount);
        rows.push({
          id: String(variation.id),
          parentId: parent.id,
          name: `${parent.name}${variationLabel(variation.attributes) ? ` — ${variationLabel(variation.attributes)}` : ''}`,
          sku: variation.sku?.trim() || null,
          type: 'variation',
          tracksQuantity: variation.manage_stock === true,
          quantity,
          stockStatus: normalizeStatus(variation.stock_status),
          backorders: null,
          lowStockThreshold: threshold,
          lowStock:
            variation.manage_stock === true && quantity !== null && threshold !== null && quantity <= threshold,
          price: null,
        });
      }
    } else {
      const error = res.reason;
      notes.push(
        `The variations of "${parent.name}" (product ${parent.id}) could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (!tracksQuantities) {
    notes.push(
      'WooCommerce is not managing stock on this store: every product has "Manage stock" switched off, so there is no unit count and no low-stock alert for anything here. Stock is tracked only as In stock / Out of stock. Switch "Manage stock" on for a product in WooCommerce and its quantity appears here with no change to this console.'
    );
  }
  if (unexpanded > 0) {
    notes.push(
      `${unexpanded} variable product${unexpanded === 1 ? '' : 's'} were listed without their variations: reading each one is a separate store request, so only the first ${MAX_VARIATION_READS} were expanded on this refresh.`
    );
  }

  return {
    rows,
    productsRead: products.length,
    tracksQuantities,
    missingCounts: rows.filter((row) => row.tracksQuantity && row.quantity === null).length,
    outOfStock: rows.filter((row) => row.stockStatus === 'out_of_stock').length,
    lowStock: rows.filter((row) => row.lowStock).length,
    onBackorder: rows.filter((row) => row.stockStatus === 'on_backorder').length,
    unexpanded,
    notes,
  };
}

/**
 * Sets a product's stock.
 *
 * The write is not offered anywhere in the console yet, and this exists so that a
 * future screen — and the test suite — can adjust a count through the same
 * credentialed path as every other store write rather than a second one.
 */
export async function updateWooStock(
  productId: number,
  input: { quantity?: number; manageStock?: boolean; lowStockAmount?: number | null; stockStatus?: 'instock' | 'outofstock' | 'onbackorder'; variationId?: number }
): Promise<unknown> {
  requireWooCredentials();
  const path = input.variationId
    ? `${REST_V3}/products/${productId}/variations/${input.variationId}`
    : `${REST_V3}/products/${productId}`;

  const body: Record<string, unknown> = {};
  if (input.manageStock !== undefined) body.manage_stock = input.manageStock;
  if (input.quantity !== undefined) body.stock_quantity = input.quantity;
  if (input.lowStockAmount !== undefined) body.low_stock_amount = input.lowStockAmount;
  if (input.stockStatus !== undefined) body.stock_status = input.stockStatus;

  if (Object.keys(body).length === 0) throw new Error('No stock fields were supplied.');

  const updated = await wordpressRequest<unknown>(path, {
    useCredentials: true,
    method: 'PUT',
    body,
    timeoutMs: 25_000,
  });

  // Stock is the field a shopper must never see stale: the moment the store
  // accepts a quantity, the product's page and the shelf it sits on stop being
  // served from the edge. A variation edit changes the parent's page.
  purgePublicProduct(slugOf(updated), `stock for product ${productId} was updated`);

  return updated;
}
