import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { discoverLeads, normalizeSearchResults } from '@/lib/leados/discovery';
import { BUYER_CATEGORIES, leadIdentity, matchingKnownLead, PRODUCT_INTERESTS, qualifyLead } from '@/lib/leados/intelligence';
import { calculateOpportunityScore } from '@/lib/leados/scoring';
import { calculateDeterministicProjectFit } from '@/lib/leados/project-fit';
import { getProjectById, recordSearchExecution, ensureDefaultProject, listSavedLeads, leadosRequest } from '@/lib/leados/db';
import type { ScoredLead, ProductInterest } from '@/lib/leados/types';
import type { LeadSearchInput } from '@/lib/leados/types';

async function savedLibraryForDiscovery() {
  const first = await listSavedLeads({limit:200,page:1});
  if (first.total > 2000) throw new Error('Discovery exclusion requires a bounded library of at most 2,000 leads.');
  const leads = [...first.leads];
  for (let page = 2; leads.length < (first.total || 0); page++) {
    const batch = await listSavedLeads({limit:200,page});
    if (!batch.leads.length) throw new Error('Saved library changed; retry discovery.');
    leads.push(...batch.leads);
  }
  return leads;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const id = new URL(request.url).searchParams.get('jobId');
  if (!id) return NextResponse.json({error:'Search job required.'},{status:400});
  try {
    const data = await leadosRequest<{item:{state:string;payload:{input:LeadSearchInput;initialKeys?:string[];results?:Array<{title:string;url:string;content:string}>;retrievedAt:string;error?:string;upstreamErrors?:string[]}}}>('/workflow',{params:{kind:'discovery',id}});
    const item = data.item;
    if (!item) return NextResponse.json({error:'Search job not found.'},{status:404});
    const stale = Date.now() - Date.parse(item.payload.retrievedAt || '') > 180000;
    if (!['complete','failed'].includes(item.state)) return NextResponse.json({ok:true,state:stale?'expired':item.state,leads:[]},{headers:{'Cache-Control':'private, no-store'}});
    const raw = normalizeSearchResults(item.payload.results || [],item.payload.input,item.payload.retrievedAt);
    const saved = await savedLibraryForDiscovery();
    const leads = raw.filter((l)=>{
      const prior=matchingKnownLead(l,saved);
      if (item.payload.input.excludeSaved && prior) return false;
      if (item.payload.input.excludeContacted && prior && ['contacted','replied','interested','quote_requested','negotiating','won','do_not_contact'].includes(prior.status)) return false;
      return (!item.payload.input.requireWebsite || l.website) && (!item.payload.input.requirePhone || l.phone) && (!item.payload.input.requireEmail || l.emailSource==='company_website');
    }).map((l)=>{ const q=qualifyLead(l,item.payload.input.productInterest || 'horse_salt'); return {...l,research:{...l.research,qualification:q},opportunityScore:q.score,opportunitySignals:q.reasons,alreadySaved:Boolean(matchingKnownLead(l,saved))}; }).slice(0,item.payload.input.maxResults || 15);
    const finalCount = Math.min(item.payload.input.maxResults || 15,new Set([...(item.payload.initialKeys || []),...leads.map(leadIdentity)]).size);
    await recordSearchExecution({category:item.payload.input.category,location:item.payload.input.location,resultsCount:finalCount,executionId:id});
    return NextResponse.json({ok:true,state:item.state,leads,rawCount:item.payload.results?.length || 0,error:item.payload.error || null,upstreamErrors:item.payload.upstreamErrors || []},{headers:{'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'Search job could not be read.'},{status:503}); }
}

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
      keyword = '',
      projectId,
      maxResults = 15,
      requireWebsite = false,
      requirePhone = false,
    } = body;

    if (!location || typeof location !== 'string' || !location.trim()) {
      return NextResponse.json({ error: 'Valid target location is required (e.g. "Houston, TX" or "Montana")' }, { status: 400 });
    }
    if (typeof category !== 'string' || !BUYER_CATEGORIES.includes(category.trim()) || location.length > 160) {
      return NextResponse.json({error:'Choose a supported buyer category and a location under 160 characters.'},{status:400});
    }

    await ensureDefaultProject();

    // Fetch target project for ICP fit scoring
    const project = projectId ? await getProjectById(projectId) : await getProjectById('00000000-0000-0000-0000-000000000002');

    const interest: ProductInterest = PRODUCT_INTERESTS.includes(body.productInterest) ? body.productInterest : 'horse_salt';
    // Shared WordPress gate, rather than an isolate-local throttle.
    await leadosRequest('/research/gate', { method: 'POST', body: { operation: 'search' } });
    const { leads: rawLeads, diagnostics } = await discoverLeads({
      category: category.trim(),
      location: location.trim(),
      keyword: typeof keyword === 'string' ? keyword.trim().slice(0,160) : '',
      maxResults: Math.min(Math.max(Number(maxResults) || 15,1),40),
      requireWebsite: Boolean(requireWebsite),
      requirePhone: Boolean(requirePhone),
      requireEmail: body.requireEmail === true,
      productInterest: interest,
      radiusKm: Number(body.radiusKm) || 25,
      searchDepth: Number(body.searchDepth) || 1,
      country: body.country,
      wholesaleOnly: body.wholesaleOnly === true,
      privateLabelOnly: body.privateLabelOnly === true,
      excludeSaved: body.excludeSaved === true,
      excludeContacted: body.excludeContacted === true,
    });

    if (diagnostics.errorSummary) {
      return NextResponse.json({
        ok: false, diagnostics,
        error: diagnostics.geocodeSuccess
          ? 'The business-data provider could not complete this search. Try again later.'
          : 'The target location could not be resolved. Check the city and state and try again.',
      }, { status: diagnostics.geocodeSuccess ? 503 : 422 });
    }

    // Check saved leads to mark if already saved
    const existingSaved = await savedLibraryForDiscovery();

    // Score leads deterministically
    const scoredLeads: ScoredLead[] = rawLeads.filter((lead) => {
      const existing = matchingKnownLead(lead,existingSaved);
      if (body.excludeSaved && existing) return false;
      if (body.excludeContacted && existing && ['contacted','replied','interested','quote_requested','negotiating','won','do_not_contact'].includes(existing.status)) return false;
      return !body.requireEmail || (lead.email && lead.emailSource === 'company_website');
    }).map((lead) => {
      const fit = project ? calculateDeterministicProjectFit(lead, project) : undefined;
      const opp = calculateOpportunityScore(lead, undefined, fit?.score || 0);
      const alreadySaved = Boolean(matchingKnownLead(lead,existingSaved));
      const qualification = qualifyLead(lead, interest);

      return {
        ...lead,
        research: { ...lead.research, productInterest: interest, qualification },
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
      ...(diagnostics.queuedJobId ? {executionId:diagnostics.queuedJobId,initialKeys:scoredLeads.map(leadIdentity)} : {}),
    });

    diagnostics.finalResultsCount = scoredLeads.length;
    return NextResponse.json({
      ok: true,
      leads: scoredLeads,
      diagnostics,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('LeadOS search error:', error);
    return NextResponse.json({ error: 'Lead discovery query failed. Please check location spelling.' }, { status: 500 });
  }
}
