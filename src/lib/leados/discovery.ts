import { searchOpenStreetMap } from './osm-provider';
import { BUYER_CATEGORIES, deduplicateLeads, publicCompanyUrl } from './intelligence';
import type { LeadSearchInput, NormalizedLead, SearchDiagnostics } from './types';
import { leadosRequest } from './db';

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
  return `${expansion} ${input.keyword || ''} ${input.location} ${input.privateLabelOnly ? 'private label' : ''} ${input.wholesaleOnly ? 'wholesale distributor' : ''}`.trim().slice(0,500);
}
export function normalizeSearchResults(results: WebSearchResult[], input: LeadSearchInput, retrievedAt: string): NormalizedLead[] {
  const leads: NormalizedLead[] = [];
  for (const result of results) {
    const website = result.url ? publicCompanyUrl(result.url) : null;
    if (!website || !result.title || /directory|top \d|best \d|near me|yellow pages|mapquest/i.test(result.title)) continue;
    const candidateUrl = new URL(website);
    if (/(^|\.)(?:whereorg|macraesbluebook|chamberofcommerce|manta|loc8nearme|visithoustontexas|newhorse)\.com$/i.test(candidateUrl.hostname) || /(^|\.)wheretoride\.horse$/i.test(candidateUrl.hostname) || /\/(?:directory|businesses|listings)(?:\/|$)/i.test(candidateUrl.pathname) || /\/properties\/list(?:\/|$)/i.test(candidateUrl.pathname) || /\/service\/.*\/location\//i.test(candidateUrl.pathname)) continue;
    const text = `${result.title} ${result.content || ''}`;
    if (!/feed|farm|ranch|equestrian|equine|horse|tack|saddlery|livestock|salt|spice|seasoning|food distribut/i.test(text)) continue;
    if (/software|marketing agency|restaurant/i.test(result.title)) continue;
    leads.push({
      businessName: result.title.split(/\s[|–—]\s/)[0].trim().slice(0, 200), category: input.category,
      address: null, city: null, region: null, country: null, website, phone: null, email: null,
      latitude: null, longitude: null, osmType: null, osmId: null, osmUrl: null, dataSource: 'searxng',
      research: { productInterest: input.productInterest, sources: [{ url: website, retrievedAt, kind: 'search_result', status: 'inferred', excerpt: (result.content || '').slice(0, 600) }] },
    });
  }
  const groups = new Map<string, NormalizedLead>();
  for (const lead of leads) {
    const url = new URL(lead.website!);
    // A company homepage and its generic sections are one candidate. Explicit
    // branch/location routes remain distinct until their addresses are verified.
    const branch = /\/(?:locations?|stores?|branches?)(?:\/|[-_])/i.test(url.pathname);
    const key = `${url.hostname.replace(/^www\./,'')}|${branch ? url.pathname : 'company'}`;
    const prior = groups.get(key);
    if (!prior) { groups.set(key,lead); continue; }
    prior.research!.sources = [...(prior.research?.sources || []),...(lead.research?.sources || [])];
    if (url.pathname === '/') { prior.businessName = lead.businessName; prior.website = lead.website; }
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
    url.search = new URLSearchParams({ q: discoveryQuery(input,expansion), format: 'json', language: 'en-US', safesearch: '1' }).toString();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000), cache: 'no-store' });
      if (!res.ok) { error = `SearXNG HTTP ${res.status}`; break; }
      if (Number(res.headers.get('content-length') || 0) > 1_000_000) throw new Error('Response too large');
      const text = await res.text();
      if (text.length > 1_000_000) throw new Error('Response too large');
      const data = JSON.parse(text) as { results?: WebSearchResult[] };
      if (!Array.isArray(data.results)) throw new Error('Invalid results');
      raw += data.results.length;
      leads.push(...normalizeSearchResults(data.results.slice(0, 40), input, new Date().toISOString()));
    } catch { error = 'SearXNG request failed or returned invalid data.'; break; }
  }
  return { leads, raw, error };
}

export async function discoverLeads(input: LeadSearchInput): Promise<{ leads: NormalizedLead[]; diagnostics: SearchDiagnostics }> {
  if (!BUYER_CATEGORIES.includes(input.category)) throw new Error('Choose a relevant Himalayan Koh B2B buyer category.');
  if (input.country && !/^(us|usa|united states)$/i.test(input.country)) throw new Error('LeadOS targets the United States.');
  const started = Date.now();
  const localOsm = ['Feed Store', 'Farm Supply', 'Equestrian Store', 'Ranch & Horse Facility'].includes(input.category) && !/^(?:usa|us|united states|texas)(?:,?\s*(?:usa|us|united states))?$/i.test(input.location.trim());
  const [osm, web] = await Promise.all([
    localOsm ? searchOpenStreetMap({ ...input, keyword: '', maxResults: Math.min(input.maxResults || 15, 40), radiusKm: Math.min(Math.max(input.radiusKm || 25, 1), 50) }) : Promise.resolve(null),
    searchSearxng(input),
  ]);
  const timestamp = new Date().toISOString();
  const osmLeads = (osm?.leads || []).map((lead) => ({ ...lead, research: { ...lead.research, productInterest: input.productInterest, sources: lead.research?.sources || [{ url: lead.osmUrl!, retrievedAt: timestamp, kind: 'openstreetmap', status: 'verified' as const, excerpt: `${lead.businessName}: mapped ${lead.category}; ${lead.address || ''} ${lead.city || ''} ${lead.region || ''}` }] } }));
  const merged = deduplicateLeads([...osmLeads, ...web.leads]);
  const leads = merged.leads.filter((lead) => (!input.requireWebsite || Boolean(lead.website)) && (!input.requirePhone || Boolean(lead.phone)) && (!input.requireEmail || Boolean(lead.email && lead.emailSource === 'company_website'))).slice(0, Math.min(Math.max(input.maxResults || 15, 1), 40));
  const sources = {
    ...(osm?.diagnostics.sources || {}),
    searxng: { raw: web.raw, normalized: web.leads.length, error: web.error },
  };
  const diagnostics: SearchDiagnostics = {
    geocodeSuccess: osm?.diagnostics.geocodeSuccess || !localOsm,
    resolvedLocation: osm?.diagnostics.resolvedLocation || input.location,
    boundingArea: osm?.diagnostics.boundingArea || null, categoriesQueried: [input.category], sources,
    rawResultsCount: (osm?.diagnostics.rawResultsCount || 0) + web.raw,
    normalizedCount: merged.leads.length, duplicatesRemoved: merged.duplicatesRemoved + (osm?.diagnostics.duplicatesRemoved || 0),
    finalResultsCount: leads.length, responseTimeMs: Date.now() - started,
    errorSummary: !leads.length && (!osm || osm.diagnostics.errorSummary) && web.error ? 'No available discovery source completed this query. Configure SearXNG for regional/nationwide distributor searches.' : null,
  };
  if (!process.env.LEADOS_SEARXNG_URL && process.env.LEADOS_RESEARCH_WORKER_TOKEN) {
    try {
      const queued = await leadosRequest<{ item: { id: string } }>('/workflow', { method: 'POST', body: { action: 'queue_discovery', input, query:discoveryQuery(input) } });
      diagnostics.queuedJobId = queued.item.id;
      diagnostics.sources!.searxng.error = 'Queued for the private n8n research worker.';
      diagnostics.errorSummary = null;
    } catch { diagnostics.sources!.searxng.error = 'Private search queue unavailable.'; }
  }
  return { leads, diagnostics };
}
