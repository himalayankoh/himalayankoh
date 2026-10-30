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
  /**
   * Orders counted per lower-cased billing address **that carry no customer id at all**
   * — the guest orders. Kept apart from `ordersByEmail` because the two answer different
   * questions: "did this address buy?" and "how much of the order book has no account
   * behind it?". The customer screen shows the second as guest orders rather than
   * silently folding them into accounts that do not exist.
   */
  guestOrdersByEmail: Map<string, number>;
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
  const guestOrdersByEmail = new Map<string, number>();

  for (const order of input.orders ?? []) {
    const id = Number(order?.customer_id ?? 0);
    const hasAccount = Number.isFinite(id) && id > 0;
    if (hasAccount) {
      ordersByCustomerId.set(id, (ordersByCustomerId.get(id) ?? 0) + 1);
    }
    const email = String(order?.billing?.email ?? '').trim().toLowerCase();
    if (email) {
      ordersByEmail.set(email, (ordersByEmail.get(email) ?? 0) + 1);
      if (!hasAccount) guestOrdersByEmail.set(email, (guestOrdersByEmail.get(email) ?? 0) + 1);
    }
  }

  const ordersRead = (input.orders ?? []).length;
  const ordersReported =
    input.ordersReported === undefined || input.ordersReported === null
      ? null
      : Number(input.ordersReported);
  const complete = ordersReported === null ? true : ordersRead >= ordersReported;

  return { ordersByCustomerId, ordersByEmail, guestOrdersByEmail, ordersRead, ordersReported, complete };
}

/**
 * The order book's guest half: orders with no customer account attached.
 *
 * Reported as *orders* by *distinct billing address*, which is what the index can
 * support. It is deliberately not called a customer count: an address on a guest order
 * may belong to somebody who does have an account (the account and order records share
 * no id there), so the honest wording is "orders with no account".
 */
export function guestOrderSummary(index: OrderActivityIndex | null | undefined): {
  addresses: number;
  orders: number;
} {
  if (!index) return { addresses: 0, orders: 0 };
  let orders = 0;
  for (const count of index.guestOrdersByEmail.values()) orders += count;
  return { addresses: index.guestOrdersByEmail.size, orders };
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

/**
 * How a customer's order count was arrived at, for the console to label.
 *
 * `no-matching-order` is the case that is easy to get wrong and was: the whole order
 * book was read, the customer has something to be matched by, and no order carries it.
 * That is a *verified* zero — the same finding `verifiedOrderCount` returns — and
 * labelling it `not-verifiable` would report a checked answer as an unknown one, which
 * is the same error as the missing field this module exists to work around, pointing
 * the other way. `not-verifiable` is now reserved for the two cases where it is true:
 * the read was truncated, or the record carries neither an id nor an address to match.
 */
export type ActivityBasis =
  | 'customer-id'
  | 'billing-email'
  | 'no-matching-order'
  | 'store-reported'
  | 'not-verifiable';

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
  // Complete read, matchable record, no order: the zero is verified. The store's own
  // `orders_count` does not override the index here, because `verifiedOrderCount`
  // answers from the index whenever there is one — the label must describe the figure
  // that is actually shown, not the field it replaced.
  if ((Number.isFinite(id) && id > 0) || email) return 'no-matching-order';
  return 'not-verifiable';
}

/* ------------------------------------------------------------------------- */
/* What kind of account is this?                                             */
/* ------------------------------------------------------------------------- */

/**
 * Domains no customer can own (IANA reserves them for documentation and testing).
 * The store's own junk records used `example.com`.
 */
const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'test.org',
  'invalid',
  'localhost',
  'localdomain',
]);

/**
 * The shape of an address's local part, in the same vocabulary the cleanup census uses
 * (`scripts/audit-store-data.mjs`), so a row the console calls suspicious is a row the
 * manifest classifies the same way. Two implementations of this would drift, and the
 * one a reader trusted would be whichever they read last.
 */
export type LocalShape =
  | 'empty'
  | 'hex-run'
  | 'digits-only'
  | 'letters-only'
  | 'first.last'
  | 'letters+digits'
  | 'long-mixed'
  | 'other';

export function localShape(local: string): LocalShape {
  const value = String(local ?? '').toLowerCase();
  if (!value) return 'empty';
  if (/^[0-9a-f]{8,}$/.test(value)) return 'hex-run';
  if (/^[0-9]+$/.test(value)) return 'digits-only';
  if (/^[a-z]+$/.test(value)) return 'letters-only';
  if (/^[a-z]+\.[a-z]+$/.test(value)) return 'first.last';
  if (/^[a-z]+\d+$/.test(value)) return 'letters+digits';
  if (value.length >= 12 && /[0-9]/.test(value) && /[a-z]/.test(value)) return 'long-mixed';
  return 'other';
}

export interface SuspiciousFlags {
  /** True when the record matches a shape the census puts in its review classes. */
  suspicious: boolean;
  /** Why, in words that say how strong the evidence is. Null when nothing matched. */
  reason: string | null;
  /** The address's local-part shape, so the console can show the evidence, not a label. */
  shape: LocalShape;
}

/**
 * Does this account look like one of the 2,704 the store accumulated?
 *
 * The census this mirrors (`docs/production/CUSTOMER-DATA-AUDIT-2026-10-11.md`) found
 * the same two shapes, and it matters which is which: a reserved domain is *certain*
 * (no customer can own one), while a machine-shaped local part with no name on the
 * record is *unproven* — the registration form collected no name, so every account it
 * ever created is nameless, including genuine ones. So the reason says which it is, and
 * nothing here deletes, disables or quarantines anything.
 */
export function suspiciousAccount(customer: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  username?: string | null;
}): SuspiciousFlags {
  const email = String(customer?.email ?? '').trim().toLowerCase();
  const local = email.includes('@') ? email.slice(0, email.lastIndexOf('@')) : email;
  const shape = localShape(local);
  const domain = email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : '';

  if (domain && RESERVED_DOMAINS.has(domain)) {
    return {
      suspicious: true,
      reason: `the address is on ${domain}, a domain reserved for testing that no customer can own`,
      shape,
    };
  }

  const hasName = Boolean(String(customer?.first_name ?? '').trim() || String(customer?.last_name ?? '').trim());
  if (hasName) return { suspicious: false, reason: null, shape };

  if (shape === 'hex-run' || shape === 'digits-only') {
    return {
      suspicious: true,
      reason: `no name on the record and a machine-generated address local part (${shape})`,
      shape,
    };
  }
  if (shape === 'long-mixed') {
    return {
      suspicious: true,
      reason: `no name on the record and a machine-shaped address local part (${shape}) — unproven, listed for review`,
      shape,
    };
  }

  return { suspicious: false, reason: null, shape };
}

/**
 * Which of the five kinds of account this row is.
 *
 * Ordered so a staff account can never be described as a shopper — the store's own
 * administrator account carries two completed orders, so "buyer" is true of it and
 * would still be the wrong label for a screen about customers. `registered` is the
 * default: an account that exists and has no order against it, which is most of the
 * store's list and is not by itself evidence of anything.
 */
export type AccountKind = 'administrative' | 'suspicious' | 'buyer' | 'registered';

export function accountKind(
  customer: {
    id?: number | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    role?: string | null;
  },
  index?: OrderActivityIndex | null
): AccountKind {
  const role = String(customer?.role ?? '').trim().toLowerCase();
  if (role && role !== 'customer') return 'administrative';
  if (suspiciousAccount(customer).suspicious) return 'suspicious';
  if (isVerifiedBuyer(index, { id: customer?.id, email: customer?.email })) return 'buyer';
  return 'registered';
}
