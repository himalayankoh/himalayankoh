'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, Minus, Pencil, Plus, Ruler } from 'lucide-react';
import type { WholesaleRow } from '@/lib/admin/wholesaleConsoleApi';
import { normalizeContainerKey } from '@/lib/wholesale/engine';
import { containerProfileFromRow, productFromRow } from '@/lib/wholesale/mapping';
import {
  MAX_PALLET_COUNT,
  MIN_PALLET_COUNT,
  containerCapacity,
  kgToLb,
  palletCapacity,
  palletCountVerdict,
  quantityCapacity,
  readPalletCount,
  type CapacityProduct,
} from '@/lib/wholesale/capacity';
import type { ContainerProfile } from '@/lib/wholesale/types';
import { Field, Notice, Panel, Select, TextInput, numberValue, rowId, text } from './ui';

/**
 * Capacity by pallet, or by container.
 *
 * ## The question the owner actually asks
 *
 * "How much fits on two pallets" and "is a 20FT enough for this order" are the two
 * planning questions, and both are answered here from the product's own saved packaging
 * profile — never from a measurement typed into this screen. Picking a product is
 * picking its measurements.
 *
 * ## Numbers, or a labelled estimate
 *
 * Every packaging field has a documented default behind it, so this screen can always
 * answer. When the profile is not fully measured the answer is labelled **Estimate**,
 * names every field still on a default, and offers the link to the packaging editor: an
 * estimate that looked like a measurement would end up in a quotation.
 *
 * ## Pallet is a mode, not a container
 *
 * Pallet capacity is its own mode with its own count (`derivePalletLayout`), not a
 * container profile wearing a different name. The container modes come from the
 * container profiles this store has configured, so a mode is only offered when there is
 * a real box behind it.
 */

/** The canonical modes, in the order a planner thinks of them. */
const CONTAINER_MODES = ['20', '40', '40hc'] as const;

function modeLabel(profile: { id: string; name: string }): string {
  return text(profile.name) || text(profile.id);
}

function tilesOf(entries: Array<[string, string]>): Array<[string, string]> {
  return entries;
}

export function CapacityPanel({
  workspace,
  onEditPackaging,
}: {
  workspace: { products: WholesaleRow[]; containerProfiles: WholesaleRow[] };
  onEditPackaging: (productRowId: number) => void;
}) {
  const products = useMemo(
    () => workspace.products.filter((product) => product.active !== false && product.active !== 0),
    [workspace.products]
  );
  /** The container modes this store can actually offer, with the profiles behind them. */
  const containerModes = useMemo(() => {
    const byKey = new Map<string, ContainerProfile>();
    for (const row of workspace.containerProfiles) {
      const profile = containerProfileFromRow(row);
      byKey.set(normalizeContainerKey(profile.id), profile);
      byKey.set(normalizeContainerKey(profile.name), profile);
    }
    return CONTAINER_MODES.map((key) => byKey.get(key))
      .filter((profile): profile is ContainerProfile => Boolean(profile))
      .map((profile) => ({ key: normalizeContainerKey(profile.id), profile }));
  }, [workspace.containerProfiles]);

  const [mode, setMode] = useState<'PALLET' | string>('PALLET');
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');
  const [palletCount, setPalletCount] = useState('2');
  const [requested, setRequested] = useState('');

  useEffect(() => {
    if (!productId && products.length) setProductId(String(rowId(products[0]) ?? ''));
  }, [products, productId]);

  // A mode the store has no profile for is not offered; if one is selected and the
  // profiles change under it, fall back to pallets rather than showing an empty screen.
  useEffect(() => {
    if (mode !== 'PALLET' && !containerModes.some((entry) => entry.key === mode)) setMode('PALLET');
  }, [mode, containerModes]);

  const productRow = products.find((row) => String(rowId(row) ?? '') === productId);
  const product: CapacityProduct | null = useMemo(
    () => (productRow ? (productFromRow(productRow) as unknown as CapacityProduct) : null),
    [productRow]
  );

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((row) => {
      const name = text(row.name).toLowerCase();
      const sku = text(row.wholesale_sku).toLowerCase();
      return name.includes(needle) || sku.includes(needle);
    });
  }, [products, search]);

  const palletReading = readPalletCount(palletCount);
  const pallets = palletReading.ok ? palletReading.count : null;
  const requestedUnits = numberValue(requested);

  const capacity = useMemo(
    () => (product && pallets !== null ? palletCapacity(product, pallets) : null),
    [product, pallets]
  );
  const quantity = useMemo(
    () => (product && requestedUnits !== null && requestedUnits > 0 ? quantityCapacity(product, requestedUnits) : null),
    [product, requestedUnits]
  );
  const verdict = useMemo(
    () =>
      product && pallets !== null && requestedUnits !== null && requestedUnits > 0
        ? palletCountVerdict({ product, pallets, requestedUnits })
        : null,
    [product, pallets, requestedUnits]
  );
  const container = useMemo(() => {
    if (mode === 'PALLET' || !product) return null;
    const entry = containerModes.find((candidate) => candidate.key === mode);
    return entry ? containerCapacity(product, entry.profile) : null;
  }, [mode, product, containerModes]);

  const basis = capacity?.basis ?? container?.basis ?? quantity?.basis ?? null;

  return (
    <div className="space-y-5 min-w-0">
      <Panel
        title="Capacity"
        description="How much of one product fits on a number of pallets, or in one container — from that product's own saved packaging profile, not from figures typed in here. Change the packaging once and every capacity on this screen follows."
      >
        <div className="space-y-4">
          <Field label="Capacity by" hint="Pallet is its own calculation; the container modes use this store's container profiles.">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode('PALLET')}
                aria-pressed={mode === 'PALLET'}
                className={`inline-flex items-center gap-2 px-3 py-2 min-h-10 rounded-full border text-sm font-medium transition-colors ${
                  mode === 'PALLET'
                    ? 'bg-himalayan-lighter text-himalayan-dark border-himalayan'
                    : 'bg-white text-charcoal-light border-charcoal/10 hover:bg-charcoal/5'
                }`}
              >
                <Layers className="w-4 h-4" />
                Pallet
              </button>
              {containerModes.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setMode(entry.key)}
                  aria-pressed={mode === entry.key}
                  className={`inline-flex items-center gap-2 px-3 py-2 min-h-10 rounded-full border text-sm font-medium transition-colors ${
                    mode === entry.key
                      ? 'bg-himalayan-lighter text-himalayan-dark border-himalayan'
                      : 'bg-white text-charcoal-light border-charcoal/10 hover:bg-charcoal/5'
                  }`}
                >
                  <Ruler className="w-4 h-4" />
                  {modeLabel(entry.profile)}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Search products" hint="Filter by name or wholesale SKU.">
            <TextInput value={search} onChange={setSearch} placeholder="Search products…" />
          </Field>

          <Field label="Product">
            <Select
              value={productId}
              onChange={setProductId}
              options={matches.map((row) => ({
                value: String(rowId(row) ?? ''),
                label: `${text(row.name)}${text(row.wholesale_sku) ? ` · ${text(row.wholesale_sku)}` : ''}`,
              }))}
            />
          </Field>

          {mode === 'PALLET' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Number of pallets">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="One fewer pallet"
                    onClick={() =>
                      setPalletCount(String(Math.max(MIN_PALLET_COUNT, (pallets ?? MIN_PALLET_COUNT) - 1)))
                    }
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-charcoal/10 bg-white text-charcoal hover:bg-charcoal/5"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="flex-1">
                    <TextInput
                      type="number"
                      value={palletCount}
                      onChange={setPalletCount}
                      placeholder="2"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="One more pallet"
                    onClick={() =>
                      setPalletCount(String(Math.min(MAX_PALLET_COUNT, (pallets ?? 0) + 1)))
                    }
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-charcoal/10 bg-white text-charcoal hover:bg-charcoal/5"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </Field>
              <Field label="Requested units" hint="Optional. Shows whether these pallets hold the order.">
                <TextInput
                  type="number"
                  value={requested}
                  onChange={setRequested}
                  placeholder="e.g. 1000"
                />
              </Field>
            </div>
          ) : null}

          {mode === 'PALLET' && !palletReading.ok ? (
            <Notice kind="error">{palletReading.message}</Notice>
          ) : null}

          {!products.length ? (
            <Notice kind="warn" title="No wholesale products">
              Add a product under Products & pricing before planning a load.
            </Notice>
          ) : null}
        </div>
      </Panel>

      {product && basis ? (
        <Panel title={`Product packaging — ${text(productRow?.name)}`}>
          <div className="space-y-4">
            {basis.basis === 'OWNER_CONFIRMED' ? (
              <Notice kind="success" title="Owner-confirmed packaging">
                Every carton and pallet figure for this product is measured, so this capacity is the factory's own.
              </Notice>
            ) : (
              <Notice kind="warn" title="Estimate — packaging data incomplete">
                <p>
                  This product is still on documented default carton and pallet figures, so the capacity below is an
                  estimate. Do not use it as a confirmed quote value.
                </p>
                <p className="mt-1 text-xs">
                  Missing: {basis.missingLabels.length ? basis.missingLabels.join(', ') : 'unit dimensions'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const id = numberValue(rowId(productRow ?? {}));
                    if (id) onEditPackaging(id);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-himalayan hover:underline"
                >
                  <Pencil className="w-3 h-3" />
                  Edit packaging
                </button>
              </Notice>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tilesOf([
                ['Unit weight', `${text(product.netUnitWeightKg)} kg`],
                ['Units per carton', String(product.packaging.cartonQty)],
                [
                  'Carton L × W × H',
                  `${product.packaging.cartonLengthCm} × ${product.packaging.cartonWidthCm} × ${product.packaging.cartonHeightCm} cm`,
                ],
                ['Carton gross weight', `${product.packaging.cartonGrossWeightKg} kg`],
                [
                  'Pallet L × W',
                  `${product.packaging.palletLengthCm} × ${product.packaging.palletWidthCm} cm`,
                ],
                ['Max stack height', `${product.packaging.maxStackHeightCm} cm`],
                [
                  'Max pallet gross weight',
                  product.packaging.maxPalletGrossWeightKg
                    ? `${product.packaging.maxPalletGrossWeightKg} kg`
                    : 'Not set',
                ],
                ['Pallet deck', `${product.packaging.palletTareKg} kg · ${product.packaging.palletDeckHeightCm} cm`],
              ]).map(([label, value]) => (
                <div key={label} className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">{label}</p>
                  <p className="font-semibold text-charcoal">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      ) : null}

      {mode === 'PALLET' && capacity ? (
        <Panel title={`${capacity.pallets} ${capacity.pallets === 1 ? 'pallet' : 'pallets'} capacity`}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tilesOf([
                ['Cartons per pallet', String(capacity.cartonsPerPallet)],
                ['Total cartons', capacity.totalCartons.toLocaleString('en-US')],
                ['Units per carton', String(capacity.unitsPerCarton)],
                ['Total units', capacity.totalUnits.toLocaleString('en-US')],
                ['Product weight', `${kgToLb(capacity.netWeightKg).toLocaleString('en-US')} lb`],
                [
                  'Loaded pallet weight',
                  `${kgToLb(capacity.loadedPalletWeightKg).toLocaleString('en-US')} lb`,
                ],
                ['Layers per pallet', String(capacity.layers)],
                ['Cartons per layer', String(capacity.cartonsPerLayer)],
                ['Space utilization', `${capacity.spaceUtilizationPct}%`],
              ]).map(([label, value]) => (
                <div key={label} className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">{label}</p>
                  <p className="font-semibold text-charcoal">{value}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-charcoal-light">
              Whole load: {capacity.grossWeightKg.toLocaleString('en-US')} kg ({kgToLb(capacity.grossWeightKg).toLocaleString('en-US')} lb) ·{' '}
              {capacity.cbm} CBM · limited by{' '}
              <span className="font-semibold text-charcoal">
                {capacity.limitingFactor === 'WEIGHT' ? 'the pallet weight ceiling' : 'the stack height'}
              </span>
              . The geometry alone would allow {capacity.cartonsPerLayer * capacity.layers} cartons a pallet
              {capacity.limitingFactor === 'WEIGHT' ? `, and the weight ceiling caps it at ${capacity.cartonsPerPallet}` : ''}.
            </p>

            {capacity.assumptions.length ? (
              <ul className="space-y-2">
                {capacity.assumptions.map((note) => (
                  <li key={note} className="text-xs text-charcoal-light leading-relaxed">
                    • {note}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {mode === 'PALLET' && quantity ? (
        <Panel title={`For ${quantity.units.toLocaleString('en-US')} units`}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tilesOf([
                ['Required cartons', quantity.cartons.toLocaleString('en-US')],
                ['Required pallets', String(quantity.palletsRequired)],
                ['Full pallets', String(quantity.fullPallets)],
                ['Last pallet utilization', `${quantity.lastPalletUtilizationPct}%`],
                ['Product weight', `${kgToLb(quantity.netWeightKg).toLocaleString('en-US')} lb`],
                ['Gross weight', `${quantity.grossWeightKg.toLocaleString('en-US')} kg`],
              ]).map(([label, value]) => (
                <div key={label} className="bg-warm-white rounded-xl p-3">
                  <p className="text-xs text-charcoal-light mb-1">{label}</p>
                  <p className="font-semibold text-charcoal">{value}</p>
                </div>
              ))}
            </div>

            {verdict ? (
              <Notice
                kind={verdict.verdict === 'SHORT' ? 'error' : 'success'}
                title={
                  verdict.verdict === 'SHORT'
                    ? `${verdict.pallets} ${verdict.pallets === 1 ? 'pallet is' : 'pallets are'} not enough`
                    : verdict.exact
                      ? `${verdict.pallets} ${verdict.pallets === 1 ? 'pallet holds' : 'pallets hold'} it exactly`
                      : `${verdict.pallets} ${verdict.pallets === 1 ? 'pallet is' : 'pallets are'} enough`
                }
              >
                {verdict.pallets} {verdict.pallets === 1 ? 'pallet' : 'pallets'}{' '}
                {verdict.pallets === 1 ? 'holds' : 'hold'} {verdict.capacityUnits.toLocaleString('en-US')} units; the
                order is{' '}
                {verdict.requestedUnits.toLocaleString('en-US')}.
                {verdict.verdict === 'SHORT'
                  ? ` Short by ${Math.abs(verdict.differenceUnits).toLocaleString('en-US')} units.`
                  : ` Excess capacity ${verdict.differenceUnits.toLocaleString('en-US')} units.`}
              </Notice>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {container ? (
        <Panel title={`${modeLabel(container.container)} capacity`}>
          <div className="space-y-4">
            {container.fits ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {tilesOf([
                  ['Total units', container.units.toLocaleString('en-US')],
                  ['Cartons', container.cartons.toLocaleString('en-US')],
                  ['Pallets', String(container.pallets)],
                  ['Weight used', `${container.weightUtilizationPct}%`],
                  ['Volume used', `${container.volumeUtilizationPct}%`],
                  ['Practical volume', `${container.practicalCbmLimit} CBM`],
                  ['Gross weight', container.grossWeightKg.toLocaleString('en-US') + ' kg'],
                  ['CBM', String(container.cbm)],
                ]).map(([label, value]) => (
                  <div key={label} className="bg-warm-white rounded-xl p-3">
                    <p className="text-xs text-charcoal-light mb-1">{label}</p>
                    <p className="font-semibold text-charcoal">{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Notice kind="error" title="Nothing fits this container">
                <ul className="space-y-1">
                  {container.warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <p className="text-xs text-charcoal-light">
              Capped by:{' '}
              <span className="font-semibold text-charcoal">{container.cappedBy}</span>
              {' — '}
              {container.limitingFactor === 'NONE'
                ? 'no cargo'
                : `within the load, ${container.limitingFactor.toLowerCase()} binds first`}
              . The container verdict is the engine&apos;s own fit check, so this is the same answer a quotation gives
              for these figures.
            </p>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
