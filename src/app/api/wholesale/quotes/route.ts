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
import { sendWholesaleInquiryEmails, wholesaleInquiryRecipient } from '@/lib/email/wholesaleInquiry';
import { siteBaseUrl } from '@/lib/email/sendEmail';

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

    /**
     * The allocation is a ceiling, checked on the server.
     *
     * A product with no allocation configured (`available_units = 0`) is uncapped: an
     * unset number is not a claim that nothing is available. Where a ceiling is set,
     * the buyer's catalogue advertises it, and a request above it is refused with the
     * number named rather than quietly reduced — a silently shrunk order is worse than
     * a refusal, because the buyer would accept a quotation for something they did not
     * ask for.
     */
    for (const line of plan.lines) {
      const product = data.products.find((entry) => entry.rowId === line.productRowId);
      const allocation = product?.availableUnits ?? 0;
      if (allocation > 0 && line.units > allocation) {
        return NextResponse.json(
          {
            error: `${line.name}: ${line.units.toLocaleString('en-US')} units requested, but ${allocation.toLocaleString(
              'en-US'
            )} are offered at this allocation. Reduce the quantity or ask your account manager about a larger volume.`,
            productId: line.productRowId,
            availableUnits: allocation,
          },
          { status: 400 }
        );
      }
    }

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
      const quoteReference = `HK-WS-Q${String(id).padStart(5, '0')}`;

      /**
       * The trade desk is told about the inquiry *after* it is stored, so a mail
       * failure cannot lose it. `estimatedMerchandise` is the indicative figure the
       * buyer was shown — not a quotation — and every line carries the price it was
       * shown at, because a later tier change must not rewrite this notification.
       */
      const currency = data.products[0]?.currency || 'USD';
      const delivery = await sendWholesaleInquiryEmails({
        reference: quoteReference,
        buyer: {
          businessName: gate.account.companyName,
          contactName: gate.account.contactName,
          email: gate.account.email,
          phone: gate.account.phone ?? '',
        },
        lines: plan.lines.map((line) => ({
          name: line.name,
          sku: line.wholesaleSku,
          units: line.units,
          unitPrice: typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) ? line.unitPrice : null,
        })),
        currency,
        estimatedMerchandise:
          typeof plan.totals.indicativeMerchandise === 'number' ? plan.totals.indicativeMerchandise : null,
        shippingAddress: [gate.account.address, destinationCountry].filter(Boolean).join(', '),
        destinationPort,
        notes: text(body.notes, 500),
        adminUrl: `${siteBaseUrl()}/admin/wholesale#quotes`,
      });

      if (!delivery.adminNotified) {
        // Recorded, not thrown: the inquiry exists, and the console has to be able to
        // show that the trade desk was not told.
        await upsertWholesaleRecord(
          'audit',
          {
            at: new Date().toISOString().slice(0, 19).replace('T', ' '),
            actor: 'wholesale-inquiry',
            action: 'inquiry_email_failed',
            entity: 'quotes',
            entity_id: id,
            detail: {
              reference: quoteReference,
              recipient: wholesaleInquiryRecipient(),
              reason: delivery.error,
            },
          },
          { actor: 'wholesale-inquiry' }
        ).catch(() => undefined);
      }

      return NextResponse.json(
        {
          quote: buyerQuoteView(withRef),
          reference: quoteReference,
          reference_before: reference,
          notification: {
            tradeDeskNotified: delivery.adminNotified,
            buyerAcknowledged: delivery.buyerAcknowledged,
          },
        },
        { status: 201 }
      );
    }

    return NextResponse.json({ quote: buyerQuoteView(saved as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The request could not be submitted.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
