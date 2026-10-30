/**
 * Geography helpers used by LeadOS lead providers.
 * Handles detailed geocoding and Nominatim place rank resolution.
 */

const NOMINATIM_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const UA = 'LeadOS-HimalayanKoh/1.0 (lead-discovery-tool)';

export type LocationScope = 'local' | 'region' | 'country';

export interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
  scope: LocationScope;
  placeRank: number;
  boundingBox: [number, number, number, number]; // [south, north, west, east]
}

export interface SubLocation {
  name: string;
  lat: number;
  lon: number;
}

function rankToScope(rank: number): LocationScope {
  if (rank <= 4) return 'country';
  if (rank <= 8) return 'region';
  return 'local';
}

/**
 * Geocode a location string and return detailed metadata including scope.
 */
export async function geocodeDetailed(location: string): Promise<GeoResult | null> {
  try {
    const url = `${NOMINATIM_URL}/search?q=${encodeURIComponent(location)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const r = results[0];
    const placeRank: number = r.place_rank ?? 30;

    return {
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      displayName: r.display_name,
      scope: rankToScope(placeRank),
      placeRank,
      boundingBox: [
        parseFloat(r.boundingbox[0]),
        parseFloat(r.boundingbox[1]),
        parseFloat(r.boundingbox[2]),
        parseFloat(r.boundingbox[3]),
      ],
    };
  } catch (err) {
    console.warn('Geocoding error:', err);
    return null;
  }
}

/**
 * For a large region (state / country), resolve sub-locations.
 */
export async function resolveSubLocations(
  regionName: string,
  limit: number = 3
): Promise<SubLocation[]> {
  try {
    const queries = [
      `${NOMINATIM_URL}/search?q=${encodeURIComponent(regionName)}&format=json&limit=10&featuretype=city`,
      `${NOMINATIM_URL}/search?q=city+${encodeURIComponent(regionName)}&format=json&limit=10`,
    ];

    for (const url of queries) {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const valid = data
        .filter((item) => item.lat && item.lon)
        .slice(0, limit)
        .map((item) => ({
          name: item.display_name.split(',')[0].trim(),
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
        }));

      if (valid.length > 0) return valid;
    }
  } catch {
    // Non-fatal fallback
  }

  return [];
}
