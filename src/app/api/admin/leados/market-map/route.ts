import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listSavedLeads } from '@/lib/leados/db';
import {
  aggregateStateMarketData,
  classifyMarketCategory,
  runAutonomousMarketScan,
  getGooglePlacesStatus,
  getJobHistory,
  getSchedulerStatus,
  AUTONOMOUS_PRIORITY_STATES,
  type MarketCategoryKey,
} from '@/lib/leados/market-scheduler';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const targetState = url.searchParams.get('state')?.toUpperCase() || null;
    const targetCategory = url.searchParams.get('category') || null;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(1000, Math.max(10, parseInt(url.searchParams.get('limit') || '500', 10)));

    // Read genuine leads from WordPress LeadOS database with pagination/state support
    const listOptions: { limit: number; page: number; search?: string } = {
      limit,
      page,
    };
    if (targetState) {
      listOptions.search = targetState;
    }

    const { leads, total } = await listSavedLeads(listOptions);

    // Aggregate state-level intelligence from genuine leads
    const stateMetrics = aggregateStateMarketData(leads);

    // Filter leads with valid coordinates for the interactive map
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
      .map((lead) => ({
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
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        facebook: lead.facebook,
        instagram: lead.instagram,
        opportunitySignals: lead.opportunitySignals,
      }));

    return NextResponse.json(
      {
        ok: true,
        stateMetrics,
        pins,
        totalPinsCount: pins.length,
        totalLeadsCount: total || leads.filter((l) => l.status !== 'excluded').length,
        jobs: getJobHistory(),
        scheduler: getSchedulerStatus(),
        googlePlaces: getGooglePlacesStatus(),
        priorityStates: AUTONOMOUS_PRIORITY_STATES,
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
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'scan_state';

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
