'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Search, Users } from 'lucide-react';
import {
  ADMIN_TD,
  AdminButton,
  AdminChip,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  AdminTableSkeleton,
} from '../../components/admin/AdminUI';
import { ICON_TILE, ICON_TILE_TONES, INPUT } from '../../components/admin/adminTheme';
import { fetchAdminCustomers, type AdminCustomer } from '../../lib/admin/consoleApi';
import { getErrorMessage } from '../../lib/errors';

const COLUMNS = [
  { key: 'customer', label: 'Customer', width: '32%' },
  { key: 'contact', label: 'Contact' },
  { key: 'orders', label: 'Orders', align: 'right' as const },
  { key: 'spend', label: 'Spend', align: 'right' as const },
  { key: 'last', label: 'Last order', align: 'right' as const },
];

/**
 * Customers — the store's own customer records.
 *
 * This screen used to read signup profiles from the authentication provider, which
 * meant it could not answer the only question a commerce console's customer page
 * exists for: who bought something. It now reads WooCommerce, which counts each
 * customer's orders and spend itself; those figures are shown as the store reports
 * them rather than summed here, because a second implementation of WooCommerce's
 * accounting would disagree with it the first time an order was refunded.
 *
 * A customer with no orders is still a customer — WooCommerce holds the account —
 * and the "buyers only" toggle narrows to people who have actually bought.
 * Identity and roles stay on Users; the two screens do not overlap.
 */
export default function AdminCustomers() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [buyersOnly, setBuyersOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      setFetchError(null);
      const result = await fetchAdminCustomers({
        search: search || undefined,
        page,
        limit: 25,
        payingOnly: buyersOnly,
      });
      setCustomers(result.customers);
      setTotalPages(result.totalPages || 1);
      setTotalCount(result.count);
    } catch (err) {
      setCustomers([]);
      setFetchError(getErrorMessage(err, 'The store’s customers could not be read.'));
    } finally {
      setLoading(false);
    }
  }, [search, page, buyersOnly]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const buyers = customers.filter((customer) => (customer.ordersCount ?? 0) > 0).length;

  return (
    <>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Customers"
        description="The store’s own customer records, with the order counts and spend WooCommerce reports for them."
        actions={
          <AdminButton icon={Users} onClick={fetchCustomers} disabled={loading}>
            Refresh
          </AdminButton>
        }
      />

      {fetchError && (
        <AdminNotice tone="danger" title="Customers could not be loaded">
          {fetchError}
        </AdminNotice>
      )}

      <AdminNotice tone="info" title="Counts are shown exactly as the store reports them">
        This store&apos;s WooCommerce customer records do not carry an order count or a spend total — the store
        omits both fields — so those columns read <strong>Not reported</strong> rather than zero, and nothing is
        summed here to fill the gap. A customer&apos;s actual orders are on the Orders screen, which reads the same
        store.
      </AdminNotice>

      <AdminNotice tone="info" title="This list is WooCommerce, and it is read-only">
        WooCommerce owns customer records, order counts and spend. Accounts and roles — who can sign in, and as
        what — live on the{' '}
        <Link to="/admin/users" className="font-semibold underline">
          Users
        </Link>{' '}
        screen, because that is a different system. The REST credential configured here can read customers and is
        not scoped to create them, so this console does not offer an &quot;add customer&quot; button whose request
        the store would refuse; customers are created by signing up.
      </AdminNotice>

      <AdminPanel bodyClassName="px-0 py-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-admin-line px-5 py-4">
          {/*
            The search field keeps its 320px floor only from `sm` up, and only takes
            `flex-1` there too. Below that the floor was wider than the phone: with
            three items on one nowrap row the panel could not fit, so the whole
            console pane scrolled sideways to reach the customer count. Wrapping the
            row and giving the field the full line (`w-full`, no grow) keeps every
            control on screen without shrinking the field to its icon; `sm:` restores
            the exact desktop layout.
          */}
          <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[320px] sm:flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search the store by name, email, or username…"
              aria-label="Search customers"
              className={`${INPUT} w-full pl-10`}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-admin-ink">
            <input
              type="checkbox"
              checked={buyersOnly}
              onChange={(event) => {
                setBuyersOnly(event.target.checked);
                setPage(1);
              }}
            />
            Buyers only
          </label>
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-muted">
            {loading ? 'Reading…' : `${totalCount} customer${totalCount === 1 ? '' : 's'}`}
          </span>
        </div>

        <AdminTable columns={COLUMNS}>
          {loading ? (
            <AdminTableSkeleton rows={5} columns={COLUMNS.length} />
          ) : customers.length === 0 ? (
            <tr>
              <td className={ADMIN_TD} colSpan={COLUMNS.length}>
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <span className={`${ICON_TILE} ${ICON_TILE_TONES.slate} h-11 w-11`}>
                    <Users size={20} />
                  </span>
                  <p className="text-sm font-semibold text-admin-ink">
                    {search || buyersOnly ? 'No customer in the store matches this' : 'The store reports no customers yet'}
                  </p>
                  <p className="text-sm text-admin-muted">
                    {search || buyersOnly
                      ? 'Try a different name or email, or clear the buyers-only filter.'
                      : 'Customer records appear here as accounts are created in WooCommerce.'}
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            customers.map((customer) => (
              <tr key={customer.id}>
                <td className={ADMIN_TD}>
                  <div className="flex items-center gap-3">
                    <span className={`${ICON_TILE} ${ICON_TILE_TONES.brand}`}>
                      {customer.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-admin-ink">{customer.name}</p>
                      <p className="truncate text-[11px] text-admin-muted">#{customer.id}</p>
                    </div>
                  </div>
                </td>
                <td className={`${ADMIN_TD} text-admin-muted`}>
                  <p className="flex items-center gap-1.5">
                    <Mail size={14} className="shrink-0" />
                    <span className="truncate">{customer.email ?? 'No email on the record'}</span>
                  </p>
                  {customer.phone && (
                    <p className="mt-1 flex items-center gap-1.5">
                      <Phone size={14} className="shrink-0" />
                      {customer.phone}
                    </p>
                  )}
                </td>
                <td className={`${ADMIN_TD} text-right`}>
                  {customer.ordersCount === null ? (
                    <AdminChip tone="muted">Not reported</AdminChip>
                  ) : customer.ordersCount > 0 ? (
                    <span className="font-semibold text-admin-ink">{customer.ordersCount}</span>
                  ) : (
                    <AdminChip tone="muted">None</AdminChip>
                  )}
                </td>
                <td className={`${ADMIN_TD} text-right`}>
                  {customer.totalSpent === null ? (
                    <AdminChip tone="muted">Not reported</AdminChip>
                  ) : (
                    <span className="font-semibold text-admin-ink">${customer.totalSpent.toFixed(2)}</span>
                  )}
                </td>
                <td className={`${ADMIN_TD} text-right text-admin-muted`}>
                  {customer.lastOrderAt ? (
                    <>
                      <p>{new Date(customer.lastOrderAt).toLocaleDateString()}</p>
                      <p className="text-[11px]">{customer.lastOrderStatus ?? ''}</p>
                    </>
                  ) : (
                    <AdminChip tone="muted">No orders</AdminChip>
                  )}
                </td>
              </tr>
            ))
          )}
        </AdminTable>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-admin-line px-5 py-3">
            <p className="text-sm text-admin-muted">
              Page {page} of {totalPages} · {totalCount} in the store
              {!loading && buyers !== customers.length ? ` · ${buyers} on this page have bought` : ''}
            </p>
            <div className="flex gap-2">
              <AdminButton onClick={() => setPage((current) => current - 1)} disabled={page === 1}>
                Previous
              </AdminButton>
              <AdminButton
                onClick={() => setPage((current) => current + 1)}
                disabled={page === totalPages}
              >
                Next
              </AdminButton>
            </div>
          </div>
        )}
      </AdminPanel>

      <p className="text-sm text-admin-muted">
        A customer&apos;s individual orders live on the{' '}
        <Link to="/admin/orders" className="font-semibold text-himalayan hover:underline">
          Orders
        </Link>{' '}
        screen, which reads the same store — order history is not duplicated here.
      </p>
    </>
  );
}
