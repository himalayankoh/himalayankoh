/**
 * Coupons — the store's own discount codes, read and written server-side.
 *
 * WooCommerce is the only system that can apply a discount at checkout, so it is
 * the only system this route writes to. Every coupon is returned with its state
 * derived from its own publish status and expiry, so the console shows "expired"
 * for a code that exists but cannot be used, instead of listing it as live.
 *
 * A code collision is answered 409 and never auto-suffixed; the validation rules
 * live in `lib/woo/coupons` so a second caller cannot invent a different set.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  CouponWriteError,
  createWooCoupon,
  couponState,
  listWooCoupons,
  type CouponDiscountType,
} from '@/lib/woo/coupons';

export const dynamic = 'force-dynamic';

const DISCOUNT_TYPES: CouponDiscountType[] = ['percent', 'fixed_cart', 'fixed_product'];

function failure(error: unknown) {
  if (error instanceof CouponWriteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'The coupons could not be read.';
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const coupons = (await listWooCoupons()).map((coupon) => ({
      ...coupon,
      state: couponState(coupon),
    }));
    return NextResponse.json({ coupons });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const discountType = DISCOUNT_TYPES.includes(record.discountType as CouponDiscountType)
    ? (record.discountType as CouponDiscountType)
    : 'percent';

  const emailRestrictions = Array.isArray(record.emailRestrictions)
    ? (record.emailRestrictions.filter((item): item is string => typeof item === 'string') as string[])
    : typeof record.emailRestrictions === 'string' && record.emailRestrictions.trim()
      ? [record.emailRestrictions.trim()]
      : undefined;

  try {
    const coupon = await createWooCoupon({
      code: typeof record.code === 'string' ? record.code : '',
      discountType,
      amount: Number(record.amount),
      description: typeof record.description === 'string' ? record.description : undefined,
      dateExpires: typeof record.dateExpires === 'string' ? record.dateExpires : null,
      minimumAmount: typeof record.minimumAmount === 'number' ? record.minimumAmount : null,
      maximumAmount: typeof record.maximumAmount === 'number' ? record.maximumAmount : null,
      usageLimit: typeof record.usageLimit === 'number' ? record.usageLimit : null,
      usageLimitPerUser: typeof record.usageLimitPerUser === 'number' ? record.usageLimitPerUser : null,
      freeShipping: record.freeShipping === true,
      published: record.published === true,
      individualUse: record.individualUse === true,
      emailRestrictions,
    });
    return NextResponse.json({ coupon: { ...coupon, state: couponState(coupon) } }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
