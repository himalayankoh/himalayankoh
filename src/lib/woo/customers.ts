/**
 * WooCommerce customers — server only.
 *
 * ## Two different things were sharing one screen
 *
 * The console's Customers page read Supabase `profiles`: rows that exist because
 * someone signed up. That is an *identity* list, not a customer list — it cannot
 * answer "who bought something", which is the only question a commerce console's
 * customer page is for. Identity (accounts, roles, sign-in) is a separate concern
 * and stays on Users; this module reads the store's own customer records, which
 * is where order history and spend live.
 *
 * ## Why the totals are not computed here
 *
 * WooCommerce reports `orders_count` and `total_spent` on the customer record
 * itself. Recomputing them by summing orders would be a second implementation of
 * WooCommerce's own accounting (it excludes refunds, cancelled orders and
 * trashed ones by its own rules), and the two would disagree the first time an
 * order was refunded. The store's numbers are used as reported.
 *
 * ## The write gap is real and is not papered over
 *
 * The consumer key in use can read customers. Creating one through the REST API
 * requires the *write* scope on the same key, and this store's key was issued for
 * the catalogue and orders work; the console therefore does not offer "add
 * customer" rather than offering a button whose request the store would refuse.
 * Customer accounts are created by signing up, which is the WordPress/WooCommerce
 * account path.
 */

import { wordpressRequest, wordpressRequestWithMeta } from '../backend/wordpress';
import { requireWooCredentials } from '../backend/credentials';
import type { WooOrderAddress } from './orders';
import {
  activityBasis,
  accountKind,
  suspiciousAccount,
  verifiedOrderCount,
  type AccountKind,
  type ActivityBasis,
  type LocalShape,
  type OrderActivityIndex,
} from './customerActivity';

const REST_V3 = '/wc/v3';

/** A customer as REST v3 reports it. */
export interface WooCustomerRecord {
  id: number;
  date_created_gmt?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  role?: string;
  billing?: WooOrderAddress;
  shipping?: WooOrderAddress;
  avatar_url?: string;
  /** Orders the store counts against this customer. */
  orders_count?: number;
  /** Spend the store counts, in the store's currency. */
  total_spent?: string;
  last_order?: { id?: number; date_created_gmt?: string; status?: string; total?: string } | null;
  is_paying_customer?: boolean;
}

export interface WooCustomerQuery {
  search?: string;
  page?: number;
  perPage?: number;
  /**
   * Only customers verified to have bought something. Measured from the store's
   * orders, because the customer record carries no `orders_count` here — see
   * `./customerActivity`. Without an index the old `orders_count` rule is used and,
   * on this store, can only match nothing.
   */
  payingOnly?: boolean;
  /** The order-derived buyer index, or null when the orders could not be read. */
  activity?: OrderActivityIndex | null;
  /**
   * Narrow to one kind of account. `all` (or omitted) leaves the list whole.
   *
   * `suspicious` is the census's review list — reserved domains and machine-shaped
   * addresses with no name on the record — and is a *filter for looking*, never a
   * delete: the console must be able to show the owner exactly which rows matched what.
   */
  kind?: AccountKind | 'all';
  /**
   * Which roles to list. Omitted means the store's own default, which is
   * **`customer` only** — and on this store that hides three accounts, one of which
   * is the owner's own administrator account carrying two completed orders. A buyer
   * list that omits a paying account is wrong, so a caller that wants every account
   * the store holds asks for `all` and the store answers it.
   */
  role?: string;
}

export interface WooCustomerPage {
  customers: WooCustomerRecord[];
  total: number;
  totalPages: number;
  page: number;
}

export class WooCustomerError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'WooCustomerError';
    this.status = status;
  }
}

const READ_TIMEOUT = 25_000;

/** A page of the store's customers. */
export async function listWooCustomers(query: WooCustomerQuery = {}): Promise<WooCustomerPage> {
  requireWooCredentials();
  const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  try {
    const response = await wordpressRequestWithMeta<WooCustomerRecord[]>(`${REST_V3}/customers`, {
      useCredentials: true,
      // No `orderby` here on purpose: `/wc/v3/customers` rejects the sort keys it
      // documents (`orderby=registered` answers 400 rest_invalid_param on this
      // store), and a route that guesses a sort is a route that 502s. The store's
      // own default order is used as reported.
      params: {
        per_page: perPage,
        page,
        search: query.search || undefined,
        role: query.role || undefined,
      },
      timeoutMs: READ_TIMEOUT,
    });

    const rows = Array.isArray(response.data) ? response.data : [];
    const customers = rows.filter((row) => {
      const kind = accountKind(
        {
          id: row.id,
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          username: row.username,
          role: row.role,
        },
        query.activity
      );

      // The kind filter and the buyers-only toggle are the same decision seen two
      // ways, so `kind` is applied first and `payingOnly` still stands on its own for
      // callers that only want buyers.
      if (query.kind && query.kind !== 'all' && kind !== query.kind) return false;
      if (!query.payingOnly) return true;
      if (query.activity) {
        // Verified against the store's orders. A customer whose history the index
        // cannot see does not pass: a buyer filter that guesses is worse than one
        // that is empty.
        const count = verifiedOrderCount(query.activity, { id: row.id, email: row.email });
        return count !== null && count > 0;
      }
      return Number(row.orders_count ?? 0) > 0;
    });

    return {
      customers,
      total: response.total ?? customers.length,
      totalPages: response.totalPages ?? 1,
      page,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WooCustomerError(`The store's customers could not be read: ${message}`);
  }
}

/** One customer by id. */
export async function getWooCustomer(id: number): Promise<WooCustomerRecord> {
  requireWooCredentials();
  if (!Number.isFinite(id) || id <= 0) throw new WooCustomerError('A customer id is required.', 400);
  try {
    return await wordpressRequest<WooCustomerRecord>(`${REST_V3}/customers/${id}`, {
      useCredentials: true,
      timeoutMs: READ_TIMEOUT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFound = /HTTP 404/.test(message);
    throw new WooCustomerError(
      notFound ? `No customer ${id} exists in the store.` : `Customer ${id} could not be read: ${message}`,
      notFound ? 404 : 502
    );
  }
}

/** A customer's display name, or the email, or a stated absence. */
export function customerDisplayName(customer: WooCustomerRecord): string {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (customer.username) return customer.username;
  return customer.email?.trim() || 'Unnamed customer';
}

/**
 * Total spend as a number, or null when the store reports none.
 *
 * Deliberately not `Number(undefined) || 0`: a customer the store has not
 * totalled must not be shown as having spent nothing.
 */
export function customerSpend(customer: WooCustomerRecord): number | null {
  const raw = customer.total_spent;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A page of customers affordable enough to sort or filter in the console.
 *
 * `ordersCount` and `totalSpent` are `null` when the store does not report them,
 * which is the case on this store: WooCommerce omits both fields from a customer
 * record whose statistics have never been built. A zero there would be a claim —
 * "this customer has never ordered" — and it is not one the store made.
 */
export interface WooCustomerSummary {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  /**
   * The account's WordPress role, as the store reports it. Present so a screen that
   * lists every account can label a staff account instead of passing it off as a
   * shopper — the owner's own administrator account carries two of this store's
   * earliest orders, so it belongs in a buyer list and must not read as a customer.
   */
  role: string | null;
  ordersCount: number | null;
  /**
   * Orders counted from the store's own order records — the figure that can be
   * trusted here, because `ordersCount` is absent from every record. `null` when the
   * order read was incomplete: unknown, never zero.
   */
  verifiedOrders: number | null;
  /** Where `verifiedOrders` came from, so the console can label the number. */
  activityBasis: ActivityBasis;
  totalSpent: number | null;
  /** The store's own status for the most recent order, when it reports one. */
  lastOrderStatus: string | null;
  lastOrderAt: string | null;
  registeredAt: string | null;
  isPayingCustomer: boolean;
  /**
   * Which kind of account this is: staff, the census's suspicious review list, a verified
   * buyer, or an account with no order against it.
   *
   * The fifth thing the screen distinguishes, a **guest customer**, is not a kind of
   * account at all — those orders carry no account row — so it is reported by the route
   * as `guests` rather than squeezed into this union.
   */
  accountKind: AccountKind;
  /** The evidence for `accountKind === 'suspicious'`, in words. Null otherwise. */
  suspiciousReason: string | null;
  /** The address's local-part shape, shown as the evidence rather than as a verdict. */
  addressShape: LocalShape;
}

function gmt(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.startsWith('0000-00-00')) return null;
  const normalised = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalised) ? normalised : `${normalised}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * The row shape the console renders, with unknown values left unknown.
 *
 * `activity`, when supplied, is what makes `verifiedOrders` a number instead of
 * `null`. It is optional so a caller that has no orders in hand (a one-off lookup)
 * still gets a truthful row rather than a fabricated zero.
 */
export function summariseCustomer(
  customer: WooCustomerRecord,
  activity?: OrderActivityIndex | null
): WooCustomerSummary {
  // Classified once: the verdict and its evidence are one decision about one record, and
  // two calls would only invite a reader to wonder how they could ever disagree.
  const suspicious = suspiciousAccount({
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    username: customer.username,
  });
  const kind = accountKind(
    {
      id: customer.id,
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
      username: customer.username,
      role: customer.role,
    },
    activity
  );
  return {
    id: customer.id,
    name: customerDisplayName(customer),
    email: customer.email?.trim() || null,
    phone: customer.billing?.phone?.trim() || customer.shipping?.phone?.trim() || null,
    role: customer.role?.trim() || null,
    ordersCount:
      customer.orders_count === undefined || customer.orders_count === null
        ? null
        : Number(customer.orders_count) || 0,
    verifiedOrders: verifiedOrderCount(activity, { id: customer.id, email: customer.email }),
    activityBasis: activityBasis(activity, {
      id: customer.id,
      email: customer.email,
      ordersCount:
        customer.orders_count === undefined || customer.orders_count === null
          ? null
          : Number(customer.orders_count) || 0,
    }),
    totalSpent: customerSpend(customer),
    lastOrderStatus: customer.last_order?.status ?? null,
    lastOrderAt: gmt(customer.last_order?.date_created_gmt),
    registeredAt: gmt(customer.date_created_gmt),
    isPayingCustomer: Boolean(customer.is_paying_customer),
    accountKind: kind,
    // The reason explains the `suspicious` label, so it is reported only where that is
    // the label: a staff account whose address happens to be on a reserved domain is
    // classified `administrative`, and printing an accusation beside it would be a
    // contradiction the owner has to reconcile by hand. The address's shape is still
    // reported for every row in `addressShape` — that is the fact, and it is not a
    // verdict, so it does not have to agree with the kind.
    suspiciousReason: kind === 'suspicious' ? suspicious.reason : null,
    addressShape: suspicious.shape,
  };
}
