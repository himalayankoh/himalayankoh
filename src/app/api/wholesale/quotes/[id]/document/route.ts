/**
 * The buyer's own quotation, as a document.
 *
 * ## The id in the path is a request, not an authority
 *
 * The buyer names a quote; the account it belongs to is the one their signed session
 * carries. The read is filtered by both (`account_id` **and** `id`), so another
 * buyer's reference answers "no such quotation" — the row is never selected in the
 * first place. That is the same rule the rest of the portal follows, applied to a
 * route that a link can be shared with.
 *
 * ## A buyer may only download what was quoted *to them*
 *
 * An unpriced RFQ is theirs and can be printed. A quote in `DRAFT` on our side is not
 * a price we have given, so it is refused here by name — the buyer is told their
 * request is still being priced, which is the truth, instead of receiving a document
 * that looks like an offer.
 */

import { NextResponse } from 'next/server';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { buyerQuoteView } from '@/lib/wholesale/buyerView';
import { quoteFromRow } from '@/lib/wholesale/mapping';
import { documentFilename, renderQuoteDocument, type DocumentKind } from '@/lib/wholesale/document';
import { validitySentence } from '@/lib/wholesale/quoteLifecycle';
import { readQuoteRevisions } from '@/lib/wholesale/revisionLog';
import { listWholesaleRecords } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

/** Statuses a buyer may hold a document for. A draft is our working paper, not theirs. */
const BUYER_VISIBLE = new Set(['SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED', 'EXPIRED', 'CONVERTED_TO_ORDER', 'REJECTED']);

const KINDS = new Set<DocumentKind>(['QUOTATION', 'PROFORMA', 'PACKING_LIST']);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const quoteId = Number(id);
  if (!quoteId) return NextResponse.json({ error: 'A quotation id is required.' }, { status: 400 });

  const params = new URL(request.url).searchParams;
  const kind: DocumentKind = KINDS.has(String(params.get('kind') ?? '').toUpperCase() as DocumentKind)
    ? (String(params.get('kind')).toUpperCase() as DocumentKind)
    : 'QUOTATION';
  const download = params.get('download') === '1' || params.get('download') === 'true';

  try {
    const rows = await listWholesaleRecords('quotes', { id: quoteId, account_id: gate.buyer.accountId, limit: 1 });
    if (!rows.length) {
      return NextResponse.json({ error: 'No such quotation on your account.' }, { status: 404 });
    }

    const stored = quoteFromRow(rows[0]);
    if (!BUYER_VISIBLE.has(stored.storedStatus)) {
      return NextResponse.json(
        {
          error:
            'This request is still being priced by our team, so there is no quotation document yet. You will be notified when it is ready.',
        },
        { status: 409 }
      );
    }

    // The document is rendered from the buyer projection, not the stored row: the
    // stored row carries the cost side, and the document is the buyer's paper.
    const quote = buyerQuoteView(rows[0]);
    const revisions = await readQuoteRevisions(quoteId);
    const html = renderQuoteDocument({ quote, account: gate.account, kind, revisions });
    const headers = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="${documentFilename(quote, kind)}"`);
    }

    // The validity sentence travels as a header too, so the portal can show the same
    // thing the document says without parsing the HTML.
    const validity = validitySentence(quote.validUntil);
    if (validity) headers.set('X-HK-Quotation-Validity', validity.replace(/[^\x20-\x7E]/g, ' '));

    return new NextResponse(html, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The document could not be produced.' },
      { status: 502 }
    );
  }
}
