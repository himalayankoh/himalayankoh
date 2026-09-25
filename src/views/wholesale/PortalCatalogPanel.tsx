'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BadgePercent,
  Calculator,
  CheckCircle2,
  Loader2,
  Package,
  Plus,
  Send,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  portalRequest,
  type PortalCatalogItem,
  type PortalCatalogResponse,
  type PortalPlan,
  type PortalQuote,
} from '@/lib/wholesale/portalClient';
import type { BuyerFacts, DraftLine, PortalTab } from './WholesalePortalPage';

/**
 * The catalog and the quote builder.
 *
 * ## What a buyer plans with, and what they are quoted
 *
 * The catalog shows the volume ladder (the B2B prices) — never the cost the goods are
 * bought at. The builder turns quantities into cartons, pallets, kilos, CBM and
 * container utilisation, and an *indicative* goods value at those tier prices. Freight
 * and landed cost are not shown, because they are confirmed on the quotation: the
 * panel says so, next to the number, rather than letting a buyer assume a delivered
 * price.
 *
 * ## Units or pallets, never both
 *
 * A buyer thinking in pallets and a buyer thinking in units are both right, so each
 * line takes either — with the engine converting pallets to units through the
 * product's own packaging, and the button pair making the choice explicit. The API
 * refuses a line that supplies both, so a slip in this component cannot change the
 * math silently.
 *
 * ## The draft is the shell's
 *
 * The lines live in the portal shell (and survive a tab change), so this panel only
 * edits them. Submitting a request clears the draft through the same callback.
 */

const input =
  'w-full px-3.5 py-2 rounded-xl border border-charcoal/15 bg-white text-charcoal text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/40 focus:border-himalayan';

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Shortest sensible quantity for a product: one carton, or the MOQ when it is higher. */
function startingUnits(item: PortalCatalogItem): number {
  const carton = item.packaging?.unitsPerCarton ?? 1;
  return Math.max(item.moq || 0, carton);
}

export default function PortalCatalogPanel({
  tab,
  catalog,
  draft,
  onDraftChange,
  buyer,
  onSubmitted,
}: {
  tab: PortalTab;
  catalog: PortalCatalogResponse | null;
  draft: DraftLine[];
  onDraftChange: (lines: DraftLine[]) => void;
  buyer: BuyerFacts | null;
  onSubmitted: (quote: PortalQuote) => void;
}) {
  const [plan, setPlan] = useState<PortalPlan | null>(null);
  const [planError, setPlanError] = useState('');
  const [calculating, setCalculating] = useState(false);

  const [destinationCountry, setDestinationCountry] = useState(buyer?.destinationCountry ?? '');
  const [destinationPort, setDestinationPort] = useState(buyer?.destinationPort ?? '');
  const [incoterm, setIncoterm] = useState('FOB');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState<{ reference: string } | null>(null);

  // Memoised so the array identity is stable: `byId` (and anything that reads it) must
  // not be rebuilt on every render just because `catalog` starts as null.
  const items = useMemo(() => catalog?.items ?? [], [catalog]);
  const currency = catalog?.currency ?? 'USD';

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function addProduct(item: PortalCatalogItem) {
    if (draft.some((line) => line.productRowId === item.id)) {
      onDraftChange(draft.filter((line) => line.productRowId !== item.id));
      return;
    }
    onDraftChange([
      ...draft,
      {
        productRowId: item.id,
        name: item.name,
        wholesaleSku: item.wholesaleSku,
        units: item.packaging ? Math.max(startingUnits(item), item.packaging.unitsPerPallet) : startingUnits(item),
      },
    ]);
    setPlan(null);
  }

  function updateLine(productRowId: number, patch: Partial<DraftLine>) {
    onDraftChange(draft.map((line) => (line.productRowId === productRowId ? { ...line, ...patch } : line)));
    setPlan(null);
  }

  function removeLine(productRowId: number) {
    onDraftChange(draft.filter((line) => line.productRowId !== productRowId));
    setPlan(null);
  }

  async function calculate() {
    setCalculating(true);
    setPlanError('');
    try {
      const result = await portalRequest<{ plan: PortalPlan }>('/api/wholesale/quote', {
        method: 'POST',
        body: { lines: draft },
      });
      if (!result.ok || !result.data) {
        setPlanError(result.error || 'The plan could not be calculated.');
        setPlan(null);
        return;
      }
      setPlan(result.data.plan);
    } finally {
      setCalculating(false);
    }
  }

  async function submitRequest() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await portalRequest<{ quote: PortalQuote; reference: string }>('/api/wholesale/quotes', {
        method: 'POST',
        body: {
          lines: draft,
          incoterm,
          destinationCountry,
          destinationPort,
          notes,
          containerProfileId: plan?.container.id,
        },
      });
      if (!result.ok || !result.data) {
        setSubmitError(result.error || 'The request could not be submitted.');
        return;
      }
      setSubmitted({ reference: result.data.reference || result.data.quote.reference });
      onSubmitted(result.data.quote);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl border border-charcoal/8 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-charcoal mb-3">Request sent</h2>
        <p className="text-charcoal-light leading-relaxed mb-5">
          Our wholesale team has your request and will confirm freight and charges before issuing a firm quotation.
        </p>
        <p className="font-mono text-sm bg-warm-white rounded-xl px-4 py-3 inline-block mb-6">{submitted.reference}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/wholesale/quotes"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors"
          >
            View my quotations
          </Link>
          <Link
            href="/wholesale/catalog"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-charcoal/15 rounded-full font-semibold text-charcoal hover:bg-charcoal/5 transition-colors"
          >
            Keep browsing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {tab === 'catalog' ? (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-serif text-2xl font-bold text-charcoal">Wholesale catalog</h2>
              <p className="text-charcoal-light mt-1">
                {items.length} product{items.length === 1 ? '' : 's'} · prices are per unit at the volume break shown
              </p>
            </div>
            {draft.length ? (
              <Link
                href="/wholesale/quote"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-himalayan text-white rounded-full text-sm font-semibold hover:bg-himalayan-dark transition-colors"
              >
                <Calculator className="w-4 h-4" />
                Continue quote ({draft.length})
              </Link>
            ) : null}
          </div>

          {catalog === null ? (
            <div className="flex items-center gap-3 text-charcoal-light py-16 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading the wholesale catalog…
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-charcoal/8 p-10 text-center">
              <Package className="w-8 h-8 text-charcoal-light mx-auto mb-4" />
              <p className="text-charcoal font-medium mb-1">No wholesale products are listed yet</p>
              <p className="text-charcoal-light text-sm">
                Your account manager adds products to this catalog. Email us and we will set them up for you.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {items.map((item) => {
                const selected = draft.some((line) => line.productRowId === item.id);
                return (
                  <div key={item.id} className="bg-white rounded-2xl border border-charcoal/8 overflow-hidden flex flex-col">
                    <div className="h-40 bg-warm-white overflow-hidden">
                      {item.storefront.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.storefront.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-charcoal-light">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="font-semibold text-charcoal leading-snug mb-1">{item.name}</h3>
                      {item.wholesaleSku ? (
                        <p className="text-xs text-charcoal-light font-mono mb-3">{item.wholesaleSku}</p>
                      ) : null}

                      {item.tiers.length ? (
                        <ul className="text-sm text-charcoal-light space-y-1 mb-3">
                          {item.tiers.slice(0, 4).map((tier) => (
                            <li key={tier.minUnits} className="flex items-center gap-2">
                              <BadgePercent className="w-3.5 h-3.5 text-himalayan" />
                              <span>
                                {tier.minUnits.toLocaleString('en-US')}+ units ·{' '}
                                <span className="text-charcoal font-medium">{money(tier.unitPrice, tier.currency)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-charcoal-light mb-3">Price on request for this product.</p>
                      )}

                      <dl className="text-xs text-charcoal-light space-y-1 mt-auto">
                        <div className="flex justify-between">
                          <dt>Minimum order</dt>
                          <dd className="text-charcoal">{item.moq ? `${item.moq.toLocaleString('en-US')} units` : 'Per quotation'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Lead time</dt>
                          <dd className="text-charcoal">{item.leadTimeDays ? `${item.leadTimeDays} days` : 'Confirmed per order'}</dd>
                        </div>
                        {item.packaging ? (
                          <div className="flex justify-between">
                            <dt>Pallet</dt>
                            <dd className="text-charcoal">
                              {item.packaging.unitsPerPallet.toLocaleString('en-US')} units ·{' '}
                              {item.packaging.palletGrossWeightKg.toFixed(0)} kg
                            </dd>
                          </div>
                        ) : null}
                      </dl>

                      {item.estimateNote ? (
                        <p className="text-xs text-amber-700 mt-3 leading-relaxed">{item.estimateNote}</p>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => addProduct(item)}
                        className={`mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                          selected
                            ? 'bg-charcoal/5 text-charcoal hover:bg-charcoal/10'
                            : 'bg-himalayan text-white hover:bg-himalayan-dark'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        {selected ? 'Added — remove' : 'Add to quote'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'quote' ? (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
          <div className="bg-white rounded-3xl border border-charcoal/8 p-6 md:p-7">
            <h2 className="font-serif text-xl font-semibold text-charcoal mb-1">Your quote</h2>
            <p className="text-charcoal-light text-sm mb-6">
              Set a quantity in units or pallets for each line, then calculate the load.
            </p>

            {draft.length === 0 ? (
              <div className="text-center py-10">
                <Package className="w-8 h-8 text-charcoal-light mx-auto mb-4" />
                <p className="text-charcoal font-medium mb-1">No products added yet</p>
                <Link href="/wholesale/catalog" className="text-himalayan font-semibold hover:underline text-sm">
                  Browse the wholesale catalog
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {draft.map((line) => {
                  const item = byId.get(line.productRowId);
                  const perPallet = item?.packaging?.unitsPerPallet ?? 0;
                  const mode = line.pallets !== undefined ? 'pallets' : 'units';
                  return (
                    <div key={line.productRowId} className="rounded-2xl border border-charcoal/10 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-medium text-charcoal leading-snug">{line.name}</p>
                          {line.wholesaleSku ? (
                            <p className="text-xs text-charcoal-light font-mono">{line.wholesaleSku}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.productRowId)}
                          className="p-2 rounded-full text-charcoal-light hover:bg-charcoal/5"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex rounded-full border border-charcoal/15 overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.productRowId, {
                                units: line.units ?? (perPallet || 1),
                                pallets: undefined,
                              })
                            }
                            className={`px-3.5 py-1.5 text-xs font-semibold ${
                              mode === 'units' ? 'bg-himalayan text-white' : 'text-charcoal-light'
                            }`}
                          >
                            Units
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.productRowId, {
                                pallets: line.pallets ?? 1,
                                units: undefined,
                              })
                            }
                            disabled={!perPallet}
                            className={`px-3.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                              mode === 'pallets' ? 'bg-himalayan text-white' : 'text-charcoal-light'
                            }`}
                          >
                            Pallets
                          </button>
                        </div>

                        <input
                          type="number"
                          min={1}
                          className={`${input} max-w-[9rem]`}
                          value={mode === 'pallets' ? line.pallets ?? '' : line.units ?? ''}
                          onChange={(event) => {
                            const value = Math.max(1, Math.trunc(Number(event.target.value) || 0));
                            updateLine(
                              line.productRowId,
                              mode === 'pallets' ? { pallets: value } : { units: value }
                            );
                          }}
                        />

                        {item ? (
                          <span className="text-xs text-charcoal-light">
                            {item.tiers.length ? `From ${money(item.fromUnitPrice ?? 0, item.currency)}/unit at volume` : 'Price on request'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={calculate}
              disabled={!draft.length || calculating}
              className="mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 bg-charcoal text-white rounded-full font-semibold hover:bg-charcoal-light transition-colors disabled:opacity-50"
            >
              {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
              {calculating ? 'Calculating…' : 'Calculate the load'}
            </button>

            {planError ? (
              <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 mt-5">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{planError}</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            {plan ? (
              <div className="bg-white rounded-3xl border border-charcoal/8 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-himalayan" />
                  <h2 className="font-serif text-lg font-semibold text-charcoal">Loading plan</h2>
                </div>

                <p className="text-xs uppercase tracking-widest text-charcoal-light mb-3">
                  {plan.container.name} · {plan.containers} container{plan.containers === 1 ? '' : 's'}
                </p>

                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-charcoal-light text-xs uppercase tracking-wider">
                        <th className="text-left font-medium pb-2 px-2">Product</th>
                        <th className="text-right font-medium pb-2 px-2">Units</th>
                        <th className="text-right font-medium pb-2 px-2">Cartons</th>
                        <th className="text-right font-medium pb-2 px-2">Pallets</th>
                        <th className="text-right font-medium pb-2 px-2">Net kg</th>
                        <th className="text-right font-medium pb-2 px-2">CBM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.lines.map((line) => (
                        <tr key={line.productRowId} className="border-t border-charcoal/8">
                          <td className="py-2 px-2 text-charcoal">{line.name}</td>
                          <td className="py-2 px-2 text-right text-charcoal">{line.units.toLocaleString('en-US')}</td>
                          <td className="py-2 px-2 text-right text-charcoal">{line.cartons.toLocaleString('en-US')}</td>
                          <td className="py-2 px-2 text-right text-charcoal">{line.pallets}</td>
                          <td className="py-2 px-2 text-right text-charcoal">{line.netWeightKg.toLocaleString('en-US')}</td>
                          <td className="py-2 px-2 text-right text-charcoal">{line.cbm.toFixed(3)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-charcoal/15 font-semibold">
                        <td className="py-2 px-2 text-charcoal">Total</td>
                        <td className="py-2 px-2 text-right text-charcoal">{plan.totals.units.toLocaleString('en-US')}</td>
                        <td className="py-2 px-2 text-right text-charcoal">{plan.totals.cartons.toLocaleString('en-US')}</td>
                        <td className="py-2 px-2 text-right text-charcoal">{plan.totals.pallets}</td>
                        <td className="py-2 px-2 text-right text-charcoal">{plan.totals.netWeightKg.toLocaleString('en-US')}</td>
                        <td className="py-2 px-2 text-right text-charcoal">{plan.totals.cbm.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="bg-warm-white rounded-xl p-3">
                    <p className="text-xs text-charcoal-light mb-1">Weight utilization</p>
                    <p className="font-semibold text-charcoal">{plan.fit.weightUtilizationPct}%</p>
                  </div>
                  <div className="bg-warm-white rounded-xl p-3">
                    <p className="text-xs text-charcoal-light mb-1">Volume utilization</p>
                    <p className="font-semibold text-charcoal">{plan.fit.volumeUtilizationPct}%</p>
                  </div>
                  <div className="bg-warm-white rounded-xl p-3 col-span-2">
                    <p className="text-xs text-charcoal-light mb-1">Limiting factor</p>
                    <p className="font-semibold text-charcoal">{plan.fit.limitingFactor}</p>
                  </div>
                </div>

                {plan.totals.indicativeMerchandise !== null ? (
                  <div className="mt-5 pt-5 border-t border-charcoal/8">
                    <p className="text-xs uppercase tracking-widest text-charcoal-light mb-1">Indicative goods value</p>
                    <p className="font-serif text-2xl font-bold text-charcoal">
                      {money(plan.totals.indicativeMerchandise, currency)}
                    </p>
                    <p className="text-xs text-charcoal-light mt-1">
                      At your volume prices, goods only. Freight, insurance and destination charges are confirmed on our
                      quotation.
                    </p>
                    {plan.totals.hasUnpricedLines ? (
                      <p className="text-xs text-amber-700 mt-2">
                        One or more products have no volume price, so they are not in this figure.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-charcoal-light mt-5 pt-5 border-t border-charcoal/8">
                    No volume price is configured for these products yet, so we will quote them directly.
                  </p>
                )}

                {[...plan.warnings, ...plan.assumptions].length ? (
                  <ul className="mt-5 space-y-2">
                    {[...plan.warnings, ...plan.assumptions].map((note) => (
                      <li key={note} className="text-xs text-charcoal-light leading-relaxed flex gap-2">
                        <span className="text-himalayan">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="bg-white rounded-3xl border border-charcoal/8 p-6">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-4">Request a quotation</h2>

              <label className="block text-sm font-medium text-charcoal mb-1.5" htmlFor="incoterm">
                Price basis
              </label>
              <select
                id="incoterm"
                className={`${input} mb-4`}
                value={incoterm}
                onChange={(event) => setIncoterm(event.target.value)}
              >
                <option value="EXW">EXW — ex works</option>
                <option value="FOB">FOB — free on board</option>
                <option value="CFR">CFR — cost and freight</option>
                <option value="CIF">CIF — cost, insurance and freight</option>
              </select>

              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5" htmlFor="dc">
                    Destination country
                  </label>
                  <input
                    id="dc"
                    className={input}
                    value={destinationCountry}
                    onChange={(event) => setDestinationCountry(event.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5" htmlFor="dp">
                    Destination port
                  </label>
                  <input
                    id="dp"
                    className={input}
                    value={destinationPort}
                    onChange={(event) => setDestinationPort(event.target.value)}
                  />
                </div>
              </div>

              <label className="block text-sm font-medium text-charcoal mb-1.5" htmlFor="notes">
                Notes for our team
              </label>
              <textarea
                id="notes"
                rows={3}
                className={`${input} mb-4`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Packing, labelling, delivery window, anything else…"
              />

              {submitError ? (
                <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 mb-4">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">{submitError}</p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={submitRequest}
                disabled={!draft.length || submitting}
                className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? 'Sending…' : 'Send request for quotation'}
              </button>
              <p className="text-xs text-charcoal-light mt-3 leading-relaxed">
                Sending a request does not commit you to anything. We confirm freight and issue a firm quotation, which
                you accept when you are ready.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
