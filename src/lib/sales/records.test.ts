import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/wordpress/storefrontClient", () => ({
  storefrontRequest: vi.fn(),
}));
import { storefrontRequest } from "@/lib/wordpress/storefrontClient";
import {
  listSalesExpenses,
  saveSalesExpense,
  validateExpense,
  validateOrderEdit,
} from "./records";
const expense = {
  id: "qa-1",
  date: "2026-09-26",
  category: "other",
  description: "Packing supplies",
  amount: 12.25,
  currency: "USD",
  recurring: false,
  createdAt: "2026-09-26T00:00:00Z",
};
describe("Sales financial record boundaries", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([NaN, Infinity, -1, 1e10, "12", null])(
    "rejects invalid expense amount %s",
    (amount) => expect(() => validateExpense({ ...expense, amount })).toThrow(),
  );
  it.each(["2026-02-30", "2026-15-40", "no date"])(
    "rejects invalid dates %s",
    (date) => expect(() => validateExpense({ ...expense, date })).toThrow(),
  );
  it("preserves explicit zero and never accepts a payment-status edit", () => {
    expect(validateOrderEdit({ id: "2639", field: "cogs", value: 0 })).toEqual({
      id: 2639,
      field: "cogs",
      value: 0,
    });
    expect(() =>
      validateOrderEdit({ id: 2639, field: "status", value: "completed" }),
    ).toThrow();
    expect(() =>
      validateOrderEdit({ id: "../2639", field: "cogs", value: 1 }),
    ).toThrow();
    expect(() =>
      validateOrderEdit({ id: 2639, field: "paymentFee", value: -1 }),
    ).toThrow();
  });
  it("stores one namespaced expense in WordPress without overwriting other settings", async () => {
    vi.mocked(storefrontRequest).mockResolvedValue({
      record: { id: "sales-expense:qa-1", payload: expense },
    });
    expect(
      (await saveSalesExpense(validateExpense(expense), "owner")).amount,
    ).toBe(12.25);
    expect(storefrontRequest).toHaveBeenCalledWith(
      "/admin-records",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          table: "store_settings",
          id: "sales-expense:qa-1",
          payload: expect.objectContaining({ updatedBy: "owner" }),
        }),
      }),
    );
  });
  it("reads only ledger records and keeps archived entries recoverable", async () => {
    vi.mocked(storefrontRequest).mockResolvedValue({
      items: [
        { id: "free-shipping", payload: {} },
        { id: "sales-expense:qa-1", payload: { ...expense, archived: true } },
      ],
    });
    const result = await listSalesExpenses();
    expect(result).toHaveLength(1);
    expect(result[0].archived).toBe(true);
  });
  it("fails rather than reporting an incomplete ledger as complete", async () => {
    vi.mocked(storefrontRequest).mockResolvedValue({
      items: Array(2000).fill({ id: "setting", payload: {} }),
    });
    await expect(listSalesExpenses()).rejects.toThrow("window");
  });
});
