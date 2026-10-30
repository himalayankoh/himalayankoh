/**
 * When the console's order figures can be counted from the page it just read.
 *
 * `/api/admin/orders` answers with a page of orders *and* figures describing the
 * newest `STATS_WINDOW` orders. Those were two separate WooCommerce reads, so the
 * dashboard and the orders screen each paid two round trips (measured on staging:
 * ~1.2-1.8s each) to answer one question.
 *
 * When the page read is itself the unfiltered, first page, at least as wide as the
 * window, it *is* the window — the store returns orders newest-first, so the same
 * records come back. This predicate says when that holds; the route reuses the page
 * then, and only reads separately when a filter or a later page would describe
 * different orders (counting filtered orders as the store's totals would be a lie).
 */
export const STATS_WINDOW = 100;

export interface StatsWindowQuery {
  /** App status filter, when the caller asked for one. */
  status?: string;
  /** Free-text search, when the caller asked for one. */
  search?: string;
  /** 1-based page number of the read. */
  page: number;
  /** Rows per page, when the caller asked for a specific width. */
  perPage?: number;
}

export function pageCoversStatsWindow(query: StatsWindowQuery): boolean {
  if (query.status || query.search) return false;
  if (query.page !== 1) return false;
  return (query.perPage ?? 0) >= STATS_WINDOW;
}
