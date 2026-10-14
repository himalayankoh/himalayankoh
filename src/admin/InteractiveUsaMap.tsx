'use client';

import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Check,
  X,
  Buildings,
  Globe,
  Sparkle,
  ArrowsClockwise,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import type { ScoredLead } from '@/lib/leados/types';
import { US_COMMERCIAL_HUBS } from './InteractiveLocationMapPicker';

export interface StateMapPath {
  code: string;
  name: string;
  path: string;
  labelX: number;
  labelY: number;
  hubs: string[];
  region: 'South' | 'Midwest' | 'West' | 'Northeast';
}

// Full 50 States + DC in standard Albers USA 960x600 coordinate space
export const USA_STATE_PATHS: StateMapPath[] = [
  {
    code: 'WA',
    name: 'Washington',
    path: 'M141.5,41.2 L206.5,52.2 L198.8,103.5 L129.5,92.5 L120.2,74.5 L131.5,58.2 Z',
    labelX: 165,
    labelY: 72,
    hubs: ['Seattle', 'Spokane'],
    region: 'West',
  },
  {
    code: 'OR',
    name: 'Oregon',
    path: 'M129.5,92.5 L198.8,103.5 L191.2,168.2 L104.5,153.2 L112.5,122.5 L129.5,92.5 Z',
    labelX: 152,
    labelY: 130,
    hubs: ['Portland', 'Eugene'],
    region: 'West',
  },
  {
    code: 'CA',
    name: 'California',
    path: 'M104.5,153.2 L191.2,168.2 L172.5,232.5 L231.2,338.2 L185.5,362.5 L145.2,308.2 L112.5,238.2 L101.5,192.5 Z',
    labelX: 145,
    labelY: 250,
    hubs: ['Fresno', 'Bakersfield', 'Los Angeles', 'Sacramento'],
    region: 'West',
  },
  {
    code: 'ID',
    name: 'Idaho',
    path: 'M206.5,52.2 L225.2,55.5 L232.5,102.5 L268.2,122.5 L255.5,182.2 L191.2,168.2 L198.8,103.5 Z',
    labelX: 226,
    labelY: 115,
    hubs: ['Boise', 'Idaho Falls'],
    region: 'West',
  },
  {
    code: 'NV',
    name: 'Nevada',
    path: 'M191.2,168.2 L255.5,182.2 L242.5,282.5 L231.2,338.2 L172.5,232.5 Z',
    labelX: 210,
    labelY: 235,
    hubs: ['Las Vegas', 'Reno'],
    region: 'West',
  },
  {
    code: 'MT',
    name: 'Montana',
    path: 'M225.2,55.5 L372.5,74.5 L360.5,152.5 L268.2,138.2 L268.2,122.5 L232.5,102.5 Z',
    labelX: 298,
    labelY: 105,
    hubs: ['Billings', 'Bozeman', 'Missoula'],
    region: 'West',
  },
  {
    code: 'WY',
    name: 'Wyoming',
    path: 'M268.2,138.2 L360.5,152.5 L350.2,226.5 L255.5,212.5 Z',
    labelX: 308,
    labelY: 182,
    hubs: ['Cheyenne', 'Casper'],
    region: 'West',
  },
  {
    code: 'UT',
    name: 'Utah',
    path: 'M255.5,182.2 L312.5,191.2 L308.2,218.5 L300.5,288.2 L242.5,282.5 Z',
    labelX: 275,
    labelY: 235,
    hubs: ['Salt Lake City', 'Provo'],
    region: 'West',
  },
  {
    code: 'AZ',
    name: 'Arizona',
    path: 'M242.5,282.5 L300.5,288.2 L290.5,395.2 L238.2,372.5 L231.2,338.2 Z',
    labelX: 268,
    labelY: 340,
    hubs: ['Phoenix', 'Tucson'],
    region: 'West',
  },
  {
    code: 'CO',
    name: 'Colorado',
    path: 'M350.2,226.5 L452.5,238.2 L442.5,308.2 L338.2,295.2 L342.5,225.5 Z',
    labelX: 395,
    labelY: 268,
    hubs: ['Denver', 'Colorado Springs', 'Fort Collins'],
    region: 'West',
  },
  {
    code: 'NM',
    name: 'New Mexico',
    path: 'M300.5,288.2 L398.2,301.2 L388.2,408.2 L338.2,408.2 L338.2,415.5 L290.5,395.2 Z',
    labelX: 345,
    labelY: 350,
    hubs: ['Albuquerque', 'Las Cruces'],
    region: 'West',
  },
  {
    code: 'ND',
    name: 'North Dakota',
    path: 'M372.5,74.5 L478.2,85.5 L471.2,152.5 L360.5,142.5 Z',
    labelX: 425,
    labelY: 115,
    hubs: ['Fargo', 'Bismarck'],
    region: 'Midwest',
  },
  {
    code: 'SD',
    name: 'South Dakota',
    path: 'M360.5,142.5 L471.2,152.5 L462.5,218.2 L350.2,208.2 Z',
    labelX: 412,
    labelY: 180,
    hubs: ['Sioux Falls', 'Rapid City'],
    region: 'Midwest',
  },
  {
    code: 'NE',
    name: 'Nebraska',
    path: 'M350.2,208.2 L462.5,218.2 L468.2,275.2 L412.5,272.5 L342.5,262.5 Z',
    labelX: 405,
    labelY: 242,
    hubs: ['Omaha', 'Lincoln', 'Grand Island'],
    region: 'Midwest',
  },
  {
    code: 'KS',
    name: 'Kansas',
    path: 'M442.5,308.2 L548.2,315.5 L542.5,372.5 L435.2,362.5 Z',
    labelX: 490,
    labelY: 340,
    hubs: ['Wichita', 'Overland Park', 'Topeka'],
    region: 'Midwest',
  },
  {
    code: 'OK',
    name: 'Oklahoma',
    path: 'M388.2,362.5 L435.2,362.5 L542.5,372.5 L538.2,425.5 L448.2,425.5 L442.5,402.5 L388.2,402.5 Z',
    labelX: 465,
    labelY: 395,
    hubs: ['Oklahoma City', 'Tulsa'],
    region: 'South',
  },
  {
    code: 'TX',
    name: 'Texas',
    path: 'M388.2,402.5 L442.5,402.5 L448.2,425.5 L538.2,425.5 L535.2,468.2 L518.2,538.2 L448.2,568.2 L412.5,512.5 L368.2,475.2 L368.2,442.5 L388.2,442.5 Z',
    labelX: 452,
    labelY: 485,
    hubs: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'Amarillo'],
    region: 'South',
  },
  {
    code: 'MN',
    name: 'Minnesota',
    path: 'M478.2,85.5 L552.5,92.5 L545.2,175.2 L488.2,185.5 L471.2,152.5 Z',
    labelX: 512,
    labelY: 135,
    hubs: ['Minneapolis', 'St. Paul', 'Duluth'],
    region: 'Midwest',
  },
  {
    code: 'IA',
    name: 'Iowa',
    path: 'M471.2,185.5 L558.2,192.5 L552.5,255.2 L468.2,248.2 Z',
    labelX: 512,
    labelY: 222,
    hubs: ['Des Moines', 'Cedar Rapids', 'Davenport'],
    region: 'Midwest',
  },
  {
    code: 'MO',
    name: 'Missouri',
    path: 'M468.2,248.2 L552.5,255.2 L565.2,342.5 L518.2,348.2 L498.2,315.5 L468.2,315.5 Z',
    labelX: 520,
    labelY: 298,
    hubs: ['Kansas City', 'St. Louis', 'Springfield'],
    region: 'Midwest',
  },
  {
    code: 'AR',
    name: 'Arkansas',
    path: 'M538.2,372.5 L588.2,372.5 L578.2,445.2 L528.2,445.2 Z',
    labelX: 558,
    labelY: 410,
    hubs: ['Little Rock', 'Fayetteville'],
    region: 'South',
  },
  {
    code: 'LA',
    name: 'Louisiana',
    path: 'M528.2,445.2 L578.2,445.2 L588.2,502.5 L552.5,528.2 L522.5,492.5 Z',
    labelX: 552,
    labelY: 480,
    hubs: ['Baton Rouge', 'New Orleans', 'Shreveport'],
    region: 'South',
  },
  {
    code: 'WI',
    name: 'Wisconsin',
    path: 'M545.2,118.2 L598.2,125.5 L588.2,208.2 L542.5,202.5 Z',
    labelX: 570,
    labelY: 165,
    hubs: ['Milwaukee', 'Madison', 'Green Bay'],
    region: 'Midwest',
  },
  {
    code: 'IL',
    name: 'Illinois',
    path: 'M558.2,208.2 L598.2,212.5 L592.5,315.5 L565.2,332.5 L552.5,255.2 Z',
    labelX: 575,
    labelY: 265,
    hubs: ['Chicago', 'Peoria', 'Rockford'],
    region: 'Midwest',
  },
  {
    code: 'MI',
    name: 'Michigan',
    path: 'M598.2,125.5 L658.2,142.5 L648.2,228.2 L605.2,222.5 Z',
    labelX: 630,
    labelY: 182,
    hubs: ['Detroit', 'Grand Rapids', 'Lansing'],
    region: 'Midwest',
  },
  {
    code: 'IN',
    name: 'Indiana',
    path: 'M598.2,212.5 L638.2,215.5 L632.5,295.2 L598.2,302.5 Z',
    labelX: 618,
    labelY: 255,
    hubs: ['Indianapolis', 'Fort Wayne', 'Evansville'],
    region: 'Midwest',
  },
  {
    code: 'OH',
    name: 'Ohio',
    path: 'M638.2,215.5 L692.5,218.2 L685.2,288.2 L632.5,295.2 Z',
    labelX: 662,
    labelY: 252,
    hubs: ['Columbus', 'Cleveland', 'Cincinnati'],
    region: 'Midwest',
  },
  {
    code: 'KY',
    name: 'Kentucky',
    path: 'M598.2,302.5 L692.5,295.2 L678.2,342.5 L588.2,348.2 Z',
    labelX: 640,
    labelY: 322,
    hubs: ['Lexington', 'Louisville', 'Bowling Green'],
    region: 'South',
  },
  {
    code: 'TN',
    name: 'Tennessee',
    path: 'M588.2,348.2 L702.5,348.2 L688.2,388.2 L582.5,388.2 Z',
    labelX: 642,
    labelY: 368,
    hubs: ['Nashville', 'Memphis', 'Knoxville'],
    region: 'South',
  },
  {
    code: 'MS',
    name: 'Mississippi',
    path: 'M578.2,388.2 L618.2,388.2 L612.5,492.5 L578.2,492.5 Z',
    labelX: 595,
    labelY: 442,
    hubs: ['Jackson', 'Gulfport', 'Tupelo'],
    region: 'South',
  },
  {
    code: 'AL',
    name: 'Alabama',
    path: 'M618.2,388.2 L662.5,388.2 L655.2,492.5 L612.5,492.5 Z',
    labelX: 638,
    labelY: 442,
    hubs: ['Birmingham', 'Montgomery', 'Mobile'],
    region: 'South',
  },
  {
    code: 'GA',
    name: 'Georgia',
    path: 'M662.5,388.2 L718.2,392.5 L705.2,488.2 L655.2,488.2 Z',
    labelX: 685,
    labelY: 438,
    hubs: ['Atlanta', 'Augusta', 'Savannah'],
    region: 'South',
  },
  {
    code: 'FL',
    name: 'Florida',
    path: 'M655.2,488.2 L738.2,492.5 L745.2,572.5 L718.2,588.2 L705.2,525.2 Z',
    labelX: 720,
    labelY: 535,
    hubs: ['Ocala', 'Orlando', 'Tampa', 'Jacksonville', 'Miami'],
    region: 'South',
  },
  {
    code: 'SC',
    name: 'South Carolina',
    path: 'M698.2,382.5 L755.2,392.5 L738.2,438.2 L688.2,425.5 Z',
    labelX: 725,
    labelY: 412,
    hubs: ['Columbia', 'Charleston', 'Greenville'],
    region: 'South',
  },
  {
    code: 'NC',
    name: 'North Carolina',
    path: 'M678.2,342.5 L788.2,348.2 L765.2,398.2 L688.2,388.2 Z',
    labelX: 735,
    labelY: 368,
    hubs: ['Raleigh', 'Charlotte', 'Greensboro'],
    region: 'South',
  },
  {
    code: 'VA',
    name: 'Virginia',
    path: 'M678.2,295.2 L768.2,298.2 L758.2,348.2 L678.2,342.5 Z',
    labelX: 722,
    labelY: 322,
    hubs: ['Richmond', 'Virginia Beach', 'Roanoke'],
    region: 'South',
  },
  {
    code: 'WV',
    name: 'West Virginia',
    path: 'M672.5,255.2 L718.2,258.2 L708.2,308.2 L668.2,302.5 Z',
    labelX: 692,
    labelY: 280,
    hubs: ['Charleston', 'Morgantown'],
    region: 'South',
  },
  {
    code: 'MD',
    name: 'Maryland',
    path: 'M718.2,258.2 L768.2,258.2 L762.5,292.5 L728.2,292.5 Z',
    labelX: 745,
    labelY: 275,
    hubs: ['Baltimore', 'Frederick'],
    region: 'South',
  },
  {
    code: 'DE',
    name: 'Delaware',
    path: 'M765.2,258.2 L778.2,258.2 L772.5,288.2 L762.5,288.2 Z',
    labelX: 770,
    labelY: 272,
    hubs: ['Wilmington', 'Dover'],
    region: 'Northeast',
  },
  {
    code: 'PA',
    name: 'Pennsylvania',
    path: 'M692.5,212.5 L778.2,215.5 L772.5,262.5 L688.2,258.2 Z',
    labelX: 735,
    labelY: 238,
    hubs: ['Lancaster', 'Philadelphia', 'Pittsburgh'],
    region: 'Northeast',
  },
  {
    code: 'NJ',
    name: 'New Jersey',
    path: 'M772.5,215.5 L788.2,218.2 L782.5,268.2 L768.2,265.2 Z',
    labelX: 778,
    labelY: 242,
    hubs: ['Newark', 'Trenton'],
    region: 'Northeast',
  },
  {
    code: 'NY',
    name: 'New York',
    path: 'M718.2,152.5 L802.5,152.5 L795.2,222.5 L728.2,218.2 Z',
    labelX: 760,
    labelY: 185,
    hubs: ['Buffalo', 'Albany', 'Rochester', 'NYC'],
    region: 'Northeast',
  },
  {
    code: 'CT',
    name: 'Connecticut',
    path: 'M795.2,198.2 L818.2,198.2 L812.5,218.2 L792.5,218.2 Z',
    labelX: 805,
    labelY: 208,
    hubs: ['Hartford', 'New Haven'],
    region: 'Northeast',
  },
  {
    code: 'RI',
    name: 'Rhode Island',
    path: 'M818.2,198.2 L828.2,198.2 L825.2,218.2 L815.2,218.2 Z',
    labelX: 822,
    labelY: 208,
    hubs: ['Providence'],
    region: 'Northeast',
  },
  {
    code: 'MA',
    name: 'Massachusetts',
    path: 'M795.2,178.2 L842.5,178.2 L838.2,202.5 L792.5,202.5 Z',
    labelX: 818,
    labelY: 190,
    hubs: ['Boston', 'Worcester'],
    region: 'Northeast',
  },
  {
    code: 'VT',
    name: 'Vermont',
    path: 'M788.2,132.5 L808.2,132.5 L802.5,182.5 L785.2,182.5 Z',
    labelX: 796,
    labelY: 158,
    hubs: ['Burlington', 'Montpelier'],
    region: 'Northeast',
  },
  {
    code: 'NH',
    name: 'New Hampshire',
    path: 'M805.2,128.2 L822.5,128.2 L818.2,182.5 L802.5,182.5 Z',
    labelX: 812,
    labelY: 155,
    hubs: ['Manchester', 'Concord'],
    region: 'Northeast',
  },
  {
    code: 'ME',
    name: 'Maine',
    path: 'M818.2,78.2 L862.5,108.2 L838.2,168.2 L808.2,135.2 Z',
    labelX: 835,
    labelY: 122,
    hubs: ['Portland', 'Bangor'],
    region: 'Northeast',
  },
  {
    code: 'AK',
    name: 'Alaska',
    path: 'M62.5,458.2 L148.2,462.5 L128.2,548.2 L52.5,528.2 Z',
    labelX: 98,
    labelY: 502,
    hubs: ['Anchorage', 'Fairbanks'],
    region: 'West',
  },
  {
    code: 'HI',
    name: 'Hawaii',
    path: 'M188.2,508.2 L228.2,508.2 L218.2,538.2 L178.2,538.2 Z',
    labelX: 202,
    labelY: 522,
    hubs: ['Honolulu'],
    region: 'West',
  },
];

export function projectCoordinates(lat: number, lon: number): [number, number] | null {
  if (lat < 24 || lat > 50 || lon < -125 || lon > -66) return null;
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

  const scale = 880;
  const x = 480 + scale * rho * Math.sin(theta);
  const y = 320 - scale * (rho0 - rho * Math.cos(theta));
  return [Math.max(20, Math.min(940, x)), Math.max(20, Math.min(580, y))];
}

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
  const [hoveredState, setHoveredState] = useState<StateMapPath | null>(null);
  const [hoveredLead, setHoveredLead] = useState<ScoredLead | null>(null);

  // Check if a state is currently selected
  const isStateSelected = (code: string, name: string) => {
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
  };

  // Group leads by coordinates for map pin overlay
  const leadPins = useMemo(() => {
    return leads
      .filter((l) => typeof l.latitude === 'number' && typeof l.longitude === 'number')
      .map((lead) => {
        const coords = projectCoordinates(lead.latitude!, lead.longitude!);
        return coords ? { lead, x: coords[0], y: coords[1] } : null;
      })
      .filter(Boolean) as Array<{ lead: ScoredLead; x: number; y: number }>;
  }, [leads]);

  return (
    <div className={`bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-4 sm:p-6 ${className}`}>
      {/* Header & Quick Presets Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
              Target Territory Map (All 50 US States)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#b86452]/20 text-[#e08b79] border border-[#b86452]/40">
              Interactive Multi-State
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Click states on the map to add/remove from your search. Select multi-metro hubs or nationwide coverage.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onSelectPreset(['Texas', 'Houston, TX', 'Dallas, TX', 'Austin, TX', 'San Antonio, TX'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#b86452] hover:bg-[#a25443] text-white transition shadow-sm cursor-pointer"
          >
            Texas All-Hubs
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Houston, TX'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            Houston
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Dallas, TX'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            Dallas
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Austin, TX'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            Austin
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['San Antonio, TX'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            San Antonio
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Florida', 'Ocala, FL', 'Orlando, FL'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            Florida
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['California', 'Fresno, CA', 'Los Angeles, CA'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            California
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['Iowa', 'Nebraska', 'Kansas'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            Midwest Belt
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset(['USA'])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm cursor-pointer"
          >
            Nationwide USA
          </button>
          {selectedLocations.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectPreset([])}
              className="px-2 py-1 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full aspect-[960/600] max-h-[480px] select-none">
        <svg
          viewBox="0 0 960 600"
          className="w-full h-full drop-shadow-md"
          role="img"
          aria-label="Map of the United States"
        >
          {/* Background grid lines for high-tech aesthetic */}
          <defs>
            <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            </pattern>
            <radialGradient id="texas-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#b86452" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#b86452" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="960" height="600" fill="url(#map-grid)" />

          {/* State Paths */}
          <g className="transition-all duration-200">
            {USA_STATE_PATHS.map((state) => {
              const selected = isStateSelected(state.code, state.name);
              const isHovered = hoveredState?.code === state.code;

              return (
                <path
                  key={state.code}
                  d={state.path}
                  onClick={() => onToggleLocation(state.name)}
                  onMouseEnter={() => setHoveredState(state)}
                  onMouseLeave={() => setHoveredState(null)}
                  className="cursor-pointer transition-colors duration-150"
                  fill={
                    selected
                      ? '#b86452'
                      : isHovered
                      ? '#334155'
                      : '#1e293b'
                  }
                  stroke={selected ? '#e08b79' : isHovered ? '#64748b' : '#334155'}
                  strokeWidth={selected ? '2' : '1'}
                />
              );
            })}
          </g>

          {/* State Text Labels */}
          {USA_STATE_PATHS.map((state) => {
            const selected = isStateSelected(state.code, state.name);
            return (
              <text
                key={`label-${state.code}`}
                x={state.labelX}
                y={state.labelY}
                textAnchor="middle"
                dominantBaseline="central"
                pointerEvents="none"
                className={`text-[10px] font-bold select-none transition-all ${
                  selected ? 'fill-white font-extrabold' : 'fill-slate-400'
                }`}
              >
                {state.code}
              </text>
            );
          })}

          {/* Lead Pin Overlay */}
          {leadPins.map(({ lead, x, y }, idx) => {
            const isLeadHovered = hoveredLead?.businessName === lead.businessName;
            return (
              <g
                key={`pin-${idx}-${lead.businessName}`}
                transform={`translate(${x}, ${y})`}
                onClick={() => onSelectLead?.(lead)}
                onMouseEnter={() => setHoveredLead(lead)}
                onMouseLeave={() => setHoveredLead(null)}
                className="cursor-pointer"
              >
                {/* Pulsing ring */}
                <circle
                  r={isLeadHovered ? 12 : 8}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  className="animate-ping opacity-75"
                />
                {/* Pin center */}
                <circle
                  r={isLeadHovered ? 6 : 4}
                  fill={isLeadHovered ? '#34d399' : '#10b981'}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip for Hovered State */}
        {hoveredState && !hoveredLead && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs max-w-[240px]"
            style={{
              left: `${Math.min(75, Math.max(15, (hoveredState.labelX / 960) * 100))}%`,
              top: `${Math.min(70, Math.max(15, (hoveredState.labelY / 600) * 100))}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-2">
              <span className="font-bold text-white text-sm">
                {hoveredState.name} ({hoveredState.code})
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  isStateSelected(hoveredState.code, hoveredState.name)
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {isStateSelected(hoveredState.code, hoveredState.name) ? 'Selected' : 'Click to Target'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              <strong className="text-slate-300">Key Ag Hubs:</strong> {hoveredState.hubs.join(', ')}
            </p>
          </div>
        )}

        {/* Floating Tooltip for Hovered Lead Pin */}
        {hoveredLead && (
          <div className="absolute z-30 pointer-events-none bg-slate-950/95 backdrop-blur-md border border-emerald-500/50 rounded-xl p-3 shadow-2xl text-xs max-w-[280px] top-4 right-4">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">
              <MapPin className="w-3.5 h-3.5" />
              Discovered Lead
            </div>
            <p className="font-bold text-white text-sm leading-tight truncate">
              {hoveredLead.businessName}
            </p>
            <p className="text-slate-300 text-[11px] mt-1">
              {hoveredLead.city ? `${hoveredLead.city}, ` : ''}{hoveredLead.region || 'USA'} · {hoveredLead.category}
            </p>
            {hoveredLead.phone && (
              <p className="text-slate-400 text-[10px] mt-0.5">Phone: {hoveredLead.phone}</p>
            )}
            {hoveredLead.website && (
              <p className="text-indigo-400 text-[10px] mt-0.5 truncate">{hoveredLead.website}</p>
            )}
          </div>
        )}
      </div>

      {/* Selected Locations Chips Bar */}
      <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 font-semibold">Active Targets:</span>
          {selectedLocations.length === 0 ? (
            <span className="text-slate-500 italic">None selected (Click any state or preset above)</span>
          ) : (
            selectedLocations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#b86452]/20 border border-[#b86452]/50 text-[#e08b79] font-medium"
              >
                {loc}
                <button
                  type="button"
                  onClick={() => onToggleLocation(loc)}
                  className="hover:text-white cursor-pointer ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        {leadPins.length > 0 && (
          <span className="text-emerald-400 font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {leadPins.length} Geocoded Pins on Map
          </span>
        )}
      </div>
    </div>
  );
}
