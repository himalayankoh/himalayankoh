'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Container, Plus, Save, Trash2, Sparkles } from 'lucide-react';
import {
  calculateWholesale,
  type WholesaleCalculationResponse,
  type WholesaleRow,
} from '@/lib/admin/wholesaleConsoleApi';
import {
  Button,
  DataTable,
  Field,
  Notice,
  Panel,
  Select,
  TextArea,
  TextInput,
  Toggle,
  UtilizationGauge,
  numberValue,
  rowId,
  text,
  useWriter,
} from './ui';

/**
 * The calculators and the quote builder.
 *
 * ## One engine, three screens
 *
 * The pallet calculator, the mixed-container builder and the quote builder are the
 * same computation with different amounts of context on screen — so they call the same
 * endpoint (`/api/admin/wholesale/calculate`) rather than each doing their own sums. A
 * mix priced in the builder is therefore, by construction, the mix that gets saved onto
 * the quotation.
 *
 * ## Limits are named, never hidden
 *
 * A container that is over its weight, its practical volume or its assumed pallet
 * capacity comes back with the limiting factor named and the warnings listed. Nothing
 * is trimmed to fit and nothing is silently rounded down: an owner planning a
 * shipment has to see the overshoot.
 *
 * ## The sell side is a decision
 *
 * Margin and an explicit sell price are both offered, and the panel reports which one
 * it used. `SYSTEM_CALCULATED` and `MANUAL_OVERRIDE` are stored on the quotation, so a
 * price the owner typed over is distinguishable from one the calculator produced.
 */

function money(value: unknown, currency = 'USD'): string {
  const parsed = typeof value === 'number' ? value : numberValue(value);
  if (parsed === null) return '—';
  return `${currency} ${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CalcLine {
  productRowId: number;
  mode: 'units' | 'pallets';
  quantity: number;
}

function productName(workspace: { products: WholesaleRow[] }, id: number): string {
  const row = workspace.products.find((product) => rowId(product) === id);
  return row ? text(row.name) : `Product #${id}`;
}

function ContainerFitSummary({ fit, currency }: { fit: WholesaleCalculationResponse['calculation']['fit']; currency: string }) {
  return (
    <div className="space-y-4">
      <UtilizationGauge
        weightPct={fit.weightUtilizationPct}
        volumePct={fit.volumeUtilizationPct}
        limitingFactor={fit.limitingFactor === 'NONE' ? undefined : fit.limitingFactor}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-warm-white/80 border border-charcoal/5 rounded-xl p-3">
          <p className="text-xs text-charcoal-light mb-1">Weight capacity</p>
          <p className="font-semibold text-charcoal">{fit.weightUtilizationPct}% used</p>
          <p className="text-xs text-charcoal-light mt-0.5">Remaining {fit.remainingWeightKg.toLocaleString('en-US')} kg</p>
        </div>
        <div className="bg-warm-white/80 border border-charcoal/5 rounded-xl p-3">
          <p className="text-xs text-charcoal-light mb-1">Volume capacity</p>
          <p className="font-semibold text-charcoal">{fit.volumeUtilizationPct}% used</p>
          <p className="text-xs text-charcoal-light mt-0.5">Remaining {fit.remainingCbm} CBM</p>
        </div>
      </div>
      <div className="bg-warm-white/80 border border-charcoal/5 rounded-xl p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-charcoal-light">Limiting factor:</span>
          <span className="font-semibold text-charcoal">{fit.limitingFactor === 'NONE' ? 'None (no cargo)' : fit.limitingFactor}</span>
        </div>
        <p className="text-[11px] text-charcoal-light mt-1">
          Practical volume limit {fit.practicalCbmLimit} CBM · Raw geometric volume {fit.rawVolumeUtilizationPct}%
        </p>
      </div>
      {fit.warnings.length ? (
        <ul className="space-y-1.5 p-3 rounded-xl bg-rose-50 border border-rose-200">
          {fit.warnings.map((warning) => (
            <li key={warning} className="text-xs text-rose-700 leading-relaxed font-medium">
              ⚠ {warning}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-charcoal-light">All amounts in {currency}.</p>
    </div>
  );
}

function AiAssistantPanel({ context }: { context: unknown }) {
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<{text: string, model: string} | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');

  async function ask(action: string, customPrompt?: string) {
    setBusy(true);
    setError('');
    setResponse(null);
    try {
      const res = await fetch('/api/admin/wholesale/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, context, prompt: customPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to contact AI');
      setResponse(data);
      if (customPrompt) setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Wholesale AI Assistant" description="Context-aware AI to explain calculations or validate the shipment.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => ask('explain_pallet')} busy={busy}>Explain Pallets</Button>
          <Button variant="ghost" onClick={() => ask('why_lcl')} busy={busy}>Why LCL?</Button>
          <Button variant="ghost" onClick={() => ask('why_fcl')} busy={busy}>Why FCL?</Button>
          <Button variant="ghost" onClick={() => ask('check_shipment')} busy={busy}>Check Shipment</Button>
          <Button variant="ghost" onClick={() => ask('check_missing')} busy={busy}>Check Missing Data</Button>
          <Button variant="ghost" onClick={() => ask('draft_notes')} busy={busy}>Draft Quote Notes</Button>
        </div>
        
        <form className="flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); ask('ask', prompt); }}>
          <div className="flex-1">
            <TextInput 
              value={prompt} 
              onChange={setPrompt} 
              placeholder="Ask anything about this shipment..." 
            />
          </div>
          <Button type="submit" busy={busy}><Sparkles className="w-4 h-4" /> Ask</Button>
        </form>

        {error && <Notice kind="error">{error}</Notice>}
        
        {response && (
          <div className="p-4 bg-sage-50 rounded-xl border border-sage-200">
            <p className="text-sm whitespace-pre-wrap text-charcoal">{response.text}</p>
            <p className="text-[10px] text-sage-600 mt-3 font-medium uppercase tracking-wider">Generated by {response.model} — AI can make mistakes.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Pallet calculator                                                   */
/* ------------------------------------------------------------------ */

/**
 * One product, any quantity, in pallets.
 *
 * Deliberately not the whole container builder: the question here is "how many cartons
 * and pallets is this many units, and what does the goods cost", asked before any
 * shipment planning happens.
 */
export function PalletCalculatorPanel({
  workspace,
}: {
  workspace: { products: WholesaleRow[]; containerProfiles: WholesaleRow[]; costProfiles: WholesaleRow[]; freightRates: WholesaleRow[] };
}) {
  const products = workspace.products.filter((product) => product.active !== false && product.active !== 0);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1000');
  const [mode, setMode] = useState<'units' | 'pallets'>('units');
  const [containerId, setContainerId] = useState('');
  const [costProfileId, setCostProfileId] = useState('');
  const [result, setResult] = useState<WholesaleCalculationResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!productId && products.length) setProductId(String(rowId(products[0]) ?? ''));
    if (!containerId && workspace.containerProfiles.length) setContainerId(String(rowId(workspace.containerProfiles[0]) ?? ''));
    if (!costProfileId && workspace.costProfiles.length) setCostProfileId(String(rowId(workspace.costProfiles[0]) ?? ''));
  }, [products, workspace.containerProfiles, workspace.costProfiles, productId, containerId, costProfileId]);

  async function calculate() {
    setBusy(true);
    setError('');
    try {
      const id = numberValue(productId);
      const qty = numberValue(quantity);
      const container = numberValue(containerId);
      const costProfile = numberValue(costProfileId);
      if (!id || !qty || !container || !costProfile) {
        setError('Pick a product, a container profile and a cost profile, and enter a quantity.');
        return;
      }

      const response = await calculateWholesale({
        lines: [{ productRowId: id, ...(mode === 'units' ? { units: qty } : { pallets: qty }) }],
        containerProfileId: container,
        containers: 1,
        costProfileId: costProfile,
        incoterm: 'EXW',
      });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The calculation failed.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const line = result?.calculation.lines[0];

  return (
    <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
      <Panel title="Pallet calculator" description="Units or pallets in, cartons, kilos and CBM out — from the product's own packaging profile.">
        <div className="space-y-4">
          <Field label="Wholesale product">
            <Select
              value={productId}
              onChange={setProductId}
              options={products.map((product) => ({ value: String(rowId(product) ?? ''), label: text(product.name) }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Enter as">
              <Select
                value={mode}
                onChange={(value) => setMode(value as 'units' | 'pallets')}
                options={[
                  { value: 'units', label: 'Units' },
                  { value: 'pallets', label: 'Pallets' },
                ]}
              />
            </Field>
            <Field label={mode === 'units' ? 'Units' : 'Pallets'}>
              <TextInput type="number" value={quantity} onChange={setQuantity} />
            </Field>
          </div>

          <Field label="Container profile" hint="Used only to report how the pallets sit in a box.">
            <Select
              value={containerId}
              onChange={setContainerId}
              options={workspace.containerProfiles.map((profile) => ({
                value: String(rowId(profile) ?? ''),
                label: text(profile.name) || text(profile.code),
              }))}
            />
          </Field>

          <Field label="Cost profile" hint="Supplies the ex-works extras used in the goods and packaging lines.">
            <Select
              value={costProfileId}
              onChange={setCostProfileId}
              options={workspace.costProfiles.map((profile) => ({ value: String(rowId(profile) ?? ''), label: text(profile.name) }))}
            />
          </Field>

          {error ? <Notice kind="error">{error}</Notice> : null}

          <Button onClick={calculate} busy={busy}>
            <Calculator className="w-4 h-4" />
            Calculate
          </Button>
        </div>
      </Panel>

      <div className="space-y-6">
        {line ? (
          <Panel title={`Load — ${line.name}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {[
                ['Units', line.units.toLocaleString('en-US')],
                ['Cartons', line.cartons.toLocaleString('en-US')],
                ['Pallets', String(line.pallets)],
                ['Units per pallet', line.unitsPerPallet.toLocaleString('en-US')],
                ['Cartons per pallet', String(line.cartonsPerPallet)],
                ['Cartons per layer', `${line.cartonsPerLayer} × ${line.layers} layers`],
                ['Net weight (kg)', line.netWeightKg.toLocaleString('en-US')],
                ['Gross weight (kg)', line.grossWeightKg.toLocaleString('en-US')],
                ['CBM', line.cbm.toFixed(3)],
                ['Goods cost', money(line.merchandiseCost, result?.calculation.currency)],
              ].map(([label, value]) => (
                <div key={label} className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">{label}</p>
                  <p className="font-semibold text-charcoal">{value}</p>
                </div>
              ))}
              {line.partialPalletPct > 0 && (
                <div className="bg-warm-white rounded-xl p-3 col-span-full sm:col-span-1">
                  <p className="text-xs text-charcoal-light mb-1">Partial Pallet</p>
                  <p className="font-semibold text-charcoal">{line.palletEquivalent} eq. ({line.partialPalletPct}% of last)</p>
                </div>
              )}
            </div>

            {line.completeness && line.completeness.status !== 'COMPLETE' && (
              <div className="mb-4">
                <Notice kind={line.completeness.status === 'INCOMPLETE' ? 'error' : 'warn'}>
                  <p className="font-semibold text-sm">Packaging Profile {line.completeness.status === 'INCOMPLETE' ? 'Incomplete' : 'Needs Review'}</p>
                  <p className="text-xs mt-1">Missing: {line.completeness.missingFields.join(', ')}</p>
                </Notice>
              </div>
            )}

            {line.assumptions.length ? (
              <ul className="space-y-2">
                {line.assumptions.map((note) => (
                  <li key={note} className="text-xs text-charcoal-light leading-relaxed">
                    • {note}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        ) : null}

        {result ? (
          <Panel title="How it sits in a container">
            <ContainerFitSummary fit={result.calculation.fit} currency={result.calculation.currency} />
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mixed container / quote builder                                     */
/* ------------------------------------------------------------------ */

/**
 * The mixed container builder and the quotation it becomes.
 *
 * Saving is one write that freezes everything the quote needs: the lines with their
 * cost and packaging, the cost profile's numbers, the freight rate as it read, and the
 * exchange rate supplied. Nothing on the saved quotation points back at a live row, so
 * tomorrow's price change cannot move it.
 */
export function ContainerQuotePanel({
  workspace,
  accounts,
  focusQuoteId,
  onChanged,
  onSaved,
}: {
  workspace: {
    products: WholesaleRow[];
    containerProfiles: WholesaleRow[];
    costProfiles: WholesaleRow[];
    freightRates: WholesaleRow[];
    quotes: WholesaleRow[];
  };
  accounts: WholesaleRow[];
  focusQuoteId?: number | null;
  onChanged: () => Promise<void> | void;
  onSaved?: (quoteId: number) => void;
}) {
  const writer = useWriter();
  // Memoised: this array is a dependency of the "load a saved quotation into the
  // builder" effect below. Computed inline it was a new array on every render, so
  // that effect re-ran on every render — setting the restored lines each time, which
  // is a state change, which is another render: React's "Maximum update depth
  // exceeded". The loop also called `setResult(null)` each pass, which is why a saved
  // quotation's calculation never appeared. One stable identity fixes both.
  const activeProducts = useMemo(
    () => workspace.products.filter((product) => product.active !== false && product.active !== 0),
    [workspace.products]
  );

  const [lines, setLines] = useState<CalcLine[]>([]);
  const [pickProduct, setPickProduct] = useState('');
  const [pickMode, setPickMode] = useState<'units' | 'pallets'>('units');
  const [pickQty, setPickQty] = useState('1000');

  const [accountId, setAccountId] = useState('');
  const [containerId, setContainerId] = useState('');
  const [containers, setContainers] = useState('1');
  const [costProfileId, setCostProfileId] = useState('');
  const [freightRateId, setFreightRateId] = useState('');
  const [incoterm, setIncoterm] = useState('FOB');
  const [currency, setCurrency] = useState('USD');
  const [fxFrom, setFxFrom] = useState('PKR');
  const [fxRate, setFxRate] = useState('');
  const [marginPct, setMarginPct] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [includeDestination, setIncludeDestination] = useState(false);
  const [includeDuty, setIncludeDuty] = useState(false);
  const [destinationCountry, setDestinationCountry] = useState('');
  const [destinationPort, setDestinationPort] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState('QUOTED');

  const [result, setResult] = useState<WholesaleCalculationResponse | null>(null);
  const [calcError, setCalcError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(String(rowId(accounts[0]) ?? ''));
    if (!containerId && workspace.containerProfiles.length) setContainerId(String(rowId(workspace.containerProfiles[0]) ?? ''));
    if (!costProfileId && workspace.costProfiles.length) setCostProfileId(String(rowId(workspace.costProfiles[0]) ?? ''));
    if (!pickProduct && activeProducts.length) setPickProduct(String(rowId(activeProducts[0]) ?? ''));
  }, [accounts, workspace.containerProfiles, workspace.costProfiles, activeProducts, accountId, containerId, costProfileId, pickProduct]);

  // Opening a saved quotation from the Quotes tab loads it here rather than
  // re-pricing it inline: the owner sees the same builder that produced it.
  useEffect(() => {
    if (!focusQuoteId) return;
    const quote = workspace.quotes.find((row) => rowId(row) === focusQuoteId);
    if (!quote) return;

    const saved = Array.isArray(quote.lines) ? quote.lines : [];
    const restored: CalcLine[] = saved
      .map((entry) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const product = activeProducts.find((candidate) => text(candidate.wholesale_sku) === text(row.wholesaleSku) || text(candidate.name) === text(row.name));
        const id = rowId(product ?? null);
        if (!id) return null;
        const units = numberValue(row.units) ?? 0;
        const pallets = numberValue(row.pallets) ?? 0;
        return pallets > 0 && units > 0 && pallets * 100 < units
          ? ({ productRowId: id, mode: 'pallets' as const, quantity: pallets })
          : ({ productRowId: id, mode: 'units' as const, quantity: units });
      })
      .filter((entry): entry is CalcLine => entry !== null);

    setLines(restored);
    setEditingQuoteId(focusQuoteId);
    setIncoterm(text(quote.incoterm, 'FOB'));
    setCurrency(text(quote.currency, 'USD'));
    setContainers(String(numberValue(quote.containers) ?? 1));
    setDestinationCountry(text(quote.destination_country));
    setDestinationPort(text(quote.destination_port));
    setNotes(text(quote.notes));
    setSaveStatus(text(quote.status, 'QUOTED'));
    const account = numberValue(quote.account_id);
    if (account) setAccountId(String(account));
    const profile = numberValue(quote.container_profile_id);
    if (profile) setContainerId(String(profile));
    const cost = numberValue(quote.cost_profile_id);
    if (cost) setCostProfileId(String(cost));
    setResult(null);
  }, [focusQuoteId, workspace.quotes, activeProducts]);

  const freightOptions = useMemo(() => {
    const containerCode = text(workspace.containerProfiles.find((profile) => rowId(profile) === numberValue(containerId))?.code);
    return [
      { value: '', label: 'No ocean freight attached' },
      ...workspace.freightRates
        .filter((rate) => !containerCode || text(rate.container_type) === containerCode)
        .map((rate) => {
          const isExpired = rate.valid_until && Date.parse(text(rate.valid_until)) < Date.now();
          const sourceTag = text(rate.source, 'manual') === 'api' ? 'live API' : 'manual fallback';
          return {
            value: String(rowId(rate) ?? ''),
            label: `${text(rate.origin_port)} → ${text(rate.destination_port)} · ${text(rate.provider) || 'unknown provider'} · ${money(rate.ocean_freight, text(rate.currency, 'USD'))} (${sourceTag}${isExpired ? ' · EXPIRED' : ''})`,
          };
        }),
    ];
  }, [workspace.freightRates, workspace.containerProfiles, containerId]);

  function addLine() {
    const id = numberValue(pickProduct);
    const qty = numberValue(pickQty);
    if (!id || !qty) return;
    setLines((current) => [...current.filter((line) => line.productRowId !== id), { productRowId: id, mode: pickMode, quantity: qty }]);
    setResult(null);
  }

  function buildBody(withSave: boolean) {
    const parsedFx = numberValue(fxRate);
    return {
      accountId: numberValue(accountId) ?? undefined,
      lines: lines.map((line) => ({
        productRowId: line.productRowId,
        ...(line.mode === 'units' ? { units: line.quantity } : { pallets: line.quantity }),
      })),
      containerProfileId: numberValue(containerId) ?? 0,
      containers: numberValue(containers) ?? 1,
      costProfileId: numberValue(costProfileId) ?? 0,
      freightRateId: numberValue(freightRateId),
      incoterm,
      currency,
      fx: parsedFx ? [{ from: fxFrom.toUpperCase(), to: currency, rate: parsedFx, source: 'manual' as const }] : [],
      marginPct: numberValue(marginPct),
      sellPricePerUnit: numberValue(sellPrice),
      includeDestination,
      includeDuty,
      destinationCountry,
      destinationPort,
      ...(withSave
        ? {
            save: {
              quoteId: editingQuoteId ?? undefined,
              accountId: numberValue(accountId) ?? undefined,
              status: saveStatus,
              notes,
              validUntil,
              pricingBasis: numberValue(sellPrice) ? 'MANUAL_OVERRIDE' : 'SYSTEM_CALCULATED',
            },
          }
        : {}),
    };
  }

  async function calculate() {
    if (!lines.length) {
      setCalcError('Add at least one product line.');
      return;
    }
    setBusy(true);
    setCalcError('');
    try {
      setResult(await calculateWholesale(buildBody(false)));
    } catch (caught) {
      setCalcError(caught instanceof Error ? caught.message : 'The calculation failed.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!lines.length) {
      setCalcError('Add at least one product line.');
      return;
    }
    if (!numberValue(accountId)) {
      setCalcError('Choose the wholesale customer this quotation is for.');
      return;
    }

    const saved = await writer.run(() => calculateWholesale(buildBody(true)), 'Quotation saved with its snapshot.');
    if (saved) {
      setResult(saved);
      const id = numberValue(saved.quote?.id);
      if (id) setEditingQuoteId(id);
      await onChanged();
      if (id && onSaved) onSaved(id);
    } else {
      setCalcError(writer.error);
    }
  }

  const calculation = result?.calculation;
  const includedLines = calculation?.costLines.filter((entry) => entry.included) ?? [];
  const contextLines = calculation?.costLines.filter((entry) => entry.beyondBasis) ?? [];

  return (
    <div className="space-y-6">
      <Panel
        title={editingQuoteId ? `Quote builder — editing quotation #${editingQuoteId}` : 'Mixed container builder'}
        description="Add several products to one container and the engine sums the cartons, pallets, kilos and CBM, reports both utilizations and names the limiting constraint. Nothing is trimmed to fit: an over-full box comes back with the warning."
        actions={
          editingQuoteId ? (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingQuoteId(null);
                setLines([]);
                setResult(null);
              }}
            >
              Start a new quotation
            </Button>
          ) : null
        }
      >
        {/* `[&>*]:min-w-0` — see BusinessPanels: a grid item keeps `min-width:
            auto` by default, so a wide table would push the console pane sideways. */}
        <div className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
          <div className="space-y-4">
            <div className="grid sm:grid-cols-[1.4fr_repeat(2,minmax(0,1fr))_auto] gap-3 items-end">
              <Field label="Product">
                <Select
                  value={pickProduct}
                  onChange={setPickProduct}
                  options={activeProducts.map((product) => ({ value: String(rowId(product) ?? ''), label: text(product.name) }))}
                />
              </Field>
              <Field label="As">
                <Select
                  value={pickMode}
                  onChange={(value) => setPickMode(value as 'units' | 'pallets')}
                  options={[
                    { value: 'units', label: 'Units' },
                    { value: 'pallets', label: 'Pallets' },
                  ]}
                />
              </Field>
              <Field label="Quantity">
                <TextInput type="number" value={pickQty} onChange={setPickQty} />
              </Field>
              <Button onClick={addLine} variant="ghost">
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>

            <DataTable
              columns={[
                { key: 'product', label: 'Line', render: (line) => (
                  <span className="text-charcoal">{productName(workspace, line.productRowId)}</span>
                ) },
                { key: 'qty', label: 'Quantity', align: 'right', render: (line) => (
                  <span className="text-charcoal">
                    {line.quantity.toLocaleString('en-US')} {line.mode}
                  </span>
                ) },
                { key: 'actions', label: '', align: 'right', render: (line) => (
                  <button
                    type="button"
                    onClick={() => {
                      setLines((current) => current.filter((entry) => entry.productRowId !== line.productRowId));
                      setResult(null);
                    }}
                    className="p-1.5 rounded-lg text-charcoal-light hover:bg-red-50 hover:text-red-700"
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) },
              ]}
              rows={lines}
              rowKey={(line) => String(line.productRowId)}
              empty="No lines yet. Add a product above."
            />

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Container profile">
                <Select
                  value={containerId}
                  onChange={(value) => {
                    setContainerId(value);
                    setFreightRateId('');
                  }}
                  options={workspace.containerProfiles.map((profile) => ({
                    value: String(rowId(profile) ?? ''),
                    label: `${text(profile.name) || text(profile.code)} — ${numberValue(profile.usable_cbm) ?? 0} CBM`,
                  }))}
                />
              </Field>
              <Field label="Containers">
                <TextInput type="number" value={containers} onChange={setContainers} />
              </Field>
              <Field label="Cost profile">
                <Select
                  value={costProfileId}
                  onChange={setCostProfileId}
                  options={workspace.costProfiles.map((profile) => ({ value: String(rowId(profile) ?? ''), label: text(profile.name) }))}
                />
              </Field>
              <Field label="Ocean freight" hint="Rates are filtered to this container type. Source is shown for each.">
                <Select value={freightRateId} onChange={setFreightRateId} options={freightOptions} />
              </Field>
              <Field label="Basis">
                <Select
                  value={incoterm}
                  onChange={setIncoterm}
                  options={[
                    { value: 'EXW', label: 'EXW — goods and packaging only' },
                    { value: 'FOB', label: 'FOB — plus origin charges to the port' },
                    { value: 'CFR', label: 'CFR — plus ocean freight' },
                    { value: 'CIF', label: 'CIF — plus insurance' },
                  ]}
                />
              </Field>
              <Field label="Quote currency">
                <TextInput value={currency} onChange={setCurrency} />
              </Field>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Customer" hint="Required before a quotation can be saved.">
                <Select
                  value={accountId}
                  onChange={setAccountId}
                  options={[
                    { value: '', label: 'Choose a buyer' },
                    ...accounts.map((account) => ({ value: String(rowId(account) ?? ''), label: text(account.company) })),
                  ]}
                />
              </Field>
              <Field label="Destination country">
                <TextInput value={destinationCountry} onChange={setDestinationCountry} />
              </Field>
              <Field label="Destination port">
                <TextInput value={destinationPort} onChange={setDestinationPort} />
              </Field>
              <Field label="Valid until">
                <TextInput type="date" value={validUntil} onChange={setValidUntil} />
              </Field>
            </div>

            <div className="rounded-2xl border border-charcoal/10 bg-warm-white/50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-charcoal-light">
                Exchange rate (only needed for amounts in another currency)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From currency">
                  <TextInput value={fxFrom} onChange={setFxFrom} />
                </Field>
                <Field label={`Rate to ${currency}`} hint="Stored on the quotation as a snapshot.">
                  <TextInput type="number" value={fxRate} onChange={setFxRate} />
                </Field>
              </div>
            </div>

            <div className="rounded-2xl border border-charcoal/10 bg-warm-white/50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-charcoal-light">Sell side</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Margin %" hint="On the sell price. Ignored when a fixed price is set.">
                  <TextInput type="number" value={marginPct} onChange={setMarginPct} />
                </Field>
                <Field label={`Sell price per unit (${currency})`} hint="A manual override, recorded as such.">
                  <TextInput type="number" value={sellPrice} onChange={setSellPrice} />
                </Field>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Toggle label="Include destination charges in the total" checked={includeDestination} onChange={setIncludeDestination} />
              <Toggle label="Include duty in the total" checked={includeDuty} onChange={setIncludeDuty} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Status when saved">
                <Select
                  value={saveStatus}
                  onChange={setSaveStatus}
                  options={[
                    { value: 'DRAFT', label: 'Draft — internal only' },
                    { value: 'UNDER_REVIEW', label: 'Under review' },
                    { value: 'QUOTED', label: 'Quoted — visible to the buyer' },
                  ]}
                />
              </Field>
            </div>

            <Field label="Notes" wide>
              <TextArea value={notes} onChange={setNotes} />
            </Field>

            {calcError ? <Notice kind="error">{calcError}</Notice> : null}
            {writer.saved ? <Notice kind="success">{writer.saved}</Notice> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={calculate} variant="ghost" busy={busy}>
                <Calculator className="w-4 h-4" />
                Calculate only
              </Button>
              <Button onClick={save} busy={writer.saving}>
                <Save className="w-4 h-4" />
                {editingQuoteId ? 'Save quotation' : 'Create quotation'}
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      {/* `[&>*]:min-w-0` — see BusinessPanels: a grid item keeps `min-width: auto`
          by default, so a wide table would push the console pane sideways. */}
      {calculation ? (
        <div className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
          <Panel title="Loading plan" description={`${calculation.container.name} · ${calculation.containers} container${calculation.containers === 1 ? '' : 's'}`}>
            <DataTable
              columns={[
                { key: 'name', label: 'Product', render: (line) => <span className="text-charcoal">{line.name}</span> },
                { key: 'units', label: 'Units', align: 'right', render: (line) => <span className="text-charcoal">{line.units.toLocaleString('en-US')}</span> },
                { key: 'cartons', label: 'Cartons', align: 'right', render: (line) => <span className="text-charcoal">{line.cartons.toLocaleString('en-US')}</span> },
                { key: 'pallets', label: 'Pallets', align: 'right', render: (line) => (
                  <div>
                    <span className="text-charcoal block">{line.pallets}</span>
                    {line.partialPalletPct > 0 && <span className="text-[10px] text-charcoal-light block text-right">{line.palletEquivalent} eq.</span>}
                  </div>
                ) },
                { key: 'kg', label: 'Net kg', align: 'right', render: (line) => <span className="text-charcoal">{line.netWeightKg.toLocaleString('en-US')}</span> },
                { key: 'cbm', label: 'CBM', align: 'right', render: (line) => <span className="text-charcoal">{line.cbm.toFixed(3)}</span> },
                { key: 'status', label: 'Status', align: 'right', render: (line) => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${line.completeness.status === 'COMPLETE' ? 'bg-green-50 text-green-700' : line.completeness.status === 'NEEDS_REVIEW' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                    {line.completeness.status === 'COMPLETE' ? 'OK' : 'MISSING DATA'}
                  </span>
                )},
              ]}
              rows={calculation.lines}
              rowKey={(line) => String(line.productRowId)}
              empty="No lines."
            />
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Total units</p>
                <p className="font-semibold text-charcoal">{calculation.mixed.units.toLocaleString('en-US')}</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Total pallets</p>
                <p className="font-semibold text-charcoal">{calculation.mixed.pallets}</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Gross weight</p>
                <p className="font-semibold text-charcoal">{calculation.mixed.grossWeightKg.toLocaleString('en-US')} kg</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">CBM</p>
                <p className="font-semibold text-charcoal">{calculation.mixed.cbm.toFixed(3)}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Container utilisation" description="The limiting constraint is named rather than left to the reader.">
            {calculation.recommendation && (
              <div className="mb-6 p-4 bg-brand-navy/5 border border-brand-navy/10 rounded-xl">
                <h3 className="text-sm font-semibold text-brand-navy mb-1 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Auto / Best Fit: {calculation.recommendation.mode} Recommended
                </h3>
                <p className="text-xs text-charcoal-light">{calculation.recommendation.reason}</p>
              </div>
            )}
            
            <ContainerFitSummary fit={calculation.fit} currency={calculation.currency} />

            {calculation.comparisons && calculation.comparisons.length > 0 && (
              <div className="mt-6 pt-6 border-t border-charcoal/5">
                <p className="text-xs uppercase tracking-widest text-charcoal-light mb-3">Other Container Options</p>
                <div className="grid grid-cols-2 gap-3">
                  {calculation.comparisons.filter(c => c.container.id !== calculation.container.id).map(comp => (
                    <div key={comp.container.id} className="bg-warm-white/50 border border-charcoal/5 rounded-xl p-3">
                      <p className="text-xs font-semibold text-charcoal mb-1">{comp.container.name}</p>
                      <p className="text-[11px] text-charcoal-light">{comp.volumeUtilizationPct}% Vol · {comp.weightUtilizationPct}% Wgt</p>
                      {comp.warnings.length > 0 && <p className="text-[10px] text-rose-600 mt-1">⚠ {comp.warnings[0]}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title={`Landed cost — ${calculation.incoterm}`} description={`Cost profile ${calculation.costProfile.name}. Charges the basis includes are listed first; the rest are shown for context only.`}>
            <DataTable
              columns={[
                { key: 'label', label: 'Line', render: (line) => (
                  <div>
                    <p className="text-charcoal">{line.label}</p>
                    {line.note ? <p className="text-xs text-charcoal-light">{line.note}</p> : null}
                  </div>
                ) },
                { key: 'amount', label: 'Amount', align: 'right', render: (line) => (
                  <span className={line.included ? 'text-charcoal font-medium' : 'text-charcoal-light'}>{money(line.amount, calculation.currency)}</span>
                ) },
                { key: 'state', label: '', align: 'right', render: (line) => (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${line.included ? 'bg-green-50 text-green-700' : 'bg-charcoal/5 text-charcoal-light'}`}>
                    {line.included ? 'included' : 'context'}
                  </span>
                ) },
              ]}
              rows={[...includedLines, ...contextLines]}
              rowKey={(line) => line.key}
              empty="No cost lines."
            />

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Total ({calculation.incoterm})</p>
                <p className="font-semibold text-charcoal">{money(calculation.totals.total, calculation.currency)}</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Per unit</p>
                <p className="font-semibold text-charcoal">{money(calculation.totals.perUnit, calculation.currency)}</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Per pallet</p>
                <p className="font-semibold text-charcoal">{money(calculation.totals.perPallet, calculation.currency)}</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Per carton</p>
                <p className="font-semibold text-charcoal">{money(calculation.totals.perCarton, calculation.currency)}</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Per kg</p>
                <p className="font-semibold text-charcoal">{money(calculation.totals.perKg, calculation.currency)}</p>
              </div>
              <div className="bg-warm-white rounded-xl p-3">
                <p className="text-xs text-charcoal-light mb-1">Per container</p>
                <p className="font-semibold text-charcoal">{money(calculation.totals.perContainer, calculation.currency)}</p>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-charcoal/8">
              <p className="text-xs uppercase tracking-widest text-charcoal-light mb-2">Sources</p>
              <ul className="text-xs text-charcoal-light space-y-1">
                <li>Container profile: {calculation.container.name} (#{calculation.provenance.containerProfileId})</li>
                <li>Cost profile: {calculation.provenance.costProfileName} (#{calculation.provenance.costProfileId})</li>
                <li>
                  Ocean freight: {calculation.freight ? (
                    <>
                      <span>{calculation.freight.provider || 'unnamed'}</span>{' '}
                      <span className="font-medium text-charcoal">
                        ({calculation.freight.source === 'api' ? 'live API' : 'manual fallback'}
                        {calculation.freight.validUntil && Date.parse(calculation.freight.validUntil) < Date.now() ? ' · EXPIRED' : ''})
                      </span>
                    </>
                  ) : 'none attached'}
                  {calculation.freight?.validUntil ? ` · valid to ${calculation.freight.validUntil}` : ''}
                </li>
                <li>Exchange rates used: {calculation.provenance.fx.length ? `${calculation.provenance.fx.length} supplied` : 'none (all amounts already in the quote currency)'}</li>
              </ul>
            </div>
          </Panel>

          <Panel title="Sell side">
            {calculation.sell ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">Cost per unit</p>
                  <p className="font-semibold text-charcoal">{money(calculation.sell.costPerUnit, calculation.currency)}</p>
                </div>
                <div className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">Sell per unit</p>
                  <p className="font-semibold text-charcoal">{money(calculation.sell.sellPricePerUnit, calculation.currency)}</p>
                </div>
                <div className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">Gross profit / unit</p>
                  <p className="font-semibold text-charcoal">{money(calculation.sell.grossProfitPerUnit, calculation.currency)}</p>
                </div>
                <div className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">Margin</p>
                  <p className="font-semibold text-charcoal">{calculation.sell.marginPct}%</p>
                </div>
                <div className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">Markup</p>
                  <p className="font-semibold text-charcoal">{calculation.sell.markupPct}%</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-charcoal-light">
                No sell price is set. Enter a margin or a fixed price per unit to see the margin this quotation would carry.
              </p>
            )}
          </Panel>

          {calculation.assumptions.length ? (
            <Panel title="Assumptions" description="Everything the maths relied on, stated.">
              <ul className="space-y-2">
                {calculation.assumptions.map((note) => (
                  <li key={note} className="text-xs text-charcoal-light leading-relaxed">
                    • {note}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <AiAssistantPanel context={calculation} />
        </div>
      ) : null}
    </div>
  );
}

/** Re-exported so the workspace can label the mixed builder's icon once. */
export const ContainerIcon = Container;
