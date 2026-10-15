/**
 * Himalayan Koh LeadOS 3.2 — Market Intelligence & Autonomous Background Discovery
 * 
 * Manages:
 * 1. Three verified commercial market categories:
 *    - Agriculture & Livestock (Ranches, feed stores, horse farms, equestrian, farm supply)
 *    - Retail & Wholesale Salt (Salt wholesalers, food/spice distributors, bulk importers, private-label)
 *    - Wellness & Lifestyle (Spas, salt rooms/caves, wellness centers, massage, salt decor)
 * 2. State-level intelligence aggregation (reconciled directly against genuine DB records).
 * 3. Autonomous background research queue and scheduling.
 * 4. Google Maps / Places optional configuration status.
 */

import type { SavedLeadRecord, NormalizedLead } from './types';
import { isInformationalDomain, classifyLeadEntity } from './intelligence';
import { calculateLeadEvidence } from './scoring';
import { saveLeadsBatchToLibrary } from './db';
import { queryOverpass, resolveOsmTags, type OsmTag } from './osm-provider';
import { USA_STATE_PATHS } from '@/admin/usaStatePaths';

// ---------------------------------------------------------------------------
// 1. Commercial Market Categories
// ---------------------------------------------------------------------------

export type MarketCategoryKey = 'agriculture' | 'salt_wholesale' | 'wellness';

export interface MarketCategoryDef {
  key: MarketCategoryKey;
  label: string;
  badge: string;
  color: string; // Tailwind color token
  description: string;
  subcategories: string[];
  productRelevance: string;
  osmTags: OsmTag[];
}

export const MARKET_CATEGORIES: Record<MarketCategoryKey, MarketCategoryDef> = {
  agriculture: {
    key: 'agriculture',
    label: 'Agriculture & Livestock',
    badge: 'Animal Salt Licks & Nutrition',
    color: 'emerald',
    description: 'Ranches, horse farms, equestrian businesses, feed stores, farm supply stores, livestock supply, and agricultural distributors.',
    subcategories: [
      'Feed Stores',
      'Farm Supply Stores',
      'Equestrian Businesses & Tack',
      'Horse Farms & Stables',
      'Livestock Ranches',
      'Agricultural Distributors',
    ],
    productRelevance: 'Himalayan rock salt blocks (2 lb, 7 lb, 30 lb rope licks), loose animal feeding salt, and mineral licks.',
    osmTags: [
      { key: 'shop', value: 'agrarian' },
      { key: 'shop', value: 'farm' },
      { key: 'shop', value: 'animal_feed' },
      { key: 'shop', value: 'equestrian' },
      { key: 'shop', value: 'saddlery' },
      { key: 'shop', value: 'country_store' },
      { key: 'sport', value: 'equestrian' },
      { key: 'amenity', value: 'riding_school' },
    ],
  },
  salt_wholesale: {
    key: 'salt_wholesale',
    label: 'Retail & Wholesale Salt',
    badge: 'Bulk Food & Private Label',
    color: 'indigo',
    description: 'Himalayan salt retailers, culinary salt businesses, salt wholesalers, food and spice distributors, bulk salt importers, and private-label prospects.',
    subcategories: [
      'Salt Wholesalers & Importers',
      'Food & Spice Distributors',
      'Gourmet & Specialty Retailers',
      'Culinary Salt Businesses',
      'Private-Label Salt Buyers',
      'Bulk Mineral Brokers',
    ],
    productRelevance: 'Bulk pink salt grains (fine/coarse 25 kg bags), culinary shaker jars, gourmet table salt, and private-label packaging.',
    osmTags: [
      { key: 'shop', value: 'wholesale' },
      { key: 'shop', value: 'food' },
      { key: 'shop', value: 'spices' },
      { key: 'shop', value: 'deli' },
      { key: 'shop', value: 'gourmet' },
      { key: 'shop', value: 'trade' },
    ],
  },
  wellness: {
    key: 'wellness',
    label: 'Wellness & Lifestyle',
    badge: 'Salt Rooms, Spas & Decor',
    color: 'amber',
    description: 'Spas, salt rooms and salt caves (halotherapy environments), wellness centers, relaxation facilities, and salt-lamp and home decor retailers.',
    subcategories: [
      'Salt Rooms & Salt Caves',
      'Day Spas & Resort Spas',
      'Wellness Centers',
      'Massage & Relaxation Centers',
      'Himalayan Salt Lamp & Decor Retailers',
      'Holistic Health Centers',
    ],
    productRelevance: 'Pink salt bricks/tiles for salt room construction, bath salt crystals, massage stones, and carved salt lamps.',
    osmTags: [
      { key: 'amenity', value: 'spa' },
      { key: 'leisure', value: 'spa' },
      { key: 'shop', value: 'massage' },
      { key: 'shop', value: 'beauty' },
      { key: 'amenity', value: 'sauna' },
      { key: 'shop', value: 'interior_decoration' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. Classify Leads into Market Categories
// ---------------------------------------------------------------------------

export function classifyMarketCategory(lead: {
  category?: string | null;
  tags?: string[] | null;
  businessName?: string | null;
}): MarketCategoryKey {
  const text = `${lead.category || ''} ${(lead.tags || []).join(' ')} ${lead.businessName || ''}`.toLowerCase();

  if (
    text.includes('spa') ||
    text.includes('salt room') ||
    text.includes('salt cave') ||
    text.includes('wellness') ||
    text.includes('massage') ||
    text.includes('sauna') ||
    text.includes('halo') ||
    text.includes('decor') ||
    text.includes('lamp')
  ) {
    return 'wellness';
  }

  if (
    text.includes('wholesal') ||
    text.includes('distribut') ||
    text.includes('culinary') ||
    text.includes('spice') ||
    text.includes('import') ||
    text.includes('private label') ||
    text.includes('food') ||
    text.includes('grocery') ||
    text.includes('supermarket') ||
    text.includes('mineral distribut')
  ) {
    return 'salt_wholesale';
  }

  // Default to Agriculture & Livestock (the core foundation for feed stores, ranches, tack, etc.)
  return 'agriculture';
}

// ---------------------------------------------------------------------------
// 3. State-Level Intelligence Aggregator
// ---------------------------------------------------------------------------

export interface StateMarketIntelligence {
  code: string;
  name: string;
  region: 'South' | 'Midwest' | 'West' | 'Northeast';
  discoveredCount: number;
  qualifiedCount: number;
  newCount: number;
  contactableCount: number;
  categoryBreakdown: {
    agriculture: number;
    salt_wholesale: number;
    wellness: number;
  };
  topHubs: string[];
  coverageStatus: 'not_scanned' | 'partial' | 'comprehensive';
  lastScanTimestamp: string | null;
}

export function aggregateStateMarketData(
  savedLeads: SavedLeadRecord[]
): Record<string, StateMarketIntelligence> {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Initialize all 51 US states + DC from official paths
  const stateMap: Record<string, StateMarketIntelligence> = {};
  for (const s of USA_STATE_PATHS) {
    stateMap[s.code] = {
      code: s.code,
      name: s.name,
      region: s.region,
      discoveredCount: 0,
      qualifiedCount: 0,
      newCount: 0,
      contactableCount: 0,
      categoryBreakdown: {
        agriculture: 0,
        salt_wholesale: 0,
        wellness: 0,
      },
      topHubs: s.hubs || [],
      coverageStatus: 'not_scanned',
      lastScanTimestamp: null,
    };
  }

  // Group real database records
  for (const lead of savedLeads) {
    if (lead.status === 'excluded') continue; // Skip quarantined informational/bad entries

    // Detect state code from region or address
    let stateCode: string | null = null;
    const reg = (lead.region || '').trim().toUpperCase();
    if (stateMap[reg]) {
      stateCode = reg;
    } else {
      // Check if region matches state name
      const found = USA_STATE_PATHS.find(
        (sp) => sp.name.toLowerCase() === (lead.region || '').toLowerCase()
      );
      if (found) {
        stateCode = found.code;
      } else if (lead.address) {
        // Try to match standard state abbreviation in address (e.g., ", TX ", " TX 77065")
        for (const sp of USA_STATE_PATHS) {
          const rx = new RegExp(`\\b${sp.code}\\b|\\b${sp.name}\\b`, 'i');
          if (rx.test(lead.address)) {
            stateCode = sp.code;
            break;
          }
        }
      }
    }

    if (!stateCode || !stateMap[stateCode]) continue;

    const entry = stateMap[stateCode];
    entry.discoveredCount++;

    // Qualification check
    const isQualified =
      lead.status === 'qualified' ||
      (typeof lead.opportunityScore === 'number' && lead.opportunityScore >= 60);
    if (isQualified) entry.qualifiedCount++;

    // New lead check (last 7 days)
    if (lead.createdAt && new Date(lead.createdAt).getTime() >= sevenDaysAgo) {
      entry.newCount++;
    }

    // Contactable check (has at least 1 reliable contact method)
    if (lead.phone || lead.email || lead.website) {
      entry.contactableCount++;
    }

    // Market Category classification
    const cat = classifyMarketCategory(lead);
    entry.categoryBreakdown[cat]++;

    // Last scan timestamp
    if (lead.updatedAt) {
      if (!entry.lastScanTimestamp || new Date(lead.updatedAt) > new Date(entry.lastScanTimestamp)) {
        entry.lastScanTimestamp = lead.updatedAt;
      }
    }
  }

  // Update coverage statuses
  for (const code of Object.keys(stateMap)) {
    const entry = stateMap[code];
    if (entry.discoveredCount === 0) {
      entry.coverageStatus = 'not_scanned';
    } else if (entry.discoveredCount < 10) {
      entry.coverageStatus = 'partial';
    } else {
      entry.coverageStatus = 'comprehensive';
    }
  }

  return stateMap;
}

// ---------------------------------------------------------------------------
// 4. Metropolitan Research Hubs & Bounding Boxes
// ---------------------------------------------------------------------------

export interface StateMetroHub {
  name: string;
  stateCode: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export const STATE_METRO_HUBS: Record<string, StateMetroHub[]> = {
  TX: [
    { name: 'Houston Metro', stateCode: 'TX', lat: 29.7604, lon: -95.3698, radiusKm: 45 },
    { name: 'Dallas-Fort Worth', stateCode: 'TX', lat: 32.7767, lon: -96.7970, radiusKm: 45 },
    { name: 'San Antonio', stateCode: 'TX', lat: 29.4241, lon: -98.4936, radiusKm: 40 },
    { name: 'Austin Corridor', stateCode: 'TX', lat: 30.2672, lon: -97.7431, radiusKm: 35 },
    { name: 'Panhandle / Amarillo', stateCode: 'TX', lat: 35.2220, lon: -101.8313, radiusKm: 50 },
  ],
  FL: [
    { name: 'Ocala Equine Belt', stateCode: 'FL', lat: 29.1872, lon: -82.1401, radiusKm: 40 },
    { name: 'Tampa Bay', stateCode: 'FL', lat: 27.9506, lon: -82.4572, radiusKm: 40 },
    { name: 'Orlando Central', stateCode: 'FL', lat: 28.5383, lon: -81.3792, radiusKm: 35 },
    { name: 'Miami & South FL', stateCode: 'FL', lat: 25.7617, lon: -80.1918, radiusKm: 35 },
    { name: 'Jacksonville', stateCode: 'FL', lat: 30.3322, lon: -81.6557, radiusKm: 40 },
  ],
  CA: [
    { name: 'Central Valley / Fresno', stateCode: 'CA', lat: 36.7468, lon: -119.7726, radiusKm: 50 },
    { name: 'Bakersfield Ag Hub', stateCode: 'CA', lat: 35.3733, lon: -119.0187, radiusKm: 45 },
    { name: 'Los Angeles Metro', stateCode: 'CA', lat: 34.0522, lon: -118.2437, radiusKm: 45 },
    { name: 'Sacramento Valley', stateCode: 'CA', lat: 38.5816, lon: -121.4944, radiusKm: 40 },
    { name: 'San Diego', stateCode: 'CA', lat: 32.7157, lon: -117.1611, radiusKm: 35 },
  ],
};

// Priority states for autonomous research
export const AUTONOMOUS_PRIORITY_STATES = ['TX', 'FL', 'CA', 'OK', 'CO', 'KY', 'IA', 'NE', 'TN', 'GA'];

// ---------------------------------------------------------------------------
// 5. Autonomous Discovery Execution Engine
// ---------------------------------------------------------------------------

export interface AutonomousScanResult {
  ok: boolean;
  stateCode: string;
  stateName: string;
  metroScanned: string;
  categoryScanned: MarketCategoryKey;
  leadsDiscovered: number;
  newLeadsSaved: number;
  errors: string[];
  durationMs: number;
  timestamp: string;
}

/**
 * Executes a targeted autonomous discovery scan for a US state and market category.
 * Automatically validates commercial status, filters informational entries,
 * calculates opportunity scores, and safely saves new qualified leads into WordPress LeadOS.
 */
export async function runAutonomousMarketScan(options: {
  stateCode: string;
  categoryKey?: MarketCategoryKey;
  limit?: number;
}): Promise<AutonomousScanResult> {
  const startTime = Date.now();
  const stateCode = options.stateCode.toUpperCase();
  const stateInfo = USA_STATE_PATHS.find((s) => s.code === stateCode);
  const stateName = stateInfo ? stateInfo.name : stateCode;
  const categoryKey: MarketCategoryKey = options.categoryKey || 'agriculture';
  const targetCategoryDef = MARKET_CATEGORIES[categoryKey];
  const maxResults = options.limit || 25;
  const errors: string[] = [];

  // Determine metro coordinates (fallback to state label position if no defined metro)
  const metros = STATE_METRO_HUBS[stateCode] || [];
  const selectedMetro = metros.length > 0 ? metros[0] : null;

  let lat = selectedMetro ? selectedMetro.lat : 31.9686;
  let lon = selectedMetro ? selectedMetro.lon : -99.9018;
  let radiusKm = selectedMetro ? selectedMetro.radiusKm : 40;
  let metroName = selectedMetro ? selectedMetro.name : `${stateName} Commercial Hub`;

  if (!selectedMetro && stateInfo) {
    // If state has hubs, name the first hub
    metroName = stateInfo.hubs?.[0] ? `${stateInfo.hubs[0]} Hub` : `${stateName} Hub`;
  }

  try {
    // Run real Overpass API search against verified OSM mirrors
    const overpassRes = await queryOverpass({
      tags: targetCategoryDef.osmTags,
      lat,
      lon,
      radiusKm,
      maxResults,
      nodeOnly: false,
      category: targetCategoryDef.label,
    });

    if (overpassRes.error) {
      errors.push(`Provider warning: ${overpassRes.error}`);
    }

    const rawLeads = overpassRes.leads || [];

    // Filter out non-commercial and informational pages
    const commercialLeads: NormalizedLead[] = [];
    for (const lead of rawLeads) {
      if (lead.website && isInformationalDomain(lead.website)) continue;
      const entity = classifyLeadEntity(lead);
      if (!entity.isActionableProspect || entity.entityType === 'informational_content') continue;

      // Assign region
      lead.region = stateCode;
      lead.country = 'US';
      commercialLeads.push(lead);
    }

    // Score leads and prepare for batch persistence
    const scoredBatch = commercialLeads.map((lead) => {
      const evidence = calculateLeadEvidence(lead, 75);
      return {
        ...lead,
        opportunityScore: evidence.commercialPriority,
        opportunitySignals: evidence.reasons,
        projectFitScore: evidence.icpFit,
        projectFitReasons: evidence.reasons,
        outreachAngles: [`Target product: ${targetCategoryDef.productRelevance}`],
      };
    });

    let savedCount = 0;
    if (scoredBatch.length > 0) {
      // Save directly to WordPress Lead Library via batch persistence
      const batchResult = await saveLeadsBatchToLibrary(scoredBatch);
      savedCount = batchResult.savedCount;
      if (batchResult.errors.length > 0) {
        errors.push(...batchResult.errors.slice(0, 3));
      }
    }

    return {
      ok: true,
      stateCode,
      stateName,
      metroScanned: metroName,
      categoryScanned: categoryKey,
      leadsDiscovered: commercialLeads.length,
      newLeadsSaved: savedCount,
      errors,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Autonomous scan encountered an error';
    errors.push(errorMsg);
    return {
      ok: false,
      stateCode,
      stateName,
      metroScanned: metroName,
      categoryScanned: categoryKey,
      leadsDiscovered: 0,
      newLeadsSaved: 0,
      errors,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// 6. Optional Google Maps / Places Status
// ---------------------------------------------------------------------------

export interface GooglePlacesConfigStatus {
  configured: boolean;
  enabled: boolean;
  apiKeyPresent: boolean;
  monthlyQuota: number;
  costEstimatePerThousand: number;
  notice: string;
}

export function getGooglePlacesStatus(): GooglePlacesConfigStatus {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  const configured = Boolean(key && key.trim().length > 10);
  const enabled = Boolean(configured && process.env.ENABLE_GOOGLE_PLACES === 'true');

  return {
    configured,
    enabled,
    apiKeyPresent: configured,
    monthlyQuota: 500,
    costEstimatePerThousand: 17.0, // Standard Google Places Text Search (New) $17/1000
    notice: 'Free-first OpenStreetMap & Overpass active by default. Google Places is an optional paid enhancement requiring explicit authorization.',
  };
}
