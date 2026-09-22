import { describe, expect, it } from 'vitest';
import { checkoutCartIssues } from './serverCreateOrder';
import { validateVerifyPaymentBody } from '@/lib/stripe/server/validation';

type Item = any;

function item(product: any, quantity = 1): Item {
  return { id: `cart-${product.name}`, product_id: product.id, quantity, product };
}

const publicProduct = {
  id: 'p-1',
  name: 'Salt Block',
  price: 25,
  is_active: true,
  inventory: { quantity: 5, reserved_quantity: 0, track_inventory: true, allow_backorder: false },
};

describe('checkout eligibility', () => {
  it('rejects an out-of-stock product before payment', () => {
    const issues = checkoutCartIssues([item({ ...publicProduct, inventory: { ...publicProduct.inventory, quantity: 0 } })]);
    expect(issues[0]?.message).toContain('only 0 available');
  });

  it('rejects an unpublished product before payment', () => {
    const issues = checkoutCartIssues([item({ ...publicProduct, is_active: false })]);
    expect(issues[0]?.message).toContain('unavailable');
  });

  it('does not refuse a product merely for lacking a packing profile', () => {
    // The packing-profile gate was a Supabase-era rule applied to its own `tags`
    // column, and the cart is WooCommerce's: a missing profile means the parcel is
    // rated from the product's weight, not that the customer cannot buy it. The
    // store already refuses a line it will not sell, and a guard here that invented
    // a second, stricter rule would block checkout on a field the store does not
    // require.
    const issues = checkoutCartIssues([item({ ...publicProduct, tags: [] })]);
    expect(issues).toEqual([]);
  });

  it('rejects quantities above available stock', () => {
    const issues = checkoutCartIssues([item(publicProduct, 6)]);
    expect(issues[0]?.message).toContain('only 5 available');
  });
});

describe('payment verification boundary', () => {
  it('does not accept an order id from the browser as payment authority', () => {
    const result = validateVerifyPaymentBody({ orderId: 'fake-order', paymentIntentId: 'pi_test' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ paymentIntentId: 'pi_test' });
  });

  it('rejects payment verification without a Stripe PaymentIntent', () => {
    const result = validateVerifyPaymentBody({ orderId: 'fake-order' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
