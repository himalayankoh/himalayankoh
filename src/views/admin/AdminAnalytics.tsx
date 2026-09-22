import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, DollarSign, Package, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { fetchAdminCatalogStats } from '../../lib/admin/adminCatalogClient';
import type { AdminCatalogStats } from '../../lib/backend/adminCatalog';
import type { AdminDashboardAnalytics } from '../../lib/admin/dashboardAnalytics';
import { getFreshAccessToken } from '../../services/wordpressAdminAuth';
import { getErrorMessage } from '../../lib/errors';
import {
  AdminButton,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatTile,
  AdminTableSkeleton,
} from '../../components/admin/AdminUI';
import { ICON_TILE, ICON_TILE_TONES, TABLE_BODY } from '../../components/admin/adminTheme';

/**
 * Analytics.
 *
 * Every figure comes from the store — WooCommerce orders, customers and stock, read
 * through `/api/admin/analytics`. A failed read leaves the tiles reading "Not
 * connected" rather than zero: an unknown revenue and a revenue of zero are different
 * claims, and this console never makes the second one on the first one's behalf.
 */
export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<AdminDashboardAnalytics | null>(null);
  const [catalogStats, setCatalogStats] = useState<AdminCatalogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    // Low-stock alerts name live products, so they are read from the active
    // catalog source — the same rule the dashboard follows.
    setCatalogStats(await fetchAdminCatalogStats().catch(() => null));

    setLoading(true);
    try {
      setFetchError(null);
      const token = await getFreshAccessToken();
      if (!token) throw new Error('Sign in as an administrator to see analytics.');

      const response = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as {
        analytics?: AdminDashboardAnalytics;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || `Could not load analytics (HTTP ${response.status}).`);

      setAnalytics(body.analytics ?? null);
    } catch (err) {
      setFetchError(getErrorMessage(err, 'Failed to load analytics.'));
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const maxRevenue = Math.max(...(analytics?.revenueSeries.map((d) => d.revenue) || [1]), 1);
  const totalRevenue = analytics?.revenueSeries.reduce((sum, d) => sum + d.revenue, 0) ?? null;
  const totalOrders = analytics?.revenueSeries.reduce((sum, d) => sum + d.orders, 0) ?? null;
  const maxProductRevenue = Math.max(...(analytics?.topProducts.map((p) => p.revenue) || [1]), 1);
  const unavailable = loading ? 'Reading…' : 'Not connected';

  return (
    <>
      <AdminPageHeader
        eyebrow="Growth"
        title="Analytics"
        description="Revenue, orders and product performance across the last seven days."
        actions={
          <AdminButton icon={BarChart3} onClick={fetchAnalytics} disabled={loading}>
            Refresh
          </AdminButton>
        }
      />

      {fetchError && (
        <AdminNotice tone="danger" title="Analytics could not be loaded">
          {fetchError}
        </AdminNotice>
      )}



      <div className="grid grid-cols-4 gap-4">
        <AdminStatTile
          label="Revenue (7d)"
          icon={DollarSign}
          tone="green"
          value={totalRevenue === null ? undefined : `$${totalRevenue.toFixed(2)}`}
          unavailable={totalRevenue === null ? unavailable : undefined}
        />
        <AdminStatTile
          label="Orders (7d)"
          icon={ShoppingCart}
          tone="sky"
          value={totalOrders === null ? undefined : totalOrders}
          unavailable={totalOrders === null ? unavailable : undefined}
        />
        <AdminStatTile
          label="Customers"
          icon={Users}
          tone="violet"
          value={analytics?.totalCustomers}
          unavailable={!analytics ? unavailable : undefined}
        />
        <AdminStatTile
          label="New customers"
          icon={TrendingUp}
          tone="amber"
          value={analytics?.newCustomers}
          unavailable={!analytics ? unavailable : undefined}
        />
      </div>

      {loading ? (
        <AdminPanel title="Sales" description="Reading order history…">
          <table className="w-full">
            <tbody className={TABLE_BODY}>
              <AdminTableSkeleton rows={4} columns={2} />
            </tbody>
          </table>
        </AdminPanel>
      ) : analytics ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <AdminPanel title="Revenue" description="Daily revenue across the recent window, from order history.">
              <div className="flex h-40 items-end gap-2">
                {analytics.revenueSeries.map((day) => (
                  <div key={day.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-himalayan-dark to-himalayan"
                      style={{ height: `${Math.max(8, (day.revenue / maxRevenue) * 100)}%` }}
                      title={`$${day.revenue.toFixed(2)} · ${day.orders} orders`}
                    />
                    <span className="text-[10px] text-admin-muted">{day.label}</span>
                  </div>
                ))}
              </div>
            </AdminPanel>

            <AdminPanel title="Order status" description="Share of the recent window.">
              <div className="space-y-3">
                {Object.entries(analytics.orderStatusCounts).map(([status, count]) => (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="capitalize text-admin-ink">{status}</span>
                      <span className="font-semibold text-admin-ink">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-admin-canvas">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-himalayan to-himalayan-dark"
                        style={{ width: `${totalOrders ? Math.min(100, (count / totalOrders) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </AdminPanel>
          </div>

          <AdminPanel title="Best sellers" description="Revenue by product, from order history.">
            {analytics.topProducts.length === 0 ? (
              <p className="text-sm text-admin-muted">No sales data yet.</p>
            ) : (
              <div className="space-y-4">
                {analytics.topProducts.map((product) => (
                  <div key={product.productName}>
                    <div className="mb-1 flex justify-between gap-4 text-sm">
                      <span className="truncate font-medium text-admin-ink">{product.productName}</span>
                      <span className="text-admin-muted">
                        ${product.revenue.toFixed(2)} · {product.quantity} sold
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-admin-canvas">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(5, (product.revenue / maxProductRevenue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminPanel>

          {/* Inventory counts are a Supabase column, so this panel only appears
              when that is the catalog the storefront reads. */}
          {catalogStats?.source !== 'woocommerce' && analytics.inventoryAlerts.length > 0 && (
            <AdminPanel
              title="Low stock alerts"
              description="Products at or below their threshold."
              action={
                <Link
                  to="/admin/inventory?filter=low_stock"
                  className="text-sm font-semibold text-himalayan hover:underline"
                >
                  Manage inventory
                </Link>
              }
            >
              <ul className="space-y-2">
                {analytics.inventoryAlerts.map((alert) => (
                  <li
                    key={alert.productId}
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm"
                  >
                    <span className="font-medium text-amber-900">{alert.productName}</span>
                    <span className="text-amber-800">
                      {alert.quantity} / threshold {alert.threshold}
                    </span>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          )}
        </>
      ) : (
        <AdminPanel title="Sales analytics" description="Revenue, order status and best sellers.">
          <div className="flex items-start gap-3 rounded-xl border border-admin-line bg-admin-canvas px-4 py-4">
            <span className={`${ICON_TILE} ${ICON_TILE_TONES.slate}`}>
              <Package size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-admin-ink">Not connected</p>
              <p className="mt-0.5 text-sm text-admin-muted">
                There is no orders source to read, so this page has no figures to show.
              </p>
            </div>
          </div>
        </AdminPanel>
      )}
    </>
  );
}
