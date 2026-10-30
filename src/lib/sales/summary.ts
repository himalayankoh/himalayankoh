import type {
  RevenueSummary,
  CostSummary,
  ProfitSummary,
  SalesOrderRow,
  ManualExpense,
} from "./types";
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeCosts(
  salesOrders: SalesOrderRow[],
  manualExpenses: ManualExpense[] = [],
): CostSummary {
  let cogs = 0;
  let shippingCost = 0;
  let gatewayFees = 0;
  let otherExpenses = 0;
  let missingCogsCount = 0;

  for (const order of salesOrders) {
    if (order.channel !== "retail") continue;
    if (order.paymentStatus !== "paid") continue;

    if (order.cogsStatus === "verified" && order.cogs !== null) {
      cogs += order.cogs;
    } else {
      missingCogsCount += 1;
    }

    shippingCost += order.actualShippingCost;
    gatewayFees += order.paymentFee;
    otherExpenses += order.otherExpense;
  }

  for (const exp of manualExpenses) {
    if (exp.category === "shipping") {
      shippingCost += exp.amount;
    } else if (
      exp.category === "supplier_payment" ||
      exp.category === "packaging"
    ) {
      cogs += exp.amount;
    } else if (exp.category === "gateway_fee") {
      gatewayFees += exp.amount;
    } else {
      otherExpenses += exp.amount;
    }
  }

  const totalCosts = round2(cogs + shippingCost + gatewayFees + otherExpenses);

  return {
    cogs: round2(cogs),
    shippingCost: round2(shippingCost),
    gatewayFees: round2(gatewayFees),
    otherExpenses: round2(otherExpenses),
    totalCosts,
    missingCogsCount,
  };
}

/* ------------------------------------------------------------------ */
/* Profit                                                              */
/* ------------------------------------------------------------------ */

export function computeProfit(
  revenue: RevenueSummary,
  costs: CostSummary,
): ProfitSummary {
  const grossProfit = round2(revenue.netRevenue - costs.cogs);
  const grossMarginPct =
    revenue.netRevenue > 0
      ? round2((grossProfit / revenue.netRevenue) * 100)
      : 0;

  const netProfit = round2(revenue.netRevenue - costs.totalCosts);
  const netMarginPct =
    revenue.netRevenue > 0 ? round2((netProfit / revenue.netRevenue) * 100) : 0;

  const verifiedOrderCount = Math.max(
    0,
    revenue.orderCount - costs.missingCogsCount,
  );
  const hasIncompleteProfit = costs.missingCogsCount > 0;

  return {
    netRevenue: revenue.netRevenue,
    totalCosts: costs.totalCosts,
    grossProfit,
    grossMarginPct,
    netProfit,
    netMarginPct,
    verifiedOrderCount,
    missingCogsCount: costs.missingCogsCount,
    hasIncompleteProfit,
  };
}
