'use client';

import React, { useState, useMemo } from 'react';
import {
  Globe,
  MapPin,
  Check,
  X,
  MagnifyingGlass,
  Sparkle,
  CheckCircle,
  Plus,
  Storefront,
} from '@phosphor-icons/react';

export interface StateTile {
  code: string;
  name: string;
  region: 'South' | 'Midwest' | 'West' | 'Northeast';
  row: number;
  col: number;
  topHub: string;
}

// 50 US States + DC positioned on an 8x12 cartographic grid
export const US_STATES: StateTile[] = [
  // Row 0
  { code: 'AK', name: 'Alaska', region: 'West', row: 0, col: 0, topHub: 'Anchorage' },
  { code: 'ME', name: 'Maine', region: 'Northeast', row: 0, col: 11, topHub: 'Portland' },

  // Row 1
  { code: 'WA', name: 'Washington', region: 'West', row: 1, col: 1, topHub: 'Seattle' },
  { code: 'ID', name: 'Idaho', region: 'West', row: 1, col: 2, topHub: 'Boise' },
  { code: 'MT', name: 'Montana', region: 'West', row: 1, col: 3, topHub: 'Billings' },
  { code: 'ND', name: 'North Dakota', region: 'Midwest', row: 1, col: 4, topHub: 'Fargo' },
  { code: 'MN', name: 'Minnesota', region: 'Midwest', row: 1, col: 5, topHub: 'Minneapolis' },
  { code: 'IL', name: 'Illinois', region: 'Midwest', row: 1, col: 6, topHub: 'Chicago' },
  { code: 'WI', name: 'Wisconsin', region: 'Midwest', row: 1, col: 7, topHub: 'Milwaukee' },
  { code: 'MI', name: 'Michigan', region: 'Midwest', row: 1, col: 8, topHub: 'Detroit' },
  { code: 'NY', name: 'New York', region: 'Northeast', row: 1, col: 9, topHub: 'Buffalo / NYC' },
  { code: 'VT', name: 'Vermont', region: 'Northeast', row: 1, col: 10, topHub: 'Burlington' },
  { code: 'NH', name: 'New Hampshire', region: 'Northeast', row: 1, col: 11, topHub: 'Manchester' },

  // Row 2
  { code: 'OR', name: 'Oregon', region: 'West', row: 2, col: 1, topHub: 'Portland' },
  { code: 'NV', name: 'Nevada', region: 'West', row: 2, col: 2, topHub: 'Las Vegas' },
  { code: 'WY', name: 'Wyoming', region: 'West', row: 2, col: 3, topHub: 'Cheyenne' },
  { code: 'SD', name: 'South Dakota', region: 'Midwest', row: 2, col: 4, topHub: 'Sioux Falls' },
  { code: 'IA', name: 'Iowa', region: 'Midwest', row: 2, col: 5, topHub: 'Des Moines' },
  { code: 'IN', name: 'Indiana', region: 'Midwest', row: 2, col: 6, topHub: 'Indianapolis' },
  { code: 'OH', name: 'Ohio', region: 'Midwest', row: 2, col: 7, topHub: 'Columbus' },
  { code: 'PA', name: 'Pennsylvania', region: 'Northeast', row: 2, col: 8, topHub: 'Lancaster / Philly' },
  { code: 'NJ', name: 'New Jersey', region: 'Northeast', row: 2, col: 9, topHub: 'Newark' },
  { code: 'CT', name: 'Connecticut', region: 'Northeast', row: 2, col: 10, topHub: 'Hartford' },
  { code: 'MA', name: 'Massachusetts', region: 'Northeast', row: 2, col: 11, topHub: 'Boston' },

  // Row 3
  { code: 'CA', name: 'California', region: 'West', row: 3, col: 1, topHub: 'Central Valley / LA' },
  { code: 'UT', name: 'Utah', region: 'West', row: 3, col: 2, topHub: 'Salt Lake City' },
  { code: 'CO', name: 'Colorado', region: 'West', row: 3, col: 3, topHub: 'Denver' },
  { code: 'NE', name: 'Nebraska', region: 'Midwest', row: 3, col: 4, topHub: 'Omaha' },
  { code: 'MO', name: 'Missouri', region: 'Midwest', row: 3, col: 5, topHub: 'Kansas City' },
  { code: 'KY', name: 'Kentucky', region: 'South', row: 3, col: 6, topHub: 'Lexington' },
  { code: 'WV', name: 'West Virginia', region: 'South', row: 3, col: 7, topHub: 'Charleston' },
  { code: 'VA', name: 'Virginia', region: 'South', row: 3, col: 8, topHub: 'Richmond' },
  { code: 'MD', name: 'Maryland', region: 'South', row: 3, col: 9, topHub: 'Baltimore' },
  { code: 'DE', name: 'Delaware', region: 'Northeast', row: 3, col: 10, topHub: 'Wilmington' },
  { code: 'RI', name: 'Rhode Island', region: 'Northeast', row: 3, col: 11, topHub: 'Providence' },

  // Row 4
  { code: 'AZ', name: 'Arizona', region: 'West', row: 4, col: 2, topHub: 'Phoenix' },
  { code: 'NM', name: 'New Mexico', region: 'West', row: 4, col: 3, topHub: 'Albuquerque' },
  { code: 'KS', name: 'Kansas', region: 'Midwest', row: 4, col: 4, topHub: 'Wichita' },
  { code: 'AR', name: 'Arkansas', region: 'South', row: 4, col: 5, topHub: 'Little Rock' },
  { code: 'TN', name: 'Tennessee', region: 'South', row: 4, col: 6, topHub: 'Nashville' },
  { code: 'NC', name: 'North Carolina', region: 'South', row: 4, col: 7, topHub: 'Raleigh / Charlotte' },
  { code: 'SC', name: 'South Carolina', region: 'South', row: 4, col: 8, topHub: 'Columbia' },
  { code: 'DC', name: 'Washington D.C.', region: 'South', row: 4, col: 9, topHub: 'District of Columbia' },

  // Row 5
  { code: 'OK', name: 'Oklahoma', region: 'South', row: 5, col: 4, topHub: 'Oklahoma City' },
  { code: 'LA', name: 'Louisiana', region: 'South', row: 5, col: 5, topHub: 'Baton Rouge' },
  { code: 'MS', name: 'Mississippi', region: 'South', row: 5, col: 6, topHub: 'Jackson' },
  { code: 'AL', name: 'Alabama', region: 'South', row: 5, col: 7, topHub: 'Birmingham' },
  { code: 'GA', name: 'Georgia', region: 'South', row: 5, col: 8, topHub: 'Atlanta' },

  // Row 6
  { code: 'HI', name: 'Hawaii', region: 'West', row: 6, col: 0, topHub: 'Honolulu' },
  { code: 'TX', name: 'Texas', region: 'South', row: 6, col: 4, topHub: 'Houston / Dallas / Austin' },
  { code: 'FL', name: 'Florida', region: 'South', row: 6, col: 9, topHub: 'Ocala / Tampa / Orlando' },
];

export interface CommercialHub {
  city: string;
  state: string;
  label: string;
  badge: string;
  category: string;
}

export const US_COMMERCIAL_HUBS: CommercialHub[] = [
  // Texas Commercial Centers
  { city: 'Houston', state: 'TX', label: 'Houston, TX', badge: 'Major Port Hub', category: 'Texas' },
  { city: 'Dallas', state: 'TX', label: 'Dallas, TX', badge: 'Distribution Epicenter', category: 'Texas' },
  { city: 'Austin', state: 'TX', label: 'Austin, TX', badge: 'High Growth Corridor', category: 'Texas' },
  { city: 'San Antonio', state: 'TX', label: 'San Antonio, TX', badge: 'South TX Hub', category: 'Texas' },
  { city: 'Fort Worth', state: 'TX', label: 'Fort Worth, TX', badge: 'Stockyards & Ag', category: 'Texas' },
  { city: 'Amarillo', state: 'TX', label: 'Amarillo, TX', badge: 'Cattle & Feed Hub', category: 'Texas' },
  { city: 'Lubbock', state: 'TX', label: 'Lubbock, TX', badge: 'West TX Ag Hub', category: 'Texas' },

  // Florida Equine & Agriculture
  { city: 'Ocala', state: 'FL', label: 'Ocala, FL', badge: 'Horse Capital of the World', category: 'Florida' },
  { city: 'Orlando', state: 'FL', label: 'Orlando, FL', badge: 'Central Florida Distro', category: 'Florida' },
  { city: 'Tampa', state: 'FL', label: 'Tampa, FL', badge: 'Gulf Port & Feed Distro', category: 'Florida' },
  { city: 'Jacksonville', state: 'FL', label: 'Jacksonville, FL', badge: 'Atlantic Shipping', category: 'Florida' },
  { city: 'Miami', state: 'FL', label: 'Miami, FL', badge: 'Wholesale Import / Export', category: 'Florida' },

  // Midwest Agricultural Belt
  { city: 'Des Moines', state: 'IA', label: 'Des Moines, IA', badge: 'Corn & Swine Capital', category: 'Midwest' },
  { city: 'Omaha', state: 'NE', label: 'Omaha, NE', badge: 'Beef Processing Hub', category: 'Midwest' },
  { city: 'Kansas City', state: 'MO', label: 'Kansas City, MO', badge: 'Grain & Stock Exchange', category: 'Midwest' },
  { city: 'Chicago', state: 'IL', label: 'Chicago, IL', badge: 'Midwest Rail & Distro', category: 'Midwest' },
  { city: 'Indianapolis', state: 'IN', label: 'Indianapolis, IN', badge: 'Crossroads of America', category: 'Midwest' },
  { city: 'Minneapolis', state: 'MN', label: 'Minneapolis, MN', badge: 'Northern Ag Hub', category: 'Midwest' },

  // West & Southwest
  { city: 'Fresno', state: 'CA', label: 'Fresno, CA', badge: 'Central Valley Ag', category: 'West' },
  { city: 'Bakersfield', state: 'CA', label: 'Bakersfield, CA', badge: 'Southern Valley Distro', category: 'West' },
  { city: 'Los Angeles', state: 'CA', label: 'Los Angeles, CA', badge: 'Largest Metro Market', category: 'West' },
  { city: 'Phoenix', state: 'AZ', label: 'Phoenix, AZ', badge: 'Southwest Trade Hub', category: 'West' },
  { city: 'Denver', state: 'CO', label: 'Denver, CO', badge: 'Rocky Mountain Hub', category: 'West' },
  { city: 'Salt Lake City', state: 'UT', label: 'Salt Lake City, UT', badge: 'Great Basin Distro', category: 'West' },
  { city: 'Boise', state: 'ID', label: 'Boise, ID', badge: 'Northwest Ag & Seed', category: 'West' },

  // Southeast & Mid-Atlantic
  { city: 'Atlanta', state: 'GA', label: 'Atlanta, GA', badge: 'Southeast Freight Hub', category: 'Southeast' },
  { city: 'Lexington', state: 'KY', label: 'Lexington, KY', badge: 'Bluegrass Horse Country', category: 'Southeast' },
  { city: 'Nashville', state: 'TN', label: 'Nashville, TN', badge: 'Mid-South Transport', category: 'Southeast' },
  { city: 'Charlotte', state: 'NC', label: 'Charlotte, NC', badge: 'Carolina Distribution', category: 'Southeast' },
  { city: 'Lancaster', state: 'PA', label: 'Lancaster, PA', badge: 'Historic Farming Belt', category: 'Northeast' },
];

export interface GlobalMarket {
  country: string;
  flag: string;
  region: string;
  cities: string[];
  description: string;
}

export const GLOBAL_MARKETS: GlobalMarket[] = [
  {
    country: 'Canada',
    flag: '🇨🇦',
    region: 'North America',
    cities: ['Calgary, AB', 'Edmonton, AB', 'Toronto, ON', 'Vancouver, BC', 'Montreal, QC'],
    description: 'Major agricultural feed stores, cattle ranches, and retail salt distributors in Alberta and Ontario.',
  },
  {
    country: 'Mexico',
    flag: '🇲🇽',
    region: 'North America',
    cities: ['Monterrey, NL', 'Guadalajara, JAL', 'Mexico City', 'Chihuahua, CHIH', 'Hermosillo, SON'],
    description: 'Northern ranching states and industrial livestock mineral supply centers.',
  },
  {
    country: 'United Kingdom',
    flag: '🇬🇧',
    region: 'Europe',
    cities: ['London', 'Birmingham', 'Manchester', 'Yorkshire', 'Glasgow'],
    description: 'Specialty equine salt lick suppliers, farm merchants, and pet retail chains.',
  },
  {
    country: 'Germany',
    flag: '🇩🇪',
    region: 'Europe',
    cities: ['Hamburg', 'Frankfurt', 'Munich', 'Cologne', 'Hannover'],
    description: 'High-volume European port trade, equestrian centers, and feed distributors.',
  },
  {
    country: 'Netherlands',
    flag: '🇳🇱',
    region: 'Europe',
    cities: ['Rotterdam', 'Amsterdam', 'Utrecht'],
    description: 'Gateway to Europe with deep wholesale logistics and bulk salt import hubs.',
  },
  {
    country: 'United Arab Emirates',
    flag: '🇦🇪',
    region: 'Middle East',
    cities: ['Dubai', 'Abu Dhabi', 'Sharjah'],
    description: 'Thriving equestrian clubs, camel racing farms, and wholesale re-export distributors.',
  },
  {
    country: 'Saudi Arabia',
    flag: '🇸🇦',
    region: 'Middle East',
    cities: ['Riyadh', 'Jeddah', 'Dammam'],
    description: 'Large commercial dairy farms, livestock complexes, and major veterinary supply companies.',
  },
  {
    country: 'Australia',
    flag: '🇦🇺',
    region: 'Asia-Pacific',
    cities: ['Melbourne, VIC', 'Sydney, NSW', 'Brisbane, QLD', 'Perth, WA', 'Adelaide, SA'],
    description: 'Vast cattle stations, sheep runs, and premier horse breeding operations.',
  },
];

export const REGIONAL_PRESETS = [
  {
    id: 'tx_triangle',
    label: 'Texas Triangle',
    icon: '🤠',
    description: 'Houston, Dallas, Austin, San Antonio',
    locations: ['Houston, TX', 'Dallas, TX', 'Austin, TX', 'San Antonio, TX'],
  },
  {
    id: 'florida_equine',
    label: 'Florida Equine Belt',
    icon: '🐎',
    description: 'Ocala, Orlando, Tampa, Miami',
    locations: ['Ocala, FL', 'Orlando, FL', 'Tampa, FL', 'Miami, FL'],
  },
  {
    id: 'midwest_feed',
    label: 'Midwest Ag & Feed',
    icon: '🌾',
    description: 'Des Moines, Omaha, Kansas City, Chicago',
    locations: ['Des Moines, IA', 'Omaha, NE', 'Kansas City, MO', 'Chicago, IL'],
  },
  {
    id: 'california_valley',
    label: 'California Valley',
    icon: '☀️',
    description: 'Fresno, Bakersfield, Los Angeles',
    locations: ['Fresno, CA', 'Bakersfield, CA', 'Los Angeles, CA'],
  },
  {
    id: 'canada_wholesale',
    label: 'Canada Livestock Hubs',
    icon: '🇨🇦',
    description: 'Calgary, Edmonton, Toronto',
    locations: ['Calgary, AB', 'Edmonton, AB', 'Toronto, ON'],
  },
];

interface InteractiveLocationMapPickerProps {
  locations: string[];
  onChange: (locations: string[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function InteractiveLocationMapPicker({
  locations,
  onChange,
  isOpen,
  onClose,
}: InteractiveLocationMapPickerProps) {
  const [activeTab, setActiveTab] = useState<'usa' | 'hubs' | 'global'>('usa');
  const [searchQuery, setSearchQuery] = useState('');
  const [tempLocations, setTempLocations] = useState<string[]>(locations);
  const [hoveredState, setHoveredState] = useState<StateTile | null>(null);

  // Sync temp locations when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTempLocations(locations);
    }
  }, [isOpen, locations]);

  const isLocationSelected = (loc: string): boolean => {
    const norm = loc.toLowerCase().trim();
    return tempLocations.some((t) => {
      const tNorm = t.toLowerCase().trim();
      return tNorm === norm || tNorm.startsWith(norm) || norm.startsWith(tNorm);
    });
  };

  const isStateSelected = (stateCode: string, stateName: string): boolean => {
    const codeNorm = stateCode.toLowerCase();
    const nameNorm = stateName.toLowerCase();
    return tempLocations.some((t) => {
      const tNorm = t.toLowerCase().trim();
      return (
        tNorm === codeNorm ||
        tNorm === nameNorm ||
        tNorm.endsWith(`, ${codeNorm}`) ||
        tNorm.endsWith(` ${codeNorm}`) ||
        tNorm.includes(nameNorm)
      );
    });
  };

  const toggleLocation = (loc: string) => {
    setTempLocations((prev) => {
      const norm = loc.toLowerCase().trim();
      const existingIdx = prev.findIndex((t) => {
        const tNorm = t.toLowerCase().trim();
        return tNorm === norm || tNorm.startsWith(norm) || norm.startsWith(tNorm);
      });
      if (existingIdx >= 0) {
        return prev.filter((_, i) => i !== existingIdx);
      } else {
        return [...prev, loc];
      }
    });
  };

  const toggleState = (state: StateTile) => {
    const isSel = isStateSelected(state.code, state.name);
    if (isSel) {
      setTempLocations((prev) =>
        prev.filter((t) => {
          const tNorm = t.toLowerCase().trim();
          return (
            tNorm !== state.code.toLowerCase() &&
            tNorm !== state.name.toLowerCase() &&
            !tNorm.endsWith(`, ${state.code.toLowerCase()}`) &&
            !tNorm.includes(state.name.toLowerCase())
          );
        })
      );
    } else {
      setTempLocations((prev) => [...prev, `${state.name} (${state.code})`]);
    }
  };

  const applyPreset = (presetLocations: string[]) => {
    setTempLocations((prev) => {
      const combined = new Set([...prev]);
      for (const loc of presetLocations) {
        combined.add(loc);
      }
      return Array.from(combined);
    });
  };

  const handleApply = () => {
    onChange(tempLocations);
    onClose();
  };

  const filteredHubs = useMemo(() => {
    if (!searchQuery.trim()) return US_COMMERCIAL_HUBS;
    const q = searchQuery.toLowerCase();
    return US_COMMERCIAL_HUBS.filter(
      (h) =>
        h.city.toLowerCase().includes(q) ||
        h.state.toLowerCase().includes(q) ||
        h.label.toLowerCase().includes(q) ||
        h.badge.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const filteredGlobal = useMemo(() => {
    if (!searchQuery.trim()) return GLOBAL_MARKETS;
    const q = searchQuery.toLowerCase();
    return GLOBAL_MARKETS.filter(
      (m) =>
        m.country.toLowerCase().includes(q) ||
        m.region.toLowerCase().includes(q) ||
        m.cities.some((c) => c.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Interactive Geographic Market Studio
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {tempLocations.length} {tempLocations.length === 1 ? 'Area Selected' : 'Areas Selected'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Visually pick target US states, metro wholesale hubs, or international distribution territories.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Tab Bar */}
        <div className="p-3 sm:p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('usa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'usa'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🇺🇸</span>
              <span>USA State Map</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hubs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'hubs'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏙️</span>
              <span>Commercial Hubs</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('global')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'global'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🌍</span>
              <span>Global Markets</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <MagnifyingGlass className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search state, city, country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Quick Regional Presets Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkle className="w-3 h-3 text-amber-500" />
                High-Volume Wholesale Trade Presets
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {REGIONAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.locations)}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-indigo-50 hover:border-indigo-300 text-left transition cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 group-hover:text-indigo-700">
                    <span>{preset.icon}</span>
                    <span className="truncate">{preset.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* TAB 1: USA INTERACTIVE MAP GRID */}
          {activeTab === 'usa' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-950">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  <span>
                    Click any state to toggle targeting. Active states appear highlighted in indigo with a checkmark.
                  </span>
                </div>
                {hoveredState && (
                  <div className="font-semibold text-indigo-700 text-xs bg-white px-2.5 py-1 rounded-md border border-indigo-200 shadow-2xs whitespace-nowrap">
                    {hoveredState.name} ({hoveredState.code}) &bull; Key Hub: {hoveredState.topHub}
                  </div>
                )}
              </div>

              {/* Cartographic Grid Container */}
              <div className="bg-slate-50/50 p-3 sm:p-5 rounded-2xl border border-slate-200 overflow-x-auto">
                <div className="min-w-[620px] max-w-[760px] mx-auto">
                  <div
                    className="grid gap-1.5 sm:gap-2"
                    style={{
                      gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                      gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
                    }}
                  >
                    {US_STATES.map((st) => {
                      const selected = isStateSelected(st.code, st.name);
                      return (
                        <button
                          key={st.code}
                          type="button"
                          onClick={() => toggleState(st)}
                          onMouseEnter={() => setHoveredState(st)}
                          onMouseLeave={() => setHoveredState(null)}
                          style={{
                            gridRowStart: st.row + 1,
                            gridColumnStart: st.col + 1,
                          }}
                          className={`h-11 sm:h-13 rounded-xl border flex flex-col items-center justify-center p-1 transition cursor-pointer select-none relative group ${
                            selected
                              ? 'bg-[#584de3] border-[#483ecb] text-white shadow-sm ring-2 ring-indigo-300'
                              : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-400 hover:bg-indigo-50/70 hover:shadow-xs'
                          }`}
                          title={`${st.name} (${st.code}) - Hub: ${st.topHub}`}
                        >
                          <span className="text-xs sm:text-sm font-extrabold leading-none">
                            {st.code}
                          </span>
                          <span
                            className={`text-[9px] truncate max-w-full leading-tight mt-0.5 ${
                              selected ? 'text-indigo-100' : 'text-slate-400 group-hover:text-indigo-600'
                            }`}
                          >
                            {st.name}
                          </span>
                          {selected && (
                            <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 flex items-center justify-center">
                              <Check weight="bold" className="w-2 h-2 text-slate-900" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Texas & Key Livestock State Quick Highlights */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-slate-600">
                  <Storefront className="w-3.5 h-3.5 text-indigo-600" />
                  Direct City &amp; Trade Corridor Shortcuts
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {US_COMMERCIAL_HUBS.slice(0, 12).map((hub) => {
                    const sel = isLocationSelected(hub.label);
                    return (
                      <button
                        key={hub.label}
                        type="button"
                        onClick={() => toggleLocation(hub.label)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                          sel
                            ? 'bg-indigo-600 border-indigo-700 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <MapPin className={`w-3 h-3 ${sel ? 'text-white' : 'text-indigo-500'}`} />
                        <span>{hub.label}</span>
                        {sel && <Check weight="bold" className="w-2.5 h-2.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMMERCIAL HUBS */}
          {activeTab === 'hubs' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {filteredHubs.map((hub) => {
                  const selected = isLocationSelected(hub.label);
                  return (
                    <button
                      key={hub.label}
                      type="button"
                      onClick={() => toggleLocation(hub.label)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between group ${
                        selected
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-950 ring-1 ring-indigo-400'
                          : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-600'}`} />
                          <span className="truncate">{hub.label}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {hub.badge}
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition ${
                          selected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 group-hover:border-indigo-400'
                        }`}
                      >
                        {selected && <Check weight="bold" className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {filteredHubs.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No US commercial hubs matched &quot;{searchQuery}&quot;. You can add it as a custom area below.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GLOBAL / INTERNATIONAL MARKETS */}
          {activeTab === 'global' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredGlobal.map((market) => (
                  <div
                    key={market.country}
                    className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs hover:border-indigo-200 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{market.flag}</span>
                        <div>
                          <h4 className="font-bold text-xs text-slate-900">{market.country}</h4>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold block">
                            {market.region}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleLocation(market.country)}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                          isLocationSelected(market.country)
                            ? 'bg-indigo-600 text-white border-indigo-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50'
                        }`}
                      >
                        {isLocationSelected(market.country) ? 'Country Selected' : '+ Select Country'}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {market.description}
                    </p>

                    {/* City Chips */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] font-bold text-slate-400 mr-1">Major Hubs:</span>
                      {market.cities.map((city) => {
                        const sel = isLocationSelected(city);
                        return (
                          <button
                            key={city}
                            type="button"
                            onClick={() => toggleLocation(city)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                              sel
                                ? 'bg-indigo-600 border-indigo-700 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span>{city}</span>
                            {sel && <Check weight="bold" className="w-2.5 h-2.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Search Fallback (Add whatever user typed) */}
          {searchQuery.trim() && !isLocationSelected(searchQuery.trim()) && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-700 font-medium">
                Add custom area: <strong className="text-slate-900">&quot;{searchQuery.trim()}&quot;</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  toggleLocation(searchQuery.trim());
                  setSearchQuery('');
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add &quot;{searchQuery.trim()}&quot;
              </button>
            </div>
          )}
        </div>

        {/* Active Selection Drawer / Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/90 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle weight="fill" className="w-4 h-4 text-emerald-600" />
              <span>
                Active Selection ({tempLocations.length}):
              </span>
            </div>
            {tempLocations.length > 0 && (
              <button
                type="button"
                onClick={() => setTempLocations([])}
                className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Chips list */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {tempLocations.length > 0 ? (
              tempLocations.map((loc, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-semibold shadow-2xs"
                >
                  <MapPin className="w-3 h-3 text-indigo-600 flex-shrink-0" />
                  <span>{loc}</span>
                  <button
                    type="button"
                    onClick={() => setTempLocations((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer ml-0.5"
                    title={`Remove ${loc}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">
                No locations selected yet. Click any state or city above to add to your plan.
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Apply {tempLocations.length} {tempLocations.length === 1 ? 'Location' : 'Locations'} to Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
