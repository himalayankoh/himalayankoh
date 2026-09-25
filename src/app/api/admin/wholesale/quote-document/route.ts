/**
 * The console's quotation document: printable, or downloaded as a file.
 *
 * ## One document, two ways to take it
 *
 * `GET …/quote-document?id=12` answers with the page, which prints (and saves as PDF)
 * from the browser; `?download=1` answers with the same bytes as a file attachment,
 * for an owner who emails it. The content is identical because it *is* the same
 * function — a "download" that rendered a second layout is how the emailed copy and
 * the printed copy come to disagree.
 *
 * ## It cannot show a price the quote does not have
 *
 * Everything comes from the stored row: the lines, the totals, the basis, the
 * validity date and the revision history (read back from the audit trail, which is
 * append-only). An unpriced RFQ can be printed — it is a legitimate record of what a
 * buyer asked for — and the document says plainly that it is not yet quoted, rather
 * than showing zeroes that look like a price.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { accountFromRow, quoteFromRow, type AccountRecord } from '@/lib/wholesale/mapping';
import { buyerQuoteView } from '@/lib/wholesale/buyerView';
import { documentFilename, renderQuoteDocument, type DocumentKind } from '@/lib/wholesale/document';
import { readQuoteRevisions } from '@/lib/wholesale/revisionLog';
import { listWholesaleRecords } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

const KINDS = new Set<DocumentKind>(['QUOTATION', 'PROFORMA', 'PACKING_LIST']);

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const params = new URL(request.url).searchParams;
  const id = Number(params.get('id') ?? 0);
  if (!id) return NextResponse.json({ error: 'A quotation id is required.' }, { status: 400 });

  const requested = String(params.get('kind') ?? 'QUOTATION').toUpperCase() as DocumentKind;
  const kind: DocumentKind = KINDS.has(requested) ? requested : 'QUOTATION';
  const download = params.get('download') === '1' || params.get('download') === 'true';

  try {
    const rows = await listWholesaleRecords('quotes', { id, limit: 1 });
    if (!rows.length) return NextResponse.json({ error: 'No such quotation.' }, { status: 404 });

    const stored = quoteFromRow(rows[0]);
    const accountId = Number(params.get('accountId') ?? stored.accountId ?? 0);

    let account: AccountRecord | null = null;
    if (accountId) {
      const accountRows = await listWholesaleRecords('accounts', { id: accountId, limit: 1 });
      account = accountRows.length ? accountFromRow(accountRows[0]) : null;
    }

    // The audit trail is the revision history. `readQuoteRevisions` already degrades
    // to an empty list rather than throwing: an unreachable audit table must not cost
    // the owner the document, which renders from the quote row itself.
    const revisions = await readQuoteRevisions(id);

    // The console's printable copy is the same document the buyer receives, so it is
    // rendered from the buyer projection: an owner who emails this to a customer must
    // not be emailing their own cost breakdown and margin history. The cost side lives
    // on the console's own screens.
    const quote = buyerQuoteView(rows[0]);
    const html = renderQuoteDocument({ quote, account, kind, revisions });
    const headers = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      // A quotation is a live commercial figure; nothing between us and the owner
      // should keep a copy of it.
      'Cache-Control': 'no-store',
    });
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="${documentFilename(quote, kind)}"`);
    }

    return new NextResponse(html, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The document could not be produced.' },
      { status: 502 }
    );
  }
}
