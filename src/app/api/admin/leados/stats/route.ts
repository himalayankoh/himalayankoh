import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getLeadOSOverviewStats, ensureDefaultProject } from '@/lib/leados/db';

/**
 * The overview, in as few WordPress round trips as the work allows.
 *
 * This used to make three: an `ensure-default` POST, then `/stats` and `/projects`
 * (which the stats read already fetches in parallel), then `/projects` a second time
 * just to count the rows it had been handed. Measured on production: 8.7s, against a
 * 12s timeout — which is why this screen was the first to fail whenever the origin
 * slowed down.
 *
 * The two duplicated reads are gone: the count comes from the read that already
 * happened. The default-project repair is still here, but it now runs only when the
 * workspace actually has no projects, instead of writing on every page view.
 */
export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let stats = await getLeadOSOverviewStats();

    if (stats.activeProjectsCount === 0) {
      await ensureDefaultProject();
      stats = await getLeadOSOverviewStats();
    }

    return NextResponse.json({
      ok: true,
      stats: {
        ...stats,
        projectsCount: stats.activeProjectsCount,
      },
      projects: stats.projects,
    });
  } catch (error) {
    console.error('LeadOS stats error:', error);
    return NextResponse.json(
      {
        error:
          'WordPress origin temporarily unavailable — retrying is safe. The numbers below are not being shown rather than shown as zero.',
      },
      { status: 503 },
    );
  }
}
