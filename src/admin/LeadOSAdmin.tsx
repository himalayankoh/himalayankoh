'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Target,
  MagnifyingGlass,
  BookBookmark,
  SquaresFour,
  Sparkle,
  Sliders,
  GearSix,
  CheckCircle,
  WarningCircle,
  ArrowSquareOut,
  Phone,
  MapPin,
  Globe,
  Star,
  DownloadSimple,
  Plus,
  Trash,
  ArrowsClockwise,
  ShieldCheck,
  Robot,
  TrendUp,
  Buildings,
  Tag,
  Funnel,
  CaretRight,
  EnvelopeSimple,
  PaperPlaneRight,
  PencilSimple,
  ClockCounterClockwise,
  House,
  Play,
  X,
  CaretDown,
  CaretUp,
  FileText,
  Check,
  Storefront,
} from '@phosphor-icons/react';
import { getAccessToken } from '@/services/wordpressAdminAuth';
import type {
  ScoredLead,
  LeadOSProject,
  SavedLeadRecord,
  SearchDiagnostics,
} from '@/lib/leados/types';
import LeadIntelligencePanel from './LeadIntelligencePanel';
import { BUYER_CATEGORIES, PRODUCT_INTERESTS, OFFER_PROFILES, LEAD_PIPELINE, createIntroduction, deduplicateLeads } from '@/lib/leados/intelligence';
import type { SearchPlan } from '@/lib/leados/searchPlanner';
import type { ProductInterest } from '@/lib/leados/types';
import { parseLeadOSUrlState } from '@/lib/leados/urlState';

type TabType = 'overview' | 'find' | 'library' | 'projects' | 'research' | 'scoring' | 'outreach' | 'ai' | 'settings';


const PRESET_CATEGORIES = BUYER_CATEGORIES.map((value) => ({label: value, value}));

const PRESET_LOCATIONS = [
  'Houston, TX',
  'Fort Worth, TX',
  'San Antonio, TX',
  'Dallas, TX',
  'Austin, TX',
  'Omaha, NE',
  'Denver, CO',
  'Lexington, KY',
  'Des Moines, IA',
];

export interface OutreachTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
}

export const OUTREACH_TEMPLATES: OutreachTemplate[] = PRODUCT_INTERESTS.map((interest) => {
  const intro = createIntroduction({businessName: '{business_name}', city: '{city}', category: interest === 'culinary_salt' ? 'specialty food and spice businesses' : 'relevant B2B businesses'}, interest);
  return {id: interest, name: OFFER_PROFILES[interest].label, category: interest, subject: intro.subject, body: intro.message};
});

/** Compact KPI card */
function metricValue(value: unknown): string | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : '—';
}

function KpiCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string | number; sub: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-0.5 leading-tight">{value}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

/** Status pill */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: 'bg-slate-100 text-slate-700',
    reviewed: 'bg-blue-50 text-blue-700',
    shortlisted: 'bg-indigo-50 text-indigo-700',
    contacted: 'bg-amber-50 text-amber-700',
    qualified: 'bg-emerald-50 text-emerald-700',
    disqualified: 'bg-rose-50 text-rose-700',
    not_relevant: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${map[status] || map.new}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

/** Score badge */
function ScoreBadge({ score, label = 'Priority' }: { score: number; label?: string }) {
  const color = score >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : score >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span title={`${label}: ${score}/100`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${color}`}>
      <span className="font-medium">{label}</span> {score}/100
    </span>
  );
}

function EvidenceSummary({ evidence }: { evidence?: ScoredLead['evidence'] }) {
  if (!evidence) return <p className="text-[10px] text-slate-400">Evidence details unavailable.</p>;
  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2 text-[10px] text-slate-700 space-y-1" aria-label="Score explanation">
      <div className="flex flex-wrap gap-2 font-semibold">
        <span>ICP Fit: {evidence.icpFit}/100</span>
        <span>Reachability: {evidence.reachability}/100</span>
        <span>Data Confidence: {evidence.dataConfidence}/100</span>
        <span>Priority: {evidence.commercialPriority}/100</span>
      </div>
      <p><strong>Why:</strong> {evidence.reasons.slice(0, 3).join(' ')}</p>
    </div>
  );
}

export default function LeadOSAdmin({ defaultTab = 'overview' }: { defaultTab?: TabType } = {}) {
  const [activeTab, setActiveTab] = useState<TabType>(() => typeof window === 'undefined' ? defaultTab : parseLeadOSUrlState(window.location.href).tab);

  const changeTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({}, '', url);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => setActiveTab(parseLeadOSUrlState(window.location.href).tab);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [defaultTab]);

  // Stats & Projects
  const [loadingStats, setLoadingStats] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<LeadOSProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Find Leads state & Multi-Entity Search Plan
  const [searchMode, setSearchMode] = useState<'ai' | 'manual'>('ai');
  const [category, setCategory] = useState('Feed Store');
  const searchGeneration = useRef(0);
  useEffect(() => () => { searchGeneration.current++; }, []);
  const [aiQuery, setAiQuery] = useState(
    'Find 100 livestock feed stores and mineral distributors in Houston, Dallas and Austin with websites, emails and phone numbers.'
  );
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('Houston, TX');
  const [locationsList, setLocationsList] = useState<string[]>([
    'Houston, TX',
    'Dallas, TX',
    'Austin, TX',
  ]);
  const [categoriesList, setCategoriesList] = useState<string[]>([
    'Feed Store',
    'Livestock Supplier',
    'Mineral Distributor',
  ]);
  const [keywordsList, setKeywordsList] = useState<string[]>([
    'feed store',
    'livestock',
    'mineral',
    'salt',
  ]);
  const [resultsLimit, setResultsLimit] = useState(100);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [resultsView, setResultsView] = useState<'table' | 'map'>('table');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Chip input editing states
  const [newLocationInput, setNewLocationInput] = useState('');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [showAddKeyword, setShowAddKeyword] = useState(false);

  const [researchRegion, setResearchRegion] = useState('Texas');
  const [maxResults, setMaxResults] = useState(15);
  const [productInterest, setProductInterest] = useState<ProductInterest>('horse_salt');
  const [radiusKm, setRadiusKm] = useState(35);
  const [searchDepth, setSearchDepth] = useState(1);
  const [excludeSaved, setExcludeSaved] = useState(false);
  const [excludeContacted, setExcludeContacted] = useState(true);
  const [wholesaleOnly, setWholesaleOnly] = useState(false);
  const [privateLabelOnly, setPrivateLabelOnly] = useState(false);
  const [requireWebsite, setRequireWebsite] = useState(true);
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireEmail, setRequireEmail] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchStep, setSearchStep] = useState('');
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [diagnostics, setDiagnostics] = useState<SearchDiagnostics | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Library state
  const [libraryLeads, setLibraryLeads] = useState<SavedLeadRecord[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState(() => typeof window !== 'undefined' ? parseLeadOSUrlState(window.location.href).search : '');
  const [statusFilter, setStatusFilter] = useState(() => typeof window !== 'undefined' ? parseLeadOSUrlState(window.location.href).status : 'all');
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    if (librarySearch) url.searchParams.set('search', librarySearch); else url.searchParams.delete('search');
    if (statusFilter !== 'all') url.searchParams.set('status', statusFilter); else url.searchParams.delete('status');
    window.history.replaceState({}, '', url);
  }, [activeTab, librarySearch, statusFilter]);

  // AI Analysis modal/state
  const [analyzingLeadName, setAnalyzingLeadName] = useState<string | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Projects ICP editing state
  const [activeProject, setActiveProject] = useState<LeadOSProject | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [projectSavedMsg, setProjectSavedMsg] = useState<string | null>(null);

  // Scoring weights
  const [weights, setWeights] = useState<Array<{ signalKey: string; signalName: string; weight: number }>>([]);

  // Client Outreach state
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplate>(OUTREACH_TEMPLATES[0]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmailSource, setRecipientEmailSource] = useState<'discovered_osm' | 'company_website' | 'manually_entered' | 'unverified'>('unverified');
  const [emailSubject, setEmailSubject] = useState(OUTREACH_TEMPLATES[0].subject.replace('{business_name}', 'Partner'));
  const [emailBody, setEmailBody] = useState(OUTREACH_TEMPLATES[0].body.replace(/\{business_name\}/g, 'Partner').replace(/\{city\}/g, 'your city'));
  const [activeOutreachLeadId, setActiveOutreachLeadId] = useState<string | undefined>(undefined);
  const [sendingOutreach, setSendingOutreach] = useState(false);
  const [sendResultNotice, setSendResultNotice] = useState<{ ok: boolean; msg: string; simulated?: boolean } | null>(null);

  // Email Add/Edit Modal state
  const [editingEmailLead, setEditingEmailLead] = useState<SavedLeadRecord | ScoredLead | null>(null);
  const [inputEmail, setInputEmail] = useState('');
  const [inputPhone, setInputPhone] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailModalNotice, setEmailModalNotice] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, []);

  // Load stats and projects
  const loadStatsAndProjects = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const headers = await getAuthHeaders();
      const [resStats, resProj] = await Promise.all([
        fetch('/api/admin/leados/stats', { headers }),
        fetch('/api/admin/leados/projects', { headers }),
      ]);
      if (!resStats.ok) throw new Error(`Stats request failed (${resStats.status})`);
      if (!resProj.ok) throw new Error(`Projects request failed (${resProj.status})`);

      const [s, p] = await Promise.all([resStats.json(), resProj.json()]);
      setStats(s.stats && typeof s.stats === 'object' ? s.stats : null);
      setProjects(Array.isArray(p.projects) ? p.projects : []);
      if (Array.isArray(p.projects) && p.projects.length > 0) {
        setSelectedProjectId((current) => current || p.projects[0].id);
        setActiveProject((current) => current || p.projects[0]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LeadOS initialization failed.';
      setStatsError(message);
      console.error('LeadOS initialization error:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [getAuthHeaders]);

  // Load saved library
  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    setLibraryError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (librarySearch) params.set('search', librarySearch);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/leados/leads?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`Lead Library request failed (${res.status})`);
      const d = await res.json();
      if (!Array.isArray(d.leads)) throw new Error('Lead Library returned an invalid response.');
      setLibraryLeads(d.leads);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lead Library failed to load.';
      setLibraryError(message);
      console.error('Failed to load library:', err);
    } finally {
      setLoadingLibrary(false);
    }
  }, [getAuthHeaders, librarySearch, statusFilter]);

  // Load weights
  const loadWeights = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/scoring', { headers });
      if (res.ok) {
        const d = await res.json();
        setWeights(d.weights || []);
      }
    } catch {
      // Non-fatal
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadStatsAndProjects();
    loadWeights();
  }, [loadStatsAndProjects, loadWeights]);

  useEffect(() => {
    if (activeTab === 'library' || activeTab === 'outreach') {
      loadLibrary();
    }
  }, [activeTab, loadLibrary]);

  // Progressive Multi-Entity / Multi-Location Search runner
  const runProgressiveSearch = async (
    targetLocations: string[] = locationsList,
    targetCategories: string[] = categoriesList,
    targetKeywords: string[] = keywordsList,
    limit: number = resultsLimit,
    reqWeb: boolean = requireWebsite,
    reqPhoneVal: boolean = requirePhone,
    reqEmailVal: boolean = requireEmail,
    prodInt: ProductInterest = productInterest,
    wsOnly: boolean = wholesaleOnly,
    plOnly: boolean = privateLabelOnly
  ) => {
    const generation = ++searchGeneration.current;
    setSearching(true);
    setSearchError(null);
    setSearchStep('Starting deep multi-location search...');
    setLeads([]);
    setSelectedLeadIds(new Set());
    setDiagnostics(null);

    const locs = targetLocations.length > 0 ? targetLocations : [location || 'Houston, TX'];
    const cats = targetCategories.length > 0 ? targetCategories : [category || 'Feed Store'];
    const kwString = targetKeywords.join(' ');

    let collected: ScoredLead[] = [];
    const seenNames = new Set<string>();

    try {
      const headers = await getAuthHeaders();

      for (let lIdx = 0; lIdx < locs.length; lIdx++) {
        const curLoc = locs[lIdx];
        if (generation !== searchGeneration.current) return;
        if (collected.length >= limit) break;

        for (let cIdx = 0; cIdx < cats.length; cIdx++) {
          const curCat = cats[cIdx];
          if (generation !== searchGeneration.current) return;
          if (collected.length >= limit) break;

          setSearchStep(`Searching "${curCat}" in ${curLoc} (${collected.length} leads found so far)...`);

          try {
            const res = await fetch('/api/admin/leados/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...headers },
              body: JSON.stringify({
                category: curCat,
                location: curLoc,
                keyword: kwString,
                productInterest: prodInt,
                radiusKm: radiusKm || 35,
                searchDepth,
                excludeSaved,
                excludeContacted,
                wholesaleOnly: wsOnly,
                privateLabelOnly: plOnly,
                country: 'US',
                projectId: selectedProjectId,
                maxResults: Math.min(limit - collected.length, 50),
                requireWebsite: reqWeb,
                requirePhone: reqPhoneVal,
                requireEmail: reqEmailVal,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (generation !== searchGeneration.current) return;
              if (Array.isArray(data.leads)) {
                const newItems: ScoredLead[] = [];
                for (const item of data.leads) {
                  const norm = (item.businessName || '').toLowerCase().trim();
                  if (norm && !seenNames.has(norm)) {
                    seenNames.add(norm);
                    newItems.push(item);
                  }
                }

                if (newItems.length > 0) {
                  collected = [...collected, ...newItems].slice(0, limit);
                  // PROGRESSIVE UPDATE: user sees results batch by batch!
                  setLeads([...collected]);
                }
                if (data.diagnostics) {
                  setDiagnostics(data.diagnostics);
                }
              }
            }
          } catch (innerErr) {
            console.warn(`Search batch failed for ${curCat} in ${curLoc}:`, innerErr);
          }
        }
      }

      if (collected.length === 0) {
        setSearchStep('Search completed: 0 results found. Try broadening locations or keywords.');
      } else {
        setSearchStep(`Discovered ${collected.length} verified B2B leads across ${locs.length} locations.`);
      }
    } catch (err: any) {
      if (generation === searchGeneration.current) {
        setSearchError(err.message || 'Error occurred during progressive discovery');
      }
    } finally {
      if (generation === searchGeneration.current) {
        setSearching(false);
      }
    }
  };

  const handleSearch = async (e?: React.FormEvent, o: Partial<SearchPlan> = {}) => {
    if (e) e.preventDefault();
    await runProgressiveSearch(
      locationsList,
      categoriesList,
      keywordsList,
      resultsLimit,
      requireWebsite,
      requirePhone,
      requireEmail,
      productInterest,
      wholesaleOnly,
      privateLabelOnly
    );
  };

  // Describe-and-search with AI Planner
  const planAndSearch = async (runAfter: boolean, customQuery?: string) => {
    const qText = customQuery !== undefined ? customQuery : aiQuery;
    if (!qText.trim()) {
      setSearchError('Describe who you want to find, e.g. "Find 100 livestock feed stores and mineral distributors in Houston, Dallas and Austin".');
      return;
    }
    setPlanning(true);
    setSearchError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/ai', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan_search', description: qText, location: locationsList[0] || location }),
      });
      const data = await res.json();
      if (!res.ok || !data.plan) throw new Error(data.error || 'Search planner is unavailable.');
      const p: SearchPlan = data.plan;

      const newLocs = p.locations && p.locations.length > 0 ? p.locations : [p.location || 'Houston, TX'];
      const newCats = p.categories && p.categories.length > 0 ? p.categories : [p.category || 'Feed Store'];
      const newKws = p.keywords && p.keywords.length > 0 ? p.keywords : (p.keyword ? [p.keyword] : ['feed store', 'livestock', 'mineral']);
      const newLimit = p.resultsLimit || 100;

      setLocationsList(newLocs);
      setCategoriesList(newCats);
      setKeywordsList(newKws);
      setResultsLimit(newLimit);
      setCategory(newCats[0]);
      setLocation(newLocs[0]);
      setKeyword(newKws.join(' '));
      setProductInterest(p.productInterest || 'horse_salt');
      setRequireWebsite(p.requireWebsite ?? true);
      setRequirePhone(p.requirePhone ?? true);
      setRequireEmail(p.requireEmail ?? true);
      setWholesaleOnly(p.wholesaleOnly ?? false);
      setPrivateLabelOnly(p.privateLabelOnly ?? false);
      setExcludeSaved(p.excludeSaved ?? false);
      setSearchDepth(p.searchDepth ?? 1);

      setPlanNote(data.source === 'ai' ? `Planned by AI (${data.provider || 'Gemini'})` : 'Planned instantly — 0 AI tokens');
      setPlanning(false);

      if (runAfter) {
        await runProgressiveSearch(
          newLocs,
          newCats,
          newKws,
          newLimit,
          p.requireWebsite ?? true,
          p.requirePhone ?? true,
          p.requireEmail ?? true,
          p.productInterest || 'horse_salt',
          p.wholesaleOnly ?? false,
          p.privateLabelOnly ?? false
        );
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search planner failed.');
    } finally {
      setPlanning(false);
    }
  };

  // Bulk actions
  const handleToggleSelectLead = (name: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedLeadIds.size === leads.length && leads.length > 0) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((l) => l.businessName)));
    }
  };

  const handleSaveSelected = async () => {
    if (selectedLeadIds.size === 0) return;
    setSavingSelected(true);
    let savedCount = 0;
    try {
      const headers = await getAuthHeaders();
      const selectedLeads = leads.filter((l) => selectedLeadIds.has(l.businessName));
      for (const lead of selectedLeads) {
        try {
          const res = await fetch('/api/admin/leados/leads/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ lead, projectId: selectedProjectId }),
          });
          if (res.ok) savedCount++;
        } catch {
          // Continue
        }
      }
      setLeads((prev) =>
        prev.map((l) => (selectedLeadIds.has(l.businessName) ? { ...l, alreadySaved: true } : l))
      );
      setSelectedLeadIds(new Set());
      setSavedSuccessMsg(`Successfully saved ${savedCount} leads to Lead Library`);
      setTimeout(() => setSavedSuccessMsg(null), 3500);
      loadStatsAndProjects();
    } catch (err: any) {
      setSearchError(err.message || 'Failed to save selected leads');
    } finally {
      setSavingSelected(false);
    }
  };

  const handleExportSearchResultsCSV = () => {
    if (leads.length === 0) {
      alert('No search results to export.');
      return;
    }
    const headers = ['Business Name', 'Category', 'City', 'Region', 'Address', 'Phone', 'Email', 'Website', 'Source', 'Opportunity Score'];
    const rows = leads.map((l) => [
      `"${(l.businessName || '').replace(/"/g, '""')}"`,
      `"${(l.category || '').replace(/"/g, '""')}"`,
      `"${(l.city || '').replace(/"/g, '""')}"`,
      `"${(l.region || '').replace(/"/g, '""')}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.website || '').replace(/"/g, '""')}"`,
      `"${(l.dataSource || '').replace(/"/g, '""')}"`,
      l.opportunityScore ?? 0,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `himalayan-koh-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExportMenuOpen(false);
  };

  const handleExportSearchResultsJSON = () => {
    if (leads.length === 0) {
      alert('No search results to export.');
      return;
    }
    const jsonContent = JSON.stringify(leads, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `himalayan-koh-leads-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExportMenuOpen(false);
  };

  // Plan chip helpers
  const handleRemoveLocation = (idx: number) => {
    setLocationsList((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleAddLocation = () => {
    if (newLocationInput.trim()) {
      setLocationsList((prev) => [...prev, newLocationInput.trim()]);
      setNewLocationInput('');
      setShowAddLocation(false);
    }
  };

  const handleRemoveCategory = (idx: number) => {
    setCategoriesList((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleAddCategory = () => {
    if (newCategoryInput.trim()) {
      setCategoriesList((prev) => [...prev, newCategoryInput.trim()]);
      setNewCategoryInput('');
      setShowAddCategory(false);
    }
  };

  const handleRemoveKeyword = (idx: number) => {
    setKeywordsList((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleAddKeyword = () => {
    if (newKeywordInput.trim()) {
      setKeywordsList((prev) => [...prev, newKeywordInput.trim()]);
      setNewKeywordInput('');
      setShowAddKeyword(false);
    }
  };

  const handleClearAllPlan = () => {
    setLocationsList([]);
    setCategoriesList([]);
    setKeywordsList([]);
    setAiQuery('');
  };

  const handleSaveSearchTemplate = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/workflow', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_search',
          name: `${categoriesList[0] || 'B2B'} — ${locationsList.join(', ') || 'Texas'}`,
          category: categoriesList[0] || 'Feed Store',
          location: locationsList.join(', ') || 'Houston, TX',
          productInterest,
          keyword: keywordsList.join(' '),
          maxResults: resultsLimit,
          radiusKm,
          searchDepth,
          requireWebsite,
          requirePhone,
          requireEmail,
          excludeSaved,
          excludeContacted,
          wholesaleOnly,
          privateLabelOnly,
          country: 'US',
        }),
      });
      if (!res.ok) throw new Error('Failed to save search template.');
      setSavedSuccessMsg('Search plan saved as template. Reuse anytime from Outreach → Saved searches.');
      setTimeout(() => setSavedSuccessMsg(null), 3500);
    } catch (e) {
      setSearchError(String(e));
    }
  };

  // Save single lead to library
  const handleSaveToLibrary = async (lead: ScoredLead) => {
    setSavingLeadId(lead.businessName);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/leads/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          lead,
          projectId: selectedProjectId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save lead failed (${res.status})`);
      }
      setLeads((prev) =>
        prev.map((l) => (l.businessName === lead.businessName ? { ...l, alreadySaved: true } : l))
      );
      setSavedSuccessMsg(`Saved "${lead.businessName}" to Lead Library`);
      setTimeout(() => setSavedSuccessMsg(null), 3000);
      loadStatsAndProjects();
    } catch (err) {
      setSavedSuccessMsg(err instanceof Error ? `Unable to save lead: ${err.message}` : 'Unable to save lead.');
      console.error('Failed to save lead:', err);
    } finally {
      setSavingLeadId(null);
    }
  };

  // AI Deep Analyze
  const handleAIAnalyze = async (lead: ScoredLead) => {
    setAnalyzingLeadName(lead.businessName);
    setAiAnalysisResult(null);
    setAiError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          action: 'analyze',
          lead,
          projectId: selectedProjectId,
          provider: 'auto',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI analysis failed');
      setAiAnalysisResult(data);
    } catch (err: any) {
      setAiError(err.message || 'AI analysis request failed');
    }
  };

  // Update library lead status
  const handleUpdateLeadStatus = async (id: string, newStatus: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/leads', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error(`Status update failed (${res.status})`);
      setLibraryLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
    } catch (err) {
      console.error('Update lead status error:', err);
      setLibraryError(err instanceof Error ? err.message : 'Unable to update lead status.');
    }
  };

  // Delete lead from library
  const handleDeleteSavedLead = async (id: string) => {
    if (!confirm('Remove this lead from your library?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/leados/leads?id=${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setLibraryLeads((prev) => prev.filter((l) => l.id !== id));
      loadStatsAndProjects();
    } catch (err) {
      console.error('Delete lead error:', err);
      setLibraryError(err instanceof Error ? err.message : 'Unable to delete lead.');
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/leads/export', { headers });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `himalayan-koh-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('Failed to export CSV');
    }
  };

  // Setup outreach for a given lead
  const startOutreachForLead = (lead: SavedLeadRecord | ScoredLead) => {
    setActiveOutreachLeadId((lead as SavedLeadRecord).id || undefined);
    setRecipientName(lead.businessName);
    setRecipientEmail(lead.email || '');
    setRecipientEmailSource(lead.emailSource || (lead.email ? 'discovered_osm' : 'unverified'));
    const t = selectedTemplate;
    const name = lead.businessName;
    const city = lead.city || 'your area';
    setEmailSubject(t.subject.replace(/\{business_name\}/g, name).replace(/\{city\}/g, city));
    setEmailBody(t.body.replace(/\{business_name\}/g, name).replace(/\{city\}/g, city));
    setSendResultNotice(null);
    changeTab('outreach');
  };

  const handleTemplateSelect = (template: OutreachTemplate) => {
    setSelectedTemplate(template);
    const name = recipientName || 'Partner';
    const city = 'your area';
    setEmailSubject(template.subject.replace(/\{business_name\}/g, name).replace(/\{city\}/g, city));
    setEmailBody(template.body.replace(/\{business_name\}/g, name).replace(/\{city\}/g, city));
  };

  const handleSendOutreach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      setSendResultNotice({ ok: false, msg: 'Please provide a valid recipient email address.' });
      return;
    }
    if (!emailSubject.trim()) {
      setSendResultNotice({ ok: false, msg: 'Email subject line is required.' });
      return;
    }
    if (!emailBody.trim()) {
      setSendResultNotice({ ok: false, msg: 'Email body is required.' });
      return;
    }

    setSendingOutreach(true);
    setSendResultNotice(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          leadId: activeOutreachLeadId,
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim(),
          subject: emailSubject.trim(),
          message: emailBody.trim(),
          templateId: selectedTemplate.id,
          simulation: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch email');

      setSendResultNotice({
        ok: data.ok === true,
        msg: data.message || (data.state === 'simulated' ? '[SIMULATION] No external email was sent.' : 'Outreach delivered successfully.'),
        simulated: data.state === 'simulated',
      });

      // Refresh library only after a confirmed provider delivery.
      if (data.state === 'delivered' && activeOutreachLeadId) {
        loadLibrary();
      }
    } catch (err: any) {
      setSendResultNotice({ ok: false, msg: err.message || 'Error occurred during email dispatch.' });
    } finally {
      setSendingOutreach(false);
    }
  };

  const handleOpenEmailModal = (lead: SavedLeadRecord | ScoredLead) => {
    setEditingEmailLead(lead);
    setInputEmail(lead.email || '');
    setInputPhone(lead.phone || '');
    setEmailModalNotice(null);
  };

  const handleSaveEmailModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmailLead) return;
    setSavingEmail(true);
    setEmailModalNotice(null);

    try {
      const headers = await getAuthHeaders();
      const isSaved = 'id' in editingEmailLead && !!(editingEmailLead as SavedLeadRecord).id;

      if (isSaved) {
        const leadId = (editingEmailLead as SavedLeadRecord).id;
        const res = await fetch('/api/admin/leados/leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            id: leadId,
            email: inputEmail.trim() || null,
            phone: inputPhone.trim() || null,
            emailSource: 'manually_entered',
          }),
        });
        if (!res.ok) throw new Error('Failed to update lead');
      } else {
        const res = await fetch('/api/admin/leados/leads/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            lead: {
              ...editingEmailLead,
              email: inputEmail.trim() || null,
              phone: inputPhone.trim() || null,
              emailSource: 'manually_entered',
            },
            projectId: selectedProjectId,
          }),
        });
        if (!res.ok) throw new Error('Failed to save lead');
      }

      setEmailModalNotice('Contact details saved successfully (marked manually entered).');
      loadLibrary();
      setTimeout(() => {
        setEditingEmailLead(null);
      }, 1000);
    } catch (err: any) {
      setEmailModalNotice(`Error: ${err.message}`);
    } finally {
      setSavingEmail(false);
    }
  };

  // Save Project ICP Changes
  const handleSaveProjectICP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSavingProject(true);
    setProjectSavedMsg(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(activeProject),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Project save failed (${res.status})`);
      }
      setProjectSavedMsg('Himalayan Koh ICP settings saved successfully.');
      setTimeout(() => setProjectSavedMsg(null), 3000);
      loadStatsAndProjects();
    } catch (err) {
      setProjectSavedMsg(err instanceof Error ? err.message : 'Failed to save project.');
    } finally {
      setSavingProject(false);
    }
  };

  // Tab definitions
  const tabs = [
    { id: 'overview', label: 'Overview', icon: SquaresFour },
    { id: 'find', label: 'Find Leads', icon: MagnifyingGlass },
    { id: 'library', label: 'Lead Library', icon: BookBookmark },
    { id: 'projects', label: 'Projects (ICP)', icon: Target },
    { id: 'research', label: 'Multi-Research', icon: TrendUp },
    { id: 'scoring', label: 'Scoring Rules', icon: Sliders },
    { id: 'outreach', label: 'Client Outreach', icon: PaperPlaneRight },
    { id: 'ai', label: 'AI Engine', icon: Robot },
    { id: 'settings', label: 'Settings', icon: GearSix },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50">
      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Himalayan Koh.
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                B2B Salt &amp; Minerals – Find and connect with farm stores, feed suppliers, livestock businesses, mineral buyers, distributors, and more.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="relative">
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    const p = projects.find((proj) => proj.id === e.target.value);
                    if (p) setActiveProject(p);
                  }}
                  className="appearance-none pl-3.5 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {projects.length > 0 ? (
                    projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  ) : (
                    <option value="">Himalayan Koh — B2B Salt &amp; Minerals</option>
                  )}
                </select>
                <CaretDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="bg-white border-b border-[#e0d6c8] sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6">
          <div role="tablist" aria-label="LeadOS sections" className="flex items-center gap-0.5 overflow-x-auto no-scrollbar -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`leados-tab-${tab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`leados-panel-${tab.id}`}
                  onClick={() => changeTab(tab.id as TabType)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition ${
                    isActive
                      ? 'border-[#b86452] text-[#b86452]'
                      : 'border-transparent text-[#6d6258] hover:text-[#26211c] hover:border-[#e0d6c8]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#b86452]' : 'text-[#8d8276]'}`} />
                  {tab.label}
                  {tab.id === 'find' && searching && (
                    <ArrowsClockwise className="w-3 h-3 text-[#b86452] animate-spin ml-0.5" />
                  )}
                  {tab.id === 'library' && libraryLeads.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-[#faf0eb] text-[#b86452] font-bold">
                      {libraryLeads.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Success Toast ── */}
      {savedSuccessMsg && (
        <div className="max-w-[1400px] mx-auto px-6 mt-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            {savedSuccessMsg}
          </div>
        </div>
      )}

      {/* ── Main Content ── */}          <div className="max-w-[1400px] mx-auto px-6 py-6">

        {/* ══════════ OVERVIEW TAB ══════════ */}
        <div id="leados-panel-overview" role="tabpanel" aria-labelledby="leados-tab-overview" className={activeTab === 'overview' ? "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6" : "hidden"}>
          {/* Left: KPIs + Content */}
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon={BookBookmark} label="Total Leads" value={metricValue(stats?.savedLeadsCount)} sub="In Lead Library" accent="bg-indigo-50 text-indigo-600" />
                <KpiCard icon={Star} label="High Opportunity" value={metricValue(stats?.highOpportunityCount)} sub="Score ≥ 70" accent="bg-emerald-50 text-emerald-600" />
                <KpiCard icon={PaperPlaneRight} label="Contacted" value={metricValue(stats?.contactedCount)} sub="Outreach sent" accent="bg-amber-50 text-amber-600" />
                <KpiCard icon={TrendUp} label="In Pipeline" value={metricValue(stats?.inPipelineCount)} sub="Qualified leads" accent="bg-violet-50 text-violet-600" />
              </div>
              {statsError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800" role="alert">
                  LeadOS metrics are unavailable: {statsError}
                </div>
              )}

              {/* ICP Spotlight */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">Active ICP: Himalayan Koh — B2B Salt & Minerals</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Primary</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Targeted at farm supply cooperatives, feed distributors, livestock ranches, and mineral retail buyers.</p>
                  </div>
                  <button onClick={() => changeTab('scoring')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 flex-shrink-0">
                    Configure <CaretRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-semibold text-slate-600 block mb-1.5">Target Categories</span>
                    <div className="flex flex-wrap gap-1">
                      {['Feed Store', 'Farm Supply', 'Equestrian', 'Veterinary', 'Supermarket'].map((c) => (
                        <span key={c} className="px-2 py-0.5 bg-white rounded border border-slate-200 text-slate-600 text-[11px]">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-semibold text-slate-600 block mb-1.5">Target Locations</span>
                    <p className="text-slate-600 text-[11px]">Texas, Montana, Wyoming, Kansas, Nebraska, Oklahoma, Colorado, Iowa, Kentucky</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-semibold text-slate-600 block mb-1.5">Positive Signals</span>
                    <p className="text-slate-600 text-[11px]">salt lick, livestock, ranch, tack, feed mill, grain, animal mineral, wholesale</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button onClick={() => { changeTab('find'); setCategory('Feed Store'); setLocation('Houston, TX'); }} className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition text-left group">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2.5 group-hover:scale-105 transition">
                    <MagnifyingGlass className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">Find Livestock & Feed Stores</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Query verified OSM retailers in Houston, Fort Worth, or Montana.</p>
                </button>

                <button onClick={() => { changeTab('find'); setCategory('Equestrian Store'); setLocation('Lexington, KY'); }} className="p-4 bg-white rounded-xl border border-slate-200 hover:border-violet-300 hover:shadow-sm transition text-left group">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center mb-2.5 group-hover:scale-105 transition">
                    <Target className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">Find Equine & Tack Shops</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Target horse stables, equestrian centers, and rope salt lick distributors.</p>
                </button>

                <button onClick={() => changeTab('library')} className="p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-sm transition text-left group">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5 group-hover:scale-105 transition">
                    <BookBookmark className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">Review Saved Prospects</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Track qualification stage, notes, contact phone, and export to CSV.</p>
                </button>
              </div>
            </div>

            {/* Right Panel */}
            <div className="space-y-4">
              {/* Find New Leads CTA */}
              <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl p-4 text-white">
                <h4 className="text-xs font-bold mb-1">Find New Leads</h4>
                <p className="text-[11px] text-white/80 mb-3">Discover verified B2B prospects from OpenStreetMap.</p>
                <button onClick={() => { changeTab('find'); setCategory('Feed Store'); setLocation('Houston, TX'); }} className="w-full py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition">
                  Start Discovery
                </button>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Quick Actions</h4>
                {[
                  { icon: MagnifyingGlass, label: 'Find Leads', tab: 'find' as TabType },
                  { icon: TrendUp, label: 'Run ICP Research', tab: 'research' as TabType },
                  { icon: DownloadSimple, label: 'Export Lead Library', action: handleExportCSV },
                  { icon: PaperPlaneRight, label: 'Client Outreach', tab: 'outreach' as TabType },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => item.action ? item.action() : item.tab && changeTab(item.tab)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition text-left"
                  >
                    <item.icon className="w-3.5 h-3.5 text-slate-400" />
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Recent Activity</h4>
                {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                  <div className="space-y-2.5">
                    {stats.recentActivity.slice(0, 5).map((activity: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-slate-700">{activity.description}</p>
                          <p className="text-slate-400 text-[10px]">{activity.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No recent activity yet.</p>
                )}
              </div>
            </div>
          </div>

        {/* ══════════ FIND LEADS TAB ══════════ */}
        <div id="leados-panel-find" role="tabpanel" aria-labelledby="leados-tab-find" className={activeTab === 'find' ? "space-y-5" : "hidden"}>
          
          {/* ── 1. AI Smart Search Hero Card ── */}
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-[#f8f9ff] via-[#fbfcfe] to-[#f5f3ff] p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/10 flex items-center justify-center text-indigo-600">
                    <Sparkle weight="fill" className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">AI Smart Search</h2>
                  <span className="bg-[#584de3] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-sm">
                    <Sparkle weight="fill" className="w-3 h-3 text-white" /> Powered by Gemini
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Describe your ideal customers in plain English. AI will automatically set the right categories, locations, filters and find verified business leads.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHowItWorksModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 text-xs font-semibold hover:bg-indigo-50 shadow-sm transition"
                >
                  <Play weight="fill" className="w-3 h-3 text-indigo-600" /> See how it works
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode((m) => (m === 'ai' ? 'manual' : 'ai'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 shadow-sm transition"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  {searchMode === 'ai' ? 'Switch to Manual Search' : 'Switch to AI Smart Search'}
                </button>
              </div>
            </div>

            {/* Prompt Textarea + Action Button */}
            {searchMode === 'ai' ? (
              <div className="relative rounded-xl border border-indigo-200 bg-white shadow-sm p-3 flex flex-col md:flex-row items-stretch gap-3">
                <textarea
                  rows={2}
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void planAndSearch(true);
                    }
                  }}
                  placeholder="Find 100 livestock feed stores and mineral distributors in Houston, Dallas and Austin with websites, emails and phone numbers."
                  className="flex-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none resize-none font-medium leading-relaxed bg-transparent"
                />
                <button
                  type="button"
                  disabled={planning || searching}
                  onClick={() => void planAndSearch(true)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#5a4fe6] to-[#7c3aed] hover:from-[#4c42cb] hover:to-[#6d28d9] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition self-end md:self-center disabled:opacity-50 flex-shrink-0 cursor-pointer"
                >
                  {planning || searching ? (
                    <ArrowsClockwise className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkle weight="fill" className="w-4 h-4" />
                  )}
                  AI Find Leads →
                </button>
              </div>
            ) : (
              /* Manual direct search input */
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setCategoriesList([e.target.value]);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                    >
                      {PRESET_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Target Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => {
                        setLocation(e.target.value);
                        setLocationsList([e.target.value]);
                      }}
                      placeholder="e.g. Houston, TX or Dallas, TX"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Keywords</label>
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => {
                        setKeyword(e.target.value);
                        setKeywordsList(e.target.value ? e.target.value.split(/\s+/) : []);
                      }}
                      placeholder="e.g. livestock, feed, mineral"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={searching}
                    onClick={() => void handleSearch()}
                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                  >
                    {searching ? <ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> : <MagnifyingGlass className="w-3.5 h-3.5" />}
                    Search Leads
                  </button>
                </div>
              </div>
            )}

            {/* Example Prompt Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-600 text-[11px]">Try an example:</span>
              {[
                'Feed stores in Houston, TX',
                'Ranches with website in Texas',
                'Livestock distributors in USA',
                'Co-ops buying minerals',
                'Farm supply stores near me',
              ].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setAiQuery(ex);
                    void planAndSearch(true, ex);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 text-slate-600 text-[11px] font-medium transition cursor-pointer shadow-2xs"
                >
                  <MagnifyingGlass className="w-3 h-3 text-slate-400" />
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. AI Interpreted Search Plan Card ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle weight="fill" className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-slate-900 text-sm">AI Interpreted Search Plan</h3>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((v) => !v)}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 ml-2 cursor-pointer"
                >
                  <PencilSimple className="w-3.5 h-3.5" /> Edit if needed
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClearAllPlan}
                  className="text-rose-600 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Trash className="w-3.5 h-3.5" /> Clear All
                </button>
                <button
                  type="button"
                  onClick={handleSaveSearchTemplate}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <BookBookmark className="w-3.5 h-3.5" /> Save as Template
                </button>
              </div>
            </div>

            {/* 5-Column Filter Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              
              {/* Col 1: Business Types */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Storefront className="w-4 h-4 text-indigo-600" />
                  <span>Business Types</span>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center min-h-[38px]">
                  {categoriesList.map((cat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium"
                    >
                      {cat}
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(idx)}
                        className="text-indigo-400 hover:text-indigo-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {showAddCategory ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={newCategoryInput}
                        onChange={(e) => setNewCategoryInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowAddCategory(false); }}
                        placeholder="Add category"
                        className="px-2 py-0.5 text-xs border border-indigo-300 rounded w-28 focus:outline-none"
                      />
                      <button type="button" onClick={handleAddCategory} className="text-xs text-indigo-600 font-bold">Add</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddCategory(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 text-xs font-medium transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
              </div>

              {/* Col 2: Locations */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <span>Locations</span>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center min-h-[38px]">
                  {locationsList.map((loc, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium"
                    >
                      {loc}
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(idx)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {showAddLocation ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={newLocationInput}
                        onChange={(e) => setNewLocationInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddLocation(); if (e.key === 'Escape') setShowAddLocation(false); }}
                        placeholder="e.g. San Antonio, TX"
                        className="px-2 py-0.5 text-xs border border-indigo-300 rounded w-32 focus:outline-none"
                      />
                      <button type="button" onClick={handleAddLocation} className="text-xs text-indigo-600 font-bold">Add</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddLocation(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 text-xs font-medium transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add Location
                    </button>
                  )}
                </div>
              </div>

              {/* Col 3: Keywords */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <MagnifyingGlass className="w-4 h-4 text-indigo-600" />
                  <span>Keywords</span>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center min-h-[38px]">
                  {keywordsList.map((kw, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(idx)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {showAddKeyword ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={newKeywordInput}
                        onChange={(e) => setNewKeywordInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddKeyword(); if (e.key === 'Escape') setShowAddKeyword(false); }}
                        placeholder="Keyword"
                        className="px-2 py-0.5 text-xs border border-indigo-300 rounded w-24 focus:outline-none"
                      />
                      <button type="button" onClick={handleAddKeyword} className="text-xs text-indigo-600 font-bold">Add</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddKeyword(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 text-xs font-medium transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add Keyword
                    </button>
                  )}
                </div>
              </div>

              {/* Col 4: Contact Requirements */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Phone className="w-4 h-4 text-indigo-600" />
                  <span>Contact Requirements</span>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center min-h-[38px]">
                  <button
                    type="button"
                    onClick={() => setRequireWebsite((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition cursor-pointer ${
                      requireWebsite
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    Website {requireWebsite && <Check className="w-3 h-3 text-indigo-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequirePhone((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition cursor-pointer ${
                      requirePhone
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    Phone {requirePhone && <Check className="w-3 h-3 text-indigo-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequireEmail((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition cursor-pointer ${
                      requireEmail
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    Email {requireEmail && <Check className="w-3 h-3 text-indigo-600" />}
                  </button>
                </div>
              </div>

              {/* Col 5: Results Limit */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Results Limit</span>
                </div>
                <div className="flex items-center min-h-[38px]">
                  <select
                    value={resultsLimit}
                    onChange={(e) => setResultsLimit(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={150}>150</option>
                    <option value={200}>200</option>
                    <option value={250}>250</option>
                  </select>
                </div>
              </div>

            </div>

            {/* Advanced Filters Collapsible */}
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <GearSix className="w-3.5 h-3.5 text-slate-400" />
                  Advanced Filters &amp; Options (Radius, Search Sources, Company Size, More...)
                </span>
                {showAdvancedFilters ? <CaretUp className="w-3.5 h-3.5" /> : <CaretDown className="w-3.5 h-3.5" />}
              </button>

              {showAdvancedFilters && (
                <div className="grid sm:grid-cols-3 gap-3 pt-3 text-xs">
                  <label className="space-y-1 text-[11px] font-semibold text-slate-600">
                    Product to offer
                    <select
                      aria-label="Product interest"
                      className="w-full border border-slate-200 rounded-lg p-2 font-normal bg-white"
                      value={productInterest}
                      onChange={(e) => setProductInterest(e.target.value as ProductInterest)}
                    >
                      {PRODUCT_INTERESTS.map((p) => (
                        <option key={p} value={p}>{OFFER_PROFILES[p].label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold text-slate-600">
                    Map radius (km)
                    <input
                      aria-label="Radius in kilometers"
                      className="w-full border border-slate-200 rounded-lg p-2 font-normal"
                      type="number"
                      min={1}
                      max={100}
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(Number(e.target.value))}
                    />
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold text-slate-600">
                    Search depth
                    <select
                      aria-label="Search depth"
                      className="w-full border border-slate-200 rounded-lg p-2 font-normal bg-white"
                      value={searchDepth}
                      onChange={(e) => setSearchDepth(Number(e.target.value))}
                    >
                      <option value={1}>Standard (1 web query)</option>
                      <option value={2}>Expanded (2 queries)</option>
                    </select>
                  </label>
                  <div className="col-span-full flex flex-wrap gap-x-4 gap-y-2 pt-2 text-[11px] text-slate-600">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={excludeSaved} onChange={(e) => setExcludeSaved(e.target.checked)} />
                      New leads only
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={excludeContacted} onChange={(e) => setExcludeContacted(e.target.checked)} />
                      Skip contacted
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={wholesaleOnly} onChange={(e) => setWholesaleOnly(e.target.checked)} />
                      Wholesale only
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={privateLabelOnly} onChange={(e) => setPrivateLabelOnly(e.target.checked)} />
                      Private label only
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 3. Live Streaming Progress Indicator ("sath sath result deta jay") ── */}
          {searching && (
            <div className="p-3 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 font-semibold flex items-center justify-between shadow-xs animate-pulse">
              <div className="flex items-center gap-2">
                <ArrowsClockwise className="w-4 h-4 text-indigo-600 animate-spin flex-shrink-0" />
                <span>{searchStep || 'Querying B2B directories and map registries across target locations...'}</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white border border-indigo-200 text-indigo-700 text-[10px] font-bold tracking-wide uppercase flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                Live Progressive Discovery
              </span>
            </div>
          )}

          {searchError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
              <WarningCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {/* ── 4. Search Results Header & Actions ── */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-900">
                  Search Results ({leads.length} found)
                </h3>
                {leads.length > 0 && (
                  <>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle weight="fill" className="w-3.5 h-3.5 text-emerald-600" />
                      {leads.filter((l) => l.dataSource === 'openstreetmap' || (l.address && l.phone)).length} verified businesses
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <ClockCounterClockwise className="w-3.5 h-3.5 text-amber-600" />
                      {leads.filter((l) => !(l.dataSource === 'openstreetmap' || (l.address && l.phone))).length} need verification
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setResultsView((v) => (v === 'map' ? 'table' : 'map'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 text-xs font-semibold hover:bg-indigo-50 shadow-sm transition"
                >
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  {resultsView === 'map' ? 'View as Table' : 'View on Map'}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 shadow-sm transition"
                  >
                    <DownloadSimple className="w-3.5 h-3.5 text-slate-500" />
                    Export <CaretDown className="w-3 h-3 text-slate-400" />
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 text-xs">
                      <button
                        type="button"
                        onClick={handleExportSearchResultsCSV}
                        className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-slate-700 font-medium"
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleExportSearchResultsJSON}
                        className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-slate-700 font-medium"
                      >
                        Export JSON
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={selectedLeadIds.size === 0 || savingSelected}
                  onClick={handleSaveSelected}
                  className="px-4 py-1.5 rounded-lg bg-[#5a4fe6] hover:bg-[#493ecc] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <BookBookmark className="w-3.5 h-3.5 text-white" />
                  {savingSelected ? 'Saving...' : `Save Selected (${selectedLeadIds.size})`}
                </button>
              </div>
            </div>

            {/* ── 5. Results Table View ── */}
            {resultsView === 'table' ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 border-collapse">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="w-10 px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={leads.length > 0 && selectedLeadIds.size === leads.length}
                            onChange={handleToggleSelectAll}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </th>
                        <th className="w-10 px-2 py-3 text-slate-400">#</th>
                        <th className="px-3 py-3">Business Name</th>
                        <th className="px-3 py-3">Location</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3">Website</th>
                        <th className="px-3 py-3">Phone</th>
                        <th className="px-3 py-3">Email</th>
                        <th className="px-3 py-3">Source</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leads.length > 0 ? (
                        leads.map((lead, idx) => {
                          const isVerified = lead.dataSource === 'openstreetmap' || Boolean(lead.address && lead.phone);
                          const isSelected = selectedLeadIds.has(lead.businessName);
                          const isSaving = savingLeadId === lead.businessName;
                          return (
                            <tr key={`${lead.businessName}-${idx}`} className="hover:bg-slate-50/70 transition">
                              <td className="px-3 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectLead(lead.businessName)}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="px-2 py-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="px-3 py-3 font-semibold text-slate-900 max-w-[200px] truncate" title={lead.businessName}>
                                {lead.businessName}
                              </td>
                              <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                                {[lead.city, lead.region].filter(Boolean).join(', ') || lead.address || 'Texas'}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {lead.category}
                                </span>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {lead.website ? (
                                  <a
                                    href={lead.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-medium max-w-[130px] truncate"
                                    title={lead.website}
                                  >
                                    <Globe className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                    {lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                                  </a>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {lead.phone ? (
                                  <a
                                    href={`tel:${lead.phone}`}
                                    className="text-slate-700 hover:underline inline-flex items-center gap-1 font-medium"
                                  >
                                    <Phone className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                    {lead.phone}
                                  </a>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {lead.email ? (
                                  <a
                                    href={`mailto:${lead.email}`}
                                    className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-medium max-w-[150px] truncate"
                                    title={lead.email}
                                  >
                                    <EnvelopeSimple className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                    {lead.email}
                                  </a>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                                  <Globe className="w-3 h-3 text-slate-400" />
                                  {lead.dataSource === 'openstreetmap' ? 'OpenStreetMap' : lead.dataSource === 'searxng' ? 'Web Search' : 'Google Maps'}
                                </span>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {isVerified ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle weight="fill" className="w-3 h-3 text-emerald-600" />
                                    Verified
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    <ClockCounterClockwise className="w-3 h-3 text-amber-600" />
                                    Need verification
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveToLibrary(lead)}
                                    disabled={lead.alreadySaved || isSaving}
                                    title={lead.alreadySaved ? 'Already saved in Lead Library' : 'Save to Lead Library'}
                                    className={`p-1.5 rounded-lg border text-xs font-semibold transition ${
                                      lead.alreadySaved
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
                                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                    }`}
                                  >
                                    {lead.alreadySaved ? (
                                      <CheckCircle weight="fill" className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : isSaving ? (
                                      <ArrowsClockwise className="w-3.5 h-3.5 animate-spin text-slate-600" />
                                    ) : (
                                      <BookBookmark className="w-3.5 h-3.5 text-slate-600" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAIAnalyze(lead)}
                                    title="AI Lead Assessment"
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-indigo-600 transition"
                                  >
                                    <Robot className="w-3.5 h-3.5 text-indigo-600" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={11} className="py-12 text-center text-slate-400">
                            <div className="max-w-sm mx-auto space-y-2">
                              <MagnifyingGlass className="w-8 h-8 text-slate-300 mx-auto" />
                              <p className="text-xs font-medium text-slate-600">No leads discovered yet</p>
                              <p className="text-[11px] text-slate-400">
                                Click &quot;AI Find Leads&quot; above to search Houston, Dallas, Austin, and broad regions with live streaming results.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Map / Location View */
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-900">Geographic Spread ({leads.length} locations)</h4>
                  </div>
                  <span className="text-xs text-slate-500">Targeting Houston, Dallas, Austin and Texas metros</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {leads.map((lead, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-bold text-xs text-slate-900">{lead.businessName}</h5>
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold">{lead.category}</span>
                        </div>
                        {lead.osmUrl && (
                          <a href={lead.osmUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-[10px] hover:underline flex items-center gap-0.5">
                            Map <ArrowSquareOut className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">{lead.address || [lead.city, lead.region].filter(Boolean).join(', ') || 'Local area'}</p>
                      {lead.phone && <p className="text-[11px] text-emerald-700 font-medium">📞 {lead.phone}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 6. "See How It Works" Informational Modal ── */}
          {showHowItWorksModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkle weight="fill" className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-slate-900 text-base">How AI Smart Search Works</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHowItWorksModal(false)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3 text-xs text-slate-600">
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">1</span>
                    <div>
                      <strong className="text-slate-900 block">Plain English Intent</strong>
                      Type naturally in English or Roman Urdu. E.g., &quot;Find 100 livestock feed stores in Houston, Dallas and Austin&quot;.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">2</span>
                    <div>
                      <strong className="text-slate-900 block">AI Planning with Gemini</strong>
                      Gemini parses multiple cities, buyer categories, keywords, and contact requirements automatically into an editable plan.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">3</span>
                    <div>
                      <strong className="text-slate-900 block">Live Progressive Streaming</strong>
                      Searches run across each target location in real time. Discovered leads immediately appear on screen batch by batch without waiting.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">4</span>
                    <div>
                      <strong className="text-slate-900 block">Bulk Save &amp; CSV Export</strong>
                      Select discovered prospects with checkboxes and save in bulk to your Lead Library or download as CSV.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHowItWorksModal(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition"
                >
                  Got it
                </button>
              </div>
            </div>
          )}

          {/* ── 7. AI Factual Assessment Modal ── */}
          {analyzingLeadName && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Robot className="w-4 h-4 text-indigo-600" />
                    <h4 className="font-bold text-slate-900 text-sm">AI Factual Assessment</h4>
                  </div>
                  <button
                    type="button"
                    aria-label="Close AI factual assessment"
                    onClick={() => { setAnalyzingLeadName(null); setAiAnalysisResult(null); }}
                    className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[11px] text-slate-500">
                  Business: <span className="text-slate-900 font-bold">{analyzingLeadName}</span>
                </div>
                {!aiAnalysisResult && !aiError && (
                  <div className="py-8 text-center space-y-2">
                    <ArrowsClockwise className="w-5 h-5 animate-spin mx-auto text-indigo-600" />
                    <p className="text-[11px] text-slate-500">Querying server-side model...</p>
                  </div>
                )}
                {aiError && (
                  <div className="p-3 bg-red-50 text-red-800 rounded-lg text-[11px] flex items-center gap-2">
                    <WarningCircle className="w-4 h-4 text-red-600" /> {aiError}
                  </div>
                )}
                {aiAnalysisResult && (
                  <div className="space-y-3 text-[11px]">
                    <div className="p-3 bg-indigo-50 rounded-lg text-indigo-950 space-y-1">
                      <span className="font-bold">Summary:</span>
                      <p className="text-indigo-900">{aiAnalysisResult.analysis?.summary}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 font-medium block">Suitability:</span>
                        <span className="font-bold text-slate-800">{aiAnalysisResult.analysis?.potentialValue}</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 font-medium block">Confidence:</span>
                        <span className="font-bold text-slate-800 capitalize">{aiAnalysisResult.analysis?.confidence}</span>
                      </div>
                    </div>
                    {aiAnalysisResult.analysis?.opportunitySignals?.length > 0 && (
                      <div className="space-y-1">
                        <span className="font-bold text-slate-700">Signals:</span>
                        <ul className="space-y-1 text-slate-600">
                          {aiAnalysisResult.analysis.opportunitySignals.map((s: string, i: number) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <CheckCircle className="w-3 h-3 text-indigo-600" /> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setAnalyzingLeadName(null); setAiAnalysisResult(null); }}
                  className="w-full py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ══════════ LEAD LIBRARY TAB ══════════ */}
        <div id="leados-panel-library" role="tabpanel" aria-labelledby="leados-tab-library" className={activeTab === 'library' ? "space-y-4" : "hidden"}>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Lead Library</h3>
                  <p className="text-[11px] text-slate-500">Manage saved prospects, qualification status, and export to CSV.</p>
                </div>
                <button onClick={handleExportCSV} className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] shadow-sm flex items-center gap-1.5 transition">
                  <DownloadSimple className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlass className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input type="text" placeholder="Search by name, category, or city..." value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-[11px] focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-700 bg-white">
                  <option value="all">All Statuses</option>
                  {LEAD_PIPELINE.map((state) => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}
                  <option value="disqualified">Disqualified (legacy)</option>
                </select>
              </div>
            </div>

            {libraryError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800" role="alert">
                Lead Library error: {libraryError}
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {loadingLibrary ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  <ArrowsClockwise className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                  Loading saved prospects...
                </div>
              ) : libraryLeads.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <BookBookmark className="w-7 h-7 text-slate-300 mx-auto" />
                  <h4 className="font-bold text-slate-800 text-xs">No Saved Leads Found</h4>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">Go to <b>Find Leads</b> and search for businesses, then click &quot;Save Lead&quot; to add them here.</p>
                  <button onClick={() => changeTab('find')} className="mt-2 px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold text-[11px]">Discover Leads</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Business Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Contact & Provenance</th>
                        <th className="py-2.5 px-3">Website</th>
                        <th className="py-2.5 px-3">Score</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {libraryLeads.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50/60 transition">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {l.businessName}
                            {l.osmUrl && <a href={l.osmUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-indigo-600 inline-flex"><ArrowSquareOut className="w-2.5 h-2.5" /></a>}
                          </td>
                          <td className="py-2.5 px-3"><span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium text-slate-600">{l.category || 'N/A'}</span></td>
                          <td className="py-2.5 px-3 text-slate-600">{[l.city, l.region].filter(Boolean).join(', ') || '—'}</td>
                          <td className="py-2.5 px-3">
                            {l.email ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-slate-900">{l.email}</span>
                                <span className={`text-[10px] ${l.emailSource === 'company_website' ? 'text-emerald-700' : 'text-amber-800'}`}>{l.emailSource === 'company_website' ? 'Published on company website' : l.emailSource === 'manually_entered' ? 'Owner entered — unverified' : l.emailSource === 'discovered_osm' ? 'OSM record — unverified' : 'Unverified'}</span>
                              </div>
                            ) : (
                              <button onClick={() => handleOpenEmailModal(l)} className="text-indigo-600 hover:underline flex items-center gap-1 font-medium"><Plus className="w-3 h-3" /> Add</button>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {l.website ? <a href={l.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 max-w-[120px] truncate">{l.website.replace(/^https?:\/\//, '')} <ArrowSquareOut className="w-2.5 h-2.5" /></a> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2.5 px-3">{l.research?.qualification ? <ScoreBadge score={l.research.qualification.score} label="Fit" /> : l.opportunityScore != null ? <ScoreBadge score={l.opportunityScore} label="Priority" /> : <span className="text-slate-500">Not assessed</span>}</td>
                          <td className="py-2.5 px-3">
                            <select value={l.status} onChange={(e) => handleUpdateLeadStatus(l.id, e.target.value)} className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-semibold bg-white focus:outline-none">
                              {LEAD_PIPELINE.map((state) => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}
                              {!LEAD_PIPELINE.includes(l.status as typeof LEAD_PIPELINE[number]) && <option value={l.status}>{l.status}</option>}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => startOutreachForLead(l)} className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[10px] flex items-center gap-1 transition"><PaperPlaneRight className="w-3 h-3" /> Outreach</button>
                              <button onClick={() => handleOpenEmailModal(l)} className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-indigo-50 transition" title="Edit"><PencilSimple className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDeleteSavedLead(l.id)} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition" title="Delete"><Trash className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        {/* ══════════ RESEARCH TAB ══════════ */}
        <div id="leados-panel-research" role="tabpanel" aria-labelledby="leados-tab-research" className={activeTab === 'research' ? "bg-white rounded-xl border border-slate-200 p-5 space-y-4" : "hidden"}>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Multi-Category Market Research</h3>
            <p className="text-[11px] text-slate-500">Choose a relevant buyer category and location. Searches are bounded and respect shared provider pacing.</p>
          </div>
          <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 text-[11px] text-indigo-950">
            <span className="font-bold block mb-1.5">Automated Scan Categories:</span>
            <div className="flex flex-wrap gap-1">{BUYER_CATEGORIES.map((c) => (<span key={c} className="px-2 py-0.5 rounded bg-white font-medium text-slate-700 border border-indigo-200/70">{c}</span>))}</div>
          </div>
          <div className="flex items-center gap-2">
            <input type="text" name="researchRegion" aria-label="Target research region" placeholder="Target Region (e.g. Texas, Montana, Kentucky)" value={researchRegion} onChange={(e) => setResearchRegion(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium" />
            <button type="button" onClick={() => { setLocation(researchRegion || 'Texas'); changeTab('find'); }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 shadow-sm transition">Launch Scan</button>
          </div>
        </div>

        {/* ══════════ SCORING RULES TAB ══════════ */}
        <div id="leados-panel-scoring" role="tabpanel" aria-labelledby="leados-tab-scoring" className={activeTab === 'scoring' ? "space-y-6" : "hidden"}>
          {activeProject && (
            <form onSubmit={handleSaveProjectICP} className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Ideal Customer Profile (ICP) Target Market & Fit Keywords</h3>
                    <p className="text-[11px] text-slate-500">Configures target market rules for Project Fit scoring (0–100) and discovery relevance.</p>
                  </div>
                  <button type="submit" disabled={savingProject} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5">
                    {savingProject ? (<><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Saving...</>) : 'Save ICP'}
                  </button>
                </div>
                {projectSavedMsg && <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" /> {projectSavedMsg}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  <div className="space-y-1"><label className="font-semibold text-slate-600">Project / Business Name</label><input type="text" value={activeProject.name} onChange={(e) => setActiveProject({ ...activeProject, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium" /></div>
                  <div className="space-y-1"><label className="font-semibold text-slate-600">Website / Storefront URL</label><input type="text" value={activeProject.website || ''} onChange={(e) => setActiveProject({ ...activeProject, website: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium" /></div>
                  <div className="space-y-1 md:col-span-2"><label className="font-semibold text-slate-600">Product / Service Definition</label><input type="text" value={activeProject.productService || ''} onChange={(e) => setActiveProject({ ...activeProject, productService: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium" /></div>
                  <div className="space-y-1 md:col-span-2"><label className="font-semibold text-slate-600">Target Customer Description</label><input type="text" value={activeProject.targetCustomerDescription || ''} onChange={(e) => setActiveProject({ ...activeProject, targetCustomerDescription: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium" /></div>
                  <div className="space-y-1 md:col-span-2"><label className="font-semibold text-slate-600">Ideal Customer Profile (Narrative)</label><textarea rows={3} value={activeProject.idealCustomerProfile || ''} onChange={(e) => setActiveProject({ ...activeProject, idealCustomerProfile: e.target.value })} className="w-full p-3 rounded-lg border border-slate-200 font-medium" /></div>
                  <div className="space-y-1"><label className="font-semibold text-slate-600">Positive Keywords (comma separated)</label><input type="text" value={(activeProject.positiveKeywords || []).join(', ')} onChange={(e) => setActiveProject({ ...activeProject, positiveKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium" /></div>
                  <div className="space-y-1"><label className="font-semibold text-slate-600">Negative Keywords (comma separated)</label><input type="text" value={(activeProject.negativeKeywords || []).join(', ')} onChange={(e) => setActiveProject({ ...activeProject, negativeKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium" /></div>
                </div>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Deterministic Opportunity Scoring Weights</h3>
              <p className="text-[11px] text-slate-500">Opportunity scores (0–100) based on observed data completeness and outreach signals.</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr><th className="py-2.5 px-3">Signal Key</th><th className="py-2.5 px-3">Signal Name</th><th className="py-2.5 px-3">Weight</th><th className="py-2.5 px-3">Impact</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weights.map((w) => (
                    <tr key={w.signalKey} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-slate-600">{w.signalKey}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{w.signalName}</td>
                      <td className="py-2.5 px-3"><span className={`px-1.5 py-0.5 rounded font-bold ${w.weight > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{w.weight > 0 ? `+${w.weight}` : w.weight}</span></td>
                      <td className="py-2.5 px-3 text-slate-500">{w.weight > 0 ? 'Increases priority' : 'Decreases necessity'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ══════════ CLIENT OUTREACH TAB ══════════ */}
        <div id="leados-panel-outreach" role="tabpanel" aria-labelledby="leados-tab-outreach" className={activeTab === 'outreach' ? "space-y-4" : "hidden"}>
          <LeadIntelligencePanel key={activeOutreachLeadId || 'workspace'} initialLeadId={activeOutreachLeadId} headers={getAuthHeaders} onSavedSearch={(saved) => { setCategory(saved.category || 'Feed Store'); setLocation(saved.location || 'Houston, TX'); setProductInterest(saved.productInterest || 'horse_salt'); setKeyword(saved.keyword || ''); setMaxResults(saved.maxResults || 15); setRadiusKm(saved.radiusKm || 25); setSearchDepth(saved.searchDepth || 1); setRequireWebsite(Boolean(saved.requireWebsite)); setRequirePhone(Boolean(saved.requirePhone)); setRequireEmail(Boolean(saved.requireEmail)); setExcludeSaved(Boolean(saved.excludeSaved)); setExcludeContacted(Boolean(saved.excludeContacted)); setWholesaleOnly(Boolean(saved.wholesaleOnly)); setPrivateLabelOnly(Boolean(saved.privateLabelOnly)); changeTab('find'); }} />

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><PaperPlaneRight className="w-4 h-4 text-indigo-600" /> Client & B2B Wholesale Outreach</h3>
                <p className="text-[11px] text-slate-500">Targeted email outreach for discovered animal feed, equine tack, and bulk salt buyers.</p>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Simulation Mode</span>
            </div>
            <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
              <WarningCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div><span className="font-bold block text-amber-950">Safety Mode Active [SIMULATION]</span><p className="mt-0.5 text-amber-800">This composer records a simulation in the audit trail and sends no email. Persistent reviewed drafts above use the separately gated n8n workflow.</p></div>
            </div>
          </div>

          {sendResultNotice && (
            <div className={`p-3 rounded-lg text-[11px] flex items-start gap-2 border ${sendResultNotice.ok ? sendResultNotice.simulated ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              {sendResultNotice.ok ? <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <WarningCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
              <div className="flex-1 font-medium">{sendResultNotice.msg}</div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 space-y-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-indigo-600" /> Select Prospect</h4>
                <select value={activeOutreachLeadId || ''} onChange={(e) => { const l = libraryLeads.find((x) => x.id === e.target.value); if (l) startOutreachForLead(l); }} className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-800 bg-white">
                  <option value="">-- Choose from saved ({libraryLeads.length}) --</option>
                  {libraryLeads.map((l) => (<option key={l.id} value={l.id}>{l.businessName} ({l.city || 'Local'}) {l.email ? `[${l.email}]` : '[No Email]'}</option>))}
                </select>
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Templates</span>
                  {OUTREACH_TEMPLATES.map((tmpl) => (
                    <button key={tmpl.id} type="button" onClick={() => handleTemplateSelect(tmpl)} className={`w-full text-left p-2.5 rounded-lg border transition text-[11px] ${selectedTemplate.id === tmpl.id ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-semibold' : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                      <div className="font-bold">{tmpl.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{tmpl.category}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <form onSubmit={handleSendOutreach} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5"><EnvelopeSimple className="w-3.5 h-3.5 text-indigo-600" /> Wholesale Email Composer</h4>
                  <span className="text-[10px] font-medium text-slate-400">Tokens: {'{business_name}'}, {'{city}'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Business Name</label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="e.g. Hill Country Feed" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></div>
                  <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Recipient Email</label><input type="email" value={recipientEmail} onChange={(e) => { setRecipientEmail(e.target.value); setRecipientEmailSource('manually_entered'); }} placeholder="buyer@feedstore.com" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></div>
                </div>
                <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Subject Line</label><input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></div>
                <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Email Body</label><textarea rows={10} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono leading-relaxed" /></div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">Sender: <span className="font-semibold text-slate-700">sales@himalayankoh.com</span></span>
                  <button type="submit" disabled={sendingOutreach} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5">
                    {sendingOutreach ? (<><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Sending...</>) : (<><PaperPlaneRight className="w-3.5 h-3.5" /> Preview simulation</>)}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ══════════ AI ENGINE TAB ══════════ */}
        <div id="leados-panel-ai" role="tabpanel" aria-labelledby="leados-tab-ai" className={activeTab === 'ai' ? "bg-white rounded-xl border border-slate-200 p-5 space-y-4" : "hidden"}>
          <div>
            <h3 className="text-sm font-bold text-slate-900">AI Intelligence Configuration</h3>
            <p className="text-[11px] text-slate-500">Server-side Google Gemini (primary, from Admin → Settings → API Keys) with OpenRouter / DeepSeek fallback enriches discovered leads on-demand. Search itself is deterministic and needs no AI key.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between"><span className="font-bold text-slate-900">Google Gemini (Primary)</span><span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-800">Recommended</span></div>
              <p className="text-slate-600">Uses the Google key saved in Admin → Settings → API Keys. No extra setup.</p>
              <button onClick={async () => { const headers = await getAuthHeaders(); const res = await fetch('/api/admin/leados/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action: 'test', provider: 'gemini' }) }); const d = await res.json(); alert(d.configured ? `Gemini connection verified (${d.model})` : 'Gemini API key not configured — add it in Admin → Settings → API Keys'); }} className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100">Test Connection</button>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between"><span className="font-bold text-slate-900">OpenRouter (Fallback)</span><span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-slate-200 text-slate-700">Fallback</span></div>
              <p className="text-slate-600">Used automatically only when Gemini is unavailable.</p>
              <button onClick={async () => { const headers = await getAuthHeaders(); const res = await fetch('/api/admin/leados/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action: 'test', provider: 'openrouter' }) }); const d = await res.json(); alert(d.configured ? `OpenRouter connection verified (${d.model})` : 'API key not configured'); }} className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100">Test Connection</button>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between"><span className="font-bold text-slate-900">Safety & Truth Invariance</span><span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-100 text-indigo-800">Enforced</span></div>
              <p className="text-slate-600">AI failures never block search. Leads always returned deterministically. Hallucinated metrics strictly prohibited.</p>
            </div>
          </div>
        </div>

        {/* ══════════ SETTINGS TAB ══════════ */}
        <div id="leados-panel-settings" role="tabpanel" aria-labelledby="leados-tab-settings" className={activeTab === 'settings' ? "bg-white rounded-xl border border-slate-200 p-5 space-y-4" : "hidden"}>
          <div>
            <h3 className="text-sm font-bold text-slate-900">LeadOS System Settings</h3>
            <p className="text-[11px] text-slate-500">System architecture, isolated database tables, and provider endpoints.</p>
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono space-y-0.5">
              <div className="font-bold text-slate-800">Database Namespacing:</div>
              <div className="text-slate-600">All tables prefixed: leados_*</div>
              <div className="text-slate-600">Access control: WordPress administrator capability + storefront admin RBAC</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono space-y-0.5">
              <div className="font-bold text-slate-800">Lead Data Sources:</div>
              <div className="text-slate-600">Geocoding: OpenStreetMap Nominatim</div>
              <div className="text-slate-600">Entity Discovery: OpenStreetMap Overpass API</div>
              <div className="text-slate-600">Scoring: In-Memory Deterministic</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Email Edit Modal ── */}
      {editingEmailLead && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <PencilSimple className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-sm">Edit Contact Details</h4>
              </div>
              <button onClick={() => setEditingEmailLead(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>
            <div className="text-[11px] text-slate-600">Editing <span className="font-bold text-slate-900">{editingEmailLead.businessName}</span>. Manually entered emails marked as <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-semibold text-emerald-800">manually_entered</code>.</div>
            <form onSubmit={handleSaveEmailModal} className="space-y-3">
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Email</label><input type="email" value={inputEmail} onChange={(e) => setInputEmail(e.target.value)} placeholder="contact@store.com" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></div>
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Phone</label><input type="text" value={inputPhone} onChange={(e) => setInputPhone(e.target.value)} placeholder="(800) 555-0199" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></div>
              {emailModalNotice && <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 font-medium">{emailModalNotice}</div>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditingEmailLead(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingEmail} className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 transition">
                  {savingEmail ? (<><ArrowsClockwise className="w-3 h-3 animate-spin" /> Saving...</>) : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
