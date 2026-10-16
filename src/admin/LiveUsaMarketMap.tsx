'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Globe,
  MapPin,
  MagnifyingGlass,
  Sparkle,
  CheckCircle,
  X,
  Storefront,
  Phone,
  EnvelopeSimple,
  ArrowSquareOut,
  ArrowsClockwise,
  Sliders,
  Buildings,
  ShieldCheck,
  FacebookLogo,
  InstagramLogo,
  CaretDown,
  TrendUp,
  Target,
  Plus,
  Minus,
  ArrowsOut,
  ArrowsIn,
  Info,
  ClockCountdown,
} from '@phosphor-icons/react';
import { USA_STATE_PATHS, computeStateViewBox, type StateMapPath } from './usaStatePaths';
import { projectCoordinates } from './InteractiveUsaMap';
import {
  MARKET_CATEGORIES,
  STATE_METRO_HUBS,
  AUTONOMOUS_PRIORITY_STATES,
  type MarketCategoryKey,
  type StateMarketIntelligence,
  type MarketResearchJob,
} from '@/lib/leados/market-scheduler';
import { getAccessToken } from '../services/wordpressAdminAuth';

export interface MarketMapLeadPin {
  id: string;
  businessName: string;
  category?: string | null;
  marketCategory: MarketCategoryKey;
  latitude: number;
  longitude: number;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  opportunityScore?: number | null;
  status: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  opportunitySignals?: string[];
  isNew?: boolean;
  qualityStage?: string | null;
  createdAt?: string;
}

export type OpportunityMode =
  | 'all'
  | 'qualified'
  | 'new'
  | 'contactable'
  | 'unresearched';

export type MapViewMode = 'clusters' | 'heatmap';

interface LiveUsaMarketMapProps {
  onSelectLeadInLibrary?: (search: string) => void;
  className?: string;
}

export default function LiveUsaMarketMap({
  onSelectLeadInLibrary,
  className = '',
}: LiveUsaMarketMapProps) {
  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stateMetrics, setStateMetrics] = useState<Record<string, StateMarketIntelligence>>({});
  const [pins, setPins] = useState<MarketMapLeadPin[]>([]);
  const [totalLeadsCount, setTotalLeadsCount] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toISOString());

  // Job History & Scheduler status
  const [jobs, setJobs] = useState<MarketResearchJob[]>([]);
  const [scheduler, setScheduler] = useState<{
    activeJobs: number;
    queuedJobs: number;
    completedJobs: number;
    failedJobs: number;
    lastSuccessfulScan: string | null;
    nextScheduledRun: string | null;
  } | null>(null);
  const [showJobsModal, setShowJobsModal] = useState(false);
  const [lastSuccessfulScanTime, setLastSuccessfulScanTime] = useState<string | null>(null);

  // Filter & Mode states
  const [activeCategory, setActiveCategory] = useState<'all' | MarketCategoryKey>('all');
  const [opportunityMode, setOpportunityMode] = useState<OpportunityMode>('all');
  const [viewMode, setViewMode] = useState<MapViewMode>('clusters');
  const [selectedStateCode, setSelectedStateCode] = useState<string | null>(null);
  const [hoveredStateCode, setHoveredStateCode] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<MarketMapLeadPin | null>(null);
  const [stateSearchQuery, setStateSearchQuery] = useState('');

  // Autonomous scan state
  const [scanningState, setScanningState] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Zoom & Pan transformation state
  const [isExpanded, setIsExpanded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewBox, setViewBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 960,
    h: 600,
  });

  // Fetch initial market map data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/admin/leados/market-map', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load market map data');
      }
      const data = await res.json();
      setStateMetrics(data.stateMetrics || {});
      setPins(data.pins || []);
      setTotalLeadsCount(data.totalLeadsCount || 0);
      setLastUpdated(data.lastUpdated || new Date().toISOString());
      if (data.lastSuccessfulScanTime) setLastSuccessfulScanTime(data.lastSuccessfulScanTime);
      if (data.jobs) setJobs(data.jobs);
      if (data.scheduler) setScheduler(data.scheduler);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Market map data request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Priority 6: Bounded incremental live map updates (catches up on background discoveries)
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const token = getAccessToken();
        const sinceParam = lastSuccessfulScanTime ? `?since=${encodeURIComponent(lastSuccessfulScanTime)}` : '';
        const res = await fetch(`/api/admin/leados/market-map${sinceParam}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.lastSuccessfulScanTime) {
          setLastSuccessfulScanTime(data.lastSuccessfulScanTime);
        }
        if (data.hasUpdates) {
          if (data.stateMetrics) setStateMetrics(data.stateMetrics);
          if (data.pins) setPins(data.pins);
          if (data.totalLeadsCount) setTotalLeadsCount(data.totalLeadsCount);
          if (data.jobs) setJobs(data.jobs);
          if (data.scheduler) setScheduler(data.scheduler);
          setLastUpdated(data.lastUpdated || new Date().toISOString());
        }
      } catch {
        // Quiet background polling
      }
    }, 20000);

    return () => clearInterval(timer);
  }, [lastSuccessfulScanTime]);

  // Handle autonomous background scan trigger
  const handleRunScan = async (stateCode: string, catKey?: MarketCategoryKey) => {
    setScanningState(stateCode);
    setScanMessage(`Scanning ${stateCode} for ${catKey || 'agriculture'} commercial leads...`);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/admin/leados/market-map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'scan_state',
          stateCode,
          categoryKey: catKey || (activeCategory === 'all' ? 'agriculture' : activeCategory),
          limit: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Autonomous scan failed');

      const s = data.scanResult;
      setScanMessage(
        `Scan complete! Discovered ${s.leadsDiscovered} leads in ${s.metroScanned}, saved ${s.newLeadsSaved} qualified records.`
      );
      if (data.jobs) setJobs(data.jobs);
      if (data.scheduler) setScheduler(data.scheduler);
      // Refresh map metrics and pins
      await fetchData();
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Autonomous scan error');
    } finally {
      setScanningState(null);
    }
  };

  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; vbX: number; vbY: number }>({ x: 0, y: 0, vbX: 0, vbY: 0 });

  // Zoom to a state bounds using actual geographic coordinates
  const handleZoomToState = useCallback((state: StateMapPath) => {
    setSelectedStateCode(state.code);
    setSelectedPin(null);

    const vb = computeStateViewBox(state);
    setViewBox({ x: vb.x, y: vb.y, w: vb.w, h: vb.h });
    setZoomLevel(vb.zoomLevel);
  }, []);

  // Fit current selected state
  const handleFitState = useCallback(() => {
    if (!selectedStateCode) return;
    const st = USA_STATE_PATHS.find((s) => s.code === selectedStateCode);
    if (st) handleZoomToState(st);
  }, [selectedStateCode, handleZoomToState]);

  // Zoom progressively toward a city or geographic coordinate
  const handleZoomToCity = useCallback((lat: number, lon: number) => {
    const coords = projectCoordinates(lat, lon);
    if (!coords) return;
    const [cx, cy] = coords;

    setViewBox((prev) => {
      // Step zoom in progressively (factor ~0.72)
      const factor = 0.72;
      const nextW = Math.max(160, prev.w * factor);
      const nextH = nextW / 1.6;
      return {
        x: Math.max(-20, Math.min(980 - nextW, cx - nextW / 2)),
        y: Math.max(-20, Math.min(620 - nextH, cy - nextH / 2)),
        w: nextW,
        h: nextH,
      };
    });
    setZoomLevel((prev) => Math.min(5.5, Number((prev * 1.35).toFixed(2))));
  }, []);

  // Expand cluster gradually without selecting arbitrary lead
  const handleClusterClick = useCallback((cluster: { x: number; y: number; pins: MarketMapLeadPin[] }) => {
    setViewBox((prev) => {
      const factor = 0.75; // gentle step
      const nextW = Math.max(140, prev.w * factor);
      const nextH = nextW / 1.6;
      return {
        x: Math.max(-20, Math.min(980 - nextW, cluster.x - nextW / 2)),
        y: Math.max(-20, Math.min(620 - nextH, cluster.y - nextH / 2)),
        w: nextW,
        h: nextH,
      };
    });
    setZoomLevel((prev) => Math.min(5.5, Number((prev * 1.33).toFixed(2))));
  }, []);

  // Open lead details without unexpectedly changing zoom
  const handlePinClick = useCallback((pin: MarketMapLeadPin) => {
    setSelectedPin(pin);
  }, []);

  // Small, consistent Zoom In
  const handleZoomIn = useCallback(() => {
    setViewBox((prev) => {
      const factor = 0.8; // 1.25x zoom step
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
    setZoomLevel((prev) => Math.min(5.5, Number((prev * 1.25).toFixed(2))));
  }, []);

  // Small, consistent Zoom Out (does NOT immediately snap back to full USA)
  const handleZoomOut = useCallback(() => {
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
    setZoomLevel((prev) => {
      const next = prev / 1.25;
      return next <= 1.08 ? 1 : Number(next.toFixed(2));
    });
  }, []);

  // Reset zoom to full USA
  const handleResetZoom = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: 960, h: 600 });
    setZoomLevel(1);
    setSelectedStateCode(null);
    setSelectedPin(null);
  }, []);

  // Mouse pan handling
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
  }, [viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    const dx = (e.clientX - dragStartRef.current.x) * scaleX;
    const dy = (e.clientY - dragStartRef.current.y) * scaleY;
    setViewBox((prev) => ({
      ...prev,
      x: Math.max(-40, Math.min(1000 - prev.w, dragStartRef.current.vbX - dx)),
      y: Math.max(-40, Math.min(640 - prev.h, dragStartRef.current.vbY - dy)),
    }));
  }, [viewBox]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Touch pan handling
  const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      isDraggingRef.current = true;
      dragStartRef.current = { x: touch.clientX, y: touch.clientY, vbX: viewBox.x, vbY: viewBox.y };
    }
  }, [viewBox]);

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current || !svgRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    const dx = (touch.clientX - dragStartRef.current.x) * scaleX;
    const dy = (touch.clientY - dragStartRef.current.y) * scaleY;
    setViewBox((prev) => ({
      ...prev,
      x: Math.max(-40, Math.min(1000 - prev.w, dragStartRef.current.vbX - dx)),
      y: Math.max(-40, Math.min(640 - prev.h, dragStartRef.current.vbY - dy)),
    }));
  }, [viewBox]);

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Smooth mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w;
    const mouseY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h;

    const zoomFactor = e.deltaY < 0 ? 0.88 : 1.14;
    const nextW = Math.max(140, Math.min(960, viewBox.w * zoomFactor));
    const nextH = nextW / 1.6;

    if (nextW >= 940 && zoomFactor > 1) {
      handleResetZoom();
      return;
    }

    const ratio = nextW / viewBox.w;
    const nextX = mouseX - (mouseX - viewBox.x) * ratio;
    const nextY = mouseY - (mouseY - viewBox.y) * ratio;

    setViewBox({
      x: Math.max(-20, Math.min(980 - nextW, nextX)),
      y: Math.max(-20, Math.min(620 - nextH, nextY)),
      w: nextW,
      h: nextH,
    });
    setZoomLevel(Number((960 / nextW).toFixed(2)));
  }, [viewBox, handleResetZoom]);

  // Filter pins based on category, state, and opportunity mode
  const filteredPins = useMemo(() => {
    return pins.filter((pin) => {
      // Category filter
      if (activeCategory !== 'all' && pin.marketCategory !== activeCategory) {
        return false;
      }

      // State filter
      if (selectedStateCode && pin.region !== selectedStateCode) {
        return false;
      }

      // Opportunity mode filter
      if (opportunityMode === 'qualified') {
        const isQualified =
          pin.status === 'qualified' ||
          (typeof pin.opportunityScore === 'number' && pin.opportunityScore >= 60);
        if (!isQualified) return false;
      } else if (opportunityMode === 'contactable') {
        if (!pin.phone && !pin.email && !pin.website) return false;
      }

      return true;
    });
  }, [pins, activeCategory, selectedStateCode, opportunityMode]);

  // Spatial Hierarchical Clustering
  // Project points and cluster nearby pins based on current zoom level
  const clusteredPins = useMemo(() => {
    const projected = filteredPins
      .map((pin) => {
        const coords = projectCoordinates(pin.latitude, pin.longitude);
        if (!coords) return null;
        return {
          pin,
          x: coords[0],
          y: coords[1],
        };
      })
      .filter((p): p is { pin: MarketMapLeadPin; x: number; y: number } => Boolean(p));

    // When zoomed out, cluster radius is larger; when zoomed in, it shrinks
    const clusterDistance = zoomLevel > 2 ? 15 : zoomLevel > 1.5 ? 25 : 38;

    const clusters: Array<{
      id: string;
      x: number;
      y: number;
      pins: MarketMapLeadPin[];
      dominantCategory: MarketCategoryKey;
    }> = [];

    for (const item of projected) {
      let matchedCluster = clusters.find((c) => {
        const dx = c.x - item.x;
        const dy = c.y - item.y;
        return Math.sqrt(dx * dx + dy * dy) <= clusterDistance;
      });

      if (matchedCluster) {
        matchedCluster.pins.push(item.pin);
        // Weighted average coordinate
        const count = matchedCluster.pins.length;
        matchedCluster.x = (matchedCluster.x * (count - 1) + item.x) / count;
        matchedCluster.y = (matchedCluster.y * (count - 1) + item.y) / count;
      } else {
        clusters.push({
          id: `cluster-${item.pin.id}`,
          x: item.x,
          y: item.y,
          pins: [item.pin],
          dominantCategory: item.pin.marketCategory,
        });
      }
    }

    return clusters;
  }, [filteredPins, zoomLevel]);

  // Overall Market Metrics across all loaded leads
  const overallMetrics = useMemo(() => {
    let qualifiedCount = 0;
    let contactableCount = 0;
    let statesScanned = 0;

    for (const s of Object.values(stateMetrics)) {
      if (s.discoveredCount > 0) statesScanned++;
      qualifiedCount += s.qualifiedCount;
      contactableCount += s.contactableCount;
    }

    return {
      totalDiscovered: totalLeadsCount,
      qualifiedCount,
      contactableCount,
      statesScanned,
    };
  }, [stateMetrics, totalLeadsCount]);

  // Currently focused state intelligence data
  const focusedState = useMemo(() => {
    const code = selectedStateCode || hoveredStateCode;
    if (!code || !stateMetrics[code]) return null;
    return stateMetrics[code];
  }, [selectedStateCode, hoveredStateCode, stateMetrics]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── Top Bar Controls: Compact, professional command strip ── */}
      <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          
          {/* Segment 1: Market Category Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Category:</span>
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer shadow-2xs ${
                activeCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              All Segments
            </button>

            {(Object.keys(MARKET_CATEGORIES) as MarketCategoryKey[]).map((key) => {
              const cat = MARKET_CATEGORIES[key];
              const isActive = activeCategory === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveCategory(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer shadow-2xs ${
                    isActive
                      ? key === 'agriculture'
                        ? 'bg-emerald-600 text-white'
                        : key === 'salt_wholesale'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-amber-600 text-white'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      key === 'agriculture'
                        ? 'bg-emerald-400'
                        : key === 'salt_wholesale'
                        ? 'bg-indigo-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Segment 2: Quick State Search & Autonomous Scan */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* State Search Dropdown */}
            <div className="relative">
              <select
                value={selectedStateCode || ''}
                onChange={(e) => {
                  const code = e.target.value;
                  if (!code) {
                    handleResetZoom();
                  } else {
                    const st = USA_STATE_PATHS.find((s) => s.code === code);
                    if (st) handleZoomToState(st);
                  }
                }}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
              >
                <option value="">🇺🇸 All 50 US States</option>
                {USA_STATE_PATHS.map((s) => {
                  const m = stateMetrics[s.code];
                  const count = m ? m.discoveredCount : 0;
                  return (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code}) {count > 0 ? `• ${count} leads` : '• Not Scanned'}
                    </option>
                  );
                })}
              </select>
              <CaretDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>

            {/* Autonomous Scan Trigger */}
            <button
              type="button"
              disabled={Boolean(scanningState)}
              onClick={() => handleRunScan(selectedStateCode || 'TX')}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
              title="Run autonomous background research scan"
            >
              {scanningState ? (
                <ArrowsClockwise className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkle weight="fill" className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>{scanningState ? `Scanning ${scanningState}...` : `Run Scan (${selectedStateCode || 'TX'})`}</span>
            </button>

            {/* Research Jobs Button */}
            <button
              type="button"
              onClick={() => setShowJobsModal(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="View autonomous background research job queue & history"
            >
              <ClockCountdown className="w-3.5 h-3.5 text-indigo-600" />
              <span>Jobs ({jobs.length})</span>
            </button>
          </div>

        </div>

        {/* Sub-bar: Modes, Metrics & Last Update */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-100 text-xs">
          
          {/* Opportunity Modes */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Show:</span>
            {[
              { id: 'all', label: 'All Discovered' },
              { id: 'qualified', label: 'Qualified Buyers' },
              { id: 'contactable', label: 'Contactable' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setOpportunityMode(m.id as OpportunityMode)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                  opportunityMode === m.id
                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}

            {/* View Mode Switcher (Clusters vs Heatmap) */}
            <div className="ml-2 pl-2 border-l border-slate-200 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode('clusters')}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                  viewMode === 'clusters'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Clusters
              </button>
              <button
                type="button"
                onClick={() => setViewMode('heatmap')}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                  viewMode === 'heatmap'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Heatmap
              </button>
            </div>
          </div>

          {/* Real Metrics Pill Deck */}
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Storefront className="w-3.5 h-3.5 text-indigo-600" />
              <span><strong>{overallMetrics.totalDiscovered}</strong> Total Leads</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700">
              <CheckCircle weight="fill" className="w-3.5 h-3.5 text-emerald-500" />
              <span><strong>{overallMetrics.qualifiedCount}</strong> Qualified</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700">
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span><strong>{overallMetrics.statesScanned} / 51</strong> States Scanned</span>
            </div>
            {lastSuccessfulScanTime && (
              <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                <ClockCountdown className="w-3 h-3 text-indigo-500" />
                <span>Last Scan: <strong>{new Date(lastSuccessfulScanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
              </div>
            )}
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="text-slate-400 hover:text-slate-700 p-0.5 transition cursor-pointer"
              title="Refresh Market Data"
            >
              <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </div>

        {/* Scan Message / Toast */}
        {scanMessage && (
          <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkle weight="fill" className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              {scanMessage}
            </span>
            <button
              type="button"
              onClick={() => setScanMessage(null)}
              className="text-indigo-400 hover:text-indigo-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Main Map Workspace: Compact (420-450px desktop / 340-380px mobile) with Fullscreen Expansion ── */}
      <div
        id="live-usa-market-map-container"
        data-testid="market-map-container"
        className={`relative w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg flex transition-all duration-300 ${
          isExpanded
            ? 'h-[75vh] min-h-[560px]'
            : 'h-[340px] sm:h-[380px] md:h-[430px] lg:h-[450px]'
        }`}
      >
        {/* Floating Zoom & Control Bar */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1 bg-slate-800/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-md">
          <button
            type="button"
            id="map-zoom-in-button"
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
            title="Zoom In (Consistent 1.25x step)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            id="map-zoom-out-button"
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
            title="Zoom Out (Consistent 1.25x step)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          {selectedStateCode && (
            <button
              type="button"
              id="map-fit-state-button"
              onClick={handleFitState}
              className="p-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 transition cursor-pointer border border-indigo-700/60"
              title={`Fit ${selectedStateCode} to Screen`}
            >
              <Target className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            id="map-reset-usa-button"
            onClick={handleResetZoom}
            className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
            title="Reset to Full USA Map"
          >
            <Globe className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            id="map-expand-fullscreen-toggle"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 transition cursor-pointer border-t border-slate-700"
            title={isExpanded ? 'Collapse to Compact View (450px)' : 'Expand Fullscreen Map View'}
          >
            {isExpanded ? <ArrowsIn className="w-3.5 h-3.5 text-amber-300" /> : <ArrowsOut className="w-3.5 h-3.5 text-slate-300" />}
          </button>
          <div className="text-[8px] font-mono text-center text-slate-400 py-0.5 border-t border-slate-700">
            {zoomLevel.toFixed(1)}x
          </div>
        </div>

        {/* Legend / Overlay Badge */}
        <div className="absolute bottom-3 left-3 z-20 bg-slate-800/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700 text-[10px] text-slate-300 space-y-0.5 shadow-md hidden sm:block">
          <div className="font-bold text-slate-100 flex items-center gap-1.5 text-[11px]">
            <Globe className="w-3 h-3 text-indigo-400" />
            <span>US Market Opportunity Layer</span>
          </div>
          <div className="flex items-center gap-2.5 pt-0.5 text-[9px]">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Agriculture & Livestock</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>Salt & Wholesalers</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Spas & Wellness</span>
            </div>
          </div>
        </div>

        {/* SVG Interactive Canvas */}
        <div className="w-full h-full flex items-center justify-center p-1 sm:p-2 relative">
          <svg
            ref={svgRef}
            id="live-usa-market-map-svg"
            data-testid="market-map-svg"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            className={`w-full h-full ${
              isExpanded
                ? 'max-h-[75vh]'
                : 'max-h-[330px] sm:max-h-[370px] md:max-h-[420px] lg:max-h-[440px]'
            } select-none transition-all duration-300 ${
              zoomLevel > 1.05 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
            }`}
            style={{ filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))' }}
          >
            <defs>
              {/* Gradient defs for density heatmaps */}
              <linearGradient id="heatHigh" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="heatMed" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="heatLow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
            </defs>

            {/* 1. All 51 US State Polygons */}
            <g className="states-layer">
              {USA_STATE_PATHS.map((state) => {
                const metric = stateMetrics[state.code];
                const leadCount = metric ? metric.discoveredCount : 0;
                const isSelected = selectedStateCode === state.code;
                const isHovered = hoveredStateCode === state.code;

                // Color calculation based on viewMode
                let fillColor = '#1e293b'; // Default dark slate
                let strokeColor = '#334155';
                let strokeWidth = '0.75';

                if (viewMode === 'heatmap') {
                  if (leadCount > 15) {
                    fillColor = 'url(#heatHigh)';
                    strokeColor = '#34d399';
                  } else if (leadCount > 5) {
                    fillColor = 'url(#heatMed)';
                    strokeColor = '#818cf8';
                  } else if (leadCount > 0) {
                    fillColor = 'url(#heatLow)';
                    strokeColor = '#38bdf8';
                  } else {
                    fillColor = '#0f172a';
                    strokeColor = '#1e293b';
                  }
                } else {
                  // Clusters view
                  if (isSelected) {
                    fillColor = '#312e81';
                    strokeColor = '#818cf8';
                    strokeWidth = '1.5';
                  } else if (isHovered) {
                    fillColor = '#1e1b4b';
                    strokeColor = '#6366f1';
                    strokeWidth = '1.2';
                  } else if (leadCount > 0) {
                    fillColor = '#1e293b';
                    strokeColor = '#475569';
                  }
                }

                return (
                  <path
                    key={state.code}
                    d={state.path}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    className="transition-colors duration-150 cursor-pointer"
                    onMouseEnter={() => setHoveredStateCode(state.code)}
                    onMouseLeave={() => setHoveredStateCode(null)}
                    onClick={() => handleZoomToState(state)}
                  >
                    <title>{`${state.name} (${state.code}): ${leadCount > 0 ? `${leadCount} Discovered Leads` : 'Not Yet Scanned'}`}</title>
                  </path>
                );
              })}
            </g>

            {/* 2. State Labels */}
            <g className="labels-layer pointer-events-none">
              {USA_STATE_PATHS.map((state) => {
                const metric = stateMetrics[state.code];
                const count = metric ? metric.discoveredCount : 0;
                return (
                  <g key={`lbl-${state.code}`}>
                    <text
                      x={state.labelX}
                      y={state.labelY}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize={zoomLevel > 2 ? 10 : 8}
                      fontWeight="bold"
                      className="select-none"
                    >
                      {state.code}
                    </text>
                    {count > 0 && zoomLevel > 1.2 && (
                      <text
                        x={state.labelX}
                        y={state.labelY + 8}
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize={zoomLevel > 2 ? 8 : 6}
                        fontWeight="semibold"
                      >
                        {count}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* 3. Clustered Business Markers (when in clusters view mode) */}
            {viewMode === 'clusters' && (
              <g className="clusters-layer">
                {clusteredPins.map((cluster) => {
                  const count = cluster.pins.length;
                  const isSingle = count === 1;
                  const singleLead = isSingle ? cluster.pins[0] : null;

                  // Determine pin color
                  const catColor =
                    cluster.dominantCategory === 'agriculture'
                      ? '#10b981'
                      : cluster.dominantCategory === 'salt_wholesale'
                      ? '#6366f1'
                      : '#f59e0b';

                  if (isSingle && singleLead) {
                    const isSelected = selectedPin?.id === singleLead.id;
                    const isNew = Boolean(singleLead.isNew);
                    return (
                      <g
                        key={cluster.id}
                        transform={`translate(${cluster.x}, ${cluster.y})`}
                        className="cursor-pointer group"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPin(singleLead);
                        }}
                      >
                        {/* Outer pulse */}
                        <circle
                          r={isSelected ? 10 : isNew ? 8.5 : 7}
                          fill={catColor}
                          opacity={isNew ? 0.45 : 0.3}
                          className={isNew ? 'animate-pulse' : undefined}
                        />
                        {/* Subtle discovery ring for newly discovered businesses */}
                        {isNew && (
                          <circle
                            r={10.5}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="0.8"
                            strokeDasharray="2 2"
                            opacity={0.85}
                          />
                        )}
                        {/* Marker Core */}
                        <circle
                          r={isSelected ? 6 : 4.5}
                          fill={catColor}
                          stroke="#ffffff"
                          strokeWidth="1.2"
                        />
                      </g>
                    );
                  }

                  // Cluster bubble
                  const bubbleRadius = Math.min(22, 10 + count * 1.5);
                  return (
                    <g
                      key={cluster.id}
                      transform={`translate(${cluster.x}, ${cluster.y})`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClusterClick(cluster);
                      }}
                    >
                      <circle
                        r={bubbleRadius + 4}
                        fill={catColor}
                        opacity={0.25}
                        className="group-hover:scale-110 transition-transform"
                      />
                      <circle
                        r={bubbleRadius}
                        fill={catColor}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        textAnchor="middle"
                        dy="3.5"
                        fill="#ffffff"
                        fontSize="9"
                        fontWeight="bold"
                        className="select-none"
                      >
                        {count}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {/* ── Slide-Over Sidebar: State Intelligence or Selected Lead Details ── */}
        {(focusedState || selectedPin) && (
          <div className="absolute top-3 right-3 bottom-3 w-80 lg:w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-4 text-slate-200 z-30 flex flex-col justify-between overflow-y-auto no-scrollbar animate-in slide-in-from-right-4 duration-200">
            
            {/* Case A: Selected Business Lead Details */}
            {selectedPin ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div className="space-y-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedPin.marketCategory === 'agriculture'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                          : selectedPin.marketCategory === 'salt_wholesale'
                          ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-800'
                          : 'bg-amber-950/80 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {MARKET_CATEGORIES[selectedPin.marketCategory]?.label || selectedPin.category}
                    </span>
                    <h3 className="text-base font-bold text-white line-clamp-2">
                      {selectedPin.businessName}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPin(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Score & Qualification Pill */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">Opportunity Score</div>
                    <div className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" />
                      <span>{selectedPin.opportunityScore || 75}/100</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">Lead Status</div>
                    <div className="text-sm font-bold text-indigo-400 capitalize">
                      {selectedPin.status}
                    </div>
                  </div>
                </div>

                {/* Location & Address */}
                <div className="space-y-1.5 text-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Location & Contact
                  </div>
                  {selectedPin.address && (
                    <div className="flex items-start gap-2 text-slate-300">
                      <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>{selectedPin.address}</span>
                    </div>
                  )}
                  {selectedPin.phone && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <Phone className="w-4 h-4 text-indigo-400 shrink-0" />
                      <a href={`tel:${selectedPin.phone}`} className="hover:text-indigo-300 underline">
                        {selectedPin.phone}
                      </a>
                    </div>
                  )}
                  {selectedPin.email && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <EnvelopeSimple className="w-4 h-4 text-indigo-400 shrink-0" />
                      <a href={`mailto:${selectedPin.email}`} className="hover:text-indigo-300 underline">
                        {selectedPin.email}
                      </a>
                    </div>
                  )}
                  {selectedPin.website && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <ArrowSquareOut className="w-4 h-4 text-indigo-400 shrink-0" />
                      <a
                        href={selectedPin.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-indigo-300 truncate max-w-[220px]"
                      >
                        {selectedPin.website}
                      </a>
                    </div>
                  )}
                </div>

                {/* Signals / Evidence */}
                {selectedPin.opportunitySignals && selectedPin.opportunitySignals.length > 0 && (
                  <div className="space-y-1 text-xs">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Commercial Fit Evidence
                    </div>
                    <ul className="space-y-1 text-slate-300 text-[11px]">
                      {selectedPin.opportunitySignals.slice(0, 3).map((sig, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{sig}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  {onSelectLeadInLibrary && (
                    <button
                      type="button"
                      onClick={() => onSelectLeadInLibrary(selectedPin.businessName)}
                      className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Storefront className="w-3.5 h-3.5" />
                      <span>View in Lead Library & CRM</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {selectedPin.website && (
                      <a
                        href={selectedPin.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-center flex items-center justify-center gap-1"
                      >
                        <ArrowSquareOut className="w-3.5 h-3.5" /> Website
                      </a>
                    )}
                    {selectedPin.phone && (
                      <a
                        href={`tel:${selectedPin.phone}`}
                        className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-center flex items-center justify-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : focusedState ? (
              /* Case B: State Market Intelligence Overview */
              <div className="space-y-4">
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div>
                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                      {focusedState.region} Region • {focusedState.code}
                    </div>
                    <h3 className="text-lg font-bold text-white">{focusedState.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStateCode(null);
                      setHoveredStateCode(null);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* State Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">Discovered Leads</div>
                    <div className="text-base font-bold text-white">
                      {focusedState.discoveredCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">Qualified Buyers</div>
                    <div className="text-base font-bold text-emerald-400">
                      {focusedState.qualifiedCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">Contactable</div>
                    <div className="text-base font-bold text-indigo-400">
                      {focusedState.contactableCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">Coverage Status</div>
                    <div
                      className={`text-xs font-bold capitalize mt-0.5 ${
                        focusedState.coverageStatus === 'not_scanned'
                          ? 'text-slate-400'
                          : focusedState.coverageStatus === 'partial'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {focusedState.coverageStatus === 'not_scanned'
                        ? 'Not Yet Scanned'
                        : focusedState.coverageStatus === 'partial'
                        ? `Partial (${focusedState.scannedHubs?.length || 0}/${focusedState.totalHubs || 1} Hubs)`
                        : `Comprehensive (${focusedState.totalHubs}/${focusedState.totalHubs} Hubs)`}
                    </div>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="space-y-2 text-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Commercial Segments Breakdown
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Agriculture & Ranches
                      </span>
                      <strong className="text-white">{focusedState.categoryBreakdown.agriculture}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        Salt & Wholesalers
                      </span>
                      <strong className="text-white">{focusedState.categoryBreakdown.salt_wholesale}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Spas, Wellness & Caves
                      </span>
                      <strong className="text-white">{focusedState.categoryBreakdown.wellness}</strong>
                    </div>
                  </div>
                </div>

                {/* Top Metropolitan Commercial Hubs */}
                {focusedState.topHubs.length > 0 && (
                  <div className="space-y-1.5 text-xs">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Target Commercial Hubs
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {focusedState.topHubs.map((hub) => {
                        const hubs = STATE_METRO_HUBS[focusedState.code] || [];
                        const metro = hubs.find(
                          (h) => h.name.toLowerCase().includes(hub.toLowerCase()) || hub.toLowerCase().includes(h.name.toLowerCase())
                        );
                        return (
                          <button
                            key={hub}
                            type="button"
                            onClick={() => {
                              if (metro) {
                                handleZoomToCity(metro.lat, metro.lon);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-950/80 hover:border-indigo-600 text-slate-300 hover:text-indigo-200 border border-slate-700 text-[11px] font-medium transition cursor-pointer flex items-center gap-1"
                            title={`Zoom to ${hub}`}
                          >
                            <MapPin className="w-3 h-3 text-indigo-400" />
                            <span>{hub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action: Run Autonomous Scan for This State */}
                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    disabled={Boolean(scanningState)}
                    onClick={() => handleRunScan(focusedState.code)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {scanningState === focusedState.code ? (
                      <ArrowsClockwise className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkle weight="fill" className="w-4 h-4 text-amber-300" />
                    )}
                    <span>Scan {focusedState.name} Now</span>
                  </button>
                </div>
              </div>
            ) : null}

          </div>
        )}

      </div>

      {/* Autonomous Research Jobs & Queue Modal */}
      {showJobsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ClockCountdown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Autonomous Research Queue &amp; History</h3>
                  <p className="text-[11px] text-slate-500">Scheduled background jobs continue even when browser tab is closed.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowJobsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scheduler Status Summary */}
            {scheduler && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-indigo-50/30 border-b border-slate-100 text-xs">
                <div className="p-2 rounded-lg bg-white border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Active Jobs</div>
                  <div className="text-sm font-bold text-slate-800">{scheduler.activeJobs}</div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Completed</div>
                  <div className="text-sm font-bold text-emerald-600">{scheduler.completedJobs}</div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Failed</div>
                  <div className="text-sm font-bold text-slate-600">{scheduler.failedJobs}</div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Next Refresh</div>
                  <div className="text-xs font-bold text-indigo-600">
                    {scheduler.nextScheduledRun ? new Date(scheduler.nextScheduledRun).toLocaleTimeString() : 'In 6 hours'}
                  </div>
                </div>
              </div>
            )}

            {/* Jobs List */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {jobs.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No background jobs recorded in current session. Run a scan on any state above to trigger discovery.
                </div>
              ) : (
                jobs.map((job) => (
                  <div
                    key={job.jobId}
                    className="p-3 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 transition text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] uppercase font-mono">
                          {job.stateCode}
                        </span>
                        <span>{job.metroHub}</span>
                        <span className="text-slate-400 font-normal text-[11px]">&bull; {job.categoryKey}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          job.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : job.status === 'running'
                            ? 'bg-amber-100 text-amber-700 animate-pulse'
                            : job.status === 'failed'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 pt-1">
                      <div>Discovered: <strong className="text-slate-800">{job.discoveredCount}</strong></div>
                      <div>New Saved: <strong className="text-emerald-700">{job.newSavedCount}</strong></div>
                      <div>Existing: <strong className="text-indigo-700">{job.existingUpdatedCount}</strong></div>
                      <div>Provider: <span className="text-slate-600">{job.provider.split('/')[0]}</span></div>
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-50 font-mono">
                      <span>ID: {job.jobId}</span>
                      <span>{new Date(job.scheduledAt).toLocaleTimeString()} ({job.durationMs}ms)</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => setShowJobsModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
