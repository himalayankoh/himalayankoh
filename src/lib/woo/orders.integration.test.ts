/**
 * The order write path, exercised against the real store.
 *
 * Skipped unless `BACKEND_INTEGRATION=1` and WooCommerce credentials are present,
 * and it refuses to run unless the configured origin is the **staging** install,
 * so a misconfigured environment cannot turn this into a production write.
 *
 * What it proves, in order: an order can be created with an explicit line price; the
 * store's own totals come back and are what the app reports; the app's fulfilment
 * states (`shipped`, then `delivered`) round-trip through the store's status plus
 * `_hk_status` meta; tracking details persist; and the order can be removed so
 * nothing is left behind. The address it uses is a throwaway `.invalid` guest, so
 * no customer's history is touched.
 *
 * This is the test that has to exist before checkout can create orders in
 * WooCommerce: it is the only way to know the payload the store accepts is the one
 * this app sends, without a payment.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { backendConfig } from '../backend/config';
import { hasWooCommerceCredentials } from '../backend/credentials';
import {
  HK_META,
  appStatusFromWoo,
  createWooOrder,
  getWooOrder,
  getWooOrderForEmail,
  listWooOrders,
  listWooOrdersForEmail,
  orderFromWoo,
  orderWithItemsFromWoo,
  paymentStatusFromWoo,
  permanentlyDeleteWooOrder,
  setWooOrderShipping,
  trashWooOrder,
  updateWooOrderStatus,
} from './orders';
import { listWooProducts } from './productWrite';

const enabled = process.env.BACKEND_INTEGRATION === '1';
const isStaging = /himalayankoh\.com\/staging/.test(backendConfig.woocommerceBaseUrl);
const canRun = enabled && hasWooCommerceCredentials() && isStaging;

/** A guest address that cannot belong to a real customer. */
const TEST_EMAIL = 'acceptance-order-test@example.invalid';

describe.skipIf(!canRun)('WooCommerce order write path (live staging)', () => {
  let createdId: number | null = null;

  afterAll(async () => {
    if (createdId !== null) {
      await trashWooOrder(createdId).catch(() => undefined);
      await permanentlyDeleteWooOrder(createdId).catch(() => undefined);
    }
  });

  it('creates, reads, updates and removes a throwaway order', async () => {
    const products = await listWooProducts({ perPage: 20, status: 'publish' });
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];
    const productId = Number(product.id);
    expect(Number.isFinite(productId)).toBe(true);

    const created = await createWooOrder({
      email: TEST_EMAIL,
      phone: '8322246466',
      lineItems: [{ productId, quantity: 2, price: 9.95 }],
      billing: {
        first_name: 'Acceptance',
        last_name: 'Test',
        address_1: '12620 FM 1960 W Ste A-4',
        city: 'Houston',
        state: 'TX',
        postcode: '77065',
        country: 'US',
        email: TEST_EMAIL,
      },
      shipping: {
        first_name: 'Acceptance',
        last_name: 'Test',
        address_1: '12620 FM 1960 W Ste A-4',
        city: 'Houston',
        state: 'TX',
        postcode: '77065',
        country: 'US',
      },
      shippingMethod: 'standard',
      customerNote: 'TEST - DELETE ME - acceptance order',
      meta: { [HK_META.userId]: 'acceptance-test' },
      status: 'pending',
    });

    createdId = Number(created.id);
    expect(Number.isFinite(createdId)).toBe(true);

    // The store's own record: line total pinned to what we sent, times quantity.
    const lineTotal = Number((created as { line_items?: Array<{ total?: string }> }).line_items?.[0]?.total ?? 0);
    expect(lineTotal).toBeCloseTo(19.9, 2);

    const projected = orderFromWoo(created);
    expect(projected.id).toBe(String(createdId));
    expect(projected.email).toBe(TEST_EMAIL);
    expect(projected.status).toBe('pending');
    expect(projected.total).toBeCloseTo(Number(created.total ?? 0), 2);

    // The lines come through the console's own projection, which is what the
    // order drawer renders.
    const withItems = orderWithItemsFromWoo(created);
    expect(withItems.order_items.length).toBe(1);
    expect(withItems.order_items[0].quantity).toBe(2);

    // It is readable through the console's own list, with the app's status.
    const listed = await listWooOrders({ perPage: 100, search: TEST_EMAIL });
    expect(listed.orders.some((order) => Number(order.id) === createdId)).toBe(true);

    // Fulfilment: a state WooCommerce has no status for goes in meta, and reads back.
    const shipped = await updateWooOrderStatus(createdId, { status: 'shipped' });
    expect(appStatusFromWoo(shipped)).toBe('shipped');
    const rereadShipped = await getWooOrder(createdId);
    expect(appStatusFromWoo(rereadShipped)).toBe('shipped');

    const delivered = await updateWooOrderStatus(createdId, { status: 'delivered', paymentStatus: 'paid' });
    expect(appStatusFromWoo(delivered)).toBe('delivered');
    expect(paymentStatusFromWoo(delivered)).toBe('paid');

    // Tracking persists where the app reads it.
    const tracked = await setWooOrderShipping(createdId, {
      trackingNumber: '9400111899560000000000',
      trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899560000000000',
      carrier: 'USPS',
      service: 'Priority',
    });
    const trackedProjected = orderFromWoo(tracked);
    expect(trackedProjected.tracking_number).toBe('9400111899560000000000');
    expect(trackedProjected.shipping_carrier).toBe('USPS');

    // The identity bridge the account screen will use: an email finds the guest
    // order, and an order is only returned to the address that owns it.
    const byEmail = await listWooOrdersForEmail(TEST_EMAIL);
    expect(byEmail.orders.some((order) => Number(order.id) === createdId)).toBe(true);
    expect(await getWooOrderForEmail(createdId, TEST_EMAIL)).not.toBeNull();
    expect(await getWooOrderForEmail(createdId, 'someone-else@example.invalid')).toBeNull();

    // Finally: the store refuses nothing, but we trash and remove it either way.
    await trashWooOrder(createdId);
    const afterTrash = await getWooOrder(createdId).catch(() => null);
    expect(afterTrash?.status).toBe('trash');

    await permanentlyDeleteWooOrder(createdId);
    createdId = null;
    await expect(getWooOrder(Number(created.id))).rejects.toThrow(/No order|could not be read/i);
  }, 120_000);
});
