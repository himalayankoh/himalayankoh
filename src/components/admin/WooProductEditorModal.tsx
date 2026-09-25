/**
 * The product editor when WooCommerce is the catalog source.
 *
 * Why a second editor rather than a rework of `ProductEditorModal`: that one is
 * typed against the Supabase rows and owns the Shippo packing profile, and the
 * console is under a visual freeze — so this component composes the same shared
 * primitives (`AdminModal`, `AdminField`, `AdminTabs`, the theme constants) and
 * talks to the store instead of the old database. One function picks between
 * them, so no page chooses.
 *
 * ## Price and stock on a variable product
 *
 * On this catalog almost every product is variable and the parent has no price
 * at all: the numbers are on the variations. So a variable product opens on a
 * variation table rather than a single price box, and a parent-level price edit
 * is never offered — WooCommerce would ignore it, and the owner would see a
 * saved change that did not happen. When the server does report an ignored
 * field, the reason is shown rather than swallowed.
 */

import { useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  Loader2,
  Package,
  Search as SearchIcon,
  Tag,
  Truck,
  DollarSign,
  Layers,
} from 'lucide-react';
import {
  AdminButton,
  AdminChip,
  AdminField,
  AdminInput,
  AdminModal,
  AdminNotice,
  AdminTabs,
  AdminTextarea,
} from './AdminUI';
import { MICRO_LABEL, SELECT } from './adminTheme';
import {
  archiveWooAdminProduct,
  createWooAdminProduct,
  getWooAdminProduct,
  updateWooAdminProduct,
  type WooProductPatch,
  type WooVariationPatch,
} from '../../lib/admin/wooProductApi';
import { variationLabel, type AdminProductRecord, type WooVariationLike } from '../../lib/woo/productPayload';

type TabId = 'basic' | 'pricing' | 'inventory' | 'images' | 'shipping' | 'seo';

export interface EditorCategory {
  id: string | number;
  name: string;
}

/** Form state. Strings throughout, because a half-typed price is not a number. */
interface Form {
  name: string;
  slug: string;
  status: 'publish' | 'draft';
  shortDescription: string;
  description: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  categoryIds: number[];
  tags: string;
  images: string[];
  manageStock: boolean;
  stockQuantity: string;
  stockStatus: 'instock' | 'outofstock' | 'onbackorder';
  lowStockAmount: string;
  weight: string;
  seoTitle: string;
  seoDescription: string;
}

const EMPTY_FORM: Form = {
  name: '',
  slug: '',
  status: 'draft',
  shortDescription: '',
  description: '',
  sku: '',
  price: '',
  compareAtPrice: '',
  categoryIds: [],
  tags: '',
  images: [],
  manageStock: false,
  stockQuantity: '',
  stockStatus: 'instock',
  lowStockAmount: '',
  weight: '',
  seoTitle: '',
  seoDescription: '',
};

function formFrom(product: AdminProductRecord): Form {
  return {
    name: product.name,
    slug: product.slug,
    status: product.isListed ? 'publish' : 'draft',
    shortDescription: product.shortDescription,
    description: product.description,
    sku: product.sku ?? '',
    price: product.price === null ? '' : product.price.toFixed(2),
    compareAtPrice: product.compareAtPrice === null ? '' : product.compareAtPrice.toFixed(2),
    categoryIds: product.categoryIds,
    tags: product.tags.join(', '),
    images: product.images,
    manageStock: product.manageStock,
    stockQuantity: product.stockQuantity === null ? '' : String(product.stockQuantity),
    stockStatus: product.stockStatus === 'outofstock' || product.stockStatus === 'onbackorder' ? product.stockStatus : 'instock',
    lowStockAmount: '',
    weight: product.weight === null ? '' : String(product.weight),
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
  };
}

/** A number, `null` for an explicit clear, or `undefined` for "leave it alone". */
function numberField(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A variation row as the editor holds it while editing. */
interface VariationDraft {
  id: number;
  label: string;
  regularPrice: string;
  salePrice: string;
  sku: string;
  stockQuantity: string;
  stockStatus: 'instock' | 'outofstock' | 'onbackorder';
}

function variationDrafts(variations: WooVariationLike[]): VariationDraft[] {
  return variations.map((variation) => ({
    id: Number(variation.id ?? 0),
    label: variationLabel(variation),
    regularPrice: String(variation.regular_price ?? ''),
    salePrice: String(variation.sale_price ?? ''),
    sku: String(variation.sku ?? ''),
    stockQuantity:
      typeof variation.stock_quantity === 'number' ? String(variation.stock_quantity) : '',
    stockStatus:
      variation.stock_status === 'outofstock' || variation.stock_status === 'onbackorder'
        ? variation.stock_status
        : 'instock',
  }));
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** null creates a product. */
  productId: number | null;
  categories: EditorCategory[];
  /** Called after a successful save so the list can re-read the store. */
  onSaved: (message: string, warnings: string[]) => void;
}

export default function WooProductEditorModal({
  isOpen,
  onClose,
  productId,
  categories,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<TabId>('basic');
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<Form | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [variations, setVariations] = useState<VariationDraft[]>([]);
  const [isVariable, setIsVariable] = useState(false);
  const [loading, setLoading] = useState(productId !== null);
  const [hydrated, setHydrated] = useState(productId === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notices, setNotices] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setDirtyFields((prev) => new Set(prev).add(key));
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setError('');
    setNotices([]);
    setTab('basic');
    setImageUrl('');

    if (productId === null) {
      setForm(EMPTY_FORM);
      setInitialForm(EMPTY_FORM);
      setDirtyFields(new Set());
      setVariations([]);
      setIsVariable(false);
      setLoading(false);
      setHydrated(true);
      return;
    }

    setLoading(true);
    setHydrated(false);
    getWooAdminProduct(productId)
      .then(({ product, variations: rows }) => {
        if (cancelled) return;
        const initial = formFrom(product);
        setForm(initial);
        setInitialForm(initial);
        setDirtyFields(new Set());
        setIsVariable(product.type === 'variable');
        setVariations(variationDrafts(rows));
        setHydrated(true);
        const missing = [
          product.price === null && product.type !== 'variable' ? 'price' : null,
          product.sku === null ? 'SKU' : null,
          product.images.length === 0 ? 'images' : null,
        ].filter((entry): entry is string => Boolean(entry));
        if (missing.length) {
          setNotices([`The store does not report: ${missing.join(', ')}. These are left empty rather than filled in.`]);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The product could not be read.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, productId]);

  async function handleSave(nextStatus?: 'publish' | 'draft') {
    if (!hydrated || loading || saving) return;
    if (!form.name.trim()) {
      setError('A product needs a title before it can be saved.');
      setTab('basic');
      return;
    }

    const status = nextStatus ?? form.status;
    const tags = form.tags.split(',').map((tag) => tag.trim()).filter(Boolean);

    // If existing product and nothing changed and status unchanged: exit cleanly
    if (productId !== null && dirtyFields.size === 0 && !nextStatus) {
      onClose();
      return;
    }

    let patch: WooProductPatch;
    if (productId === null) {
      // New product: send complete creation payload
      patch = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        status,
        shortDescription: form.shortDescription,
        description: form.description,
        sku: form.sku.trim(),
        categoryIds: form.categoryIds,
        tags,
        images: form.images,
        manageStock: form.manageStock,
        stockStatus: form.stockStatus,
        weight: numberField(form.weight) ?? null,
        seo: {
          title: form.seoTitle.trim() || null,
          description: form.seoDescription.trim() || null,
        },
      };
      const quantity = numberField(form.stockQuantity);
      if (quantity !== undefined) patch.stockQuantity = quantity;
      const lowStock = numberField(form.lowStockAmount);
      if (lowStock !== undefined && lowStock !== null) patch.lowStockAmount = lowStock;
      if (!isVariable) {
        const price = numberField(form.price);
        if (price !== undefined) patch.price = price;
        const compareAt = numberField(form.compareAtPrice);
        if (compareAt !== undefined) patch.compareAtPrice = compareAt;
      }
    } else {
      // Existing product: send ONLY dirty fields (true PATCH/merge semantics)
      patch = {};
      if (dirtyFields.has('name')) patch.name = form.name.trim();
      if (dirtyFields.has('slug')) patch.slug = form.slug.trim() || undefined;
      if (nextStatus !== undefined || dirtyFields.has('status')) patch.status = status;
      if (dirtyFields.has('shortDescription')) patch.shortDescription = form.shortDescription;
      if (dirtyFields.has('description')) patch.description = form.description;
      if (dirtyFields.has('sku')) patch.sku = form.sku.trim();
      if (dirtyFields.has('categoryIds')) patch.categoryIds = form.categoryIds;
      if (dirtyFields.has('tags')) patch.tags = tags;
      if (dirtyFields.has('images')) patch.images = form.images;
      if (dirtyFields.has('manageStock')) patch.manageStock = form.manageStock;
      if (dirtyFields.has('stockStatus')) patch.stockStatus = form.stockStatus;
      if (dirtyFields.has('weight')) patch.weight = numberField(form.weight) ?? null;
      if (dirtyFields.has('stockQuantity')) {
        const quantity = numberField(form.stockQuantity);
        if (quantity !== undefined) patch.stockQuantity = quantity;
      }
      if (dirtyFields.has('lowStockAmount')) {
        const lowStock = numberField(form.lowStockAmount);
        if (lowStock !== undefined && lowStock !== null) patch.lowStockAmount = lowStock;
      }
      if (!isVariable) {
        if (dirtyFields.has('price')) {
          const price = numberField(form.price);
          if (price !== undefined) patch.price = price;
        }
        if (dirtyFields.has('compareAtPrice')) {
          const compareAt = numberField(form.compareAtPrice);
          if (compareAt !== undefined) patch.compareAtPrice = compareAt;
        }
      }
      if (dirtyFields.has('seoTitle') || dirtyFields.has('seoDescription')) {
        patch.seo = {
          ...(dirtyFields.has('seoTitle') ? { title: form.seoTitle.trim() || null } : {}),
          ...(dirtyFields.has('seoDescription') ? { description: form.seoDescription.trim() || null } : {}),
        };
      }
    }

    const variationPatches: WooVariationPatch[] = isVariable
      ? variations.map((variation) => ({
          id: variation.id,
          regularPrice: numberField(variation.regularPrice) ?? null,
          salePrice: numberField(variation.salePrice) ?? null,
          sku: variation.sku.trim(),
          stockQuantity: numberField(variation.stockQuantity) ?? null,
          stockStatus: variation.stockStatus,
        }))
      : [];

    setSaving(true);
    setError('');
    try {
      const result =
        productId === null
          ? await createWooAdminProduct({ ...patch, type: 'simple' })
          : await updateWooAdminProduct(productId, patch, variationPatches);

      const warnings = result.ignored.map((entry) => `${entry.field}: ${entry.reason}`);
      onSaved(
        productId === null
          ? `“${patch.name}” was created in the store as a ${status === 'publish' ? 'published' : 'draft'} product.`
          : `“${patch.name}” was saved to the store.`,
        warnings
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The product could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (productId === null) return;
    setSaving(true);
    setError('');
    try {
      await archiveWooAdminProduct(productId);
      onSaved(`“${form.name}” was moved to the store's trash. It is recoverable in WooCommerce.`, []);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The product could not be archived.');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const tabs: Array<{ id: TabId; label: string; icon: typeof Tag; badge?: string }> = [
    { id: 'basic', label: 'Basic', icon: Tag },
    { id: 'pricing', label: 'Pricing', icon: DollarSign, badge: isVariable ? `${variations.length}` : undefined },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'images', label: 'Images', icon: ImageIcon, badge: form.images.length ? String(form.images.length) : undefined },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'seo', label: 'SEO', icon: SearchIcon },
  ];

  return (
    <AdminModal
      title={productId === null ? 'Add product' : form.name || 'Product'}
      description={
        productId === null
          ? 'Creates a real WooCommerce product. New products start as a draft.'
          : `WooCommerce product #${productId}${isVariable ? ' · variable' : ''}`
      }
      onClose={onClose}
      size="wide"
      bodyClassName="max-h-[70vh] overflow-y-auto"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {productId !== null && (
              <AdminButton variant="danger" onClick={handleArchive} disabled={saving}>
                Archive
              </AdminButton>
            )}
            <AdminChip tone={form.status === 'publish' ? 'success' : 'muted'}>
              {form.status === 'publish' ? 'Published' : 'Draft'}
            </AdminChip>
          </div>
          <div className="flex items-center gap-2">
            <AdminButton variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </AdminButton>
            {form.status === 'publish' ? (
              <AdminButton variant="secondary" onClick={() => handleSave('draft')} disabled={saving}>
                Move to draft
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" onClick={() => handleSave('publish')} disabled={saving}>
                Publish
              </AdminButton>
            )}
            <AdminButton variant="primary" onClick={() => handleSave()} disabled={saving || loading}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Save to store
            </AdminButton>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-admin-muted">
          <Loader2 size={16} className="animate-spin" /> Reading product #{productId} from the store…
        </div>
      ) : (
        <div className="space-y-4">
          {error && <AdminNotice tone="danger" title="Save failed">{error}</AdminNotice>}
          {notices.map((notice) => (
            <AdminNotice key={notice} tone="info" title="From the store">{notice}</AdminNotice>
          ))}

          <AdminTabs tabs={tabs} active={tab} onChange={setTab} />

          {tab === 'basic' && (
            <div className="grid grid-cols-2 gap-4">
              <AdminField label="Title" className="col-span-2">
                <AdminInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Himalayan Pink Salt — Fine Grain" />
              </AdminField>
              <AdminField label="URL slug" hint="Leave blank and WooCommerce derives it from the title.">
                <AdminInput value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="fine-grain-pink-salt" />
              </AdminField>
              <AdminField label="Listing state">
                <select className={SELECT} value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])}>
                  <option value="draft">Draft — not on the storefront</option>
                  <option value="publish">Published — live on the storefront</option>
                </select>
              </AdminField>
              <AdminField label="Short description" className="col-span-2" hint="Appears in listings and search results.">
                <AdminTextarea rows={2} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
              </AdminField>
              <AdminField label="Description" className="col-span-2">
                <AdminTextarea rows={7} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </AdminField>
              <AdminField label="Categories" className="col-span-2" hint="Only real storefront shelves are listed.">
                <div className="flex flex-wrap gap-2">
                  {categories.length === 0 && (
                    <span className="text-xs text-admin-muted">No categories are available from the store yet.</span>
                  )}
                  {categories.map((category) => {
                    const id = Number(category.id);
                    const active = form.categoryIds.includes(id);
                    return (
                      <button
                        key={String(category.id)}
                        type="button"
                        onClick={() =>
                          set(
                            'categoryIds',
                            active ? form.categoryIds.filter((entry) => entry !== id) : [...form.categoryIds, id]
                          )
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? 'border-himalayan bg-himalayan/10 text-himalayan-dark'
                            : 'border-admin-line bg-admin-surface text-admin-muted hover:text-admin-ink'
                        }`}
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </AdminField>
              <AdminField label="Tags" className="col-span-2" hint="Comma separated.">
                <AdminInput value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="pink salt, fine grain" />
              </AdminField>
            </div>
          )}

          {tab === 'pricing' && (
            <div className="space-y-4">
              {isVariable ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-admin-line text-left">
                        <th className={`px-3 py-2 ${MICRO_LABEL}`}>Variation</th>
                        <th className={`px-3 py-2 ${MICRO_LABEL}`}>Regular</th>
                        <th className={`px-3 py-2 ${MICRO_LABEL}`}>Sale</th>
                        <th className={`px-3 py-2 ${MICRO_LABEL}`}>SKU</th>
                        <th className={`px-3 py-2 ${MICRO_LABEL}`}>Stock</th>
                        <th className={`px-3 py-2 ${MICRO_LABEL}`}>Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-admin-line">
                      {variations.map((variation, index) => (
                        <tr key={variation.id}>
                          <td className="px-3 py-2 font-medium text-admin-ink">{variation.label}</td>
                          {(['regularPrice', 'salePrice', 'sku', 'stockQuantity'] as const).map((field) => (
                            <td key={field} className="px-3 py-2">
                              <AdminInput
                                value={variation[field]}
                                onChange={(e) =>
                                  setVariations((prev) =>
                                    prev.map((entry, i) => (i === index ? { ...entry, [field]: e.target.value } : entry))
                                  )
                                }
                                className="w-28"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <select
                              className={SELECT}
                              value={variation.stockStatus}
                              onChange={(e) =>
                                setVariations((prev) =>
                                  prev.map((entry, i) =>
                                    i === index ? { ...entry, stockStatus: e.target.value as VariationDraft['stockStatus'] } : entry
                                  )
                                )
                              }
                            >
                              <option value="instock">In stock</option>
                              <option value="outofstock">Out of stock</option>
                              <option value="onbackorder">On backorder</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-admin-muted">
                    This product is variable, so WooCommerce keeps price and stock per variation. The parent row has no
                    price of its own — the storefront shows the resulting range.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <AdminField label="Price" hint="What the customer pays.">
                    <AdminInput value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="9.95" inputMode="decimal" />
                  </AdminField>
                  <AdminField label="Compare-at price" hint="The struck-through “was” price. Leave blank for no sale.">
                    <AdminInput value={form.compareAtPrice} onChange={(e) => set('compareAtPrice', e.target.value)} placeholder="" inputMode="decimal" />
                  </AdminField>
                </div>
              )}
            </div>
          )}

          {tab === 'inventory' && (
            <div className="grid grid-cols-2 gap-4">
              <AdminField label="Stock status" className="col-span-2">
                <select className={SELECT} value={form.stockStatus} onChange={(e) => set('stockStatus', e.target.value as Form['stockStatus'])}>
                  <option value="instock">In stock</option>
                  <option value="outofstock">Out of stock</option>
                  <option value="onbackorder">On backorder</option>
                </select>
              </AdminField>
              <AdminField label="Track quantity" className="col-span-2" hint="When off, WooCommerce reports a status with no quantity — which is the state most of this catalog is in.">
                <label className="flex items-center gap-2 text-sm text-admin-ink">
                  <input
                    type="checkbox"
                    checked={form.manageStock}
                    onChange={(e) => set('manageStock', e.target.checked)}
                    className="h-4 w-4 rounded border-admin-line"
                  />
                  Track stock quantity for this product
                </label>
              </AdminField>
              {form.manageStock && (
                <>
                  <AdminField label="Quantity">
                    <AdminInput value={form.stockQuantity} onChange={(e) => set('stockQuantity', e.target.value)} inputMode="numeric" />
                  </AdminField>
                  <AdminField label="Low-stock threshold">
                    <AdminInput value={form.lowStockAmount} onChange={(e) => set('lowStockAmount', e.target.value)} inputMode="numeric" />
                  </AdminField>
                </>
              )}
              {!isVariable && (
                <AdminField label="SKU" className="col-span-2" hint="Left empty when the store has none — it is never invented.">
                  <AdminInput value={form.sku} onChange={(e) => set('sku', e.target.value)} />
                </AdminField>
              )}
            </div>
          )}

          {tab === 'images' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                {form.images.length === 0 && (
                  <p className="text-sm text-admin-muted">The store reports no images for this product.</p>
                )}
                {form.images.map((src) => (
                  <div key={src} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-24 w-24 rounded-xl border border-admin-line object-cover" />
                    <button
                      type="button"
                      onClick={() => set('images', form.images.filter((entry) => entry !== src))}
                      className="absolute -right-2 -top-2 rounded-full border border-admin-line bg-admin-surface px-1.5 text-xs text-admin-muted hover:text-admin-ink"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <AdminField
                label="Add image by URL"
                hint="WooCommerce copies the image into the WordPress media library when the product is saved."
              >
                <div className="flex gap-2">
                  <AdminInput value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
                  <AdminButton
                    variant="secondary"
                    onClick={() => {
                      const url = imageUrl.trim();
                      if (!url || form.images.includes(url)) return;
                      set('images', [...form.images, url]);
                      setImageUrl('');
                    }}
                  >
                    Add
                  </AdminButton>
                </div>
              </AdminField>
              <p className="text-[11px] text-admin-muted">
                Uploads to the WordPress media library need WordPress credentials, which this connection does not carry —
                so images are added by URL and stored by WooCommerce.
              </p>
            </div>
          )}

          {tab === 'shipping' && (
            <div className="grid grid-cols-2 gap-4">
              <AdminField label="Weight" hint="In the store's weight unit. Blank when the store reports none.">
                <AdminInput value={form.weight} onChange={(e) => set('weight', e.target.value)} inputMode="decimal" />
              </AdminField>
            </div>
          )}

          {tab === 'seo' && (
            <div className="space-y-4">
              <AdminField
                label="SEO title"
                hint={`${form.seoTitle.length}/60 characters · written to the store's SEO plugin`}
              >
                <AdminInput value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
              </AdminField>
              <AdminField
                label="Meta description"
                hint={`${form.seoDescription.length}/160 characters`}
              >
                <AdminTextarea rows={3} value={form.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} />
              </AdminField>
              <AdminNotice tone="info" title="Structured data follows this record">
                Structured data, canonicals and sitemap entries are generated by the storefront from the WooCommerce
                record itself, so they follow these fields automatically.
              </AdminNotice>
            </div>
          )}

          {isVariable && (
            <AdminNotice tone="info" title={`Variable product · ${variations.length} variations`}>
              <span className="inline-flex items-center gap-2">
                <Layers size={14} /> Price and stock are edited per variation on the Pricing tab.
              </span>
            </AdminNotice>
          )}
        </div>
      )}
    </AdminModal>
  );
}
