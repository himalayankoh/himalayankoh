/** Server-owned financial supplements, using the existing WordPress record store. */
import { storefrontRequest } from "@/lib/wordpress/storefrontClient";
import { EXPENSE_CATEGORY_LABELS, type ManualExpense } from "./types";

const TABLE = "store_settings";
const PREFIX = "sales-expense:";
interface Stored {
  id: string;
  payload: ManualExpense;
}
export class SalesInputError extends Error {}
export function validateExpense(value: unknown): ManualExpense {
  if (!value || typeof value !== "object")
    throw new SalesInputError("An expense is required.");
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.id))
    throw new SalesInputError("Invalid expense id.");
  if (
    typeof v.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
    !Number.isFinite(Date.parse(v.date)) ||
    new Date(v.date).toISOString().slice(0, 10) !== v.date
  )
    throw new SalesInputError("Enter a valid expense date.");
  if (
    typeof v.amount !== "number" ||
    !Number.isFinite(v.amount) ||
    v.amount < 0 ||
    v.amount > 1e9
  )
    throw new SalesInputError("Amount must be between 0 and 1,000,000,000.");
  if (
    typeof v.category !== "string" ||
    !Object.hasOwn(EXPENSE_CATEGORY_LABELS, v.category)
  )
    throw new SalesInputError("Choose an expense category.");
  if (typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency))
    throw new SalesInputError("Use a three-letter currency code.");
  const str = (key: string, max = 500) =>
    typeof v[key] === "string" ? (v[key] as string).trim().slice(0, max) : "";
  if (!str("description"))
    throw new SalesInputError("An expense description is required.");
  return {
    id: v.id,
    date: v.date,
    amount: Math.round(v.amount * 100) / 100,
    category: v.category as ManualExpense["category"],
    currency: v.currency,
    description: str("description"),
    recurring: v.recurring === true,
    createdAt: str("createdAt", 40) || new Date().toISOString(),
    paymentMethod: str("paymentMethod", 80),
    reference: str("reference", 160),
    notes: str("notes", 2000),
    archived: v.archived === true,
  };
}
export async function listSalesExpenses(): Promise<ManualExpense[]> {
  const { items } = await storefrontRequest<{ items: Stored[] }>(
    "/admin-records",
    { params: { table: TABLE, limit: 2000 } },
  );
  // Do not silently publish an incomplete ledger when the shared record-store cap is reached.
  if (items.length >= 2000)
    throw new Error(
      "The expense record window is full. Expand server pagination before reporting totals.",
    );
  return items
    .filter((r) => r.id.startsWith(PREFIX))
    .map((r) => validateExpense(r.payload));
}
export async function saveSalesExpense(
  expense: ManualExpense,
  actor: string,
): Promise<ManualExpense> {
  const result = await storefrontRequest<{ record: Stored }>("/admin-records", {
    method: "POST",
    body: {
      table: TABLE,
      id: PREFIX + expense.id,
      payload: {
        ...expense,
        updatedBy: actor,
        updatedAt: new Date().toISOString(),
      },
    },
  });
  if (!result.record)
    throw new Error("WordPress did not confirm the expense save.");
  return validateExpense(result.record.payload);
}

export const ORDER_FIELDS = {
  cogs: "_hk_cogs",
  actualShippingCost: "_hk_shipping_cost",
  paymentFee: "_hk_payment_fee",
  otherExpense: "_hk_other_expense",
  supplier: "_hk_supplier",
  supplierReference: "_hk_supplier_reference",
  notes: "_hk_sales_notes",
} as const;
export type SalesEditField = keyof typeof ORDER_FIELDS;
export function validateOrderEdit(body: unknown): {
  id: number;
  field: SalesEditField;
  value: string | number;
} {
  if (!body || typeof body !== "object")
    throw new SalesInputError("An order edit is required.");
  const b = body as Record<string, unknown>;
  if (
    !/^\d+$/.test(String(b.id)) ||
    !Number.isSafeInteger(Number(b.id)) ||
    Number(b.id) <= 0
  )
    throw new SalesInputError("Invalid retail order id.");
  if (typeof b.field !== "string" || !Object.hasOwn(ORDER_FIELDS, b.field))
    throw new SalesInputError("This order field cannot be edited here.");
  const field = b.field as SalesEditField;
  if (
    ["cogs", "actualShippingCost", "paymentFee", "otherExpense"].includes(field)
  ) {
    if (
      typeof b.value !== "number" ||
      !Number.isFinite(b.value) ||
      b.value < 0 ||
      b.value > 1e9
    )
      throw new SalesInputError(
        "Enter a non-negative cost up to 1,000,000,000.",
      );
    return { id: Number(b.id), field, value: Math.round(b.value * 100) / 100 };
  }
  if (
    typeof b.value !== "string" ||
    b.value.length > (field === "notes" ? 2000 : 160)
  )
    throw new SalesInputError("The text is too long.");
  return { id: Number(b.id), field, value: b.value.trim() };
}
