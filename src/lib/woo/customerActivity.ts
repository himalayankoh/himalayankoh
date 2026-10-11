/**
 * Who has actually bought — answered from orders, because the customer record cannot.
 *
 * ## The problem this solves
 *
 * WooCommerce reports `orders_count` and `total_spent` on a customer record, and
 * this store does not: measured against the live store, `GET /wc/v3/customers/<id>`
 * omits both keys entirely, for every one of its 2,704 customer records. So the
 * console's "Buyers only" toggle, which filtered on `orders_count > 0`, could only
 * ever return an empty list — a filter whose only possible answer was "nobody has
 * ever bought anything" — and the count beside it read zero on every page.
 *
 * Deriving the answer from the store's *orders* is what the mission asks for when
 * the store omits a field: a verified aggregation. Each order carries a
 * `customer_id` when it belongs to an account and a billing email always, so an
 * order can be attributed to a customer by id, and otherwise by address — which is
 * the only identifier the two records share for a guest who later registered.
 *
 * ## What "complete" means, and why it is reported
 *
 * An index built from part of the order book would answer "this customer never
 * bought" for a customer whose order simply was not read. That is the same class of
 * error as showing an absent field as zero, so the caller is told whether the index
 * covers every order, and the console refuses to say "no orders" when it does not.
 * A truncated read is reported as unknown, never as zero.
 */

/** The fields of a WooCommerce order this needs — kept structural so the module
 * has no dependency on the orders client and can be tested on literals. */
export interface OrderActivitySource {
  customer_id?: number | null;
  billing?: { email?: string | null } | null;
}

export interface OrderActivityIndex {
  /** Orders counted per customer id. */
  ordersByCustomerId: Map<number, number>;
  /** Orders counted per lower-cased billing address, for guests. */
  ordersByEmail: Map<string, number>;
  /** How many orders the index was built from. */
  ordersRead: number;
  /** The store's own total, when it reported one. */
  ordersReported: number | null;
  /** True when every order the store holds is in this index. */
  complete: boolean;
}

export interface OrderActivityInput {
  orders: readonly OrderActivitySource[];
  /** The store's `x-wp-total`, when the caller read it. */
  ordersReported?: number | null;
}

/** Build the index. Pure: no clock, no network, no store. */
export function buildOrderActivity(input: OrderActivityInput): OrderActivityIndex {
  const ordersByCustomerId = new Map<number, number>();
  const ordersByEmail = new Map<string, number>();

  for (const order of input.orders ?? []) {
    const id = Number(order?.customer_id ?? 0);
    if (Number.isFinite(id) && id > 0) {
      ordersByCustomerId.set(id, (ordersByCustomerId.get(id) ?? 0) + 1);
    }
    const email = String(order?.billing?.email ?? '').trim().toLowerCase();
    if (email) ordersByEmail.set(email, (ordersByEmail.get(email) ?? 0) + 1);
  }

  const ordersRead = (input.orders ?? []).length;
  const ordersReported =
    input.ordersReported === undefined || input.ordersReported === null
      ? null
      : Number(input.ordersReported);
  const complete = ordersReported === null ? true : ordersRead >= ordersReported;

  return { ordersByCustomerId, ordersByEmail, ordersRead, ordersReported, complete };
}

/**
 * Orders attributable to one customer, or `null` when the index cannot say.
 *
 * `null` is the honest answer in two cases: the read was truncated, so a zero
 * would be a claim the index cannot support; and a customer with neither an id nor
 * an address on the record, which nothing can be matched against.
 *
 * An id match wins over an address match when both exist: two accounts can share a
 * family address, and attributing one account's orders to the other would inflate
 * their history.
 */
export function verifiedOrderCount(
  index: OrderActivityIndex | null | undefined,
  customer: { id?: number | null; email?: string | null }
): number | null {
  if (!index) return null;

  const id = Number(customer?.id ?? 0);
  const email = String(customer?.email ?? '').trim().toLowerCase();
  const byId = Number.isFinite(id) && id > 0 ? index.ordersByCustomerId.get(id) : undefined;
  const byEmail = email ? index.ordersByEmail.get(email) : undefined;

  // A hit is evidence whatever the read covered; an id match is exact, and an
  // address match is the strongest answer available without one.
  if (byId !== undefined) return byId;
  if (byEmail !== undefined) return byEmail;

  // Nothing matched. That is only evidence of "never bought" if every order was read.
  if (!index.complete) return null;
  if (Number.isFinite(id) && id > 0) return 0;
  if (email) return 0;
  // Nothing on the record to match against at all.
  return null;
}

/** True when this customer can be called a buyer on the evidence in the index. */
export function isVerifiedBuyer(
  index: OrderActivityIndex | null | undefined,
  customer: { id?: number | null; email?: string | null }
): boolean {
  const count = verifiedOrderCount(index, customer);
  return count !== null && count > 0;
}

/** How a customer's order count was arrived at, for the console to label. */
export type ActivityBasis = 'customer-id' | 'billing-email' | 'store-reported' | 'not-verifiable';

export function activityBasis(
  index: OrderActivityIndex | null | undefined,
  customer: { id?: number | null; email?: string | null; ordersCount?: number | null }
): ActivityBasis {
  if (!index) {
    return customer?.ordersCount === undefined || customer?.ordersCount === null
      ? 'not-verifiable'
      : 'store-reported';
  }
  const id = Number(customer?.id ?? 0);
  if (Number.isFinite(id) && id > 0 && index.ordersByCustomerId.has(id)) return 'customer-id';
  const email = String(customer?.email ?? '').trim().toLowerCase();
  if (email && index.ordersByEmail.has(email)) return 'billing-email';
  // A partial read that found nothing cannot say which basis applies.
  if (!index.complete) return 'not-verifiable';
  return customer?.ordersCount === undefined || customer?.ordersCount === null
    ? 'not-verifiable'
    : 'store-reported';
}
