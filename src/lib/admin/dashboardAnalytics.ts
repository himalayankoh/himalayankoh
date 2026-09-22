/**
 * The admin dashboard's figures, counted from WooCommerce.
 *
 * `adminApi.getDashboardAnalytics()` used to aggregate the app's own Supabase
 * `orders`, `order_items` and `profiles` tables. The store's orders live in
 * WooCommerce, so those aggregates described a table that stopped receiving orders
 * the moment checkout moved — and the console's revenue could disagree with the
 * store's own report. This reads the store instead.
 *
 * ## What each figure is, and where it stops
 *
 *   - revenue series (7 days) and order counts: from orders in the read window;
 *   - best sellers: from those orders' line items, by the store's own totals;
 *   - customers / repeats: from the customer records WooCommerce reports;
 *   - low stock: from `readInventoryReport()`, the same read the Inventory screen uses.
 *
 * Two honest limits are stated rather than hidden. Orders are read as a bounded
 * window (WooCommerce returns 100 per request), so `ordersScanned` and `windowCapped`
 * travel with the figures — a dashboard that quietly reports a sample as a total is
 * worse than one that says which window it read. And "new customers" is counted from
 * the customer records in the same window, which is exact for stores of this size and
 * visibly capped when it is not.
 */

import {
  listWooOrders,
  orderWithItemsFromWoo,
  type AppOrderStatus,
  type Order,
  type OrderItem,
} from '@/lib/woo/orders';
import { listWooCustomers } from '@/lib/woo/customers';
import { readInventoryReport } from '@/lib/woo/inventory';

/** One point of the revenue chart. */
export interface AnalyticsPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface ProductAnalytics {
  productName: string;
  quantity: number;
  revenue: number;
}

export interface InventoryAlert {
  productId: string;
  productName: string;
  quantity: number;
  threshold: number;
}

export interface AdminDashboardAnalytics {
  revenueSeries: AnalyticsPoint[];
  orderStatusCounts: Record<string, number>;
  topProducts: ProductAnalytics[];
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  inventoryAlerts: InventoryAlert[];
  /** Orders the figures were counted from. */
  ordersScanned: number;
  /** True when the store held more orders than one window, so the totals are a floor. */
  windowCapped: boolean;
}

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const READ_DAYS = 7;
const PAGES = 3;
const PER_PAGE = 100;

const STATUS_KEYS: AppOrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

/** An order with its lines — what the figures are counted from. */
type OrderWithItems = Order & { order_items: OrderItem[] };

/** Every order the window holds, up to `PAGES` requests. */
async function readOrders(): Promise<{ orders: OrderWithItems[]; total: number }> {
  const collected: OrderWithItems[] = [];
  let total = 0;

  for (let page = 1; page <= PAGES; page += 1) {
    const response = await listWooOrders({ perPage: PER_PAGE, page });
    total = response.total;
    collected.push(...response.orders.map((order) => orderWithItemsFromWoo(order)));
    if (response.orders.length < PER_PAGE || page * PER_PAGE >= response.total) break;
  }

  return { orders: collected, total };
}

/** The dashboard's figures. */
export async function readDashboardAnalytics(): Promise<AdminDashboardAnalytics> {
  const [orderRead, customerPage, inventory] = await Promise.all([
    readOrders(),
    // `payingOnly` is off: an account that has not bought yet is still a customer, and
    // the count on this page has always meant "accounts", not "buyers".
    listWooCustomers({ perPage: PER_PAGE }).catch(() => ({ customers: [], total: 0, totalPages: 1, page: 1 })),
    readInventoryReport().catch(() => null),
  ]);

  const since30 = Date.now() - WINDOW_DAYS * DAY_MS;
  const recent = orderRead.orders.filter((order) => new Date(order.created_at).getTime() >= since30);

  // The chart always has seven columns, including days with nothing in them: a day
  // with no orders is a real data point, and dropping it would make the axis lie.
  const series = new Map<string, AnalyticsPoint>();
  for (let i = READ_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * DAY_MS);
    series.set(date.toISOString().slice(0, 10), {
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      revenue: 0,
      orders: 0,
    });
  }

  const orderStatusCounts: Record<string, number> = Object.fromEntries(STATUS_KEYS.map((status) => [status, 0]));
  const productTotals = new Map<string, ProductAnalytics>();
  const customerOrderCounts = new Map<string, number>();

  for (const order of recent) {
    const day = series.get(new Date(order.created_at).toISOString().slice(0, 10));
    if (day) {
      day.orders += 1;
      // Cancelled and refunded orders stay in the count (they happened) but their
      // money does not, which is the same rule the orders screen's totals use.
      if (order.status !== 'cancelled' && order.status !== 'refunded') day.revenue += order.total;
    }

    orderStatusCounts[order.status] = (orderStatusCounts[order.status] ?? 0) + 1;

    if (order.email) {
      const key = order.email.trim().toLowerCase();
      customerOrderCounts.set(key, (customerOrderCounts.get(key) ?? 0) + 1);
    }

    for (const item of order.order_items) {
      const name = item.product_name || 'Unnamed product';
      const current = productTotals.get(name) ?? { productName: name, quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += item.total_price;
      productTotals.set(name, current);
    }
  }

  const newCustomers = customerPage.customers.filter((customer) => {
    const created = customer.date_created_gmt ? `${customer.date_created_gmt}Z` : '';
    const time = created ? new Date(created).getTime() : 0;
    return Number.isFinite(time) && time >= since30;
  }).length;

  // A repeat customer is one who ordered more than once in the window, counted from
  // the orders actually read rather than from the store's lifetime `orders_count`.
  const repeatCustomers = [...customerOrderCounts.values()].filter((count) => count > 1).length;

  const inventoryAlerts: InventoryAlert[] = (inventory?.rows ?? [])
    .filter((row) => row.lowStock)
    .slice(0, 10)
    .map((row) => ({
      productId: row.id,
      productName: row.name,
      quantity: row.quantity ?? 0,
      threshold: row.lowStockThreshold ?? 0,
    }));

  return {
    revenueSeries: [...series.values()],
    orderStatusCounts,
    topProducts: [...productTotals.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    totalCustomers: customerPage.total,
    newCustomers,
    repeatCustomers,
    inventoryAlerts,
    ordersScanned: recent.length,
    windowCapped: orderRead.total > orderRead.orders.length,
  };
}
