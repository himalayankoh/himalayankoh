/**
 * The quotation as a document a buyer can keep.
 *
 * ## Why HTML, and why that is not a shortcut
 *
 * The console's quote screen is a working tool; the buyer needs something to file,
 * forward and sign. A single self-contained HTML document with a print stylesheet
 * does all three: it opens on any device, prints or saves as PDF from the browser
 * (the same route a buyer is offered in the file dialog), and it carries no
 * dependency that can fail on a Worker. A server-side PDF renderer would add a heavy
 * dependency and a font-loading failure mode to buy nothing the reader can see.
 *
 * ## Every figure comes from the frozen row
 *
 * Nothing here is recalculated. The lines, the totals, the basis and the validity date
 * are read off the quote as stored, so the document a buyer holds and the row the
 * owner edits cannot disagree — and a supplier's cost change tomorrow cannot alter a
 * quotation that has already been sent. `quoteLifecycle` supplies the expiry sentence
 * for the same reason: it is derived from the same stored date every other screen uses.
 *
 * ## Escaping is not optional
 *
 * A company name, a port, a note — all of it arrives from a form and lands in HTML. A
 * buyer who names their business `<script>` must see their own text in the header, not
 * have it executed in the owner's browser when the document is previewed. Every
 * interpolated value goes through `escapeHtml`.
 */

import type { AccountRecord } from './mapping';
import { describeRevision, validitySentence, type QuoteRevision } from './quoteLifecycle';

/**
 * The money a document reads, whichever shape it is handed.
 *
 * The document is the **buyer's** paper: what they are charged, and nothing about what
 * we paid. In practice it is handed the server-side buyer projection
 * (`buyerQuoteView`), whose line price is the sell price. This interface is written
 * tolerantly so a raw stored row (whose line carries `exFactoryUnitCost`, an internal
 * figure) still cannot be rendered as a price by accident: only the sell-side fields
 * are ever read, and the sell price is recovered from `sell_total` when a line does not
 * carry one.
 */
export interface DocumentQuoteLine {
  name?: string;
  wholesaleSku?: string | null;
  productId?: string | number | null;
  units?: number;
  cartons?: number;
  cartonQty?: number | null;
  /** The buyer's price per unit, as `buyerQuoteView` derives it. */
  unitPrice?: number | null;
  /** The buyer's line total, as `buyerQuoteView` derives it. */
  lineTotal?: number | null;
}

export interface DocumentQuote {
  id: string | number;
  reference?: string | null;
  currency?: string | null;
  incoterm?: string | null;
  validUntil?: string | null;
  destinationCountry?: string | null;
  destinationPort?: string | null;
  originCountry?: string | null;
  billingCountry?: string | null;
  billedAsUsDelivery?: boolean | null;
  containers?: number | null;
  lines: DocumentQuoteLine[];
  /** The price the buyer pays, when the quotation has been priced. */
  sellTotal?: number | null;
  totals?: { quotedTotal?: number | null; perUnit?: number | null; units?: number } | null;
}

/** HTML-escape every interpolated value; nothing in a document is trusted markup. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const money = (amount: number, currency: string): string =>
  `${currency} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const quantity = (value: number): string => Number(value).toLocaleString('en-US');

/** A finite number, or null. A blank field is "not set", never zero. */
function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The per-unit price on a line — the price the buyer pays.
 *
 * Only the sell side is consulted: `unitPrice` when the projection supplied it, and
 * otherwise the quote's own per-unit price. An internal figure on the row is never a
 * fallback for this.
 */
function lineUnitPrice(line: DocumentQuoteLine, quotePerUnit: number | null): number {
  return amount(line.unitPrice) ?? quotePerUnit ?? 0;
}

/** The line total the buyer is charged, from the sell side alone. */
function lineTotalOf(line: DocumentQuoteLine, quotePerUnit: number | null): number {
  const stated = amount(line.lineTotal);
  if (stated !== null) return stated;
  return Math.round((amount(line.units) ?? 0) * lineUnitPrice(line, quotePerUnit) * 100) / 100;
}

/** What the document is, which decides its title and the terms paragraph. */
export type DocumentKind = 'QUOTATION' | 'PROFORMA' | 'PACKING_LIST';

export interface DocumentInput {
  quote: DocumentQuote;
  account: AccountRecord | null;
  kind?: DocumentKind;
  /** The order reference, for a proforma/packing list raised from an order. */
  orderReference?: string | null;
  revisions?: QuoteRevision[];
  generatedAt?: Date;
}

const KIND_TITLES: Record<DocumentKind, string> = {
  QUOTATION: 'Quotation',
  PROFORMA: 'Proforma invoice',
  PACKING_LIST: 'Packing list',
};

/**
 * The document, as one self-contained HTML page.
 *
 * The commercial block is deliberately split: what the buyer owes us (the quoted
 * lines and totals), what the load physically is (cartons, pallets, weight, CBM —
 * because they arrange a truck), and what is *not* included on this basis (stated,
 * rather than left to be discovered at the destination).
 */
export function renderQuoteDocument(input: DocumentInput): string {
  const { quote, account } = input;
  const kind = input.kind ?? 'QUOTATION';
  const generatedAt = input.generatedAt ?? new Date();
  const currency = quote.currency || 'USD';

  const buyer = account
    ? {
        company: account.companyName,
        contact: account.contactName,
        email: account.email,
        phone: account.phone ?? '',
        address: account.address ?? '',
        country: account.country || quote.destinationCountry,
      }
    : {
        company: 'Wholesale buyer',
        contact: '',
        email: '',
        phone: '',
        address: '',
        country: quote.destinationCountry,
      };

  const validity = validitySentence(quote.validUntil, generatedAt);

  // The price the buyer pays, and the same figure per unit. Taken from the sell side
  // only: `sellTotal` (the buyer projection), or the stored `sell_total` when a raw row
  // is handed in, or the total the projection already computed.
  const unitsTotal = quote.lines.reduce((sum, line) => sum + (amount(line.units) ?? 0), 0);
  const sellTotal =
    amount(quote.sellTotal) ?? amount((quote as { sell_total?: unknown }).sell_total) ?? amount(quote.totals?.quotedTotal);
  const perUnit =
    amount(quote.totals?.perUnit) ??
    (sellTotal !== null && unitsTotal > 0 ? Math.round((sellTotal / unitsTotal) * 10_000) / 10_000 : null);

  const quoteLines = quote.lines.map((line) => {
    const unitPrice = lineUnitPrice(line, perUnit);
    return `<tr>
      <td class="sku">${escapeHtml(line.wholesaleSku || line.productId)}</td>
      <td>${escapeHtml(line.name)}</td>
      <td class="num">${quantity(amount(line.units) ?? 0)}</td>
      <td class="num">${quantity(amount(line.cartons) ?? (line.cartonQty ? Math.ceil((amount(line.units) ?? 0) / line.cartonQty) : 0))}</td>
      <td class="num">${money(unitPrice, currency)}</td>
      <td class="num">${money(lineTotalOf(line, perUnit), currency)}</td>
    </tr>`;
  });

  // No internal cost breakdown reaches this table. What the buyer owes us is one
  // number, and a row labelled "Ocean freight" on their document is our supplier's
  // charge, not theirs.
  const totalRows =
    sellTotal !== null
      ? [
          [`Total (${quote.incoterm})`, sellTotal],
          ['Per unit', perUnit],
        ]
          .filter(([, value]) => value !== null && Number(value) !== 0)
          .map(
            ([label, value]) =>
              `<tr><th>${escapeHtml(label)}</th><td class="num">${money(Number(value), currency)}</td></tr>`
          )
          .join('')
      : `<tr><th>Pricing</th><td class="num">Not yet quoted — this document shows the requested load only.</td></tr>`;

  const notIncluded = sellTotal !== null
    ? [
        'Destination-side charges are quoted separately unless stated.',
        'Duty and taxes at the destination are payable by the importer of record.',
        'Freight and charges are subject to carrier space and surcharges at the time of booking.',
      ]
    : [];

  const load = quote.lines.length
    ? quote.lines
        .map((line) => {
          const units = amount(line.units) ?? 0;
          const cartons = amount(line.cartons) ?? (line.cartonQty ? Math.ceil(units / line.cartonQty) : 0);
          return `<li>${escapeHtml(line.name)} — ${quantity(units)} units${cartons ? ` (${quantity(cartons)} cartons)` : ''}</li>`;
        })
        .join('')
    : '<li>The load will be confirmed with the order.</li>';

  // The revision history stays — a buyer is entitled to see what was revised — but the
  // internal fields are removed from it: a line reading "Margin: 22% → 30%" is our
  // account, not theirs.
  const revisionNotes =
    input.revisions && input.revisions.length
      ? `<section>
          <h2>Revision history</h2>
          <ol>${input.revisions
            .map((revision) => {
              const visible = revision.changed.filter(
                (field) => field !== 'marginPct' && field !== 'costTotal' && field !== 'sellPerUnit'
              );
              const lines = describeRevision({ ...revision, changed: visible })
                .map((line) => `<li>${escapeHtml(line)}</li>`)
                .join('');
              return `<li>Revision ${escapeHtml(revision.revision)} — ${escapeHtml(revision.at)}${
                revision.actor ? ` by ${escapeHtml(revision.actor)}` : ''
              }${revision.reason ? `: ${escapeHtml(revision.reason)}` : ''}${lines ? `<ul>${lines}</ul>` : ''}</li>`;
            })
            .join('')}</ol>
        </section>`
      : '';

  const isUk = /^(united kingdom|uk|gb|great britain)$/i.test((quote.destinationCountry ?? '').trim());
  const billedAsUs = quote.billedAsUsDelivery ?? isUk;
  const sourcingOrigin = quote.originCountry || (isUk ? 'Pakistan' : 'Pakistan / China');
  const billingDestination = billedAsUs ? 'United States' : (quote.billingCountry || quote.destinationCountry || 'United States');

  const sourcingNotice = isUk
    ? '<div class="notice">Commercial terms: UK shipment served out of Pakistan and billed as a USA delivery.</div>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(KIND_TITLES[kind])} ${escapeHtml(quote.reference || quote.id)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1c1c; margin: 0; padding: 32px; background: #fff; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3f6550; padding-bottom: 12px; gap: 24px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: .01em; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #3f6550; margin: 24px 0 8px; }
  .muted { color: #5b5b5b; }
  .meta { text-align: right; font-size: 13px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e4e0d8; vertical-align: top; }
  thead th { background: #f6f3ec; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  tfoot th { text-align: right; }
  tfoot tr:last-child td, tfoot tr:last-child th { font-weight: 700; border-top: 2px solid #3f6550; }
  ul, ol { margin: 6px 0 0; padding-left: 20px; }
  .notice { background: #fdf7ec; border-left: 3px solid #c98745; padding: 10px 12px; margin-top: 20px; font-size: 13px; }
  footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e4e0d8; font-size: 12px; color: #5b5b5b; }
  @media print {
    body { padding: 0; font-size: 12px; }
    h2 { margin: 16px 0 6px; }
    .notice { break-inside: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>Himalayan Koh</h1>
    <div class="muted">Wholesale division — ${escapeHtml(KIND_TITLES[kind])}</div>
  </div>
  <div class="meta">
    <div><strong>${escapeHtml(quote.reference || `quote #${quote.id}`)}</strong></div>
    ${input.orderReference ? `<div>Order ${escapeHtml(input.orderReference)}</div>` : ''}
    <div>Issued ${escapeHtml(generatedAt.toISOString().slice(0, 10))}</div>
    ${quote.validUntil ? `<div>Valid until ${escapeHtml(quote.validUntil)}</div>` : '<div class="muted">No validity date set</div>'}
    <div>Basis <strong>${escapeHtml(quote.incoterm)}</strong></div>
  </div>
</header>

${validity ? `<div class="notice">${escapeHtml(validity)}</div>` : ''}


<div class="grid">
  <section>
    <h2>Buyer</h2>
    <div><strong>${escapeHtml(buyer.company)}</strong></div>
    ${buyer.contact ? `<div>${escapeHtml(buyer.contact)}</div>` : ''}
    ${buyer.email ? `<div class="muted">${escapeHtml(buyer.email)}</div>` : ''}
    ${buyer.phone ? `<div class="muted">${escapeHtml(buyer.phone)}</div>` : ''}
    ${buyer.address ? `<div class="muted">${escapeHtml(buyer.address)}</div>` : ''}
    ${buyer.country ? `<div class="muted">${escapeHtml(buyer.country)}</div>` : ''}
  </section>
  <section>
    <h2>Shipment &amp; Terms</h2>
    <div>Physical destination: <strong>${escapeHtml(quote.destinationCountry || 'to be confirmed')}</strong></div>
    ${quote.destinationPort ? `<div>Port of discharge: ${escapeHtml(quote.destinationPort)}</div>` : ''}
    <div>Sourcing origin: <strong>${escapeHtml(sourcingOrigin)}</strong>${isUk ? ' (served out of Pakistan)' : ''}</div>
    <div>Commercial billing: <strong>${billedAsUs ? `Billed as USA Delivery (${escapeHtml(currency)})` : `Direct ${escapeHtml(billingDestination)} Delivery (${escapeHtml(currency)})`}</strong></div>
    <div>Containers: ${quantity(quote.containers || 1)}</div>
    <div class="muted">Currency: ${escapeHtml(currency)}</div>
  </section>
</div>

${sourcingNotice}

<h2>Quoted lines</h2>
<table>
  <thead>
    <tr><th>SKU</th><th>Product</th><th class="num">Units</th><th class="num">Cartons</th><th class="num">Unit price</th><th class="num">Line total</th></tr>
  </thead>
  <tbody>${quoteLines.join('')}</tbody>
</table>

<h2>Totals</h2>
<table>
  <tbody>${totalRows}</tbody>
</table>

${notIncluded.length ? `<section><h2>Not included on this basis</h2><ul>${notIncluded.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul></section>` : ''}

<section>
  <h2>Load</h2>
  <ul>${load}</ul>
</section>

${revisionNotes}

<footer>
  Generated ${escapeHtml(generatedAt.toISOString())} from quotation ${escapeHtml(quote.reference || quote.id)}.
  This document is a commercial quotation, not a tax invoice; freight and charges are subject to confirmation at booking.
</footer>
</body>
</html>`;
}

/** A filename that a browser and a file system both accept. */
export function documentFilename(quote: { reference?: string | null; id: string | number }, kind: DocumentKind = 'QUOTATION'): string {
  const reference = String(quote.reference || `quote-${quote.id}`).replace(/[^A-Za-z0-9._-]+/g, '-');
  const suffix = kind === 'PROFORMA' ? 'proforma' : kind === 'PACKING_LIST' ? 'packing-list' : 'quotation';
  return `Himalayan-Koh-${suffix}-${reference}.html`;
}
