'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  ExternalLink,
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
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  AdminTableSkeleton,
  AdminTabs,
} from '@/components/admin/AdminUI';
import { SELECT, TEXTAREA } from '@/components/admin/adminTheme';
import {
  fetchWholesaleConsole,
  removeWholesaleRecord,
  saveWholesaleRecord,
  type WholesaleRow,
} from '@/lib/admin/wholesaleConsoleApi';

/**
 * Wholesale Products — the trade master, over the retail catalogue.
 *
 * ## One catalogue, two prices
 *
 * A wholesale product *references* a WooCommerce product (`woo_product_id`). Name, SKU,
 * imagery and description stay in the retail catalogue; this screen owns only what is
 * the trade desk's: the wholesale price, the minimum order, the allocation and whether
 * the product is offered at all. Nothing written here can move a retail price — the
 * retail storefront never reads these tables.
 *
 * ## The wholesale price is the one-unit tier
 *
 * The pricing engine reads volume breaks (`price_tiers`), and the price for a single
 * unit is the first break. Rather than invent a second price column that could
 * disagree with the engine, the "wholesale unit price" field on this screen edits the
 * `min_units = 1` break, and the volume breaks beside it are the same rows.
 *
 * ## Allocation, not stock
 *
 * `available_units` is how many units the trade desk is willing to offer, not a second
 * physical stock count. An inquiry never deducts it — stock leaves the building when a
 * confirmed order ships, which is the existing retail inventory workflow.
 */

type Filter = 'active' | 'inactive' | 'unlinked' | 'all';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'active', label: 'Offered' },
  { id: 'inactive', label: 'Not offered' },
  { id: 'unlinked', label: 'No retail link' },
  { id: 'all', label: 'All products' },
];

interface Draft {
  id: number | null;
  name: string;
  wholesale_sku: string;
  woo_product_id: string;
  woo_variation_id: string;
  moq: string;
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
  return {
    id: Number(row.id ?? 0) || null,
    name: text(row.name),
    wholesale_sku: text(row.wholesale_sku),
    woo_product_id: text(row.woo_product_id) === '0' ? '' : text(row.woo_product_id),
    woo_variation_id: num(row.woo_variation_id) ? String(num(row.woo_variation_id)) : '',
    moq: num(row.moq) ? String(num(row.moq)) : '',
    available_units: num(row.available_units) ? String(num(row.available_units)) : '',
    active: Boolean(Number(row.active ?? 0)),
    notes: text(row.notes),
  };
}

export default function WholesaleProductsPage() {
  const [products, setProducts] = useState<WholesaleRow[]>([]);
  const [tiers, setTiers] = useState<WholesaleRow[]>([]);
  const [quotes, setQuotes] = useState<WholesaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [basePrice, setBasePrice] = useState('');
  const [newTier, setNewTier] = useState({ minUnits: '', unitPrice: '' });
  const [checked, setChecked] = useState<number[]>([]);
  const [bulk, setBulk] = useState({ price: '', available: '', moq: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { workspace } = await fetchWholesaleConsole();
      setProducts(workspace.products);
      setTiers(workspace.tiers);
      setQuotes(workspace.quotes);
      setSelectedId((current) => {
        if (current && workspace.products.some((row) => Number(row.id) === current)) return current;
        return workspace.products[0] ? Number(workspace.products[0].id) : null;
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

  useEffect(() => {
    if (!selected) return;
    const next = draftFrom(selected);
    setDraft(next);
    const unit = tiers
      .filter((tier) => Number(tier.product_id) === Number(selected.id) && num(tier.min_units) === 1)
      .map((tier) => num(tier.unit_price))[0];
    setBasePrice(unit ? String(unit) : '');
  }, [selected, tiers]);

  const inquiryCount = useCallback(
    (productId: number) =>
      quotes.filter((quote) => {
        const raw = quote.lines;
        let lines: unknown[] = Array.isArray(raw) ? raw : [];
        if (!lines.length && typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw) as unknown;
            lines = Array.isArray(parsed) ? parsed : [];
          } catch {
            lines = [];
          }
        }
        return lines.some((line) => Number((line as Record<string, unknown>)?.productId) === productId);
      }).length,
    [quotes]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((row) => {
      const active = Boolean(Number(row.active ?? 0));
      const linked = num(row.woo_product_id) > 0;
      if (filter === 'active' && !active) return false;
      if (filter === 'inactive' && active) return false;
      if (filter === 'unlinked' && linked) return false;
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

  async function saveProduct() {
    if (!draft.name.trim()) {
      setError('The wholesale product needs a name.');
      return;
    }
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
          moq: Number(draft.moq) || 0,
          available_units: Number(draft.available_units) || 0,
          active: draft.active ? 1 : 0,
          notes: draft.notes,
        },
        draft.id ?? undefined
      );

      // The one-unit break is the wholesale unit price. Written after the product, so a
      // new product has an id for its tier to point at.
      const productId = Number(saved.id ?? draft.id ?? 0);
      const price = Number(basePrice);
      if (productId && Number.isFinite(price) && price > 0) {
        const existing = tiers.find(
          (tier) => Number(tier.product_id) === productId && num(tier.min_units) === 1
        );
        if (!existing || num(existing.unit_price) !== price) {
          await saveWholesaleRecord(
            'price_tiers',
            {
              product_id: productId,
              min_units: 1,
              unit_price: price,
              currency: text(saved.currency) || 'USD',
            },
            existing ? Number(existing.id) : undefined
          );
        }
      }

      setNotice('The wholesale product was saved.');
      setSelectedId(productId);
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
      setNotice('Wholesale availability changed. Retail prices are untouched.');
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
    if (!Number.isFinite(minUnits) || minUnits < 2) {
      setError('A volume break starts at 2 units or more. The one-unit price is the field above.');
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
          const existing = tiers.find((tier) => Number(tier.product_id) === id && num(tier.min_units) === 1);
          await saveWholesaleRecord(
            'price_tiers',
            { product_id: id, min_units: 1, unit_price: price, currency: 'USD' },
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
        ? `${checked.length - failed} product(s) updated; ${failed} could not be saved. The list shows the stored values.`
        : `${checked.length} product(s) updated.`
    );
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Wholesale"
        title="Wholesale Products"
        description="The trade desk's price, minimum order and allocation, over the existing retail catalogue. Retail prices are never read from or written by this screen."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminButton variant="secondary" icon={RefreshCw} onClick={() => void load()} disabled={loading}>
              {loading ? 'Reading…' : 'Refresh'}
            </AdminButton>
            <AdminButton
              variant="primary"
              icon={Plus}
              onClick={() => {
                setSelectedId(null);
                setDraft(EMPTY_DRAFT);
                setBasePrice('');
              }}
            >
              New wholesale product
            </AdminButton>
          </div>
        }
      />

      {error ? (
        <AdminNotice tone="danger" title="That did not work">
          {error}
        </AdminNotice>
      ) : null}
      {notice ? (
        <AdminNotice tone="info" title="Saved">
          {notice}
        </AdminNotice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminPanel title="Products">
          <p className="text-2xl font-semibold text-admin-ink">{products.length}</p>
          <p className="text-xs text-admin-muted">{products.filter((row) => Number(row.active ?? 0)).length} offered</p>
        </AdminPanel>
        <AdminPanel title="Not linked to retail">
          <p className="text-2xl font-semibold text-admin-ink">
            {products.filter((row) => num(row.woo_product_id) === 0).length}
          </p>
          <p className="text-xs text-admin-muted">A wholesale product without a WooCommerce id is not in the shop.</p>
        </AdminPanel>
        <AdminPanel title="No wholesale price">
          <p className="text-2xl font-semibold text-admin-ink">
            {products.filter((row) => unitPriceFor(Number(row.id)) <= 0).length}
          </p>
          <p className="text-xs text-admin-muted">The buyer&apos;s catalogue hides a product with no price.</p>
        </AdminPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <AdminPanel title="Catalogue" description={`${visible.length} of ${products.length} product(s)`} bodyClassName="p-0">
          <div className="border-b border-admin-line px-4 py-3 space-y-3">
            <AdminTabs tabs={FILTERS} active={filter} onChange={(id) => setFilter(id as Filter)} />
            <div className="flex items-center gap-2 rounded-lg border border-admin-line bg-admin-surface px-3 py-2">
              <Search size={15} className="text-admin-muted" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, SKU or WooCommerce id"
                className="w-full bg-transparent text-sm text-admin-ink outline-none placeholder:text-admin-muted"
                aria-label="Search wholesale products"
              />
            </div>
          </div>

          {checked.length ? (
            <div className="border-b border-admin-line bg-himalayan-lighter/50 px-4 py-3">
              <p className="text-xs font-semibold text-himalayan-dark mb-2">{checked.length} selected — bulk update</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-admin-muted">
                  Unit price
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
                  MOQ
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
              { key: 'select', label: '' },
              { key: 'product', label: 'Product' },
              { key: 'link', label: 'Retail' },
              { key: 'price', label: 'Wholesale', align: 'right' as const },
              { key: 'moq', label: 'MOQ', align: 'right' as const },
              { key: 'stock', label: 'Allocation', align: 'right' as const },
              { key: 'active', label: 'Offered' },
            ]}
            minWidth="760px"
          >
            {loading ? (
              <AdminTableSkeleton rows={6} columns={6} />
            ) : visible.length ? (
              visible.map((row) => {
                const id = Number(row.id);
                const price = unitPriceFor(id);
                return (
                  <tr
                    key={id}
                    className={`cursor-pointer transition-colors ${
                      id === selectedId ? 'bg-himalayan-lighter/60' : 'hover:bg-admin-canvas/60'
                    }`}
                    onClick={() => setSelectedId(id)}
                  >
                    <td className={ADMIN_TD} onClick={(event) => event.stopPropagation()}>
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
                    <td className={ADMIN_TD}>
                      <div className="font-semibold text-admin-ink">{text(row.name) || 'Unnamed product'}</div>
                      <div className="text-xs text-admin-muted font-mono">{text(row.wholesale_sku) || 'no SKU'}</div>
                    </td>
                    <td className={ADMIN_TD}>
                      {num(row.woo_product_id) ? (
                        <AdminChip tone="success">#{text(row.woo_product_id)}</AdminChip>
                      ) : (
                        <AdminChip tone="danger">Not linked</AdminChip>
                      )}
                    </td>
                    <td className={`${ADMIN_TD} text-right`}>{price > 0 ? money(price) : '—'}</td>
                    <td className={`${ADMIN_TD} text-right`}>{num(row.moq) || '—'}</td>
                    <td className={`${ADMIN_TD} text-right`}>{num(row.available_units) || '—'}</td>
                    <td className={ADMIN_TD} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void toggleActive(row)}
                        disabled={busy === `TOGGLE-${id}`}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          Number(row.active ?? 0)
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-admin-line bg-admin-canvas text-admin-muted'
                        }`}
                      >
                        {Number(row.active ?? 0) ? 'Offered' : 'Hidden'}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className={ADMIN_TD} colSpan={7}>
                  <div className="py-8 text-center text-sm text-admin-muted">No product matches this view.</div>
                </td>
              </tr>
            )}
          </AdminTable>
        </AdminPanel>

        <div className="space-y-5">
          <AdminPanel
            title={draft.id ? 'Edit wholesale product' : 'New wholesale product'}
            description="Name and SKU should match the retail product this references."
            action={
              draft.id ? (
                <AdminChip tone="neutral">#{draft.id}</AdminChip>
              ) : (
                <AdminChip tone="info">Unsaved</AdminChip>
              )
            }
          >
            <div className="space-y-4">
              <AdminField label="Product name" htmlFor="wp-name">
                <AdminInput
                  id="wp-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Himalayan Pink Salt Fine Grain 25 kg"
                />
              </AdminField>

              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="Wholesale SKU" htmlFor="wp-sku">
                  <AdminInput
                    id="wp-sku"
                    value={draft.wholesale_sku}
                    onChange={(event) => setDraft({ ...draft, wholesale_sku: event.target.value })}
                  />
                </AdminField>
                <AdminField label="WooCommerce product id" hint="Links this row to the retail product." htmlFor="wp-woo">
                  <AdminInput
                    id="wp-woo"
                    value={draft.woo_product_id}
                    onChange={(event) => setDraft({ ...draft, woo_product_id: event.target.value })}
                    inputMode="numeric"
                    placeholder="e.g. 2487"
                  />
                </AdminField>
                <AdminField label="WooCommerce variation id" hint="Required for a variable product; leave empty for a simple product." htmlFor="wp-variation">
                  <AdminInput id="wp-variation" value={draft.woo_variation_id} onChange={(event) => setDraft({ ...draft, woo_variation_id: event.target.value })} inputMode="numeric" />
                </AdminField>
                <AdminField label="Wholesale unit price (USD)" hint="The price for one unit, stored as the 1-unit tier." htmlFor="wp-price">
                  <AdminInput
                    id="wp-price"
                    value={basePrice}
                    onChange={(event) => setBasePrice(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </AdminField>
                <AdminField label="Minimum order quantity" htmlFor="wp-moq">
                  <AdminInput
                    id="wp-moq"
                    value={draft.moq}
                    onChange={(event) => setDraft({ ...draft, moq: event.target.value })}
                    inputMode="numeric"
                  />
                </AdminField>
                <AdminField label="Wholesale allocation (units)" hint="What the trade desk will offer, not a second stock count." htmlFor="wp-units">
                  <AdminInput
                    id="wp-units"
                    value={draft.available_units}
                    onChange={(event) => setDraft({ ...draft, available_units: event.target.value })}
                    inputMode="numeric"
                  />
                </AdminField>
                <AdminField label="Wholesale visibility" htmlFor="wp-active">
                  <label className="flex items-center gap-2 text-sm text-admin-ink">
                    <input
                      id="wp-active"
                      type="checkbox"
                      checked={draft.active}
                      onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                    />
                    Offer this product to approved buyers
                  </label>
                </AdminField>
              </div>

              <AdminField label="Wholesale notes" hint="Internal only — never shown to a buyer." htmlFor="wp-notes">
                <textarea
                  id="wp-notes"
                  className={TEXTAREA}
                  rows={2}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </AdminField>

              <div className="flex flex-wrap gap-2">
                <AdminButton variant="primary" icon={Save} onClick={() => void saveProduct()} disabled={busy === 'SAVE'}>
                  {busy === 'SAVE' ? 'Saving…' : 'Save product'}
                </AdminButton>
                {draft.id ? (
                  <a
                    href={`/admin/products?search=${encodeURIComponent(draft.name)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-admin-line px-3 py-2 text-sm text-admin-ink hover:bg-admin-canvas"
                  >
                    Retail products <ExternalLink size={13} aria-hidden />
                  </a>
                ) : null}
              </div>

              {selected ? (
                <div className="rounded-xl bg-admin-canvas p-3 text-xs text-admin-muted space-y-1">
                  <p>
                    <Boxes size={12} className="inline mr-1" aria-hidden />
                    {inquiryCount(Number(selected.id))} inquiry line(s) reference this product.
                  </p>
                  <p>Retail price, imagery and description stay in WooCommerce; nothing here writes to it.</p>
                </div>
              ) : null}
            </div>
          </AdminPanel>

          {selected ? (
            <AdminPanel title="Volume breaks" description="Quantity pricing the buyer's catalogue applies.">
              <div className="space-y-2 mb-4">
                {selectedTiers.length ? (
                  selectedTiers.map((tier) => (
                    <div
                      key={String(tier.id)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-admin-line px-3 py-2"
                    >
                      <div>
                        <p className="text-sm text-admin-ink">
                          {num(tier.min_units)} unit{num(tier.min_units) === 1 ? '' : 's'} and above
                        </p>
                        <p className="text-xs text-admin-muted">
                          {money(num(tier.unit_price))} per unit{num(tier.min_units) === 1 ? ' — unit price' : ''}
                        </p>
                      </div>
                      {num(tier.min_units) === 1 ? (
                        <AdminChip tone="brand">Base</AdminChip>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void deleteTier(Number(tier.id))}
                          disabled={busy === `TIER-${Number(tier.id)}`}
                          className="p-2 rounded-lg text-admin-muted hover:bg-admin-canvas hover:text-red-600"
                          aria-label="Remove volume break"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-admin-muted">No volume breaks yet. The buyer sees the unit price only.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-admin-muted">
                  From units
                  <input
                    className={`${SELECT} mt-1`}
                    value={newTier.minUnits}
                    onChange={(event) => setNewTier({ ...newTier, minUnits: event.target.value })}
                    inputMode="numeric"
                    placeholder="e.g. 50"
                  />
                </label>
                <label className="text-xs text-admin-muted">
                  Unit price
                  <input
                    className={`${SELECT} mt-1`}
                    value={newTier.unitPrice}
                    onChange={(event) => setNewTier({ ...newTier, unitPrice: event.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>
              </div>
              <AdminButton className="mt-3" icon={Plus} onClick={() => void addTier()} disabled={busy === 'TIER'}>
                Add volume break
              </AdminButton>
            </AdminPanel>
          ) : (
            <AdminPanel title="Volume breaks">
              <div className="py-10 text-center text-sm text-admin-muted">
                <Package size={26} className="mx-auto mb-3 text-admin-muted/60" aria-hidden />
                Save the product first, then add quantity pricing.
              </div>
            </AdminPanel>
          )}
        </div>
      </div>
    </div>
  );
}
