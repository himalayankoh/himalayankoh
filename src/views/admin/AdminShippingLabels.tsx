'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2, Package, Printer, Search, Settings } from 'lucide-react';
import { getErrorMessage } from '../../lib/errors';
import { getFreshAccessToken } from '../../services/wordpressAdminAuth';
import { useAuthContext } from '../../context/AuthContext';
import { createShippoLabel } from '../../lib/shippo/client';
import { loadShippoConfig, type ShippoPublicConfig } from '../../lib/shippo/publicConfig';
import { publicEnv } from '../../lib/env';
import ShippingLabelPanel, { type LabelOrder } from '../../components/admin/ShippingLabelPanel';
import ShippingSetup from '../../admin/ShippingSetup';
import {
  AdminButton,
  AdminChip,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatTile,
} from '../../components/admin/AdminUI';
import { BUTTON, INPUT } from '../../components/admin/adminTheme';

/**
 * A paid order as this screen renders it — the fields `/api/admin/labels` sends.
 *
 * `LabelOrder` is the label block's own contract; the bench also prints the order
 * number, the email and the total, so those are added here.
 */
type AdminOrder = LabelOrder & {
  order_number: string;
  email: string;
  total: number;
  created_at: string;
};

export default function AdminShippingLabels() {
  const [activeTab, setActiveTab] = useState<'labels' | 'setup'>('labels');
  const { session } = useAuthContext();
  const [shippoConfig, setShippoConfig] = useState<ShippoPublicConfig | null>(null);
  const shippoEnabled = Boolean(shippoConfig?.configured && shippoConfig?.enabled);
  const [ready, setReady] = useState<AdminOrder[]>([]);
  const [pending, setPending] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{ succeeded: number; failed: number; totalCost: number } | null>(null);

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    void loadShippoConfig().then(setShippoConfig).catch(() => setShippoConfig(null));

    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error('Sign in as an administrator to see the label worklist.');

      const response = await fetch('/api/admin/labels', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as {
        ready?: AdminOrder[];
        pending?: AdminOrder[];
        error?: string;
      };

      if (!response.ok) throw new Error(body.error || `Could not load the label worklist (HTTP ${response.status}).`);

      setReady(body.ready ?? []);
      setPending(body.pending ?? []);
    } catch (err) {
      setFetchError(getErrorMessage(err, 'Failed to load shipping label orders.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const handleCreateLabel = async (order: AdminOrder) => {
    setCreatingId(order.id);
    setErrors((prev) => ({ ...prev, [order.id]: '' }));
    setNotices((prev) => ({ ...prev, [order.id]: '' }));

    const token = session?.access_token;
    if (!token) {
      setErrors((prev) => ({ ...prev, [order.id]: 'Session expired. Please re-authenticate.' }));
      setCreatingId(null);
      return;
    }

    try {
      const result = await createShippoLabel(order.id, token);
      if (result.ok) {
        setNotices((prev) => ({ ...prev, [order.id]: 'Label created successfully!' }));
        await fetchLabels();
      } else {
        setErrors((prev) => ({ ...prev, [order.id]: 'Failed to create label' }));
      }
    } catch (err) {
      setErrors((prev) => ({ ...prev, [order.id]: getErrorMessage(err, 'Failed to create label.') }));
    } finally {
      setCreatingId(null);
    }
  };

  const handleCreateAllLabels = async (orders: AdminOrder[]) => {
    if (!orders.length || bulkRunning) return;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: orders.length });
    setBulkSummary(null);

    let succeeded = 0;
    let failed = 0;
    let totalCost = 0;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const token = session?.access_token;
      if (!token) {
        failed += orders.length - i;
        break;
      }
      try {
        const res = await createShippoLabel(order.id, token);
        if (res.ok) {
          succeeded++;
          totalCost += Number(res.rateAmount || 0);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      setBulkProgress({ done: i + 1, total: orders.length });
    }

    setBulkSummary({ succeeded, failed, totalCost });
    setBulkRunning(false);
    await fetchLabels();
  };

  const filteredReady = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ready;
    return ready.filter(
      (o) =>
        (o.order_number && o.order_number.toLowerCase().includes(q)) ||
        (o.email && o.email.toLowerCase().includes(q)) ||
        (o.tracking_number && o.tracking_number.toLowerCase().includes(q))
    );
  }, [ready, search]);

  const filteredPending = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter(
      (o) =>
        (o.order_number && o.order_number.toLowerCase().includes(q)) ||
        (o.email && o.email.toLowerCase().includes(q))
    );
  }, [pending, search]);

  return (
          <div className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('labels')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'labels'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              Order Labels
            </button>
            <button
              onClick={() => setActiveTab('setup')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center gap-1.5 ${
                activeTab === 'setup'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Settings size={14} /> Shippo Configuration
            </button>
          </div>
          <Link to="/admin/orders" className="text-xs text-blue-600 hover:underline font-semibold">
            ← View Orders
          </Link>
        </div>

        {activeTab === 'setup' ? (
          <ShippingSetup />
        ) : (
          <>
            <AdminPageHeader
              eyebrow="System"
              title="Shipping labels"
              description="Download and print Shippo labels, and create new ones for paid orders that are ready to ship."
              actions={
                <Link to="/admin/orders" className={BUTTON.secondary}>
                  <Package size={16} />
                  All orders
                </Link>
              }
            />

            {fetchError && (
              <AdminNotice
                tone="danger"
                title="Shipping labels could not be loaded"
                action={<AdminButton onClick={fetchLabels}>Retry</AdminButton>}
              >
                {fetchError}
              </AdminNotice>
            )}



            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <AdminStatTile
                label="Ready to download"
                icon={Download}
                tone="sky"
                value={loading ? undefined : ready.length}
                unavailable={loading ? 'Reading…' : undefined}
              />
              <AdminStatTile
                label="Need a label"
                icon={Package}
                tone="amber"
                value={loading ? undefined : pending.length}
                unavailable={loading ? 'Reading…' : undefined}
              />
              <AdminStatTile
                label="Shippo integration"
                icon={Printer}
                tone={shippoEnabled ? 'green' : 'slate'}
                value={shippoEnabled ? 'Enabled' : 'Not Configured'}
                hint={shippoEnabled ? undefined : (shippoConfig?.reason ?? 'Missing credentials or sender address')}
              />
            </div>

            {!loading && !shippoEnabled && (
              <AdminNotice
                tone="warning"
                title="Shippo is not configured"
                action={
                  <button
                    type="button"
                    onClick={() => setActiveTab('setup')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Configure Shippo
                  </button>
                }
              >
                {shippoConfig?.reason || 'Shippo API key and warehouse sender address must be configured before purchasing shipping labels.'}
              </AdminNotice>
            )}

            <AdminPanel bodyClassName="px-5 py-4">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search order number, email or tracking…"
                  aria-label="Search labels"
                  className={`${INPUT} w-full pl-10`}
                />
              </div>
            </AdminPanel>

            {loading ? (
              <AdminPanel title="Labels" description="Reading orders…">
                <div className="space-y-3">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-14 animate-pulse rounded-xl bg-admin-canvas" />
                  ))}
                </div>
              </AdminPanel>
            ) : (
              <>
                <AdminPanel
                  title="Download labels"
                  description="PDF labels you can print at any time"
                  action={<AdminChip tone="info">{filteredReady.length}</AdminChip>}
                  bodyClassName="px-0 py-0"
                >
                  {filteredReady.length === 0 ? (
                    <p className="px-5 py-12 text-center text-sm text-admin-muted">
                      No labels yet. Create one from a paid order below and it appears here for download.
                    </p>
                  ) : (
                    <div className="divide-y divide-admin-line">
                      {filteredReady.map((order) => (
                        <div key={order.id} className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-admin-ink">{order.order_number}</p>
                            <p className="truncate text-sm text-admin-muted">
                              {order.profile?.full_name || order.email} · {new Date(order.created_at).toLocaleDateString()}
                            </p>
                            <p className="mt-1 text-xs text-admin-muted">
                              {order.shipping_carrier || 'Carrier'} · {order.tracking_number || 'No tracking'}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <a href={order.label_url!} target="_blank" rel="noopener noreferrer" className={BUTTON.primary}>
                              <Download size={16} />
                              Download PDF
                            </a>
                            <a href={order.label_url!} target="_blank" rel="noopener noreferrer" className={BUTTON.secondary}>
                              <Printer size={16} />
                              Print
                            </a>
                            <Link to={`/admin/orders?orderId=${order.id}`} className={BUTTON.secondary}>
                              View order
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AdminPanel>

                <AdminPanel
                  title="Create labels"
                  description="Paid orders waiting for a shipping label. Each label is a separate, real carrier charge."
                  action={
                    <div className="flex items-center gap-3">
                      <AdminChip tone="warning">{filteredPending.length}</AdminChip>
                      {filteredPending.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleCreateAllLabels(filteredPending)}
                          disabled={bulkRunning || !shippoEnabled}
                          className={`${BUTTON.primary} disabled:cursor-not-allowed`}
                        >
                          {bulkRunning && <Loader2 size={16} className="animate-spin" />}
                          {bulkRunning
                            ? `Creating ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? filteredPending.length}…`
                            : `Create all (${filteredPending.length})`}
                        </button>
                      )}
                    </div>
                  }
                  bodyClassName="px-0 py-0"
                >
                  {bulkSummary && (
                    <div
                      className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm ${
                        bulkSummary.failed > 0
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <p className="font-semibold">
                        {bulkSummary.succeeded} label{bulkSummary.succeeded === 1 ? '' : 's'} created
                        {bulkSummary.failed > 0 && `, ${bulkSummary.failed} failed`} — total cost $
                        {bulkSummary.totalCost.toFixed(2)}
                      </p>
                      {bulkSummary.failed > 0 && (
                        <p className="mt-1 text-amber-800">
                          Check the error under each failed order below and retry it individually.
                        </p>
                      )}
                    </div>
                  )}

                  {filteredPending.length === 0 ? (
                    <p className="px-5 py-12 text-center text-sm text-admin-muted">
                      All paid orders have labels, or nothing is ready to ship yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-admin-line">
                      {filteredPending.map((order) => (
                        <div key={order.id} className="px-5 py-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-admin-ink">{order.order_number}</p>
                              <p className="text-sm text-admin-muted">
                                {order.profile?.full_name || order.email} · ${order.total.toFixed(2)}
                              </p>
                            </div>
                            <Link
                              to={`/admin/orders?orderId=${order.id}`}
                              className="text-sm font-semibold text-himalayan hover:underline"
                            >
                              Open in Orders
                            </Link>
                          </div>
                          <ShippingLabelPanel
                            order={order}
                            shippoEnabled={shippoEnabled}
                            labelCreating={creatingId === order.id}
                            labelError={errors[order.id] || null}
                            labelNotice={notices[order.id] || null}
                            onCreateLabel={bulkRunning ? undefined : () => handleCreateLabel(order)}
                            variant="page"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </AdminPanel>
              </>
            )}
          </>
        )}
      </div>
      );
}
