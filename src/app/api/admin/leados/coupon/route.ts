import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { findCouponByCode } from '@/lib/woo/coupons';

export const runtime = 'edge';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const coupon = await findCouponByCode('welcome5');
    if (!coupon) {
      return NextResponse.json({
        ok: true,
        coupon: null,
        active: false,
        message: 'Coupon welcome5 is not found in WooCommerce.',
      });
    }

    const isActive = coupon.status === 'publish';
    return NextResponse.json({
      ok: true,
      active: isActive,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        amount: coupon.amount,
        discountType: coupon.discount_type,
        description: coupon.description,
        status: coupon.status,
        individualUse: coupon.individual_use,
        usageLimitPerUser: coupon.usage_limit_per_user,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query WooCommerce coupon';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
