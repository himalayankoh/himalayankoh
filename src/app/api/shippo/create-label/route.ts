/**
 * Buying a shipping label for an order.
 *
 * The order is read from WooCommerce — its shipping address, its line items and the
 * rate/method the customer chose — and everything the carrier returns is written
 * back to *that* order: the tracking number and label in order meta (which is where
 * this app's other order facts live), the fulfilment state as the app status, and
 * the label's cost as a WooCommerce order note, which is where an operator already
 * reads an order's history.
 *
 * Nothing here needs Supabase. It used to read and write the app's own order row,
 * which is why a label bought for a WooCommerce order was invisible in the store.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { dispatchOrderShippedNotifications } from '@/lib/orders/notifyOrderEvents';
import { UnsupportedPackingProductsError } from '@/lib/shippo/packing/errors';
import { resolveShippoConfigError } from '@/lib/shippo/config';
import { formatShippoLabelError, isRetryableLabelError } from '@/lib/shippo/carrierErrors';
import { normalizeOrderShippingAddress } from '@/lib/shippo/normalizeAddress';
import { purchaseShippoLabel } from '@/lib/shippo/server/labels';
import {
  fetchShippoRatesForOrder,
  pickRateCandidatesForLabel,
  splitShippoRateIds,
} from '@/lib/shippo/server/rates';
import type { CheckoutShippingAddress, RatesLineItem, ShippoLabelResult } from '@/lib/shippo/types';
import {
  HK_META,
  addWooOrderNote,
  getWooOrder,
  orderFromWoo,
  readWooOrderMeta,
  setWooOrderShipping,
  updateWooOrderStatus,
  type WooOrderLike,
} from '@/lib/woo/orders';

/** The order's shippable lines, as the rate engine wants them. */
function buildOrderLineItems(order: WooOrderLike): RatesLineItem[] {
  return (order.line_items ?? [])
    .map((line) => ({
      productId: String(line.variation_id ?? line.product_id ?? ''),
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 0)),
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const configError = await resolveShippoConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const rawOrderId = typeof record.orderId === 'string' ? record.orderId.trim() : String(record.orderId ?? '');
  const orderId = Number(rawOrderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json(
      { error: 'A WooCommerce order id is required. Orders are read from the store, so their ids are the store’s own.' },
      { status: 400 }
    );
  }

  try {
    const order = await getWooOrder(orderId);
    const projected = orderFromWoo(order);

    const existingTracking = projected.tracking_number;
    const existingLabel = projected.label_url;
    if (existingTracking && existingLabel) {
      return NextResponse.json({
        ok: true,
        alreadyCreated: true,
        trackingNumber: existingTracking,
        labelUrl: existingLabel,
      });
    }

    const shippingAddress = normalizeOrderShippingAddress(
      projected.shipping_address as unknown as CheckoutShippingAddress
    );
    if (!shippingAddress) {
      return NextResponse.json(
        { error: 'Order shipping address is incomplete. Update the order address before creating a label.' },
        { status: 422 },
      );
    }

    const lineItems = buildOrderLineItems(order);
    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: 'Order has no shippable line items. Check the order items in WooCommerce.' },
        { status: 422 },
      );
    }

    const shippingMethod = readWooOrderMeta(order, HK_META.shippingMethod) === 'expedited' ? 'expedited' : 'standard';
    const checkoutRateId = readWooOrderMeta(order, HK_META.shippoRateId);

    // Each box is rated and labeled separately (USPS rejects multi-parcel
    // shipments and boxes over 70 lbs), so no consolidation here.
    const rates = await fetchShippoRatesForOrder({
      email: projected.email,
      shippingAddress,
      lineItems,
      consolidateParcels: false,
    });

    if (rates.length === 0) {
      return NextResponse.json(
        {
          error:
            'No Shippo rates available for this order. Confirm the shipping address and product weights, then try again.',
        },
        { status: 502 },
      );
    }

    const candidates = pickRateCandidatesForLabel(rates, shippingMethod);
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No Shippo rates available for this order.' }, { status: 502 });
    }

    // A composite candidate ("id1+id2+...") means one label per box.
    let labels: ShippoLabelResult[] | null = null;
    let usedRateId: string | null = null;
    let lastError: Error | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidateId = candidates[index];
      const rateIds = splitShippoRateIds(candidateId);
      const purchased: ShippoLabelResult[] = [];
      try {
        for (const rateId of rateIds) {
          purchased.push(await purchaseShippoLabel(rateId, String(orderId)));
        }
        labels = purchased;
        usedRateId = candidateId;
        break;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unable to create shipping label.');
        if (purchased.length > 0) {
          // Partial purchase — do not retry another carrier or labels would double up.
          lastError = new Error(
            `${error.message} — ${purchased.length} of ${rateIds.length} labels were already purchased ` +
              `(tracking: ${purchased.map((label) => label.trackingNumber).join(', ')}). ` +
              'Check your Shippo dashboard before retrying.',
          );
          break;
        }
        lastError = error;
        const canRetry = index < candidates.length - 1 && isRetryableLabelError(error.message);
        if (!canRetry) break;
      }
    }

    if (!labels || labels.length === 0 || !usedRateId) {
      throw lastError ?? new Error('Unable to create shipping label.');
    }

    const pickedRate = rates.find((rate) => rate.objectId === usedRateId);
    const usedFallback = usedRateId !== checkoutRateId;
    const primary = labels[0];
    const trackingNumbers = labels.map((label) => label.trackingNumber);

    // The tracking number is what the customer's tracker reads, so it is written
    // first and its failure is fatal to this request; the store's fulfilment state
    // follows it.
    await setWooOrderShipping(orderId, {
      trackingNumber: trackingNumbers.join(', '),
      trackingUrl: primary.trackingUrl,
      labelUrl: primary.labelUrl,
      shippoRateId: usedRateId,
      shippoTransactionId: labels.map((label) => label.transactionId).join(','),
      carrier: primary.carrier,
      service: primary.serviceName,
    });
    await updateWooOrderStatus(orderId, { status: 'shipped' });

    if (pickedRate) {
      await addWooOrderNote(
        orderId,
        `Shipping label cost: $${pickedRate.amount.toFixed(2)} via ${primary.carrier} ${primary.serviceName}` +
          (labels.length > 1 ? ` (${labels.length} boxes)` : '')
      );
    }

    dispatchOrderShippedNotifications(String(orderId));

    return NextResponse.json({
      ok: true,
      orderId: String(orderId),
      orderNumber: projected.order_number,
      trackingNumber: trackingNumbers.join(', '),
      trackingNumbers,
      trackingUrl: primary.trackingUrl,
      labelUrl: primary.labelUrl,
      labelUrls: labels.map((label) => label.labelUrl),
      carrier: primary.carrier,
      serviceName: primary.serviceName,
      rateAmount: pickedRate?.amount ?? null,
      parcelCount: labels.length,
      usedFallbackCarrier: usedFallback,
      checkoutCarrier: pickedRate?.provider ?? null,
    });
  } catch (error) {
    if (error instanceof UnsupportedPackingProductsError) {
      return NextResponse.json(
        {
          error: `${error.message} Update the cart or add a packing rule before creating a label.`,
          unsupportedProducts: true,
          products: error.products,
        },
        { status: 422 },
      );
    }
    console.error('Shippo label creation failed:', error);
    const message = error instanceof Error ? error.message : 'Unable to create shipping label.';
    return NextResponse.json(
      { error: message, carrierError: formatShippoLabelError(message) },
      { status: 502 },
    );
  }
}
