import { describe, expect, it } from 'vitest';

interface MockOrder {
  id: string;
  payment_status: string;
  status: string;
  label_url: string | null;
  tracking_number: string | null;
}

const ineligibleStatuses = new Set(['delivered', 'completed', 'shipped', 'cancelled', 'refunded', 'failed']);

function filterPendingOrders(orders: MockOrder[]): MockOrder[] {
  return orders.filter((order) => {
    if (order.label_url || order.tracking_number) return false;
    if (order.payment_status !== 'paid') return false;
    const status = String(order.status || '').toLowerCase();
    if (ineligibleStatuses.has(status)) return false;
    return true;
  });
}

function filterReadyOrders(orders: MockOrder[]): MockOrder[] {
  return orders.filter((order) => Boolean(order.label_url));
}

describe('shipping label eligibility rules (HK-03)', () => {
  it('excludes delivered orders from the pending label queue', () => {
    const orders: MockOrder[] = [
      { id: '2588', payment_status: 'paid', status: 'delivered', label_url: null, tracking_number: null },
      { id: '2589', payment_status: 'paid', status: 'completed', label_url: null, tracking_number: null },
      { id: '2590', payment_status: 'paid', status: 'processing', label_url: null, tracking_number: null },
    ];

    const pending = filterPendingOrders(orders);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('2590');
  });

  it('excludes shipped, cancelled, and refunded orders', () => {
    const orders: MockOrder[] = [
      { id: '1', payment_status: 'paid', status: 'shipped', label_url: null, tracking_number: '1Z999' },
      { id: '2', payment_status: 'paid', status: 'cancelled', label_url: null, tracking_number: null },
      { id: '3', payment_status: 'paid', status: 'refunded', label_url: null, tracking_number: null },
      { id: '4', payment_status: 'paid', status: 'failed', label_url: null, tracking_number: null },
      { id: '5', payment_status: 'unpaid', status: 'processing', label_url: null, tracking_number: null },
      { id: '6', payment_status: 'paid', status: 'processing', label_url: null, tracking_number: null },
    ];

    const pending = filterPendingOrders(orders);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('6');
  });

  it('places orders with label_url into ready queue only', () => {
    const orders: MockOrder[] = [
      { id: '10', payment_status: 'paid', status: 'processing', label_url: 'https://shippo.test/label.pdf', tracking_number: 'TRACK123' },
      { id: '11', payment_status: 'paid', status: 'processing', label_url: null, tracking_number: null },
    ];

    const ready = filterReadyOrders(orders);
    const pending = filterPendingOrders(orders);

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('10');
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('11');
  });
});
