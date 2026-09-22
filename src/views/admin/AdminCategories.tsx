import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, Edit, Trash2, Loader2, FolderTree, X } from 'lucide-react';
import { fetchAdminCatalogPage } from '../../lib/admin/adminCatalogClient';
import {
  createAdminCategory,
  deleteAdminCategory,
  listAdminCategories,
  updateAdminCategory,
  type AdminCategory,
} from '../../lib/admin/wooCategoryApi';
import type { AdminCatalogRow } from '../../lib/backend/adminCatalog';
import { getErrorMessage } from '../../lib/errors';
import {
  AdminButton,
  AdminChip,
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatTile,
} from '../../components/admin/AdminUI';
import { useNavigate, useSearchParams } from '../../lib/router-compat';
import {
  BUTTON,
  ICON_TILE,
  ICON_TILE_TONES,
  INPUT,
  MICRO_LABEL,
} from '../../components/admin/adminTheme';

/**
 * The category taxonomy, as WooCommerce holds it.
 *
 * This screen used to carry two editors — one for the Supabase catalog and one for
 * the store — and chose between them with the `NEXT_PUBLIC_DATA_SOURCE` flag. The
 * Supabase editor is gone with the Supabase catalog: a screen offering to write a
 * category into a backend the storefront no longer reads is a screen that can lose
 * the owner's work while appearing to save it.
 */
export default function AdminCategories({ initialNew = false }: { initialNew?: boolean } = {}) {
  const [rows, setRows] = useState<AdminCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  /** The store's own taxonomy, on the WooCommerce deployment. */
  const [wooCategories, setWooCategories] = useState<AdminCategory[]>([]);
  const [wooEditorOpen, setWooEditorOpen] = useState(false);
  const [wooEditing, setWooEditing] = useState<AdminCategory | null>(null);
  const [wooDeleteTarget, setWooDeleteTarget] = useState<AdminCategory | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shouldOpenNew = initialNew || searchParams.get('action') === 'new';

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const [page, terms] = await Promise.all([
        fetchAdminCatalogPage({ perPage: 100, sort: 'name' }),
        listAdminCategories(),
      ]);
      setRows(page.rows);
      setWooCategories(terms);
    } catch (err) {
      setFetchError(getErrorMessage(err, 'Failed to read the WooCommerce catalog.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (shouldOpenNew) {
      setWooEditing(null);
      setActionError(null);
      setWooEditorOpen(true);
    }
  }, [shouldOpenNew]);

  const closeWooEditor = () => {
    setWooEditorOpen(false);
    setWooEditing(null);
    setActionError(null);
    if (shouldOpenNew) navigate('/admin/categories');
  };

  /** Saves through WooCommerce and re-reads, so the list shows the store's row. */
  const handleWooSave = async (input: { name: string; slug: string; description: string }) => {
    setActionLoading(true);
    setActionError(null);
    try {
      if (wooEditing) await updateAdminCategory(wooEditing.id, input);
      else await createAdminCategory(input);
      setWooEditorOpen(false);
      setWooEditing(null);
      await fetchCategories();
      if (shouldOpenNew) navigate('/admin/categories');
    } catch (err) {
      setActionError(getErrorMessage(err, 'WooCommerce did not save that category.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleWooDelete = async (category: AdminCategory) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteAdminCategory(category.id);
      setWooDeleteTarget(null);
      await fetchCategories();
    } catch (err) {
      // The store refuses a delete while products are filed under the term; its
      // own sentence is the message, so it is shown rather than replaced. The
      // dialog stays open so the refusal is read where the click happened —
      // closing it would leave the reason behind a modal the user just dismissed.
      setActionError(getErrorMessage(err, 'WooCommerce did not delete that category.'));
    } finally {
      setActionLoading(false);
    }
  };

  // WooCommerce taxonomy, counted from the products the read model actually
  // returned. A category with no product in that read is not invented.
  const wooFacets = new Map<string, number>();
  for (const row of rows) {
    if (!row.categoryName) continue;
    wooFacets.set(row.categoryName, (wooFacets.get(row.categoryName) ?? 0) + 1);
  }
  const uncategorised = rows.filter((row) => !row.categoryName).length;

  return (
    <>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Categories"
        description="The WooCommerce taxonomy the storefront groups products by, read through the shared catalog."
        actions={
          <AdminButton
            variant="primary"
            icon={Plus}
            onClick={() => {
              setWooEditing(null);
              setActionError(null);
              setWooEditorOpen(true);
            }}
          >
            Add category
          </AdminButton>
        }
      />

      {fetchError && (
        <AdminNotice
          tone="danger"
          title="Categories could not be loaded"
          action={<AdminButton onClick={fetchCategories}>Retry</AdminButton>}
        >
          {fetchError}
        </AdminNotice>
      )}

      {actionError && (
        <AdminNotice
          tone="danger"
          title="That change was not saved"
          action={<AdminButton icon={X} onClick={() => setActionError(null)}>Dismiss</AdminButton>}
        >
          {actionError}
        </AdminNotice>
      )}

      <div className="grid grid-cols-4 gap-4">
        <AdminStatTile
          label="Categories in use"
          icon={FolderTree}
          tone="brand"
          value={loading ? undefined : wooFacets.size}
          unavailable={loading ? 'Reading…' : undefined}
          hint="WooCommerce"
        />
        <AdminStatTile
          label="Products read"
          icon={FolderTree}
          tone="green"
          value={loading ? undefined : rows.length}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Uncategorised"
          icon={FolderTree}
          tone="amber"
          value={loading ? undefined : uncategorised}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Editable here"
          icon={FolderTree}
          tone="slate"
          value={loading ? undefined : wooCategories.length}
          unavailable={loading ? 'Reading…' : undefined}
          hint="Written to WooCommerce"
        />
      </div>

      {loading ? (
        <AdminPanel title="Categories" description="Reading the catalog…">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl bg-admin-canvas" />
            ))}
          </div>
        </AdminPanel>
      ) : (
        <>
          <AdminPanel
            title="Taxonomy in use"
            description="Every category the catalog read returned, with the products counted in that same read."
          >
            {wooFacets.size === 0 ? (
              <p className="text-sm text-admin-muted">
                No category was reported by the catalog source. Products without one are counted as
                uncategorised rather than filed under a guess.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {[...wooFacets.entries()].map(([name, count]) => (
                  <div key={name} className="rounded-xl border border-admin-line px-4 py-3.5">
                    <p className="font-semibold text-admin-ink">{name}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-muted">
                      {count} product{count === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
                {uncategorised > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                    <p className="font-semibold text-amber-900">Uncategorised</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                      {uncategorised} product{uncategorised === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </AdminPanel>

          <AdminPanel
            title="Taxonomy"
            description="Every category in the store, with the product count WooCommerce reports for it. Edits are written to WooCommerce and re-read from it."
          >
            {wooCategories.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className={`${ICON_TILE} ${ICON_TILE_TONES.slate} h-11 w-11`}>
                  <FolderTree size={20} />
                </span>
                <p className="text-sm font-semibold text-admin-ink">No categories yet</p>
                <p className="text-sm text-admin-muted">
                  WooCommerce reported no product categories. Create the first one to group products.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-admin-line">
                {wooCategories.map((category) => (
                  <li key={category.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-admin-ink">{category.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-admin-muted">
                        /{category.slug} · WooCommerce id {category.id}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <AdminChip tone={category.count > 0 ? 'success' : 'muted'}>
                        {category.count} product{category.count === 1 ? '' : 's'}
                      </AdminChip>
                      <button
                        type="button"
                        onClick={() => {
                          setWooEditing(category);
                          setActionError(null);
                          setWooEditorOpen(true);
                        }}
                        className="rounded-lg p-2 text-admin-muted transition-colors hover:bg-admin-canvas hover:text-admin-ink"
                        aria-label={`Edit ${category.name}`}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setActionError(null); setWooDeleteTarget(category); }}
                        className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50"
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </>
      )}

      <WooCategoryEditorModal
        isOpen={wooEditorOpen}
        onClose={closeWooEditor}
        category={wooEditing}
        onSave={handleWooSave}
        loading={actionLoading}
        error={actionError}
      />

      <AnimatePresence>
        {wooDeleteTarget && (
          <AdminModal
            size="sm"
            title="Delete category"
            description="The category is removed from WooCommerce. Products are not deleted."
            onClose={() => { setWooDeleteTarget(null); setActionError(null); }}
            footer={
              <>
                <AdminButton onClick={() => { setWooDeleteTarget(null); setActionError(null); }}>
                  Cancel
                </AdminButton>
                <AdminButton
                  variant="danger"
                  onClick={() => handleWooDelete(wooDeleteTarget)}
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 size={16} className="animate-spin" />}
                  Delete
                </AdminButton>
              </>
            }
          >
            {actionError && (
              <AdminNotice tone="danger" title="That change was not saved">
                {actionError}
              </AdminNotice>
            )}
            <p className="text-sm text-admin-ink">
              <span className="font-semibold">{wooDeleteTarget.name}</span> currently holds{' '}
              {wooDeleteTarget.count} product{wooDeleteTarget.count === 1 ? '' : 's'}. WooCommerce refuses
              the delete while products are still filed under it, because it would move them to
              Uncategorized.
            </p>
          </AdminModal>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Category editor for WooCommerce.
 *
 * Same three fields the store actually owns — name, slug, description — and no
 * image or visibility control, because WooCommerce product categories have
 * neither: offering them would mean inventing fields the store would silently drop.
 *
 * The slug is only generated from the name for a *new* category. On an edit it is
 * whatever the owner typed: the slug is a public URL, so it is never recomputed
 * behind their back.
 */
function WooCategoryEditorModal({
  isOpen,
  onClose,
  category,
  onSave,
  loading,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  category: AdminCategory | null;
  onSave: (input: { name: string; slug: string; description: string }) => void;
  loading: boolean;
  /**
   * The store's refusal, shown inside the form.
   *
   * It used to be rendered only as a page-level notice, which sits *behind* this
   * dialog: submitting a slug another category already owns answered `409` with a
   * perfectly clear sentence that the person who typed the slug could not see.
   */
  error?: string | null;
}) {
  const [form, setForm] = useState({ name: '', slug: '', description: '' });

  useEffect(() => {
    setForm({
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      description: category?.description ?? '',
    });
  }, [category, isOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({ name: form.name, slug: form.slug, description: form.description });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <AdminModal
          title={category ? 'Edit category' : 'Add category'}
          description={
            category
              ? 'Written to WooCommerce. Changing the slug changes the public category URL.'
              : 'Written to WooCommerce as a new product category.'
          }
          onClose={onClose}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="woo-category-name" className={MICRO_LABEL}>
                Category name *
              </label>
              <input
                id="woo-category-name"
                type="text"
                required
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name,
                    slug: category
                      ? prev.slug
                      : name
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, ''),
                  }));
                }}
                className={`${INPUT} mt-1.5 w-full`}
                placeholder="Salt Licks"
              />
            </div>

            <div>
              <label htmlFor="woo-category-slug" className={MICRO_LABEL}>
                URL slug
              </label>
              <input
                id="woo-category-slug"
                type="text"
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                className={`${INPUT} mt-1.5 w-full`}
                placeholder="salt-licks"
              />
              <p className="mt-1 text-[11px] text-admin-muted">
                Lowercase letters, numbers and hyphens. A slug another category already uses is
                refused — not renamed.
              </p>
            </div>

            <div>
              <label htmlFor="woo-category-description" className={MICRO_LABEL}>
                Description
              </label>
              <textarea
                id="woo-category-description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className={`${INPUT} mt-1.5 w-full resize-none`}
                placeholder="Category description…"
              />
            </div>

            {error && (
              <AdminNotice tone="danger" title="That change was not saved">
                {error}
              </AdminNotice>
            )}

            <div className="flex justify-end gap-2 border-t border-admin-line pt-4">
              <AdminButton onClick={onClose}>Cancel</AdminButton>
              <button type="submit" disabled={loading} className={BUTTON.primary}>
                {loading && <Loader2 size={16} className="animate-spin" />}
                {category ? 'Save changes' : 'Create category'}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </AnimatePresence>
  );
}
