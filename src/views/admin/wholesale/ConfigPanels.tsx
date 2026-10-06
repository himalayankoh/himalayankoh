'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import {
  removeWholesaleRecord,
  saveWholesaleRecord,
  type WholesaleRow,
  type WholesaleWorkspace,
} from '@/lib/admin/wholesaleConsoleApi';
import RecordPanel, { type FieldSpec } from './RecordPanel';
import {
  Button,
  DataTable,
  DeleteRowButton,
  Field,
  Notice,
  Panel,
  SaveButton,
  Select,
  TextArea,
  TextInput,
  Toggle,
  numberValue,
  rowId,
  text,
  useWriter,
} from './ui';

/**
 * The configuration half of the wholesale console.
 *
 * Six of these panels are thin configurations of the shared `RecordPanel`; the two
 * that are not (products and cost profiles) are custom because their data is nested —
 * a product owns a packaging profile and a ladder of price tiers, and a cost profile
 * owns named charges. Both store what the owner typed, in the shape the pricing engine
 * reads, without doing any arithmetic themselves.
 */

function money(value: unknown, currency = 'USD'): string {
  const parsed = numberValue(value);
  return parsed === null ? '—' : `${currency} ${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function plain(value: unknown, digits = 2): string {
  const parsed = numberValue(value);
  return parsed === null ? '—' : parsed.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/* ------------------------------------------------------------------ */
/* Products & pricing                                                  */
/* ------------------------------------------------------------------ */

/** The packaging fields the engine reads, in the order the factory sheet lists them. */
const PACKAGING_FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'cartonQty', label: 'Units per carton' },
  { key: 'packagedUnitWeightKg', label: 'Packaged unit weight (kg)' },
  { key: 'cartonLengthCm', label: 'Carton length (cm)' },
  { key: 'cartonWidthCm', label: 'Carton width (cm)' },
  { key: 'cartonHeightCm', label: 'Carton height (cm)' },
  { key: 'cartonGrossWeightKg', label: 'Carton gross weight (kg)' },
  { key: 'palletLengthCm', label: 'Pallet length (cm)' },
  { key: 'palletWidthCm', label: 'Pallet width (cm)' },
  { key: 'maxStackHeightCm', label: 'Max stack height (cm)', hint: 'Including the pallet deck.' },
  { key: 'palletDeckHeightCm', label: 'Pallet deck height (cm)' },
  { key: 'palletTareKg', label: 'Pallet tare weight (kg)' },
  { key: 'maxPalletGrossWeightKg', label: 'Max pallet gross weight (kg)', hint: 'Optional. Leave empty when unknown — an empty box is not a ceiling of zero.' },
  { key: 'cartonsPerLayer', label: 'Cartons per layer', hint: 'Optional override; leave empty to derive from the footprint.' },
  { key: 'layers', label: 'Layers per pallet', hint: 'Optional override; leave empty to derive from the stack height.' },
  { key: 'unitLengthCm', label: 'Unit length (cm)', hint: 'Optional, but the packaging profile is not Complete without it — the product’s own size before cartoning.' },
  { key: 'unitWidthCm', label: 'Unit width (cm)', hint: 'Optional; leave empty when unknown.' },
  { key: 'unitHeightCm', label: 'Unit height (cm)', hint: 'Optional; leave empty when unknown.' },
];

interface ProductForm {
  woo_product_id: string;
  wholesale_sku: string;
  name: string;
  moq: string;
  ex_factory_cost: string;
  currency: string;
  origin_id: string;
  supplier_id: string;
  lead_time_days: string;
  net_unit_weight_kg: string;
  active: boolean;
  notes: string;
  packaging: Record<string, string>;
}

const EMPTY_PRODUCT: ProductForm = {
  woo_product_id: '',
  wholesale_sku: '',
  name: '',
  moq: '',
  ex_factory_cost: '',
  currency: 'USD',
  origin_id: '',
  supplier_id: '',
  lead_time_days: '',
  net_unit_weight_kg: '',
  active: true,
  notes: '',
  packaging: {},
};

function productFormFrom(row: WholesaleRow | null): ProductForm {
  if (!row) return { ...EMPTY_PRODUCT, packaging: {} };
  const packagingRaw = (row.packaging && typeof row.packaging === 'object' ? row.packaging : {}) as Record<string, unknown>;
  const packaging: Record<string, string> = {};
  for (const field of PACKAGING_FIELDS) {
    const value = packagingRaw[field.key];
    packaging[field.key] = value === null || value === undefined ? '' : text(value);
  }

  const optional = (key: string) => {
    const value = row[key];
    return value === null || value === undefined || value === 0 || value === '' ? '' : text(value);
  };

  return {
    woo_product_id: optional('woo_product_id'),
    wholesale_sku: text(row.wholesale_sku),
    name: text(row.name),
    moq: optional('moq'),
    ex_factory_cost: optional('ex_factory_cost'),
    currency: text(row.currency, 'USD'),
    origin_id: optional('origin_id'),
    supplier_id: optional('supplier_id'),
    lead_time_days: optional('lead_time_days'),
    net_unit_weight_kg: optional('net_unit_weight_kg'),
    active: row.active === true || row.active === 1 || row.active === '1',
    notes: text(row.notes),
    packaging,
  };
}

const num = (value: string): number => {
  const parsed = numberValue(value);
  return parsed === null ? 0 : parsed;
};

export function ProductsPanel({
  workspace,
  reload,
}: {
  workspace: { products: WholesaleRow[]; tiers: WholesaleRow[]; origins: WholesaleRow[]; suppliers: WholesaleRow[] };
  reload: () => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [tierProduct, setTierProduct] = useState<WholesaleRow | null>(null);
  const [tierDraft, setTierDraft] = useState({ min_units: '', unit_price: '', currency: 'USD' });
  const writer = useWriter();
  const tierWriter = useWriter();

  const tiersByProduct = useMemo(() => {
    const map = new Map<string, WholesaleRow[]>();
    for (const tier of workspace.tiers) {
      const key = String(tier.product_id ?? '');
      map.set(key, [...(map.get(key) ?? []), tier]);
    }
    for (const list of map.values()) list.sort((a, b) => num(text(a.min_units)) - num(text(b.min_units)));
    return map;
  }, [workspace.tiers]);

  function startNew() {
    setEditingId('new');
    setForm({ ...EMPTY_PRODUCT, packaging: {} });
    writer.clear();
  }

  function startEdit(row: WholesaleRow) {
    setEditingId(rowId(row));
    setForm(productFormFrom(row));
    writer.clear();
  }

  async function save() {
    const id = typeof editingId === 'number' ? editingId : undefined;
    const packaging: Record<string, number | undefined> = {};
    for (const field of PACKAGING_FIELDS) {
      const raw = form.packaging[field.key] ?? '';
      // An empty optional box is left out entirely, so the engine's own default
      // (derive from the footprint / no ceiling) applies rather than a zero.
      if (
        raw === '' &&
        (field.key === 'maxPalletGrossWeightKg' ||
          field.key === 'cartonsPerLayer' ||
          field.key === 'layers' ||
          field.key === 'unitLengthCm' ||
          field.key === 'unitWidthCm' ||
          field.key === 'unitHeightCm')
      ) {
        continue;
      }
      packaging[field.key] = num(raw);
    }

    const payload = {
      woo_product_id: form.woo_product_id === '' ? 0 : num(form.woo_product_id),
      wholesale_sku: form.wholesale_sku,
      name: form.name,
      moq: num(form.moq),
      ex_factory_cost: num(form.ex_factory_cost),
      currency: form.currency || 'USD',
      origin_id: form.origin_id === '' ? 0 : num(form.origin_id),
      supplier_id: form.supplier_id === '' ? 0 : num(form.supplier_id),
      lead_time_days: num(form.lead_time_days),
      net_unit_weight_kg: num(form.net_unit_weight_kg),
      active: form.active,
      notes: form.notes,
      packaging,
    };

    if (!payload.name.trim()) {
      writer.setError('A wholesale product needs a name.');
      return;
    }

    const result = await writer.run(
      () => saveWholesaleRecord('products', payload, id),
      id ? 'Product saved.' : 'Product created.'
    );
    if (result) {
      setEditingId(null);
      await reload();
    }
  }

  async function remove(row: WholesaleRow) {
    const id = rowId(row);
    if (!id) return;
    const done = await writer.run(() => removeWholesaleRecord('products', id), 'Product deleted.');
    if (done !== null) await reload();
  }

  async function addTier() {
    if (!tierProduct) return;
    const productId = rowId(tierProduct);
    if (!productId) return;
    const minUnits = numberValue(tierDraft.min_units);
    const unitPrice = numberValue(tierDraft.unit_price);
    if (minUnits === null || unitPrice === null) {
      tierWriter.setError('A price break needs both a minimum quantity and a unit price.');
      return;
    }
    const done = await tierWriter.run(
      () =>
        saveWholesaleRecord('price_tiers', {
          product_id: productId,
          min_units: minUnits,
          unit_price: unitPrice,
          currency: tierDraft.currency || 'USD',
        }),
      'Price break added.'
    );
    if (done) {
      setTierDraft({ min_units: '', unit_price: '', currency: tierDraft.currency });
      await reload();
    }
  }

  async function removeTier(tier: WholesaleRow) {
    const id = rowId(tier);
    if (!id) return;
    const done = await tierWriter.run(() => removeWholesaleRecord('price_tiers', id), 'Price break removed.');
    if (done !== null) await reload();
  }

  const originOptions = [
    { value: '', label: 'Not set' },
    ...workspace.origins.map((origin) => ({
      value: String(rowId(origin) ?? ''),
      label: `${text(origin.country)} ${text(origin.port) ? `(${text(origin.port)})` : ''}`.trim(),
    })),
  ];

  const supplierOptions = [
    { value: '', label: 'Not set' },
    ...workspace.suppliers.map((supplier) => ({ value: String(rowId(supplier) ?? ''), label: text(supplier.name) })),
  ];

  return (
    <div className="space-y-6">
      <Panel
        title="Wholesale products"
        description="The wholesale master. It references a WooCommerce product so the two sides agree on which product a line is about; the wholesale SKU, MOQ, cost, packaging and tiers are this plugin's own data and never touch the retail price."
        actions={
          editingId === null ? (
            <Button onClick={startNew}>
              <Plus className="w-4 h-4" />
              Add product
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setEditingId(null)}>
              <X className="w-4 h-4" />
              Close
            </Button>
          )
        }
      >
        <div className="space-y-5">
          {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}

          {editingId !== null ? (
            <div className="rounded-2xl border border-charcoal/10 bg-warm-white/50 p-5">
              <h3 className="font-semibold text-charcoal mb-4">
                {typeof editingId === 'number' ? 'Edit wholesale product' : 'New wholesale product'}
              </h3>

              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <Field label="Name" wide>
                  <TextInput value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
                </Field>
                <Field label="WooCommerce product id" hint="The retail product this is sold as. Optional.">
                  <TextInput
                    type="number"
                    value={form.woo_product_id}
                    onChange={(value) => setForm({ ...form, woo_product_id: value })}
                  />
                </Field>
                <Field label="Wholesale SKU">
                  <TextInput
                    value={form.wholesale_sku}
                    onChange={(value) => setForm({ ...form, wholesale_sku: value })}
                  />
                </Field>
                <Field label="Minimum order quantity" hint="In units.">
                  <TextInput type="number" value={form.moq} onChange={(value) => setForm({ ...form, moq: value })} />
                </Field>
                <Field label="Ex-factory cost per unit" hint="What the factory charges us. Never shown to a buyer.">
                  <TextInput
                    type="number"
                    value={form.ex_factory_cost}
                    onChange={(value) => setForm({ ...form, ex_factory_cost: value })}
                  />
                </Field>
                <Field label="Currency">
                  <TextInput value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} />
                </Field>
                <Field label="Lead time (days)">
                  <TextInput
                    type="number"
                    value={form.lead_time_days}
                    onChange={(value) => setForm({ ...form, lead_time_days: value })}
                  />
                </Field>
                <Field label="Net unit weight (kg)" hint="Cargo weight, used for the container math.">
                  <TextInput
                    type="number"
                    value={form.net_unit_weight_kg}
                    onChange={(value) => setForm({ ...form, net_unit_weight_kg: value })}
                  />
                </Field>
                <Field label="Origin">
                  <Select
                    value={form.origin_id}
                    onChange={(value) => setForm({ ...form, origin_id: value })}
                    options={originOptions}
                  />
                </Field>
                <Field label="Supplier">
                  <Select
                    value={form.supplier_id}
                    onChange={(value) => setForm({ ...form, supplier_id: value })}
                    options={supplierOptions}
                  />
                </Field>
                <Field label="Active" hint="An inactive product stays in history but cannot be put in a new quote.">
                  <Toggle
                    label={form.active ? 'Active' : 'Inactive'}
                    checked={form.active}
                    onChange={(value) => setForm({ ...form, active: value })}
                  />
                </Field>
                <Field label="Notes" wide>
                  <TextArea value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
                </Field>
              </div>

              <h4 className="font-semibold text-charcoal mb-3">Carton &amp; pallet profile</h4>
              <p className="text-xs text-charcoal-light mb-4 max-w-3xl">
                These are the factory’s own figures. A blank required field falls back to a documented default and the
                quote says so — so the sooner they are filled in from a real carton sheet, the fewer estimates a buyer
                sees.
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                {PACKAGING_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label} hint={field.hint}>
                    <TextInput
                      type="number"
                      value={form.packaging[field.key] ?? ''}
                      onChange={(value) => setForm({ ...form, packaging: { ...form.packaging, [field.key]: value } })}
                    />
                  </Field>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <SaveButton onClick={save} busy={writer.saving} />
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          <DataTable
            columns={[
              { key: 'name', label: 'Product', render: (row) => (
                <div>
                  <p className="text-charcoal font-medium">{text(row.name)}</p>
                  <p className="text-xs text-charcoal-light font-mono">
                    {text(row.wholesale_sku) || 'no wholesale SKU'}
                    {numberValue(row.woo_product_id) ? ` · Woo #${text(row.woo_product_id)}` : ''}
                  </p>
                </div>
              ) },
              { key: 'moq', label: 'MOQ', align: 'right', render: (row) => <span className="text-charcoal">{plain(row.moq, 0)}</span> },
              { key: 'cost', label: 'Ex-factory', align: 'right', render: (row) => <span className="text-charcoal">{money(row.ex_factory_cost, text(row.currency, 'USD'))}</span> },
              { key: 'tiers', label: 'Tiers', align: 'right', render: (row) => (
                <span className="text-charcoal-light">{(tiersByProduct.get(String(rowId(row))) ?? []).length}</span>
              ) },
              { key: 'lead', label: 'Lead', align: 'right', render: (row) => (
                <span className="text-charcoal-light">{numberValue(row.lead_time_days) ? `${text(row.lead_time_days)} d` : '—'}</span>
              ) },
              { key: 'active', label: 'Active', align: 'right', render: (row) => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${row.active ? 'bg-green-50 text-green-700' : 'bg-charcoal/5 text-charcoal-light'}`}>
                  {row.active ? 'Active' : 'Inactive'}
                </span>
              ) },
              { key: 'actions', label: '', align: 'right', render: (row) => {
                const id = rowId(row);
                const tiers = tiersByProduct.get(String(id)) ?? [];
                return (
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTierProduct(row);
                        tierWriter.clear();
                      }}
                      className="px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                    >
                      Tiers ({tiers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="p-1.5 rounded-lg text-charcoal-light hover:bg-charcoal/5"
                      aria-label={`Edit ${text(row.name)}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <DeleteRowButton label={text(row.name)} onDelete={() => remove(row)} />
                  </span>
                );
              } },
            ]}
            rows={workspace.products}
            rowKey={(row, index) => String(rowId(row) ?? `product-${index}`)}
            empty="No wholesale products yet. Add one to make it available in the portal."
          />
        </div>
      </Panel>

      {tierProduct ? (
        <Panel
          title={`Price breaks — ${text(tierProduct.name)}`}
          description="The B2B ladder a buyer sees. The break applies from its minimum quantity upward; the quote engine picks the highest break the quantity reaches."
          actions={
            <Button variant="ghost" onClick={() => setTierProduct(null)}>
              <X className="w-4 h-4" />
              Close
            </Button>
          }
        >
          <div className="space-y-5">
            {tierWriter.error ? <Notice kind="error">{tierWriter.error}</Notice> : null}

            <div className="grid sm:grid-cols-4 gap-4 items-end">
              <Field label="From quantity (units)">
                <TextInput
                  type="number"
                  value={tierDraft.min_units}
                  onChange={(value) => setTierDraft({ ...tierDraft, min_units: value })}
                />
              </Field>
              <Field label="Unit price">
                <TextInput
                  type="number"
                  value={tierDraft.unit_price}
                  onChange={(value) => setTierDraft({ ...tierDraft, unit_price: value })}
                />
              </Field>
              <Field label="Currency">
                <TextInput
                  value={tierDraft.currency}
                  onChange={(value) => setTierDraft({ ...tierDraft, currency: value })}
                />
              </Field>
              <Button onClick={addTier} busy={tierWriter.saving}>
                <Plus className="w-4 h-4" />
                Add break
              </Button>
            </div>

            <DataTable
              columns={[
                { key: 'min', label: 'From (units)', align: 'right', render: (row) => <span className="text-charcoal">{plain(row.min_units, 0)}</span> },
                { key: 'price', label: 'Unit price', align: 'right', render: (row) => (
                  <span className="text-charcoal font-medium">{money(row.unit_price, text(row.currency, 'USD'))}</span>
                ) },
                { key: 'actions', label: '', align: 'right', render: (row) => (
                  <DeleteRowButton label="price break" onDelete={() => removeTier(row)} />
                ) },
              ]}
              rows={tiersByProduct.get(String(rowId(tierProduct))) ?? []}
              rowKey={(row, index) => String(rowId(row) ?? `tier-${index}`)}
              empty="No price breaks yet — this product reads as “price on request”."
            />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cost profiles                                                       */
/* ------------------------------------------------------------------ */

const ORIGIN_CHARGES: Array<{ key: string; label: string }> = [
  { key: 'inlandTransport', label: 'Inland transport to port' },
  { key: 'stuffing', label: 'Stuffing / loading' },
  { key: 'documentation', label: 'Export documentation' },
  { key: 'originTerminal', label: 'Origin terminal / port' },
  { key: 'originCustoms', label: 'Export customs handling' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'forwarding', label: 'Forwarding' },
  { key: 'packaging', label: 'Packaging surcharge' },
  { key: 'otherAmount', label: 'Other charge (amount)' },
];

const DESTINATION_CHARGES: Array<{ key: string; label: string }> = [
  { key: 'destinationTerminal', label: 'Destination terminal' },
  { key: 'destinationHandling', label: 'Destination handling' },
  { key: 'destinationCustomsBroker', label: 'Customs broker' },
  { key: 'destinationDelivery', label: 'Delivery' },
  { key: 'destinationWarehouse', label: 'Warehouse' },
  { key: 'destinationOther', label: 'Other destination charge' },
];

interface CostForm {
  name: string;
  origin_id: string;
  supplier_id: string;
  currency: string;
  insurance_pct: string;
  duty_pct: string;
  include_destination: boolean;
  duty_in_landed: boolean;
  notes: string;
  otherLabel: string;
  charges: Record<string, string>;
}

const EMPTY_COST: CostForm = {
  name: '',
  origin_id: '',
  supplier_id: '',
  currency: 'USD',
  insurance_pct: '',
  duty_pct: '',
  include_destination: false,
  duty_in_landed: false,
  notes: '',
  otherLabel: '',
  charges: {},
};

function costFormFrom(row: WholesaleRow | null): CostForm {
  if (!row) return { ...EMPTY_COST, charges: {} };
  const chargesRaw = (row.charges && typeof row.charges === 'object' ? row.charges : {}) as Record<string, unknown>;
  const destinationRaw = (row.destination && typeof row.destination === 'object' ? row.destination : {}) as Record<string, unknown>;

  // A stored zero shows as an empty box: "no charge" and "a charge of nothing" are
  // the same number here, and an empty box is what the owner expects to see.
  const optional = (value: unknown): string =>
    value === null || value === undefined || numberValue(value) === 0 ? '' : text(value);

  const charges: Record<string, string> = {};
  for (const charge of ORIGIN_CHARGES) charges[charge.key] = optional(chargesRaw[charge.key]);
  for (const charge of DESTINATION_CHARGES) charges[charge.key] = optional(destinationRaw[charge.key]);

  return {
    name: text(row.name),
    origin_id: text(row.origin_id),
    supplier_id: text(row.supplier_id),
    currency: text(row.currency, 'USD'),
    insurance_pct: numberValue(row.insurance_pct) ? text(row.insurance_pct) : '',
    duty_pct: numberValue(row.duty_pct) ? text(row.duty_pct) : '',
    include_destination: row.include_destination === true || row.include_destination === 1,
    duty_in_landed: row.duty_in_landed === true || row.duty_in_landed === 1,
    notes: text(row.notes),
    otherLabel: text(chargesRaw.otherLabel),
    charges,
  };
}

export function CostProfilesPanel({
  workspace,
  reload,
}: {
  workspace: { costProfiles: WholesaleRow[]; origins: WholesaleRow[]; suppliers: WholesaleRow[] };
  reload: () => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<CostForm>({ ...EMPTY_COST, charges: {} });
  const writer = useWriter();

  async function save() {
    const id = typeof editingId === 'number' ? editingId : undefined;
    const charges: Record<string, unknown> = {};
    const destination: Record<string, unknown> = {};
    for (const charge of ORIGIN_CHARGES) charges[charge.key] = num(form.charges[charge.key] ?? '');
    for (const charge of DESTINATION_CHARGES) destination[charge.key] = num(form.charges[charge.key] ?? '');
    // The label travels inside the same JSON blob as the amounts, so a charge the
    // owner named is stored with the number it belongs to.
    charges.otherLabel = form.otherLabel;

    if (!form.name.trim()) {
      writer.setError('A cost profile needs a name — it is what the quote builder offers in its list.');
      return;
    }

    const result = await writer.run(
      () =>
        saveWholesaleRecord(
          'cost_profiles',
          {
            name: form.name,
            origin_id: form.origin_id === '' ? 0 : num(form.origin_id),
            supplier_id: form.supplier_id === '' ? 0 : num(form.supplier_id),
            currency: form.currency || 'USD',
            charges,
            destination,
            insurance_pct: num(form.insurance_pct),
            duty_pct: num(form.duty_pct),
            include_destination: form.include_destination,
            duty_in_landed: form.duty_in_landed,
            notes: form.notes,
          },
          id
        ),
      id ? 'Cost profile saved.' : 'Cost profile created.'
    );
    if (result) {
      setEditingId(null);
      await reload();
    }
  }

  async function remove(row: WholesaleRow) {
    const id = rowId(row);
    if (!id) return;
    const done = await writer.run(() => removeWholesaleRecord('cost_profiles', id), 'Cost profile deleted.');
    if (done !== null) await reload();
  }

  const total = (row: WholesaleRow): number => {
    const charges = (row.charges && typeof row.charges === 'object' ? row.charges : {}) as Record<string, unknown>;
    return ORIGIN_CHARGES.reduce((sum, charge) => sum + (numberValue(charges[charge.key]) ?? 0), 0);
  };

  return (
    <Panel
      title="Cost profiles"
      description="One profile is the origin cost set for a supplier and a port: what it costs to get the goods from the factory onto the ship, in one currency. Quotes snapshot these numbers, so changing one never moves a quotation that has already been given."
      actions={
        editingId === null ? (
          <Button
            onClick={() => {
              setEditingId('new');
              setForm({ ...EMPTY_COST, charges: {} });
              writer.clear();
            }}
          >
            <Plus className="w-4 h-4" />
            Add cost profile
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setEditingId(null)}>
            <X className="w-4 h-4" />
            Close
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}

        {editingId !== null ? (
          <div className="rounded-2xl border border-charcoal/10 bg-warm-white/50 p-5">
            <h3 className="font-semibold text-charcoal mb-4">
              {typeof editingId === 'number' ? 'Edit cost profile' : 'New cost profile'}
            </h3>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <Field label="Profile name" wide>
                <TextInput value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="Karachi — Khewra factory, FOB" />
              </Field>
              <Field label="Origin">
                <Select
                  value={form.origin_id}
                  onChange={(value) => setForm({ ...form, origin_id: value })}
                  options={[
                    { value: '', label: 'Not set' },
                    ...workspace.origins.map((origin) => ({ value: String(rowId(origin) ?? ''), label: text(origin.country) })),
                  ]}
                />
              </Field>
              <Field label="Supplier">
                <Select
                  value={form.supplier_id}
                  onChange={(value) => setForm({ ...form, supplier_id: value })}
                  options={[
                    { value: '', label: 'Not set' },
                    ...workspace.suppliers.map((supplier) => ({ value: String(rowId(supplier) ?? ''), label: text(supplier.name) })),
                  ]}
                />
              </Field>
              <Field label="Currency" hint="All amounts below are in this currency.">
                <TextInput value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} />
              </Field>
            </div>

            <h4 className="font-semibold text-charcoal mb-1">Origin charges</h4>
            <p className="text-xs text-charcoal-light mb-4">Per container. Leave a charge empty when it does not apply.</p>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {ORIGIN_CHARGES.map((charge) => (
                <Field key={charge.key} label={charge.label}>
                  <TextInput
                    type="number"
                    value={form.charges[charge.key] ?? ''}
                    onChange={(value) => setForm({ ...form, charges: { ...form.charges, [charge.key]: value } })}
                  />
                </Field>
              ))}
              <Field label="Other charge — what it is">
                <TextInput value={form.otherLabel} onChange={(value) => setForm({ ...form, otherLabel: value })} />
              </Field>
            </div>

            <h4 className="font-semibold text-charcoal mb-1">Destination charges</h4>
            <p className="text-xs text-charcoal-light mb-4">
              Shown on every quote as context. They are only inside the total when you ask for them, because they depend
              on the buyer’s destination.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {DESTINATION_CHARGES.map((charge) => (
                <Field key={charge.key} label={charge.label}>
                  <TextInput
                    type="number"
                    value={form.charges[charge.key] ?? ''}
                    onChange={(value) => setForm({ ...form, charges: { ...form.charges, [charge.key]: value } })}
                  />
                </Field>
              ))}
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-4">
              <Field label="Insurance %" hint="Of merchandise plus freight.">
                <TextInput
                  type="number"
                  value={form.insurance_pct}
                  onChange={(value) => setForm({ ...form, insurance_pct: value })}
                />
              </Field>
              <Field label="Duty / tax %" hint="0 when unknown — never assume a customs rate.">
                <TextInput type="number" value={form.duty_pct} onChange={(value) => setForm({ ...form, duty_pct: value })} />
              </Field>
              <Field label="Notes">
                <TextInput value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-3 mb-5">
              <Toggle
                label="Include destination charges in the total by default"
                checked={form.include_destination}
                onChange={(value) => setForm({ ...form, include_destination: value })}
              />
              <Toggle
                label="Include duty in the total by default"
                checked={form.duty_in_landed}
                onChange={(value) => setForm({ ...form, duty_in_landed: value })}
              />
            </div>

            <div className="flex items-center gap-3">
              <SaveButton onClick={save} busy={writer.saving} />
              <Button variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <DataTable
          columns={[
            { key: 'name', label: 'Profile', render: (row) => (
              <div>
                <p className="text-charcoal font-medium">{text(row.name)}</p>
                <p className="text-xs text-charcoal-light">{text(row.notes) || '—'}</p>
              </div>
            ) },
            { key: 'currency', label: 'Currency', render: (row) => <span className="text-charcoal-light">{text(row.currency)}</span> },
            { key: 'total', label: 'Origin charges', align: 'right', render: (row) => (
              <span className="text-charcoal">{money(total(row), text(row.currency, 'USD'))}</span>
            ) },
            { key: 'insurance', label: 'Insurance', align: 'right', render: (row) => (
              <span className="text-charcoal-light">{plain(row.insurance_pct)}%</span>
            ) },
            { key: 'duty', label: 'Duty', align: 'right', render: (row) => (
              <span className="text-charcoal-light">{plain(row.duty_pct)}%</span>
            ) },
            { key: 'actions', label: '', align: 'right', render: (row) => (
              <span className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(rowId(row));
                    setForm(costFormFrom(row));
                    writer.clear();
                  }}
                  className="p-1.5 rounded-lg text-charcoal-light hover:bg-charcoal/5"
                  aria-label={`Edit ${text(row.name)}`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <DeleteRowButton label={text(row.name)} onDelete={() => remove(row)} />
              </span>
            ) },
          ]}
          rows={workspace.costProfiles}
          rowKey={(row, index) => String(rowId(row) ?? `cost-${index}`)}
          empty="No cost profiles yet. A quote cannot be priced without one."
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* The flat configuration panels                                       */
/* ------------------------------------------------------------------ */

const SUPPLIER_FIELDS: FieldSpec[] = [
  { name: 'name', label: 'Supplier name', type: 'text', wide: true },
  { name: 'country', label: 'Country', type: 'text' },
  { name: 'city', label: 'City', type: 'text' },
  { name: 'port', label: 'Load port', type: 'text' },
  { name: 'currency', label: 'Currency', type: 'text' },
  { name: 'contact', label: 'Contact', type: 'text' },
  { name: 'active', label: 'Active', type: 'bool' },
  { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
];

export function SuppliersPanel({ rows, reload }: { rows: WholesaleRow[]; reload: () => Promise<void> | void }) {
  return (
    <RecordPanel
      resource="suppliers"
      title="Suppliers"
      description="Factories and trading houses we buy from. A supplier is only a label and a contact — the money lives on the cost profiles, so one supplier can be priced from two ports."
      fields={SUPPLIER_FIELDS}
      rows={rows}
      onChanged={reload}
      newLabel="Add supplier"
      blank={{ name: '', country: '', city: '', port: '', currency: 'USD', contact: '', active: true, notes: '' }}
      columns={[
        { key: 'name', label: 'Supplier', render: (row) => <span className="text-charcoal font-medium">{text(row.name)}</span> },
        { key: 'place', label: 'Location', render: (row) => (
          <span className="text-charcoal-light">{[text(row.city), text(row.country)].filter(Boolean).join(', ') || '—'}</span>
        ) },
        { key: 'port', label: 'Port', render: (row) => <span className="text-charcoal-light font-mono">{text(row.port) || '—'}</span> },
        { key: 'contact', label: 'Contact', render: (row) => <span className="text-charcoal-light">{text(row.contact) || '—'}</span> },
        { key: 'active', label: 'Active', align: 'right', render: (row) => (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${row.active ? 'bg-green-50 text-green-700' : 'bg-charcoal/5 text-charcoal-light'}`}>
            {row.active ? 'Active' : 'Inactive'}
          </span>
        ) },
      ]}
    />
  );
}

export function OriginsPanel({ rows, reload }: { rows: WholesaleRow[]; reload: () => Promise<void> | void }) {
  return (
    <RecordPanel
      resource="origins"
      title="Origins"
      description="Where goods ship from: the country, the city and the load port. Freight rates are looked up by origin port, so the code here is what a lane is keyed by."
      fields={[
        { name: 'country', label: 'Country', type: 'text' },
        { name: 'city', label: 'City / region', type: 'text' },
        { name: 'port', label: 'Load port code', type: 'text', hint: 'e.g. PKKHI, CNSHA' },
        { name: 'currency', label: 'Currency', type: 'text' },
        { name: 'active', label: 'Active', type: 'bool' },
        { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
      ]}
      rows={rows}
      onChanged={reload}
      newLabel="Add origin"
      blank={{ country: '', city: '', port: '', currency: 'USD', active: true, notes: '' }}
      columns={[
        { key: 'country', label: 'Country', render: (row) => <span className="text-charcoal font-medium">{text(row.country)}</span> },
        { key: 'city', label: 'City', render: (row) => <span className="text-charcoal-light">{text(row.city) || '—'}</span> },
        { key: 'port', label: 'Port', render: (row) => <span className="text-charcoal font-mono">{text(row.port) || '—'}</span> },
        { key: 'notes', label: 'Notes', render: (row) => <span className="text-charcoal-light text-xs">{text(row.notes) || '—'}</span> },
      ]}
    />
  );
}

export function PortChargesPanel({ rows, reload }: { rows: WholesaleRow[]; reload: () => Promise<void> | void }) {
  return (
    <RecordPanel
      resource="port_charges"
      title="Ports &amp; charges"
      description="A reference list of what a port charges, by side and by unit. It is a checklist to price a cost profile from — the numbers that reach a quote are the ones on the profile, snapshotted with it."
      fields={[
        {
          name: 'side',
          label: 'Side',
          type: 'select',
          options: [
            { value: 'origin', label: 'Origin' },
            { value: 'destination', label: 'Destination' },
          ],
        },
        { name: 'port', label: 'Port code', type: 'text' },
        { name: 'label', label: 'Charge', type: 'text', wide: true },
        { name: 'amount', label: 'Amount', type: 'number' },
        { name: 'currency', label: 'Currency', type: 'text' },
        {
          name: 'per',
          label: 'Charged per',
          type: 'select',
          options: [
            { value: 'container', label: 'Container' },
            { value: 'bl', label: 'Bill of lading' },
            { value: 'shipment', label: 'Shipment' },
            { value: 'cbm', label: 'CBM' },
            { value: 'kg', label: 'Kg' },
          ],
        },
        { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
      ]}
      rows={rows}
      onChanged={reload}
      newLabel="Add charge"
      blank={{ side: 'origin', port: '', label: '', amount: '', currency: 'USD', per: 'container', notes: '' }}
      columns={[
        { key: 'side', label: 'Side', render: (row) => (
          <span className="px-2 py-0.5 rounded-full bg-charcoal/5 text-charcoal-light text-xs font-semibold">{text(row.side)}</span>
        ) },
        { key: 'port', label: 'Port', render: (row) => <span className="text-charcoal font-mono">{text(row.port) || '—'}</span> },
        { key: 'label', label: 'Charge', render: (row) => <span className="text-charcoal">{text(row.label)}</span> },
        { key: 'amount', label: 'Amount', align: 'right', render: (row) => (
          <span className="text-charcoal">{money(row.amount, text(row.currency, 'USD'))}</span>
        ) },
        { key: 'per', label: 'Per', align: 'right', render: (row) => <span className="text-charcoal-light">{text(row.per)}</span> },
      ]}
    />
  );
}

export function FreightRatesPanel({
  rows,
  reload,
  provider,
}: {
  rows: WholesaleRow[];
  reload: () => Promise<void> | void;
  /** Whether a live provider can be asked — read from the workspace snapshot, never inferred here. */
  provider?: WholesaleWorkspace['freightProvider'];
}) {
  return (
    <div className="space-y-4">
      {provider ? (
        <Panel title="Live rates">
          <p className={`text-sm leading-relaxed ${provider.ready ? 'text-charcoal' : 'text-charcoal-light'}`}>{provider.summary}</p>
          {provider.missing.length ? (
            <p className="text-xs text-charcoal-light mt-2">
              Missing: {provider.missing.join(', ')} — paste them in <span className="font-medium text-charcoal">Settings → Ocean Freight — Live Rates</span>.
            </p>
          ) : null}
          <p className="text-xs text-charcoal-light mt-2">
            Whatever the provider answers, the rate that lands on a quotation says where it came from
            {provider.source === 'settings' ? ' — this configuration is stored in the site’s settings.' : provider.source === 'environment' ? ' — this configuration comes from the deployment’s environment.' : '.'}
          </p>
        </Panel>
      ) : null}
      <RecordPanel
      resource="freight_rates"
      title="Ocean freight"
      description="Rates per lane and container type. Source is stored, never guessed: a number you typed is 'manual' and a number a provider returned is 'api', and neither is ever presented as the other."
      fields={[
        {
          name: 'source',
          label: 'Source',
          type: 'select',
          options: [
            { value: 'manual', label: 'Manual — typed in' },
            { value: 'api', label: 'Provider API' },
          ],
        },
        { name: 'provider', label: 'Provider / forwarder', type: 'text' },
        { name: 'carrier', label: 'Carrier', type: 'text' },
        { name: 'origin_port', label: 'Origin port', type: 'text' },
        { name: 'destination_port', label: 'Destination port', type: 'text' },
        {
          name: 'container_type',
          label: 'Container',
          type: 'select',
          options: [
            { value: '20FT', label: '20ft' },
            { value: '40FT', label: '40ft' },
            { value: '40HC', label: '40ft high cube' },
          ],
        },
        { name: 'currency', label: 'Currency', type: 'text' },
        { name: 'ocean_freight', label: 'Base ocean freight', type: 'number', hint: 'Per container.' },
        { name: 'transit_days', label: 'Transit days', type: 'number' },
        { name: 'valid_until', label: 'Valid until', type: 'datetime' },
        { name: 'provider_reference', label: 'Provider reference', type: 'text' },
        { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
      ]}
      rows={rows}
      onChanged={reload}
      newLabel="Add rate"
      blank={{
        source: 'manual',
        provider: '',
        carrier: '',
        origin_port: '',
        destination_port: '',
        container_type: '20FT',
        currency: 'USD',
        ocean_freight: '',
        transit_days: '',
        valid_until: '',
        provider_reference: '',
        notes: '',
      }}
      columns={[
        { key: 'lane', label: 'Lane', render: (row) => (
          <span className="text-charcoal font-mono text-xs">
            {text(row.origin_port) || '—'} → {text(row.destination_port) || '—'}
          </span>
        ) },
        { key: 'container', label: 'Container', render: (row) => <span className="text-charcoal-light">{text(row.container_type)}</span> },
        { key: 'provider', label: 'Provider', render: (row) => (
          <div>
            <p className="text-charcoal">{text(row.provider) || '—'}</p>
            <p className="text-xs text-charcoal-light">{text(row.carrier) || '—'}</p>
          </div>
        ) },
        { key: 'provenance', label: 'Rate provenance', render: (row) => {
          const rawSource = text(row.source, 'manual').toLowerCase();
          const validUntil = text(row.valid_until);
          const isExpired = validUntil ? (Date.parse(validUntil) < Date.now()) : false;

          if (isExpired) {
            return (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                EXPIRED
              </span>
            );
          }
          if (rawSource === 'api') {
            return (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                LIVE API
              </span>
            );
          }
          if (rawSource === 'fallback') {
            return (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                FALLBACK
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              MANUAL
            </span>
          );
        } },
        { key: 'freight', label: 'Base', align: 'right', render: (row) => (
          <span className="text-charcoal">{money(row.ocean_freight, text(row.currency, 'USD'))}</span>
        ) },
        { key: 'valid', label: 'Valid until', align: 'right', render: (row) => (
          <span className="text-charcoal-light text-xs">{text(row.valid_until) || 'not stated'}</span>
        ) },
      ]}
      />
    </div>
  );
}

export function ContainerProfilesPanel({ rows, reload }: { rows: WholesaleRow[]; reload: () => Promise<void> | void }) {
  return (
    <RecordPanel
      resource="container_profiles"
      title="Container profiles"
      description="The limits the calculator compares against. These are guide figures for real boxes; correct them to your forwarder's own. Nothing in the engine hardcodes a container type."
      fields={[
        { name: 'code', label: 'Code', type: 'text', hint: 'e.g. 20FT' },
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'usable_cbm', label: 'Usable volume (CBM)', type: 'number' },
        { name: 'max_cargo_weight_kg', label: 'Max cargo weight (kg)', type: 'number' },
        {
          name: 'practical_volume_factor',
          label: 'Practical loading factor',
          type: 'number',
          hint: '1 = the whole nominal volume. 0.9 accounts for pallets and voids.',
        },
        {
          name: 'internal_length_cm',
          label: 'Inside length (cm)',
          type: 'number',
          hint: 'What the pallets actually stand on. With these three the pallet count is counted, not assumed.',
        },
        { name: 'internal_width_cm', label: 'Inside width (cm)', type: 'number' },
        { name: 'internal_height_cm', label: 'Inside height (cm)', type: 'number' },
        {
          name: 'pallet_capacity',
          label: 'Pallet capacity (assumed)',
          type: 'number',
          hint: 'Used only when the inside dimensions above are blank — then the plan says it is assuming.',
        },
        { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
      ]}
      rows={rows}
      onChanged={reload}
      newLabel="Add container profile"
      blank={{ code: '', name: '', usable_cbm: '', max_cargo_weight_kg: '', practical_volume_factor: '0.9', internal_length_cm: '', internal_width_cm: '', internal_height_cm: '', pallet_capacity: '', notes: '' }}
      columns={[
        { key: 'code', label: 'Code', render: (row) => <span className="text-charcoal font-mono">{text(row.code)}</span> },
        { key: 'name', label: 'Name', render: (row) => <span className="text-charcoal">{text(row.name)}</span> },
        { key: 'cbm', label: 'Usable CBM', align: 'right', render: (row) => <span className="text-charcoal">{plain(row.usable_cbm, 1)}</span> },
        { key: 'weight', label: 'Max cargo kg', align: 'right', render: (row) => <span className="text-charcoal">{plain(row.max_cargo_weight_kg, 0)}</span> },
        { key: 'factor', label: 'Practical factor', align: 'right', render: (row) => <span className="text-charcoal-light">{plain(row.practical_volume_factor, 2)}</span> },
        {
          key: 'inside',
          label: 'Inside L×W×H (cm)',
          align: 'right',
          render: (row) => (
            <span className="text-charcoal-light font-mono text-xs">
              {numberValue(row.internal_length_cm)
                ? `${plain(row.internal_length_cm, 0)}×${plain(row.internal_width_cm, 0)}×${plain(row.internal_height_cm, 0)}`
                : 'not measured'}
            </span>
          ),
        },
        { key: 'pallets', label: 'Pallets', align: 'right', render: (row) => (
          <span className="text-charcoal-light">{numberValue(row.pallet_capacity) ? plain(row.pallet_capacity, 0) : '—'}</span>
        ) },
      ]}
    />
  );
}
