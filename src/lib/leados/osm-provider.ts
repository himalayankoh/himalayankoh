import { geocodeDetailed } from './geo';
import type { NormalizedLead, LeadSearchInput, SearchDiagnostics } from './types';

const OVERPASS_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';

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

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'LeadOS-HimalayanKoh/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25000),
      });

      if (res.ok) break;

      if (res.status === 429 || res.status === 503 || res.status === 504) {
        rateLimited = true;
        lastError = `Overpass rate limited (${res.status})`;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
      } else {
        lastError = `Overpass API error HTTP ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
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

  const result = await queryOverpass({
    tags,
    lat: geo.lat,
    lon: geo.lon,
    radiusKm: input.radiusKm || 25,
    maxResults,
    nodeOnly: input.nodeOnly || false,
    requireWebsite: input.requireWebsite,
    requirePhone: input.requirePhone,
    category: input.category,
  });

  diagnostics.rawResultsCount = result.rawCount;
  diagnostics.normalizedCount = result.leads.length;
  diagnostics.duplicatesRemoved = Math.max(0, result.rawCount - result.leads.length);
  diagnostics.responseTimeMs = Date.now() - startTime;
  diagnostics.errorSummary = result.error;

  return { leads: result.leads, diagnostics };
}
