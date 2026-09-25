/**
 * A buyer's own quotes: list them, or submit a new request for quotation.
 *
 * ## Scoping is the session's, not the request's
 *
 * Both handlers filter on the account id the buyer's signed session carries. A
 * buyer can name a product, a quantity and a destination; they cannot name an
 * account, and `?account_id=` in a query string is ignored — the row is written and
 * read against the session's account and nothing else. That is what makes one
 * buyer's quotes unreadable by another.
 *
 * ## An RFQ is not a quotation
 *
 * Submitting stores the request — products, quantities, the container, the
 * destination — with status `SUBMITTED` and **no price**. The owner prices it in the
 * console (`/admin/wholesale` → Quotes), which is when `sell_total` is set and the
 * status becomes `QUOTED`. So a buyer can never submit a request that arrives already
 * carrying a firm price nobody at Himalayan Koh set.
 */

import { NextResponse } from 'next/server';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { loadWholesaleData } from '@/lib/wholesale/pricing';
import { buildBuyerPlan, parseLineRequests } from '@/lib/wholesale/plan';
import { buyerQuoteView } from '@/lib/wholesale/buyerView';
import { listWholesaleRecords, upsertWholesaleRecord } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

/** How many open RFQs one account may hold, so a stuck client cannot flood the queue. */
const MAX_OPEN_RFQS = 25;

function text(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(request: Request) {
  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  try {
    const rows = await listWholesaleRecords('quotes', { account_id: gate.buyer.accountId, limit: 200 });
    const quotes = rows.map((row) => buyerQuoteView(row));
    return NextResponse.json({ quotes, count: quotes.length });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? `Your quotes could not be read: ${error.message}` : 'Your quotes could not be read.',
      },
      { status: 502 }
    );
  }
}

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
    const existing = await listWholesaleRecords('quotes', { account_id: gate.buyer.accountId, limit: 200 });
    const open = existing.filter((row) =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes(String(row.status ?? '').toUpperCase())
    ).length;
    if (open >= MAX_OPEN_RFQS) {
      return NextResponse.json(
        {
          error: `You already have ${open} requests with our team. Wait for those to be quoted, or email your account manager.`,
        },
        { status: 429 }
      );
    }

    const lines = parseLineRequests(body.lines);
    const incoterm = ['EXW', 'FOB', 'CFR', 'CIF'].includes(String(body.incoterm ?? '').toUpperCase())
      ? String(body.incoterm).toUpperCase()
      : 'FOB';
    const data = await loadWholesaleData();

    const plan = buildBuyerPlan(data, {
      lines,
      containerProfileId: body.containerProfileId ? Number(body.containerProfileId) : null,
      containers: body.containers ? Number(body.containers) : 1,
    });

    const destinationCountry = text(body.destinationCountry) || gate.account.destinationCountry || '';
    const destinationPort = text(body.destinationPort) || gate.account.destinationPort || '';

    const saved = await upsertWholesaleRecord(
      'quotes',
      {
        account_id: gate.buyer.accountId,
        status: 'SUBMITTED',
        incoterm,
        destination_country: destinationCountry,
        destination_port: destinationPort,
        container_profile_id: plan.container.id,
        containers: plan.containers,
        currency: data.products[0]?.currency || 'USD',
        // The buyer's request is stored as the load plan and the line prices they
        // were shown. It is *not* a quotation: `totals` and `sell_total` stay empty
        // until the owner prices it, so nothing on this row can be mistaken for a
        // figure Himalayan Koh committed to.
        lines: plan.lines.map((line) => ({
          id: `line-${line.productRowId}`,
          productId: String(line.productRowId),
          name: line.name,
          wholesaleSku: line.wholesaleSku,
          units: line.units,
          cartons: line.cartons,
          pallets: line.pallets,
          unitPriceIndicative: line.unitPrice,
        })),
        assumptions: [
          ...plan.assumptions,
          ...plan.warnings,
          plan.totals.indicativeMerchandise === null
            ? 'No tier price is configured for at least one product in this request.'
            : `Indicative goods value at the prices shown: ${plan.totals.indicativeMerchandise} ${data.products[0]?.currency || 'USD'}.`,
        ],
        notes: text(body.notes, 500),
        created_by: 'wholesale-buyer',
        submitted_at: new Date().toISOString(),
      },
      { actor: gate.account.email }
    );

    const reference = String((saved as { ref?: string }).ref ?? '');
    const id = Number((saved as { id?: number }).id ?? 0);

    // The reference is derived from the row id, so it is written back once the id
    // exists — a buyer needs something to quote in an email that is not a database id.
    if (id) {
      const withRef = await upsertWholesaleRecord(
        'quotes',
        { ref: `HK-WS-Q${String(id).padStart(5, '0')}` },
        { id, actor: gate.account.email }
      );
      return NextResponse.json(
        { quote: buyerQuoteView(withRef), reference: `HK-WS-Q${String(id).padStart(5, '0')}`, reference_before: reference },
        { status: 201 }
      );
    }

    return NextResponse.json({ quote: buyerQuoteView(saved as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The request could not be submitted.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
