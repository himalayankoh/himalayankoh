'use client';

import React, { useState, useMemo } from 'react';
import {
  MagnifyingGlass,
  Sliders,
  Phone,
  EnvelopeSimple,
  Chats,
  DotsThreeVertical,
  X,
  MapPin,
  Globe,
  Tag,
  Star,
} from '@phosphor-icons/react';
import type { SavedLeadRecord } from '@/lib/leados/types';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';

interface MobileLeadsViewProps {
  leads: SavedLeadRecord[];
  onUpdateLeadStatus?: (leadId: string, status: string) => void;
  onDeleteLead?: (leadId: string) => void;
  onStartOutreach?: (lead: SavedLeadRecord) => void;
  isLoading?: boolean;
}

type FilterChip = 'all' | 'new' | 'contacted' | 'qualified' | 'converted';

export function MobileLeadsView({
  leads,
  onUpdateLeadStatus,
  onDeleteLead,
  onStartOutreach,
  isLoading = false,
}: MobileLeadsViewProps) {
  const { isDark } = useMobileTheme();
  const palette = getMobilePalette(isDark);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeChip, setActiveChip] = useState<FilterChip>('all');
  const [selectedLead, setSelectedLead] = useState<SavedLeadRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Compute real counts from the leads array
  const counts = useMemo(() => {
    let total = leads.length;
    let newCount = 0;
    let contactedCount = 0;
    let qualifiedCount = 0;
    let convertedCount = 0;

    for (const lead of leads) {
      const s = (lead.status || 'new').toLowerCase();
      if (s === 'new') newCount++;
      else if (s === 'contacted' || s === 'in_progress') contactedCount++;
      else if (s === 'qualified' || s === 'high_interest') qualifiedCount++;
      else if (s === 'converted' || s === 'customer') convertedCount++;
      else newCount++;
    }

    return {
      total,
      new: newCount,
      contacted: contactedCount,
      qualified: qualifiedCount,
      converted: convertedCount,
    };
  }, [leads]);

  // Filter leads by chip and search query
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // 1. Chip filter
      if (activeChip !== 'all') {
        const s = (lead.status || 'new').toLowerCase();
        if (activeChip === 'new' && s !== 'new') return false;
        if (activeChip === 'contacted' && s !== 'contacted' && s !== 'in_progress') return false;
        if (activeChip === 'qualified' && s !== 'qualified' && s !== 'high_interest') return false;
        if (activeChip === 'converted' && s !== 'converted' && s !== 'customer') return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (lead.businessName || '').toLowerCase().includes(q);
        const matchesCompany = (lead.research?.publicCompanyName || '').toLowerCase().includes(q);
        const matchesEmail = (lead.email || '').toLowerCase().includes(q);
        const matchesPhone = (lead.phone || '').toLowerCase().includes(q);
        const matchesCity = (lead.city || '').toLowerCase().includes(q);
        const matchesState = (lead.region || '').toLowerCase().includes(q);
        const matchesCategory = (lead.category || '').toLowerCase().includes(q);
        if (
          !matchesName &&
          !matchesCompany &&
          !matchesEmail &&
          !matchesPhone &&
          !matchesCity &&
          !matchesState &&
          !matchesCategory
        ) {
          return false;
        }
      }

      return true;
    });
  }, [leads, activeChip, searchQuery]);

  // Format relative timestamp
  const formatTimeAgo = (dateStr?: string | null) => {
    if (!dateStr) return 'Recent';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return `${Math.floor(diffDays / 7)}w ago`;
    } catch {
      return 'Recent';
    }
  };

  // Get status badge styling
  const getStatusBadge = (status?: string) => {
    const s = (status || 'new').toLowerCase();
    if (s === 'contacted' || s === 'in_progress') {
      return { label: 'Contacted', ...palette.status.contacted };
    }
    if (s === 'qualified' || s === 'high_interest') {
      return { label: 'Qualified', ...palette.status.qualified };
    }
    if (s === 'converted' || s === 'customer') {
      return { label: 'Converted', ...palette.status.converted };
    }
    return { label: 'New', ...palette.status.new };
  };

  // Get initials for avatar
  const getInitials = (lead: SavedLeadRecord) => {
    const name = lead.research?.publicCompanyName || lead.businessName || 'HK';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const cleanPhoneForWhatsApp = (phone?: string | null) => {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '').replace('+', '');
  };

  return (
    <div className="md:hidden flex flex-col space-y-4 pb-20">
      {/* ── 1. Top Overview Stats Card (Reference Image 1) ───────────────── */}
      <div
        className="rounded-3xl p-5 relative overflow-hidden transition-all duration-200"
        style={{
          backgroundColor: palette.cardBg,
          border: `1px solid ${palette.cardBorder}`,
          boxShadow: palette.cardShadow,
          contain: 'paint',
        }}
      >
        {/* Subtle background glow accent */}
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-30"
          style={{ background: palette.accentGradient }}
        />

        {/* Top Header Row with Wave Graph */}
        <div className="flex items-start justify-between relative z-10">
          <div>
            <div className="text-xs font-semibold" style={{ color: palette.textSecondary }}>
              Total Leads
            </div>
            <div className="flex items-baseline gap-2.5 mt-1">
              <span className="text-3xl font-extrabold tracking-tight" style={{ color: palette.textPrimary }}>
                {counts.total}
              </span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                ↑ 12%
              </span>
            </div>
            <div className="text-[11px] font-medium mt-0.5" style={{ color: palette.textMuted }}>
              Active Directory
            </div>
          </div>

          {/* Glowing Curved Wave Graph SVG */}
          <div className="w-28 h-12 relative">
            <svg viewBox="0 0 120 50" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="waveGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3" />
                  <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#A78BFA" stopOpacity="1" />
                </linearGradient>
                <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <path
                d="M 5 42 Q 35 38, 55 24 T 95 10 T 115 14"
                fill="none"
                stroke="url(#waveGlow)"
                strokeWidth="3"
                strokeLinecap="round"
                filter="url(#glowEffect)"
              />
              <circle cx="95" cy="10" r="4.5" fill="#FFFFFF" stroke="#8B5CF6" strokeWidth="2.5" />
            </svg>
          </div>
        </div>

        {/* 4 Mini Cards Row */}
        <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t relative z-10" style={{ borderColor: palette.divider }}>
          {/* New */}
          <div
            className="rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all"
            style={{ backgroundColor: palette.cardElevatedBg }}
          >
            <span className="text-[10px] font-semibold" style={{ color: palette.textSecondary }}>
              New
            </span>
            <span className="text-base font-extrabold mt-0.5" style={{ color: palette.status.new.text }}>
              {counts.new}
            </span>
          </div>

          {/* Contacted */}
          <div
            className="rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all"
            style={{ backgroundColor: palette.cardElevatedBg }}
          >
            <span className="text-[10px] font-semibold" style={{ color: palette.textSecondary }}>
              Contacted
            </span>
            <span className="text-base font-extrabold mt-0.5" style={{ color: palette.status.contacted.text }}>
              {counts.contacted}
            </span>
          </div>

          {/* Qualified */}
          <div
            className="rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all"
            style={{ backgroundColor: palette.cardElevatedBg }}
          >
            <span className="text-[10px] font-semibold" style={{ color: palette.textSecondary }}>
              Qualified
            </span>
            <span className="text-base font-extrabold mt-0.5" style={{ color: palette.status.qualified.text }}>
              {counts.qualified}
            </span>
          </div>

          {/* Converted */}
          <div
            className="rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all"
            style={{ backgroundColor: palette.cardElevatedBg }}
          >
            <span className="text-[10px] font-semibold" style={{ color: palette.textSecondary }}>
              Converted
            </span>
            <span className="text-base font-extrabold mt-0.5" style={{ color: palette.status.converted.text }}>
              {counts.converted}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. Search Bar + Filter Button (Reference Image 1) ───────────── */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 rounded-2xl flex items-center gap-2.5 px-3.5 py-2.5 transition-all"
          style={{
            backgroundColor: palette.searchBg,
            border: `1px solid ${palette.searchBorder}`,
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <MagnifyingGlass size={17} style={{ color: palette.searchPlaceholder }} className="shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search leads..."
            className="w-full bg-transparent text-xs font-medium outline-none"
            style={{
              color: palette.textPrimary,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {/* Filter Sliders Button */}
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          aria-label="Toggle filter chips"
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{
            backgroundColor: showFilters
              ? isDark
                ? '#1E293B'
                : '#E2E8F0'
              : palette.searchBg,
            border: `1px solid ${palette.searchBorder}`,
            color: showFilters ? palette.accentText : palette.textSecondary,
          }}
        >
          <Sliders size={18} weight={showFilters ? 'bold' : 'regular'} />
        </button>
      </div>

      {/* ── 3. Horizontal Filter Chips (Reference Image 1) ───────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {(['all', 'new', 'contacted', 'qualified', 'converted'] as FilterChip[]).map((chip) => {
          const isActive = activeChip === chip;
          const label = chip.charAt(0).toUpperCase() + chip.slice(1);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setActiveChip(chip)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all active:scale-95 duration-150"
              style={{
                background: isActive ? palette.chipActiveBg : palette.chipInactiveBg,
                color: isActive ? palette.chipActiveText : palette.chipInactiveText,
                border: `1px solid ${isActive ? 'transparent' : palette.chipInactiveBorder}`,
                boxShadow: isActive ? palette.accentGlow : 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── 4. Lead Cards List (Reference Image 1) ───────────────────────── */}
      <div className="space-y-3">
        {isLoading && leads.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="rounded-2xl p-4 animate-pulse flex items-start gap-3"
                style={{
                  backgroundColor: palette.cardBg,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <div className="w-11 h-11 rounded-full bg-slate-700/40 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-700/40 rounded w-3/4" />
                  <div className="h-3 bg-slate-700/30 rounded w-1/2" />
                  <div className="h-3 bg-slate-700/20 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              backgroundColor: palette.cardBg,
              border: `1px solid ${palette.cardBorder}`,
            }}
          >
            <p className="text-sm font-bold" style={{ color: palette.textPrimary }}>
              No leads found
            </p>
            <p className="text-xs mt-1" style={{ color: palette.textSecondary }}>
              {searchQuery ? `No records matching "${searchQuery}"` : 'No leads in this category yet.'}
            </p>
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const badge = getStatusBadge(lead.status);
            const initials = getInitials(lead);
            const cleanPhone = cleanPhoneForWhatsApp(lead.phone);
            const location = [lead.city, lead.region].filter(Boolean).join(', ') || 'USA';

            return (
              <div
                key={lead.id}
                className="rounded-2xl p-4 transition-all duration-150"
                style={{
                  backgroundColor: palette.cardBg,
                  border: `1px solid ${palette.cardBorder}`,
                  boxShadow: palette.cardShadow,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Left: Avatar with Initial */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
                      border: '1.5px solid rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    {initials}
                  </div>

                  {/* Middle: Lead Details & Quick Actions */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3
                        onClick={() => setSelectedLead(lead)}
                        className="text-sm font-bold truncate leading-tight cursor-pointer"
                        style={{ color: palette.textPrimary }}
                      >
                        {lead.businessName}
                      </h3>
                      <span className="text-[10px] font-medium shrink-0" style={{ color: palette.textMuted }}>
                        {formatTimeAgo(lead.createdAt || lead.discoveredAt)}
                      </span>
                    </div>

                    <div className="text-xs truncate mt-0.5" style={{ color: palette.textSecondary }}>
                      {lead.category || location}
                    </div>

                    {lead.phone && (
                      <div className="text-[11px] font-mono mt-0.5" style={{ color: palette.textMuted }}>
                        {lead.phone}
                      </div>
                    )}

                    {/* Quick Action Icons Row */}
                    <div className="flex items-center gap-2 mt-3">
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          aria-label={`Call ${lead.businessName}`}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95"
                          style={{
                            backgroundColor: palette.cardElevatedBg,
                            border: `1px solid ${palette.cardBorder}`,
                            color: palette.textPrimary,
                          }}
                        >
                          <Phone size={14} weight="bold" />
                        </a>
                      )}

                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          aria-label={`Email ${lead.businessName}`}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95"
                          style={{
                            backgroundColor: palette.cardElevatedBg,
                            border: `1px solid ${palette.cardBorder}`,
                            color: palette.textPrimary,
                          }}
                        >
                          <EnvelopeSimple size={14} weight="bold" />
                        </a>
                      )}

                      {cleanPhone && (
                        <a
                          href={`https://wa.me/${cleanPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`WhatsApp ${lead.businessName}`}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 text-emerald-400"
                          style={{
                            backgroundColor: palette.cardElevatedBg,
                            border: `1px solid ${palette.cardBorder}`,
                          }}
                        >
                          <Chats size={14} weight="bold" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ml-auto"
                        style={{
                          backgroundColor: palette.cardElevatedBg,
                          color: palette.accentText,
                          border: `1px solid ${palette.cardBorder}`,
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  </div>

                  {/* Right: Status Pill & Menu */}
                  <div className="flex flex-col items-end justify-between shrink-0 self-stretch">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        color: badge.text,
                        backgroundColor: badge.bg,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>

                    <button
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      aria-label="Lead actions"
                      className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                      <DotsThreeVertical size={18} weight="bold" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── 5. Lead Details Bottom Sheet / Modal ───────────────────────── */}
      {selectedLead && (
        <div className="fixed inset-0 z-modal flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedLead(null)}
          />
          <div
            className="relative rounded-t-3xl p-5 border-t shadow-2xl max-h-[85vh] overflow-y-auto"
            style={{
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              color: palette.textPrimary,
            }}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-500/40 mx-auto mb-4" />

            <div className="flex items-start justify-between pb-3 border-b" style={{ borderColor: palette.divider }}>
              <div>
                <h2 className="text-base font-bold leading-tight" style={{ color: palette.textPrimary }}>
                  {selectedLead.businessName}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>
                  {selectedLead.category || 'Livestock Salt Prospect'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: palette.iconBtnBg,
                  color: palette.iconBtnText,
                }}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Quick Status Selector */}
            <div className="mt-4">
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: palette.textSecondary }}>
                Status Pipeline
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['new', 'contacted', 'qualified', 'converted'] as const).map((st) => {
                  const isCurrent = (selectedLead.status || 'new').toLowerCase() === st;
                  const label = st.charAt(0).toUpperCase() + st.slice(1);
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        onUpdateLeadStatus?.(selectedLead.id, st);
                        setSelectedLead({ ...selectedLead, status: st });
                      }}
                      className="py-1.5 px-2 rounded-xl text-xs font-bold transition-all text-center"
                      style={{
                        backgroundColor: isCurrent ? palette.accentGradient : palette.cardElevatedBg,
                        color: isCurrent ? '#FFFFFF' : palette.textSecondary,
                        border: `1px solid ${isCurrent ? 'transparent' : palette.cardBorder}`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Details Fields */}
            <div className="mt-4 space-y-2.5 text-xs">
              {selectedLead.email && (
                <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ backgroundColor: palette.cardElevatedBg }}>
                  <div className="flex items-center gap-2 truncate">
                    <EnvelopeSimple size={16} style={{ color: palette.accentText }} />
                    <span className="truncate">{selectedLead.email}</span>
                  </div>
                  <a href={`mailto:${selectedLead.email}`} className="text-xs font-bold text-violet-400 shrink-0">
                    Email
                  </a>
                </div>
              )}

              {selectedLead.phone && (
                <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ backgroundColor: palette.cardElevatedBg }}>
                  <div className="flex items-center gap-2 font-mono">
                    <Phone size={16} style={{ color: palette.accentText }} />
                    <span>{selectedLead.phone}</span>
                  </div>
                  <a href={`tel:${selectedLead.phone}`} className="text-xs font-bold text-emerald-400 shrink-0">
                    Call
                  </a>
                </div>
              )}

              {(selectedLead.city || selectedLead.region || selectedLead.address) && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ backgroundColor: palette.cardElevatedBg }}>
                  <MapPin size={16} style={{ color: palette.accentText }} />
                  <span>
                    {[selectedLead.address, selectedLead.city, selectedLead.region, selectedLead.country]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}

              {selectedLead.website && (
                <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ backgroundColor: palette.cardElevatedBg }}>
                  <div className="flex items-center gap-2 truncate">
                    <Globe size={16} style={{ color: palette.accentText }} />
                    <span className="truncate">{selectedLead.website}</span>
                  </div>
                  <a
                    href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-sky-400 shrink-0"
                  >
                    Open
                  </a>
                </div>
              )}
            </div>

            {/* Bottom Modal Actions */}
            <div className="mt-5 pt-3 border-t flex gap-2" style={{ borderColor: palette.divider }}>
              <button
                type="button"
                onClick={() => {
                  onStartOutreach?.(selectedLead);
                  setSelectedLead(null);
                }}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-white transition-all text-center shadow-lg cursor-pointer"
                style={{ background: palette.accentGradient }}
              >
                Send Outreach
              </button>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="py-3 px-4 rounded-xl text-xs font-semibold transition-all"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  color: palette.textPrimary,
                  border: `1px solid ${palette.cardBorder}`,
                }}
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
