import { geocodeDetailed } from './geo';
import type { NormalizedLead, LeadSearchInput, SearchDiagnostics } from './types';

/**
 * Overpass mirrors, tried in order. The primary de instance rate-limits and
 * times out under load (measured: HTTP 429/504 + dispatcher timeouts), so a
 * single endpoint means every search dies with it. An env override still wins
 * when set, and becomes the first mirror rather than the only one.
 */
const OVERPASS_URLS = [
  process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
].filter((u, i, all) => u && all.indexOf(u) === i);

const NOMINATIM_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const NOMINATIM_UA = 'LeadOS-HimalayanKoh/1.0 (lead-discovery-tool)';

export interface OsmTag {
  key: string;
  value: string;
}

export interface CoordSearchInput {
  tags: OsmTag[];
  lat: number;
  lon: number;
  radiusKm: number;
  maxResults: number;
  nodeOnly: boolean;
  requireWebsite?: boolean;
  requirePhone?: boolean;
  category: string;
}

export interface OverpassResult {
  leads: NormalizedLead[];
  rawCount: number;
  error: string | null;
  rateLimited: boolean;
  durationMs: number;
}

const DEFAULT_CATEGORY_MAPPINGS: Record<string, OsmTag[]> = {
  'feed store': [
    { key: 'shop', value: 'agrarian' },
    { key: 'shop', value: 'farm' },
  ],
  'farm supply': [
    { key: 'shop', value: 'agrarian' },
    { key: 'shop', value: 'farm' },
    { key: 'shop', value: 'garden_centre' },
  ],
  'equestrian store': [
    { key: 'shop', value: 'equestrian' },
    { key: 'shop', value: 'saddlery' },
  ],
  'ranch & horse facility': [
    { key: 'leisure', value: 'horse_riding' },
    { key: 'place', value: 'farm' },
  ],
  'supermarket': [
    { key: 'shop', value: 'supermarket' },
  ],
  'pet shop': [
    { key: 'shop', value: 'pet' },
  ],
  'veterinary': [
    { key: 'amenity', value: 'veterinary' },
  ],
  'restaurant': [
    { key: 'amenity', value: 'restaurant' },
  ],
  'bakery': [
    { key: 'shop', value: 'bakery' },
  ],
};

export async function resolveOsmTags(category: string): Promise<{ tags: OsmTag[]; expandedCategories: string[] }> {
  const norm = category.trim().toLowerCase();
  
  // Check default mapping
  if (DEFAULT_CATEGORY_MAPPINGS[norm]) {
    return {
      tags: DEFAULT_CATEGORY_MAPPINGS[norm],
      expandedCategories: [category],
    };
  }

  // Partial match fallback
  for (const [k, tags] of Object.entries(DEFAULT_CATEGORY_MAPPINGS)) {
    if (norm.includes(k) || k.includes(norm)) {
      return { tags, expandedCategories: [category] };
    }
  }

  // Generic tag fallback
  const cleanVal = norm.replace(/s$/, '').replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
  return {
    tags: [
      { key: 'shop', value: cleanVal },
      { key: 'amenity', value: cleanVal },
    ],
    expandedCategories: [category],
  };
}

function sanitizeOsmKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_:]/g, '');
}

function sanitizeOsmValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\- ]/g, '');
}

function buildOverpassQuery(
  tags: OsmTag[],
  lat: number,
  lon: number,
  radiusM: number,
  maxResults: number,
  nodeOnly: boolean
): string {
  const area = `(around:${radiusM},${lat},${lon})`;
  const parts: string[] = [];

  for (const tag of tags) {
    const filter = `["${sanitizeOsmKey(tag.key)}"="${sanitizeOsmValue(tag.value)}"]`;
    parts.push(`node${filter}${area};`);
    if (!nodeOnly) parts.push(`way${filter}${area};`);
  }

  return `[out:json][timeout:25];(${parts.join('')});out center ${maxResults};`;
}

function extractAddress(tags: Record<string, string>): {
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
} {
  const parts: string[] = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street']) parts.push(tags['addr:street']);

  return {
    address: parts.length > 0 ? parts.join(' ') : null,
    city: tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || null,
    region: tags['addr:state'] || tags['addr:province'] || null,
    country: tags['addr:country'] || null,
  };
}

export async function queryOverpass(input: CoordSearchInput): Promise<OverpassResult> {
  const start = Date.now();
  const query = buildOverpassQuery(
    input.tags,
    input.lat,
    input.lon,
    input.radiusKm * 1000,
    input.maxResults * 2,
    input.nodeOnly
  );

  let res: Response | null = null;
  let lastError: string | null = null;
  let rateLimited = false;

  // NOTE: no `Accept` header on purpose. overpass-api.de answers
  // `Accept: application/json` with HTTP 406, which used to fail every search.
  // The `[out:json]` query parameter already selects the JSON representation.
  mirrorLoop:
  for (const mirror of OVERPASS_URLS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remainingMs = 12000 - (Date.now() - start);
      if (remainingMs < 1000) { lastError = 'Overpass search exceeded its bounded time budget.'; break mirrorLoop; }
      try {
        res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'LeadOS-HimalayanKoh/1.0',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(Math.min(6000, remainingMs)),
        });

        if (res.ok) break mirrorLoop;

        if (res.status === 429 || res.status === 503 || res.status === 504) {
          rateLimited = true;
          lastError = `Overpass rate limited (${res.status})`;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
        } else {
          lastError = `Overpass API error HTTP ${res.status}`;
          break;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    // This mirror is exhausted (or errored non-transiently): try the next one.
    res = null;
  }

  if (!res || !res.ok) {
    return { leads: [], rawCount: 0, error: lastError, rateLimited, durationMs: Date.now() - start };
  }

  try {
    const data = await res.json();
    // Overpass can return HTTP 200 with a runtime-error remark and no results.
    // Treat incomplete/error responses as unavailable, not successful emptiness.
    if (data.remark || !Array.isArray(data.elements)) {
      return { leads: [], rawCount: 0, error: 'Overpass returned an incomplete response.', rateLimited: false, durationMs: Date.now() - start };
    }
    const elements = data.elements;
    const seen = new Set<string>();
    const leads: NormalizedLead[] = [];

    for (const el of elements) {
      const elTags = el.tags || {};
      const name = elTags.name || elTags['name:en'];
      if (!name) continue;
      // OSM shop=farm also describes produce/CSA shops. Do not relabel those
      // as feed stores merely because they matched the broad tag query.
      if (input.category.toLowerCase()==='feed store' && elTags.shop==='farm' && !/feed|grain|livestock|agricultur|ranch supplies/i.test(`${name} ${elTags.description || ''}`)) continue;

      const lat = el.lat || el.center?.lat;
      const lon = el.lon || el.center?.lon;
      const dedupeKey = `${name.toLowerCase()}-${lat?.toFixed(4)}-${lon?.toFixed(4)}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const addr = extractAddress(elTags);
      const osmType = el.type || 'node';
      const osmId = String(el.id);

      const lead: NormalizedLead = {
        businessName: name,
        category: input.category,
        address: addr.address,
        city: addr.city,
        region: addr.region,
        country: addr.country,
        website: elTags.website || elTags['contact:website'] || null,
        phone: elTags.phone || elTags['contact:phone'] || null,
        email: elTags.email || elTags['contact:email'] || null,
        emailSource: (elTags.email || elTags['contact:email']) ? 'discovered_osm' : undefined,
        latitude: lat || null,
        longitude: lon || null,
        osmType,
        osmId,
        osmUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
        dataSource: 'openstreetmap',
        research: { sources: [{ url: `https://www.openstreetmap.org/${osmType}/${osmId}`, retrievedAt: new Date().toISOString(), kind: 'openstreetmap', status: 'verified', excerpt: `${name}; mapped shop=${elTags.shop || ''}, amenity=${elTags.amenity || ''}; ${addr.address || ''} ${addr.city || ''} ${addr.region || ''}` }] },
      };

      if (input.requireWebsite && !lead.website) continue;
      if (input.requirePhone && !lead.phone) continue;

      leads.push(lead);
    }

    return {
      leads: leads.slice(0, input.maxResults),
      rawCount: elements.length,
      error: null,
      rateLimited: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      leads: [],
      rawCount: 0,
      error: 'Failed to parse Overpass response: ' + String(err),
      rateLimited: false,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Free-text keyword search against the Nominatim index (`<keyword> near
 * <location>`), constrained to the geocoded area's viewbox. This is the
 * Yellow-Pages-like half of a search: it finds businesses by name words
 * ("tack shop", "organic feed") that no OSM tag query can express, needs no
 * API key, and keeps working when every Overpass mirror is down. Polite by
 * design: one request, after a 1s pause (Nominatim allows 1 req/s).
 */
export async function searchNominatimKeywords(
  keyword: string,
  location: string,
  viewbox: [number, number, number, number] | null,
  maxResults: number,
  category: string
): Promise<{ leads: NormalizedLead[]; rawCount: number; error: string | null }> {
  // A delay alone does not make systematic POI harvesting compliant. Keep this
  // proven parser for operator-owned installations; public Nominatim is geocoding only.
  if (new URL(NOMINATIM_URL).hostname === 'nominatim.openstreetmap.org') {
    return { leads: [], rawCount: 0, error: 'Public Nominatim keyword harvesting is disabled; configure self-hosted search.' };
  }
  const q = `${keyword.trim()} near ${location.trim()}`;
  try {
    // Nominatim usage policy: at most 1 request/second per client.
    await new Promise((r) => setTimeout(r, 1100));
    const params = new URLSearchParams({
      q,
      format: 'json',
      addressdetails: '1',
      extratags: '1',
      limit: String(Math.min(Math.max(maxResults, 1), 40)),
    });
    if (viewbox) {
      // viewbox = left,top,right,bottom = west,north,east,south.
      params.set('viewbox', `${viewbox[2]},${viewbox[1]},${viewbox[3]},${viewbox[0]}`);
    }
    const res = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
      headers: { 'User-Agent': NOMINATIM_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { leads: [], rawCount: 0, error: `Keyword index error HTTP ${res.status}` };
    }
    const data = await res.json();
    if (!Array.isArray(data)) return { leads: [], rawCount: 0, error: 'Keyword index returned an unexpected response.' };

    const leads: NormalizedLead[] = [];
    for (const r of data) {
      const name = String(r.name || '').trim() || String(r.display_name || '').split(',')[0].trim();
      if (!name) continue;
      const addr = r.address || {};
      leads.push({
        businessName: name,
        category,
        address: [addr.house_number, addr.road].filter(Boolean).join(' ') || null,
        city: addr.city || addr.town || addr.village || addr.hamlet || null,
        region: addr.state || null,
        country: addr.country || null,
        website: r.extratags?.website || null,
        phone: r.extratags?.phone || r.extratags?.['contact:phone'] || null,
        email: null,
        latitude: r.lat ? parseFloat(r.lat) : null,
        longitude: r.lon ? parseFloat(r.lon) : null,
        osmType: r.osm_type || null,
        osmId: r.osm_id != null ? String(r.osm_id) : null,
        osmUrl: r.osm_type && r.osm_id != null ? `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}` : null,
        dataSource: 'nominatim-keyword',
      });
      if (leads.length >= maxResults) break;
    }
    return { leads, rawCount: data.length, error: null };
  } catch (err) {
    return { leads: [], rawCount: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function searchOpenStreetMap(input: LeadSearchInput): Promise<{
  leads: NormalizedLead[];
  diagnostics: SearchDiagnostics;
}> {
  const startTime = Date.now();
  const diagnostics: SearchDiagnostics = {
    geocodeSuccess: false,
    resolvedLocation: null,
    boundingArea: null,
    categoriesQueried: [input.category],
    rawResultsCount: 0,
    normalizedCount: 0,
    duplicatesRemoved: 0,
    responseTimeMs: 0,
    errorSummary: null,
  };

  const geo = await geocodeDetailed(input.location);
  if (!geo) {
    diagnostics.errorSummary = `Location "${input.location}" could not be resolved.`;
    diagnostics.responseTimeMs = Date.now() - startTime;
    return { leads: [], diagnostics };
  }

  diagnostics.geocodeSuccess = true;
  diagnostics.resolvedLocation = geo.displayName;
  diagnostics.boundingArea = {
    lat: geo.lat,
    lon: geo.lon,
    radiusKm: input.radiusKm || 25,
  };

  const { tags } = await resolveOsmTags(input.category);
  const maxResults = Math.min(input.maxResults || 15, 50);
  const keyword = input.keyword?.trim() || '';

  // Tag search (map data) and keyword search (name index) run together so one
  // dead source never means zero results. Each half filters its own leads;
  // the merge below dedupes across both.
  const [overpass, keywordRes] = await Promise.all([
    queryOverpass({
      tags,
      lat: geo.lat,
      lon: geo.lon,
      radiusKm: input.radiusKm || 25,
      maxResults,
      nodeOnly: input.nodeOnly || false,
      requireWebsite: input.requireWebsite,
      requirePhone: input.requirePhone,
      category: input.category,
    }),
    keyword
      ? searchNominatimKeywords(keyword, input.location, geo.boundingBox, maxResults, input.category)
      : Promise.resolve({ leads: [] as NormalizedLead[], rawCount: 0, error: null as string | null }),
  ]);

  const seen = new Set<string>();
  const merged: NormalizedLead[] = [];
  for (const lead of [...overpass.leads, ...keywordRes.leads]) {
    if (input.requireWebsite && !lead.website) continue;
    if (input.requirePhone && !lead.phone) continue;
    const key = lead.osmType && lead.osmId
      ? `${lead.osmType}/${lead.osmId}`
      : `${lead.businessName.toLowerCase()}-${(lead.latitude ?? 0).toFixed(4)}-${(lead.longitude ?? 0).toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(lead);
    if (merged.length >= maxResults) break;
  }

  const rawTotal = overpass.rawCount + keywordRes.rawCount;
  diagnostics.rawResultsCount = rawTotal;
  diagnostics.normalizedCount = merged.length;
  diagnostics.duplicatesRemoved = Math.max(0, rawTotal - merged.length);
  diagnostics.responseTimeMs = Date.now() - startTime;
  diagnostics.sources = {
    overpass: { raw: overpass.rawCount, normalized: overpass.leads.length, error: overpass.error },
    ...(keyword
      ? { keyword: { raw: keywordRes.rawCount, normalized: keywordRes.leads.length, error: keywordRes.error } }
      : {}),
  };
  // Only a total blackout is an error: one live source is a successful search.
  diagnostics.errorSummary = overpass.error && keywordRes.error
    ? `Map data: ${overpass.error} · Keyword index: ${keywordRes.error}`
    : !keyword && overpass.error
      ? overpass.error
      : null;

  return { leads: merged, diagnostics };
}
