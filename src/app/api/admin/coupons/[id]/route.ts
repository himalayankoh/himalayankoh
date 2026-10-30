/**
 * Edit or delete one coupon in the store.
 *
 * Publish/unpublish is the same endpoint as any other edit: WooCommerce's
 * `status` field is how a coupon is enabled or disabled, and a draft coupon is
 * inert at checkout. That is deliberate — "disable" is not a separate concept the
 * console has to keep in sync with the store.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  CouponWriteError,
  couponState,
  deleteWooCoupon,
  listWooCoupons,
  updateWooCoupon,
  type CouponDiscountType,
} from '@/lib/woo/coupons';

export const dynamic = 'force-dynamic';

const DISCOUNT_TYPES: CouponDiscountType[] = ['percent', 'fixed_cart', 'fixed_product'];

function failure(error: unknown) {
  if (error instanceof CouponWriteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'The coupon could not be updated.';
  return NextResponse.json({ error: message }, { status: 502 });
}

async function parseId(context: { params: Promise<{ id: string }> }): Promise<number | null> {
  const { id } = await context.params;
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = await parseId(context);
  if (!id) return NextResponse.json({ error: 'A coupon id is required.' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;

  try {
    const coupon = await updateWooCoupon(id, {
      code: typeof record.code === 'string' ? record.code : undefined,
      discountType: DISCOUNT_TYPES.includes(record.discountType as CouponDiscountType)
        ? (record.discountType as CouponDiscountType)
        : undefined,
      amount: record.amount === undefined ? undefined : Number(record.amount),
      description: typeof record.description === 'string' ? record.description : undefined,
      dateExpires: typeof record.dateExpires === 'string' ? record.dateExpires : undefined,
      minimumAmount:
        record.minimumAmount === null ? null : typeof record.minimumAmount === 'number' ? record.minimumAmount : undefined,
      maximumAmount:
        record.maximumAmount === null ? null : typeof record.maximumAmount === 'number' ? record.maximumAmount : undefined,
      usageLimit: record.usageLimit === null ? null : typeof record.usageLimit === 'number' ? record.usageLimit : undefined,
      usageLimitPerUser:
        record.usageLimitPerUser === null
          ? null
          : typeof record.usageLimitPerUser === 'number'
            ? record.usageLimitPerUser
            : undefined,
      freeShipping: typeof record.freeShipping === 'boolean' ? record.freeShipping : undefined,
      published: typeof record.published === 'boolean' ? record.published : undefined,
      individualUse: typeof record.individualUse === 'boolean' ? record.individualUse : undefined,
      emailRestrictions: Array.isArray(record.emailRestrictions)
        ? (record.emailRestrictions.filter((item): item is string => typeof item === 'string') as string[])
        : typeof record.emailRestrictions === 'string' && record.emailRestrictions.trim()
          ? [record.emailRestrictions.trim()]
          : undefined,
    });
    return NextResponse.json({ coupon: { ...coupon, state: couponState(coupon) } });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = await parseId(context);
  if (!id) return NextResponse.json({ error: 'A coupon id is required.' }, { status: 400 });

  try {
    const coupon = await deleteWooCoupon(id);
    // Read back: the console refetches from the store, so a delete that the store
    // did not honour must not be reported as done.
    const remaining = await listWooCoupons();
    return NextResponse.json({
      coupon,
      remaining: remaining.length,
      stillPresent: remaining.some((row) => Number(row.id) === id),
    });
  } catch (error) {
    return failure(error);
  }
}
