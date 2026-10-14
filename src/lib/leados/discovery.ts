import { searchOpenStreetMap } from './osm-provider';
import { BUYER_CATEGORIES, deduplicateLeads, publicCompanyUrl } from './intelligence';
import type { LeadSearchInput, NormalizedLead, SearchDiagnostics } from './types';
import { leadosRequest } from './db';

export const STATE_HUBS: Record<string, string[]> = {
  texas: ['Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX', 'Fort Worth, TX'],
  tx: ['Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX', 'Fort Worth, TX'],
  florida: ['Ocala, FL', 'Orlando, FL', 'Tampa, FL', 'Jacksonville, FL'],
  fl: ['Ocala, FL', 'Orlando, FL', 'Tampa, FL', 'Jacksonville, FL'],
  california: ['Fresno, CA', 'Bakersfield, CA', 'Los Angeles, CA', 'Sacramento, CA'],
  ca: ['Fresno, CA', 'Bakersfield, CA', 'Los Angeles, CA', 'Sacramento, CA'],
  oklahoma: ['Oklahoma City, OK', 'Tulsa, OK'],
  ok: ['Oklahoma City, OK', 'Tulsa, OK'],
  montana: ['Billings, MT', 'Bozeman, MT', 'Missoula, MT'],
  mt: ['Billings, MT', 'Bozeman, MT', 'Missoula, MT'],
  nebraska: ['Omaha, NE', 'Lincoln, NE'],
  ne: ['Omaha, NE', 'Lincoln, NE'],
  colorado: ['Denver, CO', 'Colorado Springs, CO', 'Fort Collins, CO'],
  co: ['Denver, CO', 'Colorado Springs, CO', 'Fort Collins, CO'],
  iowa: ['Des Moines, IA', 'Cedar Rapids, IA'],
  ia: ['Des Moines, IA', 'Cedar Rapids, IA'],
  kentucky: ['Lexington, KY', 'Louisville, KY'],
  ky: ['Lexington, KY', 'Louisville, KY'],
  'new york': ['Buffalo, NY', 'Albany, NY', 'Rochester, NY'],
  ny: ['Buffalo, NY', 'Albany, NY', 'Rochester, NY'],
  usa: ['Houston, TX', 'Omaha, NE', 'Denver, CO', 'Lexington, KY', 'Des Moines, IA'],
  nationwide: ['Houston, TX', 'Omaha, NE', 'Denver, CO', 'Lexington, KY', 'Des Moines, IA'],
};

const EXPANSIONS: Record<string, string[]> = {
  'Feed Store': ['feed supply livestock feed retailer', 'farm ranch supply'],
  'Farm Supply': ['farm ranch agricultural supply wholesaler'],
  'Equestrian Store': ['equestrian tack horse supply store'],
  'Ranch & Horse Facility': ['horse boarding training stable equestrian center', 'cattle ranch livestock farm'],
  'Livestock Distributor': ['livestock feed agricultural supply distributor'],
  'Salt Wholesaler': ['Himalayan salt wholesale distributor importer'],
  'Specialty Food Distributor': ['specialty food spice seasoning distributor'],
  'Spice Retailer': ['spice seasoning specialty food retailer'],
  'Private Label Buyer': ['Himalayan pink salt private label wholesale'],
};

interface WebSearchResult { title?: string; url?: string; content?: string; }

export function discoveryQuery(input: LeadSearchInput, expansion = (EXPANSIONS[input.category] || [input.category])[0]) {
  const sources = input.sources || [];
  if (sources.includes('facebook') && !sources.includes('all')) {
    return `site:facebook.com "${expansion}" "${input.location}"`.trim().slice(0, 500);
  }
  if (sources.includes('instagram') && !sources.includes('all')) {
    return `site:instagram.com "${expansion}" "${input.location}"`.trim().slice(0, 500);
  }
  if (sources.includes('facebook_groups') && !sources.includes('all')) {
    return `site:facebook.com/groups "${expansion}" "${input.location}"`.trim().slice(0, 500);
  }
  return `${expansion} ${input.keyword || ''} ${input.location} ${input.privateLabelOnly ? 'private label' : ''} ${input.wholesaleOnly ? 'wholesale distributor' : ''}`.trim().slice(0, 500);
}

export function normalizeSearchResults(results: WebSearchResult[], input: LeadSearchInput, retrievedAt: string): NormalizedLead[] {
  const leads: NormalizedLead[] = [];
  for (const result of results) {
    if (!result.title || !result.url) continue;
    const isFacebook = /(?:facebook\.com|fb\.com)\/(?:pages\/|groups\/|people\/|[A-Za-z0-9._-]+)/i.test(result.url);
    const isInstagram = /(?:instagram\.com|instagr\.am)\/[A-Za-z0-9._-]+/i.test(result.url);
    const website = isFacebook || isInstagram ? null : publicCompanyUrl(result.url);

    if (input.requireWebsite && !website) continue;
    if (!website && !isFacebook && !isInstagram) continue;

    if (/directory|top \d|best \d|near me|yellow pages|mapquest|\b\d+\s+(?:best|top|stables|ranches|farms|stores|shops)\b|\b\d+\s+near you\b|stables in [a-z]+/i.test(result.title)) continue;
    if (website) {
      const candidateUrl = new URL(website);
      if (/(^|\.)(?:whereorg|macraesbluebook|chamberofcommerce|manta|loc8nearme|visithoustontexas|newhorse|horseboardingusa|horseboardingfinder|horseboardingatlas|equinenow|horsedeals|spoke)\.com$/i.test(candidateUrl.hostname) || /(?:finder|atlas|directory|locator|yellowpages)\.(?:com|org|net)$/i.test(candidateUrl.hostname) || /(^|\.)wheretoride\.horse$/i.test(candidateUrl.hostname) || /\/(?:directory|businesses|listings|horse-boarding-facilities)(?:\/|$)/i.test(candidateUrl.pathname) || /\/properties\/list(?:\/|$)/i.test(candidateUrl.pathname) || /\/service\/.*\/location\//i.test(candidateUrl.pathname)) continue;
    }

    const text = `${result.title} ${result.content || ''}`;
    if (!/feed|farm|ranch|equestrian|equine|horse|tack|saddlery|livestock|salt|spice|seasoning|food distribut|animal|mineral/i.test(text)) continue;
    if (/software|marketing agency|restaurant|hotel|salon/i.test(result.title)) continue;

    const cleanTitle = result.title.split(/\s[|–—•]\s/)[0].replace(/\s*-\s*Home\s*$/i, '').replace(/\s*\|\s*Facebook\s*$/i, '').trim().slice(0, 200);
    const cleanUrl = result.url.split('?')[0].replace(/\/+$/, '');

    leads.push({
      businessName: cleanTitle,
      category: input.category,
      address: null,
      city: null,
      region: null,
      country: null,
      website: website || null,
      phone: null,
      email: null,
      facebook: isFacebook ? cleanUrl : null,
      instagram: isInstagram ? cleanUrl : null,
      latitude: null,
      longitude: null,
      osmType: null,
      osmId: null,
      osmUrl: null,
      dataSource: isFacebook ? 'facebook' : (isInstagram ? 'instagram' : 'searxng'),
      research: {
        productInterest: input.productInterest,
        sources: [{
          url: cleanUrl,
          retrievedAt,
          kind: isFacebook ? 'facebook_page' : (isInstagram ? 'instagram_profile' : 'search_result'),
          status: 'inferred',
          excerpt: (result.content || '').slice(0, 600),
        }],
      },
    });
  }

  const groups = new Map<string, NormalizedLead>();
  for (const lead of leads) {
    const key = lead.website
      ? new URL(lead.website).hostname.replace(/^www\./, '')
      : (lead.facebook || lead.instagram || lead.businessName.toLowerCase());
    const prior = groups.get(key);
    if (!prior) {
      groups.set(key, lead);
      continue;
    }
    prior.research!.sources = [...(prior.research?.sources || []), ...(lead.research?.sources || [])];
    if (!prior.website && lead.website) {
      prior.website = lead.website;
    } else if (prior.website && lead.website) {
      try {
        const priorUrl = new URL(prior.website);
        const newUrl = new URL(lead.website);
        if (newUrl.pathname === '/' && priorUrl.pathname !== '/') {
          prior.website = lead.website;
        }
      } catch {
        // preserve existing
      }
    }
    if (!prior.facebook && lead.facebook) prior.facebook = lead.facebook;
    if (!prior.instagram && lead.instagram) prior.instagram = lead.instagram;
  }
  return [...groups.values()];
}

async function searchSearxng(input: LeadSearchInput) {
  const endpoint = process.env.LEADOS_SEARXNG_URL?.trim(), token = process.env.LEADOS_SEARXNG_TOKEN?.trim();
  if (!endpoint || !token) return { leads: [] as NormalizedLead[], raw: 0, error: 'Self-hosted SearXNG not configured. No public-instance fallback.' };
  const safe = publicCompanyUrl(endpoint);
  if (!safe || !safe.startsWith('https://')) return { leads: [] as NormalizedLead[], raw: 0, error: 'SearXNG requires an operator-configured public HTTPS endpoint with authentication.' };
  const queries = (EXPANSIONS[input.category] || [input.category]).slice(0, Math.min(input.searchDepth || 1, 2));
  const leads: NormalizedLead[] = [];
  let raw = 0, error: string | null = null;
  for (const expansion of queries) {
    const url = new URL('search', safe.endsWith('/') ? safe : `${safe}/`);
    url.search = new URLSearchParams({ q: discoveryQuery(input, expansion), format: 'json', language: 'en-US', safesearch: '1' }).toString();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000), cache: 'no-store' });
      if (!res.ok) { error = `SearXNG HTTP ${res.status}`; break; }
      if (Number(res.headers.get('content-length') || 0) > 1_000_000) throw new Error('Response too large');
      const text = await res.text();
      if (text.length > 1_000_000) throw new Error('Response too large');
      const data = JSON.parse(text) as { results?: WebSearchResult[] };
      if (!Array.isArray(data.results)) throw new Error('Invalid results');
      raw += data.results.length;
      leads.push(...normalizeSearchResults(data.results.slice(0, 100), input, new Date().toISOString()));
    } catch { error = 'SearXNG request failed or returned invalid data.'; break; }
  }
  return { leads, raw, error };
}

export async function discoverLeads(input: LeadSearchInput): Promise<{ leads: NormalizedLead[]; diagnostics: SearchDiagnostics }> {
  if (!BUYER_CATEGORIES.includes(input.category)) throw new Error('Choose a relevant Himalayan Koh B2B buyer category.');
  if (input.country && !/^(us|usa|united states)$/i.test(input.country)) throw new Error('LeadOS targets the United States.');
  const started = Date.now();
  const locTrimmed = input.location.trim();
  const locLower = locTrimmed.toLowerCase();

  const stateHubsList = STATE_HUBS[locLower];
  const queryLocations = input.locations && input.locations.length > 1
    ? input.locations.slice(0, 4)
    : (stateHubsList ? stateHubsList.slice(0, 3) : [locTrimmed]);

  const localOsm = ['Feed Store', 'Farm Supply', 'Equestrian Store', 'Ranch & Horse Facility', 'Livestock Distributor', 'Mineral Distributor', 'Salt Wholesaler', 'Specialty Food Distributor', 'Spice Retailer'].includes(input.category);

  const [osmSettled, web] = await Promise.all([
    localOsm
      ? Promise.allSettled(
          queryLocations.map((hubLoc) =>
            searchOpenStreetMap({
              ...input,
              location: hubLoc,
              nodeOnly: true,
              keyword: '',
              maxResults: Math.min(input.maxResults || 25, 250),
              radiusKm: Math.min(Math.max(input.radiusKm || 35, 1), 100),
            })
          )
        )
      : Promise.resolve([]),
    searchSearxng(input),
  ]);

  const timestamp = new Date().toISOString();
  const osmResults = (osmSettled as Array<PromiseSettledResult<Awaited<ReturnType<typeof searchOpenStreetMap>>>>)
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof searchOpenStreetMap>>> => r.status === 'fulfilled' && Boolean(r.value))
    .map((r) => r.value);

  const allOsmLeads = osmResults.flatMap((res) => res.leads || []);
  const osmLeads = allOsmLeads.map((lead) => ({
    ...lead,
    research: {
      ...lead.research,
      productInterest: input.productInterest,
      sources: lead.research?.sources || [{
        url: lead.osmUrl || 'https://www.openstreetmap.org',
        retrievedAt: timestamp,
        kind: 'openstreetmap',
        status: 'verified' as const,
        excerpt: `${lead.businessName}: mapped ${lead.category}; ${lead.address || ''} ${lead.city || ''} ${lead.region || ''}`,
      }],
    },
  }));

  const merged = deduplicateLeads([...osmLeads, ...web.leads]);
  const leads = merged.leads.filter((lead) =>
    (!input.requireWebsite || Boolean(lead.website)) &&
    (!input.requirePhone || Boolean(lead.phone)) &&
    (!input.requireEmail || Boolean(lead.email))
  ).slice(0, Math.min(Math.max(input.maxResults || 25, 1), 250));

  const totalOsmRaw = osmResults.reduce((acc, r) => acc + (r.diagnostics.rawResultsCount || 0), 0);
  const totalOsmDuplicates = osmResults.reduce((acc, r) => acc + (r.diagnostics.duplicatesRemoved || 0), 0);
  const primaryOsm = osmResults[0];

  const sources = {
    ...(primaryOsm?.diagnostics.sources || {}),
    searxng: { raw: web.raw, normalized: web.leads.length, error: web.error },
  };

  const diagnostics: SearchDiagnostics = {
    geocodeSuccess: osmResults.some((r) => r.diagnostics.geocodeSuccess) || !localOsm,
    resolvedLocation: osmResults.find((r) => r.diagnostics.resolvedLocation)?.diagnostics.resolvedLocation || input.location,
    boundingArea: primaryOsm?.diagnostics.boundingArea || null,
    categoriesQueried: [input.category],
    sources,
    rawResultsCount: totalOsmRaw + web.raw,
    normalizedCount: merged.leads.length,
    duplicatesRemoved: merged.duplicatesRemoved + totalOsmDuplicates,
    finalResultsCount: leads.length,
    responseTimeMs: Date.now() - started,
    errorSummary: !leads.length && (!osmResults.length || osmResults.every((r) => r.diagnostics.errorSummary)) && web.error
      ? 'No available discovery source completed this query. Configure SearXNG for regional/nationwide distributor searches.'
      : null,
  };

  if (!process.env.LEADOS_SEARXNG_URL && process.env.LEADOS_RESEARCH_WORKER_TOKEN) {
    try {
      const queued = await leadosRequest<{ item: { id: string } }>('/workflow', {
        method: 'POST',
        body: { action: 'queue_discovery', input, query: discoveryQuery(input) },
      });
      diagnostics.queuedJobId = queued.item.id;
      diagnostics.sources!.searxng.error = 'Queued for the private n8n research worker.';
      diagnostics.errorSummary = null;
    } catch {
      diagnostics.sources!.searxng.error = 'Private search queue unavailable.';
    }
  }

  return { leads, diagnostics };
}
