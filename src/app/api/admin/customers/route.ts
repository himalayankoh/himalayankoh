/**
 * The store's customers, for the console's Customers screen.
 *
 * This is the commerce-side list: name, contact, how many orders the store counts
 * against them and what they add up to. Sign-in identity and roles are a different
 * thing and stay on Users — the console used to answer this screen from the
 * authentication table, which could not tell a shopper from a signup.
 *
 * Nothing here mutates a customer: the credential in use is not scoped for
 * customer writes, and the console says so rather than offering a button the store
 * would refuse.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  WooCustomerError,
  listWooCustomers,
  summariseCustomer,
} from '@/lib/woo/customers';
import { listWooOrders } from '@/lib/woo/orders';
import {
  buildOrderActivity,
  guestOrderSummary,
  type AccountKind,
  type OrderActivityIndex,
} from '@/lib/woo/customerActivity';

export const dynamic = 'force-dynamic';

/**
 * The order-derived buyer index for the "Buyers only" filter.
 *
 * The store omits `orders_count` from every customer record, so the filter cannot
 * be answered from the customer list at all — it used to match nothing, always.
 * Reading orders answers it for real, and the read is bounded: three pages of 100,
 * which covers every order this store holds and cannot grow into a query that
 * stalls the console on a busy day. Whatever it could not cover is reported as
 * incomplete rather than shown as "no orders".
 */
const ACTIVITY_PAGES = 3;

async function readOrderActivity(): Promise<OrderActivityIndex | null> {
  try {
    const pages = await Promise.all(
      Array.from({ length: ACTIVITY_PAGES }, (_, index) => listWooOrders({ perPage: 100, page: index + 1 }))
    );
    return buildOrderActivity({
      orders: pages.flatMap((page) => page.orders),
      ordersReported: pages[0]?.total ?? null,
    });
  } catch {
    // A console that cannot say who bought is better than one that says nobody did.
    return null;
  }
}

/**
 * The kinds of account this screen can be narrowed to, as the API accepts them.
 *
 * `guest` is not an account kind — a guest is an *order* with no account behind it, so
 * it is answered from the order index and reported beside the list rather than filtered
 * through it. Accepting it silently as "all" is the kind of quiet substitution that
 * makes a filter look broken, so an unrecognised value is refused (400) instead.
 */
const ACCOUNT_KINDS: AccountKind[] = ['administrative', 'suspicious', 'buyer', 'registered'];
const GUEST = 'guest';

function parseKind(raw: string | null): { kind: AccountKind | 'all' } | { error: string } {
  if (!raw || raw === 'all') return { kind: 'all' };
  if (raw === GUEST) return { kind: 'all' };
  if ((ACCOUNT_KINDS as string[]).includes(raw)) return { kind: raw as AccountKind };
  return {
    error: `Unknown account kind "${raw}". Use one of: all, ${ACCOUNT_KINDS.join(', ')}, ${GUEST}.`,
  };
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;

  try {
    const payingOnly = params.get('payingOnly') === '1';
    // Built for every view, not only when the filter is on: the Orders column is
    // otherwise a column of "Not reported" on a screen whose whole job is to show
    // who buys. It is three bounded page reads, and the console labels the figure
    // with where it came from.
    const activity = await readOrderActivity();

    const parsedKind = parseKind(params.get('kind'));
    if ('error' in parsedKind) return NextResponse.json({ error: parsedKind.error }, { status: 400 });

    const page = await listWooCustomers({
      search: params.get('search') || undefined,
      page: Number(params.get('page') ?? '1') || 1,
      perPage: Number(params.get('limit') ?? '') || undefined,
      payingOnly,
      activity,
      kind: parsedKind.kind,
      // Every account the store holds, not only role `customer`.
      //
      // The store's default list is role `customer`, which reports 2,704 accounts of
      // the 2,707 it actually holds — and the three it withholds are staff accounts,
      // including the owner's own administrator account, which carries two completed
      // orders from 2023. So the default list is not "the customers": it is the
      // customers *and not* the two or three accounts that transacted before the
      // store had a customer account for them. `all` costs nothing extra and makes
      // the count on this screen the store's real account count.
      role: 'all',
    });

    const customers = page.customers.map((customer) => summariseCustomer(customer, activity));

    /*
     * Counts of each kind, over the page that was read.
     *
     * Deliberately per page rather than store-wide: classifying every one of the
     * store's 2,707 accounts would be 28 page reads on every load of this screen, and
     * the figure would then be presented as if it had been checked against orders it
     * never saw. The store's own total is returned separately as `count`, and the two
     * are labelled apart so neither is mistaken for the other.
     */
    const kinds: Record<string, number> = { all: customers.length, buyer: 0, registered: 0, administrative: 0, suspicious: 0 };
    for (const customer of customers) kinds[customer.accountKind] = (kinds[customer.accountKind] ?? 0) + 1;

    return NextResponse.json({
      customers,
      count: page.total,
      totalPages: page.totalPages,
      page: page.page,
      /** The kind this page was narrowed to, so the screen can label the count. */
      kind: params.get('kind') || 'all',
      /** How many of the returned rows are each kind. Per page, not store-wide. */
      kinds,
      /** Orders with no customer account, from the same order read the buyers use. */
      guests: guestOrderSummary(activity),
      // What the page's own figures rest on, so the console can label them instead
      // of implying it looked at the whole order book when it did not.
      activity: activity
        ? { ordersRead: activity.ordersRead, ordersReported: activity.ordersReported, complete: activity.complete }
        : null,
      buyersVerified: customers.filter((customer) => (customer.verifiedOrders ?? 0) > 0).length,
    });
  } catch (error) {
    const status = error instanceof WooCustomerError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'The customers could not be read.';
    return NextResponse.json({ error: message }, { status });
  }
}
