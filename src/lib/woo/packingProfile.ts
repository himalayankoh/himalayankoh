/**
 * Product shipping truth, read from WooCommerce — server-only.
 *
 * The store already holds a product's weight and dimensions natively, and
 * WooCommerce is where the owner maintains them. The packing profile — the box a
 * product ships in, how many fit, whether it ships alone — has no WooCommerce core
 * field, so it lives on the product as registered meta (`_hk_packing_profile`)
 * rather than in a second database. One product, one place to look.
 *
 * This replaces the Supabase read that used to join `products` with
 * `product_packing_profiles` (and, before that migration, decode a profile out of a
 * product *tag*). Those rows still exist on the old database and have not been copied
 * across yet: `savePackingProfile()` below is the write path, and until something has
 * written a profile, every parcel is built from weight alone.
 *
 * **That is a real gap, not a detail.** A product whose box dimensions and units per
 * box were only ever recorded on the old database used to rate from that profile and
 * now rates from its weight, which can mean more parcels than the old system quoted.
 * The copy is a data migration with one open mapping question (the old rows are keyed
 * by a Supabase product id, and only SKU or slug bridges that to a WooCommerce
 * product), and it is listed in `docs/WORDPRESS-WOOCOMMERCE-MIGRATION.md`.
 */

import { requireWooCredentials } from '../backend/credentials';
import { wordpressRequest } from '../backend/wordpress';
import { toWeightLbs } from '../products/shippingWeight';
import type { ProductPackingProfile } from '../shippo/packing/productPackingProfile';
import { decodePackingProfileJson } from '../shippo/packing/packingProfileTag';
import type { WooProductLike } from './productPayload';

const REST_V3 = '/wc/v3';

/**
 * The product meta key holding a packing profile, as JSON.
 *
 * Registered with `show_in_rest` by the hk-storefront plugin so WooCommerce's REST
 * API will write it; an unregistered meta key is silently refused on write, which
 * is the failure mode that leaves a profile looking saved and absent.
 */
export const PACKING_PROFILE_META_KEY = '_hk_packing_profile';

/**
 * The store's configured weight unit, resolved once per process.
 *
 * WooCommerce stores a product's weight in the *store's* unit, not in a unit of its
 * own, and the REST product payload does not say which that is. Assuming pounds
 * against a store configured in kilograms would under-report every parcel by more
 * than half — a wrong shipping price is a money bug, so the unit is read from the
 * store's own settings rather than guessed. Falls back to pounds with a warning when
 * the settings endpoint cannot be read, because the USPS-only shipping this store
 * already uses is a pounds domain.
 */
let cachedWeightUnit: string | null = null;

export function __resetWeightUnitCacheForTests(): void {
  cachedWeightUnit = null;
}

async function storeWeightUnit(): Promise<string> {
  if (cachedWeightUnit) return cachedWeightUnit;
  try {
    const settings = await wordpressRequest<Array<{ id?: string; value?: unknown }>>(
      `${REST_V3}/settings/products`,
      { useCredentials: true, timeoutMs: 15000 },
    );
    const unit = settings?.find((setting) => setting.id === 'woocommerce_weight_unit')?.value;
    cachedWeightUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : 'lbs';
  } catch (error) {
    console.warn(
      `[Shippo] The store's weight unit could not be read; packing weights are assumed to be pounds: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    cachedWeightUnit = 'lbs';
  }
  return cachedWeightUnit;
}

/** What the rate calculator needs about one ordered product. */
export interface OrderableProductFacts {
  productId: string;
  slug: string;
  name: string;
  /** Weight in pounds, or null when the product reports none. */
  weightLbs: number | null;
  packingProfile: ProductPackingProfile | null;
}

/**
 * Reads products by id, in the batches WooCommerce accepts.
 *
 * `include` is how WooCommerce filters by id, and a query that names 100 ids is the
 * largest the API will answer in one request — so the ids are chunked rather than
 * sent as one list that comes back truncated and silently rates half a cart.
 */
async function fetchProductsByIds(ids: number[]): Promise<WooProductLike[]> {
  const out: WooProductLike[] = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const page = await wordpressRequest<WooProductLike[]>(`${REST_V3}/products`, {
      useCredentials: true,
      params: { include: chunk, per_page: chunkSize, status: 'any' },
      timeoutMs: 20000,
    });
    if (Array.isArray(page)) out.push(...page);
  }

  // WooCommerce's collection excludes product_variation posts, even when their
  // ids are in `include`. Its individual product endpoint resolves them and
  // returns the selected option's own name, weight and registered packing meta.
  const returnedIds = new Set(out.map((product) => product.id));
  const missing = ids.filter((id) => !returnedIds.has(id));
  for (let start = 0; start < missing.length; start += 4) {
    const batch = missing.slice(start, start + 4);
    const results = await Promise.allSettled(batch.map((id) =>
      wordpressRequest<WooProductLike>(`${REST_V3}/products/${id}`, {
        useCredentials: true,
        timeoutMs: 20000,
      }),
    ));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.id === batch[index]) {
        out.push(result.value);
      } else if (result.status === 'rejected') {
        console.warn(`[Shippo] Shipping facts for product ${batch[index]} could not be read.`);
      }
    });
  }
  return out;
}

/**
 * The product facts behind a set of WooCommerce product ids.
 *
 * Numeric ids only: the cart is WooCommerce's, so every line item's product id is
 * one. A non-numeric id (a stale guest cart, a hand-built row) is dropped rather
 * than sent to the API, where it would 400 the whole read and take the rates with it.
 *
 * Numbers are accepted as well as strings because a WooCommerce id arrives as one or
 * the other depending on where it came from, and making every caller remember which
 * would be a trap rather than a type.
 */
export async function readOrderableProducts(
  productIds: Array<string | number | null | undefined>,
): Promise<Map<string, OrderableProductFacts>> {
  const ids = [
    ...new Set(
      productIds
        .map((id) => String(id ?? '').trim())
        .filter((id) => /^\d+$/.test(id))
        .map(Number),
    ),
  ];
  const facts = new Map<string, OrderableProductFacts>();
  if (ids.length === 0) return facts;

  requireWooCredentials();
  const unit = await storeWeightUnit();
  const products = await fetchProductsByIds(ids);

  for (const product of products) {
    if (typeof product.id !== 'number') continue;
    const key = String(product.id);
    const meta = product.meta_data?.find((entry) => entry.key === PACKING_PROFILE_META_KEY);
    facts.set(key, {
      productId: key,
      slug: product.slug ?? '',
      name: product.name ?? '',
      weightLbs: toWeightLbs(
        product.weight === undefined || product.weight === '' ? null : Number(product.weight),
        unit,
      ),
      packingProfile: meta ? decodePackingProfileJson(key, meta.value) : null,
    });
  }

  return facts;
}

/** Stores a product's packing profile as WooCommerce meta. */
export async function savePackingProfile(
  productId: number,
  profile: Omit<ProductPackingProfile, 'productId'>,
): Promise<void> {
  requireWooCredentials();
  await wordpressRequest(`${REST_V3}/products/${productId}`, {
    method: 'PUT',
    useCredentials: true,
    body: {
      meta_data: [{ key: PACKING_PROFILE_META_KEY, value: JSON.stringify(profile) }],
    },
    timeoutMs: 20000,
  });
}
