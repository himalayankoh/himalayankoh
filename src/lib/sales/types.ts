/**
 * Himalayan Koh Sales — type definitions.
 *
 * ## Source of truth
 *
 * Every number here comes from WooCommerce order records, not from a
 * parallel database. Revenue is the sum of orders the store recorded
 * as paid; unpaid orders are never counted as revenue.
 *
 * ## Two channels
 *
 * Retail orders live in WooCommerce. Wholesale orders come from the
 * wholesale module's own quote→order pipeline. Both are surfaced in
 * the Sales module, but they are separate channels with separate
 * margin structures.
 */

/* ------------------------------------------------------------------ */
/* Time periods                                                        */
/* ------------------------------------------------------------------ */

export type SalesPeriod = 'today' | '7d' | '30d' | '90d' | '12m' | 'ytd' | 'all';

export interface DateRange {
  from: string; // ISO date
  to: string;   // ISO date
}

/* ------------------------------------------------------------------ */
/* Revenue & Profit                                                    */
/* ------------------------------------------------------------------ */

export type SalesChannel = 'retail' | 'wholesale' | 'all';

export interface RevenueSummary {
  /** Gross revenue from paid orders only. */
  grossRevenue: number;
  /** Total refunds issued. */
  refunds: number;
  /** grossRevenue - refunds */
  netRevenue: number;
  /** Total shipping collected. */
  shippingRevenue: number;
  /** Total tax collected. */
  taxCollected: number;
  /** Total discounts applied. */
  discountsGiven: number;
  /** Number of orders counted. */
  orderCount: number;
  /** Average order value (paid orders). */
  aov: number;
  /** Currency code. */
  currency: string;
}

export interface CostSummary {
  /** Product cost / COGS — only when product cost meta is available. */
  cogs: number;
  /** Shipping expenses (what HK paid to ship, not what customer paid). */
  shippingCost: number;
  /** Payment gateway fees (Stripe %). */
  gatewayFees: number;
  /** Other business expenses (manually recorded). */
  otherExpenses: number;
  /** Total of all costs. */
  totalCosts: number;
}

export interface ProfitSummary {
  netRevenue: number;
  totalCosts: number;
  /** netRevenue - totalCosts */
  grossProfit: number;
  /** grossProfit / netRevenue * 100 */
  grossMarginPct: number;
  /** After deducting manually-entered fixed expenses. */
  netProfit: number;
  netMarginPct: number;
}

/* ------------------------------------------------------------------ */
/* Order-level financial view                                          */
/* ------------------------------------------------------------------ */

export interface SalesOrderRow {
  id: string;
  orderNumber: string;
  channel: SalesChannel;
  date: string;
  customerName: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  refundedAmount: number;
  netTotal: number;
  currency: string;
  itemCount: number;
  items: SalesOrderItemRow[];
}

export interface SalesOrderItemRow {
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/* ------------------------------------------------------------------ */
/* Payment reconciliation                                              */
/* ------------------------------------------------------------------ */

export type ReconciliationStatus = 'matched' | 'unmatched' | 'partial' | 'overpaid';

export interface PaymentRecord {
  orderId: string;
  orderNumber: string;
  date: string;
  expectedAmount: number;
  receivedAmount: number;
  gatewayFee: number;
  netReceived: number;
  status: ReconciliationStatus;
  paymentMethod: string;
  transactionId: string | null;
  currency: string;
}

/* ------------------------------------------------------------------ */
/* Daily / period aggregation                                          */
/* ------------------------------------------------------------------ */

export interface DailySalesPoint {
  date: string;
  revenue: number;
  orders: number;
  refunds: number;
  netRevenue: number;
}

/* ------------------------------------------------------------------ */
/* Expense tracking (manual entries persisted in localStorage)         */
/* ------------------------------------------------------------------ */

export interface ManualExpense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  recurring: boolean;
  createdAt: string;
}

export type ExpenseCategory =
  | 'shipping'
  | 'packaging'
  | 'marketing'
  | 'software'
  | 'salary'
  | 'rent'
  | 'utilities'
  | 'supplier_payment'
  | 'gateway_fee'
  | 'tax_payment'
  | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  shipping: 'Shipping & Freight',
  packaging: 'Packaging & Materials',
  marketing: 'Marketing & Ads',
  software: 'Software & Tools',
  salary: 'Salaries & Wages',
  rent: 'Rent & Facilities',
  utilities: 'Utilities',
  supplier_payment: 'Supplier Payments',
  gateway_fee: 'Gateway Fees',
  tax_payment: 'Tax Payments',
  other: 'Other',
};

export interface WholesaleFinancialSummary {
  totalBooked: number;
  totalCollected: number;
  pendingBalance: number;
  orderCount: number;
}

export interface TodayKpiSummary {
  paidRevenue: number;
  orderCount: number;
  refunds: number;
  netRevenue: number;
  aov: number;
}

export interface SalesDashboardData {
  period: SalesPeriod;
  dateRange: DateRange;
  revenue: RevenueSummary;
  costs: CostSummary;
  profit: ProfitSummary;
  dailySeries: DailySalesPoint[];
  orders: SalesOrderRow[];
  payments: PaymentRecord[];
  topProducts: { name: string; revenue: number; quantity: number; sku: string | null }[];
  topCustomers: { name: string; email: string; revenue: number; orders: number }[];
  channelBreakdown: { channel: SalesChannel; revenue: number; orders: number; aov: number }[];
  wholesaleSummary: WholesaleFinancialSummary;
  todayKpis: TodayKpiSummary;
  ordersScanned: number;
  windowCapped: boolean;
}

/* ------------------------------------------------------------------ */
/* Export types                                                         */
/* ------------------------------------------------------------------ */

export type ExportFormat = 'csv' | 'xlsx';
export type ExportScope = 'orders' | 'revenue' | 'expenses' | 'payments' | 'full';
