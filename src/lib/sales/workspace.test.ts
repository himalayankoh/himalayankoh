import { it, expect } from "vitest";
import { buildSalesDashboard } from "./engine";
import { summarizeRetail, csv } from "./workspace";
it("separates wholesale cash from unknown profit", () => {
  const d = buildSalesDashboard({
    orders: [],
    period: "all",
    wholesaleOrders: [
      {
        id: "1",
        reference: "WS-1",
        status: "CONFIRMED",
        currency: "USD",
        total: 1000,
        depositCollected: 400,
        createdAt: new Date().toISOString(),
      },
    ],
  });
  expect(d.orders[0]).toMatchObject({
    collectedAmount: 400,
    balanceDue: 600,
    netProfit: null,
    profitMarginPct: null,
    cogsStatus: "missing",
  });
});
it("reports wholesale profit from its existing cost engine output, not cash", () => {
  const d = buildSalesDashboard({
    orders: [],
    period: "all",
    wholesaleOrders: [
      {
        id: "1",
        reference: "WS-1",
        status: "CONFIRMED",
        currency: "USD",
        total: 1000,
        depositCollected: 400,
        createdAt: new Date().toISOString(),
        financials: {
          cogs: 600,
          shipping: 100,
          other: 20,
          commission: 28,
          netProfit: 252,
          margin: 25.2,
        },
      },
    ],
  });
  expect(d.orders[0]).toMatchObject({
    collectedAmount: 400,
    netProfit: 252,
    totalCosts: 748,
  });
  expect(d.profit.netProfit).toBe(0);
});
it("uses the same expense and retail cost arithmetic for UI and server", () => {
  const e = {
    id: "a",
    date: new Date().toISOString().slice(0, 10),
    category: "other" as const,
    description: "Overhead",
    amount: 10,
    currency: "USD",
    createdAt: "",
    recurring: false,
  };
  const d = buildSalesDashboard({
    orders: [
      {
        id: 1,
        status: "processing",
        total: "100",
        payment_method: "bacs",
        date_created_gmt: new Date().toISOString(),
        meta_data: [
          { key: "_hk_cogs", value: 30 },
          { key: "_hk_shipping_cost", value: 5 },
        ],
      },
    ],
    period: "all",
    manualExpenses: [e],
  });
  const summary = summarizeRetail(d.orders, [e], "USD");
  expect(summary.costs).toEqual(d.costs);
  expect(summary.profit).toEqual(d.profit);
  expect(summary.profit.netProfit).toBe(55);
  expect(
    summarizeRetail(d.orders, [{ ...e, archived: true }], "USD").profit
      .netProfit,
  ).toBe(65);
});
it("escapes CSV syntax and prevents spreadsheet formula injection", () => {
  expect(csv([['=HYPERLINK("https://example.invalid")', "a,b", -2]])).toContain(
    '"\'=HYPERLINK(""https://example.invalid"")","a,b","-2"',
  );
});
