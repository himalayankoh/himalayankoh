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

  it('matches deterministic profit example: Paid 100, Refund 10, COGS 35, Shipping 8, Fee 3, Other 2 -> Net 90, Profit 42, Margin 46.67%', () => {
    const deterministicOrders: WooOrderLike[] = [
      {
        id: 201,
        number: '201',
        status: 'processing',
        date_created_gmt: new Date().toISOString(),
        date_paid_gmt: new Date().toISOString(),
        total: '100.00',
        payment_method: 'manual', // no auto stripe calculation
        line_items: [],
      },
      {
        id: 202,
        number: '202',
        status: 'refunded',
        date_created_gmt: new Date().toISOString(),
        total: '10.00',
        payment_method: 'manual',
        line_items: [],
      },
    ];

    const deterministicExpenses = [
      { id: '1', date: new Date().toISOString().slice(0, 10), category: 'supplier_payment' as const, description: 'COGS', amount: 35, currency: 'USD', recurring: false, createdAt: '' },
      { id: '2', date: new Date().toISOString().slice(0, 10), category: 'shipping' as const, description: 'Actual Shipping', amount: 8, currency: 'USD', recurring: false, createdAt: '' },
      { id: '3', date: new Date().toISOString().slice(0, 10), category: 'gateway_fee' as const, description: 'Payment Fee', amount: 3, currency: 'USD', recurring: false, createdAt: '' },
      { id: '4', date: new Date().toISOString().slice(0, 10), category: 'other' as const, description: 'Other Direct Cost', amount: 2, currency: 'USD', recurring: false, createdAt: '' },
    ];

    const dashboard = buildSalesDashboard({
      orders: deterministicOrders,
      period: 'all',
      manualExpenses: deterministicExpenses,
    });

    expect(dashboard.revenue.grossRevenue).toBe(100);
    expect(dashboard.revenue.refunds).toBe(10);
    expect(dashboard.revenue.netRevenue).toBe(90);
    expect(dashboard.costs.cogs).toBe(35);
    expect(dashboard.costs.shippingCost).toBe(8);
    expect(dashboard.costs.gatewayFees).toBe(3);
    expect(dashboard.costs.otherExpenses).toBe(2);
    expect(dashboard.costs.totalCosts).toBe(48);
    expect(dashboard.profit.netProfit).toBe(42);
    expect(dashboard.profit.netMarginPct).toBe(46.67);
  });

  it('accurately reconciles Retail Mock Order #2639 with snapshotted financial metadata', () => {
    const order2639: WooOrderLike = {
      id: 2639,
      number: '2639',
      status: 'processing',
      date_created_gmt: '2026-09-25T16:00:00Z',
      date_paid_gmt: '2026-09-25T16:00:00Z',
      total: '99.90',
      shipping_total: '0.00',
      total_tax: '0.00',
      discount_total: '0.00',
      payment_method: 'stripe',
      billing: {
        first_name: 'TEST SALES',
        last_name: 'DEMO 1',
        email: 'salman@himalayankoh.com',
      },
      line_items: [
        {
          id: 277,
          product_id: 2497,
          name: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)',
          sku: 'HK-LFC-45lbs',
          quantity: 2,
          price: 49.95,
          total: '99.90',
          meta_data: [
            { key: '_unit_cost', value: '17.50' },
            { key: '_line_cogs', value: '35.00' },
            { key: '_cogs_source', value: 'manual' },
          ],
        },
      ],
      meta_data: [
        { key: '_hk_cogs', value: '35.00' },
        { key: '_hk_cogs_source', value: 'manual' },
        { key: '_hk_shipping_cost', value: '8.00' },
        { key: '_hk_shipping_cost_source', value: 'manual' },
        { key: '_hk_payment_fee', value: '3.00' },
        { key: '_hk_payment_fee_source', value: 'manual' },
        { key: '_hk_other_expense', value: '2.00' },
        { key: '_hk_other_expense_source', value: 'manual' },
        { key: '_hk_net_profit', value: '51.90' },
        { key: '_hk_profit_margin', value: '51.95' },
        { key: '_hk_financial_snapshotted', value: 'true' },
      ],
    };

    const dashboard = buildSalesDashboard({
      orders: [order2639],
      period: 'all',
    });

    const row = dashboard.orders[0];
    expect(row).toBeDefined();
    expect(row.orderNumber).toBe('2639');
    expect(row.total).toBe(99.90);
    expect(row.refundedAmount).toBe(0.00);
    expect(row.netTotal).toBe(99.90);
    expect(row.cogs).toBe(35.00);
    expect(row.cogsSource).toBe('manual');
    expect(row.actualShippingCost).toBe(8.00);
    expect(row.shippingCostSource).toBe('manual');
    expect(row.paymentFee).toBe(3.00);
    expect(row.paymentFeeSource).toBe('manual');
    expect(row.otherExpense).toBe(2.00);
    expect(row.otherExpenseSource).toBe('manual');
    expect(row.totalCosts).toBe(48.00);
    expect(row.netProfit).toBe(51.90);
    expect(row.profitMarginPct).toBe(51.95);
    expect(row.isSnapshotted).toBe(true);

    // Overview KPIs match exactly
    expect(dashboard.revenue.netRevenue).toBe(99.90);
    expect(dashboard.costs.cogs).toBe(35.00);
    expect(dashboard.costs.shippingCost).toBe(8.00);
    expect(dashboard.costs.gatewayFees).toBe(3.00);
    expect(dashboard.costs.otherExpenses).toBe(2.00);
    expect(dashboard.costs.totalCosts).toBe(48.00);
    expect(dashboard.profit.netProfit).toBe(51.90);
    expect(dashboard.profit.netMarginPct).toBe(51.95);
    expect(dashboard.profit.hasIncompleteProfit).toBe(false);
  });

  it('automatically sources product catalog cost when snapshotted order meta is not present', () => {
    const rawOrder: WooOrderLike = {
      id: 3001,
      number: '3001',
      status: 'processing',
      date_created_gmt: new Date().toISOString(),
      total: '49.95',
      payment_method: 'stripe',
      line_items: [
        {
          id: 1,
          product_id: 2497,
          name: 'Himalayan Rock Salt — 45 lbs',
          quantity: 1,
          price: 49.95,
          total: '49.95',
        },
      ],
    };

    const catalogCostMap = new Map<number, number>([[2497, 34.75]]);

    const dashboard = buildSalesDashboard({
      orders: [rawOrder],
      period: 'all',
      catalogCostMap,
    });

    const row = dashboard.orders[0];
    expect(row.cogs).toBe(34.75);
    expect(row.cogsStatus).toBe('verified');
    expect(row.cogsSource).toBe('auto');
    expect(row.isSnapshotted).toBe(false);
  });

  it('honestly marks orders with unknown COGS as missing rather than pretending 100% margin', () => {
    const uncostedOrder: WooOrderLike = {
      id: 3002,
      number: '3002',
      status: 'processing',
      date_created_gmt: new Date().toISOString(),
      total: '100.00',
      payment_method: 'stripe',
      line_items: [
        {
          id: 1,
          product_id: 9999, // not in catalog map
          name: 'Unknown Mystery Product',
          quantity: 1,
          price: 100.00,
          total: '100.00',
        },
      ],
    };

    const dashboard = buildSalesDashboard({
      orders: [uncostedOrder],
      period: 'all',
    });

    const row = dashboard.orders[0];
    expect(row.cogs).toBeNull();
    expect(row.cogsStatus).toBe('missing');
    expect(row.netProfit).toBeNull();
    expect(row.profitMarginPct).toBeNull();
    expect(dashboard.profit.hasIncompleteProfit).toBe(true);
    expect(dashboard.profit.missingCogsCount).toBe(1);
  });
});
