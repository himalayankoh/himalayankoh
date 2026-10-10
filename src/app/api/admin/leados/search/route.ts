import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { searchOpenStreetMap } from '@/lib/leados/osm-provider';
import { calculateOpportunityScore } from '@/lib/leados/scoring';
import { calculateDeterministicProjectFit } from '@/lib/leados/project-fit';
import { getProjectById, recordSearchExecution, ensureDefaultProject, listSavedLeads } from '@/lib/leados/db';
import type { ScoredLead } from '@/lib/leados/types';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const {
      category = 'Feed Store',
      location,
      projectId,
      maxResults = 15,
      requireWebsite = false,
      requirePhone = false,
    } = body;

    if (!location || typeof location !== 'string' || !location.trim()) {
      return NextResponse.json({ error: 'Valid target location is required (e.g. "Houston, TX" or "Montana")' }, { status: 400 });
    }

    await ensureDefaultProject();

    // Fetch target project for ICP fit scoring
    const project = projectId ? await getProjectById(projectId) : await getProjectById('00000000-0000-0000-0000-000000000002');

    // Run OSM Nominatim & Overpass query
    const { leads: rawLeads, diagnostics } = await searchOpenStreetMap({
      category: category.trim(),
      location: location.trim(),
      maxResults: Number(maxResults) || 15,
      requireWebsite: Boolean(requireWebsite),
      requirePhone: Boolean(requirePhone),
    });

    if (diagnostics.errorSummary) {
      return NextResponse.json({
        ok: false,
        error: diagnostics.geocodeSuccess
          ? 'The business-data provider could not complete this search. Try again later.'
          : 'The target location could not be resolved. Check the city and state and try again.',
      }, { status: diagnostics.geocodeSuccess ? 503 : 422 });
    }

    // Check saved leads to mark if already saved
    const { leads: existingSaved } = await listSavedLeads({ limit: 200 });
    const savedNames = new Set(existingSaved.map((s) => s.businessName.toLowerCase()));

    // Score leads deterministically
    const scoredLeads: ScoredLead[] = rawLeads.map((lead) => {
      const fit = project ? calculateDeterministicProjectFit(lead, project) : undefined;
      const opp = calculateOpportunityScore(lead, undefined, fit?.score || 0);
      const alreadySaved = savedNames.has(lead.businessName.toLowerCase());

      return {
        ...lead,
        opportunityScore: opp.score,
        opportunitySignals: opp.signals,
        evidence: {
          icpFit: opp.icpFit,
          reachability: opp.reachability,
          dataConfidence: opp.dataConfidence,
          commercialPriority: opp.commercialPriority,
          reasons: opp.signals,
        },
        projectFit: fit,
        alreadySaved,
      };
    });

    // Sort by project fit descending if available, else opportunity score
    scoredLeads.sort((a, b) => {
      if (a.projectFit && b.projectFit) {
        return b.projectFit.score - a.projectFit.score;
      }
      return b.opportunityScore - a.opportunityScore;
    });

    // Record execution for search history
    await recordSearchExecution({
      category,
      location,
      resultsCount: scoredLeads.length,
    });

    return NextResponse.json({
      ok: true,
      leads: scoredLeads,
      diagnostics,
    });
  } catch (error) {
    console.error('LeadOS search error:', error);
    return NextResponse.json({ error: 'Lead discovery query failed. Please check location spelling.' }, { status: 500 });
  }
}
