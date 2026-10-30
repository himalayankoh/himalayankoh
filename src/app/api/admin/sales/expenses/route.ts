import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import {
  SalesInputError,
  validateExpense,
  saveSalesExpense,
} from "@/lib/sales/records";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const expense = validateExpense(body);
    const saved = await saveSalesExpense(
      expense,
      auth.admin.username || auth.admin.email,
    );
    return NextResponse.json(
      { expense: saved },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SalesInputError
            ? error.message
            : "The expense could not be saved. Retry without closing your edit.",
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
