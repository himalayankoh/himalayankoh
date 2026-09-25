'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CheckCircle2, ChevronDown, Download, FileText, Package, Printer, Truck } from 'lucide-react';
import {
  acceptQuote,
  downloadQuoteDocument,
  openQuoteDocument,
  type PortalOrder,
  type PortalQuote,
} from '@/lib/wholesale/portalClient';
import type { PortalTab } from './WholesalePortalPage';

/**
 * The buyer's quotations and orders.
 *
 * ## Firmness is on the screen, not in a footnote
 *
 * Every quotation carries its state as a badge — indicative, under review, confirmed,
 * expired — using the server's own `confidence` value, and the sentence under it comes
 * from the same place. A buyer must be able to tell a number we have committed to from
 * one we have not, without reading a policy page, so this panel never renders a price
 * without its state beside it.
 *
 * ## An unpriced request is not a zero
 *
 * An RFQ nobody has priced yet shows "awaiting our quotation", never `0.00` — the
 * difference between "we have not quoted" and "this is free" is the whole point of the
 * quote lifecycle.
 */

const BADGE_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-green-50 text-green-700 border-green-200',
  INDICATIVE: 'bg-amber-50 text-amber-800 border-amber-200',
  UNDER_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
  EXPIRED: 'bg-charcoal/5 text-charcoal-light border-charcoal/15',
};

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value: string | null): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? '—' : new Date(parsed).toLocaleDateString();
}

function QuoteCard({ quote, onAccepted }: { quote: PortalQuote; onAccepted?: (quote: PortalQuote) => void }) {
  const [open, setOpen] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [acceptNotice, setAcceptNotice] = useState('');

  /**
   * The buyer committing to a firm quotation.
   *
   * Acceptance is the buyer's act, but *whether* it may be accepted is the server's
   * call — priced, not already accepted, not past its validity date. That refusal is
   * shown in the server's own words, because "that did not work" would hide the one
   * sentence the buyer needs: what to do next.
   */
  async function accept() {
    setAcceptError('');
    setAcceptNotice('');
    setAccepting(true);
    try {
      const updated = await acceptQuote(Number(quote.id));
      setAcceptNotice('This quotation is accepted. We will raise the order and send the terms.');
      onAccepted?.(updated);
    } catch (caught) {
      setAcceptError(caught instanceof Error ? caught.message : 'The quotation could not be accepted.');
    } finally {
      setAccepting(false);
    }
  }

  /**
   * The quotation as a document.
   *
   * Fetched with the buyer's own token and opened from a blob, so a quotation can be
   * printed or attached to an email without a token ever appearing in a URL. A refusal
   * — an RFQ we have not priced yet — is shown in the server's own words rather than
   * opening an empty tab.
   */
  async function withDocument(action: () => Promise<void>) {
    setDocumentError('');
    try {
      await action();
    } catch (caught) {
      setDocumentError(caught instanceof Error ? caught.message : 'That document is not available.');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-charcoal/8 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full text-left p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-warm-white/60 transition-colors"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <span className="font-mono text-sm font-semibold text-charcoal">{quote.reference || `#${quote.id}`}</span>
            <span
              className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                BADGE_STYLES[quote.confidence] ?? BADGE_STYLES.INDICATIVE
              }`}
            >
              {quote.confidence.replace('_', ' ')}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-charcoal/5 text-charcoal-light text-xs font-semibold">
              {quote.incoterm}
            </span>
          </div>
          <p className="text-sm text-charcoal-light">
            {quote.totals.units.toLocaleString('en-US')} units · {quote.totals.pallets} pallet
            {quote.totals.pallets === 1 ? '' : 's'} · {quote.totals.netWeightKg.toLocaleString('en-US')} kg
            {quote.destinationCountry ? ` · ${quote.destinationCountry}` : ''}
          </p>
        </div>

        <div className="text-right">
          {quote.totals.quotedTotal !== null ? (
            <>
              <p className="font-serif text-xl font-bold text-charcoal">{money(quote.totals.quotedTotal, quote.currency)}</p>
              {quote.totals.perUnit !== null ? (
                <p className="text-xs text-charcoal-light">{money(quote.totals.perUnit, quote.currency)} per unit</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm font-medium text-charcoal-light">Awaiting our quotation</p>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-charcoal-light mt-1">
            <CalendarClock className="w-3.5 h-3.5" />
            {quote.validUntil ? `Valid to ${date(quote.validUntil)}` : `Requested ${date(quote.submittedAt || quote.createdAt)}`}
          </span>
        </div>

        <ChevronDown className={`w-5 h-5 text-charcoal-light transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="border-t border-charcoal/8 p-5 bg-warm-white/40">
          <p className="text-sm text-charcoal-light leading-relaxed mb-4">{quote.confidenceNote}</p>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {quote.status === 'QUOTED' && quote.confidence === 'CONFIRMED' ? (
              <button
                type="button"
                onClick={() => void accept()}
                disabled={accepting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-himalayan text-white text-xs font-semibold hover:bg-himalayan-dark transition-colors disabled:opacity-60"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {accepting ? 'Accepting…' : 'Accept quotation'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void withDocument(() => openQuoteDocument(Number(quote.id)))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-charcoal/15 bg-white text-xs font-semibold text-charcoal hover:bg-charcoal/5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print quotation
            </button>
            <button
              type="button"
              onClick={() => void withDocument(() => downloadQuoteDocument(Number(quote.id)))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-charcoal/15 bg-white text-xs font-semibold text-charcoal hover:bg-charcoal/5"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <span className="text-xs text-charcoal-light">
              {quote.confidence === 'INDICATIVE' || quote.confidence === 'UNDER_REVIEW'
                ? 'This request has not been priced yet, so the document shows the load you asked for.'
                : 'The document holds the prices and validity shown here.'}
            </span>
          </div>

          {documentError ? <p className="text-sm text-red-700 mb-4">{documentError}</p> : null}
          {acceptNotice ? (
            <p className="text-sm text-green-700 font-medium mb-4">{acceptNotice}</p>
          ) : null}
          {acceptError ? <p className="text-sm text-red-700 mb-4">{acceptError}</p> : null}
          {quote.status === 'ACCEPTED' ? (
            <p className="text-sm text-green-700 mb-4">
              You have accepted this quotation. We are raising your wholesale order.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-charcoal-light text-xs uppercase tracking-wider">
                  <th className="text-left font-medium pb-2 pr-3">Product</th>
                  <th className="text-right font-medium pb-2 px-3">Units</th>
                  <th className="text-right font-medium pb-2 px-3">Cartons</th>
                  <th className="text-right font-medium pb-2 px-3">Pallets</th>
                  {quote.lines.some((line) => line.unitPrice !== null) ? (
                    <>
                      <th className="text-right font-medium pb-2 px-3">Unit price</th>
                      <th className="text-right font-medium pb-2 pl-3">Line total</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((line, index) => (
                  <tr key={`${line.wholesaleSku || line.name}-${index}`} className="border-t border-charcoal/8">
                    <td className="py-2 pr-3 text-charcoal">{line.name}</td>
                    <td className="py-2 px-3 text-right text-charcoal">{line.units.toLocaleString('en-US')}</td>
                    <td className="py-2 px-3 text-right text-charcoal">{line.cartons.toLocaleString('en-US')}</td>
                    <td className="py-2 px-3 text-right text-charcoal">{line.pallets}</td>
                    {quote.lines.some((entry) => entry.unitPrice !== null) ? (
                      <>
                        <td className="py-2 px-3 text-right text-charcoal">
                          {line.unitPrice !== null ? money(line.unitPrice, quote.currency) : '—'}
                        </td>
                        <td className="py-2 pl-3 text-right text-charcoal">
                          {line.lineTotal !== null ? money(line.lineTotal, quote.currency) : '—'}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {quote.notes ? (
            <p className="text-sm text-charcoal-light mt-4">
              <span className="font-medium text-charcoal">Your notes: </span>
              {quote.notes}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function PortalQuotesOrdersPanel({
  tab,
  quotes,
  orders,
  currency,
  onAccepted,
}: {
  tab: PortalTab;
  quotes: PortalQuote[];
  orders: PortalOrder[];
  currency: string;
  onAccepted?: (quote: PortalQuote) => void;
}) {
  if (tab === 'quotes') {
    return (
      <div>
        <div className="mb-6">
          <h2 className="font-serif text-2xl font-bold text-charcoal">My quotations</h2>
          <p className="text-charcoal-light mt-1">
            Requests you have sent us, and the quotations we have issued against them.
          </p>
        </div>

        {quotes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-charcoal/8 p-10 text-center">
            <FileText className="w-8 h-8 text-charcoal-light mx-auto mb-4" />
            <p className="text-charcoal font-medium mb-1">No quotations yet</p>
            <p className="text-charcoal-light text-sm mb-5">
              Build a container or a pallet order and send it to us for pricing.
            </p>
            <Link
              href="/wholesale/catalog"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors"
            >
              <Package className="w-4 h-4" />
              Browse the catalog
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} onAccepted={onAccepted} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-bold text-charcoal">Wholesale orders</h2>
        <p className="text-charcoal-light mt-1">
          Shipments raised from your accepted quotations. These are trade orders — they are not in the shop’s order
          history.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-charcoal/8 p-10 text-center">
          <Truck className="w-8 h-8 text-charcoal-light mx-auto mb-4" />
          <p className="text-charcoal font-medium mb-1">No wholesale orders yet</p>
          <p className="text-charcoal-light text-sm">
            When you accept a quotation, we raise the order here with its payment terms and loading plan.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-2xl border border-charcoal/8 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <span className="font-mono text-sm font-semibold text-charcoal">
                      {order.reference || `#${order.id}`}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-charcoal/5 text-charcoal-light text-xs font-semibold">
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-charcoal/5 text-charcoal-light text-xs font-semibold">
                      {order.incoterm}
                    </span>
                  </div>
                  <p className="text-sm text-charcoal-light">
                    {order.units.toLocaleString('en-US')} units · {order.pallets} pallet
                    {order.pallets === 1 ? '' : 's'}
                    {order.destinationCountry ? ` · ${order.destinationCountry}` : ''}
                    {order.destinationPort ? ` (${order.destinationPort})` : ''}
                  </p>
                </div>

                <div className="text-right">
                  {order.total !== null ? (
                    <>
                      <p className="font-serif text-xl font-bold text-charcoal">
                        {money(order.total, order.currency || currency)}
                      </p>
                      <p className="text-xs text-charcoal-light">
                        Paid {money(order.paidAmount, order.currency || currency)}
                        {order.balanceDue !== null ? ` · balance ${money(order.balanceDue, order.currency || currency)}` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-charcoal-light">Value confirmed on the proforma invoice</p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-charcoal/8 grid sm:grid-cols-2 gap-3 text-sm">
                <p className="text-charcoal-light">
                  <span className="font-medium text-charcoal">Terms: </span>
                  {order.paymentTerms || 'Confirmed per order'}
                  {order.depositPct ? ` (${order.depositPct}% deposit)` : ''}
                </p>
                <p className="text-charcoal-light sm:text-right">
                  Raised {date(order.createdAt)} · updated {date(order.updatedAt)}
                </p>
              </div>

              {order.notes ? (
                <p className="text-sm text-charcoal-light mt-3">{order.notes}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
