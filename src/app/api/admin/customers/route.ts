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
import { buildOrderActivity, type OrderActivityIndex } from '@/lib/woo/customerActivity';

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

    const page = await listWooCustomers({
      search: params.get('search') || undefined,
      page: Number(params.get('page') ?? '1') || 1,
      perPage: Number(params.get('limit') ?? '') || undefined,
      payingOnly,
      activity,
    });

    const customers = page.customers.map((customer) => summariseCustomer(customer, activity));

    return NextResponse.json({
      customers,
      count: page.total,
      totalPages: page.totalPages,
      page: page.page,
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
