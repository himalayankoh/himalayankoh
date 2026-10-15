import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listSavedLeads } from '@/lib/leados/db';
import {
  aggregateStateMarketData,
  classifyMarketCategory,
  runAutonomousMarketScan,
  getGooglePlacesStatus,
  AUTONOMOUS_PRIORITY_STATES,
  type MarketCategoryKey,
} from '@/lib/leados/market-scheduler';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // Read genuine leads from WordPress LeadOS database (up to 1000)
    const { leads } = await listSavedLeads({ limit: 1000 });

    // Aggregate state-level intelligence
    const stateMetrics = aggregateStateMarketData(leads);

    // Filter leads with valid coordinates for the interactive map
    const pins = leads
      .filter((l) => typeof l.latitude === 'number' && typeof l.longitude === 'number' && l.status !== 'excluded')
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
        totalLeadsCount: leads.filter((l) => l.status !== 'excluded').length,
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

    if (action === 'scan_state') {
      const stateCode = body.stateCode || 'TX';
      const categoryKey: MarketCategoryKey = body.categoryKey || 'agriculture';
      const limit = Number(body.limit) || 25;

      const scanResult = await runAutonomousMarketScan({
        stateCode,
        categoryKey,
        limit,
      });

      return NextResponse.json(
        { ok: scanResult.ok, scanResult },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('LeadOS market-map POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Autonomous scan request failed' },
      { status: 500 }
    );
  }
}
