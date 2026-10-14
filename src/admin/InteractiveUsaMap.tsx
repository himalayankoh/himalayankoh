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
import { USA_STATE_PATHS, type StateMapPath } from './usaStatePaths';

export { USA_STATE_PATHS, type StateMapPath };

export function projectCoordinates(lat: number, lon: number): [number, number] | null {
  // Lower 48 states in Albers USA 1280 scale
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
