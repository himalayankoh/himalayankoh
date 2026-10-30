import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { wordpressRequest } from "@/lib/backend/wordpress";
import { type WooOrderLike } from "@/lib/woo/orders";
import { orderToSalesRow } from "@/lib/sales/engine";
import {
  ORDER_FIELDS,
  SalesInputError,
  validateOrderEdit,
} from "@/lib/sales/records";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id, field, value } = validateOrderEdit(await request.json());
    const key = ORDER_FIELDS[field];
    const meta: Array<{ key: string; value: string }> = [
      { key, value: String(value) },
    ];
    if (typeof value === "number")
      meta.push({ key: key + "_source", value: "manual" });
    meta.push(
      {
        key: "_hk_sales_updated_by",
        value: auth.admin.username || auth.admin.email,
      },
      { key: "_hk_sales_updated_at", value: new Date().toISOString() },
    );
    // Only private financial metadata. Never payment, order status, totals or line items.
    const saved = await wordpressRequest<WooOrderLike>(`/wc/v3/orders/${id}`, {
      method: "PUT",
      useCredentials: true,
      body: { meta_data: meta },
    });
    return NextResponse.json(
      { order: orderToSalesRow(saved) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SalesInputError
            ? error.message
            : "The order cost could not be saved. Retry your edit.",
      },
      {
        status:
          error instanceof SalesInputError || error instanceof SyntaxError
            ? 400
            : 502,
      },
    );
  }
}
