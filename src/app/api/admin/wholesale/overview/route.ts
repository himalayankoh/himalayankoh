/**
 * The wholesale overview: counts and values, every one of them measured.
 *
 * The counting happens in the plugin, in SQL — this route passes the answer through
 * and adds the two things SQL cannot say: which numbers are a *pipeline* (asked for,
 * not agreed) and which are *booked*. An empty pipeline reads as zeroes; nothing here
 * invents a number to make a chart look populated.
 *
 * `quoted_value` counts quotes the owner has actually sent (SUBMITTED, UNDER_REVIEW
 * or QUOTED) and `accepted_value` counts accepted ones, so "pipeline" and "won" are
 * distinguishable at a glance rather than being one lump of revenue.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { listWholesaleRecords, readWholesaleOverview, WHOLESALE_AGGREGATE_TIMEOUT_MS } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

/**
 * How loaded the orders on the book are, averaged per container type.
 *
 * Computed from the load plan each order carries, so the figure describes what was
 * actually agreed rather than a fresh re-optimisation of today's prices. Orders with
 * no utilisation recorded are counted as "not measured" instead of as zero.
 */
function containerUtilisation(orders: Array<Record<string, unknown>>) {
  const byContainer = new Map<string, { orders: number; weight: number[]; volume: number[]; measured: number }>();

  for (const order of orders) {
    const plan = (order.plan && typeof order.plan === 'object' ? order.plan : {}) as Record<string, unknown>;
    const code = String(plan.containerCode ?? '').trim() || 'unspecified';
    const entry = byContainer.get(code) ?? { orders: 0, weight: [], volume: [], measured: 0 };
    entry.orders += 1;

    const weight = Number(plan.weightUtilizationPct);
    const volume = Number(plan.volumeUtilizationPct);
    if (Number.isFinite(weight) && Number.isFinite(volume)) {
      entry.weight.push(weight);
      entry.volume.push(volume);
      entry.measured += 1;
    }
    byContainer.set(code, entry);
  }

  const average = (values: number[]) =>
    values.length ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10 : null;

  return [...byContainer.entries()]
    .map(([code, entry]) => ({
      container: code,
      orders: entry.orders,
      measured: entry.measured,
      avgWeightUtilizationPct: average(entry.weight),
      avgVolumeUtilizationPct: average(entry.volume),
    }))
    .sort((a, b) => b.orders - a.orders);
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  try {
    // The overview is two aggregate reads from a slow host — the plugin's own COUNT
    // summary plus the order book — so both get the aggregate ceiling rather than the
    // single-record one.
    const long = { timeoutMs: WHOLESALE_AGGREGATE_TIMEOUT_MS };
    const [overview, orders] = await Promise.all([
      readWholesaleOverview(long),
      listWholesaleRecords('orders', { limit: 200 }, long),
    ]);
    return NextResponse.json({
      ...overview,
      container_utilisation: containerUtilisation(orders),
      /** Which figures are asked-for and which are agreed. */
      definitions: {
        quoted_value: 'Quotations with our team or sent, not yet accepted.',
        accepted_value: 'Accepted quotations that are not yet orders.',
        booked_value: 'Wholesale orders raised, at their quoted value.',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The wholesale overview could not be read: ${error.message}`
            : 'The wholesale overview could not be read.',
      },
      { status: 502 }
    );
  }
}
