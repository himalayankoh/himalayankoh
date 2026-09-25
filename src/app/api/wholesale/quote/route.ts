/**
 * The buyer's indicative calculation for a proposed container.
 *
 * Stateless on purpose: this prices a mix the buyer is *considering* and returns
 * the plan. Nothing is stored, so a buyer can explore twenty mixes without leaving
 * twenty rows for the owner to read — the deliberate act that creates a record is
 * submitting an RFQ (`POST /api/wholesale/quotes`).
 *
 * What comes back is the physical plan and an indicative merchandise value at the
 * buyer's tier prices. Freight and landed cost are not here: they are the owner's
 * numbers, and they are quoted, not calculated by the buyer's browser.
 */

import { NextResponse } from 'next/server';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { loadWholesaleData } from '@/lib/wholesale/pricing';
import { buildBuyerPlan, parseLineRequests } from '@/lib/wholesale/plan';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const lines = parseLineRequests(body.lines);
    const data = await loadWholesaleData();
    const plan = buildBuyerPlan(data, {
      lines,
      containerProfileId: body.containerProfileId ? Number(body.containerProfileId) : null,
      containers: body.containers ? Number(body.containers) : 1,
    });

    return NextResponse.json({
      plan,
      pricing: 'INDICATIVE',
      note: 'Goods value only. Freight, insurance and destination charges are confirmed on our quotation.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The plan could not be calculated.';
    // A bad line or an unknown product is the buyer's mistake to fix, so it is a 400;
    // anything else is the backend failing to answer.
    const status = /give either units or pallets|must be greater than zero|at least one product|whole wholesale product id|at most \d+ product lines/i.test(
      message
    )
      ? 400
      : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
