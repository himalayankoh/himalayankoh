/**
 * The buyer accepting their own quotation.
 *
 * ## The id is a request, never an authority
 *
 * The quote is read by **both** the id in the path and the account id in the buyer's
 * signed session, exactly like the document route. Another buyer's reference therefore
 * answers "no such quotation" rather than accepting it — the row is never selected in
 * the first place.
 *
 * ## Acceptance is the buyer's act, and only on a live quotation
 *
 * `buyerAcceptance` holds the rule (priced, not already accepted, not expired by date).
 * This route does not restate it and does not soften it: a refusal is returned with the
 * reason and the verdict's own status, so the portal can say why.
 *
 * ## What a buyer may write, and nothing more
 *
 * One field changes: the status, to `ACCEPTED`. Not the price, not the lines, not the
 * validity — those are ours, and a buyer editing them by hand would be editing the
 * figure they are agreeing to. The order that follows is raised by the owner from the
 * console on the terms agreed, which is where money actually moves.
 */

import { NextResponse } from 'next/server';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { buyerAcceptance } from '@/lib/wholesale/buyerAcceptance';
import { buyerQuoteView } from '@/lib/wholesale/buyerView';
import { listWholesaleRecords, upsertWholesaleRecord } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const quoteId = Number(id);
  if (!quoteId) return NextResponse.json({ error: 'A quotation id is required.' }, { status: 400 });

  try {
    const rows = await listWholesaleRecords('quotes', {
      id: quoteId,
      account_id: gate.buyer.accountId,
      limit: 1,
    });
    if (!rows.length) {
      return NextResponse.json({ error: 'No such quotation on your account.' }, { status: 404 });
    }

    const verdict = buyerAcceptance(rows[0] as Record<string, unknown>);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: verdict.message, code: verdict.code, quote: buyerQuoteView(rows[0] as Record<string, unknown>) },
        { status: verdict.status }
      );
    }

    const saved = await upsertWholesaleRecord(
      'quotes',
      { status: 'ACCEPTED', decided_at: new Date().toISOString() },
      { id: quoteId, actor: gate.account.email || gate.buyer.email }
    );

    return NextResponse.json({
      accepted: true,
      quote: buyerQuoteView(saved as Record<string, unknown>),
      message: 'Thank you — your quotation is accepted. We will raise the order and send the terms.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? `The quotation could not be accepted: ${error.message}` : 'The quotation could not be accepted.',
      },
      { status: 502 }
    );
  }
}
