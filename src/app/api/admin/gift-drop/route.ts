import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSetting, upsertSettings } from '@/lib/settings/serverSettings';
import { orderFromWoo, listWooOrders } from '@/lib/woo/orders';

export const dynamic = 'force-dynamic';

const CATEGORY = 'campaigns';
const KEY = 'gift_drop_campaign_v1';

/**
 * How many recent orders the claims list is counted from.
 *
 * WooCommerce's REST v3 cannot search by order-number substring, so a claim is
 * found by reading a recent window and matching its number. The window is stated on
 * the response for the same reason the store dashboard states its own: a count that
 * silently reports a sample as a total is worse than one that says how far it
 * looked.
 */
const CLAIM_WINDOW = 100;

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let campaign = null;
  try {
    const raw = await getSetting(CATEGORY, KEY);
    if (raw) {
      campaign = JSON.parse(raw);
    }
  } catch {
    campaign = null;
  }

  // Claims are orders in the store, read the same way every other order screen
  // reads them. A store that cannot be reached yields no claims rather than a
  // fabricated list.
  let claims: unknown[] = [];
  try {
    const { orders } = await listWooOrders({ perPage: CLAIM_WINDOW, page: 1 });
    const giftOrders = orders.filter((order) => {
      const number = String(order.number ?? order.id);
      return /gift/i.test(number) || order.line_items?.some((line) => /gift/i.test(line.name ?? ''));
    });

    claims = giftOrders.map((wooOrder) => {
      // The store's own projection, so a gift claim shows the same status, total
      // and tracking an ordinary order does.
      const order = orderFromWoo(wooOrder);
      const address = (order.shipping_address ?? {}) as Record<string, string | undefined>;
      return {
        id: order.id,
        orderNumber: order.order_number,
        email: order.email || '—',
        name: address.fullName || 'Recipient',
        status: order.status,
        createdAt: order.created_at,
        address: {
          line1: address.addressLine1 || '',
          city: address.city || '',
          state: address.state || '',
          zip: address.postalCode || '',
        },
        // The gift is the order's first line — WooCommerce has no separate
        // "campaign gift" field, and inventing one would be a second truth.
        giftName: wooOrder.line_items?.[0]?.name || campaign?.giftName || 'Promotional Gift Drop',
        payment: order.payment_status === 'paid' ? 'Paid' : 'Free ($0.00)',
        isTest: false,
        tracking: order.tracking_number
          ? { carrier: order.shipping_carrier || 'USPS', number: order.tracking_number }
          : null,
        totalCents: Math.round(order.total * 100),
      };
    });
  } catch (error) {
    console.error('Gift-drop claims could not be read from the store:', error);
    claims = [];
  }

  const total = campaign?.totalQuantity ?? 0;
  const claimed = claims.length;
  const remaining = Math.max(0, total - claimed);

  return NextResponse.json({
    campaign,
    claims,
    stats: {
      total,
      claimed,
      remaining,
      // How many recent orders the claimed figure was counted from.
      window: CLAIM_WINDOW,
    },
  });
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action || '');

  if (action === 'campaign') {
    const campaignData = {
      title: String(body.title || 'Himalayan Koh Gift Drop'),
      message: String(body.message || ''),
      giftName: String(body.giftName || 'Himalayan Pink Salt Sample'),
      giftValueCents: Number(body.giftValueCents) || 0,
      totalQuantity: Math.max(0, Number(body.totalQuantity) || 100),
      active: Boolean(body.active),
      startsAt: body.startsAt ? String(body.startsAt) : new Date().toISOString(),
      endsAt: body.endsAt ? String(body.endsAt) : null,
    };

    try {
      await upsertSettings(CATEGORY, { [KEY]: JSON.stringify(campaignData) });
      return NextResponse.json({ ok: true, campaign: campaignData });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not save campaign configuration.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
