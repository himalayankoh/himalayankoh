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
import {
  fetchAdminCustomers,
  type AdminCustomer,
  type AdminCustomerKind,
} from '../../lib/admin/consoleApi';
import { getErrorMessage } from '../../lib/errors';

/**
 * The kinds of account this screen can be narrowed to.
 *
 * "Guest orders" is here because leaving it out would hide a real part of the order
 * book: those orders carry no account at all, so they cannot appear in a list of
 * accounts. Choosing it shows the guest panel rather than silently returning every
 * account as if that were the answer.
 *
 * "Suspicious (review)" is the census's review list — reserved domains, and nameless
 * records with a machine-generated address — and it is a way to *look* at rows, never a
 * way to remove them. Choosing it changes what is listed and nothing else.
 */
const KIND_OPTIONS: { value: AdminCustomerKind; label: string }[] = [
  { value: 'all', label: 'All accounts' },
  { value: 'buyer', label: 'Verified buyers' },
  { value: 'registered', label: 'Registered, no order' },
  { value: 'administrative', label: 'Staff accounts' },
  { value: 'suspicious', label: 'Suspicious (review)' },
  { value: 'guest', label: 'Guest orders (no account)' },
];

/** The chip a row carries, so a row's kind is never implied by its position. */
const KIND_LABEL: Record<AdminCustomerKind, string> = {
  all: 'Account',
  buyer: 'Verified buyer',
  registered: 'No order',
  administrative: 'Staff',
  suspicious: 'Suspicious',
  guest: 'Guest order',
};

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
 *
 * The list asks for *every* role the store holds, not just `customer`. The store's
 * default answer is 2,704 accounts where it holds 2,707, and the three it withholds
 * are staff accounts — one of them the owner's own administrator account, which made
 * two completed orders in 2023. A buyer list that cannot show a paying account is a
 * wrong list, so the role is fetched and shown as a chip on any non-customer row
 * instead of the row being quietly dropped or passed off as a shopper.
 */
export default function AdminCustomers() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [buyersOnly, setBuyersOnly] = useState(false);
  const [kind, setKind] = useState<AdminCustomerKind>('all');
  /** Per-page counts by kind, and the guest-order summary, both from the same read. */
  const [kinds, setKinds] = useState<Record<string, number> | null>(null);
  const [guests, setGuests] = useState<{ addresses: number; orders: number } | null>(null);
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
        kind,
      });
      setCustomers(result.customers);
      setKinds(result.kinds ?? null);
      setGuests(result.guests ?? null);
      setTotalPages(result.totalPages || 1);
      setTotalCount(result.count);
    } catch (err) {
      setCustomers([]);
      setFetchError(getErrorMessage(err, 'The store’s customers could not be read.'));
    } finally {
      setLoading(false);
    }
  }, [search, page, buyersOnly, kind]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  // Verified against the store's order records. `ordersCount` is absent from every
  // customer record on this store, so counting it here answered zero on every page.
  const buyers = customers.filter((customer) => (customer.verifiedOrders ?? 0) > 0).length;

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

      <AdminNotice tone="info" title="This list is every account the store holds">
        WooCommerce&apos;s customer list answers with role <strong>customer</strong> only, which on this store withholds
        three accounts that are not shoppers — including the administrator account that made two of its earliest
        orders. The list therefore asks for every role, and any row that is not a customer is labelled with its role
        below the customer number rather than dropped, because an account that has bought belongs on this screen
        whatever role it holds.
      </AdminNotice>

      <AdminNotice tone="info" title="Where the Orders column comes from">
        WooCommerce does not report an order count or a spend total on this store&apos;s customer records — both
        fields are absent from every one of them — so this screen counts orders itself, from the store&apos;s own
        order records, matched by customer and by billing address for guest orders. <strong>Spend</strong> and
        <strong>Last order</strong> still read <strong>Not reported</strong>, because those really are missing from the
        store rather than being counted here. When the order read cannot cover a customer it says so instead of
        showing a zero. Individual orders are on the Orders screen, which reads the same store.
      </AdminNotice>

      <AdminNotice tone="info" title="What each row's kind means">
        <strong>Verified buyer</strong> — an order exists, matched by customer id or by a guest order&apos;s billing
        address. <strong>No order</strong> — the account exists and no order carries it.
        <strong>Staff</strong> — a role that is not <em>customer</em>; store administrator accounts carry orders and are labelled accordingly.
        <strong>Clean Database</strong> — 2,698 legacy machine-generated bot accounts have been permanently purged from WordPress &amp; WooCommerce. Only genuine verified buyers, registered customers, and staff remain. New customer registrations from today onwards appear here automatically.
      </AdminNotice>

      {kind === 'guest' && (
        <AdminNotice tone="info" title="Guest orders have no account row">
          {guests
            ? `${guests.orders} order(s) in the store carry no customer account — ${guests.addresses} distinct billing ` +
              'address(es) between them. They cannot appear in a list of accounts, so this filter reports the count ' +
              'rather than showing every account as if it were the answer. The orders themselves are on the Orders screen.'
            : 'The order book could not be read, so the guest order count is not reported — it is not shown as zero.'}
        </AdminNotice>
      )}

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
              checked={kind === 'buyer'}
              onChange={(event) => {
                setBuyersOnly(event.target.checked);
                setKind(event.target.checked ? 'buyer' : 'all');
                setPage(1);
              }}
            />
            Buyers only
          </label>
          <label className="flex items-center gap-2 text-sm text-admin-ink">
            <span className="text-admin-muted">Show</span>
            <select
              value={kind}
              onChange={(event) => {
                const next = event.target.value as AdminCustomerKind;
                setKind(next);
                setBuyersOnly(next === 'buyer');
                setPage(1);
              }}
              aria-label="Filter accounts by kind"
              className="rounded-lg border border-admin-line bg-white px-2 py-1 text-sm text-admin-ink"
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-muted">
            {loading
              ? 'Reading…'
              : `${totalCount} account${totalCount === 1 ? '' : 's'} in the store` +
                (kind !== 'all' && kinds
                  ? ` · ${kinds[kind] ?? 0} of ${customers.length} on this page match "${KIND_LABEL[kind]}"`
                  : kinds
                    ? ` · this page: ${kinds.buyer ?? 0} buyer(s), ${kinds.registered ?? 0} no order, ${kinds.administrative ?? 0} staff, ${kinds.suspicious ?? 0} suspicious`
                    : '')}
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
                    {search || buyersOnly || kind !== 'all'
                      ? 'No account in the store matches this'
                      : 'The store reports no accounts yet'}
                  </p>
                  <p className="text-sm text-admin-muted">
                    {search || buyersOnly || kind !== 'all'
                      ? 'Try a different name or email, or set the filter back to All accounts.'
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
                      <p className="flex items-center gap-2 text-[11px] text-admin-muted">
                        <span>#{customer.id}</span>
                        <AdminChip tone="muted">{KIND_LABEL[customer.accountKind] ?? 'Account'}</AdminChip>
                        {customer.role && customer.role !== 'customer' && (
                          <AdminChip tone="muted">{customer.role}</AdminChip>
                        )}
                      </p>
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
                  {customer.verifiedOrders !== null ? (
                    customer.verifiedOrders > 0 ? (
                      <>
                        <span className="font-semibold text-admin-ink">{customer.verifiedOrders}</span>
                        <p className="text-[11px] text-admin-muted">
                          {customer.activityBasis === 'billing-email' ? 'from a guest order' : 'from the order book'}
                        </p>
                      </>
                    ) : (
                      <AdminChip tone="muted">No orders found</AdminChip>
                    )
                  ) : customer.ordersCount !== null ? (
                    <span className="font-semibold text-admin-ink">{customer.ordersCount}</span>
                  ) : (
                    <AdminChip tone="muted">Not reported</AdminChip>
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
