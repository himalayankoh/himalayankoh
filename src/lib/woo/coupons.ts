/**
 * WooCommerce coupons — the store's own discounts, server only.
 *
 * There is deliberately no second discount store. The app already holds one
 * hard-coded coupon (`HKWELCOME10`, in `lib/supabase/api/orders`) that is *not* a
 * WooCommerce coupon, so it will never apply at a real Woo checkout — a
 * discrepancy this module's read makes visible instead of hiding, and which the
 * console reports.
 *
 * ## What is enforced here rather than in the form
 *
 * - **A code is unique and normalised.** WooCommerce stores coupon codes
 *   lowercased; a console that echoed the owner's capitals back would show a code
 *   the store never had. Codes are written lowercase and compared lowercase.
 * - **A percentage cannot exceed 100.** WooCommerce accepts `150` and then
 *   discounts more than the cart is worth; the store's own answer would be the
 *   only sign of it, so it is refused before the request.
 * - **A date range has an order.** An expiry before its start is accepted by the
 *   store and simply never applies, which looks like a broken coupon.
 * - **A new coupon defaults to draft.** An unpublished coupon is inert; publishing
 *   is a deliberate second step, so a half-typed discount never reaches a
 *   customer. WooCommerce's own status for a live coupon is `publish`.
 */

import { wordpressRequest, wordpressRequestWithMeta } from '../backend/wordpress';
import { requireWooCredentials } from '../backend/credentials';

const REST_V3 = '/wc/v3';

export type CouponDiscountType = 'percent' | 'fixed_cart' | 'fixed_product';

/** A coupon as REST v3 reports it (the fields this console manages). */
export interface WooCouponLike {
  id: number;
  code: string;
  amount: string;
  discount_type: CouponDiscountType;
  description?: string;
  date_created_gmt?: string;
  date_expires_gmt?: string | null;
  usage_count?: number;
  individual_use?: boolean;
  product_ids?: number[];
  excluded_product_ids?: number[];
  usage_limit?: number | null;
  usage_limit_per_user?: number | null;
  limit_usage_to_x_items?: number | null;
  free_shipping?: boolean;
  minimum_amount?: string;
  maximum_amount?: string;
  exclude_sale_items?: boolean;
  email_restrictions?: string[];
  status?: string;
}

export interface CouponInput {
  code: string;
  discountType: CouponDiscountType;
  /** Percentage (0–100) or a fixed amount, depending on `discountType`. */
  amount: number;
  description?: string;
  /** ISO date, applied as the coupon's expiry. */
  dateExpires?: string | null;
  minimumAmount?: number | null;
  maximumAmount?: number | null;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  freeShipping?: boolean;
  /** Draft keeps the coupon inert until the owner publishes it. */
  published?: boolean;
  /** Whether the coupon can only be used alone without stacking. */
  individualUse?: boolean;
  /** Customer emails permitted to redeem this coupon. Empty/undefined means any customer. */
  emailRestrictions?: string[];
}

/** A coupon write failed in a way the caller must surface. */
export class CouponWriteError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'CouponWriteError';
    this.status = status;
  }
}

/** Two coupons cannot share a code. */
export class CouponCodeTakenError extends CouponWriteError {
  constructor(code: string) {
    super(`A coupon with the code "${code}" already exists in the store.`, 409);
    this.name = 'CouponCodeTakenError';
  }
}

/** WooCommerce writes coupon codes lowercase, so every comparison is lowercase. */
export function normaliseCouponCode(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * The coupon rules, as a pure function.
 *
 * Exported so they can be pinned by a test without a store: a rule that only
 * exists inside a write path is a rule nobody can prove without credentials.
 */
export function validateCoupon(input: CouponInput): void {
  const code = normaliseCouponCode(input.code);
  if (!code) throw new CouponWriteError('A coupon needs a code.', 400);
  if (!/^[a-z0-9-_]+$/.test(code)) {
    throw new CouponWriteError(
      'A coupon code may contain letters, numbers, hyphens and underscores only.',
      400
    );
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new CouponWriteError('A coupon needs an amount greater than zero.', 400);
  }
  if (input.discountType === 'percent' && input.amount > 100) {
    throw new CouponWriteError('A percentage coupon cannot exceed 100%.', 400);
  }
  if (input.dateExpires) {
    const parsed = new Date(input.dateExpires);
    if (Number.isNaN(parsed.getTime())) {
      throw new CouponWriteError('The expiry date could not be read as a date.', 400);
    }
  }
  if (
    input.minimumAmount != null &&
    input.maximumAmount != null &&
    input.maximumAmount > 0 &&
    input.minimumAmount > input.maximumAmount
  ) {
    throw new CouponWriteError('The minimum spend is higher than the maximum spend.', 400);
  }
  for (const [label, value] of [
    ['usage limit', input.usageLimit],
    ['per-customer limit', input.usageLimitPerUser],
  ] as const) {
    if (value != null && (!Number.isInteger(value) || value < 1)) {
      throw new CouponWriteError(`The ${label} must be a whole number of at least 1, or left empty.`, 400);
    }
  }
  if (Array.isArray(input.emailRestrictions)) {
    for (const email of input.emailRestrictions) {
      const clean = email.trim();
      if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        throw new CouponWriteError(`"${clean}" is not a valid email address.`, 400);
      }
    }
  }
}

/** In-memory 60s cache for fast admin loading */
let couponsMemoryCache: { coupons: WooCouponLike[]; expiresAt: number } | null = null;

export function invalidateCouponsCache(): void {
  couponsMemoryCache = null;
}

/** Every coupon the store holds (cached in-memory for 60s). */
export async function listCachedWooCoupons(): Promise<WooCouponLike[]> {
  const now = Date.now();
  if (couponsMemoryCache && couponsMemoryCache.expiresAt > now) {
    return couponsMemoryCache.coupons;
  }
  const coupons = await listWooCoupons();
  couponsMemoryCache = {
    coupons,
    expiresAt: now + 60_000,
  };
  return coupons;
}

/** Every coupon the store holds. */
export async function listWooCoupons(): Promise<WooCouponLike[]> {
  requireWooCredentials();
  const rows = await wordpressRequest<WooCouponLike[]>(`${REST_V3}/coupons`, {
    useCredentials: true,
    params: { per_page: 100, orderby: 'date', order: 'desc' },
    timeoutMs: 20_000,
  });
  return Array.isArray(rows) ? rows : [];
}

/** The coupon holding a code, if any (excluding one id when editing). */
export async function findCouponByCode(
  code: string,
  exceptId?: number
): Promise<WooCouponLike | null> {
  requireWooCredentials();
  const normalised = normaliseCouponCode(code);
  if (!normalised) return null;
  const rows = await wordpressRequest<WooCouponLike[]>(`${REST_V3}/coupons`, {
    useCredentials: true,
    params: { code: normalised, per_page: 20 },
    timeoutMs: 20_000,
  });
  return rows.find((row) => Number(row.id) !== exceptId) ?? null;
}

function bodyFrom(input: CouponInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    code: normaliseCouponCode(input.code),
    discount_type: input.discountType,
    amount: input.amount.toFixed(2),
  };
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.dateExpires !== undefined) {
    body.date_expires = input.dateExpires ? new Date(input.dateExpires).toISOString() : null;
  }
  if (input.minimumAmount !== undefined) body.minimum_amount = input.minimumAmount ? input.minimumAmount.toFixed(2) : '0.00';
  if (input.maximumAmount !== undefined) body.maximum_amount = input.maximumAmount ? input.maximumAmount.toFixed(2) : '0.00';
  if (input.usageLimit !== undefined) body.usage_limit = input.usageLimit ?? null;
  if (input.usageLimitPerUser !== undefined) body.usage_limit_per_user = input.usageLimitPerUser ?? null;
  if (input.freeShipping !== undefined) body.free_shipping = input.freeShipping;
  if (input.individualUse !== undefined) body.individual_use = Boolean(input.individualUse);
  if (input.emailRestrictions !== undefined) {
    body.email_restrictions = input.emailRestrictions
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  body.status = input.published ? 'publish' : 'draft';
  return body;
}

/** Creates a coupon. A code collision is refused, never auto-suffixed. */
export async function createWooCoupon(input: CouponInput): Promise<WooCouponLike> {
  requireWooCredentials();
  validateCoupon(input);
  const code = normaliseCouponCode(input.code);
  if (await findCouponByCode(code)) throw new CouponCodeTakenError(code);

  try {
    const coupon = await wordpressRequest<WooCouponLike>(`${REST_V3}/coupons`, {
      useCredentials: true,
      method: 'POST',
      body: bodyFrom({ ...input, published: input.published ?? false }),
      timeoutMs: 20_000,
    });
    invalidateCouponsCache();
    return coupon;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CouponWriteError(`The coupon could not be created: ${message}`);
  }
}

/** Updates a coupon. The code may be renamed, but not to one already in use. */
export async function updateWooCoupon(
  id: number,
  input: Partial<CouponInput>
): Promise<WooCouponLike> {
  requireWooCredentials();
  if (!Number.isFinite(id) || id <= 0) throw new CouponWriteError('A coupon id is required.', 400);

  const current = await wordpressRequest<WooCouponLike>(`${REST_V3}/coupons/${id}`, {
    useCredentials: true,
    timeoutMs: 20_000,
  });

  const merged: CouponInput = {
    code: input.code ?? current.code,
    discountType: input.discountType ?? current.discount_type,
    amount: input.amount ?? Number(current.amount),
    description: input.description !== undefined ? input.description : current.description,
    dateExpires: input.dateExpires !== undefined ? input.dateExpires : (current.date_expires_gmt ?? null),
    minimumAmount:
      input.minimumAmount !== undefined
        ? input.minimumAmount
        : current.minimum_amount
          ? Number(current.minimum_amount)
          : null,
    maximumAmount:
      input.maximumAmount !== undefined
        ? input.maximumAmount
        : current.maximum_amount
          ? Number(current.maximum_amount)
          : null,
    usageLimit: input.usageLimit !== undefined ? input.usageLimit : (current.usage_limit ?? null),
    usageLimitPerUser:
      input.usageLimitPerUser !== undefined ? input.usageLimitPerUser : (current.usage_limit_per_user ?? null),
    freeShipping: input.freeShipping !== undefined ? input.freeShipping : Boolean(current.free_shipping),
    published: input.published ?? current.status === 'publish',
    individualUse: input.individualUse !== undefined ? input.individualUse : Boolean(current.individual_use),
    emailRestrictions: input.emailRestrictions !== undefined ? input.emailRestrictions : current.email_restrictions,
  };
  validateCoupon(merged);

  const code = normaliseCouponCode(merged.code);
  if (code !== normaliseCouponCode(current.code) && (await findCouponByCode(code, id))) {
    throw new CouponCodeTakenError(code);
  }

  try {
    const coupon = await wordpressRequest<WooCouponLike>(`${REST_V3}/coupons/${id}`, {
      useCredentials: true,
      method: 'PUT',
      body: bodyFrom({ ...merged, code }),
      timeoutMs: 20_000,
    });
    invalidateCouponsCache();
    return coupon;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CouponWriteError(`Coupon ${id} could not be updated: ${message}`);
  }
}

/**
 * Deletes a coupon permanently.
 *
 * Coupons are configuration, not history: the redemption record lives on the
 * orders that used the code, and those keep their `coupon_lines` after the coupon
 * itself is gone. So a delete here removes the ability to redeem, not the record
 * of what happened — which is why this is a real delete rather than a draft.
 */
export async function deleteWooCoupon(id: number): Promise<WooCouponLike> {
  requireWooCredentials();
  if (!Number.isFinite(id) || id <= 0) throw new CouponWriteError('A coupon id is required.', 400);
  try {
    const coupon = await wordpressRequest<WooCouponLike>(`${REST_V3}/coupons/${id}`, {
      useCredentials: true,
      method: 'DELETE',
      params: { force: 'true' },
      timeoutMs: 20_000,
    });
    invalidateCouponsCache();
    return coupon;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CouponWriteError(`Coupon ${id} could not be deleted: ${message}`);
  }
}

/** How many coupons the store holds, without reading the individual codes. */
export async function countWooCoupons(): Promise<number> {
  requireWooCredentials();
  const response = await wordpressRequestWithMeta<WooCouponLike[]>(`${REST_V3}/coupons`, {
    useCredentials: true,
    params: { per_page: 1 },
    timeoutMs: 15_000,
  });
  return response.total ?? (Array.isArray(response.data) ? response.data.length : 0);
}

/** A coupon is live only while published and not past its expiry. */
export function couponState(
  coupon: WooCouponLike,
  now: Date = new Date()
): 'active' | 'scheduled' | 'expired' | 'draft' {
  if (coupon.status !== 'publish') return 'draft';
  const expires = coupon.date_expires_gmt ? new Date(`${coupon.date_expires_gmt}Z`) : null;
  if (expires && !Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}
