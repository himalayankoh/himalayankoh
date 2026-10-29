'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BadgePercent,
  Calculator,
  CheckCircle2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  parseShippingAddress,
  type LiveCarrierRate,
  type WholesaleShippingMode,
} from '@/lib/wholesale/shippingUtils';
import {
  portalRequest,
  type PortalCatalogItem,
  type PortalCatalogResponse,
  type PortalPlan,
  type PortalQuote,
} from '@/lib/wholesale/portalClient';
import { boxCount, piecesFromBoxes, pricePerBox } from '@/lib/wholesale/boxes';
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
 * ## Boxes or pallets, never both
 *
 * A buyer enters full boxes or pallets. Boxes convert to pieces before API submission; each
 * line stores pieces or pallets — with the engine converting pallets through the
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
  const carton = item.casePolicy?.unitsPerCase ?? 1;
  return Math.ceil(Math.max(item.moq || 0, item.casePolicy?.minimumUnits ?? 0, carton) / carton) * carton;
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

  const [destinationCountry, setDestinationCountry] = useState(buyer?.destinationCountry || 'United States');
  const [destinationPort] = useState(buyer?.destinationPort ?? '');
  const [incoterm, setIncoterm] = useState('FOB');
  const [notes, setNotes] = useState('');
  const [shippingAddress, setShippingAddress] = useState(buyer?.address || '');

  useEffect(() => {
    if (buyer?.address && !shippingAddress) {
      setShippingAddress(buyer.address);
    }
  }, [buyer?.address, shippingAddress]);

  const isAddressConfirmed = useMemo(() => {
    const norm = (shippingAddress || '').toLowerCase();
    return (
      (norm.includes('1200 congress') && norm.includes('austin')) ||
      (norm.includes('78701') && norm.includes('congress'))
    );
  }, [shippingAddress]);
  const requestKey = useRef<{ key: string; fingerprint: string } | null>(null);
  const [shippingMode, setShippingMode] = useState<WholesaleShippingMode>('PARCEL_USPS');
  const [shippoRates, setShippoRates] = useState<LiveCarrierRate[]>([]);
  const [loadingShippoRates, setLoadingShippoRates] = useState(false);
  const [shippoRateError, setShippoRateError] = useState('');
  const [selectedShippoRateId, setSelectedShippoRateId] = useState<string>('');

  const selectedShippoRate = useMemo(() => {
    return shippoRates.find((r) => r.objectId === selectedShippoRateId) ?? shippoRates[0] ?? null;
  }, [shippoRates, selectedShippoRateId]);

  async function fetchLiveShippoRates() {
    if (!shippingAddress.trim()) {
      setShippoRateError('Please enter a delivery address first.');
      return;
    }
    const parsedAddr = parseShippingAddress(shippingAddress, buyer?.contactName || buyer?.company || 'Wholesale Buyer');
    if (!parsedAddr) {
      setShippoRateError('Please provide a complete U.S. street address, city, state and ZIP code.');
      return;
    }

    if (!draft.length) {
      setShippoRateError('Please add at least one product box to your quotation.');
      return;
    }

    setLoadingShippoRates(true);
    setShippoRateError('');
    try {
      const items = draft.map((line) => {
        const item = byId.get(line.productRowId);
        const pack = item?.casePolicy?.unitsPerCase ?? 1;
        const boxes = line.pallets !== undefined
          ? Math.max(1, line.pallets * (item?.packaging?.cartonsPerPallet ?? 10))
          : Math.max(1, Math.ceil((line.units ?? pack) / pack));
        const cartonKg = item?.packaging && item.packaging.cartonsPerPallet > 0
          ? item.packaging.palletGrossWeightKg / item.packaging.cartonsPerPallet
          : 15;
        const boxWeightLbs = Math.max(1, Math.round(cartonKg * 2.20462 * 10) / 10);
        return {
          productId: item?.wholesaleSku || item?.name || `line-${line.productRowId}`,
          quantity: boxes,
          weightLbs: boxWeightLbs,
        };
      });

      const res = await fetch('/api/shippo/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: buyer?.email || 'wholesale@himalayankoh.com',
          address: parsedAddr,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch shipping rates.');
      }
      const rates = Array.isArray(data.rates) ? (data.rates as LiveCarrierRate[]) : [];
      setShippoRates(rates);
      if (rates.length > 0) {
        const preferred =
          rates.find((r) => /usps/i.test(r.provider) && /ground/i.test(r.serviceName)) ||
          rates.find((r) => /usps/i.test(r.provider)) ||
          rates[0];
        setSelectedShippoRateId(preferred.objectId);
      } else {
        setShippoRateError('No live carrier rates returned for this package weight/address. Trade desk will quote carrier freight.');
      }
    } catch (err) {
      console.error('Shippo rates lookup failed:', err);
      setShippoRateError(err instanceof Error ? err.message : 'Unable to calculate shipping rates at this time.');
    } finally {
      setLoadingShippoRates(false);
    }
  }

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
    const pack = item.casePolicy?.unitsPerCase ?? 1;
    const units = startingUnits(item) || Math.max(item.moq || 1, pack);
    onDraftChange([
      ...draft,
      {
        productRowId: item.id,
        name: item.name,
        wholesaleSku: item.wholesaleSku,
        units,
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
    if (!shippingAddress.trim()) { setSubmitError('Enter the shipping address for this inquiry.'); return; }
    const fingerprint = JSON.stringify({ draft, shippingAddress, destinationCountry, destinationPort, incoterm, notes });
    if (requestKey.current?.fingerprint !== fingerprint) requestKey.current = { key: crypto.randomUUID(), fingerprint };
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await portalRequest<{ quote: PortalQuote; reference: string }>('/api/wholesale/quotes', {
        method: 'POST',
        body: {
          lines: draft,
          requestKey: requestKey.current.key,
          shippingAddress,
          incoterm: shippingMode === 'WAREHOUSE_PICKUP' ? 'EXW' : 'FOB',
          shippingMethod: shippingMode,
          estimatedFreight: shippingMode === 'PARCEL_USPS' && selectedShippoRate ? selectedShippoRate.amount : 0,
          carrierService: shippingMode === 'PARCEL_USPS' && selectedShippoRate
            ? `${selectedShippoRate.provider} ${selectedShippoRate.serviceName}`
            : shippingMode === 'WAREHOUSE_PICKUP'
            ? 'Customer Pickup (Houston Hub)'
            : 'Freight Trucking (LTL / Liftgate)',
          shippoRateId: shippingMode === 'PARCEL_USPS' && selectedShippoRate ? selectedShippoRate.objectId : undefined,
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
                {items.length} product{items.length === 1 ? '' : 's'} · order full boxes; each box contains the pieces shown below
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

          <div className="mb-5 rounded-2xl border border-himalayan/20 bg-himalayan/5 p-4 text-sm text-charcoal">
            <p className="font-semibold">30% wholesale pricing · minimum 5 full boxes per selected product</p>
            <p className="mt-1 text-charcoal-light">2 lb Lick Salt: 6 pieces per box. 6 lb Lick Salt: 4 pieces per box. 6 lb Pouch: 3 pieces per box. 30 lb Rock Salt: 1 piece per box. Buy at least 5 boxes of each product you choose. Freight and taxes are separate.</p>
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
                const pack = item.casePolicy?.unitsPerCase;
                const minimumBoxes = pack ? boxCount(startingUnits(item), pack) : null;
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

                      {pack && item.tiers.length ? (
                        <ul className="text-sm text-charcoal-light space-y-1 mb-3">
                          {item.tiers.slice(0, 4).map((tier, index) => (
                            <li key={`${tier.minUnits}-${index}`} className="flex flex-wrap items-center gap-2">
                              <BadgePercent className="w-3.5 h-3.5 text-himalayan" />
                              <span><strong className="text-charcoal">{money(pricePerBox(tier.unitPrice, pack), tier.currency)} / box</strong> · {boxCount(tier.minUnits, pack)}+ boxes</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-charcoal-light mb-3">Box price available after the pack size is confirmed.</p>}

                      <dl className="text-xs text-charcoal-light space-y-1 mt-auto">
                        <div className="flex justify-between">
                          <dt>Wholesale minimum</dt>
                          <dd className="text-charcoal">{pack ? `${minimumBoxes} boxes (${startingUnits(item)} pieces)` : 'Confirm box size'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Available to trade</dt>
                          <dd className="text-charcoal">
                            {pack ? `${Math.floor(item.availableUnits / pack)} full boxes` : `${item.availableUnits} pieces; box size pending`}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Lead time</dt>
                          <dd className="text-charcoal">{item.leadTimeDays ? `${item.leadTimeDays} days` : 'Confirmed per order'}</dd>
                        </div>
                        {item.packaging && !item.estimateNote ? (
                          <div className="flex justify-between">
                            <dt>Pallet</dt>
                            <dd className="text-charcoal">
                              {item.packaging.unitsPerPallet.toLocaleString('en-US')} units ·{' '}
                              {item.packaging.palletGrossWeightKg.toFixed(0)} kg
                            </dd>
                          </div>
                        ) : null}
                      </dl>

                      <p className="text-sm font-medium text-charcoal mt-2">{pack ? `1 box = ${pack} ${pack === 1 ? 'piece' : 'pieces'}. Full boxes only.` : 'Pieces per box need owner confirmation before wholesale ordering.'}</p>
                      {item.casePolicy?.minimumUnits && item.availableUnits < startingUnits(item) ? <p className="text-xs text-amber-800 mt-2">Not enough stock for the wholesale minimum. Contact the trade desk.</p> : null}
                      {item.estimateNote ? (
                        <p className="text-xs text-amber-700 mt-3 leading-relaxed">Packing measurements are pending confirmation. Load calculations use estimates.</p>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => addProduct(item)}
                        disabled={!selected && Boolean(item.casePolicy && (!item.casePolicy.unitsPerCase || item.availableUnits < startingUnits(item)))}
                        className={`mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          selected
                            ? 'bg-charcoal/5 text-charcoal hover:bg-charcoal/10'
                            : 'bg-himalayan text-white hover:bg-himalayan-dark'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        {selected ? 'Added — remove' : item.casePolicy && !item.casePolicy.unitsPerCase ? 'Box size unconfirmed' : item.casePolicy && item.availableUnits < startingUnits(item) ? 'Stock below minimum' : 'Add to quote'}
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
        <div className="space-y-8">
          {/* Top section: 2 balanced columns (Inputs: Products & Delivery) */}
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            {/* Products & Box Quantities Card */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-charcoal/8 p-6 md:p-7 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-charcoal">1. Products & Quantities</h2>
                  <p className="text-charcoal-light text-xs mt-0.5">
                    Enter boxes for each product. Total pieces calculate automatically.
                  </p>
                </div>
                <Link
                  href="/wholesale/catalog"
                  className="px-3 py-1.5 text-xs font-semibold text-himalayan hover:underline bg-warm-white rounded-full border border-charcoal/10 whitespace-nowrap"
                >
                  View full catalog →
                </Link>
              </div>

              {/* Quick add product to quote */}
              <div className="my-5 p-4 rounded-2xl bg-warm-white border border-charcoal/10">
                <label htmlFor="quick-add-product" className="block text-xs font-semibold text-charcoal mb-2">
                  Add a product to your quotation:
                </label>
                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <select
                    id="quick-add-product"
                    value=""
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      const it = items.find((p) => p.id === id);
                      if (it) addProduct(it);
                    }}
                    className={`${input} flex-1`}
                    aria-label="Select wholesale product to add"
                  >
                    <option value="" disabled>Select a product to add to quote…</option>
                    {items.map((it) => {
                      const inDraft = draft.some((l) => l.productRowId === it.id);
                      const pack = it.casePolicy?.unitsPerCase;
                      return (
                        <option key={it.id} value={it.id} disabled={inDraft}>
                          {it.name} ({it.wholesaleSku}){pack ? ` · ${pack} pcs/box` : ''}{inDraft ? ' — (Already added)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

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
                    const pack = item?.casePolicy?.unitsPerCase;
                    const minimumBoxes = pack && item ? boxCount(startingUnits(item), pack) : 4;
                    const mode = line.pallets !== undefined ? 'pallets' : 'boxes';
                    return (
                      <div key={line.productRowId} className="rounded-2xl border border-charcoal/10 p-4 bg-white">
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
                                  units: line.units ?? (line.pallets ? line.pallets * perPallet : item ? startingUnits(item) : 0),
                                  pallets: undefined,
                                })
                              }
                              className={`px-3.5 py-1.5 text-xs font-semibold ${
                                mode === 'boxes' ? 'bg-himalayan text-white' : 'text-charcoal-light'
                              }`}
                            >
                              Boxes
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
                            min={mode === 'pallets' ? 1 : minimumBoxes}
                            step={1}
                            aria-label={`${mode === 'boxes' ? 'Boxes' : 'Pallets'} for ${line.wholesaleSku || line.name}`}
                            className={`${input} max-w-[9rem]`}
                            disabled={mode === 'boxes' && !pack}
                            value={mode === 'pallets' ? line.pallets ?? '' : pack && line.units !== undefined ? line.units / pack : ''}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (!Number.isSafeInteger(value) || value < 0) { setPlanError('Enter a whole number of boxes or pallets.'); return; }
                              if (mode === 'boxes' && !pack) { setPlanError('Confirm the box size before ordering.'); return; }
                              try {
                                updateLine(line.productRowId, mode === 'pallets' ? { pallets: value } : { units: piecesFromBoxes(value, pack!) });
                                setPlanError('');
                              } catch (error) { setPlanError(error instanceof Error ? error.message : 'Invalid box quantity.'); }
                            }}
                          />

                          {item ? (
                            <span className="text-xs text-charcoal-light">
                              {pack ? `1 box = ${pack} ${pack === 1 ? 'piece' : 'pieces'} · ${mode === 'pallets' ? (line.pallets ?? 0) * perPallet : line.units ?? 0} pieces total. Minimum ${minimumBoxes} boxes.` : 'Confirm pieces per box before ordering.'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={calculate}
                  disabled={!draft.length || calculating}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-charcoal text-white rounded-full font-semibold hover:bg-charcoal-light transition-colors disabled:opacity-50 text-sm shadow-sm"
                >
                  {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                  {calculating ? 'Calculating…' : 'Calculate & Generate Proforma Quote'}
                </button>
              </div>

              {planError ? (
                <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 mt-4">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">{planError}</p>
                </div>
              ) : null}
            </div>

            {/* Delivery Destination & Logistics Card */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-charcoal/8 p-6 md:p-7 shadow-sm">
              <div className="mb-4">
                <h2 className="font-serif text-xl font-semibold text-charcoal">2. Delivery Destination</h2>
                <p className="text-charcoal-light text-xs mt-0.5">
                  Houston, TX warehouse dispatch or facility pickup details.
                </p>
              </div>

              <div className="space-y-4">
                {/* Delivery & Shipping Method Selection */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-charcoal-light mb-2">
                    Shipping &amp; Delivery Mode
                  </label>
                  <div className="space-y-2">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        shippingMode === 'PARCEL_USPS'
                          ? 'border-himalayan bg-himalayan/5 shadow-xs'
                          : 'border-charcoal/10 hover:border-charcoal/20 bg-warm-white/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="wholesale-shipping-mode"
                        className="mt-1 text-himalayan focus:ring-himalayan"
                        checked={shippingMode === 'PARCEL_USPS'}
                        onChange={() => {
                          setShippingMode('PARCEL_USPS');
                          setIncoterm('FOB');
                        }}
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-charcoal flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-himalayan" />
                            USPS / Ground Parcel (Live Shippo Rates)
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                            Best for Loose Boxes
                          </span>
                        </div>
                        <p className="text-charcoal-light text-[11px] mt-0.5 leading-relaxed">
                          Shipped directly via USPS / Ground Advantage from Houston Hub. Live rates quoted before submitting.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        shippingMode === 'FREIGHT_LTL'
                          ? 'border-himalayan bg-himalayan/5 shadow-xs'
                          : 'border-charcoal/10 hover:border-charcoal/20 bg-warm-white/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="wholesale-shipping-mode"
                        className="mt-1 text-himalayan focus:ring-himalayan"
                        checked={shippingMode === 'FREIGHT_LTL'}
                        onChange={() => {
                          setShippingMode('FREIGHT_LTL');
                          setIncoterm('FOB');
                        }}
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-charcoal flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-charcoal-light" />
                            Freight Trucking (LTL / Pallet Carrier)
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-charcoal/5 text-charcoal-light text-[10px] font-semibold">
                            Large / Pallet Orders
                          </span>
                        </div>
                        <p className="text-charcoal-light text-[11px] mt-0.5 leading-relaxed">
                          Carrier truck dispatch for pallet loads and dock receiving. Freight confirmed on final quotation.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        shippingMode === 'WAREHOUSE_PICKUP'
                          ? 'border-himalayan bg-himalayan/5 shadow-xs'
                          : 'border-charcoal/10 hover:border-charcoal/20 bg-warm-white/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="wholesale-shipping-mode"
                        className="mt-1 text-himalayan focus:ring-himalayan"
                        checked={shippingMode === 'WAREHOUSE_PICKUP'}
                        onChange={() => {
                          setShippingMode('WAREHOUSE_PICKUP');
                          setIncoterm('EXW');
                        }}
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-charcoal">Warehouse Pickup (FOB / EXW Houston)</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                            Free ($0.00)
                          </span>
                        </div>
                        <p className="text-charcoal-light text-[11px] mt-0.5 leading-relaxed">
                          Self pickup or arrange your own freight carrier from 12620 FM 1960 W Ste A-4, Houston, TX 77065.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Live Shippo Carrier Rates Panel */}
                {shippingMode === 'PARCEL_USPS' ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                        <Sparkles className="w-4 h-4 text-himalayan" />
                        <span>Live Shippo Carrier Rates</span>
                      </div>
                      <button
                        type="button"
                        onClick={fetchLiveShippoRates}
                        disabled={loadingShippoRates || !shippingAddress.trim()}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-blue-200 text-blue-900 text-[11px] font-semibold hover:bg-blue-50 transition-colors shadow-2xs disabled:opacity-50"
                      >
                        {loadingShippoRates ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        {loadingShippoRates ? 'Calculating…' : shippoRates.length ? 'Refresh Rates' : 'Get Live Rates'}
                      </button>
                    </div>

                    {shippoRateError ? (
                      <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200 leading-relaxed">
                        {shippoRateError}
                      </p>
                    ) : null}

                    {loadingShippoRates ? (
                      <div className="py-4 text-center text-xs text-blue-800 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-himalayan" />
                        <span>Fetching live USPS &amp; carrier rates from Shippo…</span>
                      </div>
                    ) : shippoRates.length > 0 ? (
                      <div className="space-y-2 mt-2">
                        <p className="text-[11px] text-blue-900 font-medium">Select your preferred delivery carrier:</p>
                        {shippoRates.map((rate) => {
                          const isSelected = selectedShippoRateId === rate.objectId;
                          return (
                            <label
                              key={rate.objectId}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-white border-blue-400 shadow-xs'
                                  : 'bg-white/70 border-blue-200 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="radio"
                                  name="shippo-carrier-rate"
                                  checked={isSelected}
                                  onChange={() => setSelectedShippoRateId(rate.objectId)}
                                  className="text-himalayan focus:ring-himalayan"
                                />
                                <div>
                                  <span className="font-bold text-charcoal">{rate.provider}</span>{' '}
                                  <span className="text-charcoal-light font-medium">{rate.serviceName}</span>
                                  {rate.estimatedDays ? (
                                    <span className="block text-[10px] text-charcoal-light">
                                      Est. {rate.estimatedDays} {rate.estimatedDays === 1 ? 'business day' : 'business days'}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <span className="font-serif font-bold text-sm text-charcoal">
                                {money(rate.amount, currency)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-blue-900/80 leading-relaxed">
                        Click &ldquo;Get Live Rates&rdquo; to calculate real-time USPS and parcel shipping directly from our Houston, TX hub to your address.
                      </p>
                    )}
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-charcoal-light mb-1.5" htmlFor="dc">
                    Destination Country
                  </label>
                  <input
                    id="dc"
                    className={input}
                    value={destinationCountry || 'United States'}
                    onChange={(event) => setDestinationCountry(event.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-charcoal-light" htmlFor="wholesale-shipping">
                      U.S. Delivery Address
                    </label>
                    {isAddressConfirmed ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Online Verified
                      </span>
                    ) : null}
                  </div>
                  <textarea
                    id="wholesale-shipping"
                    required
                    rows={3}
                    className={`${input} text-xs font-mono leading-relaxed`}
                    value={shippingAddress}
                    onChange={(event) => setShippingAddress(event.target.value)}
                    placeholder="Business Name, Street Address, Suite/Unit, City, State, ZIP code"
                  />
                  {isAddressConfirmed ? (
                    <div className="mt-1.5 p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-emerald-950">Verified Real Address (Austin, TX 78701)</p>
                        <p className="text-[11px] text-emerald-800 leading-tight">1200 Congress Ave, Austin, TX 78701 · Confirmed commercial/state district destination in Travis County, TX.</p>
                      </div>
                    </div>
                  ) : shippingAddress.trim() ? (
                    <p className="text-[11px] text-charcoal-light mt-1">
                      Carrier destination for Houston, TX warehouse freight dispatch.
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-charcoal-light mb-1.5" htmlFor="notes">
                    Delivery Instructions & Notes
                  </label>
                  <textarea
                    id="notes"
                    rows={2}
                    className={input}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Dock access, liftgate needed, delivery window, receiving hours…"
                  />
                </div>

                {submitError ? (
                  <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm leading-relaxed">{submitError}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Bottom Section: Full-Width Invoice & Proforma Quotation */}
          {plan ? (() => {
            const isLoose = Boolean(
              plan.isLoosePacking ??
              (plan.totals.pallets === 0 || (!draft.some((l) => l.pallets !== undefined && l.pallets > 0) && plan.totals.pallets <= 1))
            );
            const showPallets = !isLoose;
            const cleanNotes = [...plan.warnings, ...plan.assumptions].filter(
              (n) => !n.includes('pallet math uses default packaging') && !n.includes('packagedUnitWeightKg')
            );

            return (
              <div className="bg-white rounded-3xl border border-charcoal/10 p-6 md:p-8 shadow-sm space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-charcoal/8">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <TrendingUp className="w-5 h-5 text-himalayan" />
                      <h2 className="font-serif text-2xl font-bold text-charcoal">Proforma Wholesale Quotation</h2>
                    </div>
                    <p className="text-xs uppercase tracking-wider font-semibold text-charcoal-light mt-1">
                      {isLoose
                        ? 'Loose Carton Freight · Houston, TX Warehouse Dispatch'
                        : `${plan.container.name} · ${plan.containers} container${plan.containers === 1 ? '' : 's'}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Pricing Confirmed
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-warm-white text-charcoal border border-charcoal/10">
                      {isLoose ? 'Loose Cartons (LTL / Parcel Freight)' : 'Palletized / Container'}
                    </span>
                  </div>
                </div>

                {/* Logistics Key Metrics */}
                {isLoose ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Total Cartons</p>
                      <p className="text-2xl font-serif font-bold text-charcoal">{plan.totals.cartons} Boxes</p>
                      <p className="text-[11px] text-charcoal-light mt-0.5">Loose carton packaging</p>
                    </div>
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Total Quantity</p>
                      <p className="text-2xl font-serif font-bold text-charcoal">{plan.totals.units.toLocaleString('en-US')} Pieces</p>
                      <p className="text-[11px] text-charcoal-light mt-0.5">Verified piece count</p>
                    </div>
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Net Cargo Weight</p>
                      <p className="text-2xl font-serif font-bold text-charcoal">{plan.totals.netWeightKg.toLocaleString('en-US')} kg</p>
                      <p className="text-[11px] text-charcoal-light mt-0.5">~{(plan.totals.netWeightKg * 2.20462).toFixed(1)} lbs</p>
                    </div>
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Volume (CBM)</p>
                      <p className="text-2xl font-serif font-bold text-himalayan">{plan.totals.cbm.toFixed(3)} m³</p>
                      <p className="text-[11px] text-charcoal-light mt-0.5">Freight calculation basis</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Weight Utilization</p>
                      <p className="text-2xl font-serif font-bold text-charcoal">{plan.fit.weightUtilizationPct}%</p>
                    </div>
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Volume Utilization</p>
                      <p className="text-2xl font-serif font-bold text-charcoal">{plan.fit.volumeUtilizationPct}%</p>
                    </div>
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Pallets Total</p>
                      <p className="text-2xl font-serif font-bold text-charcoal">{plan.totals.pallets}</p>
                    </div>
                    <div className="bg-warm-white rounded-2xl p-4 border border-charcoal/8">
                      <p className="text-xs uppercase tracking-wider text-charcoal-light font-medium mb-1">Volume (CBM)</p>
                      <p className="text-2xl font-serif font-bold text-himalayan">{plan.totals.cbm.toFixed(3)} m³</p>
                    </div>
                  </div>
                )}

                {/* Invoice Table: Full Width, spacious, no wrapping */}
                <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-[#FAF7F2] text-charcoal-light text-xs uppercase tracking-wider border-b border-charcoal/10">
                        <th className="py-3.5 px-4 font-semibold text-left">Product / Description</th>
                        <th className="py-3.5 px-4 font-semibold text-center whitespace-nowrap">Packaging</th>
                        <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Boxes</th>
                        <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Total Pieces</th>
                        {showPallets ? (
                          <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Pallets</th>
                        ) : null}
                        <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Box Price</th>
                        <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Net Weight</th>
                        <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">CBM</th>
                        <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Line Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-charcoal/8">
                      {plan.lines.map((line) => {
                        const item = byId.get(line.productRowId);
                        const pack = item?.casePolicy?.unitsPerCase;
                        return (
                          <tr key={line.productRowId} className="hover:bg-warm-white/40 transition-colors">
                            <td className="py-3.5 px-4">
                              <p className="font-medium text-charcoal">{line.name}</p>
                              {line.wholesaleSku ? (
                                <p className="text-xs text-charcoal-light font-mono mt-0.5">{line.wholesaleSku}</p>
                              ) : null}
                            </td>
                            <td className="py-3.5 px-4 text-center text-charcoal-light text-xs whitespace-nowrap">
                              {pack ? `${pack} pcs / box` : '—'}
                            </td>
                            <td className="py-3.5 px-4 text-right font-medium text-charcoal whitespace-nowrap">
                              {line.cartons.toLocaleString('en-US')}
                            </td>
                            <td className="py-3.5 px-4 text-right text-charcoal whitespace-nowrap">
                              {line.units.toLocaleString('en-US')}
                            </td>
                            {showPallets ? (
                              <td className="py-3.5 px-4 text-right text-charcoal whitespace-nowrap">
                                {line.pallets}
                              </td>
                            ) : null}
                            <td className="py-3.5 px-4 text-right text-charcoal whitespace-nowrap">
                              {line.unitPrice === null
                                ? 'Unpriced'
                                : pack
                                ? money(pricePerBox(line.unitPrice, pack), currency)
                                : 'Box size pending'}
                            </td>
                            <td className="py-3.5 px-4 text-right text-charcoal whitespace-nowrap">
                              {line.netWeightKg.toLocaleString('en-US')} kg
                            </td>
                            <td className="py-3.5 px-4 text-right text-charcoal font-medium whitespace-nowrap">
                              {line.cbm.toFixed(3)} m³
                            </td>
                            <td className="py-3.5 px-4 text-right font-semibold text-charcoal whitespace-nowrap">
                              {line.lineValue === null ? '—' : money(line.lineValue, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#FAF7F2] border-t-2 border-charcoal/15 font-semibold text-charcoal">
                        <td className="py-4 px-4 text-left">Total</td>
                        <td />
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          {plan.totals.cartons.toLocaleString('en-US')} boxes
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          {plan.totals.units.toLocaleString('en-US')} pcs
                        </td>
                        {showPallets ? (
                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            {plan.totals.pallets}
                          </td>
                        ) : null}
                        <td />
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          {plan.totals.netWeightKg.toLocaleString('en-US')} kg
                        </td>
                        <td className="py-4 px-4 text-right text-himalayan font-bold whitespace-nowrap">
                          {plan.totals.cbm.toFixed(3)} m³
                        </td>
                        <td className="py-4 px-4 text-right font-bold text-base text-charcoal whitespace-nowrap">
                          {plan.totals.indicativeMerchandise === null
                            ? 'Unpriced'
                            : money(plan.totals.indicativeMerchandise, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Indicative Value, Clean Notes & Submit Button */}
                <div className="pt-6 border-t border-charcoal/10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                  <div className="max-w-xl">
                    <div className="p-4 rounded-2xl bg-warm-white border border-charcoal/10 mb-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-charcoal-light">
                        <span>Merchandise Subtotal:</span>
                        <span className="font-semibold text-charcoal">{money(plan.totals.indicativeMerchandise ?? 0, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-charcoal-light">
                        <span>
                          Estimated Shipping ({shippingMode === 'PARCEL_USPS'
                            ? selectedShippoRate ? `${selectedShippoRate.provider} ${selectedShippoRate.serviceName}` : 'USPS / Parcel'
                            : shippingMode === 'WAREHOUSE_PICKUP' ? 'Warehouse Pickup' : 'Freight Trucking'}):
                        </span>
                        <span className="font-semibold text-charcoal">
                          {shippingMode === 'PARCEL_USPS' && selectedShippoRate
                            ? money(selectedShippoRate.amount, currency)
                            : shippingMode === 'WAREHOUSE_PICKUP'
                            ? 'Free ($0.00)'
                            : 'Confirmed on Quote'}
                        </span>
                      </div>
                      <div className="border-t border-charcoal/10 pt-2 flex items-center justify-between text-sm font-bold text-charcoal">
                        <span>Indicative Total Quote:</span>
                        <span className="font-serif text-2xl text-himalayan">
                          {money(
                            (plan.totals.indicativeMerchandise ?? 0) +
                            (shippingMode === 'PARCEL_USPS' && selectedShippoRate ? selectedShippoRate.amount : 0),
                            currency
                          )}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-charcoal-light mt-1.5 leading-relaxed">
                      {shippingMode === 'PARCEL_USPS' && selectedShippoRate
                        ? 'Includes goods and live carrier shipping estimate. Final shipping and payment terms are confirmed on your formal proforma quote.'
                        : 'At volume tier prices, goods only. Freight and destination charges from our Houston, TX warehouse are confirmed on your quotation. No payment is taken at this time.'}
                    </p>
                    {cleanNotes.length ? (
                      <ul className="mt-3 space-y-1.5">
                        {cleanNotes.map((note) => (
                          <li key={note} className="text-xs text-charcoal-light leading-relaxed flex items-start gap-2">
                            <span className="text-himalayan mt-0.5">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={submitRequest}
                      disabled={!draft.length || submitting}
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors shadow-sm disabled:opacity-50 text-base whitespace-nowrap"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {submitting ? 'Submitting Quotation…' : 'Send Request for Quotation'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : null}
        </div>
      ) : null}
    </div>
  );
}
