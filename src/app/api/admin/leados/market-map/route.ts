import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { timingSafeEqual } from '@/lib/auth/sessionToken';
import { listSavedLeads, getMarketSummaryFromDb, getMarketJobsFromDb } from '@/lib/leados/db';
import { getLastLeadsMutationTime } from '@/lib/leados/lead-cache';
import {
  aggregateStateMarketData,
  classifyMarketCategory,
  runAutonomousMarketScan,
  runScheduledAutonomousScan,
  getGooglePlacesStatus,
  getJobHistory,
  getSchedulerStatus,
  syncJobsWithDb,
  AUTONOMOUS_PRIORITY_STATES,
  type MarketCategoryKey,
} from '@/lib/leados/market-scheduler';

function isWorkerAuthorized(request: Request): boolean {
  const authHeader = (request.headers.get('authorization') || '').replace(/^Bearer /, '').trim();
  if (!authHeader) return false;

  const candidateTokens = [
    process.env.LEADOS_N8N_TOKEN,
    process.env.LEADOS_RESEARCH_WORKER_TOKEN,
  ].filter((t): t is string => typeof t === 'string' && t.trim().length >= 32);

  return candidateTokens.some((token) => timingSafeEqual(token.trim(), authHeader));
}

export async function GET(request: Request) {
  const isWorker = isWorkerAuthorized(request);
  if (!isWorker) {
    const auth = await verifyAdminRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  try {
    const url = new URL(request.url);
    const targetState = url.searchParams.get('state')?.toUpperCase() || null;
    const targetCategory = url.searchParams.get('category') || null;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(1000, Math.max(10, parseInt(url.searchParams.get('limit') || '200', 10)));

    const since = url.searchParams.get('since');

    const listOptions: { limit: number; page: number; region?: string } = {
      limit,
      page,
    };
    if (targetState) {
      listOptions.region = targetState;
    }

    // 1. Fetch accurate database-side aggregations across all qualified library records (Issue 3 fix),
    // sync durable persistent job history (Issue 1 fix), and read genuine leads for interactive pins.
    // When 'since' is omitted (e.g. cold/warm map loads), fetch all three concurrently in parallel via Promise.all.
    // When 'since' is present, fetch summary and jobs first to allow an early return if unchanged.
    let dbSummary: Awaited<ReturnType<typeof getMarketSummaryFromDb>>;
    let dbJobsData: Awaited<ReturnType<typeof getMarketJobsFromDb>>;
    let leadsData: Awaited<ReturnType<typeof listSavedLeads>> | null = null;

    if (!since) {
      const [summaryRes, jobsRes, leadsRes] = await Promise.all([
        getMarketSummaryFromDb(),
        getMarketJobsFromDb(),
        listSavedLeads(listOptions),
      ]);
      dbSummary = summaryRes;
      dbJobsData = jobsRes;
      leadsData = leadsRes;
    } else {
      const [summaryRes, jobsRes] = await Promise.all([
        getMarketSummaryFromDb(),
        getMarketJobsFromDb(),
      ]);
      dbSummary = summaryRes;
      dbJobsData = jobsRes;
    }

    if (dbJobsData?.jobs) {
      syncJobsWithDb(dbJobsData.jobs);
    }

    const allJobs = getJobHistory();
    const completedJobs = allJobs.filter((j) => j.status === 'completed');
    const sortedCompleted = [...completedJobs].sort(
      (a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
    );
    const lastSuccessfulScanTime = sortedCompleted[0]?.completedAt || null;

    // Incremental polling: check if a scan completed, or if any manual lead save, edit, deletion, or exclusion occurred
    const lastMutationTime = getLastLeadsMutationTime();
    const sinceTime = since ? new Date(since).getTime() : 0;
    const scanTime = lastSuccessfulScanTime ? new Date(lastSuccessfulScanTime).getTime() : 0;

    const hasJobUpdates = scanTime > sinceTime;
    const hasMutationUpdates = lastMutationTime > sinceTime;

    if (since && !hasJobUpdates && !hasMutationUpdates) {
      return NextResponse.json(
        {
          ok: true,
          incremental: true,
          hasUpdates: false,
          lastSuccessfulScanTime,
          lastMutationTime: new Date(lastMutationTime).toISOString(),
          summary: dbSummary,
          lastUpdated: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // 2. Read genuine leads for interactive pins with exact geographic state filter
    // (Never substitutes free-text search for exact geographic state filtering)
    const { leads, total } = leadsData || (await listSavedLeads(listOptions));

    // 3. Aggregate state-level intelligence combining global DB summary + pin coverage
    const stateMetrics = aggregateStateMarketData(leads, dbSummary, dbJobsData?.jobs);

    // 4. Map pins with valid coordinates for the interactive map
    const now = Date.now();
    const fortyEightHoursAgo = now - 48 * 60 * 60 * 1000;

    const pins = leads
      .filter((l) => {
        if (typeof l.latitude !== 'number' || typeof l.longitude !== 'number' || l.status === 'excluded') {
          return false;
        }
        if (targetState && (l.region || '').trim().toUpperCase() !== targetState) {
          return false;
        }
        if (targetCategory && classifyMarketCategory(l) !== targetCategory) {
          return false;
        }
        return true;
      })
      .map((lead) => {
        const isNew = Boolean(lead.createdAt && new Date(lead.createdAt).getTime() >= fortyEightHoursAgo);
        const qualityTag = (lead.tags || []).find((t) => t.startsWith('quality:'))?.replace('quality:', '') || null;

        return {
          id: lead.id,
          businessName: lead.businessName,
          category: lead.category,
          marketCategory: classifyMarketCategory(lead),
          latitude: lead.latitude!,
          longitude: lead.longitude!,
          address: lead.address,
          city: lead.city,
          region: lead.region,
          opportunityScore: lead.opportunityScore,
          status: lead.status,
          qualityStage: qualityTag,
          isNew,
          createdAt: lead.createdAt,
          phone: lead.phone,
          email: lead.email,
          website: lead.website,
          facebook: lead.facebook,
          instagram: lead.instagram,
          opportunitySignals: lead.opportunitySignals,
        };
      });

    return NextResponse.json(
      {
        ok: true,
        incremental: Boolean(since),
        hasUpdates: true,
        stateMetrics,
        pins,
        totalPinsCount: pins.length,
        totalLeadsCount: dbSummary?.totalLeads || total || leads.filter((l) => l.status !== 'excluded').length,
        summary: dbSummary,
        jobs: allJobs,
        scheduler: getSchedulerStatus(),
        googlePlaces: getGooglePlacesStatus(),
        priorityStates: AUTONOMOUS_PRIORITY_STATES,
        lastSuccessfulScanTime,
        lastUpdated: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('LeadOS market-map GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve market map data' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const isWorker = isWorkerAuthorized(request);
  if (!isWorker) {
    const auth = await verifyAdminRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'scan_state';

    // Real autonomous background scheduled execution (Issue 2 fix)
    if (action === 'run_scheduled_scan') {
      const scanResult = await runScheduledAutonomousScan({
        triggerSource: isWorker ? 'n8n_workflow' : 'scheduled_cron',
      });
      return NextResponse.json(
        {
          ok: scanResult.ok,
          scanResult,
          jobs: getJobHistory(),
          scheduler: getSchedulerStatus(),
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    if (action === 'scan_state' || action === 'enqueue_scan') {
      const stateCode = (body.stateCode || 'TX').toUpperCase();
      const categoryKey: MarketCategoryKey = body.categoryKey || 'agriculture';
      const limit = Number(body.limit) || 25;
      const hubIndex = Number(body.hubIndex) || 0;

      const scanResult = await runAutonomousMarketScan({
        stateCode,
        categoryKey,
        limit,
        hubIndex,
      });

      return NextResponse.json(
        {
          ok: scanResult.ok,
          scanResult,
          jobs: getJobHistory(),
          scheduler: getSchedulerStatus(),
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    if (action === 'get_jobs') {
      const { jobs } = await getMarketJobsFromDb();
      if (jobs) syncJobsWithDb(jobs);
      return NextResponse.json({
        ok: true,
        jobs: getJobHistory(),
        scheduler: getSchedulerStatus(),
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('LeadOS market-map POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute autonomous market scan' },
      { status: 500 }
    );
  }
}
