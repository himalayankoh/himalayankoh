'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  MapPin,
  Check,
  X,
  Buildings,
  Globe,
  Sparkle,
  ArrowsClockwise,
  MagnifyingGlass,
  Plus,
  Minus,
  ArrowsOut,
  Target,
  Storefront,
  Info,
  CheckCircle,
  Phone,
  EnvelopeSimple,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import type { ScoredLead } from '@/lib/leados/types';
import { USA_STATE_PATHS, computeStateViewBox, type StateMapPath } from './usaStatePaths';

export { USA_STATE_PATHS, type StateMapPath };

// Lower 48 states + AK/HI projection in Albers USA 1280 scale (960x600 viewBox)
export function projectCoordinates(lat: number, lon: number): [number, number] | null {
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) {
    const rad = Math.PI / 180;
    const phi1 = 29.5 * rad;
    const phi2 = 45.5 * rad;
    const phi0 = 37.5 * rad;
    const lambda0 = -96 * rad;
    const n = 0.5 * (Math.sin(phi1) + Math.sin(phi2));
    const c = Math.cos(phi1) * Math.cos(phi1) + 2 * n * Math.sin(phi1);
    const rho0 = Math.sqrt(c - 2 * n * Math.sin(phi0)) / n;

    const lambda = lon * rad;
    const phi = lat * rad;
    const rho = Math.sqrt(Math.max(0, c - 2 * n * Math.sin(phi))) / n;
    const theta = n * (lambda - lambda0);

    const scale = 1280;
    const x = 480 + scale * rho * Math.sin(theta);
    const y = 300 - scale * (rho0 - rho * Math.cos(theta));
    return [Math.max(20, Math.min(940, x)), Math.max(20, Math.min(580, y))];
  }
  // Alaska inset
  if (lat >= 51 && lat <= 72 && lon >= -170 && lon <= -129) {
    const x = 120 + (lon - (-150)) * 3.5;
    const y = 540 - (lat - 64) * 4.5;
    return [Math.max(20, Math.min(220, x)), Math.max(460, Math.min(590, y))];
  }
  // Hawaii inset
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) {
    const x = 300 + (lon - (-157)) * 12;
    const y = 550 - (lat - 21) * 12;
    return [Math.max(240, Math.min(360, x)), Math.max(510, Math.min(580, y))];
  }
  return null;
}

// Compute accurate SVG bounding box from state path string
function computeStateBounds(path: string): { minX: number; maxX: number; minY: number; maxY: number; w: number; h: number } {
  const matches = path.matchAll(/([0-9.-]+),([0-9.-]+)/g);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const m of matches) {
    const x = parseFloat(m[1]), y = parseFloat(m[2]);
    if (!isNaN(x) && !isNaN(y)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 960, minY: 0, maxY: 600, w: 960, h: 600 };
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

export type AgriculturalPoiType = 'ranch' | 'farm' | 'feed_store' | 'livestock' | 'city' | 'discovered';

export interface AgriculturalPoi {
  id: string;
  name: string;
  type: AgriculturalPoiType;
  city: string;
  state: string;
  stateCode: string;
  lat: number;
  lon: number;
  category: string;
  subtitle: string;
  phone?: string;
  website?: string;
  targetQuery: string;
}

// Curated high-value agricultural ranches, equine centers, feed stores & commercial cities across USA
export const AGRICULTURAL_POIS: AgriculturalPoi[] = [
  // ── Texas (Ag & Cattle Epicenter) ──
  {
    id: 'tx-houston-city',
    name: 'Houston, TX',
    type: 'city',
    city: 'Houston',
    state: 'Texas',
    stateCode: 'TX',
    lat: 29.7604,
    lon: -95.3698,
    category: 'Commercial Metro',
    subtitle: 'Major Port & Gulf Feed Distribution Epicenter',
    targetQuery: 'Houston, TX',
  },
  {
    id: 'tx-dallas-city',
    name: 'Dallas, TX',
    type: 'city',
    city: 'Dallas',
    state: 'Texas',
    stateCode: 'TX',
    lat: 32.7767,
    lon: -96.7970,
    category: 'Commercial Metro',
    subtitle: 'North Texas Freight & Mineral Distribution Epicenter',
    targetQuery: 'Dallas, TX',
  },
  {
    id: 'tx-fortworth-city',
    name: 'Fort Worth, TX',
    type: 'city',
    city: 'Fort Worth',
    state: 'Texas',
    stateCode: 'TX',
    lat: 32.7555,
    lon: -97.3308,
    category: 'Commercial Metro',
    subtitle: 'Historic Stockyards & Commercial Cattle Hub',
    targetQuery: 'Fort Worth, TX',
  },
  {
    id: 'tx-austin-city',
    name: 'Austin, TX',
    type: 'city',
    city: 'Austin',
    state: 'Texas',
    stateCode: 'TX',
    lat: 30.2672,
    lon: -97.7431,
    category: 'Commercial Metro',
    subtitle: 'Central Texas Hill Country Ag Corridor',
    targetQuery: 'Austin, TX',
  },
  {
    id: 'tx-sanantonio-city',
    name: 'San Antonio, TX',
    type: 'city',
    city: 'San Antonio',
    state: 'Texas',
    stateCode: 'TX',
    lat: 29.4241,
    lon: -98.4936,
    category: 'Commercial Metro',
    subtitle: 'South Texas Livestock Gateway & Ranch Supply Hub',
    targetQuery: 'San Antonio, TX',
  },
  {
    id: 'tx-amarillo-city',
    name: 'Amarillo, TX',
    type: 'city',
    city: 'Amarillo',
    state: 'Texas',
    stateCode: 'TX',
    lat: 35.2220,
    lon: -101.8313,
    category: 'Commercial Metro',
    subtitle: 'Capital of the Texas Cattle Belt & Feed Yards',
    targetQuery: 'Amarillo, TX',
  },
  {
    id: 'tx-lubbock-city',
    name: 'Lubbock, TX',
    type: 'city',
    city: 'Lubbock',
    state: 'Texas',
    stateCode: 'TX',
    lat: 33.5779,
    lon: -101.8552,
    category: 'Commercial Metro',
    subtitle: 'West Texas Agricultural & Cotton Distribution Hub',
    targetQuery: 'Lubbock, TX',
  },
  {
    id: 'tx-elpaso-city',
    name: 'El Paso, TX',
    type: 'city',
    city: 'El Paso',
    state: 'Texas',
    stateCode: 'TX',
    lat: 31.7619,
    lon: -106.4850,
    category: 'Commercial Metro',
    subtitle: 'Far West Texas & Border Livestock Trade',
    targetQuery: 'El Paso, TX',
  },
  {
    id: 'tx-waco-city',
    name: 'Waco, TX',
    type: 'city',
    city: 'Waco',
    state: 'Texas',
    stateCode: 'TX',
    lat: 31.5493,
    lon: -97.1467,
    category: 'Commercial Metro',
    subtitle: 'Central Texas Brazos Valley Farm Belt',
    targetQuery: 'Waco, TX',
  },
  {
    id: 'tx-corpus-city',
    name: 'Corpus Christi, TX',
    type: 'city',
    city: 'Corpus Christi',
    state: 'Texas',
    stateCode: 'TX',
    lat: 27.8006,
    lon: -97.3964,
    category: 'Commercial Metro',
    subtitle: 'Coastal Bend Grain & Feed Export Terminal',
    targetQuery: 'Corpus Christi, TX',
  },
  // Texas Ranches & Feed Stores
  {
    id: 'tx-king-ranch',
    name: 'King Ranch (Kingsville)',
    type: 'ranch',
    city: 'Kingsville',
    state: 'Texas',
    stateCode: 'TX',
    lat: 27.5259,
    lon: -97.9044,
    category: 'Historic Cattle Ranch',
    subtitle: '825,000-Acre Legendary Ranch & Commercial Cattle Operations',
    phone: '(361) 592-8000',
    website: 'https://king-ranch.com',
    targetQuery: 'Kingsville, TX',
  },
  {
    id: 'tx-fw-stockyards',
    name: 'Fort Worth Stockyards',
    type: 'ranch',
    city: 'Fort Worth',
    state: 'Texas',
    stateCode: 'TX',
    lat: 32.7885,
    lon: -97.3468,
    category: 'Livestock Exchange & Ranches',
    subtitle: 'Historic Stockyards Cattle Exchange & Mineral Lick Suppliers',
    phone: '(817) 624-4741',
    website: 'https://fortworthstockyards.org',
    targetQuery: 'Fort Worth, TX',
  },
  {
    id: 'tx-wabash-feed',
    name: 'Wabash Feed & Garden',
    type: 'feed_store',
    city: 'Houston',
    state: 'Texas',
    stateCode: 'TX',
    lat: 29.8052,
    lon: -95.4190,
    category: 'Feed Store & Co-op',
    subtitle: 'Historic Livestock Feeds, Mineral Blocks, Equine & Co-op Hub',
    phone: '(713) 863-8322',
    website: 'https://wabashfeed.com',
    targetQuery: 'Houston, TX',
  },
  {
    id: 'tx-quality-feed',
    name: 'Quality Feed & Garden',
    type: 'feed_store',
    city: 'Houston',
    state: 'Texas',
    stateCode: 'TX',
    lat: 29.7980,
    lon: -95.4050,
    category: 'Feed Store & Nutrition',
    subtitle: 'Cattle & Horse Mineral Blocks, Bulk Grain Supplies',
    phone: '(713) 862-2323',
    website: 'https://qualityfeedcompany.com',
    targetQuery: 'Houston, TX',
  },
  {
    id: 'tx-callahan-store',
    name: "Callahan's General Store",
    type: 'feed_store',
    city: 'Austin',
    state: 'Texas',
    stateCode: 'TX',
    lat: 30.2350,
    lon: -97.7120,
    category: 'Farm & Ranch Supply',
    subtitle: 'Premier Central Texas Livestock Minerals, Tack & Feed Store',
    phone: '(512) 385-3452',
    website: 'https://callahansgeneralstore.com',
    targetQuery: 'Austin, TX',
  },
  {
    id: 'tx-amarillo-feedlot',
    name: 'Amarillo Cattle Feed Yards',
    type: 'livestock',
    city: 'Amarillo',
    state: 'Texas',
    stateCode: 'TX',
    lat: 35.1950,
    lon: -101.7800,
    category: 'Commercial Feed Lot',
    subtitle: 'High-Volume Beef Cattle Feeding & Salt Supplement Belt',
    targetQuery: 'Amarillo, TX',
  },
  {
    id: 'tx-justin-seed',
    name: 'Justin Seed & Feed Co.',
    type: 'feed_store',
    city: 'Justin',
    state: 'Texas',
    stateCode: 'TX',
    lat: 33.0850,
    lon: -97.2950,
    category: 'Wholesale Feed Distributor',
    subtitle: 'Bulk Agricultural Feed, Mineral Licks & North Texas Distribution',
    phone: '(940) 648-2751',
    targetQuery: 'Dallas, TX',
  },
  {
    id: 'tx-sa-feed',
    name: 'San Antonio Feed & Supply',
    type: 'feed_store',
    city: 'San Antonio',
    state: 'Texas',
    stateCode: 'TX',
    lat: 29.4600,
    lon: -98.4700,
    category: 'Ranch & Feed Supply',
    subtitle: 'South Texas Wholesale Feed, Salt Minerals & Ranch Gear',
    targetQuery: 'San Antonio, TX',
  },

  // ── Florida (Equine & Agriculture) ──
  {
    id: 'fl-ocala-city',
    name: 'Ocala, FL',
    type: 'city',
    city: 'Ocala',
    state: 'Florida',
    stateCode: 'FL',
    lat: 29.1872,
    lon: -82.1401,
    category: 'Equine Capital',
    subtitle: 'Horse Capital of the World & High-Volume Mineral Feed Distro',
    targetQuery: 'Ocala, FL',
  },
  {
    id: 'fl-orlando-city',
    name: 'Orlando, FL',
    type: 'city',
    city: 'Orlando',
    state: 'Florida',
    stateCode: 'FL',
    lat: 28.5383,
    lon: -81.3792,
    category: 'Commercial Metro',
    subtitle: 'Central Florida Ag & Wholesale Distribution Center',
    targetQuery: 'Orlando, FL',
  },
  {
    id: 'fl-tampa-city',
    name: 'Tampa, FL',
    type: 'city',
    city: 'Tampa',
    state: 'Florida',
    stateCode: 'FL',
    lat: 27.9506,
    lon: -82.4572,
    category: 'Commercial Metro',
    subtitle: 'Gulf Coast Port & Feed Logistics Gateway',
    targetQuery: 'Tampa, FL',
  },
  {
    id: 'fl-wec-ocala',
    name: 'World Equestrian Center (Ocala)',
    type: 'ranch',
    city: 'Ocala',
    state: 'Florida',
    stateCode: 'FL',
    lat: 29.2100,
    lon: -82.2500,
    category: 'Premier Equine Complex',
    subtitle: 'Largest Equestrian Complex in USA, Thousands of Horses & Stables',
    phone: '(352) 414-7900',
    website: 'https://worldequestriancenter.com',
    targetQuery: 'Ocala, FL',
  },
  {
    id: 'fl-seminole-feed',
    name: 'Seminole Feed & Equestrian',
    type: 'feed_store',
    city: 'Ocala',
    state: 'Florida',
    stateCode: 'FL',
    lat: 29.1900,
    lon: -82.1350,
    category: 'Equine Feed Store',
    subtitle: 'Specialty Horse Feed, Himalayan Salt Blocks & Equine Nutrition',
    phone: '(352) 732-4143',
    website: 'https://seminolefeed.com',
    targetQuery: 'Ocala, FL',
  },
  {
    id: 'fl-sparr-supply',
    name: 'Sparr Building & Farm Supply',
    type: 'farm',
    city: 'Sparr',
    state: 'Florida',
    stateCode: 'FL',
    lat: 29.3500,
    lon: -82.1200,
    category: 'Commercial Farm Co-op',
    subtitle: 'Central Florida Farm Supplies, Fencing, Feed & Mineral Blocks',
    phone: '(352) 622-7063',
    targetQuery: 'Ocala, FL',
  },
  {
    id: 'fl-arcadia-cattle',
    name: 'Arcadia Cattle Auction & Ranches',
    type: 'ranch',
    city: 'Arcadia',
    state: 'Florida',
    stateCode: 'FL',
    lat: 27.2184,
    lon: -81.8601,
    category: 'Livestock Ranch',
    subtitle: 'Historic Florida Beef Cattle Country & Commercial Feed Lots',
    targetQuery: 'Arcadia, FL',
  },

  // ── Midwest & Plains Ag Belt ──
  {
    id: 'ia-desmoines-city',
    name: 'Des Moines, IA',
    type: 'city',
    city: 'Des Moines',
    state: 'Iowa',
    stateCode: 'IA',
    lat: 41.5868,
    lon: -93.6250,
    category: 'Agricultural Belt',
    subtitle: 'Corn & Swine Capital of America & Bulk Feed Logistics',
    targetQuery: 'Des Moines, IA',
  },
  {
    id: 'ne-omaha-city',
    name: 'Omaha, NE',
    type: 'city',
    city: 'Omaha',
    state: 'Nebraska',
    stateCode: 'NE',
    lat: 41.2565,
    lon: -95.9345,
    category: 'Livestock Hub',
    subtitle: 'Beef Cattle Processing, Feed Mills & Stockyards',
    targetQuery: 'Omaha, NE',
  },
  {
    id: 'mo-kc-city',
    name: 'Kansas City, MO',
    type: 'city',
    city: 'Kansas City',
    state: 'Missouri',
    stateCode: 'MO',
    lat: 39.0997,
    lon: -94.5786,
    category: 'Ag Logistics',
    subtitle: 'Midwest Grain & Livestock Board of Trade Epicenter',
    targetQuery: 'Kansas City, MO',
  },
  {
    id: 'il-chicago-city',
    name: 'Chicago, IL',
    type: 'city',
    city: 'Chicago',
    state: 'Illinois',
    stateCode: 'IL',
    lat: 41.8781,
    lon: -87.6298,
    category: 'Commercial Metro',
    subtitle: 'Midwest Rail, Logistics & Agricultural Exchange',
    targetQuery: 'Chicago, IL',
  },
  {
    id: 'ia-farmers-coop',
    name: 'Iowa Farmers Co-op Feed Mill',
    type: 'farm',
    city: 'Des Moines',
    state: 'Iowa',
    stateCode: 'IA',
    lat: 41.6000,
    lon: -93.6000,
    category: 'Feed Mill & Co-op',
    subtitle: 'Swine, Beef Cattle Minerals & Agricultural Salt Suppliers',
    targetQuery: 'Des Moines, IA',
  },

  // ── California & West Coast ──
  {
    id: 'ca-fresno-city',
    name: 'Fresno, CA',
    type: 'city',
    city: 'Fresno',
    state: 'California',
    stateCode: 'CA',
    lat: 36.7468,
    lon: -119.7726,
    category: 'Commercial Metro',
    subtitle: 'San Joaquin Valley Agricultural Epicenter & Dairy Capital',
    targetQuery: 'Fresno, CA',
  },
  {
    id: 'ca-bakersfield-city',
    name: 'Bakersfield, CA',
    type: 'city',
    city: 'Bakersfield',
    state: 'California',
    stateCode: 'CA',
    lat: 35.3733,
    lon: -119.0187,
    category: 'Commercial Metro',
    subtitle: 'Southern Central Valley Ag & Livestock Transport Hub',
    targetQuery: 'Bakersfield, CA',
  },
  {
    id: 'ca-la-city',
    name: 'Los Angeles, CA',
    type: 'city',
    city: 'Los Angeles',
    state: 'California',
    stateCode: 'CA',
    lat: 34.0522,
    lon: -118.2437,
    category: 'Commercial Metro',
    subtitle: 'Largest Western Wholesale Distribution Market',
    targetQuery: 'Los Angeles, CA',
  },
  {
    id: 'ca-valley-dairy',
    name: 'Central Valley Dairy & Feed Co.',
    type: 'farm',
    city: 'Fresno',
    state: 'California',
    stateCode: 'CA',
    lat: 36.7200,
    lon: -119.8000,
    category: 'Dairy Farm & Feed Mill',
    subtitle: 'Dairy Cattle Mineral Nutrition, Salt Licks & Alfalfa Co-op',
    targetQuery: 'Fresno, CA',
  },

  // ── Southeast & Mid-Atlantic ──
  {
    id: 'ky-lexington-city',
    name: 'Lexington, KY',
    type: 'city',
    city: 'Lexington',
    state: 'Kentucky',
    stateCode: 'KY',
    lat: 38.0406,
    lon: -84.5037,
    category: 'Equine Capital',
    subtitle: 'Bluegrass Horse Capital & Thoroughbred Breeding Belt',
    targetQuery: 'Lexington, KY',
  },
  {
    id: 'ky-bluegrass-farms',
    name: 'Bluegrass Thoroughbred Ranches',
    type: 'ranch',
    city: 'Lexington',
    state: 'Kentucky',
    stateCode: 'KY',
    lat: 38.0500,
    lon: -84.5200,
    category: 'Thoroughbred Ranch',
    subtitle: 'World-Renowned Equine Breeding, Horse Salt Licks & Nutrition',
    targetQuery: 'Lexington, KY',
  },
  {
    id: 'ga-atlanta-city',
    name: 'Atlanta, GA',
    type: 'city',
    city: 'Atlanta',
    state: 'Georgia',
    stateCode: 'GA',
    lat: 33.7490,
    lon: -84.3880,
    category: 'Commercial Metro',
    subtitle: 'Southeast Freight & Agricultural Rail Distribution Hub',
    targetQuery: 'Atlanta, GA',
  },
  {
    id: 'pa-lancaster-city',
    name: 'Lancaster, PA',
    type: 'city',
    city: 'Lancaster',
    state: 'Pennsylvania',
    stateCode: 'PA',
    lat: 40.0379,
    lon: -76.3055,
    category: 'Historic Farming',
    subtitle: 'Historic Farming Belt, Animal Feeds & Organic Co-ops',
    targetQuery: 'Lancaster, PA',
  },
];

interface InteractiveUsaMapProps {
  selectedLocations: string[];
  onToggleLocation: (location: string) => void;
  onSelectPreset: (locations: string[]) => void;
  leads?: ScoredLead[];
  onSelectLead?: (lead: ScoredLead) => void;
  activeCategory?: string;
  className?: string;
}

export default function InteractiveUsaMap({
  selectedLocations,
  onToggleLocation,
  onSelectPreset,
  leads = [],
  onSelectLead,
  activeCategory = 'Feed Store',
  className = '',
}: InteractiveUsaMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Dynamic ViewBox for State Zooming & Double-Click Navigation
  const [viewBox, setViewBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 960,
    h: 600,
  });
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [activeZoomedState, setActiveZoomedState] = useState<StateMapPath | null>(null);

  // Hover states
  const [hoveredState, setHoveredState] = useState<StateMapPath | null>(null);
  const [hoveredPoi, setHoveredPoi] = useState<AgriculturalPoi | null>(null);
  const [hoveredLead, setHoveredLead] = useState<ScoredLead | null>(null);

  // Filter layer on the map
  const [poiFilter, setPoiFilter] = useState<'all' | 'ranch' | 'feed_store' | 'livestock' | 'city'>('all');

  // Database leads automatically loaded from /api/admin/leados/market-map when mounted
  const [dbLeads, setDbLeads] = useState<AgriculturalPoi[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchMarketMapPins = async () => {
      setDbLoading(true);
      try {
        const res = await fetch('/api/admin/leados/market-map?limit=100');
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !Array.isArray(data.pins)) return;

        const converted: AgriculturalPoi[] = data.pins.map((p: any) => ({
          id: `db-${p.id || p.businessName}`,
          name: p.businessName,
          type: 'discovered' as AgriculturalPoiType,
          city: p.city || 'USA',
          state: p.region || 'USA',
          stateCode: (p.region || '').slice(0, 2).toUpperCase(),
          lat: p.latitude,
          lon: p.longitude,
          category: p.category || 'Discovered Lead',
          subtitle: p.address || `${p.city || ''}, ${p.region || ''}`,
          phone: p.phone,
          website: p.website,
          targetQuery: p.city ? `${p.city}, ${p.region || 'TX'}` : p.region || 'Texas',
        }));
        setDbLeads(converted);
      } catch {
        // Soft fail
      } finally {
        if (active) setDbLoading(false);
      }
    };

    void fetchMarketMapPins();
    return () => {
      active = false;
    };
  }, []);

  // Precomputed bounds cache for states
  const stateBoundsMap = useMemo(() => {
    const map = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; w: number; h: number }>();
    for (const state of USA_STATE_PATHS) {
      map.set(state.code, computeStateBounds(state.path));
    }
    return map;
  }, []);

  // Check if a state is currently selected
  const isStateSelected = useCallback(
    (code: string, name: string) => {
      return selectedLocations.some((loc) => {
        const l = loc.toLowerCase().trim();
        return (
          l === name.toLowerCase() ||
          l === code.toLowerCase() ||
          l.endsWith(`, ${code.toLowerCase()}`) ||
          l.includes(name.toLowerCase()) ||
          l === 'usa' ||
          l === 'united states'
        );
      });
    },
    [selectedLocations]
  );

  // Zoom into a specific state smoothly using genuine geographic bounds
  const handleZoomToState = useCallback(
    (state: StateMapPath) => {
      const vb = computeStateViewBox(state);
      setViewBox({ x: vb.x, y: vb.y, w: vb.w, h: vb.h });
      setZoomLevel(vb.zoomLevel);
      setActiveZoomedState(state);
    },
    []
  );

  // Fit current active state
  const handleFitState = useCallback(() => {
    if (activeZoomedState) {
      handleZoomToState(activeZoomedState);
    }
  }, [activeZoomedState, handleZoomToState]);

  // Reset zoom back to full USA
  const handleResetZoom = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: 960, h: 600 });
    setZoomLevel(1);
    setActiveZoomedState(null);
    setHoveredPoi(null);
    setHoveredLead(null);
  }, []);

  // Zoom In / Zoom Out with consistent small steps
  const handleZoomIn = () => {
    setViewBox((prev) => {
      const factor = 0.8;
      const nextW = Math.max(140, prev.w * factor);
      const nextH = nextW / 1.6;
      const centerX = prev.x + prev.w / 2;
      const centerY = prev.y + prev.h / 2;
      return {
        x: Math.max(-20, Math.min(980 - nextW, centerX - nextW / 2)),
        y: Math.max(-20, Math.min(620 - nextH, centerY - nextH / 2)),
        w: nextW,
        h: nextH,
      };
    });
    setZoomLevel((z) => Math.min(5.5, Number((z * 1.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setViewBox((prev) => {
      const factor = 1.25;
      const nextW = Math.min(960, prev.w * factor);
      const nextH = nextW / 1.6;
      const centerX = prev.x + prev.w / 2;
      const centerY = prev.y + prev.h / 2;

      if (nextW >= 930) {
        return { x: 0, y: 0, w: 960, h: 600 };
      }

      return {
        x: Math.max(0, Math.min(960 - nextW, centerX - nextW / 2)),
        y: Math.max(0, Math.min(600 - nextH, centerY - nextH / 2)),
        w: nextW,
        h: nextH,
      };
    });
    setZoomLevel((z) => {
      const next = z / 1.25;
      if (next <= 1.08) {
        setActiveZoomedState(null);
        return 1;
      }
      return Number(next.toFixed(2));
    });
  };

  // Double click on map canvas: deep zoom into clicked point
  const handleMapDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w;
    const clickY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h;

    if (zoomLevel >= 4.2) {
      // If already deeply zoomed, reset to full map
      handleResetZoom();
      return;
    }

    const factor = 0.55;
    const nextW = Math.max(140, viewBox.w * factor);
    const nextH = Math.max(90, viewBox.h * factor);
    setViewBox({
      x: Math.max(0, Math.min(960 - nextW, clickX - nextW / 2)),
      y: Math.max(0, Math.min(600 - nextH, clickY - nextH / 2)),
      w: nextW,
      h: nextH,
    });
    setZoomLevel((z) => z * 1.8);
  };

  // Combine curated POIs + database saved leads
  const allPois = useMemo(() => {
    const combined = [...AGRICULTURAL_POIS, ...dbLeads];
    if (poiFilter === 'all') return combined;
    return combined.filter((p) => p.type === poiFilter || (poiFilter === 'ranch' && p.type === 'discovered'));
  }, [poiFilter, dbLeads]);

  // Projected POI markers for SVG
  const projectedPois = useMemo(() => {
    return allPois
      .map((poi) => {
        const coords = projectCoordinates(poi.lat, poi.lon);
        return coords ? { poi, x: coords[0], y: coords[1] } : null;
      })
      .filter(Boolean) as Array<{ poi: AgriculturalPoi; x: number; y: number }>;
  }, [allPois]);

  // Projected Live Search Leads
  const liveLeadPins = useMemo(() => {
    return leads
      .filter((l) => typeof l.latitude === 'number' && typeof l.longitude === 'number')
      .map((lead) => {
        const coords = projectCoordinates(lead.latitude!, lead.longitude!);
        return coords ? { lead, x: coords[0], y: coords[1] } : null;
      })
      .filter(Boolean) as Array<{ lead: ScoredLead; x: number; y: number }>;
  }, [leads]);

  return (
    <div className={`bg-white text-slate-800 rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-4 sm:p-5 ${className}`}>
      {/* ── Top Header & Presets Bar ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-wide flex items-center gap-1.5">
              <span>Interactive USA Territory Vector Map</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#b86452]/10 text-[#b86452] border border-[#b86452]/30">
                50 States & Commercial Hubs
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Single-click any state to select and zoom. Double-click or use [+] to zoom into ranches, farms, and cities.
          </p>
        </div>

        {/* Quick Hub Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              onSelectPreset(['Texas', 'Houston, TX', 'Dallas, TX', 'Austin, TX', 'San Antonio, TX', 'Amarillo, TX']);
              const tx = USA_STATE_PATHS.find((s) => s.code === 'TX');
              if (tx) handleZoomToState(tx);
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#b86452] hover:bg-[#a25443] text-white transition shadow-xs cursor-pointer flex items-center gap-1"
          >
            <span>Texas All-Hubs</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Houston, TX'])}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
          >
            Houston
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Dallas, TX', 'Fort Worth, TX'])}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
          >
            Dallas/FW
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Austin, TX'])}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
          >
            Austin
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Amarillo, TX', 'Lubbock, TX'])}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
          >
            Amarillo/Ag
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectPreset(['Florida', 'Ocala, FL', 'Orlando, FL']);
              const fl = USA_STATE_PATHS.find((s) => s.code === 'FL');
              if (fl) handleZoomToState(fl);
            }}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
          >
            Florida/Ocala
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectPreset(['California', 'Fresno, CA', 'Bakersfield, CA']);
              const ca = USA_STATE_PATHS.find((s) => s.code === 'CA');
              if (ca) handleZoomToState(ca);
            }}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
          >
            California Ag
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['USA'])}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-xs cursor-pointer"
          >
            Nationwide USA
          </button>
          {selectedLocations.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectPreset([])}
              className="px-2 py-1 rounded-lg text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Layer Filter Toolbar & Zoom Status ── */}
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap text-xs">
        {/* Layer Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-500 mr-1">Show on Map:</span>
          <button
            type="button"
            onClick={() => setPoiFilter('all')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer border ${
              poiFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
            }`}
          >
            All Locations ({projectedPois.length + liveLeadPins.length})
          </button>
          <button
            type="button"
            onClick={() => setPoiFilter('ranch')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer border flex items-center gap-1 ${
              poiFilter === 'ranch'
                ? 'bg-amber-500 text-white border-amber-500 font-extrabold shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200'
            }`}
          >
            <span>🐎</span>
            <span>Ranches & Equine</span>
          </button>
          <button
            type="button"
            onClick={() => setPoiFilter('feed_store')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer border flex items-center gap-1 ${
              poiFilter === 'feed_store'
                ? 'bg-emerald-600 text-white border-emerald-600 font-extrabold shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200'
            }`}
          >
            <span>🌾</span>
            <span>Farms & Feed Stores</span>
          </button>
          <button
            type="button"
            onClick={() => setPoiFilter('livestock')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer border flex items-center gap-1 ${
              poiFilter === 'livestock'
                ? 'bg-orange-500 text-white border-orange-500 font-extrabold shadow-xs'
                : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border-orange-200'
            }`}
          >
            <span>🐂</span>
            <span>Livestock & Minerals</span>
          </button>
          <button
            type="button"
            onClick={() => setPoiFilter('city')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer border flex items-center gap-1 ${
              poiFilter === 'city'
                ? 'bg-sky-600 text-white border-sky-600 font-extrabold shadow-xs'
                : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border-sky-200'
            }`}
          >
            <span>🏢</span>
            <span>Commercial Cities</span>
          </button>
        </div>

        {/* State Zoom Breadcrumb & Reset */}
        <div className="flex items-center gap-2 ml-auto">
          {activeZoomedState ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>
                Zoomed: <strong>{activeZoomedState.name}</strong> ({zoomLevel.toFixed(1)}x)
              </span>
              <button
                type="button"
                onClick={handleResetZoom}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline font-semibold cursor-pointer ml-1"
                title="Fit full USA map"
              >
                Fit USA
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-500 italic hidden sm:inline">
              Double-click any state to zoom into cities & ranches
            </span>
          )}
        </div>
      </div>

      {/* ── Main SVG Map Canvas ── */}
      <div className="relative w-full aspect-[960/600] max-h-[520px] select-none rounded-xl overflow-hidden bg-[#FAF7F1] border border-slate-200 shadow-xs">
        {/* Floating Zoom Controls (+ / - / Reset) */}
        <div className="absolute top-3 right-3 z-30 flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-md">
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-lg transition cursor-pointer"
            title="Zoom In (Consistent 1.25x step)"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-lg transition cursor-pointer"
            title="Zoom Out (Consistent 1.25x step)"
          >
            <Minus className="w-4 h-4" />
          </button>
          {activeZoomedState && (
            <button
              type="button"
              onClick={handleFitState}
              className="p-1.5 hover:bg-indigo-50 text-indigo-700 hover:text-indigo-900 rounded-lg transition cursor-pointer"
              title={`Fit ${activeZoomedState.name} to screen`}
            >
              <Target className="w-4 h-4" />
            </button>
          )}
          <div className="w-full h-px bg-slate-200 my-0.5" />
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1.5 hover:bg-indigo-50 text-indigo-700 hover:text-indigo-900 rounded-lg transition cursor-pointer"
            title="Reset to Full USA Map"
          >
            <ArrowsOut className="w-4 h-4" />
          </button>
        </div>

        {/* Floating Instruction Badge */}
        <div className="absolute top-3 left-3 z-30 pointer-events-none bg-white/90 backdrop-blur-md border border-slate-200 px-2.5 py-1 rounded-lg text-[11px] text-slate-700 flex items-center gap-1.5 shadow-sm">
          <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>
            {activeZoomedState
              ? `Zoomed into ${activeZoomedState.name} · Click cities & ranches to target in search`
              : 'Click any state to target & zoom · Double-click to deep zoom'}
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onDoubleClick={handleMapDoubleClick}
          className="w-full h-full cursor-crosshair transition-all duration-300 ease-out"
          role="img"
          aria-label="Interactive Map of the United States"
        >
          {/* Background Grid & Visual Effects */}
          <defs>
            <pattern id="map-grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1" />
            </pattern>
            <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f59e0b" floodOpacity="0.8" />
            </filter>
            <filter id="glow-emerald" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#10b981" floodOpacity="0.8" />
            </filter>
            <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#06b6d4" floodOpacity="0.8" />
            </filter>
          </defs>
          <rect width="960" height="600" fill="url(#map-grid-pattern)" />

          {/* 50 US State SVG Outlines */}
          <g className="transition-all duration-200">
            {USA_STATE_PATHS.map((state) => {
              const selected = isStateSelected(state.code, state.name);
              const isHovered = hoveredState?.code === state.code;
              const isZoomed = activeZoomedState?.code === state.code;

              return (
                <path
                  key={state.code}
                  d={state.path}
                  onClick={() => {
                    onToggleLocation(state.name);
                    handleZoomToState(state);
                  }}
                  onMouseEnter={() => setHoveredState(state)}
                  onMouseLeave={() => setHoveredState(null)}
                  className="cursor-pointer transition-colors duration-200"
                  fill={
                    selected
                      ? '#b86452'
                      : isZoomed
                      ? '#E5DDD0'
                      : isHovered
                      ? '#DDD3C4'
                      : '#EDE6DB'
                  }
                  stroke={
                    isZoomed
                      ? '#2563eb'
                      : selected
                      ? '#8f4233'
                      : isHovered
                      ? '#a8a29e'
                      : '#D5CCBE'
                  }
                  strokeWidth={isZoomed ? '2.5' : selected ? '2' : '1'}
                />
              );
            })}
          </g>

          {/* State Code Text Labels (Fades slightly when deep zoomed to let cities shine) */}
          {zoomLevel < 3.2 &&
            USA_STATE_PATHS.map((state) => {
              const selected = isStateSelected(state.code, state.name);
              const isZoomed = activeZoomedState?.code === state.code;

              return (
                <text
                  key={`label-${state.code}`}
                  x={state.labelX}
                  y={state.labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                  className={`select-none transition-all ${
                    isZoomed
                      ? 'fill-indigo-700 font-extrabold text-[12px]'
                      : selected
                      ? 'fill-white font-extrabold text-[10px]'
                      : 'fill-slate-600 font-bold text-[9px]'
                  }`}
                >
                  {state.code}
                </text>
              );
            })}

          {/* ── Agricultural POIs (Ranches, Farms, Feed Stores, Cities) ── */}
          {projectedPois.map(({ poi, x, y }) => {
            const isHovered = hoveredPoi?.id === poi.id;
            const isCity = poi.type === 'city';
            const isRanch = poi.type === 'ranch';
            const isFeedStore = poi.type === 'feed_store';
            const isLivestock = poi.type === 'livestock';

            // Pin styling based on category
            let pinColor = '#38bdf8'; // city cyan
            let ringColor = 'rgba(56, 189, 248, 0.4)';
            if (isRanch) {
              pinColor = '#f59e0b'; // ranch gold
              ringColor = 'rgba(245, 158, 11, 0.4)';
            } else if (isFeedStore) {
              pinColor = '#10b981'; // farm/feed emerald
              ringColor = 'rgba(16, 185, 129, 0.4)';
            } else if (isLivestock) {
              pinColor = '#fb923c'; // livestock coral
              ringColor = 'rgba(251, 146, 60, 0.4)';
            } else if (poi.type === 'discovered') {
              pinColor = '#a855f7'; // discovered purple
              ringColor = 'rgba(168, 85, 247, 0.4)';
            }

            // Adjust radius inversely with zoom so pins remain proportional
            const baseR = isCity ? (zoomLevel > 1.8 ? 5 : 3.5) : zoomLevel > 1.8 ? 6 : 4;
            const r = isHovered ? baseR + 2.5 : baseR;

            return (
              <g
                key={`poi-${poi.id}`}
                transform={`translate(${x}, ${y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLocation(poi.targetQuery);
                }}
                onMouseEnter={() => setHoveredPoi(poi)}
                onMouseLeave={() => setHoveredPoi(null)}
                className="cursor-pointer group"
              >
                {/* Pulsing ring for ranches, feed stores, or hovered pins */}
                {(isHovered || isRanch || isFeedStore) && (
                  <circle
                    r={r + (zoomLevel > 2 ? 6 : 4)}
                    fill="none"
                    stroke={pinColor}
                    strokeWidth={isHovered ? 2 : 1}
                    className="animate-ping opacity-60"
                  />
                )}

                {/* Outer halo */}
                <circle r={r + 1.5} fill={ringColor} />

                {/* Core pin marker */}
                <circle
                  r={r}
                  fill={pinColor}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? '2' : '1.2'}
                  filter={isHovered ? (isRanch ? 'url(#glow-gold)' : 'url(#glow-emerald)') : undefined}
                />

                {/* Visible City / Ranch text labels when zoomed in */}
                {zoomLevel >= 1.9 && (
                  <text
                    x={r + 3}
                    y={1}
                    dominantBaseline="central"
                    className={`select-none pointer-events-none text-[8px] font-bold ${
                      isHovered
                        ? 'fill-white font-extrabold text-[9px]'
                        : isCity
                        ? 'fill-cyan-200'
                        : isRanch
                        ? 'fill-amber-300'
                        : isFeedStore
                        ? 'fill-emerald-300'
                        : 'fill-slate-300'
                    }`}
                  >
                    {poi.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Discovered Leads Overlay (Live Search Results) ── */}
          {liveLeadPins.map(({ lead, x, y }, idx) => {
            const isHovered = hoveredLead?.businessName === lead.businessName;
            const r = isHovered ? 7 : 4.5;
            return (
              <g
                key={`live-lead-${idx}-${lead.businessName}`}
                transform={`translate(${x}, ${y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLead?.(lead);
                }}
                onMouseEnter={() => setHoveredLead(lead)}
                onMouseLeave={() => setHoveredLead(null)}
                className="cursor-pointer"
              >
                <circle r={r + 5} fill="none" stroke="#ec4899" strokeWidth="1.5" className="animate-ping opacity-75" />
                <circle r={r} fill="#ec4899" stroke="#ffffff" strokeWidth="1.5" />
              </g>
            );
          })}
        </svg>

        {/* ── Floating Tooltip for Hovered Agricultural POI ── */}
        {hoveredPoi && (
          <div
            className="absolute z-40 pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3 shadow-xl text-xs max-w-[280px] animate-in fade-in zoom-in-95 duration-100 text-slate-800"
            style={{
              left: `${Math.min(78, Math.max(12, ((projectCoordinates(hoveredPoi.lat, hoveredPoi.lon)?.[0] || 480) - viewBox.x) / viewBox.w * 100))}%`,
              top: `${Math.min(72, Math.max(15, ((projectCoordinates(hoveredPoi.lat, hoveredPoi.lon)?.[1] || 300) - viewBox.y) / viewBox.h * 100))}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5 mb-1.5">
              <span className="font-bold text-slate-900 text-sm truncate">{hoveredPoi.name}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  hoveredPoi.type === 'ranch'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : hoveredPoi.type === 'feed_store'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : hoveredPoi.type === 'livestock'
                    ? 'bg-orange-100 text-orange-800 border border-orange-200'
                    : 'bg-sky-100 text-sky-800 border border-sky-200'
                }`}
              >
                {hoveredPoi.type === 'ranch'
                  ? '🐎 Ranch'
                  : hoveredPoi.type === 'feed_store'
                  ? '🌾 Feed Store'
                  : hoveredPoi.type === 'livestock'
                  ? '🐂 Livestock'
                  : '🏢 City Hub'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-snug">{hoveredPoi.subtitle}</p>
            <p className="text-[10px] text-slate-500 mt-1">
              {hoveredPoi.city}, {hoveredPoi.state} · {hoveredPoi.category}
            </p>
            {hoveredPoi.phone && (
              <p className="text-[10px] text-slate-300 mt-0.5 flex items-center gap-1">
                <Phone className="w-2.5 h-2.5 text-slate-400" />
                <span>{hoveredPoi.phone}</span>
              </p>
            )}

            <button
              type="button"
              onClick={() => onToggleLocation(hoveredPoi.targetQuery)}
              className="mt-2 w-full py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition shadow-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <Target className="w-3 h-3" />
              <span>Target {hoveredPoi.city} in Search</span>
            </button>
          </div>
        )}

        {/* ── Floating Tooltip for Hovered Live Lead ── */}
        {hoveredLead && (
          <div className="absolute z-40 pointer-events-auto bg-white/95 backdrop-blur-md border border-pink-300 rounded-xl p-3 shadow-xl text-xs max-w-[280px] top-4 right-4 text-slate-800">
            <div className="flex items-center gap-1.5 text-pink-600 font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkle weight="fill" className="w-3.5 h-3.5" />
              <span>Discovered Lead</span>
            </div>
            <p className="font-bold text-slate-900 text-sm truncate">{hoveredLead.businessName}</p>
            <p className="text-slate-600 text-[11px] mt-0.5">
              {hoveredLead.city ? `${hoveredLead.city}, ` : ''}{hoveredLead.region || 'USA'} · {hoveredLead.category}
            </p>
            {hoveredLead.phone && (
              <p className="text-slate-500 text-[10px] mt-1 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                <span>{hoveredLead.phone}</span>
              </p>
            )}
            {hoveredLead.website && (
              <a
                href={hoveredLead.website.startsWith('http') ? hoveredLead.website : `https://${hoveredLead.website}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-800 text-[10px] mt-1 truncate flex items-center gap-1"
              >
                <ArrowSquareOut className="w-3 h-3" />
                <span>{hoveredLead.website}</span>
              </a>
            )}
          </div>
        )}

        {/* ── Floating Tooltip for Hovered State (When no POI is hovered) ── */}
        {hoveredState && !hoveredPoi && !hoveredLead && (
          <div
            className="absolute z-20 pointer-events-none bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-2.5 shadow-xl text-xs max-w-[220px] text-slate-800"
            style={{
              left: `${Math.min(78, Math.max(15, (hoveredState.labelX - viewBox.x) / viewBox.w * 100))}%`,
              top: `${Math.min(72, Math.max(15, (hoveredState.labelY - viewBox.y) / viewBox.h * 100))}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1 mb-1.5">
              <span className="font-bold text-slate-900 text-sm">
                {hoveredState.name} ({hoveredState.code})
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isStateSelected(hoveredState.code, hoveredState.name)
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {isStateSelected(hoveredState.code, hoveredState.name) ? 'Selected' : 'Click to Target'}
              </span>
            </div>
            <p className="text-[10px] text-slate-600">
              <strong className="text-slate-800">Commercial Hubs:</strong> {hoveredState.hubs.join(', ')}
            </p>
            <p className="text-[9px] text-indigo-600 mt-1 italic">Click or double-click to zoom into {hoveredState.name}</p>
          </div>
        )}
      </div>

      {/* ── Bottom Targets & Pin Counter Footer ── */}
      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-600 font-semibold">Active Targets:</span>
          {selectedLocations.length === 0 ? (
            <span className="text-slate-400 italic">None selected (Click any state, city, or ranch above)</span>
          ) : (
            selectedLocations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#b86452]/10 border border-[#b86452]/30 text-[#b86452] font-semibold text-[11px]"
              >
                <span>{loc}</span>
                <button
                  type="button"
                  onClick={() => onToggleLocation(loc)}
                  className="hover:text-[#a05246] cursor-pointer ml-0.5"
                  title={`Remove ${loc}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 text-xs ml-auto">
          {dbLoading ? (
            <span className="text-slate-500 flex items-center gap-1">
              <ArrowsClockwise className="w-3 h-3 animate-spin" />
              <span>Loading registered pins...</span>
            </span>
          ) : (
            <span className="text-emerald-700 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{projectedPois.length} Ranches, Farms & Commercial Hubs</span>
            </span>
          )}
          {liveLeadPins.length > 0 && (
            <span className="text-pink-600 font-bold flex items-center gap-1">
              <Sparkle weight="fill" className="w-3 h-3" />
              <span>{liveLeadPins.length} Search Leads</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
