/**
 * The analytics page's figures.
 *
 * WooCommerce is the source (see `lib/admin/dashboardAnalytics.ts`); this route is the
 * authenticated door onto it, so the consumer key stays on the server and the browser
 * receives numbers rather than a credential.
 *
 * A failure is reported as a failure: a dashboard that answers `{}` on a store outage
 * would render as a store that sold nothing, which is the one reading it must never
 * invent.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { readDashboardAnalytics } from '@/lib/admin/dashboardAnalytics';
import { WordPressApiError } from '@/lib/backend/wordpress';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    return NextResponse.json({ analytics: await readDashboardAnalytics() });
  } catch (error) {
    if (error instanceof WordPressApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 502 });
    }
    console.error('Dashboard analytics read failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analytics could not be read.' },
      { status: 502 }
    );
  }
}
