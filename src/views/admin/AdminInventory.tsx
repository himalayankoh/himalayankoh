'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, PackageCheck, PackageX, RefreshCw } from 'lucide-react';
import {
  ADMIN_TD,
  AdminButton,
  AdminChip,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatTile,
  AdminTable,
  AdminTableSkeleton,
} from '../../components/admin/AdminUI';
import { fetchInventory, type InventoryReport } from '../../lib/admin/consoleApi';
import { getErrorMessage } from '../../lib/errors';

/**
 * Inventory.
 *
 * Stock is read from WooCommerce's own inventory settings, which is a different
 * question from the storefront's "can this be bought": whether the store tracks
 * units at all, what the thresholds are, whether backorders are allowed.
 *
 * On this store the honest answer is that WooCommerce is not managing stock —
 * every product has "Manage stock" switched off — so there is no quantity and no
 * low-stock alert. The page used to ask for a credential it already held; now it
 * states the setting, because the owner can change it in WooCommerce and the
 * quantities appear here with no code change.
 *
 * Nothing here is derived from another system. A product with no readable count
 * shows a dash, never a zero.
 */
export default function AdminInventory() {
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchInventory());
    } catch (err) {
      setReport(null);
      setError(getErrorMessage(err, 'The inventory could not be read from the store.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const all = report?.rows ?? [];
    if (!search.trim()) return all;
    const needle = search.trim().toLowerCase();
    return all.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) || (row.sku ?? '').toLowerCase().includes(needle)
    );
  }, [report, search]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Inventory"
        description="Stock as WooCommerce tracks it — quantities, thresholds and backorders, straight from the store."
        actions={
          <AdminButton icon={RefreshCw} onClick={load} disabled={loading}>
            Refresh
          </AdminButton>
        }
      />

      {error && (
        <AdminNotice tone="danger" title="The store’s inventory could not be read">
          {error}
        </AdminNotice>
      )}


      <div className="grid grid-cols-1 min-[375px]:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatTile
          label="Products in store"
          icon={Boxes}
          tone="brand"
          value={loading ? undefined : report?.productsRead}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Tracked quantities"
          icon={PackageCheck}
          tone={report?.tracksQuantities ? 'green' : 'amber'}
          value={loading ? undefined : report?.rows.filter((row) => row.tracksQuantity).length}
          unavailable={loading ? 'Reading…' : undefined}
          hint={loading || report?.tracksQuantities ? undefined : 'WooCommerce is not managing stock'}
        />
        <AdminStatTile
          label="Out of stock"
          icon={PackageX}
          tone="slate"
          value={loading ? undefined : report?.outOfStock}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Low stock"
          icon={Boxes}
          tone={report && report.lowStock > 0 ? 'amber' : 'slate'}
          value={loading ? undefined : report?.lowStock}
          unavailable={loading ? 'Reading…' : undefined}
          hint={loading || report?.tracksQuantities ? undefined : 'No thresholds to breach'}
        />
      </div>

      <div className="min-h-28">
        {loading && <p role="status" className="text-sm text-admin-muted py-4">Reading stock policies from WooCommerce…</p>}
      {!loading && report && report.notes.length > 0 && (
        <AdminNotice tone="warning" title="How stock is tracked on this store">
          <ul className="list-disc space-y-1 pl-5">
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </AdminNotice>
      )}

      </div>

      <AdminPanel
        title="Stock by product"
        description="Status is WooCommerce’s. A count appears only where the store actually keeps one."
        action={<AdminChip tone="neutral">{rows.length} rows</AdminChip>}
      >
        <div className="mb-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by product or SKU…"
            aria-label="Search inventory"
            className="w-full max-w-md rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5 text-sm"
          />
        </div>

        <AdminTable
          columns={[
            { key: 'product', label: 'Product', width: '42%' },
            { key: 'sku', label: 'SKU' },
            { key: 'managed', label: 'Counted' },
            { key: 'qty', label: 'Quantity', align: 'right' },
            { key: 'status', label: 'Status', align: 'right' },
          ]}
        >
          {loading ? (
            <AdminTableSkeleton rows={6} columns={5} />
          ) : rows.length === 0 ? (
            <tr>
              <td className={ADMIN_TD} colSpan={5}>
                <p className="py-10 text-center text-sm text-admin-muted">
                  {search
                    ? 'No product in the store matches that search.'
                    : 'The store reported no products.'}
                </p>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.type}-${row.id}`}>
                <td className={ADMIN_TD}>
                  <p className="font-medium text-admin-ink">
                    {row.parentId ? <span className="text-admin-muted">↳ </span> : null}
                    {row.name}
                  </p>
                  {row.parentId && (
                    <p className="text-[11px] text-admin-muted">variation of product {row.parentId}</p>
                  )}
                </td>
                <td className={`${ADMIN_TD} text-admin-muted`}>{row.sku ?? 'No SKU'}</td>
                <td className={ADMIN_TD}>
                  {row.tracksQuantity ? (
                    <AdminChip tone="success">Yes</AdminChip>
                  ) : (
                    <AdminChip tone="muted">Not managed</AdminChip>
                  )}
                </td>
                <td className={`${ADMIN_TD} text-right font-semibold`}>
                  {row.quantity === null ? '—' : row.quantity}
                </td>
                <td className={`${ADMIN_TD} text-right`}>
                  {row.lowStock ? (
                    <AdminChip tone="warning">Low ({row.quantity})</AdminChip>
                  ) : row.stockStatus === 'in_stock' ? (
                    <AdminChip tone="success">In stock</AdminChip>
                  ) : row.stockStatus === 'out_of_stock' ? (
                    <AdminChip tone="danger">Out of stock</AdminChip>
                  ) : row.stockStatus === 'on_backorder' ? (
                    <AdminChip tone="warning">On backorder</AdminChip>
                  ) : (
                    <AdminChip tone="muted">Unknown</AdminChip>
                  )}
                  {row.backorders && (
                    <p className="mt-1 text-[11px] text-admin-muted">backorders: {row.backorders}</p>
                  )}
                </td>
              </tr>
            ))
          )}
        </AdminTable>
      </AdminPanel>

      <AdminPanel title="Where stock is written" description="One owner, no second inventory table">
        <ul className="space-y-2 text-sm text-admin-ink">
          <li>
            WooCommerce is the inventory of record. The storefront reads the same numbers through the same
            credential, so what a shopper sees and what this page shows cannot drift.
          </li>
          <li>
            Nothing on this deployment decrements stock: the app does not maintain a parallel inventory table, and
            no order path writes a count. When the store starts managing stock, WooCommerce&apos;s own order flow is
            what reduces it.
          </li>
          {report && report.unexpanded > 0 && (
            <li>
              {report.unexpanded} variable product{report.unexpanded === 1 ? '' : 's'} were listed without their
              variations on this refresh, to avoid one store request per product. Turn stock management on and the
              console expands the first ones automatically.
            </li>
          )}
        </ul>
      </AdminPanel>
    </>
  );
}
