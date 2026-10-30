'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Boxes,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import {
  ADMIN_TD,
  AdminButton,
  AdminChip,
  AdminField,
  AdminInput,
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatTile,
  AdminTable,
  AdminTableSkeleton,
  AdminTabs,
} from '@/components/admin/AdminUI';
import WholesaleInventoryPanel from './WholesaleInventoryPanel';
import { boxCount, pricePerBox } from '@/lib/wholesale/boxes';
import { readCasePolicy, packagingObject, casePolicyProblem } from '@/lib/wholesale/casePolicy';
import { SELECT, TEXTAREA } from '@/components/admin/adminTheme';
import {
  fetchWholesaleConsole,
  listWholesaleResource,
  removeWholesaleRecord,
  saveWholesaleRecord,
  type WholesaleRow,
} from '@/lib/admin/wholesaleConsoleApi';

type Filter = 'all' | 'active' | 'inactive';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All Products' },
  { id: 'active', label: 'Offered' },
  { id: 'inactive', label: 'Hidden' },
];

interface Draft {
  id: number | null;
  name: string;
  wholesale_sku: string;
  woo_product_id: string;
  woo_variation_id: string;
  moq: string;
  case_units: string;
  minimum_cases: string;
  minimum_pieces: string;
  available_units: string;
  active: boolean;
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: '',
  wholesale_sku: '',
  woo_product_id: '',
  woo_variation_id: '',
  moq: '',
  case_units: '',
  minimum_cases: '5',
  minimum_pieces: '0',
  available_units: '',
  active: true,
  notes: '',
};

function text(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? value : String(value);
}

function num(value: unknown): number {
  const parsed = Number(text(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function draftFrom(row: WholesaleRow): Draft {
  const policy = readCasePolicy(row.packaging);
  return {
    id: Number(row.id ?? 0) || null,
    name: text(row.name),
    wholesale_sku: text(row.wholesale_sku),
    woo_product_id: text(row.woo_product_id) === '0' ? '' : text(row.woo_product_id),
    woo_variation_id: num(row.woo_variation_id) ? String(num(row.woo_variation_id)) : '',
    moq: num(row.moq) ? String(num(row.moq)) : '',
    case_units: policy?.unitsPerCase ? String(policy.unitsPerCase) : '',
    minimum_cases: String(policy?.minimumCases ?? 5),
    minimum_pieces: String(policy?.minimumPieces ?? 0),
    available_units: num(row.available_units) ? String(num(row.available_units)) : '',
    active: Boolean(Number(row.active ?? 0)),
    notes: text(row.notes),
  };
}

export default function WholesaleProductsPage() {
  const [products, setProducts] = useState<WholesaleRow[]>([]);
  const [tiers, setTiers] = useState<WholesaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [basePrice, setBasePrice] = useState('');
  const [newTier, setNewTier] = useState({ minUnits: '', unitPrice: '' });
  const [checked, setChecked] = useState<number[]>([]);
  const [bulk, setBulk] = useState({ price: '', available: '', moq: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productsRes, tiersRes] = await Promise.all([
        listWholesaleResource('products', { limit: 200 }),
        listWholesaleResource('price_tiers', { limit: 500 }),
      ]);
      const productItems = productsRes.items ?? [];
      const tierItems = tiersRes.items ?? [];
      setProducts(productItems);
      setTiers(tierItems);
      setSelectedId((current) => {
        if (current && productItems.some((row) => Number(row.id) === current)) return current;
        return productItems[0] ? Number(productItems[0].id) : null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The wholesale catalogue could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => products.find((row) => Number(row.id) === selectedId) ?? null,
    [products, selectedId]
  );

  const selectedTiers = useMemo(() => {
    if (!selected) return [];
    return tiers
      .filter((tier) => Number(tier.product_id) === Number(selected.id))
      .slice()
      .sort((left, right) => num(left.min_units) - num(right.min_units));
  }, [tiers, selected]);

  const activeCount = useMemo(
    () => products.filter((row) => Number(row.active ?? 0)).length,
    [products]
  );

  const configuredPackCount = useMemo(
    () =>
      products.filter((row) => {
        const policy = readCasePolicy(row.packaging);
        return Boolean(policy?.unitsPerCase && policy.unitsPerCase > 0);
      }).length,
    [products]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((row) => {
      const active = Boolean(Number(row.active ?? 0));
      if (filter === 'active' && !active) return false;
      if (filter === 'inactive' && active) return false;
      if (!needle) return true;
      return [text(row.name), text(row.wholesale_sku), text(row.woo_product_id)].join(' ').toLowerCase().includes(needle);
    });
  }, [products, filter, query]);

  function unitPriceFor(productId: number): number {
    const unit = tiers.find((tier) => Number(tier.product_id) === productId && num(tier.min_units) === 1);
    if (unit) return num(unit.unit_price);
    const lowest = tiers
      .filter((tier) => Number(tier.product_id) === productId)
      .sort((left, right) => num(left.min_units) - num(right.min_units))[0];
    return lowest ? num(lowest.unit_price) : 0;
  }

  function openNew() {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setBasePrice('');
    setError('');
    setIsDrawerOpen(true);
  }

  function openEdit(row: WholesaleRow) {
    const id = Number(row.id);
    setSelectedId(id);
    setDraft(draftFrom(row));
    const unit = tiers
      .filter((tier) => Number(tier.product_id) === id)
      .sort((a, b) => num(a.min_units) - num(b.min_units))
      .map((tier) => num(tier.unit_price))[0];
    setBasePrice(unit ? String(unit) : '');
    setError('');
    setIsDrawerOpen(true);
  }

  async function saveProduct() {
    if (!draft.name.trim()) {
      setError('The wholesale product needs a name.');
      return;
    }
    const packaging = {
      ...packagingObject(selected?.packaging),
      wholesaleCases: {
        unitsPerCase: draft.case_units.trim() ? Number(draft.case_units) : null,
        minimumCases: Number(draft.minimum_cases),
        minimumPieces: Number(draft.minimum_pieces),
      },
    };
    const policyError = casePolicyProblem(packaging);
    if (policyError) {
      setError(policyError);
      return;
    }
    const caseMinimum = readCasePolicy(packaging)?.minimumUnits ?? 0;
    setBusy('SAVE');
    setError('');
    setNotice('');
    try {
      const saved = await saveWholesaleRecord(
        'products',
        {
          name: draft.name.trim(),
          wholesale_sku: draft.wholesale_sku.trim(),
          woo_product_id: Number(draft.woo_product_id) || 0,
          woo_variation_id: Number(draft.woo_variation_id) || 0,
          moq: caseMinimum,
          packaging,
          available_units: Number(draft.available_units) || 0,
          active: draft.active ? 1 : 0,
          notes: draft.notes,
        },
        draft.id ?? undefined
      );

      const productId = Number(saved.id ?? draft.id ?? 0);
      const price = Number(basePrice);
      if (productId && Number.isFinite(price) && price > 0) {
        const existing = tiers
          .filter((tier) => Number(tier.product_id) === productId)
          .sort((a, b) => num(a.min_units) - num(b.min_units))[0];
        if (!existing || num(existing.unit_price) !== price || num(existing.min_units) !== Math.max(1, caseMinimum)) {
          await saveWholesaleRecord(
            'price_tiers',
            {
              product_id: productId,
              min_units: Math.max(1, caseMinimum),
              unit_price: price,
              currency: text(saved.currency) || 'USD',
            },
            existing ? Number(existing.id) : undefined
          );
        }
      }

      setNotice('The wholesale product was saved successfully.');
      setSelectedId(productId);
      setIsDrawerOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The product could not be saved.');
    } finally {
      setBusy('');
    }
  }

  async function toggleActive(row: WholesaleRow) {
    const id = Number(row.id);
    setBusy(`TOGGLE-${id}`);
    setError('');
    setNotice('');
    try {
      await saveWholesaleRecord('products', { active: Number(row.active ?? 0) ? 0 : 1 }, id);
      await load();
      setNotice('Wholesale availability updated.');
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'The product could not be updated.');
    } finally {
      setBusy('');
    }
  }

  async function addTier() {
    if (!selected) return;
    const minUnits = Number(newTier.minUnits);
    const unitPrice = Number(newTier.unitPrice);
    const policy = readCasePolicy(selected.packaging);
    const baseMinimum = Math.max(1, num(selected.moq), policy?.minimumUnits ?? 0);
    if (!Number.isSafeInteger(minUnits) || minUnits <= baseMinimum || (policy?.unitsPerCase && minUnits % policy.unitsPerCase !== 0)) {
      setError('A volume break must exceed the base minimum and use full cases.');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setError('Enter the price for that volume break.');
      return;
    }
    setBusy('TIER');
    setError('');
    try {
      await saveWholesaleRecord('price_tiers', {
        product_id: Number(selected.id),
        min_units: minUnits,
        unit_price: unitPrice,
        currency: text(selected.currency) || 'USD',
      });
      setNewTier({ minUnits: '', unitPrice: '' });
      await load();
      setNotice('The volume break was added.');
    } catch (tierError) {
      setError(tierError instanceof Error ? tierError.message : 'The volume break could not be saved.');
    } finally {
      setBusy('');
    }
  }

  async function deleteTier(id: number) {
    if (!window.confirm('Remove this volume break?')) return;
    setBusy(`TIER-${id}`);
    setError('');
    try {
      await removeWholesaleRecord('price_tiers', id);
      await load();
      setNotice('The volume break was removed.');
    } catch (tierError) {
      setError(tierError instanceof Error ? tierError.message : 'The volume break could not be removed.');
    } finally {
      setBusy('');
    }
  }

  async function applyBulk() {
    if (!checked.length) return;
    const price = bulk.price.trim() ? Number(bulk.price) : null;
    const available = bulk.available.trim() ? Number(bulk.available) : null;
    const moq = bulk.moq.trim() ? Number(bulk.moq) : null;
    if (price !== null && (!Number.isFinite(price) || price <= 0)) {
      setError('The bulk price must be a positive number.');
      return;
    }
    if (!window.confirm(`Apply these values to ${checked.length} wholesale product(s)?`)) return;

    setBusy('BULK');
    setError('');
    setNotice('');
    let failed = 0;
    for (const id of checked) {
      try {
        if (available !== null || moq !== null) {
          await saveWholesaleRecord(
            'products',
            {
              ...(available !== null ? { available_units: available } : {}),
              ...(moq !== null ? { moq } : {}),
            },
            id
          );
        }
        if (price !== null) {
          const existing = tiers.filter((tier) => Number(tier.product_id) === id).sort((a, b) => num(a.min_units) - num(b.min_units))[0];
          const product = products.find((row) => Number(row.id) === id);
          const minimum = Math.max(1, num(product?.moq), readCasePolicy(product?.packaging)?.minimumUnits ?? 0);
          await saveWholesaleRecord(
            'price_tiers',
            { product_id: id, min_units: minimum, unit_price: price, currency: 'USD' },
            existing ? Number(existing.id) : undefined
          );
        }
      } catch {
        failed += 1;
      }
    }
    setChecked([]);
    setBulk({ price: '', available: '', moq: '' });
    await load();
    setBusy('');
    setNotice(
      failed
        ? `${checked.length - failed} product(s) updated; ${failed} could not be saved.`
        : `${checked.length} product(s) updated successfully.`
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Wholesale"
        title="Wholesale Products"
        description="Manage B2B trade pricing, case pack sizes, and dealer allocations across your catalog."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminButton variant="secondary" icon={RefreshCw} onClick={() => void load()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </AdminButton>
            <AdminButton variant="primary" icon={Plus} onClick={openNew}>
              New wholesale product
            </AdminButton>
          </div>
        }
      />

      {error ? (
        <AdminNotice tone="danger" title="Notice">
          {error}
        </AdminNotice>
      ) : null}
      {notice ? (
        <AdminNotice tone="info" title="Success">
          {notice}
        </AdminNotice>
      ) : null}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatTile
          label="Wholesale Products"
          icon={Package}
          tone="brand"
          value={loading ? undefined : products.length}
          hint={loading ? undefined : `${activeCount} active in portal`}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Offered in Portal"
          icon={CheckCircle2}
          tone="green"
          value={loading ? undefined : activeCount}
          hint={loading ? undefined : `${products.length - activeCount} hidden from portal`}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Case Packs Verified"
          icon={Boxes}
          tone="sky"
          value={loading ? undefined : `${configuredPackCount} / ${products.length}`}
          hint={loading ? undefined : configuredPackCount === products.length ? 'All pack counts set' : `${products.length - configuredPackCount} unconfirmed`}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Volume Discount Tiers"
          icon={Layers}
          tone="violet"
          value={loading ? undefined : tiers.length}
          hint={loading ? undefined : 'Volume price tiers active'}
          unavailable={loading ? 'Reading…' : undefined}
        />
      </div>

      {/* Full-width Catalogue Table */}
      <div className="w-full">
        <AdminPanel
          title="Product Catalogue"
          description={`Showing ${visible.length} of ${products.length} product(s)`}
          bodyClassName="p-0"
        >
          <div className="border-b border-admin-line px-4 py-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AdminTabs tabs={FILTERS} active={filter} onChange={(id) => setFilter(id as Filter)} />
              <div className="flex items-center gap-2 rounded-lg border border-admin-line bg-admin-surface px-3 py-1.5 w-full sm:w-80">
                <Search size={15} className="text-admin-muted shrink-0" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, SKU, or WooCommerce ID…"
                  className="w-full bg-transparent text-sm text-admin-ink outline-none placeholder:text-admin-muted"
                  aria-label="Search wholesale products"
                />
              </div>
            </div>
          </div>

          {/* Bulk Update Bar */}
          {checked.length ? (
            <div className="border-b border-admin-line bg-himalayan-lighter/50 px-4 py-3">
              <p className="text-xs font-semibold text-himalayan-dark mb-2">{checked.length} selected — bulk update</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-admin-muted">
                  Piece Price ($)
                  <input
                    className={`${SELECT} mt-1 w-28`}
                    value={bulk.price}
                    onChange={(event) => setBulk({ ...bulk, price: event.target.value })}
                    inputMode="decimal"
                    placeholder="—"
                  />
                </label>
                <label className="text-xs text-admin-muted">
                  Allocation
                  <input
                    className={`${SELECT} mt-1 w-28`}
                    value={bulk.available}
                    onChange={(event) => setBulk({ ...bulk, available: event.target.value })}
                    inputMode="numeric"
                    placeholder="—"
                  />
                </label>
                <label className="text-xs text-admin-muted">
                  MOQ (pcs)
                  <input
                    className={`${SELECT} mt-1 w-24`}
                    value={bulk.moq}
                    onChange={(event) => setBulk({ ...bulk, moq: event.target.value })}
                    inputMode="numeric"
                    placeholder="—"
                  />
                </label>
                <AdminButton variant="primary" icon={Save} onClick={() => void applyBulk()} disabled={busy === 'BULK'}>
                  {busy === 'BULK' ? 'Applying…' : 'Apply'}
                </AdminButton>
                <AdminButton variant="ghost" onClick={() => setChecked([])}>
                  Clear
                </AdminButton>
              </div>
            </div>
          ) : null}

          <AdminTable
            columns={[
              { key: 'select', label: '', width: '40px' },
              { key: 'product', label: 'Product & SKU', width: '260px' },
              { key: 'link', label: 'Retail Link', width: '90px' },
              { key: 'pack', label: 'Pack Size', width: '110px' },
              { key: 'price', label: 'Piece Price', align: 'right', width: '95px' },
              { key: 'box_price', label: 'Box Price', align: 'right', width: '95px' },
              { key: 'moq', label: 'Minimum Order', align: 'right', width: '130px' },
              { key: 'stock', label: 'Allocation', align: 'right', width: '100px' },
              { key: 'active', label: 'Status', align: 'center', width: '95px' },
              { key: 'action', label: 'Action', align: 'right', width: '80px' },
            ]}
            minWidth="1020px"
          >
            {loading ? (
              <AdminTableSkeleton rows={6} columns={10} />
            ) : visible.length ? (
              visible.map((row) => {
                const id = Number(row.id);
                const policy = readCasePolicy(row.packaging);
                const caseUnits = policy?.unitsPerCase ?? null;
                const unitPrice = unitPriceFor(id);
                const boxPriceVal = caseUnits && unitPrice > 0 ? pricePerBox(unitPrice, caseUnits) : 0;
                const moqUnits = policy?.minimumUnits ?? num(row.moq);
                const moqBoxes = caseUnits ? boxCount(moqUnits, caseUnits) : null;
                const available = num(row.available_units);
                const isActive = Boolean(Number(row.active ?? 0));

                return (
                  <tr
                    key={id}
                    className="cursor-pointer transition-colors hover:bg-admin-canvas/60"
                    onClick={() => openEdit(row)}
                  >
                    <td className={`${ADMIN_TD} w-10 py-2.5`} onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${text(row.name)}`}
                        checked={checked.includes(id)}
                        onChange={(event) =>
                          setChecked((current) =>
                            event.target.checked ? [...current, id] : current.filter((entry) => entry !== id)
                          )
                        }
                      />
                    </td>
                    <td className={`${ADMIN_TD} max-w-[260px] py-2.5`}>
                      <div className="font-semibold text-admin-ink leading-snug">{text(row.name) || 'Unnamed Product'}</div>
                      <div className="font-mono text-xs text-admin-muted truncate mt-0.5">{text(row.wholesale_sku) || 'No SKU'}</div>
                    </td>
                    <td className={`${ADMIN_TD} whitespace-nowrap py-2.5`}>
                      {num(row.woo_product_id) ? (
                        <a
                          href={`/admin/products?search=${encodeURIComponent(text(row.name))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-admin-line bg-admin-canvas px-2 py-0.5 text-xs font-medium text-admin-ink hover:border-admin-ink transition-colors"
                          title="View WooCommerce Product"
                        >
                          #{text(row.woo_product_id)}
                          <ExternalLink size={11} className="text-admin-muted shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-admin-muted">—</span>
                      )}
                    </td>
                    <td className={`${ADMIN_TD} whitespace-nowrap py-2.5`}>
                      {caseUnits ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-admin-ink">
                          <Package size={13} className="text-admin-muted shrink-0" />
                          {caseUnits} {caseUnits === 1 ? 'pc / box' : 'pcs / box'}
                        </span>
                      ) : (
                        <span className="whitespace-nowrap text-xs text-amber-600 font-medium">Pending pack</span>
                      )}
                    </td>
                    <td className={`${ADMIN_TD} text-right whitespace-nowrap py-2.5`}>
                      {unitPrice > 0 ? (
                        <span className="font-semibold text-admin-ink">{money(unitPrice)}</span>
                      ) : (
                        <span className="text-xs text-admin-muted">—</span>
                      )}
                    </td>
                    <td className={`${ADMIN_TD} text-right whitespace-nowrap py-2.5`}>
                      {boxPriceVal > 0 ? (
                        <span className="font-semibold text-himalayan-dark">{money(boxPriceVal)}</span>
                      ) : (
                        <span className="text-xs text-admin-muted">—</span>
                      )}
                    </td>
                    <td className={`${ADMIN_TD} text-right whitespace-nowrap py-2.5`}>
                      {caseUnits && moqBoxes ? (
                        <span className="text-xs text-admin-ink font-medium whitespace-nowrap">
                          {moqBoxes} {moqBoxes === 1 ? 'box' : 'boxes'} ({moqUnits} pcs)
                        </span>
                      ) : moqUnits > 0 ? (
                        <span className="text-xs text-admin-muted whitespace-nowrap">{moqUnits} pcs</span>
                      ) : (
                        <span className="text-xs text-admin-muted">—</span>
                      )}
                    </td>
                    <td className={`${ADMIN_TD} text-right whitespace-nowrap py-2.5`}>
                      {available > 0 ? (
                        <span className="font-mono text-xs text-admin-ink whitespace-nowrap">{available} pcs</span>
                      ) : (
                        <span className="text-xs text-admin-muted whitespace-nowrap">Live stock</span>
                      )}
                    </td>
                    <td className={`${ADMIN_TD} text-center whitespace-nowrap py-2.5`} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void toggleActive(row)}
                        disabled={busy === `TOGGLE-${id}`}
                        className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-admin-line bg-admin-canvas text-admin-muted hover:text-admin-ink'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-admin-muted'}`} />
                        {isActive ? 'Offered' : 'Hidden'}
                      </button>
                    </td>
                    <td className={`${ADMIN_TD} text-right whitespace-nowrap py-2.5`} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-admin-line bg-admin-surface px-2.5 py-1 text-xs font-medium text-admin-ink hover:bg-admin-canvas hover:border-admin-ink transition-colors"
                      >
                        <Edit3 size={12} className="shrink-0" />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className={ADMIN_TD} colSpan={10}>
                  <div className="py-12 text-center text-sm text-admin-muted">
                    <Package size={32} className="mx-auto mb-2 text-admin-muted/40" />
                    No wholesale products match this view.
                  </div>
                </td>
              </tr>
            )}
          </AdminTable>
        </AdminPanel>
      </div>

      {/* Slide-over Drawer for Edit / New Product */}
      <AnimatePresence>
        {isDrawerOpen && (
          <AdminModal
            variant="drawer"
            className="sm:max-w-xl md:max-w-2xl"
            title={
              <div className="flex items-center gap-2">
                <span>{draft.id ? 'Edit Wholesale Product' : 'New Wholesale Product'}</span>
                {draft.id ? (
                  <AdminChip tone="brand">#{draft.id}</AdminChip>
                ) : (
                  <AdminChip tone="info">New</AdminChip>
                )}
              </div>
            }
            description={
              draft.id
                ? draft.name || draft.wholesale_sku || `Product #${draft.id}`
                : 'Configure B2B trade pricing and case packaging.'
            }
            onClose={() => setIsDrawerOpen(false)}
            footer={
              <div className="flex w-full items-center justify-between">
                <div>
                  {draft.id ? (
                    <a
                      href={`/admin/products?search=${encodeURIComponent(draft.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-admin-muted hover:text-admin-ink transition-colors"
                    >
                      View retail product <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <AdminButton variant="ghost" onClick={() => setIsDrawerOpen(false)}>
                    Cancel
                  </AdminButton>
                  <AdminButton
                    variant="primary"
                    icon={Save}
                    onClick={() => void saveProduct()}
                    disabled={busy === 'SAVE'}
                  >
                    {busy === 'SAVE' ? 'Saving…' : 'Save Product'}
                  </AdminButton>
                </div>
              </div>
            }
          >
            <div className="space-y-6">
              {error ? (
                <AdminNotice tone="danger" title="Save issue">
                  {error}
                </AdminNotice>
              ) : null}

              {/* Product Identity */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-muted">Product Identity</h3>
                <AdminField label="Product Name" htmlFor="wp-name">
                  <AdminInput
                    id="wp-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Himalayan Pink Salt Licks for Horses 2 lbs"
                  />
                </AdminField>

                <div className="grid gap-3 sm:grid-cols-3">
                  <AdminField label="Wholesale SKU" htmlFor="wp-sku">
                    <AdminInput
                      id="wp-sku"
                      value={draft.wholesale_sku}
                      onChange={(e) => setDraft({ ...draft, wholesale_sku: e.target.value })}
                      placeholder="HK-LFH-2lbs"
                    />
                  </AdminField>
                  <AdminField label="WooCommerce ID" htmlFor="wp-woo" hint="Retail product #">
                    <AdminInput
                      id="wp-woo"
                      value={draft.woo_product_id}
                      onChange={(e) => setDraft({ ...draft, woo_product_id: e.target.value })}
                      inputMode="numeric"
                      placeholder="e.g. 2543"
                    />
                  </AdminField>
                  <AdminField label="Variation ID" htmlFor="wp-var" hint="Optional">
                    <AdminInput
                      id="wp-var"
                      value={draft.woo_variation_id}
                      onChange={(e) => setDraft({ ...draft, woo_variation_id: e.target.value })}
                      inputMode="numeric"
                      placeholder="e.g. 2545"
                    />
                  </AdminField>
                </div>
              </div>

              <hr className="border-admin-line" />

              {/* Packaging & Pricing */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-muted">Packaging & Wholesale Pricing</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField label="Wholesale Piece Price (USD)" htmlFor="wp-price">
                    <AdminInput
                      id="wp-price"
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </AdminField>
                  <AdminField label="Pieces per Box" htmlFor="wp-case-units">
                    <AdminInput
                      id="wp-case-units"
                      type="number"
                      min={1}
                      step={1}
                      value={draft.case_units}
                      onChange={(e) => setDraft({ ...draft, case_units: e.target.value })}
                      placeholder="e.g. 6"
                    />
                  </AdminField>
                  <AdminField label="Minimum Boxes per Order" htmlFor="wp-min-cases">
                    <AdminInput
                      id="wp-min-cases"
                      type="number"
                      min={1}
                      step={1}
                      value={draft.minimum_cases}
                      onChange={(e) => setDraft({ ...draft, minimum_cases: e.target.value })}
                    />
                  </AdminField>
                  <AdminField label="Extra Minimum Pieces" htmlFor="wp-min-pieces" hint="Optional">
                    <AdminInput
                      id="wp-min-pieces"
                      type="number"
                      min={0}
                      step={1}
                      value={draft.minimum_pieces}
                      onChange={(e) => setDraft({ ...draft, minimum_pieces: e.target.value })}
                    />
                  </AdminField>
                </div>

                {/* Pricing Calculation Summary Card */}
                <div className="rounded-xl border border-admin-line bg-admin-canvas/70 p-3.5 text-xs text-admin-ink space-y-1">
                  {Number(draft.case_units) > 0 ? (
                    <>
                      <div className="flex items-center justify-between font-semibold text-sm">
                        <span>1 box = {draft.case_units} {Number(draft.case_units) === 1 ? 'piece' : 'pieces'}</span>
                        <span className="text-himalayan-dark">
                          {money(pricePerBox(Number(basePrice) || 0, Number(draft.case_units)))} / box
                        </span>
                      </div>
                      <p className="text-admin-muted">
                        Unit price: {money(Number(basePrice) || 0)} · MOQ:{' '}
                        {boxCount(
                          readCasePolicy({
                            wholesaleCases: {
                              unitsPerCase: Number(draft.case_units),
                              minimumCases: Number(draft.minimum_cases),
                              minimumPieces: Number(draft.minimum_pieces),
                            },
                          })?.minimumUnits ?? 0,
                          Number(draft.case_units)
                        )}{' '}
                        boxes (
                        {readCasePolicy({
                          wholesaleCases: {
                            unitsPerCase: Number(draft.case_units),
                            minimumCases: Number(draft.minimum_cases),
                            minimumPieces: Number(draft.minimum_pieces),
                          },
                        })?.minimumUnits ?? 0}{' '}
                        pcs)
                      </p>
                    </>
                  ) : (
                    <p className="text-admin-muted">Enter pieces per box to calculate box pricing and minimum orders.</p>
                  )}
                </div>
              </div>

              <hr className="border-admin-line" />

              {/* Allocation & Visibility */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-muted">Allocation & Portal Visibility</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField
                    label="Wholesale Allocation (Pieces)"
                    hint="0 uses live WooCommerce stock"
                    htmlFor="wp-units"
                  >
                    <AdminInput
                      id="wp-units"
                      value={draft.available_units}
                      onChange={(e) => setDraft({ ...draft, available_units: e.target.value })}
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </AdminField>
                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2.5 text-sm font-medium text-admin-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                        className="h-4 w-4 rounded border-admin-line text-himalayan-dark focus:ring-himalayan-dark"
                      />
                      Offer to approved wholesale buyers
                    </label>
                  </div>
                </div>
              </div>

              {/* Live Inventory Sync (if linked to WooCommerce) */}
              {selected && num(selected.woo_product_id) > 0 ? (
                <>
                  <hr className="border-admin-line" />
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-admin-muted">Live Inventory</h3>
                    <WholesaleInventoryPanel
                      key={`${selected.id}:${selected.woo_product_id}:${selected.woo_variation_id}`}
                      productId={num(selected.woo_product_id)}
                      variationId={num(selected.woo_variation_id)}
                      sku={text(selected.wholesale_sku)}
                      piecesPerBox={readCasePolicy(selected.packaging)?.unitsPerCase ?? null}
                    />
                  </div>
                </>
              ) : null}

              {/* Volume Pricing Tiers */}
              {selected ? (
                <>
                  <hr className="border-admin-line" />
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-admin-muted">Volume Pricing Tiers</h3>
                    <div className="space-y-2">
                      {selectedTiers.length ? (
                        selectedTiers.map((tier) => (
                          <div
                            key={String(tier.id)}
                            className="flex items-center justify-between rounded-lg border border-admin-line bg-admin-surface px-3 py-2 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-admin-ink">
                                {num(tier.min_units)}+ units
                              </span>
                              <span className="text-admin-muted ml-2">
                                {money(num(tier.unit_price))} / unit
                              </span>
                            </div>
                            {String(tier.id) === String(selectedTiers[0]?.id) ? (
                              <AdminChip tone="brand">Base Rate</AdminChip>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void deleteTier(Number(tier.id))}
                                disabled={busy === `TIER-${Number(tier.id)}`}
                                className="rounded p-1 text-admin-muted hover:bg-admin-canvas hover:text-red-600 transition-colors"
                                aria-label="Remove tier"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-admin-muted">Base wholesale price applies to all quantities.</p>
                      )}
                    </div>

                    <div className="flex items-end gap-2 pt-2">
                      <div className="flex-1">
                        <label className="text-[11px] font-medium text-admin-muted">
                          Min Units
                          <input
                            className={`${SELECT} mt-1 text-xs`}
                            value={newTier.minUnits}
                            onChange={(e) => setNewTier({ ...newTier, minUnits: e.target.value })}
                            inputMode="numeric"
                            placeholder="e.g. 50"
                          />
                        </label>
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] font-medium text-admin-muted">
                          Unit Price ($)
                          <input
                            className={`${SELECT} mt-1 text-xs`}
                            value={newTier.unitPrice}
                            onChange={(e) => setNewTier({ ...newTier, unitPrice: e.target.value })}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </label>
                      </div>
                      <AdminButton
                        icon={Plus}
                        onClick={() => void addTier()}
                        disabled={busy === 'TIER'}
                        className="text-xs px-3 py-2"
                      >
                        Add Tier
                      </AdminButton>
                    </div>
                  </div>
                </>
              ) : null}

              <hr className="border-admin-line" />

              {/* Internal Notes */}
              <AdminField label="Internal Notes" htmlFor="wp-notes">
                <textarea
                  id="wp-notes"
                  className={TEXTAREA}
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Private trade notes..."
                />
              </AdminField>
            </div>
          </AdminModal>
        )}
      </AnimatePresence>
    </div>
  );
}
