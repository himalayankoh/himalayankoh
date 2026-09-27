/** Shared, pure reporting over authoritative financial rows; no network or browser storage. */
import { computeCosts, computeProfit } from "./summary";
import type { SalesOrderRow, ManualExpense, RevenueSummary } from "./types";
export function summarizeRetail(
  rows: SalesOrderRow[],
  expenses: ManualExpense[],
  currency: string,
) {
  const retail = rows.filter(
    (r) => r.channel === "retail" && r.currency === currency,
  );
  const paid = retail.filter((r) => r.paymentStatus === "paid");
  const sum = (key: "total" | "shipping" | "tax" | "discount") =>
    paid.reduce((a, r) => a + r[key], 0);
  const grossRevenue = sum("total");
  const refunds = retail
    .filter((r) => r.paymentStatus === "refunded" || r.status === "refunded")
    .reduce((a, r) => a + r.total, 0);
  const netRevenue = grossRevenue - refunds;
  const revenue: RevenueSummary = {
    grossRevenue,
    refunds,
    netRevenue,
    shippingRevenue: sum("shipping"),
    taxCollected: sum("tax"),
    discountsGiven: sum("discount"),
    orderCount: paid.length,
    aov: paid.length ? netRevenue / paid.length : 0,
    currency,
  };
  const costs = computeCosts(
    retail,
    expenses.filter((e) => !e.archived && e.currency === currency),
  );
  return { revenue, costs, profit: computeProfit(revenue, costs) };
}
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // CSV quoting alone does not prevent spreadsheet formula execution.
  if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function csv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
