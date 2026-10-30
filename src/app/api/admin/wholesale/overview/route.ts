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
 *
 * The projection lives in `lib/wholesale/consoleSnapshot` with the workspace's, so the
 * counts on this route and the counts the console's single read paints come from one
 * definition. The order book is read as part of that fan-out, not in addition to it.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { listWholesaleRecords, readWholesaleOverview, WHOLESALE_AGGREGATE_TIMEOUT_MS } from '@/lib/wholesale/store';
import { wholesaleOverviewPayload } from '@/lib/wholesale/consoleSnapshot';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json(wholesaleOverviewPayload(overview, orders));
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
