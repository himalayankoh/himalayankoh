import { describe, it, expect } from 'vitest';
import { buildSalesDashboard } from './engine';
import type { WooOrderLike } from '@/lib/woo/orders';

describe('Sales Aggregation Engine', () => {
  const mockOrders: WooOrderLike[] = [
    // Paid retail order
    {
      id: 101,
      number: '101',
      status: 'processing',
      date_created_gmt: new Date().toISOString(),
      total: '100.00',
      shipping_total: '10.00',
      total_tax: '5.00',
      discount_total: '0.00',
      payment_method: 'stripe',
      billing: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      },
      line_items: [
        {
          id: 1,
          product_id: 50,
          name: 'Himalayan Shilajit Resin 50g',
          quantity: 2,
          price: 50,
          total: '100.00',
          sku: 'HK-SHIL-50',
        },
      ],
    },
    // Unpaid/pending order — must NOT count as revenue
    {
      id: 102,
      number: '102',
      status: 'pending',
      date_created_gmt: new Date().toISOString(),
      total: '250.00',
      shipping_total: '15.00',
      total_tax: '12.00',
      discount_total: '0.00',
      payment_method: 'cod',
      billing: {
        first_name: 'Pending',
        last_name: 'Buyer',
        email: 'pending@example.com',
      },
      line_items: [],
    },
    // Refunded order — must reduce revenue
    {
      id: 103,
      number: '103',
      status: 'refunded',
      date_created_gmt: new Date().toISOString(),
      total: '30.00',
      shipping_total: '5.00',
      total_tax: '2.00',
      discount_total: '0.00',
      payment_method: 'stripe',
      billing: {
        first_name: 'Refunded',
        last_name: 'Customer',
        email: 'refund@example.com',
      },
      line_items: [],
    },
  ];

  it('accurately counts paid orders and excludes unpaid orders from revenue', () => {
    const dashboard = buildSalesDashboard({
      orders: mockOrders,
      period: 'all',
    });

    // Order 101: $100 paid
    // Order 102: $250 pending -> 0
    // Order 103: $30 refunded -> $30 refunds
    expect(dashboard.revenue.grossRevenue).toBe(100);
    expect(dashboard.revenue.refunds).toBe(30);
    expect(dashboard.revenue.netRevenue).toBe(70);
    expect(dashboard.revenue.orderCount).toBe(1);
    expect(dashboard.revenue.aov).toBe(70);
  });

  it('correctly calculates Stripe gateway fees on paid card orders', () => {
    const dashboard = buildSalesDashboard({
      orders: mockOrders,
      period: 'all',
    });

    // For order 101 ($100 on stripe): fee is 100 * 0.029 + 0.30 = 3.20
    expect(dashboard.costs.gatewayFees).toBe(3.2);
    expect(dashboard.profit.netProfit).toBe(Math.round((70 - 3.2) * 100) / 100);
  });

  it('correctly incorporates wholesale orders and calculates pending balance', () => {
    const dashboard = buildSalesDashboard({
      orders: mockOrders,
      period: 'all',
      wholesaleOrders: [
        {
          id: 'ws-1',
          reference: 'WS-1001',
          companyName: 'Alpine Wellness LLC',
          status: 'CONFIRMED',
          currency: 'USD',
          total: 5000,
          depositCollected: 2000,
          balanceCollected: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(dashboard.wholesaleSummary.totalBooked).toBe(5000);
    expect(dashboard.wholesaleSummary.totalCollected).toBe(2000);
    expect(dashboard.wholesaleSummary.pendingBalance).toBe(3000);
    expect(dashboard.wholesaleSummary.orderCount).toBe(1);

    // Channel breakdown should show both retail and wholesale
    expect(dashboard.channelBreakdown).toHaveLength(2);
    const wsChannel = dashboard.channelBreakdown.find(c => c.channel === 'wholesale');
    expect(wsChannel).toBeDefined();
    expect(wsChannel?.revenue).toBe(2000);
  });

  it('computes today KPIs correctly', () => {
    const dashboard = buildSalesDashboard({
      orders: mockOrders,
      period: 'all',
    });

    expect(dashboard.todayKpis.paidRevenue).toBe(100);
    expect(dashboard.todayKpis.refunds).toBe(30);
    expect(dashboard.todayKpis.netRevenue).toBe(70);
    expect(dashboard.todayKpis.orderCount).toBe(1);
  });
});
