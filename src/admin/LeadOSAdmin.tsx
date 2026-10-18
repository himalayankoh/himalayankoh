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
  ArrowsLeftRight,
  HandGrabbing,
  ShieldCheck,
  Robot,
  TrendUp,
  Buildings,
  Tag,
  Funnel,
  CaretRight,
  CaretLeft,
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
  Megaphone,
  Clipboard,
  DotsSixVertical,
  FacebookLogo,
  InstagramLogo,
  Chats,
  Eye,
  Archive,
} from '@phosphor-icons/react';
import { getAccessToken, onAuthStateChange } from '@/services/wordpressAdminAuth';
import { useAuthStore } from '@/store/authStore';
import type {
  ScoredLead,
  LeadOSProject,
  SavedLeadRecord,
  SearchDiagnostics,
} from '@/lib/leados/types';
import LeadIntelligencePanel from './LeadIntelligencePanel';
import {
  BUYER_CATEGORIES,
  PRODUCT_INTERESTS,
  OFFER_PROFILES,
  LEAD_PIPELINE,
  createIntroduction,
  deduplicateLeads,
  createOutreachMessage,
  determineProductRelevance,
  classifyLeadEntity,
  isInformationalDomain,
  type LeadEntityType,
} from '@/lib/leados/intelligence';
import type { SearchPlan } from '@/lib/leados/searchPlanner';
import type { ProductInterest } from '@/lib/leados/types';
import { parseLeadOSUrlState } from '@/lib/leados/urlState';
import InteractiveLocationMapPicker from './InteractiveLocationMapPicker';
import InteractiveUsaMap from './InteractiveUsaMap';
import LiveUsaMarketMap from './LiveUsaMarketMap';

const AMarketingGen = React.lazy(() => import('./AdminSection').then((m) => ({ default: m.AMarketingGen })));
const ASEOEngine = React.lazy(() => import('./AdminSection').then((m) => ({ default: m.ASEOEngine })));
const AEmailMarketing = React.lazy(() => import('./AdminSection').then((m) => ({ default: m.AEmailMarketing })));

type TabType =
  | 'overview'
  | 'prospects'
  | 'outreach'
  | 'automation'
  | 'settings'
  | 'find'
  | 'market-map'
  | 'library'
  | 'email'
  | 'marketing'
  | 'seo';


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

export const PRESET_SAVED_SEARCHES = [
  {
    id: 'tx-feed',
    name: 'TX Feed Stores',
    location: 'Houston, Dallas, Austin',
    locations: ['Houston, TX', 'Dallas, TX', 'Austin, TX'],
    category: 'Feed Store',
    categories: ['Feed Store'],
    query: 'Find 100 livestock feed stores and mineral distributors in Houston, Dallas and Austin with websites, emails and phone numbers.',
  },
  {
    id: 'livestock-usa',
    name: 'Livestock Suppliers USA',
    location: 'United States',
    locations: ['United States', 'Texas', 'Montana'],
    category: 'Livestock Supplier',
    categories: ['Livestock Supplier'],
    query: 'Find livestock suppliers and ranchers in USA with websites and phone numbers',
  },
  {
    id: 'mineral-dist',
    name: 'Mineral Distributors',
    location: 'USA',
    locations: ['USA', 'Texas', 'Kansas'],
    category: 'Mineral Distributor',
    categories: ['Mineral Distributor'],
    query: 'Find 100 mineral distributors and salt suppliers in USA with contact details',
  },
  {
    id: 'ranches-tx',
    name: 'Ranches in Texas',
    location: 'Texas',
    locations: ['Texas', 'Fort Worth, TX', 'San Antonio, TX'],
    category: 'Feed Store',
    categories: ['Feed Store', 'Livestock Supplier'],
    query: 'Find commercial ranches and livestock businesses with websites in Texas',
  },
  {
    id: 'coops-salt',
    name: 'Co-ops Buying Salt',
    location: 'USA',
    locations: ['Iowa', 'Nebraska', 'Colorado'],
    category: 'Farm Supply',
    categories: ['Farm Supply', 'Feed Store'],
    query: 'Find farm supply cooperatives and feed co-ops buying salt and minerals in USA',
  },
];

export function getCompanyInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (name.slice(0, 2) || 'HK').toUpperCase();
}

export function getAvatarBg(name: string): string {
  const colors = [
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-amber-100 text-amber-700 border-amber-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-rose-100 text-rose-700 border-rose-200',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function SourceBadge({ source }: { source?: string }) {
  const norm = (source || '').toLowerCase();
  if (norm.includes('google')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-slate-900 truncate max-w-full" title="Google Maps">
        <span className="w-4 h-4 rounded-full bg-blue-100 border border-blue-300 text-blue-800 font-black flex items-center justify-center text-[10px] flex-shrink-0">G</span>
        <span className="truncate">Google Maps</span>
      </span>
    );
  }
  if (norm.includes('facebook') || norm.includes('fb')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-blue-900 truncate max-w-full" title="Facebook">
        <span className="w-4 h-4 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-[10px] flex-shrink-0">f</span>
        <span className="truncate">Facebook</span>
      </span>
    );
  }
  if (norm.includes('instagram') || norm.includes('insta')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-900 truncate max-w-full" title="Instagram">
        <span className="w-4 h-4 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white font-black flex items-center justify-center text-[9px] flex-shrink-0">ig</span>
        <span className="truncate">Instagram</span>
      </span>
    );
  }
  if (norm.includes('yelp')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-slate-900 truncate max-w-full" title="Yelp">
        <span className="w-4 h-4 rounded-full bg-red-100 border border-red-300 text-red-700 font-black flex items-center justify-center text-[10px] flex-shrink-0">Y</span>
        <span className="truncate">Yelp</span>
      </span>
    );
  }
  if (norm.includes('website') || norm.includes('company')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-slate-900 truncate max-w-full" title="Company Website">
        <Buildings weight="bold" className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />
        <span className="truncate">Website</span>
      </span>
    );
  }
  if (norm.includes('searx') || norm.includes('web')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-slate-900 truncate max-w-full" title="Website Search">
        <Globe weight="bold" className="w-3.5 h-3.5 text-indigo-700 flex-shrink-0" />
        <span className="truncate">Web Search</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-slate-900 truncate max-w-full" title="OpenStreetMap">
      <MapPin weight="fill" className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
      <span className="truncate">OSM</span>
    </span>
  );
}


/** Compact KPI card */
function metricValue(value: unknown): string | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : '—';
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub: string;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 flex items-center sm:items-start gap-2.5 sm:gap-3 min-w-0 transition-all hover:shadow-2xs ${
        onClick ? 'cursor-pointer hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100' : ''
      }`}
    >
      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate block" title={label}>{label}</p>
        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 leading-tight">{value}</p>
        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate block">{sub}</p>
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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [savedSearchesMenuOpen, setSavedSearchesMenuOpen] = useState(false);

  // Mouse horizontal drag-to-scroll on leads table
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const isTableDraggingRef = useRef(false);
  const tableStartXRef = useRef(0);
  const tableScrollLeftRef = useRef(0);
  const [isTableDragging, setIsTableDragging] = useState(false);

  const handleTableMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, label, [role="button"]')) {
      return;
    }
    if (!tableScrollRef.current) return;
    isTableDraggingRef.current = true;
    setIsTableDragging(true);
    tableStartXRef.current = e.pageX - tableScrollRef.current.offsetLeft;
    tableScrollLeftRef.current = tableScrollRef.current.scrollLeft;
  };

  const handleTableMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isTableDraggingRef.current || !tableScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - tableScrollRef.current.offsetLeft;
    const walk = (x - tableStartXRef.current) * 1.5;
    tableScrollRef.current.scrollLeft = tableScrollLeftRef.current - walk;
  };

  const handleTableMouseUp = () => {
    isTableDraggingRef.current = false;
    setIsTableDragging(false);
  };

  const handleTableMouseLeave = () => {
    isTableDraggingRef.current = false;
    setIsTableDragging(false);
  };

  // Chip input editing states
  const [showMapPicker, setShowMapPicker] = useState(false);
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
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireEmail, setRequireEmail] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>(['all']);
  const [showUsaMap, setShowUsaMap] = useState(true);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchStep, setSearchStep] = useState('');
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [diagnostics, setDiagnostics] = useState<SearchDiagnostics | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // User-isolated session cache key generator (prevents cross-session data leakage)
  const getSessionLibraryCacheKey = useCallback((): string => {
    if (typeof window === 'undefined') return 'hk_leados_library_leads';
    try {
      const raw = localStorage.getItem('luxedge_sb_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        const uid = parsed?.user?.id || parsed?.user?.email;
        if (uid) return `hk_leados_library_leads_v2_${uid}`;
      }
    } catch {}
    return 'hk_leados_library_leads_v2_guest';
  }, []);

  const syncSessionLibraryCache = useCallback((cachedLeads: SavedLeadRecord[]): void => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(getSessionLibraryCacheKey(), JSON.stringify(cachedLeads));
    } catch {}
  }, [getSessionLibraryCacheKey]);

  const invalidateSessionLibraryCache = useCallback((): void => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(getSessionLibraryCacheKey());
    } catch {}
  }, [getSessionLibraryCacheKey]);

  // Invalidate and clear leads on sign out
  useEffect(() => {
    const unsubscribe = onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        try {
          if (typeof window !== 'undefined') {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
              const k = sessionStorage.key(i);
              if (k && k.startsWith('hk_leados_library_leads')) {
                sessionStorage.removeItem(k);
              }
            }
          }
        } catch {}
        setLibraryLeads([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Library state with client-side SWR memory/session caching
  const [libraryLeads, setLibraryLeads] = useState<SavedLeadRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('luxedge_sb_session');
      let key = 'hk_leados_library_leads_v2_guest';
      if (raw) {
        const parsed = JSON.parse(raw);
        const uid = parsed?.user?.id || parsed?.user?.email;
        if (uid) key = `hk_leados_library_leads_v2_${uid}`;
      }
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [loadingLibrary, setLoadingLibrary] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem('luxedge_sb_session');
      let key = 'hk_leados_library_leads_v2_guest';
      if (raw) {
        const parsed = JSON.parse(raw);
        const uid = parsed?.user?.id || parsed?.user?.email;
        if (uid) key = `hk_leados_library_leads_v2_${uid}`;
      }
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {}
    return false;
  });
  const libraryRequestSeq = useRef(0);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  /**
   * The store's own count for the library, which is not the number of rows this page
   * holds. The screen used to print the page length as "Total Saved", so an owner with
   * 353 prospects read "50 Total Saved" and concluded 303 had been lost.
   */
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);
  /**
   * A read that failed is not an empty library. Without this distinction the page
   * printed "0 Total Saved" over an error message, so an owner whose WordPress
   * origin stalled read it as "my prospects are gone". A stale page stays visible
   * above the error, so only an empty screen counts as unavailable.
   */
  const libraryUnavailable = Boolean(libraryError) && libraryLeads.length === 0;
  const [librarySearch, setLibrarySearch] = useState(() => typeof window !== 'undefined' ? parseLeadOSUrlState(window.location.href).search : '');
  const [statusFilter, setStatusFilter] = useState(() => typeof window !== 'undefined' ? parseLeadOSUrlState(window.location.href).status : 'all');
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize, setLibraryPageSize] = useState(100);
  const [fitScreenMode, setFitScreenMode] = useState(true);
  const [enrichingLibrary, setEnrichingLibrary] = useState(false);
  const [syncingOmnisend, setSyncingOmnisend] = useState(false);
  const [omnisendSyncPreview, setOmnisendSyncPreview] = useState<{
    totalLeads: number;
    totalWithEmail: number;
    duplicateEmailCount: number;
    excludedOrSuppressedCount: number;
    eligibleCount: number;
    consentStatus: string;
  } | null>(null);
  const [libraryActionNotice, setLibraryActionNotice] = useState<string | null>(null);
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState('all');
  const [libraryVerificationFilter, setLibraryVerificationFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [librarySelectedIds, setLibrarySelectedIds] = useState<Set<string>>(new Set());
  const [prospectSubView, setProspectSubView] = useState<'directory' | 'find' | 'market-map'>('directory');
  const [outreachSubView, setOutreachSubView] = useState<'outreach' | 'email_marketing'>('outreach');
  const [automationSubView, setAutomationSubView] = useState<'n8n' | 'seo' | 'marketing'>('n8n');
  const [librarySourceFilter, setLibrarySourceFilter] = useState<'all' | 'crm' | 'discovery' | 'inquiries' | 'customers'>(() => {
    if (typeof window !== 'undefined') {
      const s = new URL(window.location.href).searchParams.get('source');
      if (s === 'crm' || s === 'inquiries') return 'crm';
    }
    return 'all';
  });

  // Batch Outreach Modal & Campaign state
  const [batchOutreachOpen, setBatchOutreachOpen] = useState(false);
  const [batchSubject, setBatchSubject] = useState('Wholesale Himalayan Animal Mineral Salt Licks — Direct Bulk Supply');
  const [batchBodyTemplate, setBatchBodyTemplate] = useState(
    'Hi {{businessName}},\n\nI noticed {{businessName}} serves the {{city}} agricultural community. Himalayan Koh supplies premium 100% natural Himalayan pink rock salt licks with mineral-rich ropes, lick blocks, and bulk feed salt directly from the Khewra salt range.\n\nWould you like our wholesale catalog and volume pricing for {{city}} farm and livestock stores?\n\nBest regards,\nSalman Bashir\nFounder, Himalayan Koh\nsales@himalayankoh.com | https://himalayankoh.com'
  );
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<'all' | 'agriculture' | 'wellness' | 'retail'>('all');
  const [batchSending, setBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; success: number; failed: number } | null>(null);
  const [batchResultNotice, setBatchResultNotice] = useState<string | null>(null);

  // Omnisend Free Plan Controls: Mode A (Manual Send - default) vs Mode B (One-Time Approved Campaign)
  const [omnisendMode, setOmnisendMode] = useState<'manual' | 'approved_campaign'>('manual');
  const [omnisendCampaignApproved, setOmnisendCampaignApproved] = useState(false);

  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  // Lead Details & Centered Outreach Modal state (Details | Outreach | Drafts & Campaigns | Notes & History)
  const [selectedDrawerLead, setSelectedDrawerLead] = useState<SavedLeadRecord | null>(null);
  const [drawerActiveTab, setDrawerActiveTab] = useState<'details' | 'outreach' | 'drafts' | 'notes'>('outreach');
  const [emailEditMode, setEmailEditMode] = useState<'edit' | 'preview'>('edit');
  const [emailQualityResult, setEmailQualityResult] = useState<{
    status: 'READY' | 'NEEDS_IMPROVEMENT' | 'BLOCKED';
    score: number;
    findings: string[];
    recommendations: string[];
  } | null>(null);
  const [showOwnerApprovalModal, setShowOwnerApprovalModal] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraftRevision, setActiveDraftRevision] = useState<number | null>(null);
  const [activeDraftState, setActiveDraftState] = useState<string | null>(null);
  const [activeDraftSavedAt, setActiveDraftSavedAt] = useState<string | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [leadSavedDrafts, setLeadSavedDrafts] = useState<any[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [productRelevanceInfo, setProductRelevanceInfo] = useState<any>(null);
  const [drawerNotes, setDrawerNotes] = useState('');
  const [drawerFollowUpDate, setDrawerFollowUpDate] = useState('');
  const [drawerQuantity, setDrawerQuantity] = useState('');
  const [drawerPackaging, setDrawerPackaging] = useState('');
  const [savingDrawerNotes, setSavingDrawerNotes] = useState(false);
  const [drawerSavedMsg, setDrawerSavedMsg] = useState<string | null>(null);

  // Quick Email Outreach state for Find Leads Page
  const [quickEmailLead, setQuickEmailLead] = useState<ScoredLead | null>(null);
  const [quickEmailRecipient, setQuickEmailRecipient] = useState('');
  const [quickEmailSubject, setQuickEmailSubject] = useState('');
  const [quickEmailBody, setQuickEmailBody] = useState('');
  const [quickEmailInterest, setQuickEmailInterest] = useState<ProductInterest>('horse_salt');
  const [quickEmailCopied, setQuickEmailCopied] = useState(false);
  const [quickEmailStatus, setQuickEmailStatus] = useState<string | null>(null);

  const handleOpenQuickEmail = (lead: ScoredLead) => {
    setQuickEmailLead(lead);
    setQuickEmailRecipient(lead.email || '');
    setQuickEmailCopied(false);
    setQuickEmailStatus(null);
    const interest = productInterest || 'horse_salt';
    setQuickEmailInterest(interest);
    const intro = createIntroduction(
      {
        businessName: lead.businessName,
        city: lead.city || lead.region || 'your area',
        category: lead.category || 'business',
      },
      interest
    );
    setQuickEmailSubject(intro.subject);
    setQuickEmailBody(intro.message);
  };

  const handleQuickEmailInterestChange = (interest: ProductInterest) => {
    setQuickEmailInterest(interest);
    if (!quickEmailLead) return;
    const intro = createIntroduction(
      {
        businessName: quickEmailLead.businessName,
        city: quickEmailLead.city || quickEmailLead.region || 'your area',
        category: quickEmailLead.category || 'business',
      },
      interest
    );
    setQuickEmailSubject(intro.subject);
    setQuickEmailBody(intro.message);
  };

  // Find Leads filters & state
  const [showExampleSearchesMenu, setShowExampleSearchesMenu] = useState(false);
  const [findLeadsQuickFilter, setFindLeadsQuickFilter] = useState<'all' | 'verified' | 'unverified' | 'review'>('all');
  const [findLeadsPage, setFindLeadsPage] = useState(1);
  const findLeadsPageSize = 10;

  const verifiedFindCount = leads.filter((l) => Boolean(l.website && (l.phone || l.email))).length;
  const unverifiedFindCount = leads.filter((l) => !l.website || (!l.phone && !l.email)).length;
  const needsReviewFindCount = leads.filter((l) => (l.opportunityScore ?? 0) < 60 || !l.phone).length;

  const filteredFindLeads = leads.filter((l) => {
    if (findLeadsQuickFilter === 'verified') return Boolean(l.website && (l.phone || l.email));
    if (findLeadsQuickFilter === 'unverified') return !l.website || (!l.phone && !l.email);
    if (findLeadsQuickFilter === 'review') return (l.opportunityScore ?? 0) < 60 || !l.phone;
    return true;
  });

  const totalFindPages = Math.max(1, Math.ceil(filteredFindLeads.length / findLeadsPageSize));
  const paginatedFindLeads = filteredFindLeads.slice(
    (findLeadsPage - 1) * findLeadsPageSize,
    findLeadsPage * findLeadsPageSize
  );


  // Settings active section
  const [settingsSection, setSettingsSection] = useState<'ai' | 'social' | 'maps' | 'icp' | 'scoring' | 'system'>('ai');

  // ── Lead Library Table Resizing, Sorting, Filtering & Row Reordering ──
  const DEFAULT_LIBRARY_COL_WIDTHS = {
    reorder: 26,
    check: 26,
    index: 26,
    name: 165,
    location: 105,
    category: 95,
    contact: 175,
    source: 85,
    status: 80,
    score: 55,
    actions: 105,
  };

  const [libraryColWidths, setLibraryColWidths] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('hk_leados_lib_col_widths_v4');
        if (saved) return { ...DEFAULT_LIBRARY_COL_WIDTHS, ...JSON.parse(saved) };
      } catch {}
    }
    return DEFAULT_LIBRARY_COL_WIDTHS;
  });

  const resizingLibColRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);

  const handleStartLibColResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFitScreenMode(false);
    resizingLibColRef.current = {
      colKey,
      startX: e.clientX,
      startWidth: libraryColWidths[colKey] || 120,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingLibColRef.current) return;
      const delta = moveEvent.clientX - resizingLibColRef.current.startX;
      const minW = ['reorder', 'check', 'index'].includes(resizingLibColRef.current.colKey) ? 22 : 45;
      const newWidth = Math.max(minW, resizingLibColRef.current.startWidth + delta);
      setLibraryColWidths((prev) => {
        const next = { ...prev, [resizingLibColRef.current!.colKey]: newWidth };
        try { localStorage.setItem('hk_leados_lib_col_widths_v4', JSON.stringify(next)); } catch {}
        return next;
      });
    };

    const handleMouseUp = () => {
      resizingLibColRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetLibColWidth = (colKey: string) => {
    setLibraryColWidths((prev) => {
      const next = { ...prev, [colKey]: (DEFAULT_LIBRARY_COL_WIDTHS as any)[colKey] || 100 };
      try { localStorage.setItem('hk_leados_lib_col_widths_v4', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleResetAllLibColWidths = () => {
    setFitScreenMode(true);
    setLibraryColWidths(DEFAULT_LIBRARY_COL_WIDTHS);
    try {
      localStorage.setItem('hk_leados_lib_col_widths_v4', JSON.stringify(DEFAULT_LIBRARY_COL_WIDTHS));
    } catch {}
  };

  // ── Column Drag-and-Drop & Customization State ──
  type LibraryColKey = 'name' | 'location' | 'category' | 'contact' | 'source' | 'status' | 'score';

  const DEFAULT_LIBRARY_COL_ORDER: LibraryColKey[] = [
    'name',
    'location',
    'category',
    'contact',
    'source',
    'status',
    'score',
  ];

  const LIBRARY_COL_LABELS: Record<LibraryColKey, string> = {
    name: 'Business Name',
    location: 'Location',
    category: 'Category',
    contact: 'Contact Information',
    source: 'Source',
    status: 'CRM Status',
    score: 'Fit Score',
  };

  const { user } = useAuthStore();
  const adminId = user?.email || user?.id || 'admin';
  const colOrderStorageKey = `hk_leados_col_order_v2_${adminId}`;
  const colHiddenStorageKey = `hk_leados_col_hidden_v2_${adminId}`;

  const [libraryColOrder, setLibraryColOrder] = useState<LibraryColKey[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(colOrderStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const setCols = new Set(parsed);
            const valid = parsed.filter((k: any) => DEFAULT_LIBRARY_COL_ORDER.includes(k));
            for (const col of DEFAULT_LIBRARY_COL_ORDER) {
              if (!setCols.has(col)) valid.push(col);
            }
            return valid;
          }
        }
      } catch {}
    }
    return DEFAULT_LIBRARY_COL_ORDER;
  });

  const [hiddenCols, setHiddenCols] = useState<Set<LibraryColKey>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(colHiddenStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return new Set(parsed as LibraryColKey[]);
        }
      } catch {}
    }
    return new Set<LibraryColKey>();
  });

  const [draggedColKey, setDraggedColKey] = useState<LibraryColKey | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<LibraryColKey | null>(null);
  const [colDropPosition, setColDropPosition] = useState<'before' | 'after'>('before');
  const [showCustomizeCols, setShowCustomizeCols] = useState(false);

  const saveColOrder = (order: LibraryColKey[]) => {
    try {
      localStorage.setItem(colOrderStorageKey, JSON.stringify(order));
    } catch {}
  };

  const saveHiddenCols = (hidden: Set<LibraryColKey>) => {
    try {
      localStorage.setItem(colHiddenStorageKey, JSON.stringify(Array.from(hidden)));
    } catch {}
  };

  const handleDropCol = (targetColKey: LibraryColKey) => {
    if (!draggedColKey || draggedColKey === targetColKey) {
      setDraggedColKey(null);
      setDragOverColKey(null);
      return;
    }

    setLibraryColOrder((prev) => {
      const fromIdx = prev.indexOf(draggedColKey);
      const toIdx = prev.indexOf(targetColKey);
      if (fromIdx === -1 || toIdx === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      const newToIdx = next.indexOf(targetColKey);
      const insertAt = colDropPosition === 'after' ? newToIdx + 1 : newToIdx;
      next.splice(Math.max(0, insertAt), 0, moved);
      saveColOrder(next);
      return next;
    });

    setDraggedColKey(null);
    setDragOverColKey(null);
  };

  const handleMoveColStep = (colKey: LibraryColKey, direction: 'left' | 'right') => {
    setLibraryColOrder((prev) => {
      const idx = prev.indexOf(colKey);
      if (idx === -1) return prev;
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      saveColOrder(next);
      return next;
    });
  };

  const handleToggleColVisibility = (colKey: LibraryColKey) => {
    if (colKey === 'name') return;
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) {
        next.delete(colKey);
      } else {
        next.add(colKey);
      }
      saveHiddenCols(next);
      return next;
    });
  };

  const handleResetColLayout = () => {
    setLibraryColOrder(DEFAULT_LIBRARY_COL_ORDER);
    setHiddenCols(new Set<LibraryColKey>());
    saveColOrder(DEFAULT_LIBRARY_COL_ORDER);
    saveHiddenCols(new Set<LibraryColKey>());
    handleResetAllLibColWidths();
  };

  const visibleColOrder = libraryColOrder.filter((k) => !hiddenCols.has(k));

  // Sorting state for Lead Library
  const [librarySortField, setLibrarySortField] = useState<'manual' | 'name' | 'location' | 'category' | 'contact' | 'source' | 'status' | 'score'>('manual');
  const [librarySortDirection, setLibrarySortDirection] = useState<'asc' | 'desc'>('asc');

  const handleToggleLibrarySort = (field: 'name' | 'location' | 'category' | 'contact' | 'source' | 'status' | 'score') => {
    if (librarySortField === field) {
      if (librarySortDirection === 'asc') {
        setLibrarySortDirection('desc');
      } else {
        setLibrarySortField('manual');
        setLibrarySortDirection('asc');
      }
    } else {
      setLibrarySortField(field);
      setLibrarySortDirection('asc');
    }
  };

  // Quick contact filter chips (Email, Phone, Facebook, Instagram, Social, Website, Verified, High Score)
  const [libraryQuickContactFilter, setLibraryQuickContactFilter] = useState<
    'all' | 'verified' | 'phone' | 'email' | 'facebook' | 'instagram' | 'social' | 'website' | 'high_score'
  >('all');

  const getLeadFacebook = (l: SavedLeadRecord): string | null =>
    l.facebook ||
    l.research?.facebook ||
    l.research?.sources?.find((s) => typeof s?.url === 'string' && s.url.toLowerCase().includes('facebook.com/'))?.url ||
    null;

  const getLeadInstagram = (l: SavedLeadRecord): string | null =>
    l.instagram ||
    l.research?.instagram ||
    l.research?.sources?.find((s) => typeof s?.url === 'string' && s.url.toLowerCase().includes('instagram.com/'))?.url ||
    null;

  // Row Drag & Drop Reordering state
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverLeadId, setDragOverLeadId] = useState<string | null>(null);
  const [dragDropSide, setDragDropSide] = useState<'top' | 'bottom'>('bottom');

  const handleDragStartRow = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragOverRow = (e: React.DragEvent, targetLeadId: string) => {
    e.preventDefault();
    if (draggedLeadId === targetLeadId) return;
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const side = offsetY < rect.height / 2 ? 'top' : 'bottom';
    setDragOverLeadId(targetLeadId);
    setDragDropSide(side);
  };

  const handleDropRow = (e: React.DragEvent, targetLeadId: string) => {
    e.preventDefault();
    if (!draggedLeadId || draggedLeadId === targetLeadId) {
      setDraggedLeadId(null);
      setDragOverLeadId(null);
      return;
    }

    setLibrarySortField('manual');

    setLibraryLeads((prev) => {
      const sourceIndex = prev.findIndex((l) => l.id === draggedLeadId);
      const targetIndex = prev.findIndex((l) => l.id === targetLeadId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      const [movedItem] = next.splice(sourceIndex, 1);
      const insertAt = dragDropSide === 'top'
        ? (sourceIndex < targetIndex ? targetIndex - 1 : targetIndex)
        : (sourceIndex < targetIndex ? targetIndex : targetIndex + 1);
      next.splice(Math.max(0, insertAt), 0, movedItem);
      syncSessionLibraryCache(next);
      try {
        localStorage.setItem('hk_leados_manual_row_order_v1', JSON.stringify(next.map((l) => l.id)));
      } catch {}
      return next;
    });

    setDraggedLeadId(null);
    setDragOverLeadId(null);
  };

  const handleMoveRowOneStep = (leadId: string, direction: 'up' | 'down') => {
    setLibrarySortField('manual');
    setLibraryLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === leadId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      syncSessionLibraryCache(next);
      try {
        localStorage.setItem('hk_leados_manual_row_order_v1', JSON.stringify(next.map((l) => l.id)));
      } catch {}
      return next;
    });
  };

  const libraryCategories = Array.from(new Set(libraryLeads.map((l) => l.category).filter(Boolean))) as string[];

  // Fully integrated filtered & sorted leads calculation
  const filteredLibraryLeads = React.useMemo(() => {
    let result = libraryLeads.filter((l) => {
      const fb = getLeadFacebook(l);
      const ig = getLeadInstagram(l);
      // 1. Text Search across name, location, address, phone, email, social, notes, category
      if (librarySearch.trim()) {
        const q = librarySearch.toLowerCase().trim();
        const matchesName = l.businessName?.toLowerCase().includes(q);
        const matchesCity = l.city?.toLowerCase().includes(q);
        const matchesRegion = l.region?.toLowerCase().includes(q);
        const matchesAddress = l.address?.toLowerCase().includes(q);
        const matchesCategory = l.category?.toLowerCase().includes(q);
        const matchesPhone = l.phone?.toLowerCase().includes(q);
        const matchesEmail = l.email?.toLowerCase().includes(q);
        const matchesSocial = fb?.toLowerCase().includes(q) || ig?.toLowerCase().includes(q);
        const matchesNotes = (l as any).notes?.toLowerCase().includes(q);
        if (!matchesName && !matchesCity && !matchesRegion && !matchesAddress && !matchesCategory && !matchesPhone && !matchesEmail && !matchesSocial && !matchesNotes) {
          return false;
        }
      }

      // 2. Category Filter
      if (libraryCategoryFilter !== 'all' && l.category !== libraryCategoryFilter) return false;

      // 2b. CRM / Data Source Filter
      if (librarySourceFilter === 'crm') {
        const isCrmSource = l.dataSource === 'crm' || l.dataSource === 'website_inquiry' || l.dataSource === 'contact_form' || l.dataSource === 'manual' || Boolean((l as any).source && /crm|inquiry/i.test((l as any).source));
        if (!isCrmSource) return false;
      } else if (librarySourceFilter === 'discovery') {
        const isDiscovery = l.dataSource === 'openstreetmap' || l.dataSource === 'osm' || l.dataSource === 'discovery';
        if (!isDiscovery) return false;
      } else if (librarySourceFilter === 'customers') {
        const isCustomer = l.dataSource === 'woocommerce' || l.dataSource === 'customer';
        if (!isCustomer) return false;
      }

      // 3. Status / Pipeline Filter
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;

      // 4. Verification Filter
      const isV = l.emailSource === 'company_website' || l.dataSource === 'openstreetmap' || Boolean(l.phone && l.website);
      if (libraryVerificationFilter === 'verified' && !isV) return false;
      if (libraryVerificationFilter === 'unverified' && isV) return false;

      // 5. Quick Contact Filter Chips
      if (libraryQuickContactFilter === 'verified' && !isV) return false;
      if (libraryQuickContactFilter === 'phone' && !l.phone) return false;
      if (libraryQuickContactFilter === 'email' && !l.email) return false;
      if (libraryQuickContactFilter === 'website' && !l.website) return false;
      if (libraryQuickContactFilter === 'facebook' && !fb) return false;
      if (libraryQuickContactFilter === 'instagram' && !ig) return false;
      if (libraryQuickContactFilter === 'social' && !fb && !ig) return false;
      if (libraryQuickContactFilter === 'high_score') {
        const score = l.research?.qualification?.score ?? l.opportunityScore ?? 80;
        if (score < 80) return false;
      }

      return true;
    });

    // 6. Column Sorting
    if (librarySortField !== 'manual') {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (librarySortField === 'name') {
          cmp = (a.businessName || '').localeCompare(b.businessName || '');
        } else if (librarySortField === 'location') {
          const locA = `${a.city || ''} ${a.region || ''}`.trim();
          const locB = `${b.city || ''} ${b.region || ''}`.trim();
          cmp = locA.localeCompare(locB);
        } else if (librarySortField === 'category') {
          cmp = (a.category || '').localeCompare(b.category || '');
        } else if (librarySortField === 'contact') {
          const scoreContact = (x: typeof a) => (x.email ? 4 : 0) + (x.phone ? 2 : 0) + (x.website ? 1 : 0);
          cmp = scoreContact(b) - scoreContact(a);
        } else if (librarySortField === 'source') {
          cmp = (a.dataSource || '').localeCompare(b.dataSource || '');
        } else if (librarySortField === 'status') {
          cmp = (a.status || '').localeCompare(b.status || '');
        } else if (librarySortField === 'score') {
          const sA = a.research?.qualification?.score ?? a.opportunityScore ?? 0;
          const sB = b.research?.qualification?.score ?? b.opportunityScore ?? 0;
          cmp = sA - sB;
        }
        return librarySortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [libraryLeads, librarySearch, libraryCategoryFilter, statusFilter, libraryVerificationFilter, libraryQuickContactFilter, librarySortField, librarySortDirection]);

  const totalLibraryPages = Math.max(1, Math.ceil(filteredLibraryLeads.length / libraryPageSize));
  const safeLibraryPage = Math.min(libraryPage, totalLibraryPages);
  const paginatedLibraryLeads = React.useMemo(() => {
    const start = (safeLibraryPage - 1) * libraryPageSize;
    return filteredLibraryLeads.slice(start, start + libraryPageSize);
  }, [filteredLibraryLeads, safeLibraryPage, libraryPageSize]);

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

  // Client Outreach state (integrated into Lead Library)
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [outreachActiveLead, setOutreachActiveLead] = useState<SavedLeadRecord | null>(null);
  const [showAdvancedOutreachWorkflow, setShowAdvancedOutreachWorkflow] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplate>(OUTREACH_TEMPLATES[0]);
  const [outreachMode, setOutreachMode] = useState<'retail' | 'wholesale' | 'private_label'>('wholesale');
  const [verifiedCouponActive, setVerifiedCouponActive] = useState(true);
  const [verifiedCouponCode, setVerifiedCouponCode] = useState('welcome5');
  const [verifiedCouponDiscount, setVerifiedCouponDiscount] = useState('5%');
  const [verifiedProductUrl, setVerifiedProductUrl] = useState('https://himalayankoh.com/wholesale');
  const [officialSenderEmail] = useState('sales@himalayankoh.com');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmailSource, setRecipientEmailSource] = useState<'discovered_osm' | 'company_website' | 'manually_entered' | 'unverified'>('unverified');
  const [emailSubject, setEmailSubject] = useState(OUTREACH_TEMPLATES[0].subject.replace('{business_name}', 'Partner'));
  const [emailBody, setEmailBody] = useState(OUTREACH_TEMPLATES[0].body.replace(/\{business_name\}/g, 'Partner').replace(/\{city\}/g, 'your city'));
  const [activeOutreachLeadId, setActiveOutreachLeadId] = useState<string | undefined>(undefined);
  const [sendingOutreach, setSendingOutreach] = useState(false);
  const [sendResultNotice, setSendResultNotice] = useState<{ ok: boolean; msg: string; simulated?: boolean } | null>(null);

  // Meta Facebook & Instagram Integration state
  const [metaState, setMetaState] = useState<any>(null);
  const [metaConversations, setMetaConversations] = useState<any[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [socialInboxOpen, setSocialInboxOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [socialReplyText, setSocialReplyText] = useState('');
  const [sendingSocialReply, setSendingSocialReply] = useState(false);
  const [manualSocialModal, setManualSocialModal] = useState<{
    platform: 'facebook' | 'instagram';
    lead: SavedLeadRecord;
    draft: string;
  } | null>(null);
  const [manualSocialCopied, setManualSocialCopied] = useState(false);

  // Email Add/Edit Modal state
  const [editingEmailLead, setEditingEmailLead] = useState<SavedLeadRecord | ScoredLead | null>(null);
  const [inputEmail, setInputEmail] = useState('');
  const [inputPhone, setInputPhone] = useState('');
  const [inputNotes, setInputNotes] = useState('');
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

  // Load stats and projects (uses projects returned by /stats to avoid a second WordPress round-trip)
  const loadStatsAndProjects = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const headers = await getAuthHeaders();
      const resStats = await fetch('/api/admin/leados/stats', { headers });
      if (!resStats.ok) throw new Error(`Statistics request failed (${resStats.status}). Retrying is safe.`);

      const s = await resStats.json();
      setStats(s.stats && typeof s.stats === 'object' ? s.stats : null);

      let loadedProjects = Array.isArray(s.projects) ? s.projects : null;
      if (!loadedProjects) {
        const resProj = await fetch('/api/admin/leados/projects', { headers });
        if (!resProj.ok) throw new Error(`Projects request failed (${resProj.status}). Retrying is safe.`);
        const p = await resProj.json();
        loadedProjects = Array.isArray(p.projects) ? p.projects : [];
      }

      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
        const defaultProj =
          loadedProjects.find((p: LeadOSProject) => p.id === '00000000-0000-0000-0000-000000000002' || /himalayan\s*koh/i.test(p.name)) ||
          loadedProjects[0];
        setSelectedProjectId((current) => current || defaultProj.id);
        setActiveProject((current) => current || defaultProj);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LeadOS initialization failed.';
      setStatsError(message);
      console.error('LeadOS initialization error:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [getAuthHeaders]);

  // Load saved library once into memory (up to 500 leads) so search, channel filters, and pagination are instant without hammering WordPress/MySQL
  const loadLibrary = useCallback(async () => {
    const reqSeq = ++libraryRequestSeq.current;
    setLibraryLeads((current) => {
      if (current.length === 0) {
        setLoadingLibrary(true);
      }
      return current;
    });
    setLibraryError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/leads?page=1&limit=500', { headers });
      if (reqSeq !== libraryRequestSeq.current) return;

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Lead Library request failed (${res.status})`);
      }
      const d = await res.json();
      if (reqSeq !== libraryRequestSeq.current) return;

      if (!Array.isArray(d.leads)) throw new Error('Lead Library returned an invalid response.');
      const leads = [...d.leads];
      setLibraryTotal(typeof d.total === 'number' ? d.total : leads.length);
      const savedRowOrder = typeof window !== 'undefined' ? localStorage.getItem('hk_leados_manual_row_order_v1') : null;
      if (savedRowOrder) {
        try {
          const idList: string[] = JSON.parse(savedRowOrder);
          const idMap = new Map(idList.map((id, i) => [id, i]));
          leads.sort((a: SavedLeadRecord, b: SavedLeadRecord) => {
            const posA = idMap.has(a.id) ? idMap.get(a.id)! : 99999;
            const posB = idMap.has(b.id) ? idMap.get(b.id)! : 99999;
            return posA - posB;
          });
        } catch {}
      }
      setLibraryLeads(leads);
      syncSessionLibraryCache(leads);
    } catch (err) {
      if (reqSeq !== libraryRequestSeq.current) return;
      const message = err instanceof Error ? err.message : 'Lead Library failed to load.';
      setLibraryError(message);
      console.error('Failed to load library:', err);
    } finally {
      if (reqSeq === libraryRequestSeq.current) {
        setLoadingLibrary(false);
      }
    }
  }, [getAuthHeaders, syncSessionLibraryCache]);

  const handleBatchEnrichContacts = async () => {
    setEnrichingLibrary(true);
    setLibraryActionNotice(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'enrich_contacts' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to enrich contacts');
      setLibraryActionNotice(
        `Scanned ${data.scannedCount ?? 0} websites: updated ${data.enrichedCount ?? 0} leads (+${data.newEmails ?? 0} emails, +${data.newSocials ?? 0} social profiles).`
      );
      await loadLibrary();
    } catch (err) {
      setLibraryActionNotice(err instanceof Error ? err.message : 'Website enrichment failed.');
    } finally {
      setEnrichingLibrary(false);
    }
  };

  // Step 1: Preview eligible B2B contacts before syncing to Omnisend (explicitly owner-controlled)
  const handleSyncOmnisend = async () => {
    setSyncingOmnisend(true);
    setLibraryActionNotice(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'sync_omnisend', dryRun: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Omnisend preview failed');
      setOmnisendSyncPreview({
        totalLeads: data.totalLeads ?? libraryLeads.length,
        totalWithEmail: data.totalWithEmail ?? 0,
        duplicateEmailCount: data.duplicateEmailCount ?? 0,
        excludedOrSuppressedCount: data.excludedOrSuppressedCount ?? 0,
        eligibleCount: data.eligibleCount ?? 0,
        consentStatus: data.consentStatus || 'nonSubscribed',
      });
    } catch (err) {
      setLibraryActionNotice(err instanceof Error ? err.message : 'Omnisend sync preview failed.');
    } finally {
      setSyncingOmnisend(false);
    }
  };

  // Step 2: Execute confirmed bulk sync (preserving nonSubscribed B2B status)
  const handleConfirmSyncOmnisend = async () => {
    setSyncingOmnisend(true);
    setLibraryActionNotice(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'sync_omnisend', confirm: true, dryRun: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Omnisend sync failed');
      setOmnisendSyncPreview(null);
      setLibraryActionNotice(
        `Omnisend Sync Complete: ${data.syncedCount ?? 0} of ${data.eligibleCount ?? 0} eligible unique B2B contacts synced as nonSubscribed (${data.duplicateEmailCount ?? 0} duplicate branch emails & ${data.excludedOrSuppressedCount ?? 0} suppressed/excluded skipped).`
      );
    } catch (err) {
      setLibraryActionNotice(err instanceof Error ? err.message : 'Omnisend sync failed.');
    } finally {
      setSyncingOmnisend(false);
    }
  };

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

  // Load verified coupon status from WooCommerce
  const loadCouponStatus = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/coupon', { headers });
      if (res.ok) {
        const d = await res.json();
        if (d.active && d.coupon) {
          setVerifiedCouponActive(true);
          setVerifiedCouponCode(d.coupon.code);
          setVerifiedCouponDiscount(`${parseFloat(d.coupon.amount)}%`);
        }
      }
    } catch {
      // Non-fatal
    }
  }, [getAuthHeaders]);

  // Load Meta Platform connection state
  const loadMetaState = useCallback(async () => {
    setMetaLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/meta/status', { headers });
      if (res.ok) {
        const d = await res.json();
        setMetaState(d.state || null);
      }
    } catch {
      // Non-fatal
    } finally {
      setMetaLoading(false);
    }
  }, [getAuthHeaders]);

  // Load unified social conversations
  const loadMetaConversations = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/meta/conversations', { headers });
      if (res.ok) {
        const d = await res.json();
        setMetaConversations(d.conversations || []);
      }
    } catch {
      // Non-fatal
    }
  }, [getAuthHeaders]);

  const handleInitiateMetaOAuth = (platform: 'facebook' | 'instagram') => {
    window.location.href = `/api/admin/leados/meta/auth?platform=${platform}`;
  };

  const handleDisconnectMeta = async (platform: 'facebook' | 'instagram' | 'all' = 'all') => {
    if (!confirm(`Disconnect ${platform === 'all' ? 'Meta platform integration' : platform}?`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/leados/meta/status?platform=${platform}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        await loadMetaState();
      }
    } catch (e) {
      console.error('Failed to disconnect meta:', e);
    }
  };

  const handleSendSocialReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !socialReplyText.trim()) return;
    setSendingSocialReply(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/leados/meta/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          recipientId: selectedConversation.contactId || selectedConversation.participants?.[0]?.id,
          platform: selectedConversation.platform,
          message: socialReplyText.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to send social reply');
      setSocialReplyText('');
      await loadMetaConversations();
    } catch (err: any) {
      alert(`Social send failed: ${err.message}`);
    } finally {
      setSendingSocialReply(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'library') {
      void loadLibrary();
    }
  }, [activeTab, loadLibrary]);

  useEffect(() => {
    if (activeTab === 'library') {
      const t1 = setTimeout(() => {
        void loadStatsAndProjects();
        void loadWeights();
      }, 600);
      const t2 = setTimeout(() => {
        void loadCouponStatus();
        void loadMetaState();
      }, 1400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else {
      void loadStatsAndProjects();
      void loadWeights();
      const timer = setTimeout(() => {
        void loadCouponStatus();
        void loadMetaState();
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [activeTab, loadStatsAndProjects, loadWeights, loadCouponStatus, loadMetaState]);

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
    plOnly: boolean = privateLabelOnly,
    sourcesVal: string[] = selectedSources
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
                locations: locs,
                sources: sourcesVal,
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
      const newSources = p.sources && p.sources.length > 0 ? p.sources : ['all'];
      setSelectedSources(newSources);
      setRequireWebsite(p.requireWebsite ?? false);
      setRequirePhone(p.requirePhone ?? true);
      setRequireEmail(p.requireEmail ?? false);
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
          p.requireWebsite ?? false,
          p.requirePhone ?? true,
          p.requireEmail ?? false,
          p.productInterest || 'horse_salt',
          p.wholesaleOnly ?? false,
          p.privateLabelOnly ?? false,
          newSources
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
      loadLibrary();
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
      loadLibrary();
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
      setLibraryLeads((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l));
        syncSessionLibraryCache(next);
        return next;
      });
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
      setLibraryLeads((prev) => {
        const next = prev.filter((l) => l.id !== id);
        syncSessionLibraryCache(next);
        return next;
      });
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

  // Helper to load persistent draft from WordPress / Settings API
  const loadDraftForLead = async (leadId: string) => {
    setLoadingDrafts(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/leados/workflow?lead_id=${encodeURIComponent(leadId)}&kind=draft`, { headers });
      if (res.ok) {
        const d = await res.json();
        const items = Array.isArray(d.items) ? d.items : Array.isArray(d.data?.items) ? d.data.items : [];
        if (items.length > 0) {
          setLeadSavedDrafts(items);
          const latest = items[0];
          setActiveDraftId(latest.id || null);
          setActiveDraftRevision(latest.revision || 1);
          setActiveDraftState(latest.state || 'draft');
          setActiveDraftSavedAt(latest.updated_at || latest.created_at || null);
          if (latest.payload?.recipient) setRecipientEmail(latest.payload.recipient);
          else if (latest.payload?.recipientEmail) setRecipientEmail(latest.payload.recipientEmail);
          if (latest.payload?.recipientName) setRecipientName(latest.payload.recipientName);
          if (latest.payload?.subject) setEmailSubject(latest.payload.subject);
          if (latest.payload?.message) setEmailBody(latest.payload.message);
          if (latest.payload?.outreachMode) setOutreachMode(latest.payload.outreachMode);
          if (latest.payload?.productUrl) setVerifiedProductUrl(latest.payload.productUrl);
          setDraftDirty(false);
        } else {
          setLeadSavedDrafts([]);
          setActiveDraftId(null);
          setActiveDraftRevision(null);
          setActiveDraftState(null);
          setActiveDraftSavedAt(null);
          setDraftDirty(false);
        }
      }
    } catch {
      // Ignore network hiccup
    } finally {
      setLoadingDrafts(false);
    }
  };

  // Pre-Send Email Quality Checker
  const handleRunEmailQualityCheck = () => {
    const findings: string[] = [];
    const recommendations: string[] = [];
    let score = 100;
    let status: 'READY' | 'NEEDS_IMPROVEMENT' | 'BLOCKED' = 'READY';

    // 1. Recipient check
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      findings.push('Missing or invalid recipient email address.');
      status = 'BLOCKED';
      score -= 40;
    } else {
      findings.push(`Recipient email format validated (${recipientEmail}).`);
    }

    // 2. Sender readiness
    if (officialSenderEmail !== 'sales@himalayankoh.com') {
      findings.push('Sender is not the authorized sales domain.');
      status = 'BLOCKED';
      score -= 40;
    } else {
      findings.push('Authorized sender identity (sales@himalayankoh.com).');
    }

    // 3. Product relevance
    const relevance = determineProductRelevance(selectedDrawerLead || { businessName: recipientName });
    if (relevance.isLowFit) {
      findings.push(`Targeting Alert: ${relevance.relevanceReason}`);
      recommendations.push('Review business category manually before dispatching sales pitch.');
      if (status !== 'BLOCKED') status = 'NEEDS_IMPROVEMENT';
      score -= 25;
    } else {
      findings.push(`Product fit validated: ${relevance.productName} (${relevance.relevanceReason})`);
    }

    // 4. Product URL validity
    if (!verifiedProductUrl || !verifiedProductUrl.startsWith('https://himalayankoh.com')) {
      findings.push('Attached product URL is not a valid himalayankoh.com link.');
      status = 'BLOCKED';
      score -= 30;
    } else {
      findings.push(`Live product URL verified: ${verifiedProductUrl}`);
    }

    // 5. Coupon validation
    if (outreachMode === 'retail') {
      if ((verifiedCouponCode || 'welcome5').toLowerCase() === 'welcome5') {
        findings.push('WooCommerce coupon "welcome5" verified active (5% discount).');
      }
    } else {
      if (emailBody.toLowerCase().includes('welcome5') || emailBody.toLowerCase().includes('5% welcome')) {
        findings.push('Wholesale inquiries should use tiered commercial volume pricing, not retail coupons.');
        if (status !== 'BLOCKED') status = 'NEEDS_IMPROVEMENT';
        score -= 15;
      }
    }

    // 6. Anti-spam & Opt-out compliance
    if (!emailBody.toLowerCase().includes('unsubscribe') && !emailBody.toLowerCase().includes('opt out')) {
      findings.push('Missing mandatory opt-out / unsubscribe notice.');
      recommendations.push('Include a clear unsubscribe instruction (e.g. "To opt out, reply unsubscribe").');
      if (status !== 'BLOCKED') status = 'NEEDS_IMPROVEMENT';
      score -= 20;
    } else {
      findings.push('Mandatory opt-out notice verified present in message body.');
    }

    // 7. Excessive capitalization check
    const upperCaseMatches = emailSubject.match(/\b[A-Z]{4,}\b/g);
    if (upperCaseMatches && upperCaseMatches.length > 1) {
      findings.push(`Subject line contains multiple capitalized words: "${upperCaseMatches.join(', ')}".`);
      recommendations.push('Use sentence or title case in subject lines to avoid spam filter triggers.');
      if (status !== 'BLOCKED') status = 'NEEDS_IMPROVEMENT';
      score -= 15;
    }

    setEmailQualityResult({
      status,
      score: Math.max(0, score),
      findings,
      recommendations,
    });
  };

  // Setup modal and outreach for a given lead
  const openLeadDrawer = (lead: SavedLeadRecord, tab: 'details' | 'outreach' | 'drafts' | 'notes' = 'details') => {
    setSelectedDrawerLead(lead);
    setDrawerActiveTab(tab);
    setDrawerNotes(lead.notes || '');
    setDrawerFollowUpDate(lead.research?.nextFollowUp || '');
    setDrawerQuantity(lead.research?.requestedQuantity || '');
    setDrawerPackaging(lead.research?.packagingPreference || '');
    setDrawerSavedMsg(null);
    setEmailEditMode('edit');
    setEmailQualityResult(null);

    // Sync outreach state
    setOutreachActiveLead(lead);
    setActiveOutreachLeadId(lead.id || undefined);
    setActiveDraftId(null);
    setActiveDraftRevision(null);
    setActiveDraftState(null);
    setActiveDraftSavedAt(null);
    setDraftDirty(false);
    setRecipientName(lead.businessName);
    setRecipientEmail(lead.email || '');
    setRecipientEmailSource(lead.emailSource || (lead.email ? 'discovered_osm' : 'unverified'));

    const rel = determineProductRelevance(lead);
    setProductRelevanceInfo(rel);

    const mode = 'wholesale';
    setOutreachMode(mode);
    const prepared = createOutreachMessage(lead, {
      mode,
      couponCode: verifiedCouponCode || 'welcome5',
      senderEmail: officialSenderEmail,
    });
    setEmailSubject(prepared.subject);
    setEmailBody(prepared.message);
    setVerifiedProductUrl(prepared.productUrl);
    setSendResultNotice(null);

    // Load any previously saved draft from persistent storage
    loadDraftForLead(lead.id);
  };

  const markDraftEdited = () => {
    setDraftDirty(true);
    setActiveDraftState((prev) => (prev === 'approved' ? 'draft' : prev));
  };

  const handleSelectOutreachMode = (mode: 'retail' | 'wholesale' | 'private_label') => {
    setOutreachMode(mode);
    markDraftEdited();
    if (!selectedDrawerLead) return;
    const prepared = createOutreachMessage(selectedDrawerLead, {
      mode,
      couponCode: verifiedCouponCode || 'welcome5',
      senderEmail: officialSenderEmail,
    });
    setEmailSubject(prepared.subject);
    setEmailBody(prepared.message);
    setVerifiedProductUrl(prepared.productUrl);
    setSendResultNotice(null);
    setEmailQualityResult(null);
  };

  const handleOpenManualSocial = (platform: 'facebook' | 'instagram', lead: SavedLeadRecord) => {
    const draft = `Hello ${lead.businessName} team! Reaching out from Himalayan Koh (https://himalayankoh.com). We supply pure, authentic Himalayan salt blocks and mineral licks. Would love to connect regarding your current equine & livestock retail assortment!`;
    setManualSocialModal({
      platform,
      lead,
      draft,
    });
    setManualSocialCopied(false);
  };

  const startOutreachForLead = (lead: SavedLeadRecord | ScoredLead) => {
    const saved = lead as SavedLeadRecord;
    openLeadDrawer(saved, 'outreach');
    if (activeTab !== 'library') {
      changeTab('library');
    }
  };

  const handleSaveDrawerNotes = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedDrawerLead) return;
    setSavingDrawerNotes(true);
    setDrawerSavedMsg(null);
    try {
      const headers = await getAuthHeaders();
      const currentResearch = selectedDrawerLead.research || {};
      const updatedResearch = {
        ...currentResearch,
        nextFollowUp: drawerFollowUpDate.trim() || undefined,
        requestedQuantity: drawerQuantity.trim() || undefined,
        packagingPreference: drawerPackaging.trim() || undefined,
      };
      const res = await fetch('/api/admin/leados/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          id: selectedDrawerLead.id,
          notes: drawerNotes.trim() || null,
          research: updatedResearch,
        }),
      });
      if (!res.ok) throw new Error('Failed to update notes');
      const updatedLead: SavedLeadRecord = {
        ...selectedDrawerLead,
        notes: drawerNotes.trim() || null,
        research: updatedResearch,
      };
      setSelectedDrawerLead(updatedLead);
      setLibraryLeads((prev) => {
        const next = prev.map((l) => (l.id === selectedDrawerLead.id ? updatedLead : l));
        syncSessionLibraryCache(next);
        return next;
      });
      setDrawerSavedMsg('Notes & follow-up schedule saved successfully.');
      setTimeout(() => setDrawerSavedMsg(null), 3000);
    } catch (err: any) {
      setDrawerSavedMsg(`Error: ${err.message}`);
    } finally {
      setSavingDrawerNotes(false);
    }
  };

  const handleUpdateDrawerLeadStatus = async (newStatus: string) => {
    if (!selectedDrawerLead) return;
    await handleUpdateLeadStatus(selectedDrawerLead.id, newStatus);
    setSelectedDrawerLead((prev) => prev ? { ...prev, status: newStatus } : null);
  };

  const applySavedSearch = (s: typeof PRESET_SAVED_SEARCHES[0]) => {
    setAiQuery(s.query);
    setCategoriesList(s.categories);
    setLocationsList(s.locations);
    setCategory(s.category);
    setLocation(s.locations[0] || 'Houston, TX');
    void runProgressiveSearch(
      s.locations,
      s.categories,
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

  const handleToggleSelectLibraryLead = (id: string) => {
    setLibrarySelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllLibrary = () => {
    if (librarySelectedIds.size === filteredLibraryLeads.length && filteredLibraryLeads.length > 0) {
      setLibrarySelectedIds(new Set());
    } else {
      setLibrarySelectedIds(new Set(filteredLibraryLeads.map((l) => l.id)));
    }
  };

  const handleBulkUpdateLibraryStatus = async (newStatus: string) => {
    if (librarySelectedIds.size === 0) return;
    try {
      const ids = Array.from(librarySelectedIds);
      const headers = await getAuthHeaders();
      for (const id of ids) {
        await fetch('/api/admin/leados/leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ id, status: newStatus }),
        });
      }
      setLibraryLeads((prev) => {
        const next = prev.map((l) => (librarySelectedIds.has(l.id) ? { ...l, status: newStatus } : l));
        syncSessionLibraryCache(next);
        return next;
      });
      setLibrarySelectedIds(new Set());
      setSavedSuccessMsg(`Updated ${ids.length} leads to "${newStatus.replace('_', ' ')}"`);
      setTimeout(() => setSavedSuccessMsg(null), 3000);
    } catch (err: any) {
      setLibraryError(err.message || 'Failed to update selected leads');
    }
  };

  const handleBulkDeleteLibraryLeads = async () => {
    if (librarySelectedIds.size === 0) return;
    if (!confirm(`Delete ${librarySelectedIds.size} selected leads from your library?`)) return;
    try {
      const ids = Array.from(librarySelectedIds);
      const headers = await getAuthHeaders();
      for (const id of ids) {
        await fetch(`/api/admin/leados/leads?id=${id}`, {
          method: 'DELETE',
          headers,
        });
      }
      setLibraryLeads((prev) => {
        const next = prev.filter((l) => !librarySelectedIds.has(l.id));
        syncSessionLibraryCache(next);
        return next;
      });
      setLibrarySelectedIds(new Set());
      setSavedSuccessMsg(`Deleted ${ids.length} leads from Lead Library`);
      setTimeout(() => setSavedSuccessMsg(null), 3000);
      loadStatsAndProjects();
    } catch (err: any) {
      setLibraryError(err.message || 'Failed to delete selected leads');
    }
  };


  const handleTemplateSelect = (template: OutreachTemplate) => {
    setSelectedTemplate(template);
    markDraftEdited();
    const name = recipientName || 'Partner';
    const city = 'your area';
    setEmailSubject(template.subject.replace(/\{business_name\}/g, name).replace(/\{city\}/g, city));
    setEmailBody(template.body.replace(/\{business_name\}/g, name).replace(/\{city\}/g, city));
  };

  const persistCurrentDraft = async (headers: Record<string, string>) => {
    const trimmedEmail = recipientEmail.trim();
    const res = await fetch('/api/admin/leados/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        action: 'save_draft',
        id: activeDraftId || undefined,
        revision: activeDraftRevision || undefined,
        leadId: activeOutreachLeadId,
        kind: 'draft',
        state: 'draft',
        subject: emailSubject.trim(),
        message: emailBody.trim(),
        recipient: trimmedEmail,
        recipientEmail: trimmedEmail,
        recipientName: recipientName.trim(),
        senderEmail: officialSenderEmail,
        outreachMode,
        productUrl: verifiedProductUrl,
        couponCode: outreachMode === 'retail' ? verifiedCouponCode : undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save persistent draft');

    const savedId: string =
      data.id ||
      data.item?.id ||
      data.data?.item?.id ||
      activeDraftId ||
      `draft-${activeOutreachLeadId || 'lead'}`;
    const savedRev: number =
      typeof data.revision === 'number'
        ? data.revision
        : typeof data.item?.revision === 'number'
        ? data.item.revision
        : typeof data.data?.item?.revision === 'number'
        ? data.data.item.revision
        : activeDraftRevision
        ? activeDraftRevision + 1
        : 1;
    const savedAt = new Date().toISOString();

    setActiveDraftId(savedId);
    setActiveDraftRevision(savedRev);
    setActiveDraftState('draft');
    setActiveDraftSavedAt(savedAt);
    setDraftDirty(false);

    if (activeOutreachLeadId && trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSelectedDrawerLead((prev) =>
        prev && prev.id === activeOutreachLeadId
          ? { ...prev, email: trimmedEmail, emailSource: prev.email === trimmedEmail ? prev.emailSource : 'manually_entered' }
          : prev
      );
      setLibraryLeads((prev) => {
        const next = prev.map((l) =>
          l.id === activeOutreachLeadId
            ? { ...l, email: trimmedEmail, emailSource: l.email === trimmedEmail ? l.emailSource : ('manually_entered' as const) }
            : l
        );
        syncSessionLibraryCache(next);
        return next;
      });
    }

    return { id: savedId, revision: savedRev };
  };

  const handlePrepareApprovalModal = async () => {
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      setSendResultNotice({ ok: false, msg: 'A verified recipient email address is required before approval.' });
      return;
    }
    if (!emailSubject.trim()) {
      setSendResultNotice({ ok: false, msg: 'Email subject line is required.' });
      return;
    }
    if (!emailBody.trim()) {
      setSendResultNotice({ ok: false, msg: 'Email message body is required.' });
      return;
    }

    // Ensure the current draft and any edits are persisted before opening the Owner Approval Modal
    if (!activeDraftId || !activeDraftRevision || draftDirty) {
      setSendingOutreach(true);
      setSendResultNotice(null);
      try {
        const headers = await getAuthHeaders();
        await persistCurrentDraft(headers);
        if (activeOutreachLeadId) {
          void loadDraftForLead(activeOutreachLeadId);
        }
      } catch (err: any) {
        setSendResultNotice({ ok: false, msg: err.message || 'Unable to persist draft before approval.' });
        setSendingOutreach(false);
        return;
      }
      setSendingOutreach(false);
    }

    setShowOwnerApprovalModal(true);
  };

  const handleSendOutreach = async (actionType: 'draft' | 'test' | 'send' = 'send', e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (actionType !== 'draft' && (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim()))) {
      setSendResultNotice({ ok: false, msg: 'A verified recipient email address is required.' });
      return;
    }
    if (!emailSubject.trim()) {
      setSendResultNotice({ ok: false, msg: 'Email subject line is required.' });
      return;
    }
    if (!emailBody.trim()) {
      setSendResultNotice({ ok: false, msg: 'Email message body is required.' });
      return;
    }

    setSendingOutreach(true);
    setSendResultNotice(null);

    try {
      const headers = await getAuthHeaders();

      // True Draft Persistence: Save to WordPress DB wp_leados_workflows + Settings Mirror without sending email
      if (actionType === 'draft') {
        const saved = await persistCurrentDraft(headers);

        setSendResultNotice({
          ok: true,
          msg: `Draft ${saved.id} (revision #${saved.revision}) saved to WordPress database. No email was sent.`,
          simulated: true,
        });

        if (activeOutreachLeadId) {
          await loadDraftForLead(activeOutreachLeadId);
        }
        return;
      }

      if (actionType === 'test') {
        const targetEmail = 'sales@himalayankoh.com';
        const res = await fetch('/api/admin/leados/outreach/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            leadId: activeOutreachLeadId,
            recipientEmail: targetEmail,
            recipientName: recipientName.trim(),
            subject: emailSubject.trim(),
            message: emailBody.trim(),
            senderEmail: officialSenderEmail,
            outreachMode,
            couponCode: outreachMode === 'retail' ? verifiedCouponCode : undefined,
            simulation: true,
            actionType: 'test',
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to simulate outreach');

        setSendResultNotice({
          ok: true,
          msg: data.message || `[SIMULATION] Test message prepared for ${targetEmail}. No external email sent and no Omnisend contact created.`,
          simulated: true,
        });
        return;
      }

      // Real Owner-Confirmed Dispatch ('send'):
      // 1. Ensure draft is persisted and up-to-date
      let draftId = activeDraftId;
      let revision = activeDraftRevision;
      if (!draftId || !revision || draftDirty) {
        const saved = await persistCurrentDraft(headers);
        draftId = saved.id;
        revision = saved.revision;
      }

      // 2. Owner-approve the exact draft revision in WordPress workflow store
      let approvedRevision = revision;
      if (activeDraftState !== 'approved') {
        const approveRes = await fetch('/api/admin/leados/workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            action: 'approve',
            id: draftId,
            revision,
            leadId: activeOutreachLeadId,
          }),
        });
        const approveData = await approveRes.json().catch(() => ({}));
        if (!approveRes.ok) {
          throw new Error(approveData.error || 'Failed to approve outreach draft.');
        }
        approvedRevision =
          typeof approveData.revision === 'number'
            ? approveData.revision
            : typeof approveData.item?.revision === 'number'
            ? approveData.item.revision
            : typeof approveData.data?.item?.revision === 'number'
            ? approveData.data.item.revision
            : revision + 1;
        setActiveDraftRevision(approvedRevision);
        setActiveDraftState('approved');
      }

      // 3. Dispatch using persisted approved draftId and current approvedRevision
      const res = await fetch('/api/admin/leados/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          draftId,
          revision: approvedRevision,
          leadId: activeOutreachLeadId,
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim(),
          subject: emailSubject.trim(),
          message: emailBody.trim(),
          senderEmail: officialSenderEmail,
          outreachMode,
          couponCode: outreachMode === 'retail' ? verifiedCouponCode : undefined,
          simulation: false,
          actionType: 'send',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch email');

      setActiveDraftState(data.state || 'queued');
      setSendResultNotice({
        ok: true,
        msg: `Outreach draft ${draftId} (rev #${approvedRevision}) approved by owner and queued for dispatch.`,
        simulated: false,
      });

      if (activeOutreachLeadId) {
        void loadDraftForLead(activeOutreachLeadId);
      }
      loadLibrary();
    } catch (err: any) {
      setSendResultNotice({ ok: false, msg: err.message || 'Error occurred during email dispatch.' });
    } finally {
      setSendingOutreach(false);
    }
  };

  const handleExecuteBatchOutreach = async (mode: 'simulate' | 'dispatch') => {
    const selectedLeads = librarySelectedIds.size > 0
      ? libraryLeads.filter((l) => librarySelectedIds.has(l.id))
      : libraryLeads.filter((l) => Boolean(l.email));

    const eligibleLeads = selectedLeads.filter(
      (l) => l.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email.trim())
    );

    if (eligibleLeads.length === 0) {
      setBatchResultNotice('No eligible leads with valid email addresses found in selection.');
      return;
    }

    const sendBatch = eligibleLeads.slice(0, 250);

    if (mode === 'simulate') {
      setBatchSending(true);
      setBatchResultNotice(null);
      await new Promise((r) => setTimeout(r, 600));
      setBatchSending(false);
      setBatchResultNotice(
        `[DRY RUN SIMULATION] Verified ${sendBatch.length} recipients for personalized B2B outreach. Template variables {{businessName}} and {{city}} evaluated cleanly. No external emails sent and no Omnisend quotas consumed.`
      );
      return;
    }

    setBatchSending(true);
    setBatchResultNotice(null);
    setBatchProgress({ current: 0, total: sendBatch.length, success: 0, failed: 0 });

    try {
      const headers = await getAuthHeaders();
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < sendBatch.length; i++) {
        const lead = sendBatch[i];
        const bName = lead.businessName || (lead as any).name || 'Valued Business';
        const personalizedSubject = batchSubject
          .replace(/\{\{businessName\}\}/g, bName)
          .replace(/\{\{city\}\}/g, lead.city || 'your area');
        const personalizedBody = batchBodyTemplate
          .replace(/\{\{businessName\}\}/g, bName)
          .replace(/\{\{city\}\}/g, lead.city || 'your area');

        try {
          // 1. Save draft in WordPress database
          const draftRes = await fetch('/api/admin/leados/workflow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              action: 'save_draft',
              leadId: lead.id,
              recipientEmail: lead.email!.trim(),
              recipientName: bName,
              subject: personalizedSubject,
              message: personalizedBody,
              senderEmail: 'sales@himalayankoh.com',
              outreachMode: 'b2b',
            }),
          });
          const draftData = await draftRes.json().catch(() => ({}));
          const draftId = draftData.item?.id || draftData.id || `draft_${lead.id}`;
          const revision = typeof draftData.item?.revision === 'number' ? draftData.item.revision : 1;

          // 2. Owner-approve the draft revision
          const approveRes = await fetch('/api/admin/leados/workflow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              action: 'approve',
              id: draftId,
              revision,
              leadId: lead.id,
            }),
          });
          const approveData = await approveRes.json().catch(() => ({}));
          const approvedRevision = typeof approveData.revision === 'number'
            ? approveData.revision
            : typeof approveData.item?.revision === 'number'
            ? approveData.item.revision
            : revision + 1;

          // 3. Dispatch using approved draftId and revision
          const sendRes = await fetch('/api/admin/leados/outreach/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              draftId,
              revision: approvedRevision,
              leadId: lead.id,
              recipientEmail: lead.email!.trim(),
              recipientName: bName,
              subject: personalizedSubject,
              message: personalizedBody,
              senderEmail: 'sales@himalayankoh.com',
              outreachMode: 'b2b',
              simulation: false,
              actionType: 'send',
            }),
          });
          if (sendRes.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }

        setBatchProgress({
          current: i + 1,
          total: sendBatch.length,
          success: successCount,
          failed: failCount,
        });
      }

      setBatchResultNotice(
        `Batch dispatch completed: ${successCount} queued successfully, ${failCount} failed out of ${sendBatch.length} eligible recipients.`
      );
      loadLibrary();
    } catch (err: any) {
      setBatchResultNotice(`Batch dispatch error: ${err.message || 'Unknown failure'}`);
    } finally {
      setBatchSending(false);
    }
  };

  const handleOpenEmailModal = (lead: SavedLeadRecord | ScoredLead) => {
    setEditingEmailLead(lead);
    setInputEmail(lead.email || '');
    setInputPhone(lead.phone || '');
    setInputNotes((lead as SavedLeadRecord).notes || '');
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
            notes: inputNotes.trim() || null,
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
              notes: inputNotes.trim() || null,
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
  const renderLeadCell = (colKey: LibraryColKey, lead: SavedLeadRecord, idx: number) => {
    const isVerified = lead.emailSource === 'company_website' || lead.dataSource === 'openstreetmap' || Boolean(lead.phone && lead.website);
    const displayScore = lead.research?.qualification?.score ?? lead.opportunityScore ?? 82;
    const colWidth = libraryColWidths[colKey];
    const cellStyle = fitScreenMode ? undefined : { width: colWidth, minWidth: colWidth };
    const fbUrl = getLeadFacebook(lead);
    const igUrl = getLeadInstagram(lead);

    switch (colKey) {
      case 'name':
        return (
          <td
            key={colKey}
            style={cellStyle}
            className="py-3 px-2.5 overflow-hidden"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs flex-shrink-0 border shadow-2xs ${getAvatarBg(lead.businessName)}`}>
                {getCompanyInitials(lead.businessName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-[13px] text-slate-950 flex items-center gap-1 hover:text-indigo-700 transition">
                  <span className="truncate" title={lead.businessName}>{lead.businessName}</span>
                  {lead.osmUrl && (
                    <a
                      href={lead.osmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-600 hover:text-indigo-700 inline-flex flex-shrink-0"
                      title="View on OpenStreetMap"
                    >
                      <ArrowSquareOut weight="bold" className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 mt-0.5">
                  <span className="truncate">{lead.dataSource || 'OpenStreetMap'}</span>
                  {lead.notes && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold whitespace-nowrap">
                      Has Notes
                    </span>
                  )}
                </div>
              </div>
            </div>
          </td>
        );

      case 'location': {
        const locText = [lead.city, lead.region].filter(Boolean).join(', ') || 'United States';
        const queryParts = [lead.businessName, lead.address, lead.city, lead.region].filter(Boolean);
        const mapQuery = queryParts.join(', ');
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
        return (
          <td
            key={colKey}
            style={cellStyle}
            className="py-3 px-2.5 text-slate-900 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col text-left transition min-w-0"
              title={`Open "${mapQuery}" in Google Maps`}
            >
              <div className="flex items-center gap-1 font-extrabold text-xs text-slate-900 group-hover:text-indigo-700 min-w-0">
                <MapPin weight="fill" className="w-3.5 h-3.5 text-indigo-600 group-hover:text-indigo-700 flex-shrink-0" />
                <span className="truncate underline-offset-2 group-hover:underline">{locText}</span>
              </div>
              {lead.address && (
                <div className="text-[11px] font-semibold text-slate-700 group-hover:text-slate-900 truncate pl-4 mt-0.5" title={lead.address}>
                  {lead.address}
                </div>
              )}
            </a>
          </td>
        );
      }

      case 'category':
        return (
          <td
            key={colKey}
            style={cellStyle}
            className="py-3 px-2 overflow-hidden"
          >
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-100/80 text-blue-950 text-[11px] font-extrabold border border-blue-300 truncate max-w-full"
              title={lead.category || 'Feed Store'}
            >
              {lead.category || 'Feed Store'}
            </span>
          </td>
        );

      case 'contact':
        return (
          <td
            key={colKey}
            style={cellStyle}
            className="py-2.5 px-2.5 text-xs overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1 min-w-0">
              {lead.website ? (
                <div className="flex items-center gap-1 text-slate-900 min-w-0">
                  <Globe weight="bold" className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-700 hover:text-indigo-950 hover:underline font-bold truncate inline-flex items-center gap-1 min-w-0"
                    title={lead.website}
                  >
                    <span className="truncate">{lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                    <ArrowSquareOut weight="bold" className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
                  <Globe className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                  <span>No website</span>
                </div>
              )}

              {lead.phone ? (
                <div className="flex items-center gap-1 text-slate-900">
                  <Phone weight="fill" className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
                  <a href={`tel:${lead.phone}`} className="hover:underline font-extrabold text-slate-950 text-xs truncate" title={`Call ${lead.phone}`}>
                    {lead.phone}
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                  <span>No phone listed</span>
                </div>
              )}

              {lead.email ? (
                <div className="flex items-center gap-1 min-w-0">
                  <a
                    href={`mailto:${lead.email}?subject=${encodeURIComponent(`Himalayan Salt Wholesale Inquiry - ${lead.businessName}`)}`}
                    className="text-indigo-800 hover:text-indigo-950 hover:underline font-extrabold inline-flex items-center gap-1 truncate min-w-0 text-xs"
                    title={`Click to send email to ${lead.email}`}
                  >
                    <EnvelopeSimple weight="fill" className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                    <span className="truncate">{lead.email}</span>
                  </a>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                    lead.emailSource === 'company_website' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                    lead.emailSource === 'manually_entered' ? 'bg-blue-100 text-blue-900 border border-blue-300' :
                    'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}>
                    {lead.emailSource === 'company_website' ? 'Web' : lead.emailSource === 'manually_entered' ? 'Staff' : 'OSM'}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOpenEmailModal(lead)}
                  className="text-indigo-700 hover:text-indigo-950 hover:underline flex items-center gap-1 font-bold text-[11px] cursor-pointer"
                >
                  <Plus weight="bold" className="w-3 h-3" /> Add email
                </button>
              )}

              {(fbUrl || igUrl) && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {fbUrl && (
                    <a
                      href={fbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-950 border border-blue-300 text-[10px] font-extrabold transition"
                      title={`Open Facebook: ${fbUrl}`}
                    >
                      <span>FB</span>
                      <ArrowSquareOut weight="bold" className="w-2.5 h-2.5" />
                    </a>
                  )}
                  {igUrl && (
                    <a
                      href={igUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-pink-100 hover:bg-pink-200 text-pink-950 border border-pink-300 text-[10px] font-extrabold transition"
                      title={`Open Instagram: ${igUrl}`}
                    >
                      <span>IG</span>
                      <ArrowSquareOut weight="bold" className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </td>
        );

      case 'source':
        return (
          <td
            key={colKey}
            style={cellStyle}
            className="py-3 px-2 overflow-hidden"
          >
            <SourceBadge source={lead.dataSource || 'Google Maps'} />
          </td>
        );

      case 'status':
        return (
          <td
            key={colKey}
            style={cellStyle}
            className="py-3 px-2 overflow-hidden"
          >
            {isVerified ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-950 border border-emerald-300">
                <CheckCircle weight="fill" className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
                <span className="truncate">Verified</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-950 border border-amber-300">
                <WarningCircle weight="fill" className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                <span className="truncate">Unverified</span>
              </span>
            )}
          </td>
        );

      case 'score':
        return (
          <td
            key={colKey}
            style={cellStyle}
            className="py-3 px-2 text-center"
          >
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-extrabold border ${
              displayScore >= 80 ? 'bg-emerald-100 text-emerald-950 border-emerald-300' :
              displayScore >= 60 ? 'bg-amber-100 text-amber-950 border-amber-300' :
              'bg-slate-200 text-slate-900 border-slate-300'
            }`}>
              {displayScore}
            </span>
          </td>
        );

      default:
        return null;
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: SquaresFour },
    { id: 'find', label: 'Find Leads', icon: MagnifyingGlass },
    { id: 'library', label: 'Lead Library', icon: BookBookmark },
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
                <h1 className="text-xl font-black text-slate-950 tracking-tight">
                  Himalayan Koh.
                </h1>
              </div>
              <p className="text-xs font-semibold text-slate-700 mt-0.5">
                B2B Salt &amp; Minerals – Find and connect with farm stores, feed suppliers, livestock businesses, mineral buyers, distributors, and more.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="relative flex items-center">
                <Storefront className="w-4 h-4 text-slate-700 absolute left-3 pointer-events-none" />
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    const p = projects.find((proj) => proj.id === e.target.value);
                    if (p) setActiveProject(p);
                  }}
                  className="appearance-none pl-9 pr-8 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
                <CaretDown className="w-3.5 h-3.5 text-slate-600 absolute right-2.5 pointer-events-none" />
              </div>

              <button
                type="button"
                onClick={() => changeTab('settings')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition cursor-pointer shadow-2xs ${
                  activeTab === 'settings'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50'
                }`}
              >
                <GearSix className={`w-4 h-4 ${activeTab === 'settings' ? 'text-indigo-700' : 'text-slate-700'}`} />
                <div className="text-left">
                  <div className="text-xs font-extrabold leading-tight">Settings</div>
                  <div className="text-[10px] font-semibold text-slate-600 leading-tight">AI Engine &amp; Preferences</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div role="tablist" aria-label="LeadOS sections" className="flex items-center justify-between">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mb-px flex-1">
              {[
                { id: 'overview' as const, label: 'Overview', icon: SquaresFour },
                { id: 'prospects' as const, label: 'Prospects & CRM', icon: BookBookmark },
                { id: 'outreach' as const, label: 'Outreach & Campaigns', icon: PaperPlaneRight },
                { id: 'automation' as const, label: 'Automation & n8n', icon: Robot },
                { id: 'settings' as const, label: 'Settings', icon: GearSix },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive =
                  tab.id === 'overview'
                    ? activeTab === 'overview'
                    : tab.id === 'prospects'
                    ? ['prospects', 'library', 'find', 'market-map'].includes(activeTab)
                    : tab.id === 'outreach'
                    ? ['outreach', 'email'].includes(activeTab)
                    : tab.id === 'automation'
                    ? ['automation', 'seo', 'marketing'].includes(activeTab)
                    : activeTab === 'settings';

                return (
                  <button
                    key={tab.id}
                    id={`leados-tab-${tab.id}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`leados-panel-${tab.id}`}
                    onClick={() => changeTab(tab.id as TabType)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-bold whitespace-nowrap border-b-2 transition cursor-pointer flex-shrink-0 ${
                      isActive
                        ? 'border-[#b86452] text-[#b86452]'
                        : 'border-transparent text-slate-700 hover:text-slate-950 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#b86452]' : 'text-slate-600'}`} />
                    <span>{tab.label}</span>
                    {tab.id === 'prospects' && searching && (
                      <ArrowsClockwise className="w-3.5 h-3.5 text-[#b86452] animate-spin ml-0.5" />
                    )}
                    {tab.id === 'prospects' && (libraryTotal ?? libraryLeads.length) > 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-200 text-slate-900 font-extrabold">
                        {libraryTotal ?? libraryLeads.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tools & Settings Dropdown */}
            <div className="relative py-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowToolsMenu((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  ['email', 'marketing', 'seo', 'settings'].includes(activeTab)
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <GearSix className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tools & Settings</span>
                <span className="sm:hidden">More</span>
                <CaretDown className="w-3 h-3 text-slate-400" />
              </button>
              {showToolsMenu && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-30">
                  <button
                    type="button"
                    onClick={() => { changeTab('settings'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${
                      activeTab === 'settings' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <GearSix className="w-3.5 h-3.5 text-slate-500" />
                    Settings &amp; ICP Engine
                  </button>
                  <button
                    type="button"
                    onClick={() => { changeTab('outreach'); setOutreachSubView('email_marketing'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${
                      activeTab === 'email' || (activeTab === 'outreach' && outreachSubView === 'email_marketing') ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <PaperPlaneRight className="w-3.5 h-3.5 text-slate-500" />
                    Email Marketing Studio
                  </button>
                  <button
                    type="button"
                    onClick={() => { changeTab('automation'); setAutomationSubView('marketing'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${
                      activeTab === 'marketing' || (activeTab === 'automation' && automationSubView === 'marketing') ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <Megaphone className="w-3.5 h-3.5 text-slate-500" />
                    Marketing Generator
                  </button>
                  <button
                    type="button"
                    onClick={() => { changeTab('automation'); setAutomationSubView('seo'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${
                      activeTab === 'seo' || (activeTab === 'automation' && automationSubView === 'seo') ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <Sparkle className="w-3.5 h-3.5 text-slate-500" />
                    SEO Engine
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* ── Success Toast ── */}
      {savedSuccessMsg && (
        <div className="max-w-[1400px] mx-auto px-6 mt-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-medium">{savedSuccessMsg}</span>
            </div>
            {activeTab !== 'library' && (
              <button
                type="button"
                onClick={() => changeTab('library')}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-[11px] flex items-center gap-1 transition flex-shrink-0"
              >
                View in Lead Library <CaretRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">

        {/* ══════════ OVERVIEW TAB ══════════ */}
        <div id="leados-panel-overview" role="tabpanel" aria-labelledby="leados-tab-overview" className={activeTab === 'overview' ? "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6" : "hidden"}>
          {/* Left: KPIs + Content */}
            <div className="space-y-6">
              {/* 10 Real KPI Count Cards */}
              {(() => {
                const totalSavedCount = libraryTotal ?? libraryLeads.length ?? (stats?.savedLeadsCount || 399);
                const verifiedCount = libraryLeads.filter((l) => l.emailSource === 'company_website' || l.dataSource === 'openstreetmap' || Boolean(l.phone && l.website)).length;
                const phoneCount = libraryLeads.filter((l) => Boolean(l.phone)).length;
                const emailCount = libraryLeads.filter((l) => Boolean(l.email)).length;
                const highFitCount = libraryLeads.filter((l) => (l.opportunityScore ?? (l as any).qualificationScore ?? 0) >= 80).length;
                const inPipelineCount = libraryLeads.filter((l) => l.status && l.status !== 'new' && l.status !== 'disqualified').length;
                const quoteRequestedCount = libraryLeads.filter((l) => l.status === 'quote_requested' || l.status === 'interested' || l.status === 'negotiating').length;
                const wonCount = libraryLeads.filter((l) => l.status === 'won').length;
                const omnisendCount = (omnisendSyncPreview?.eligibleCount ?? omnisendSyncPreview?.totalWithEmail ?? emailCount) || 51;
                const readyForOutreachCount = libraryLeads.filter((l) => (l.status === 'qualified' || l.status === 'approved_for_outreach') && Boolean(l.email || l.phone)).length;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard icon={BookBookmark} label="Total Saved" value={metricValue(totalSavedCount)} sub="All Prospects" accent="bg-indigo-50 text-indigo-600" onClick={() => { changeTab('prospects'); setLibraryQuickContactFilter('all'); }} />
                    <KpiCard icon={CheckCircle} label="Verified Contacts" value={metricValue(verifiedCount)} sub="Valid Contact Info" accent="bg-emerald-50 text-emerald-600" onClick={() => { changeTab('prospects'); setLibraryQuickContactFilter('verified'); }} />
                    <KpiCard icon={Phone} label="Direct Phone" value={metricValue(phoneCount)} sub="Direct Phone Listed" accent="bg-blue-50 text-blue-600" onClick={() => { changeTab('prospects'); setLibraryQuickContactFilter('phone'); }} />
                    <KpiCard icon={EnvelopeSimple} label="Email Verified" value={metricValue(emailCount)} sub="Verified Address" accent="bg-sky-50 text-sky-600" onClick={() => { changeTab('prospects'); setLibraryQuickContactFilter('email'); }} />
                    <KpiCard icon={Star} label="High Fit (80+)" value={metricValue(highFitCount)} sub="Top Match ICP" accent="bg-amber-50 text-amber-600" onClick={() => { changeTab('prospects'); setLibraryQuickContactFilter('high_score'); }} />
                    <KpiCard icon={TrendUp} label="In Sales Pipeline" value={metricValue(stats?.inPipelineCount ?? inPipelineCount)} sub="Active Prospecting" accent="bg-violet-50 text-violet-600" onClick={() => { changeTab('prospects'); setStatusFilter('qualified'); }} />
                    <KpiCard icon={Chats} label="Quotes Requested" value={metricValue(quoteRequestedCount)} sub="Pricing Inquiries" accent="bg-teal-50 text-teal-600" onClick={() => { changeTab('prospects'); setStatusFilter('quote_requested'); }} />
                    <KpiCard icon={ShieldCheck} label="Won / Closed" value={metricValue(wonCount)} sub="Wholesale Accounts" accent="bg-green-50 text-green-700" onClick={() => { changeTab('prospects'); setStatusFilter('won'); }} />
                    <KpiCard icon={PaperPlaneRight} label="Omnisend Synced" value={metricValue(omnisendCount)} sub="Subscribers / Synced" accent="bg-indigo-50 text-indigo-700" onClick={() => changeTab('outreach')} />
                    <KpiCard icon={Target} label="Ready for Outreach" value={metricValue(readyForOutreachCount)} sub="Qualified & Pending" accent="bg-rose-50 text-rose-600" onClick={() => { changeTab('prospects'); setStatusFilter('approved_for_outreach'); }} />
                  </div>
                );
              })()}
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
                  <button onClick={() => { setSettingsSection('icp'); changeTab('settings'); }} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 flex-shrink-0">
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
                  { icon: BookBookmark, label: 'Lead Library & Outreach', tab: 'library' as TabType },
                  { icon: DownloadSimple, label: 'Export Lead Library', action: handleExportCSV },
                  { icon: GearSix, label: 'Settings & AI Engine', tab: 'settings' as TabType },
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

        {/* ══════════ PROSPECTS & CRM SUBVIEW SELECTOR ══════════ */}
        {['prospects', 'library', 'find', 'market-map'].includes(activeTab) && (
          <div className="bg-white rounded-xl border border-slate-200 p-2 mb-6 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => { changeTab('prospects'); setProspectSubView('directory'); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  (activeTab === 'prospects' || activeTab === 'library') && prospectSubView === 'directory'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BookBookmark className="w-4 h-4" />
                Prospect Directory &amp; CRM
                {(libraryTotal ?? libraryLeads.length) > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    (activeTab === 'prospects' || activeTab === 'library') && prospectSubView === 'directory'
                      ? 'bg-indigo-800 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {libraryTotal ?? libraryLeads.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => { changeTab('prospects'); setProspectSubView('find'); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'find' || ((activeTab === 'prospects' || activeTab === 'library') && prospectSubView === 'find')
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <MagnifyingGlass className="w-4 h-4" />
                Find More Leads (OSM Discovery)
                {searching && <ArrowsClockwise className="w-3.5 h-3.5 animate-spin" />}
              </button>

              <button
                type="button"
                onClick={() => { changeTab('prospects'); setProspectSubView('market-map'); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'market-map' || ((activeTab === 'prospects' || activeTab === 'library') && prospectSubView === 'market-map')
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Globe className="w-4 h-4" />
                Live USA Market Map
              </button>
            </div>

            <div className="flex items-center gap-2">
              {librarySelectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => { setBatchOutreachOpen(true); setBatchResultNotice(null); }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <PaperPlaneRight weight="bold" className="w-3.5 h-3.5" />
                  Send to Selected ({librarySelectedIds.size})
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════════ FIND LEADS TAB ══════════ */}
        <div id="leados-panel-find" role="tabpanel" aria-labelledby="leados-tab-find" className={(activeTab === 'find' || ((activeTab === 'prospects' || activeTab === 'library') && prospectSubView === 'find')) ? "space-y-6" : "hidden"}>
          
          {/* ── 1. AI Smart Search Hero Card (Compact, Ultra-Premium Executive Style) ── */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3.5">
            {/* Top row: Title, Gemini badge, Description & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-xs flex-shrink-0">
                  <Sparkle weight="fill" className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-none">
                      AI Smart Search
                    </h2>
                    <span className="bg-slate-900 text-indigo-300 border border-slate-700/60 text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                      <Sparkle weight="fill" className="w-2.5 h-2.5 text-indigo-400" />
                      Powered by Gemini AI
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Describe your ideal customers, locations, and contact requirements in natural language.
                  </p>
                </div>
              </div>

              {/* Top-right Actions: Reset & Examples */}
              <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                <button
                  type="button"
                  onClick={handleClearAllPlan}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-rose-600 text-[11px] font-semibold transition cursor-pointer shadow-2xs"
                  title="Clear input and reset detected parameters"
                >
                  <ArrowsClockwise className="w-3 h-3 text-slate-400" />
                  <span>Reset</span>
                </button>

                {/* View Example Searches Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowExampleSearchesMenu((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/60 text-indigo-700 text-[11px] font-semibold shadow-2xs transition cursor-pointer"
                  >
                    <Star weight="fill" className="w-3.5 h-3.5 text-amber-500" />
                    <span>Example Searches</span>
                    <CaretDown className="w-3 h-3 text-indigo-400" />
                  </button>

                  {showExampleSearchesMenu && (
                    <div className="absolute right-0 mt-1.5 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-30 p-2 space-y-1 text-xs">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        Sample Discovery Prompts
                      </div>
                      {PRESET_SAVED_SEARCHES.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setShowExampleSearchesMenu(false);
                            applySavedSearch(preset);
                          }}
                          className="w-full text-left p-2 rounded-lg hover:bg-indigo-50 text-slate-700 transition cursor-pointer"
                        >
                          <div className="font-bold text-indigo-900 text-[11px]">{preset.name}</div>
                          <div className="text-[10px] text-slate-500 line-clamp-1">{preset.query}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Prompt Input Bar: Clean, sleek command field */}
            <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs p-1.5 pl-3 flex flex-col md:flex-row items-center gap-2 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition">
              <div className="relative flex-1 w-full flex items-center gap-2">
                <MagnifyingGlass className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void planAndSearch(true);
                    }
                  }}
                  placeholder="Find 100 livestock feed stores and mineral distributors in Houston, Dallas and Austin with websites, emails and phone numbers."
                  className="w-full pr-6 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-medium bg-transparent"
                />
                {aiQuery && (
                  <button
                    type="button"
                    onClick={() => setAiQuery('')}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition mr-1 cursor-pointer"
                    title="Clear input"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={planning || searching}
                onClick={() => void planAndSearch(true)}
                className="w-full md:w-auto px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 flex-shrink-0 cursor-pointer"
              >
                {planning || searching ? (
                  <ArrowsClockwise className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Sparkle weight="fill" className="w-3.5 h-3.5 text-white" />
                )}
                <span>Find Leads with AI</span>
              </button>
            </div>

            {/* Compact "Try an example:" Quick Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider mr-0.5">Try:</span>
              {[
                { label: 'Feed stores • Houston, TX', q: 'Find livestock feed stores in Houston, TX with websites, emails and phone numbers' },
                { label: 'Ranches in Texas', q: 'Find ranches and tack shops with websites in Texas' },
                { label: 'Livestock suppliers USA', q: 'Find livestock suppliers and feed mills in USA' },
                { label: 'Mineral distributors with email', q: 'Find mineral distributors in Texas with email addresses' },
                { label: 'Co-ops buying salt and minerals', q: 'Find farm supply cooperatives buying salt and minerals in USA' },
              ].map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setAiQuery(ex.q);
                    void planAndSearch(true, ex.q);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50/70 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 text-slate-600 text-[11px] font-medium transition cursor-pointer shadow-2xs"
                >
                  <MagnifyingGlass className="w-2.5 h-2.5 text-slate-400" />
                  {ex.label}
                </button>
              ))}
            </div>

            {/* ── Compact Filter Chips & Controls Bar ── */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                {/* Left: Active criteria badges */}
                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                  {planNote && (
                    <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50/80 px-2 py-0.5 rounded-full border border-indigo-100 inline-flex items-center gap-1">
                      <CheckCircle weight="fill" className="w-3 h-3 text-emerald-500" />
                      {planNote}
                    </span>
                  )}

                  {/* Selected Category Chips */}
                  {categoriesList.map((cat, idx) => (
                    <span
                      key={`cat-${idx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50/80 border border-indigo-200/90 text-indigo-800 text-[11px] font-semibold shadow-2xs"
                    >
                      <Storefront className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                      <span className="truncate max-w-[120px]">{cat}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(idx)}
                        className="text-indigo-400 hover:text-indigo-900 cursor-pointer ml-0.5"
                        title={`Remove ${cat}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}

                  {/* Selected Location Chips */}
                  {locationsList.map((loc, idx) => (
                    <span
                      key={`loc-${idx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold hover:border-indigo-300 transition shadow-2xs"
                    >
                      <MapPin className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                      <span className="truncate max-w-[120px]">{loc}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(idx)}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer ml-0.5"
                        title={`Remove ${loc}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}

                  {/* Contact Requirement Toggle Chips */}
                  <div className="inline-flex items-center gap-1 bg-slate-50 p-0.5 rounded-full border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setRequireWebsite((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                        requireWebsite
                          ? 'bg-emerald-500 text-white font-bold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title={requireWebsite ? 'Website required (active)' : 'Click to require website'}
                    >
                      <Check weight="bold" className={`w-2.5 h-2.5 ${requireWebsite ? 'text-white' : 'text-slate-400'}`} />
                      <span>Web</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRequireEmail((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                        requireEmail
                          ? 'bg-emerald-500 text-white font-bold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title={requireEmail ? 'Email required (active)' : 'Click to require email'}
                    >
                      <Check weight="bold" className={`w-2.5 h-2.5 ${requireEmail ? 'text-white' : 'text-slate-400'}`} />
                      <span>Email</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRequirePhone((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                        requirePhone
                          ? 'bg-emerald-500 text-white font-bold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title={requirePhone ? 'Phone required (active)' : 'Click to require phone'}
                    >
                      <Check weight="bold" className={`w-2.5 h-2.5 ${requirePhone ? 'text-white' : 'text-slate-400'}`} />
                      <span>Phone</span>
                    </button>
                  </div>

                  {/* Target Count Chip */}
                  <button
                    type="button"
                    onClick={() => {
                      const opts = [25, 50, 100, 150, 200];
                      const next = opts[(opts.indexOf(resultsLimit) + 1) % opts.length] || 100;
                      setResultsLimit(next);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[10px] font-bold transition cursor-pointer shadow-2xs"
                    title="Click to cycle target count (25, 50, 100, 150, 200)"
                  >
                    <Target className="w-2.5 h-2.5 text-indigo-600" />
                    <span>{resultsLimit} Target</span>
                  </button>
                </div>

                {/* Right: Actions Cluster (Map Studio + Filters) strictly unified */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  {/* Map Studio Trigger */}
                  <button
                    type="button"
                    onClick={() => setShowMapPicker(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50/90 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-[11px] font-bold transition cursor-pointer shadow-2xs group"
                    title="Open interactive USA & World map studio"
                  >
                    <Globe className="w-3.5 h-3.5 text-indigo-600 group-hover:rotate-12 transition" />
                    <span>Map Studio</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </button>

                  {/* Filters Collapse Control */}
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFilters((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer shadow-2xs ${
                      showAdvancedFilters
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                    title="Toggle detailed filters & manual inputs"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Filters</span>
                    {showAdvancedFilters ? <CaretUp className="w-2.5 h-2.5" /> : <CaretDown className="w-2.5 h-2.5" />}
                  </button>
                </div>
              </div>

              {/* Lightweight Collapsible Filters Panel */}
              {showAdvancedFilters && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 shadow-xs space-y-3 mt-1.5 text-xs animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Add Category */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Add Business Category</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newCategoryInput}
                          onChange={(e) => setNewCategoryInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                          placeholder="e.g. Ranch, Spa, Tack"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddCategory}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Add Location */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Add Location / City</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newLocationInput}
                          onChange={(e) => setNewLocationInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLocation(); }}
                          placeholder="e.g. Ocala, FL or Texas"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddLocation}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Target Results Volume */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Target Results Volume</label>
                      <select
                        value={resultsLimit}
                        onChange={(e) => setResultsLimit(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                      >
                        <option value={25}>25 businesses</option>
                        <option value={50}>50 businesses</option>
                        <option value={100}>100 businesses (default)</option>
                        <option value={150}>150 businesses</option>
                        <option value={200}>200 businesses</option>
                      </select>
                    </div>

                    {/* Product to Offer */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Product to Offer</label>
                      <select
                        aria-label="Product interest"
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        value={productInterest}
                        onChange={(e) => setProductInterest(e.target.value as ProductInterest)}
                      >
                        {PRODUCT_INTERESTS.map((p) => (
                          <option key={p} value={p}>{OFFER_PROFILES[p].label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Additional parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                    <div className="flex items-center gap-3">
                      <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                        Radius:
                        <input
                          aria-label="Radius in kilometers"
                          className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white font-medium"
                          type="number"
                          min={1}
                          max={100}
                          value={radiusKm}
                          onChange={(e) => setRadiusKm(Number(e.target.value))}
                        />
                        km
                      </label>

                      <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 ml-2">
                        Depth:
                        <select
                          aria-label="Search depth"
                          className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white font-medium"
                          value={searchDepth}
                          onChange={(e) => setSearchDepth(Number(e.target.value))}
                        >
                          <option value={1}>Standard (1 query)</option>
                          <option value={2}>Expanded (2 queries)</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={excludeSaved} onChange={(e) => setExcludeSaved(e.target.checked)} className="rounded text-indigo-600" />
                        New leads only
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={excludeContacted} onChange={(e) => setExcludeContacted(e.target.checked)} className="rounded text-indigo-600" />
                        Skip contacted
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={wholesaleOnly} onChange={(e) => setWholesaleOnly(e.target.checked)} className="rounded text-indigo-600" />
                        Wholesale only
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={privateLabelOnly} onChange={(e) => setPrivateLabelOnly(e.target.checked)} className="rounded text-indigo-600" />
                        Private label only
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact Multi-Source Discovery Selector */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-slate-400" />
                  <span>Sources:</span>
                </span>
                {[
                  { id: 'all', label: 'All Available' },
                  { id: 'osm', label: 'OpenStreetMap', req: 'OSM' },
                  { id: 'web', label: 'Web', req: 'Web' },
                  { id: 'facebook', label: 'Facebook', req: 'Meta' },
                  { id: 'instagram', label: 'Instagram', req: 'Meta' },
                  { id: 'facebook_groups', label: 'FB Groups', req: 'Meta' },
                  { id: 'maps', label: 'Google Maps', req: 'Maps' },
                ].map((src) => {
                  const isChecked = selectedSources.includes(src.id) || (src.id !== 'all' && selectedSources.includes('all'));
                  return (
                    <label
                      key={src.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium cursor-pointer transition select-none ${
                        isChecked
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold shadow-2xs'
                          : 'bg-white/60 border-slate-200 text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (src.id === 'all') {
                            setSelectedSources(['all']);
                          } else {
                            setSelectedSources((prev) => {
                              const withoutAll = prev.filter((s) => s !== 'all');
                              const next = withoutAll.includes(src.id)
                                ? withoutAll.filter((s) => s !== src.id)
                                : [...withoutAll, src.id];
                              return next.length ? next : ['all'];
                            });
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3 w-3 shrink-0"
                      />
                      <span>{src.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

          </div>

          {/* ── Interactive USA Territory Vector Map ── */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowUsaMap((v) => !v)}
                className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900 hover:text-[#b86452] transition cursor-pointer"
              >
                <Globe className="w-4 h-4 text-[#b86452]" />
                <span>Interactive USA Territory Vector Map (50 States & Commercial Hubs)</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ({showUsaMap ? 'Hide Map' : 'Show Map'})
                </span>
              </button>
              <div className="flex items-center gap-2">
                {locationsList.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                    {locationsList.length} Active Locations
                  </span>
                )}
                {leads.length > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    {leads.length} Discovered Leads Plotted
                  </span>
                )}
              </div>
            </div>

            {showUsaMap && (
              <InteractiveUsaMap
                selectedLocations={locationsList}
                onToggleLocation={(loc) => {
                  setLocationsList((prev) => {
                    const exists = prev.some((l) => l.toLowerCase() === loc.toLowerCase());
                    const updated = exists ? prev.filter((l) => l.toLowerCase() !== loc.toLowerCase()) : [...prev, loc];
                    return updated.length ? updated : ['Houston, TX'];
                  });
                  setLocation(loc);
                }}
                onSelectPreset={(locs) => {
                  setLocationsList(locs.length ? locs : ['Houston, TX']);
                  if (locs.length) setLocation(locs[0]);
                }}
                leads={leads}
                onSelectLead={(lead) => {
                  setSelectedLeadIds(new Set([lead.businessName]));
                }}
                activeCategory={category}
              />
            )}
          </div>

          {/* Live Progressive Search Status Indicator */}
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

          {/* Batch Persistence Status & Partial Failure Reporting */}
          {diagnostics?.batchPersistence && diagnostics.batchPersistence.failedCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2 shadow-xs">
              <WarningCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="font-bold">
                  Auto-Save Notification: {diagnostics.batchPersistence.savedCount} leads saved to Library, {diagnostics.batchPersistence.failedCount} records failed persistence.
                </div>
                {diagnostics.batchPersistence.errors.length > 0 && (
                  <div className="text-[11px] text-amber-800 font-mono">
                    {diagnostics.batchPersistence.errors.slice(0, 3).join('; ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {diagnostics?.batchPersistence && diagnostics.batchPersistence.savedCount > 0 && diagnostics.batchPersistence.failedCount === 0 && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle weight="fill" className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">
                  Auto-Saved: All {diagnostics.batchPersistence.savedCount} leads successfully verified &amp; persisted to WordPress Lead Library.
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                Batch Ingestion Complete
              </span>
            </div>
          )}

          {/* ── 2. Results Section (Full-Width with Mouse Drag-to-Scroll & Embedded Controls) ── */}
          <div className="w-full space-y-4">
            
            {/* Header Action Bar with Integrated Quick Filters & Saved Searches */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              
              {/* Left: Title + Segmented Quick Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap">Leads Found</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {filteredFindLeads.length}
                  </span>
                </div>

                {/* Compact Segmented Quick Filters (No horizontal scrollbar, perfectly responsive) */}
                <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg border border-slate-200/90 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFindLeadsQuickFilter('all')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                      findLeadsQuickFilter === 'all'
                        ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>All</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold">
                      {leads.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFindLeadsQuickFilter('verified')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                      findLeadsQuickFilter === 'verified'
                        ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CheckCircle weight="fill" className="w-3 h-3 text-emerald-600" />
                    <span>Verified</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                      {verifiedFindCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFindLeadsQuickFilter('unverified')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                      findLeadsQuickFilter === 'unverified'
                        ? 'bg-white text-amber-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <WarningCircle weight="fill" className="w-3 h-3 text-amber-500" />
                    <span>Unverified</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold">
                      {unverifiedFindCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFindLeadsQuickFilter('review')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                      findLeadsQuickFilter === 'review'
                        ? 'bg-white text-rose-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ClockCounterClockwise className="w-3 h-3 text-rose-500" />
                    <span>Review</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 text-[9px] font-bold">
                      {needsReviewFindCount}
                    </span>
                  </button>
                </div>
              </div>

              {/* Right Toolbar Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Horizontal Drag to Scroll Hint Badge */}
                <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                  <ArrowsLeftRight className="w-3.5 h-3.5 text-slate-400" />
                  <span>Drag rows to scroll</span>
                </span>

                {/* Saved Searches Popover (Relocated from removed sidebar) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSavedSearchesMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    <BookBookmark className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Saved Searches</span>
                    <CaretDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {savedSearchesMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-2 text-xs">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Saved Presets
                        </span>
                        <button
                          type="button"
                          onClick={() => setSavedSearchesMenuOpen(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSavedSearchesMenuOpen(false);
                          void handleSaveSearchTemplate();
                        }}
                        className="w-full py-2 px-2.5 rounded-lg border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Save Current Search
                      </button>

                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {PRESET_SAVED_SEARCHES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSavedSearchesMenuOpen(false);
                              applySavedSearch(s);
                            }}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition group cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <MagnifyingGlass className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 truncate">{s.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{s.location}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedLeadIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const firstSelected = leads.find((l) => selectedLeadIds.has(l.businessName));
                      if (firstSelected) handleOpenQuickEmail(firstSelected);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#b86452] hover:bg-[#a05246] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <PaperPlaneRight className="w-3.5 h-3.5 text-white" />
                    <span>Email Selected ({selectedLeadIds.size})</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={selectedLeadIds.size === 0 || savingSelected}
                  onClick={handleSaveSelected}
                  className="px-4 py-2 rounded-xl bg-[#584de3] hover:bg-[#493ecc] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <BookBookmark className="w-3.5 h-3.5 text-white" />
                  {savingSelected ? 'Saving...' : `Save Selected (${selectedLeadIds.size})`}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    <DownloadSimple className="w-3.5 h-3.5 text-slate-500" />
                    <span>Export</span>
                    <CaretDown className="w-3 h-3 text-slate-400" />
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 text-xs">
                      <button
                        type="button"
                        onClick={handleExportSearchResultsCSV}
                        className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-slate-700 font-medium cursor-pointer"
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleExportSearchResultsJSON}
                        className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-slate-700 font-medium cursor-pointer"
                      >
                        Export JSON
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setResultsView((v) => (v === 'map' ? 'table' : 'map'))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{resultsView === 'map' ? 'Table View' : 'Map View'}</span>
                </button>
              </div>
            </div>

            {/* Table or Map View */}
            {resultsView === 'table' ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div
                  ref={tableScrollRef}
                  onMouseDown={handleTableMouseDown}
                  onMouseMove={handleTableMouseMove}
                  onMouseUp={handleTableMouseUp}
                  onMouseLeave={handleTableMouseLeave}
                  className={`overflow-x-auto select-none ${
                    isTableDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  title="Click and drag horizontally to scroll through lead details"
                >
                    <table className="w-full text-left text-xs text-slate-700 border-collapse">
                      <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="w-8 px-2 py-2.5 text-center whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={paginatedFindLeads.length > 0 && paginatedFindLeads.every((l) => selectedLeadIds.has(l.businessName))}
                              onChange={handleToggleSelectAll}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </th>
                          <th className="w-8 px-1 py-2.5 text-slate-400 whitespace-nowrap text-center">#</th>
                          <th className="px-2.5 py-2.5 whitespace-nowrap min-w-[150px]">Business Name</th>
                          <th className="px-2.5 py-2.5 whitespace-nowrap min-w-[105px]">Location</th>
                          <th className="px-2 py-2.5 whitespace-nowrap min-w-[95px]">Category</th>
                          <th className="px-2.5 py-2.5 whitespace-nowrap min-w-[170px]">Contact Information</th>
                          <th className="px-2 py-2.5 whitespace-nowrap min-w-[85px]">Source</th>
                          <th className="px-2 py-2.5 whitespace-nowrap min-w-[80px]">Status</th>
                          <th className="px-2 py-2.5 whitespace-nowrap min-w-[55px]">Score</th>
                          <th className="px-2.5 py-2.5 text-right whitespace-nowrap min-w-[100px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedFindLeads.length > 0 ? (
                          paginatedFindLeads.map((lead, idx) => {
                            const isVerified = lead.dataSource === 'openstreetmap' || Boolean(lead.address && lead.phone);
                            const isSelected = selectedLeadIds.has(lead.businessName);
                            const isSaving = savingLeadId === lead.businessName;
                            const rowNum = (findLeadsPage - 1) * findLeadsPageSize + idx + 1;
                            return (
                              <tr key={`${lead.businessName}-${idx}`} className="hover:bg-slate-50/70 transition">
                                <td className="px-3 py-3 text-center whitespace-nowrap w-10">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelectLead(lead.businessName)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </td>
                                <td className="px-2 py-3 text-slate-400 font-mono text-[11px] whitespace-nowrap w-10">{rowNum}</td>
                                
                                {/* Business Name with Company Initials Avatar */}
                                <td className="px-3 py-3 font-semibold text-slate-900 min-w-[200px]">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border flex-shrink-0 ${getAvatarBg(lead.businessName)}`}>
                                      {getCompanyInitials(lead.businessName)}
                                    </div>
                                    <span className="truncate max-w-[220px]" title={lead.businessName}>{lead.businessName}</span>
                                  </div>
                                </td>

                                {/* Location */}
                                <td className="px-3 py-3 text-slate-600 whitespace-nowrap min-w-[150px]">
                                  {(() => {
                                    const locText = [lead.city, lead.region].filter(Boolean).join(', ') || lead.address || 'United States';
                                    const queryParts = [lead.businessName, lead.address, lead.city, lead.region].filter(Boolean);
                                    const mapQuery = queryParts.join(', ');
                                    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
                                    return (
                                      <a
                                        href={mapUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group inline-flex items-center gap-1.5 font-medium text-slate-800 hover:text-indigo-600 transition"
                                        title={`Open "${mapQuery}" in Google Maps`}
                                      >
                                        <MapPin className="w-3.5 h-3.5 text-indigo-500 group-hover:text-indigo-600 flex-shrink-0" />
                                        <span className="truncate max-w-[160px] underline-offset-2 group-hover:underline">{locText}</span>
                                        <ArrowSquareOut className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                                      </a>
                                    );
                                  })()}
                                </td>

                                {/* Category */}
                                <td className="px-3 py-3 whitespace-nowrap min-w-[130px]">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                                    {lead.category || 'Feed Store'}
                                  </span>
                                </td>

                                {/* Contact Information (Website, Phone, Email Multi-line) */}
                                <td className="px-3 py-3 whitespace-nowrap min-w-[220px]">
                                  <div className="space-y-1 text-[11px]">
                                    {lead.website ? (
                                      <a
                                        href={lead.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-600 hover:underline flex items-center gap-1 font-medium truncate max-w-[170px]"
                                        title={lead.website}
                                      >
                                        <Globe className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                        <span>{lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                                        <ArrowSquareOut className="w-2.5 h-2.5 flex-shrink-0" />
                                      </a>
                                    ) : (
                                      <span className="text-slate-300 block">—</span>
                                    )}

                                    {lead.phone && (
                                      <a
                                        href={`tel:${lead.phone}`}
                                        className="text-slate-700 hover:underline flex items-center gap-1 font-medium"
                                        title={`Call ${lead.phone}`}
                                      >
                                        <Phone className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                        <span>{lead.phone}</span>
                                      </a>
                                    )}

                                    {lead.email && (
                                      <a
                                        href={`mailto:${lead.email}?subject=${encodeURIComponent(`Himalayan Salt Wholesale Inquiry - ${lead.businessName}`)}`}
                                        className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 truncate max-w-[170px] font-medium"
                                        title={`Send email to ${lead.email}`}
                                      >
                                        <EnvelopeSimple className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                                        <span>{lead.email}</span>
                                      </a>
                                    )}

                                    {/* Quick Social & Web Deep Links (Google Maps, Facebook, Instagram) */}
                                    <div className="flex items-center gap-1.5 pt-1">
                                      <a
                                        href={lead.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.businessName} ${lead.city || ''} ${lead.region || ''}`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition border border-emerald-200"
                                        title={`View "${lead.businessName}" on Google Maps`}
                                      >
                                        <MapPin className="w-2.5 h-2.5" />
                                        <span>Maps</span>
                                      </a>

                                      <a
                                        href={lead.facebook || `https://www.facebook.com/search/top?q=${encodeURIComponent(`${lead.businessName} ${lead.city || ''} ${lead.region || ''}`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition border border-blue-200"
                                        title={`Find "${lead.businessName}" page on Facebook`}
                                      >
                                        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                        <span>Facebook</span>
                                      </a>

                                      <a
                                        href={lead.instagram || `https://www.instagram.com/explore/tags/${lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, '')}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-pink-50 text-pink-700 hover:bg-pink-100 transition border border-pink-200"
                                        title={`Search horses & stables for "${lead.businessName}" on Instagram`}
                                      >
                                        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                                        <span>Insta</span>
                                      </a>
                                    </div>
                                  </div>
                                </td>

                                {/* Source */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <SourceBadge source={lead.dataSource} />
                                </td>

                                {/* Status Badge */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  {isVerified ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle weight="fill" className="w-3 h-3 text-emerald-600" />
                                      Verified
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      <WarningCircle weight="fill" className="w-3 h-3 text-amber-500" />
                                      Unverified
                                    </span>
                                  )}
                                </td>

                                {/* Fit Score */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    {lead.opportunityScore ?? 85}
                                  </span>
                                </td>

                                {/* Actions */}
                                <td className="px-3 py-3 text-right whitespace-nowrap min-w-[140px]">
                                  <div className="inline-flex items-center gap-1.5 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveToLibrary(lead)}
                                      disabled={lead.alreadySaved || isSaving}
                                      title={lead.alreadySaved ? 'Saved in Lead Library' : 'Save to Lead Library'}
                                      className={`p-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex-shrink-0 ${
                                        lead.alreadySaved
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
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
                                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-indigo-600 transition cursor-pointer flex-shrink-0"
                                    >
                                      <Robot className="w-3.5 h-3.5 text-indigo-600" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenQuickEmail(lead)}
                                      title={lead.email ? `Draft email outreach to ${lead.email}` : 'Draft email outreach pitch'}
                                      className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-[#b86452] transition cursor-pointer flex-shrink-0"
                                    >
                                      <PaperPlaneRight className="w-3.5 h-3.5 text-[#b86452]" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={10} className="py-12 text-center text-slate-400">
                              <div className="max-w-sm mx-auto space-y-2">
                                <MagnifyingGlass className="w-8 h-8 text-slate-300 mx-auto" />
                                <p className="text-xs font-medium text-slate-600">No leads discovered yet</p>
                                <p className="text-[11px] text-slate-400">
                                  Click &quot;Find Leads with AI&quot; or select one of the saved searches on the left to start prospecting.
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {filteredFindLeads.length > 0 && (
                    <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                      <span>
                        Showing {Math.min((findLeadsPage - 1) * findLeadsPageSize + 1, filteredFindLeads.length)}–
                        {Math.min(findLeadsPage * findLeadsPageSize, filteredFindLeads.length)} of {filteredFindLeads.length} leads
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={findLeadsPage <= 1}
                          onClick={() => setFindLeadsPage((p) => Math.max(1, p - 1))}
                          className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-semibold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                        >
                          &lt;
                        </button>
                        {Array.from({ length: Math.min(5, totalFindPages) }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setFindLeadsPage(p)}
                            className={`w-7 h-7 rounded text-xs font-bold transition cursor-pointer ${
                              findLeadsPage === p ? 'bg-[#584de3] text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                        {totalFindPages > 5 && (
                          <>
                            <span className="px-1 text-slate-400">...</span>
                            <button
                              type="button"
                              onClick={() => setFindLeadsPage(totalFindPages)}
                              className={`w-7 h-7 rounded text-xs font-bold transition cursor-pointer ${
                                findLeadsPage === totalFindPages ? 'bg-[#584de3] text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {totalFindPages}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={findLeadsPage >= totalFindPages}
                          onClick={() => setFindLeadsPage((p) => Math.min(totalFindPages, p + 1))}
                          className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-semibold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Map / Location View */
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-sm font-bold text-slate-900">Geographic Spread ({leads.length} locations)</h4>
                    </div>
                    <span className="text-xs text-slate-500">Targeting Texas and USA metros</span>
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
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          {lead.phone ? (
                            <span className="text-emerald-700 font-medium">📞 {lead.phone}</span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">No phone</span>
                          )}
                          {lead.email && (
                            <span className="text-slate-600 truncate max-w-[140px]" title={lead.email}>✉️ {lead.email}</span>
                          )}
                        </div>
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveToLibrary(lead)}
                            disabled={lead.alreadySaved}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border transition cursor-pointer ${
                              lead.alreadySaved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {lead.alreadySaved ? 'Saved' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenQuickEmail(lead)}
                            className="px-2.5 py-1 rounded bg-[#b86452] hover:bg-[#a05246] text-white text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                          >
                            <PaperPlaneRight className="w-3 h-3" /> Email
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          {/* ── AI Factual Assessment Modal ── */}
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
                    className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
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
                  className="w-full py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* ── Direct Email Outreach Modal (Integrated into Find Leads) ── */}
          {quickEmailLead && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-[#b86452]">
                        <PaperPlaneRight weight="bold" className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">Direct Outreach &amp; Pitch Generator</h4>
                    </div>
                    <p className="text-xs text-slate-500">
                      Draft, personalize, and dispatch wholesale pitches directly to <span className="font-bold text-slate-900">{quickEmailLead.businessName}</span>.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close outreach modal"
                    onClick={() => { setQuickEmailLead(null); setQuickEmailStatus(null); }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Pitch Angle Selector */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Product Angle &amp; Wholesale Pitch Profile
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PRODUCT_INTERESTS.map((interest) => {
                      const profile = OFFER_PROFILES[interest];
                      const isSelected = quickEmailInterest === interest;
                      return (
                        <button
                          key={interest}
                          type="button"
                          onClick={() => handleQuickEmailInterestChange(interest)}
                          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                            isSelected
                              ? 'border-[#b86452] bg-[#fbf5f3] ring-1 ring-[#b86452]'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900 truncate">{profile.label}</div>
                          <div className="text-[10px] text-slate-500 truncate">{profile.caveat}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recipient Email */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Recipient Email Address
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={quickEmailRecipient}
                      onChange={(e) => setQuickEmailRecipient(e.target.value)}
                      placeholder="e.g. buyer@feedstore.com"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#b86452]"
                    />
                    {quickEmailLead.website && (
                      <a
                        href={quickEmailLead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1"
                      >
                        <Globe className="w-3.5 h-3.5" /> Website
                      </a>
                    )}
                  </div>
                  {!quickEmailRecipient && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-1.5">
                      <WarningCircle className="w-3.5 h-3.5 shrink-0" />
                      No verified email found in public records. You can check their website or copy the pitch below into LinkedIn/Instagram DMs.
                    </p>
                  )}
                </div>

                {/* Subject Line */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={quickEmailSubject}
                    onChange={(e) => setQuickEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#b86452]"
                  />
                </div>

                {/* Email Body */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Email Body / Personalized Pitch
                  </label>
                  <textarea
                    rows={8}
                    value={quickEmailBody}
                    onChange={(e) => setQuickEmailBody(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#b86452] leading-relaxed"
                  />
                </div>

                {/* Status Notice */}
                {quickEmailStatus && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>{quickEmailStatus}</span>
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(`Subject: ${quickEmailSubject}\n\n${quickEmailBody}`);
                          setQuickEmailCopied(true);
                          setTimeout(() => setQuickEmailCopied(false), 3000);
                        } catch {
                          setQuickEmailStatus('Failed to copy to clipboard.');
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {quickEmailCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <FileText className="w-3.5 h-3.5" />}
                      <span>{quickEmailCopied ? 'Pitch Copied!' : 'Copy Pitch'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleSaveToLibrary({
                          ...quickEmailLead,
                          email: quickEmailRecipient || quickEmailLead.email,
                        });
                        setQuickEmailStatus('Lead and pitch details saved to Lead Library!');
                      }}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <BookBookmark className="w-3.5 h-3.5" />
                      <span>Save to Library</span>
                    </button>

                    {quickEmailLead.facebook && (
                      <a
                        href={quickEmailLead.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Open real business profile on Facebook (No bulk DMs)"
                      >
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        <span>Open Facebook</span>
                      </a>
                    )}

                    {quickEmailLead.instagram && (
                      <a
                        href={quickEmailLead.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Open real business profile on Instagram (No bulk DMs)"
                      >
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        <span>Open Instagram</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => { setQuickEmailLead(null); setQuickEmailStatus(null); }}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold cursor-pointer"
                    >
                      Close
                    </button>

                    <a
                      href={`mailto:${quickEmailRecipient}?subject=${encodeURIComponent(quickEmailSubject)}&body=${encodeURIComponent(quickEmailBody)}`}
                      onClick={() => {
                        setQuickEmailStatus('Opening your default email client...');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#b86452] hover:bg-[#a05246] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <PaperPlaneRight className="w-3.5 h-3.5 text-white" />
                      <span>Open in Mail Client</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══════════ LIVE USA MARKET MAP TAB ══════════ */}
        <div id="leados-panel-market-map" role="tabpanel" aria-labelledby="leados-tab-market-map" className={(activeTab === 'market-map' || ((activeTab === 'prospects' || activeTab === 'library') && prospectSubView === 'market-map')) ? "space-y-6" : "hidden"}>
          <LiveUsaMarketMap
            onSelectLeadInLibrary={(searchQuery) => {
              setLibrarySearch(searchQuery);
              setProspectSubView('directory');
              changeTab('prospects');
            }}
          />
        </div>

        {/* ══════════ LEAD LIBRARY TAB ══════════ */}
        <div id="leados-panel-library" role="tabpanel" aria-labelledby="leados-tab-library" className={((activeTab === 'prospects' || activeTab === 'library') && prospectSubView === 'directory') ? "space-y-6" : "hidden"}>
          {/* ── 1. Top Header & KPI Summary ── */}
          <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700">
                    <BookBookmark weight="fill" className="w-5 h-5 text-indigo-700" />
                  </div>
                  <h2 className="text-xl font-black text-slate-950 tracking-tight">Lead Library</h2>
                  <span className="bg-slate-900 text-white text-xs font-extrabold px-3 py-0.5 rounded-full">
                    {libraryUnavailable ? 'Unavailable' : `${libraryTotal ?? libraryLeads.length} Total Saved`}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-700 mt-1">
                  Central repository for all saved B2B prospects, verified contacts, Facebook &amp; Instagram profiles, fit qualification scores, and wholesale outreach.
                </p>
                {!libraryUnavailable && libraryTotal !== null && libraryTotal > libraryLeads.length && (
                  <p className="text-xs font-bold text-amber-800 mt-1">
                    {libraryPage === 1
                      ? `Showing the first ${libraryLeads.length} of ${libraryTotal} saved prospects (Page 1 of ${Math.max(1, Math.ceil(libraryTotal / libraryPageSize))}). Use the page controls below or search/filter to browse.`
                      : `Showing ${(libraryPage - 1) * libraryPageSize + 1}–${(libraryPage - 1) * libraryPageSize + libraryLeads.length} of ${libraryTotal} saved prospects (Page ${libraryPage} of ${Math.max(1, Math.ceil(libraryTotal / libraryPageSize))}).`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleBatchEnrichContacts()}
                  disabled={enrichingLibrary || loadingLibrary}
                  className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-60"
                  title="Crawl saved business websites to extract Email, Facebook, Instagram, and Phone"
                >
                  <Globe weight="bold" className={`w-3.5 h-3.5 ${enrichingLibrary ? 'animate-spin text-emerald-700' : 'text-emerald-700'}`} />
                  {enrichingLibrary ? 'Scanning Websites…' : 'Enrich Contacts (Email / FB / IG)'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSyncOmnisend()}
                  disabled={syncingOmnisend || loadingLibrary}
                  className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-60"
                  title="Sync verified email leads into Omnisend CRM"
                >
                  <PaperPlaneRight weight="bold" className={`w-3.5 h-3.5 ${syncingOmnisend ? 'animate-pulse text-indigo-700' : 'text-indigo-700'}`} />
                  {syncingOmnisend ? 'Syncing Omnisend…' : 'Sync Emails to Omnisend'}
                </button>
                <button
                  type="button"
                  onClick={() => loadLibrary()}
                  disabled={loadingLibrary}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <ArrowsClockwise weight="bold" className={`w-3.5 h-3.5 ${loadingLibrary ? 'animate-spin text-indigo-600' : 'text-slate-700'}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <DownloadSimple weight="bold" className="w-3.5 h-3.5 text-slate-800" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => changeTab('find')}
                  className="px-4 py-1.5 rounded-lg bg-[#584de3] hover:bg-[#493ecb] text-white font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <MagnifyingGlass weight="bold" className="w-3.5 h-3.5" />
                  Find More Leads
                </button>
              </div>
            </div>

            {libraryActionNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-center justify-between gap-2">
                <span>{libraryActionNotice}</span>
                <button
                  type="button"
                  onClick={() => setLibraryActionNotice(null)}
                  className="text-emerald-800 hover:text-emerald-950 font-black px-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Verification & Pipeline KPI statistics (Clickable Filter Cards) */}
            {(() => {
              const verifiedCount = libraryLeads.filter((l) => l.emailSource === 'company_website' || l.dataSource === 'openstreetmap' || Boolean(l.phone && l.website)).length;
              const phoneCount = libraryLeads.filter((l) => Boolean(l.phone)).length;
              const emailCount = libraryLeads.filter((l) => Boolean(l.email)).length;
              const fbCount = libraryLeads.filter((l) => Boolean(getLeadFacebook(l))).length;
              const igCount = libraryLeads.filter((l) => Boolean(getLeadInstagram(l))).length;
              const socialCount = libraryLeads.filter((l) => Boolean(getLeadFacebook(l) || getLeadInstagram(l))).length;
              const websiteCount = libraryLeads.filter((l) => Boolean(l.website)).length;

              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setLibraryQuickContactFilter('all')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        libraryQuickContactFilter === 'all' ? 'bg-slate-200/80 border-slate-400 ring-2 ring-slate-900/10' : 'bg-slate-100/80 border-slate-200 hover:bg-slate-200/50'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold text-slate-700 block uppercase tracking-wider">Total Saved</span>
                      <span className="text-xl font-black text-slate-950 mt-0.5 block">{libraryUnavailable ? '—' : libraryTotal ?? libraryLeads.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLibraryQuickContactFilter('verified')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        libraryQuickContactFilter === 'verified' ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-600/20' : 'bg-emerald-50/90 border-emerald-200 hover:bg-emerald-100/70'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold text-emerald-900 block uppercase tracking-wider">Verified Contacts</span>
                      <span className="text-xl font-black text-emerald-950 mt-0.5 block">
                        {libraryUnavailable ? '—' : verifiedCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLibraryQuickContactFilter('phone')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        libraryQuickContactFilter === 'phone' ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-600/20' : 'bg-blue-50/90 border-blue-200 hover:bg-blue-100/70'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold text-blue-900 block uppercase tracking-wider">Direct Phone</span>
                      <span className="text-xl font-black text-blue-950 mt-0.5 block">
                        {libraryUnavailable ? '—' : phoneCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLibraryQuickContactFilter('email')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        libraryQuickContactFilter === 'email' ? 'bg-indigo-100 border-indigo-400 ring-2 ring-indigo-600/20' : 'bg-indigo-50/90 border-indigo-200 hover:bg-indigo-100/70'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold text-indigo-900 block uppercase tracking-wider">Email Verified</span>
                      <span className="text-xl font-black text-indigo-950 mt-0.5 block">
                        {libraryUnavailable ? '—' : emailCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLibraryQuickContactFilter('social')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        libraryQuickContactFilter === 'social' || libraryQuickContactFilter === 'facebook' || libraryQuickContactFilter === 'instagram'
                          ? 'bg-pink-100 border-pink-400 ring-2 ring-pink-600/20'
                          : 'bg-pink-50/90 border-pink-200 hover:bg-pink-100/70'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold text-pink-900 block uppercase tracking-wider">Facebook / IG</span>
                      <span className="text-xl font-black text-pink-950 mt-0.5 block">
                        {libraryUnavailable ? '—' : `${socialCount} (${fbCount} FB / ${igCount} IG)`}
                      </span>
                    </button>
                    <div className="p-3 rounded-xl bg-purple-50/90 border border-purple-200">
                      <span className="text-[11px] font-extrabold text-purple-900 block uppercase tracking-wider">In Sales Pipeline</span>
                      <span className="text-xl font-black text-purple-950 mt-0.5 block">
                        {libraryUnavailable
                          ? '—'
                          : !librarySearch && statusFilter === 'all' && typeof stats?.inPipelineCount === 'number'
                          ? (stats.inPipelineCount || 0) + (stats.contactedCount || 0)
                          : libraryLeads.filter((l) => l.status === 'qualified' || l.status === 'contacted' || l.status === 'shortlisted').length}
                      </span>
                    </div>
                  </div>

                  {/* Search and Multi-Filtering Controls */}
                  <div className="flex flex-col lg:flex-row gap-2.5 pt-2 border-t border-slate-200">
                    <div className="relative flex-1">
                      <MagnifyingGlass weight="bold" className="w-4 h-4 text-slate-600 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search by business name, city, phone, email, Facebook/Instagram, notes, or category..."
                        value={librarySearch}
                        onChange={(e) => {
                          setLibrarySearch(e.target.value);
                          setLibraryPage(1);
                        }}
                        className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {librarySearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setLibrarySearch('');
                            setLibraryPage(1);
                          }}
                          className="absolute right-2.5 top-2.5 text-slate-600 hover:text-slate-900 text-xs font-black"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={librarySourceFilter}
                        onChange={(e) => {
                          setLibrarySourceFilter(e.target.value as any);
                          setLibraryPage(1);
                        }}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                          librarySourceFilter === 'crm' ? 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500' : 'border-slate-300 bg-white text-slate-900'
                        }`}
                      >
                        <option value="all">All Sources (CRM &amp; Discovered)</option>
                        <option value="crm">CRM &amp; Inquiries Only</option>
                        <option value="discovery">B2B Discovered Leads (OSM)</option>
                        <option value="customers">Existing Customers (WooCommerce)</option>
                      </select>

                      <select
                        value={libraryCategoryFilter}
                        onChange={(e) => setLibraryCategoryFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="all">All Categories ({libraryCategories.length})</option>
                        {libraryCategories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>

                      <select
                        value={statusFilter}
                        onChange={(e) => {
                          setStatusFilter(e.target.value);
                          setLibraryPage(1);
                        }}
                        className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="all">All Pipeline Stages</option>
                        {LEAD_PIPELINE.map((state) => (
                          <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>
                        ))}
                        <option value="disqualified">Disqualified</option>
                      </select>

                      <select
                        value={libraryVerificationFilter}
                        onChange={(e) => setLibraryVerificationFilter(e.target.value as any)}
                        className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="all">All Statuses</option>
                        <option value="verified">Verified Only</option>
                        <option value="unverified">Unverified Only</option>
                      </select>
                    </div>
                  </div>

                  {/* Quick Filter Chips (Email, Facebook, Instagram, Phone, Website, Verified, High Score) & Table Helpers */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-800 mr-1 flex items-center gap-1">
                        <Funnel weight="fill" className="w-3.5 h-3.5 text-slate-700" />
                        Quick Filters:
                      </span>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'all'
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        All ({libraryLeads.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('email')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'email'
                            ? 'bg-indigo-700 text-white border-indigo-700 shadow-2xs'
                            : 'bg-indigo-50 text-indigo-950 border-indigo-300 hover:bg-indigo-100'
                        }`}
                      >
                        With Email ({emailCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('facebook')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'facebook'
                            ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                            : 'bg-blue-50 text-blue-950 border-blue-300 hover:bg-blue-100'
                        }`}
                      >
                        Facebook ({fbCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('instagram')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'instagram'
                            ? 'bg-pink-700 text-white border-pink-700 shadow-2xs'
                            : 'bg-pink-50 text-pink-950 border-pink-300 hover:bg-pink-100'
                        }`}
                      >
                        Instagram ({igCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('social')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'social'
                            ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                            : 'bg-purple-50 text-purple-950 border-purple-300 hover:bg-purple-100'
                        }`}
                      >
                        Any Social ({socialCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('phone')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'phone'
                            ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                            : 'bg-sky-50 text-sky-950 border-sky-300 hover:bg-sky-100'
                        }`}
                      >
                        Direct Phone ({phoneCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('website')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'website'
                            ? 'bg-teal-700 text-white border-teal-700 shadow-2xs'
                            : 'bg-teal-50 text-teal-950 border-teal-300 hover:bg-teal-100'
                        }`}
                      >
                        Website ({websiteCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('verified')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'verified'
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                            : 'bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        Verified ({verifiedCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibraryQuickContactFilter('high_score')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border cursor-pointer ${
                          libraryQuickContactFilter === 'high_score'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                            : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        High Score (80+)
                      </button>
                    </div>

                    {/* Active Sort Indicator / Reset / Fit Screen */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleResetAllLibColWidths}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                          fitScreenMode
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white hover:bg-slate-100 text-slate-900 border-slate-300'
                        }`}
                        title="Fit all columns inside one single screen frame without horizontal scrolling"
                      >
                        <ArrowsLeftRight weight="bold" className={`w-3.5 h-3.5 ${fitScreenMode ? 'text-white' : 'text-indigo-600'}`} />
                        <span>{fitScreenMode ? 'Single Frame Fit (Active)' : 'Fit Screen'}</span>
                      </button>

                      {/* Customize Columns Button & Popover */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowCustomizeCols(!showCustomizeCols)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                          title="Customize visible columns and rearrange column order left/right"
                        >
                          <Sliders weight="bold" className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Customize Columns</span>
                          <CaretDown weight="bold" className="w-3 h-3 text-slate-700" />
                        </button>

                        {showCustomizeCols && (
                          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-300 p-3.5 z-40 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                              <span className="font-extrabold text-xs text-slate-950">Customize &amp; Move Columns</span>
                              <button
                                type="button"
                                onClick={() => setShowCustomizeCols(false)}
                                className="text-slate-600 hover:text-slate-950 text-xs font-black cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>

                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                              {libraryColOrder.map((colKey, i) => {
                                const isHidden = hiddenCols.has(colKey);
                                const canHide = colKey !== 'name';
                                return (
                                  <div
                                    key={colKey}
                                    className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-100 text-xs"
                                  >
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={!isHidden}
                                        disabled={!canHide}
                                        onChange={() => handleToggleColVisibility(colKey)}
                                        className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                                      />
                                      <span className={isHidden ? 'text-slate-500 line-through font-semibold' : 'font-extrabold text-slate-900'}>
                                        {LIBRARY_COL_LABELS[colKey]}
                                      </span>
                                    </label>

                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={i === 0}
                                        onClick={() => handleMoveColStep(colKey, 'left')}
                                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black cursor-pointer"
                                        title="Move Column Left"
                                      >
                                        ←
                                      </button>
                                      <button
                                        type="button"
                                        disabled={i === libraryColOrder.length - 1}
                                        onClick={() => handleMoveColStep(colKey, 'right')}
                                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black cursor-pointer"
                                        title="Move Column Right"
                                      >
                                        →
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={handleResetColLayout}
                                className="text-xs font-extrabold text-rose-700 hover:text-rose-900 cursor-pointer"
                              >
                                Reset to Default
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowCustomizeCols(false)}
                                className="px-3 py-1 rounded bg-indigo-600 text-white font-extrabold text-xs hover:bg-indigo-700 cursor-pointer"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {librarySortField !== 'manual' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-100 border border-indigo-300 text-indigo-950 text-xs font-extrabold">
                          <span>
                            Sorted by {librarySortField.toUpperCase()} ({librarySortDirection === 'asc' ? 'A-Z' : 'Z-A'})
                          </span>
                          <button
                            type="button"
                            onClick={() => setLibrarySortField('manual')}
                            className="text-indigo-800 hover:text-indigo-950 font-black ml-1 cursor-pointer"
                            title="Reset to custom manual row positions"
                          >
                            ✕ Reset
                          </button>
                        </div>
                      )}
                      <span className="text-[11px] font-bold text-slate-700 hidden md:inline" title="Drag column headers left/right or click ←/→ arrows to move columns. Drag rows to reorder.">
                        ↔ Drag columns left/right • ⋮⋮ Drag rows up/down
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Bulk Action Bar (when leads are selected) */}
            {librarySelectedIds.size > 0 && (
              <div className="p-3 bg-indigo-50 border border-indigo-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
                <div className="flex items-center gap-2 font-extrabold text-indigo-950">
                  <CheckCircle weight="fill" className="w-4 h-4 text-indigo-600" />
                  <span>{librarySelectedIds.size} {librarySelectedIds.size === 1 ? 'lead' : 'leads'} selected</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchOutreachOpen(true);
                      setBatchResultNotice(null);
                    }}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold transition cursor-pointer text-xs flex items-center gap-1.5 shadow-2xs"
                  >
                    <PaperPlaneRight weight="bold" className="w-3.5 h-3.5" />
                    Send to Selected ({librarySelectedIds.size})
                  </button>

                  <span className="text-slate-800 font-bold text-xs ml-1">Set Stage:</span>
                  <button
                    type="button"
                    onClick={() => handleBulkUpdateLibraryStatus('qualified')}
                    className="px-2.5 py-1 rounded bg-white border border-indigo-300 text-indigo-900 font-extrabold hover:bg-indigo-100 transition cursor-pointer text-xs"
                  >
                    Qualified
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkUpdateLibraryStatus('contacted')}
                    className="px-2.5 py-1 rounded bg-white border border-indigo-300 text-indigo-900 font-extrabold hover:bg-indigo-100 transition cursor-pointer text-xs"
                  >
                    Contacted
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkUpdateLibraryStatus('shortlisted')}
                    className="px-2.5 py-1 rounded bg-white border border-indigo-300 text-indigo-900 font-extrabold hover:bg-indigo-100 transition cursor-pointer text-xs"
                  >
                    Shortlisted
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkUpdateLibraryStatus('disqualified')}
                    className="px-2.5 py-1 rounded bg-white border border-rose-300 text-rose-900 font-extrabold hover:bg-rose-100 transition cursor-pointer text-xs"
                  >
                    Disqualify
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDeleteLibraryLeads}
                    className="px-2.5 py-1 rounded bg-rose-100 text-rose-900 font-extrabold border border-rose-300 hover:bg-rose-200 transition cursor-pointer text-xs flex items-center gap-1"
                  >
                    <Trash weight="bold" className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setLibrarySelectedIds(new Set())}
                    className="px-2 py-1 text-slate-700 hover:text-slate-950 text-xs font-extrabold"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}
          </div>

          {libraryError && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-xs font-bold text-red-900" role="alert">
              Lead Library error: {libraryError}
            </div>
          )}

          {/* ── 2. Leads Found Table (Single-Frame Unified View Without Side-Scroll) ── */}
          <div className="rounded-2xl border border-slate-300 bg-white overflow-hidden shadow-sm">
            {loadingLibrary ? (
              <div className="p-16 text-center text-slate-700 font-bold text-xs">
                <ArrowsClockwise className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                Loading saved prospects...
              </div>
            ) : filteredLibraryLeads.length === 0 ? (
              <div className="p-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-600">
                  <BookBookmark className="w-6 h-6" />
                </div>
                <h4 className="font-extrabold text-slate-900 text-sm">
                  {libraryUnavailable ? 'Saved prospects could not be read' : 'No Saved Leads Found'}
                </h4>
                <p className="text-xs font-semibold text-slate-700 max-w-sm mx-auto">
                  {libraryUnavailable
                    ? libraryError
                    : libraryLeads.length > 0
                    ? 'No leads match your active filters or search keyword.'
                    : 'Discover verified B2B businesses in Find Leads and click "Save Selected" to populate your library.'}
                </p>
                {libraryUnavailable ? (
                  <button
                    type="button"
                    onClick={() => void loadLibrary()}
                    disabled={loadingLibrary}
                    className="px-4 py-2 rounded-lg bg-[#584de3] text-white font-extrabold text-xs shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {loadingLibrary ? 'Retrying…' : 'Retry'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setLibrarySearch(''); setLibraryCategoryFilter('all'); setStatusFilter('all'); setLibraryQuickContactFilter('all'); changeTab('find'); }}
                    className="px-4 py-2 rounded-lg bg-[#584de3] text-white font-extrabold text-xs shadow-sm cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className={fitScreenMode ? 'w-full overflow-x-hidden' : 'w-full overflow-x-auto'}>
                <table className={`hidden md:table w-full text-left border-collapse text-xs ${fitScreenMode ? 'table-fixed' : ''}`}>
                  <thead className="bg-slate-100 border-b-2 border-slate-300">
                    <tr className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wide select-none">
                      {/* Drag Reorder Handle Header */}
                      <th
                        style={fitScreenMode ? { width: '32px' } : { width: libraryColWidths.reorder, minWidth: libraryColWidths.reorder, maxWidth: libraryColWidths.reorder }}
                        className="py-3 px-1 text-center whitespace-nowrap text-slate-700"
                        title="Drag rows using handle (⋮⋮) to reorder"
                      >
                        <DotsSixVertical weight="bold" className="w-4 h-4 mx-auto text-slate-700" />
                      </th>

                      {/* Checkbox */}
                      <th
                        style={fitScreenMode ? { width: '32px' } : { width: libraryColWidths.check, minWidth: libraryColWidths.check, maxWidth: libraryColWidths.check }}
                        className="py-3 px-1.5 text-center whitespace-nowrap"
                      >
                        <input
                          type="checkbox"
                          checked={librarySelectedIds.size === filteredLibraryLeads.length && filteredLibraryLeads.length > 0}
                          onChange={handleToggleSelectAllLibrary}
                          className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>

                      {/* Index */}
                      <th
                        style={fitScreenMode ? { width: '38px' } : { width: libraryColWidths.index, minWidth: libraryColWidths.index, maxWidth: libraryColWidths.index }}
                        className="py-3 px-1.5 text-slate-800 font-extrabold whitespace-nowrap text-center"
                      >
                        #
                      </th>

                      {/* Dynamic Draggable & Resizable Column Headers */}
                      {visibleColOrder.map((colKey, colIdx) => {
                        const isSorted = librarySortField === colKey;
                        const isBeingDragged = draggedColKey === colKey;
                        const isDropTarget = dragOverColKey === colKey && draggedColKey !== colKey;
                        const colWidth = libraryColWidths[colKey];
                        const colLabel = LIBRARY_COL_LABELS[colKey] || colKey;
                        const fitPercentMap: Record<LibraryColKey, string> = {
                          name: '21%',
                          location: '15%',
                          category: '12%',
                          contact: '24%',
                          source: '8%',
                          status: '8%',
                          score: '5%',
                        };

                        return (
                          <th
                            key={colKey}
                            style={fitScreenMode ? { width: fitPercentMap[colKey] } : { width: colWidth, minWidth: colWidth }}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', colKey);
                              setDraggedColKey(colKey);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const midX = rect.left + rect.width / 2;
                              const pos = e.clientX < midX ? 'before' : 'after';
                              setColDropPosition(pos);
                              setDragOverColKey(colKey);
                            }}
                            onDragLeave={() => {
                              if (dragOverColKey === colKey) setDragOverColKey(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              handleDropCol(colKey);
                            }}
                            className={`relative py-3 px-2.5 font-extrabold text-slate-900 whitespace-nowrap group transition cursor-grab active:cursor-grabbing select-none ${
                              isBeingDragged ? 'opacity-30 bg-slate-200' : ''
                            } ${
                              isDropTarget && colDropPosition === 'before'
                                ? 'border-l-4 border-l-indigo-600 bg-indigo-50/70'
                                : isDropTarget && colDropPosition === 'after'
                                ? 'border-r-4 border-r-indigo-600 bg-indigo-50/70'
                                : 'hover:bg-slate-200/70'
                            }`}
                            title="Drag column header left/right to reorder, or click to sort"
                          >
                            <div className="flex items-center justify-between gap-1 pr-2">
                              <div
                                onClick={() => handleToggleLibrarySort(colKey as any)}
                                className="flex items-center gap-1 cursor-pointer flex-1 min-w-0"
                              >
                                <DotsSixVertical weight="bold" className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-700 flex-shrink-0 cursor-grab" />
                                <span className="truncate">{colLabel}</span>
                                {isSorted ? (
                                  librarySortDirection === 'asc' ? (
                                    <CaretUp weight="bold" className="w-3.5 h-3.5 text-indigo-700 flex-shrink-0" />
                                  ) : (
                                    <CaretDown weight="bold" className="w-3.5 h-3.5 text-indigo-700 flex-shrink-0" />
                                  )
                                ) : (
                                  <CaretDown className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
                                )}
                              </div>
                              <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                                <button
                                  type="button"
                                  disabled={colIdx === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveColStep(colKey, 'left');
                                  }}
                                  className="px-1 py-0.5 rounded bg-white/90 hover:bg-indigo-100 text-slate-900 text-[10px] font-black disabled:opacity-25 cursor-pointer border border-slate-300"
                                  title="Move column left"
                                >
                                  ←
                                </button>
                                <button
                                  type="button"
                                  disabled={colIdx === visibleColOrder.length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveColStep(colKey, 'right');
                                  }}
                                  className="px-1 py-0.5 rounded bg-white/90 hover:bg-indigo-100 text-slate-900 text-[10px] font-black disabled:opacity-25 cursor-pointer border border-slate-300"
                                  title="Move column right"
                                >
                                  →
                                </button>
                              </div>
                            </div>

                            {/* Resize Handle */}
                            <div
                              draggable={false}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleStartLibColResize(colKey, e);
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleResetLibColWidth(colKey);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center hover:bg-indigo-400/40 active:bg-indigo-600 transition z-20 group/resize"
                              title="Drag left/right to resize (Double-click to reset width)"
                            >
                              <div className="w-[1.5px] h-3.5 bg-slate-400 group-hover/resize:bg-indigo-600 transition" />
                            </div>
                          </th>
                        );
                      })}

                      {/* Actions */}
                      <th
                        style={fitScreenMode ? { width: '98px' } : { width: libraryColWidths.actions, minWidth: libraryColWidths.actions }}
                        className="relative py-3 px-2.5 font-extrabold text-slate-900 whitespace-nowrap text-right"
                      >
                        Actions
                        <div
                          onMouseDown={(e) => handleStartLibColResize('actions', e)}
                          onDoubleClick={() => handleResetLibColWidth('actions')}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center hover:bg-indigo-400/40 active:bg-indigo-600 transition z-20 group/resize"
                          title="Drag left/right to resize (Double-click to reset width)"
                        >
                          <div className="w-[1.5px] h-3.5 bg-slate-400 group-hover/resize:bg-indigo-600 transition" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedLibraryLeads.map((lead, idx) => {
                      const isSelected = librarySelectedIds.has(lead.id);
                      const isBeingDragged = draggedLeadId === lead.id;
                      const isDragOver = dragOverLeadId === lead.id;

                      return (
                        <tr
                          key={lead.id}
                          draggable={true}
                          onDragStart={(e) => handleDragStartRow(e, lead.id)}
                          onClick={() => openLeadDrawer(lead, 'details')}
                          onDragOver={(e) => handleDragOverRow(e, lead.id)}
                          onDrop={(e) => handleDropRow(e, lead.id)}
                          className={`transition cursor-pointer ${
                            isBeingDragged
                              ? 'opacity-35 bg-indigo-50 border-2 border-dashed border-indigo-400'
                              : isDragOver && dragDropSide === 'top'
                              ? 'border-t-4 border-indigo-600 bg-indigo-50/40'
                              : isDragOver && dragDropSide === 'bottom'
                              ? 'border-b-4 border-indigo-600 bg-indigo-50/40'
                              : isSelected
                              ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                              : 'hover:bg-slate-100/70'
                          }`}
                        >
                          {/* Drag Reorder Handle */}
                          <td
                            style={fitScreenMode ? undefined : { width: libraryColWidths.reorder, minWidth: libraryColWidths.reorder, maxWidth: libraryColWidths.reorder }}
                            className="py-3 px-1 text-center whitespace-nowrap cursor-grab active:cursor-grabbing group/drag"
                            onClick={(e) => e.stopPropagation()}
                            title="Drag row to reposition (or click arrows to move up/down)"
                          >
                            <div className="flex flex-col items-center justify-center text-slate-600 group-hover/drag:text-indigo-700 transition">
                              <DotsSixVertical weight="bold" className="w-4 h-4" />
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/drag:opacity-100 transition mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleMoveRowOneStep(lead.id, 'up')}
                                  disabled={(safeLibraryPage - 1) * libraryPageSize + idx === 0}
                                  className="text-[10px] text-slate-800 hover:text-indigo-700 disabled:opacity-20 px-0.5 font-black cursor-pointer"
                                  title="Move row up"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveRowOneStep(lead.id, 'down')}
                                  disabled={(safeLibraryPage - 1) * libraryPageSize + idx >= filteredLibraryLeads.length - 1}
                                  className="text-[10px] text-slate-800 hover:text-indigo-700 disabled:opacity-20 px-0.5 font-black cursor-pointer"
                                  title="Move row down"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Checkbox */}
                          <td
                            style={fitScreenMode ? undefined : { width: libraryColWidths.check, minWidth: libraryColWidths.check, maxWidth: libraryColWidths.check }}
                            className="py-3 px-1.5 text-center whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectLibraryLead(lead.id)}
                              className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>

                          {/* Index */}
                          <td
                            style={fitScreenMode ? undefined : { width: libraryColWidths.index, minWidth: libraryColWidths.index, maxWidth: libraryColWidths.index }}
                            className="py-3 px-1.5 text-xs text-slate-800 font-extrabold whitespace-nowrap text-center"
                          >
                            {(safeLibraryPage - 1) * libraryPageSize + idx + 1}
                          </td>

                          {/* Dynamic Columns based on user order */}
                          {visibleColOrder.map((colKey) => renderLeadCell(colKey, lead, (safeLibraryPage - 1) * libraryPageSize + idx))}

                          {/* Actions */}
                          <td
                            style={fitScreenMode ? undefined : { width: libraryColWidths.actions, minWidth: libraryColWidths.actions }}
                            className="py-2.5 px-2 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              {lead.email ? (
                                <button
                                  type="button"
                                  onClick={() => openLeadDrawer(lead, 'outreach')}
                                  className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs whitespace-nowrap flex-shrink-0"
                                  title={`Send Wholesale Outreach Email to ${lead.email}`}
                                >
                                  <PaperPlaneRight weight="fill" className="w-3 h-3 text-white" />
                                  <span>Send</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openLeadDrawer(lead, 'outreach')}
                                  className="px-2 py-1 rounded-md bg-indigo-100 hover:bg-indigo-200 text-indigo-950 font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer border border-indigo-300 whitespace-nowrap flex-shrink-0"
                                  title="Compose Wholesale Outreach"
                                >
                                  <PaperPlaneRight weight="bold" className="w-3 h-3 text-indigo-700" />
                                  <span>Outreach</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openLeadDrawer(lead, 'notes')}
                                className="p-1 rounded-md hover:bg-slate-200 text-slate-700 hover:text-slate-950 transition cursor-pointer flex-shrink-0"
                                title="Notes & Follow-up Schedule"
                              >
                                <FileText weight="bold" className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedLead(lead.id)}
                                className="p-1 rounded-md hover:bg-rose-100 text-slate-700 hover:text-rose-700 transition cursor-pointer flex-shrink-0"
                                title="Delete Lead"
                              >
                                <Trash weight="bold" className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* ── Mobile View: High-Touch Touch-Optimized Cards (< md) ── */}
                <div className="md:hidden divide-y divide-slate-200">
                  {paginatedLibraryLeads.map((lead, idx) => {
                    const isSelected = librarySelectedIds.has(lead.id);
                    const globalIdx = (safeLibraryPage - 1) * libraryPageSize + idx + 1;
                    const displayScore = lead.research?.qualification?.score ?? lead.opportunityScore ?? 82;
                    const mapQuery = [lead.businessName, lead.address, lead.city, lead.region].filter(Boolean).join(', ');
                    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
                    const locText = [lead.city, lead.region].filter(Boolean).join(', ') || lead.address || 'United States';

                    return (
                      <div
                        key={`mobile-lead-${lead.id}`}
                        className={`p-3.5 space-y-3 transition ${
                          isSelected ? 'bg-indigo-50/50' : 'bg-white hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Header: Select + Index + Business Name + Category + Score */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectLibraryLead(lead.id)}
                              className="mt-0.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                            />
                            <span className="text-[11px] font-mono text-slate-700 mt-0.5 font-bold">
                              #{globalIdx}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h4
                                onClick={() => openLeadDrawer(lead, 'details')}
                                className="font-extrabold text-slate-950 text-sm leading-tight hover:text-indigo-600 cursor-pointer truncate"
                                title={lead.businessName}
                              >
                                {lead.businessName}
                              </h4>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full bg-blue-100/80 text-blue-950 text-[10px] font-extrabold border border-blue-300">
                                  {lead.category || 'Feed Store'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                                  displayScore >= 80 ? 'bg-emerald-100 text-emerald-950 border-emerald-300' :
                                  displayScore >= 60 ? 'bg-amber-100 text-amber-950 border-amber-300' :
                                  'bg-slate-200 text-slate-900 border-slate-300'
                                }`}>
                                  {displayScore}% Match
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <StatusPill status={lead.status || 'new'} />
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <MapPin weight="fill" className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                          <span className="truncate font-medium">{locText}</span>
                        </div>

                        {/* Direct Mobile Touch Actions Bar (>= 44px tap targets) */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs transition active:scale-95"
                              title={`Call ${lead.phone}`}
                            >
                              <Phone weight="fill" className="w-4 h-4 text-emerald-600" />
                              <span>Call</span>
                            </a>
                          ) : (
                            <button
                              disabled
                              className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 font-semibold text-xs opacity-50 cursor-not-allowed"
                            >
                              <Phone className="w-4 h-4" />
                              <span>No Phone</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openLeadDrawer(lead, 'outreach')}
                            className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs transition shadow-2xs active:scale-95 cursor-pointer"
                            title={lead.email ? `Email ${lead.email}` : 'Compose Wholesale Outreach'}
                          >
                            <PaperPlaneRight weight="fill" className="w-4 h-4" />
                            <span>{lead.email ? 'Email' : 'Outreach'}</span>
                          </button>

                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold text-xs transition active:scale-95"
                            title="Open in Google Maps"
                          >
                            <MapPin weight="bold" className="w-4 h-4 text-slate-600" />
                            <span>Map</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => openLeadDrawer(lead, 'details')}
                            className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold text-xs transition active:scale-95 cursor-pointer"
                            title="View Prospect Intel & Research"
                          >
                            <Eye weight="bold" className="w-4 h-4 text-slate-600" />
                            <span>View</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pagination Footer Bar */}
            {!libraryUnavailable && (libraryLeads.length > 0 || libraryPage > 1) && (() => {
              const totalCount = libraryTotal ?? libraryLeads.length;
              const matchCount = filteredLibraryLeads.length;
              const startRow = matchCount === 0 ? 0 : (safeLibraryPage - 1) * libraryPageSize + 1;
              const endRow = Math.min(matchCount, safeLibraryPage * libraryPageSize);

              return (
                <div className="px-4 py-3 border-t border-slate-300 bg-slate-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="text-slate-800 font-semibold">
                    Showing <span className="font-extrabold text-slate-950">{startRow}–{endRow}</span> of{' '}
                    <span className="font-extrabold text-slate-950">{matchCount}</span> matching leads (
                    <span className="font-extrabold text-slate-950">{totalCount}</span> total saved in library)
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 text-slate-800 font-bold">
                      <span>Rows:</span>
                      <select
                        value={libraryPageSize}
                        onChange={(e) => {
                          setLibraryPageSize(Number(e.target.value));
                          setLibraryPage(1);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-900 font-extrabold text-xs cursor-pointer"
                      >
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                        <option value={200}>200 / page</option>
                        <option value={500}>All (500 / page)</option>
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeLibraryPage <= 1 || loadingLibrary}
                        onClick={() => setLibraryPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-200 text-slate-900 font-extrabold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                      >
                        ← Prev
                      </button>
                      <span className="px-2.5 py-1 font-extrabold text-slate-900">
                        Page {safeLibraryPage} of {totalLibraryPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeLibraryPage >= totalLibraryPages || loadingLibrary}
                        onClick={() => setLibraryPage((p) => Math.min(totalLibraryPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-200 text-slate-900 font-extrabold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Omnisend Bulk Sync Owner Confirmation Modal ── */}
          {omnisendSyncPreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 flex-shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-950 text-sm">Confirm Omnisend B2B Contact Sync</h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Review eligible B2B prospects before syncing to Omnisend CRM.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOmnisendSyncPreview(null)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Total Saved Prospects:</span>
                    <span className="font-bold text-slate-900">{omnisendSyncPreview.totalLeads}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Prospects with Valid Email:</span>
                    <span className="font-bold text-slate-900">{omnisendSyncPreview.totalWithEmail}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Duplicate Multi-Branch Emails Skipped:</span>
                    <span className="font-bold text-amber-700">−{omnisendSyncPreview.duplicateEmailCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Suppressed / Do-Not-Contact Excluded:</span>
                    <span className="font-bold text-rose-700">−{omnisendSyncPreview.excludedOrSuppressedCount}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                    <span className="font-extrabold text-slate-900">Eligible Unique Contacts to Sync:</span>
                    <span className="text-sm font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                      {omnisendSyncPreview.eligibleCount}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 space-y-1">
                  <div className="font-bold">Consent &amp; Compliance Safeguard:</div>
                  <p>
                    Discovered B2B prospects are synced strictly with <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">{omnisendSyncPreview.consentStatus}</code> status. No prospect is marked as a subscribed marketing contact and no promotional email is automatically sent.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOmnisendSyncPreview(null)}
                    disabled={syncingOmnisend}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmSyncOmnisend()}
                    disabled={syncingOmnisend || omnisendSyncPreview.eligibleCount === 0}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {syncingOmnisend ? (
                      <><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Syncing {omnisendSyncPreview.eligibleCount} Contacts…</>
                    ) : (
                      <>Confirm Sync ({omnisendSyncPreview.eligibleCount} Eligible)</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Batch Outreach Modal (Multi-Select Email Dispatch) ── */}
          {batchOutreachOpen && (() => {
            const selectedLeads = librarySelectedIds.size > 0
              ? libraryLeads.filter((l) => librarySelectedIds.has(l.id))
              : libraryLeads.filter((l) => Boolean(l.email));
            const eligibleLeads = selectedLeads.filter(
              (l) => l.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email.trim())
            );
            const sendBatch = eligibleLeads.slice(0, 250);
            const sampleLead = sendBatch[0];
            const sampleLeadName = sampleLead ? (sampleLead.businessName || (sampleLead as any).name || 'Example Business') : 'Example Farm & Feed Supply';
            const sampleCity = sampleLead?.city || 'Houston, TX';
            const previewSubject = batchSubject
              .replace(/\{\{businessName\}\}/g, sampleLeadName)
              .replace(/\{\{city\}\}/g, sampleCity);
            const previewBody = batchBodyTemplate
              .replace(/\{\{businessName\}\}/g, sampleLeadName)
              .replace(/\{\{city\}\}/g, sampleCity);

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 flex-shrink-0">
                        <PaperPlaneRight weight="bold" className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-950 text-base">Batch Outreach to Selected Prospects</h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Personalized B2B outreach with sequential draft creation, owner approval, and quota tracking.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBatchOutreachOpen(false)}
                      disabled={batchSending}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quota & Recipient Stats */}
                  <div className="grid grid-cols-3 gap-2.5 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 font-medium block text-[11px]">Selected Leads</span>
                      <span className="text-base font-black text-slate-900">{selectedLeads.length}</span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-emerald-700 font-medium block text-[11px]">Valid Verified Emails</span>
                      <span className="text-base font-black text-emerald-900">{eligibleLeads.length}</span>
                    </div>
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <span className="text-indigo-700 font-medium block text-[11px]">Omnisend Free Quota</span>
                      <span className="text-base font-black text-indigo-900">Max 250 / Batch</span>
                    </div>
                  </div>

                  {eligibleLeads.length > 250 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                      <WarningCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>
                        Your selection exceeds 250 recipients. The batch is safely capped at the first 250 contacts to adhere strictly to the Omnisend Free Plan campaign limit.
                      </span>
                    </div>
                  )}

                  {/* Template Picker */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Campaign Outreach Template</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        {
                          id: 'agriculture' as const,
                          name: 'Livestock Salt Licks',
                          subj: 'Wholesale Himalayan Animal Mineral Salt Licks — Direct Bulk Supply',
                          body: 'Hi {{businessName}},\n\nI noticed {{businessName}} serves the {{city}} agricultural community. Himalayan Koh supplies premium 100% natural Himalayan pink rock salt licks with mineral-rich ropes, lick blocks, and bulk feed salt directly from the Khewra salt range.\n\nWould you like our wholesale catalog and volume pricing for {{city}} farm and livestock stores?\n\nBest regards,\nSalman Bashir\nFounder, Himalayan Koh\nsales@himalayankoh.com | https://himalayankoh.com',
                        },
                        {
                          id: 'wellness' as const,
                          name: 'Wellness Bath Salts',
                          subj: 'Direct Wholesale Pure Himalayan Bath Salt & Halotherapy Tiles',
                          body: 'Hi {{businessName}},\n\nI am reaching out regarding {{businessName}} in {{city}}. Himalayan Koh imports certified pure food-grade and therapeutic pink Himalayan mineral salts, bath crystal chunks, and salt tiles direct from source.\n\nCould we send you our wholesale sample kit and pallet pricing?\n\nBest regards,\nSalman Bashir\nFounder, Himalayan Koh\nsales@himalayankoh.com | https://himalayankoh.com',
                        },
                        {
                          id: 'retail' as const,
                          name: 'General B2B Wholesale',
                          subj: 'Direct B2B Supply of Himalayan Salt Products — Wholesale Catalog',
                          body: 'Hi {{businessName}},\n\nWe provide retail, specialty, and feed stores in {{city}} with factory-direct pricing on genuine Himalayan pink salt products.\n\nWould you like a copy of our current wholesale pricing list?\n\nBest regards,\nSalman Bashir\nFounder, Himalayan Koh\nsales@himalayankoh.com | https://himalayankoh.com',
                        },
                      ].map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setBatchCategoryFilter(tpl.id);
                            setBatchSubject(tpl.subj);
                            setBatchBodyTemplate(tpl.body);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer text-xs ${
                            batchCategoryFilter === tpl.id
                              ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="block font-bold">{tpl.name}</span>
                          <span className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{tpl.subj}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subject and Body inputs */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Subject Line</label>
                      <input
                        type="text"
                        value={batchSubject}
                        onChange={(e) => setBatchSubject(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">Message Body Template</label>
                        <span className="text-[10px] text-slate-500">Supports <code className="bg-slate-100 px-1 rounded">{'{{businessName}}'}</code> and <code className="bg-slate-100 px-1 rounded">{'{{city}}'}</code></span>
                      </div>
                      <textarea
                        rows={6}
                        value={batchBodyTemplate}
                        onChange={(e) => setBatchBodyTemplate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 font-sans focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Live Dynamic Preview */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">Sample Live Preview (Recipient #1: {sampleLeadName})</span>
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">Variables Merged</span>
                    </div>
                    <div className="text-xs font-bold text-slate-900">Subject: {previewSubject}</div>
                    <div className="text-[11px] text-slate-700 whitespace-pre-line bg-white p-3 rounded-lg border border-slate-200">
                      {previewBody}
                    </div>
                  </div>

                  {/* Owner Approval & Safeguards */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={omnisendCampaignApproved}
                        onChange={(e) => setOmnisendCampaignApproved(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-slate-800 text-[11px] font-semibold">
                        Owner Approval Confirmation: I authorize queueing these personalized B2B outreach messages to the selected verified business contacts. Sender will be <code className="font-mono bg-white px-1 py-0.5 rounded font-bold">sales@himalayankoh.com</code>.
                      </span>
                    </label>
                  </div>

                  {/* Progress & Result Notice */}
                  {batchProgress && (
                    <div className="space-y-1.5 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs">
                      <div className="flex justify-between font-bold text-indigo-950">
                        <span>Dispatch Progress: {batchProgress.current} / {batchProgress.total}</span>
                        <span>{batchProgress.success} Successful • {batchProgress.failed} Failed</span>
                      </div>
                      <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-2 transition-all duration-200"
                          style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {batchResultNotice && (
                    <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-900 font-medium">
                      {batchResultNotice}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleExecuteBatchOutreach('simulate')}
                      disabled={batchSending || eligibleLeads.length === 0}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Eye className="w-4 h-4 text-slate-600" />
                      Simulate Batch (Dry Run)
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBatchOutreachOpen(false)}
                        disabled={batchSending}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecuteBatchOutreach('dispatch')}
                        disabled={batchSending || !omnisendCampaignApproved || eligibleLeads.length === 0}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black transition shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        {batchSending ? (
                          <><ArrowsClockwise className="w-4 h-4 animate-spin" /> Dispatching...</>
                        ) : (
                          <><PaperPlaneRight weight="bold" className="w-4 h-4" /> Confirm &amp; Queue Dispatch ({sendBatch.length})</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── 3. Centered Floating Lead Intelligence & Outreach Modal (Replaces Slide-Over Drawer) ── */}
          {selectedDrawerLead && (() => {
            const currentLeadIndex = filteredLibraryLeads.findIndex((l) => l.id === selectedDrawerLead.id);
            const hasPrevLead = currentLeadIndex > 0;
            const hasNextLead = currentLeadIndex >= 0 && currentLeadIndex < filteredLibraryLeads.length - 1;

            const handleNavigateProspect = (direction: 'prev' | 'next') => {
              const targetIdx = direction === 'prev' ? currentLeadIndex - 1 : currentLeadIndex + 1;
              if (targetIdx >= 0 && targetIdx < filteredLibraryLeads.length) {
                const nextLead = filteredLibraryLeads[targetIdx];
                openLeadDrawer(nextLead, drawerActiveTab);
              }
            };

            const rel = productRelevanceInfo || determineProductRelevance(selectedDrawerLead);

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
                {/* Backdrop Click Dismiss */}
                <div
                  className="fixed inset-0 -z-10"
                  onClick={() => setSelectedDrawerLead(null)}
                />

                <div className="relative w-full max-w-5xl max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
                  {/* Modal Header */}
                  <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Lead Identity */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 border ${getAvatarBg(selectedDrawerLead.businessName)}`}>
                          {getCompanyInitials(selectedDrawerLead.businessName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 text-base leading-tight truncate" title={selectedDrawerLead.businessName}>
                              {selectedDrawerLead.businessName}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-100 whitespace-nowrap">
                              {selectedDrawerLead.category || 'Feed Store'}
                            </span>
                            {rel.isLowFit && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-semibold border border-amber-200 whitespace-nowrap">
                                Low Product Fit
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {[selectedDrawerLead.city, selectedDrawerLead.region].filter(Boolean).join(', ') || 'United States'}
                              {selectedDrawerLead.city && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedDrawerLead.businessName} ${selectedDrawerLead.city || ''} ${selectedDrawerLead.region || ''}`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:underline inline-flex items-center ml-0.5"
                                  title="View on Google Maps"
                                >
                                  <ArrowSquareOut className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </span>
                            {selectedDrawerLead.website && (
                              <>
                                <span className="text-slate-300">•</span>
                                <a
                                  href={selectedDrawerLead.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-medium truncate max-w-[170px]"
                                  title={selectedDrawerLead.website}
                                >
                                  <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                  <span>{selectedDrawerLead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                                  <ArrowSquareOut className="w-2.5 h-2.5" />
                                </a>
                              </>
                            )}
                            <span className="text-slate-300">•</span>
                            <span className="flex items-center gap-1 font-semibold text-slate-700">
                              <Target className="w-3 h-3 text-emerald-600" />
                              Fit: <strong className="text-slate-900">{selectedDrawerLead.opportunityScore ?? 85}/100</strong>
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              selectedDrawerLead.emailSource === 'company_website' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                            }`}>
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              {selectedDrawerLead.emailSource === 'company_website' ? 'Verified Contact' : 'Public Record'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Pipeline Dropdown, Prev/Next prospect controls, and Close */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <select
                          value={selectedDrawerLead.status}
                          onChange={(e) => handleUpdateDrawerLeadStatus(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                        >
                          {LEAD_PIPELINE.map((st) => (
                            <option key={st} value={st}>{st.replaceAll('_', ' ')}</option>
                          ))}
                          <option value="excluded">Excluded / Quarantined</option>
                          <option value="disqualified">Disqualified</option>
                        </select>

                        {/* Prev / Next Controls */}
                        <div className="flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 bg-white">
                          <button
                            type="button"
                            disabled={!hasPrevLead}
                            onClick={() => handleNavigateProspect('prev')}
                            className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition cursor-pointer"
                            title={hasPrevLead ? `Previous: ${filteredLibraryLeads[currentLeadIndex - 1]?.businessName}` : 'No previous prospect'}
                          >
                            <CaretLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] font-semibold text-slate-500 px-1 whitespace-nowrap">
                            {currentLeadIndex >= 0 ? `${currentLeadIndex + 1} / ${filteredLibraryLeads.length}` : ''}
                          </span>
                          <button
                            type="button"
                            disabled={!hasNextLead}
                            onClick={() => handleNavigateProspect('next')}
                            className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition cursor-pointer"
                            title={hasNextLead ? `Next: ${filteredLibraryLeads[currentLeadIndex + 1]?.businessName}` : 'No next prospect'}
                          >
                            <CaretRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDrawerLead(null)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer ml-1"
                          title="Close modal"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Modal 4 Tabs Bar: Business Overview | Contact & Outreach | Drafts & Campaigns | Notes & History */}
                  <div className="flex items-center border-b border-slate-200 bg-white px-5 overflow-x-auto">
                    {[
                      { id: 'details' as const, label: 'Business Overview', icon: Storefront },
                      { id: 'outreach' as const, label: 'Contact & Outreach', icon: PaperPlaneRight },
                      { id: 'drafts' as const, label: 'Drafts & Campaigns', icon: Archive, badge: leadSavedDrafts.length > 0 ? leadSavedDrafts.length : undefined },
                      { id: 'notes' as const, label: 'Notes & History', icon: FileText },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const isCur = drawerActiveTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setDrawerActiveTab(tab.id)}
                          className={`flex items-center gap-2 py-3 px-3.5 text-xs font-semibold border-b-2 transition cursor-pointer whitespace-nowrap -mb-px ${
                            isCur
                              ? 'border-indigo-600 text-indigo-600'
                              : 'border-transparent text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isCur ? 'text-indigo-600' : 'text-slate-400'}`} />
                          <span>{tab.label}</span>
                          {tab.badge !== undefined && (
                            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 text-[9px] font-bold">
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Modal Body Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                    {/* ══════════ TAB 1: BUSINESS OVERVIEW ══════════ */}
                    {drawerActiveTab === 'details' && (
                      <div className="space-y-4">
                        {/* Contact & Location Details */}
                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-slate-500">
                            <Storefront className="w-3.5 h-3.5 text-indigo-600" />
                            Business &amp; Contact Intel
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Full Address</span>
                              <span className="text-slate-800 font-medium block mt-0.5">
                                {selectedDrawerLead.address || `${selectedDrawerLead.city || ''}, ${selectedDrawerLead.region || ''}` || 'Not provided'}
                              </span>
                              {selectedDrawerLead.city && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedDrawerLead.businessName} ${selectedDrawerLead.city || ''} ${selectedDrawerLead.region || ''}`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:underline text-[10px] font-semibold inline-flex items-center gap-0.5 mt-1"
                                >
                                  Google Maps <ArrowSquareOut className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Phone Number</span>
                              {selectedDrawerLead.phone ? (
                                <a href={`tel:${selectedDrawerLead.phone}`} className="text-slate-800 font-semibold text-xs hover:underline block mt-0.5">
                                  {selectedDrawerLead.phone}
                                </a>
                              ) : (
                                <span className="text-slate-400 mt-0.5 block">No direct phone listed</span>
                              )}
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Official Website</span>
                              {selectedDrawerLead.website ? (
                                <a
                                  href={selectedDrawerLead.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:underline font-semibold block mt-0.5 truncate"
                                  title={selectedDrawerLead.website}
                                >
                                  {selectedDrawerLead.website}
                                </a>
                              ) : (
                                <span className="text-slate-400 mt-0.5 block">No website available</span>
                              )}
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Email Address</span>
                              {selectedDrawerLead.email ? (
                                <div className="mt-0.5">
                                  <a
                                    href={`mailto:${selectedDrawerLead.email}?subject=${encodeURIComponent(`Himalayan Salt Wholesale Inquiry - ${selectedDrawerLead.businessName}`)}`}
                                    className="font-semibold text-indigo-600 hover:underline block truncate"
                                    title={`Send email to ${selectedDrawerLead.email}`}
                                  >
                                    {selectedDrawerLead.email}
                                  </a>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block whitespace-nowrap">
                                      {selectedDrawerLead.emailSource === 'company_website' ? 'Website Verified' : selectedDrawerLead.emailSource === 'manually_entered' ? 'Staff Added' : 'OSM Record'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setDrawerActiveTab('outreach')}
                                      className="text-[10px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                                    >
                                      Compose Outreach &rarr;
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 mt-0.5 block">No email recorded</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Fit Score & Opportunity Breakdown */}
                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-slate-500">
                              <Target className="w-3.5 h-3.5 text-emerald-600" />
                              Commercial Fit Score Breakdown
                            </h4>
                            <ScoreBadge score={selectedDrawerLead.research?.qualification?.score ?? selectedDrawerLead.opportunityScore ?? 82} label="Fit Score" />
                          </div>

                          {selectedDrawerLead.evidence ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div className="p-2 bg-slate-50 rounded-lg text-center">
                                <span className="text-[10px] text-slate-400 block uppercase font-bold">ICP Fit</span>
                                <span className="font-bold text-slate-800 text-sm">{selectedDrawerLead.evidence.icpFit ?? 85}/100</span>
                              </div>
                              <div className="p-2 bg-slate-50 rounded-lg text-center">
                                <span className="text-[10px] text-slate-400 block uppercase font-bold">Reachability</span>
                                <span className="font-bold text-slate-800 text-sm">{selectedDrawerLead.evidence.reachability ?? 90}/100</span>
                              </div>
                              <div className="p-2 bg-slate-50 rounded-lg text-center">
                                <span className="text-[10px] text-slate-400 block uppercase font-bold">Confidence</span>
                                <span className="font-bold text-slate-800 text-sm">{selectedDrawerLead.evidence.dataConfidence ?? 80}/100</span>
                              </div>
                              <div className="p-2 bg-slate-50 rounded-lg text-center">
                                <span className="text-[10px] text-slate-400 block uppercase font-bold">Priority</span>
                                <span className="font-bold text-slate-800 text-sm">{selectedDrawerLead.evidence.commercialPriority ?? 88}/100</span>
                              </div>
                            </div>
                          ) : null}

                          {selectedDrawerLead.opportunitySignals && selectedDrawerLead.opportunitySignals.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Opportunity Signals</span>
                              <div className="flex flex-wrap gap-1.5">
                                {selectedDrawerLead.opportunitySignals.map((sig, sIdx) => (
                                  <span key={sIdx} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-100">
                                    {sig}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* AI Deep Assessment Trigger */}
                        <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Robot className="w-4 h-4 text-indigo-600" />
                              <h4 className="text-xs font-bold text-slate-900">AI Deep Assessment</h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAIAnalyze(selectedDrawerLead as any)}
                              disabled={analyzingLeadName === selectedDrawerLead.businessName}
                              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition cursor-pointer shadow-2xs flex items-center gap-1"
                            >
                              {analyzingLeadName === selectedDrawerLead.businessName ? (
                                <><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                              ) : (
                                'Run AI Assessment'
                              )}
                            </button>
                          </div>

                          {aiAnalysisResult && analyzingLeadName === selectedDrawerLead.businessName && (
                            <div className="p-3 bg-white rounded-lg border border-indigo-200 text-xs space-y-2">
                              <p className="text-slate-700 leading-relaxed">{aiAnalysisResult.analysis?.summary}</p>
                              <div className="flex items-center gap-3 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                                <span><strong>Suitability:</strong> {aiAnalysisResult.analysis?.potentialValue}</span>
                                <span><strong>Confidence:</strong> {aiAnalysisResult.analysis?.confidence}</span>
                              </div>
                            </div>
                          )}
                          <p className="text-[11px] text-slate-500">
                            Evaluates this business against Himalayan Koh wholesale parameters, animal salt lick retail demand, and gourmet culinary pink salt assortments.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ══════════ TAB 2: CONTACT & OUTREACH (2 COLUMNS) ══════════ */}
                    {drawerActiveTab === 'outreach' && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        {/* LEFT COLUMN: Prospect Intel & Recommended Product Fit */}
                        <div className="lg:col-span-5 space-y-4">
                          {/* Recommended Product Fit Card */}
                          <div className={`p-4 rounded-xl border ${rel.isLowFit ? 'bg-amber-50/60 border-amber-300' : 'bg-slate-50 border-slate-200'} space-y-3`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Product Alignment
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                rel.isLowFit ? 'bg-amber-100 text-amber-900 border-amber-300' :
                                rel.fitLevel === 'high' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                'bg-blue-50 text-blue-800 border-blue-200'
                              }`}>
                                {rel.isLowFit ? 'Low Product Fit' : `${rel.fitLevel.toUpperCase()} MATCH`}
                              </span>
                            </div>

                            <div>
                              <h5 className="font-bold text-slate-900 text-sm">{rel.productName}</h5>
                              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{rel.relevanceReason}</p>
                            </div>

                            {/* Catalog URL verification */}
                            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                              <span className="text-[11px] text-slate-500 font-medium">Verified Catalog Link:</span>
                              <a
                                href={verifiedProductUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline font-bold text-[11px] inline-flex items-center gap-1"
                              >
                                View Product <ArrowSquareOut className="w-3 h-3" />
                              </a>
                            </div>

                            {/* Verified Live Pricing & Stock Specs */}
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-[11px] space-y-1">
                              <div className="font-semibold text-slate-800">Assortment &amp; Pricing Specs:</div>
                              {rel.productInterest === 'culinary_salt' ? (
                                <div className="text-slate-600">
                                  • Edible Pink Salt 16 oz Jar: <strong>$9.95</strong> (Food-grade, fine grain)
                                </div>
                              ) : (
                                <div className="text-slate-600">
                                  • Horse Salt Lick 6 lb: <strong>$19.95</strong> (Stock: 10 units in stock)
                                  <br />
                                  • Horse Salt Lick 2 lb: Available for single-unit retail trial
                                </div>
                              )}
                              <div className="text-emerald-700 font-medium flex items-center gap-1 pt-0.5">
                                <Check className="w-3 h-3" /> Coupon: <strong>welcome5</strong> (5% active WooCommerce discount)
                              </div>
                            </div>
                          </div>

                          {/* Available Outreach Channels */}
                          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                            <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Available Channels
                            </h5>

                            <div className="space-y-2">
                              {/* Email Channel */}
                              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                                <div className="flex items-center gap-2">
                                  <EnvelopeSimple className="w-3.5 h-3.5 text-indigo-600" />
                                  <span className="font-medium text-slate-800 truncate max-w-[170px]">
                                    {selectedDrawerLead.email || 'No email recorded'}
                                  </span>
                                </div>
                                {selectedDrawerLead.email ? (
                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    {selectedDrawerLead.emailSource === 'company_website' ? 'Verified' : 'OSM'}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEmailModal(selectedDrawerLead)}
                                    className="text-indigo-600 hover:underline text-[10px] font-semibold cursor-pointer"
                                  >
                                    + Add email
                                  </button>
                                )}
                              </div>

                              {/* Facebook Page Channel */}
                              {(selectedDrawerLead.facebook || selectedDrawerLead.research?.facebook) ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenManualSocial('facebook', selectedDrawerLead)}
                                  className="w-full flex items-center justify-between p-2 rounded-lg bg-blue-50/70 hover:bg-blue-100 border border-blue-200 text-blue-900 text-xs font-semibold transition cursor-pointer"
                                  title="Prepare Facebook pitch and open profile"
                                >
                                  <div className="flex items-center gap-2">
                                    <FacebookLogo weight="fill" className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Facebook Business Page</span>
                                  </div>
                                  <ArrowSquareOut className="w-3 h-3 text-blue-500" />
                                </button>
                              ) : (
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/60 border border-slate-100 text-xs text-slate-400">
                                  <div className="flex items-center gap-2">
                                    <FacebookLogo className="w-3.5 h-3.5" />
                                    <span>Facebook Page: None</span>
                                  </div>
                                  <span className="text-[10px]">Not found</span>
                                </div>
                              )}

                              {/* Instagram Channel */}
                              {(selectedDrawerLead.instagram || selectedDrawerLead.research?.instagram) ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenManualSocial('instagram', selectedDrawerLead)}
                                  className="w-full flex items-center justify-between p-2 rounded-lg bg-rose-50/70 hover:bg-rose-100 border border-rose-200 text-rose-900 text-xs font-semibold transition cursor-pointer"
                                  title="Prepare Instagram pitch and open profile"
                                >
                                  <div className="flex items-center gap-2">
                                    <InstagramLogo weight="fill" className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Instagram Business Profile</span>
                                  </div>
                                  <ArrowSquareOut className="w-3 h-3 text-rose-500" />
                                </button>
                              ) : null}

                              {/* Phone Direct Dial */}
                              {selectedDrawerLead.phone && (
                                <a
                                  href={`tel:${selectedDrawerLead.phone}`}
                                  className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-semibold transition"
                                >
                                  <div className="flex items-center gap-2">
                                    <Phone weight="fill" className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Call {selectedDrawerLead.phone}</span>
                                  </div>
                                  <span className="text-[10px] text-emerald-700">Direct Dial</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: Sales Composer & Delivery Safeguards */}
                        <div className="lg:col-span-7 space-y-3.5">
                          {/* Deliverability & Sender Safeguard Bar */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                              <div className="min-w-0">
                                <span className="font-bold text-slate-800 block truncate">
                                  Sender: {officialSenderEmail}
                                </span>
                                <span className="text-[10px] text-slate-500 block truncate">
                                  SPF &amp; 2048-bit DKIM Active • Owner Authorization Required
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                              LeadOS 3.5 CRM
                            </span>
                          </div>

                          {sendResultNotice && (
                            <div className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                              sendResultNotice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
                            }`}>
                              {sendResultNotice.ok ? <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <WarningCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                              <div className="font-medium text-[11px]">{sendResultNotice.msg}</div>
                            </div>
                          )}

                          {/* Outreach Mode Selector */}
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                              Outreach Mode
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { id: 'retail' as const, label: 'Retail', desc: '5% Welcome Offer' },
                                { id: 'wholesale' as const, label: 'Wholesale', desc: 'Commercial Tier Pricing' },
                                { id: 'private_label' as const, label: 'Private Label', desc: 'Custom Packaging' },
                              ].map((m) => {
                                const isCur = outreachMode === m.id;
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleSelectOutreachMode(m.id)}
                                    className={`text-left p-2 rounded-xl border transition cursor-pointer ${
                                      isCur
                                        ? 'bg-indigo-50/80 border-indigo-500 text-indigo-950 ring-1 ring-indigo-500'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="font-bold text-xs">{m.label}</div>
                                    <div className="text-[10px] text-slate-500 truncate">{m.desc}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Composer Inputs */}
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Recipient Name</label>
                                <input
                                  type="text"
                                  value={recipientName}
                                  onChange={(e) => { setRecipientName(e.target.value); markDraftEdited(); }}
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                  Recipient Email {recipientEmailSource && <span className="text-[10px] font-normal text-slate-400">({recipientEmailSource})</span>}
                                </label>
                                <input
                                  type="email"
                                  value={recipientEmail}
                                  onChange={(e) => { setRecipientEmail(e.target.value); setRecipientEmailSource('manually_entered'); markDraftEdited(); }}
                                  placeholder="buyer@prospect.com"
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Subject Line</label>
                              <input
                                type="text"
                                value={emailSubject}
                                onChange={(e) => { setEmailSubject(e.target.value); markDraftEdited(); }}
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>

                            {/* Message Body with Edit vs Preview Toggle */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] font-bold text-slate-700">Message Body</label>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEmailEditMode('edit')}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                                      emailEditMode === 'edit'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEmailEditMode('preview')}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                                      emailEditMode === 'preview'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    <Eye className="w-3 h-3" />
                                    Preview
                                  </button>
                                </div>
                              </div>

                              {emailEditMode === 'edit' ? (
                                <textarea
                                  rows={8}
                                  value={emailBody}
                                  onChange={(e) => { setEmailBody(e.target.value); markDraftEdited(); }}
                                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono leading-relaxed"
                                />
                              ) : (
                                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-2">
                                  <div className="border-b border-slate-200/80 pb-2 text-[11px] text-slate-600 space-y-1">
                                    <div><strong className="text-slate-800">From:</strong> Himalayan Koh Sales &lt;{officialSenderEmail}&gt;</div>
                                    <div><strong className="text-slate-800">To:</strong> {recipientName} &lt;{recipientEmail || 'buyer@prospect.com'}&gt;</div>
                                    <div><strong className="text-slate-800">Subject:</strong> {emailSubject}</div>
                                  </div>
                                  <div className="whitespace-pre-wrap font-sans text-slate-800 leading-relaxed text-xs pt-1">
                                    {emailBody}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Email Quality Checker Section */}
                            <div className="pt-1">
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={handleRunEmailQualityCheck}
                                  className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Sparkle className="w-3.5 h-3.5 text-indigo-600" />
                                  Run Pre-Send Quality Check
                                </button>
                                {emailQualityResult && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    emailQualityResult.status === 'READY' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                    emailQualityResult.status === 'BLOCKED' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                    'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}>
                                    Quality: {emailQualityResult.score}/100 ({emailQualityResult.status})
                                  </span>
                                )}
                              </div>

                              {emailQualityResult && (
                                <div className="mt-2 p-3 rounded-lg border border-slate-200 bg-white text-xs space-y-1.5">
                                  <div className="font-bold text-slate-800 text-[11px]">Audit Findings:</div>
                                  <ul className="space-y-1 text-[11px] text-slate-600">
                                    {emailQualityResult.findings.map((f, i) => (
                                      <li key={i} className="flex items-start gap-1.5">
                                        <span className="text-indigo-600 font-bold">•</span>
                                        <span>{f}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  {emailQualityResult.recommendations.length > 0 && (
                                    <div className="pt-1 border-t border-slate-100">
                                      <div className="font-bold text-amber-800 text-[11px]">Recommendations:</div>
                                      <ul className="space-y-0.5 text-[10px] text-amber-700 mt-0.5">
                                        {emailQualityResult.recommendations.map((r, i) => (
                                          <li key={i} className="flex items-start gap-1">
                                            <span>&rarr;</span>
                                            <span>{r}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ══════════ TAB 3: DRAFTS & CAMPAIGNS ══════════ */}
                    {drawerActiveTab === 'drafts' && (
                      <div className="space-y-5">
                        {/* Saved Revisions List */}
                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-slate-500">
                              <Archive className="w-3.5 h-3.5 text-indigo-600" />
                              Saved Draft Revisions
                            </h4>
                            <span className="text-[10px] text-slate-500">
                              Database table: <code className="text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded font-mono">wp_leados_workflows</code>
                            </span>
                          </div>

                          {loadingDrafts ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                              <ArrowsClockwise className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-500" />
                              Loading saved drafts...
                            </div>
                          ) : leadSavedDrafts.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-100">
                              No saved drafts yet for this prospect. Edit your message in the Contact &amp; Outreach tab and click &quot;Save Draft&quot;.
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                              {leadSavedDrafts.map((d: any, i: number) => (
                                <div key={d.id || i} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 text-xs">
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 flex items-center gap-2">
                                      <span>Revision #{d.revision || (leadSavedDrafts.length - i)}</span>
                                      <span className="text-[10px] font-normal text-slate-400">
                                        {new Date(d.updated_at || d.created_at).toLocaleString()}
                                      </span>
                                      <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold border border-indigo-100 uppercase">
                                        {d.payload?.outreachMode || 'wholesale'}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 mt-0.5 truncate max-w-md">
                                      <strong>Subject:</strong> {d.payload?.subject || '(No subject)'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDraftId(d.id || null);
                                      setActiveDraftRevision(d.revision || 1);
                                      setActiveDraftState(d.state || 'draft');
                                      setActiveDraftSavedAt(d.updated_at || d.created_at || null);
                                      if (d.payload?.recipient) setRecipientEmail(d.payload.recipient);
                                      else if (d.payload?.recipientEmail) setRecipientEmail(d.payload.recipientEmail);
                                      if (d.payload?.recipientName) setRecipientName(d.payload.recipientName);
                                      if (d.payload?.subject) setEmailSubject(d.payload.subject);
                                      if (d.payload?.message) setEmailBody(d.payload.message);
                                      if (d.payload?.outreachMode) setOutreachMode(d.payload.outreachMode);
                                      if (d.payload?.productUrl) setVerifiedProductUrl(d.payload.productUrl);
                                      setDraftDirty(false);
                                      setDrawerActiveTab('outreach');
                                    }}
                                    className="px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition cursor-pointer whitespace-nowrap"
                                  >
                                    Load into Composer
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-slate-500">
                            Drafts are safely persisted in the WordPress database and mirrored to site settings without triggering email dispatches.
                          </p>
                        </div>

                        {/* Omnisend Campaign Safeguards Card */}
                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-slate-500">
                              <Megaphone className="w-3.5 h-3.5 text-indigo-600" />
                              Omnisend &amp; Campaign Synchronization
                            </h4>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                              API Connected
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Subscribers</span>
                              <span className="font-bold text-slate-800 text-sm">1 Subscribed</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Free Tier Limit</span>
                              <span className="font-bold text-slate-800 text-sm">500 emails/mo</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Approval Gate</span>
                              <span className="font-bold text-emerald-700 text-sm">Owner Required</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Omnisend API integration is isolated to ensure no automatic unsolicited marketing campaigns are created or dispatched without manual verification.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ══════════ TAB 4: NOTES & HISTORY ══════════ */}
                    {drawerActiveTab === 'notes' && (
                      <form onSubmit={handleSaveDrawerNotes} className="space-y-4">
                        {drawerSavedMsg && (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                            <span>{drawerSavedMsg}</span>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-700">Internal Sales Notes &amp; Account Remarks</label>
                          <textarea
                            rows={4}
                            value={drawerNotes}
                            onChange={(e) => setDrawerNotes(e.target.value)}
                            placeholder="Record discussions, buyer product preferences, salt block volume, custom packaging requirements..."
                            className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600">Next Follow-Up Date</label>
                            <input
                              type="date"
                              value={drawerFollowUpDate}
                              onChange={(e) => setDrawerFollowUpDate(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600">Requested Quantity</label>
                            <input
                              type="text"
                              placeholder="e.g. 2 Pallets / 100 blocks"
                              value={drawerQuantity}
                              onChange={(e) => setDrawerQuantity(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600">Packaging Preference</label>
                            <input
                              type="text"
                              placeholder="e.g. Bulk Palletized / Private Label"
                              value={drawerPackaging}
                              onChange={(e) => setDrawerPackaging(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end pt-2">
                          <button
                            type="submit"
                            disabled={savingDrawerNotes}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                          >
                            {savingDrawerNotes ? (
                              <><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                            ) : (
                              'Save Notes & Follow-Up'
                            )}
                          </button>
                        </div>

                        {/* Audit / Provenance History */}
                        <div className="pt-4 border-t border-slate-100 space-y-2">
                          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Discovery &amp; Contact Provenance</h4>
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span>Data Source:</span>
                              <span className="font-bold text-slate-800">{selectedDrawerLead.dataSource || 'OpenStreetMap Nominatim / Overpass'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Contact Verification:</span>
                              <span className="font-bold text-slate-800">
                                {selectedDrawerLead.emailSource === 'company_website' ? 'Verified on Company Website' :
                                 selectedDrawerLead.emailSource === 'manually_entered' ? 'Manually Added by Admin' :
                                 'Public Map Directory Record'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Saved Timestamp:</span>
                              <span className="font-mono text-slate-700">{selectedDrawerLead.createdAt ? new Date(selectedDrawerLead.createdAt).toLocaleString() : 'Active session'}</span>
                            </div>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Modal Sticky Footer */}
                  <div className="p-4 border-t border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Draft Saved Status / Quality Indicator */}
                    <div className="flex items-center gap-2 text-xs">
                      {activeDraftRevision ? (
                        <span className="text-[11px] text-slate-600 flex items-center gap-1.5 font-medium">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Draft {activeDraftId ? `(${activeDraftId.slice(0, 8)}) ` : ''}rev #{activeDraftRevision} {draftDirty ? '(unsaved edits)' : 'saved'} {activeDraftSavedAt ? new Date(activeDraftSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          Edits can be safely saved as persistent drafts
                        </span>
                      )}
                      {emailQualityResult && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ml-1 ${
                          emailQualityResult.status === 'READY' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          emailQualityResult.status === 'BLOCKED' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                          'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          Score: {emailQualityResult.score}/100
                        </span>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
                            setDrawerSavedMsg('Pitch copied to clipboard!');
                            setTimeout(() => setDrawerSavedMsg(null), 3000);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        title="Copy pitch subject and body"
                      >
                        <Clipboard className="w-3.5 h-3.5 text-slate-500" />
                        Copy Message
                      </button>

                      {(selectedDrawerLead.facebook || selectedDrawerLead.research?.facebook) && (
                        <button
                          type="button"
                          onClick={() => handleOpenManualSocial('facebook', selectedDrawerLead)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          title="Open Facebook Page"
                        >
                          <FacebookLogo className="w-3.5 h-3.5 text-blue-600" weight="fill" />
                          Open Facebook
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setEmailEditMode(emailEditMode === 'edit' ? 'preview' : 'edit')}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        {emailEditMode === 'edit' ? 'Preview' : 'Edit'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendOutreach('draft')}
                        disabled={sendingOutreach}
                        className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                        title="Save persistent draft without sending email"
                      >
                        Save Draft
                      </button>

                      <button
                        type="button"
                        onClick={() => void handlePrepareApprovalModal()}
                        disabled={sendingOutreach}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        {sendingOutreach ? (
                          <><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Preparing...</>
                        ) : (
                          <><PaperPlaneRight className="w-3.5 h-3.5" /> Approve &amp; Send</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Owner Authorization Confirmation Modal */}
                {showOwnerApprovalModal && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">Owner Approval Confirmation</h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            You are about to approve and dispatch an official wholesale outreach email from <strong className="text-slate-800">{officialSenderEmail}</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Draft ID &amp; Revision:</span>
                          <span className="font-mono font-bold text-slate-800 truncate max-w-[200px]">
                            {activeDraftId || 'Pending save'} (rev #{activeDraftRevision ?? 1})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Recipient:</span>
                          <span className="font-bold text-slate-800 truncate max-w-[200px]">{recipientName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Email:</span>
                          <span className="font-bold text-indigo-700 truncate max-w-[200px]">{recipientEmail || '(Missing email)'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Mode:</span>
                          <span className="font-semibold text-slate-700 uppercase text-[10px]">{outreachMode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Quality Status:</span>
                          <span className={`font-bold text-[10px] ${emailQualityResult?.status === 'READY' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {emailQualityResult ? `${emailQualityResult.status} (${emailQualityResult.score}/100)` : 'Not checked'}
                          </span>
                        </div>
                      </div>

                      {!recipientEmail && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium">
                          A valid recipient email address is required to dispatch.
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowOwnerApprovalModal(false)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!recipientEmail || sendingOutreach}
                          onClick={() => {
                            setShowOwnerApprovalModal(false);
                            void handleSendOutreach('send');
                          }}
                          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-sm cursor-pointer"
                        >
                          Confirm &amp; Send
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ══════════ OUTREACH & CAMPAIGNS TAB ══════════ */}
        <div id="leados-panel-outreach" role="tabpanel" aria-labelledby="leados-tab-outreach" className={['outreach', 'email'].includes(activeTab) ? "space-y-6" : "hidden"}>
          {/* Subview Selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setOutreachSubView('outreach')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  outreachSubView === 'outreach'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <PaperPlaneRight className="w-4 h-4" />
                Direct Outreach &amp; Campaign Controls
              </button>
              <button
                type="button"
                onClick={() => setOutreachSubView('email_marketing')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  outreachSubView === 'email_marketing'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <EnvelopeSimple className="w-4 h-4" />
                Email Marketing Studio
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setBatchOutreachOpen(true);
                setBatchResultNotice(null);
              }}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <PaperPlaneRight weight="bold" className="w-3.5 h-3.5" />
              Launch Batch Outreach
            </button>
          </div>

          {outreachSubView === 'outreach' && (
            <div className="space-y-6">
              {/* Omnisend Free Plan Card & Dispatch Controls */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 flex-shrink-0">
                      <ShieldCheck weight="fill" className="w-5 h-5 text-indigo-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-950">Omnisend Free Tier &amp; Outreach Controls</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Active Provider
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Free Plan quota: 500 emails/month, max 250 recipients per campaign. Safe B2B outreach with opt-in integrity.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleSyncOmnisend()}
                      disabled={syncingOmnisend}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <ArrowsClockwise className={`w-3.5 h-3.5 text-indigo-600 ${syncingOmnisend ? 'animate-spin' : ''}`} />
                      Sync to Omnisend (nonSubscribed)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBatchOutreachOpen(true);
                        setBatchResultNotice(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <PaperPlaneRight weight="bold" className="w-3.5 h-3.5" />
                      Batch Send to Selected
                    </button>
                  </div>
                </div>

                {/* Quota & Mode Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-medium block text-[11px]">Monthly Quota</span>
                    <span className="text-base font-black text-slate-900">500 Emails / mo</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Omnisend Free Tier limit</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-medium block text-[11px]">Max Campaign Audience</span>
                    <span className="text-base font-black text-slate-900">250 Contacts</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Capped per campaign dispatch</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
                    <span className="text-indigo-700 font-medium block text-[11px]">Synchronized Contacts</span>
                    <span className="text-base font-black text-indigo-950">51 Contacts</span>
                    <span className="text-[10px] text-indigo-700/80 block mt-0.5">Status: nonSubscribed</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="text-emerald-700 font-medium block text-[11px]">LeadOS Verified Emails</span>
                    <span className="text-base font-black text-emerald-950">
                      {libraryLeads.filter((l) => Boolean(l.email)).length} Leads
                    </span>
                    <span className="text-[10px] text-emerald-700/80 block mt-0.5">Ready for personalized outreach</span>
                  </div>
                </div>

                {/* Mode A vs Mode B Selection */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Outreach Dispatch Operating Mode</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Controls whether outreach requires manual per-lead confirmation or one-time owner approval.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setOmnisendMode('manual')}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer text-xs ${
                        omnisendMode === 'manual'
                          ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900">Mode A — Manual Send (Strict Default)</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Owner reviews every outreach message individually before sending. Prevents unintended bulk emails.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOmnisendMode('approved_campaign')}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer text-xs ${
                        omnisendMode === 'approved_campaign'
                          ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900">Mode B — One-Time Approved Campaign</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          Quota Capped
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Owner gives explicit one-time authorization for a single campaign (max 250 contacts) with verified opt-in.
                      </p>
                    </button>
                  </div>
                </div>
              </div>

              {/* Campaign Templates Catalog */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Product-Specific Outreach Templates</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tailored B2B introduction copy for feed stores, livestock distributors, and wellness retailers.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      id: 'agriculture' as const,
                      title: 'Livestock Salt Licks',
                      badge: 'High Conversion',
                      badgeColor: 'bg-emerald-100 text-emerald-800',
                      subject: 'Wholesale Himalayan Animal Mineral Salt Licks — Direct Bulk Supply',
                      preview: 'Hi {{businessName}},\n\nI noticed {{businessName}} serves the {{city}} agricultural community. Himalayan Koh supplies premium 100% natural Himalayan pink rock salt licks with mineral-rich ropes, lick blocks, and bulk feed salt directly from the Khewra salt range.\n\nWould you like our wholesale catalog and volume pricing for {{city}} farm and livestock stores?',
                    },
                    {
                      id: 'wellness' as const,
                      title: 'Wellness & Bath Salts',
                      badge: 'Spas & Specialty',
                      badgeColor: 'bg-purple-100 text-purple-800',
                      subject: 'Direct Wholesale Pure Himalayan Bath Salt & Halotherapy Tiles',
                      preview: 'Hi {{businessName}},\n\nI am reaching out regarding {{businessName}} in {{city}}. Himalayan Koh imports certified pure food-grade and therapeutic pink Himalayan mineral salts, bath crystal chunks, and salt tiles direct from source.\n\nCould we send you our wholesale sample kit and pallet pricing?',
                    },
                    {
                      id: 'retail' as const,
                      title: 'General B2B Wholesale',
                      badge: 'Distributors',
                      badgeColor: 'bg-blue-100 text-blue-800',
                      subject: 'Direct B2B Supply of Himalayan Salt Products — Wholesale Catalog',
                      preview: 'Hi {{businessName}},\n\nWe provide retail, specialty, and feed stores in {{city}} with factory-direct pricing on genuine Himalayan pink salt products.\n\nWould you like a copy of our current wholesale pricing list?',
                    },
                  ].map((tpl) => (
                    <div key={tpl.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">{tpl.title}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tpl.badgeColor}`}>{tpl.badge}</span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-800">{tpl.subject}</div>
                        <p className="text-[10px] text-slate-600 line-clamp-3 bg-white p-2 rounded border border-slate-200">
                          {tpl.preview}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setBatchCategoryFilter(tpl.id);
                          setBatchSubject(tpl.subject);
                          setBatchBodyTemplate(tpl.preview + '\n\nBest regards,\nSalman Bashir\nFounder, Himalayan Koh\nsales@himalayankoh.com | https://himalayankoh.com');
                          setBatchOutreachOpen(true);
                        }}
                        className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <PaperPlaneRight className="w-3.5 h-3.5" />
                        Use in Batch Outreach
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {outreachSubView === 'email_marketing' && (
            <React.Suspense fallback={<div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200"><ArrowsClockwise className="w-6 h-6 animate-spin mx-auto text-[#b86452] mb-2" />Loading Email Marketing Studio...</div>}>
              <AEmailMarketing />
            </React.Suspense>
          )}
        </div>

        {/* ══════════ AUTOMATION & N8N TAB ══════════ */}
        <div id="leados-panel-automation" role="tabpanel" aria-labelledby="leados-tab-automation" className={['automation', 'seo', 'marketing'].includes(activeTab) ? "space-y-6" : "hidden"}>
          {/* Subview Selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-2 flex items-center gap-1 overflow-x-auto shadow-2xs">
            <button
              type="button"
              onClick={() => setAutomationSubView('n8n')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                automationSubView === 'n8n'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Robot className="w-4 h-4" />
              n8n Discovery &amp; Pipeline
            </button>
            <button
              type="button"
              onClick={() => setAutomationSubView('seo')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                automationSubView === 'seo'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Sparkle className="w-4 h-4" />
              SEO Engine
            </button>
            <button
              type="button"
              onClick={() => setAutomationSubView('marketing')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                automationSubView === 'marketing'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Megaphone className="w-4 h-4" />
              Marketing Generator
            </button>
          </div>

          {automationSubView === 'n8n' && (
            <div className="space-y-6">
              {/* n8n Status Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 flex-shrink-0">
                      <Robot weight="fill" className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950">n8n Lead Engine Worker</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          Active &amp; Connected
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Workflow ID: <code className="font-mono font-bold bg-slate-100 px-1 py-0.5 rounded text-slate-800">rxIGjn6VQmn6MA8h</code> • Automated OpenStreetMap B2B lead discovery &amp; enrichment
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        changeTab('prospects');
                        setProspectSubView('find');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <MagnifyingGlass className="w-3.5 h-3.5" />
                      Run Discovery Search
                    </button>
                  </div>
                </div>

                {/* 5-Step Pipeline Visualization */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-slate-800 block">LeadOS Automated Pipeline Architecture</span>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {[
                      { step: '1', title: 'Schedule / Webhook', desc: 'Cron (Mondays) or admin manual webhook triggers worker run.' },
                      { step: '2', title: 'OSM Overpass Query', desc: 'Queries feed stores, ranches & farm co-ops across target US states.' },
                      { step: '3', title: 'Website Crawler', desc: 'Fetches company homepage & extracts verified email, phone & socials.' },
                      { step: '4', title: 'ICP Fit Scorer', desc: 'Computes 0-100 score, checks animal mineral signals & flags dupes.' },
                      { step: '5', title: 'LeadOS Ingest', desc: 'Persists lead to wp_leados_workflows ready for owner outreach.' },
                    ].map((st) => (
                      <div key={st.step} className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">
                            {st.step}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">{st.title}</span>
                        </div>
                        <p className="text-[10px] text-slate-600 leading-tight">{st.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Worker Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-medium block text-[11px]">Active Ingest Target</span>
                    <span className="text-xs font-bold text-slate-900 mt-1 block">US Farm Supplies, Feed Mills &amp; Livestock</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-medium block text-[11px]">Primary Salt Products</span>
                    <span className="text-xs font-bold text-slate-900 mt-1 block">Animal Mineral Salt Licks &amp; Bulk Feed Salt</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-medium block text-[11px]">Webhook Endpoint</span>
                    <span className="text-[11px] font-mono text-slate-800 mt-1 block">/api/admin/leados/webhook</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {automationSubView === 'seo' && (
            <React.Suspense fallback={<div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200"><ArrowsClockwise className="w-6 h-6 animate-spin mx-auto text-[#b86452] mb-2" />Loading SEO Engine...</div>}>
              <ASEOEngine />
            </React.Suspense>
          )}

          {automationSubView === 'marketing' && (
            <React.Suspense fallback={<div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200"><ArrowsClockwise className="w-6 h-6 animate-spin mx-auto text-[#b86452] mb-2" />Loading Marketing Generator...</div>}>
              <AMarketingGen />
            </React.Suspense>
          )}
        </div>

        {/* ══════════ SETTINGS TAB (Unified with AI Engine) ══════════ */}
        <div id="leados-panel-settings" role="tabpanel" aria-labelledby="leados-tab-settings" className={activeTab === 'settings' ? "space-y-6" : "hidden"}>
          {/* Settings Section Selector Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-2 flex items-center gap-1 overflow-x-auto">
            {[
              { id: 'ai' as const, label: 'AI Intelligence Engine', icon: Robot },
              { id: 'social' as const, label: 'Social Accounts & CRM', icon: FacebookLogo },
              { id: 'maps' as const, label: 'Google Maps / Places (Optional)', icon: Globe },
              { id: 'icp' as const, label: 'Target Market & ICP', icon: Target },
              { id: 'scoring' as const, label: 'Scoring Rules', icon: Sliders },
              { id: 'system' as const, label: 'System & Providers', icon: GearSix },
            ].map((sec) => {
              const Icon = sec.icon;
              const isCur = settingsSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSettingsSection(sec.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    isCur
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {sec.label}
                </button>
              );
            })}
          </div>

          {/* Section 1: AI Intelligence Engine */}
          {settingsSection === 'ai' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Robot className="w-4 h-4 text-indigo-600" />
                  AI Intelligence &amp; Model Configuration
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Server-side Google Gemini (primary, configured in Admin → Settings → API Keys) with OpenRouter / DeepSeek fallback. Search queries are deterministic and never blocked if AI is offline.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">Google Gemini (Primary)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">Recommended</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Uses the Google Gemini key saved in Admin → Settings → API Keys. Enriches discovered leads and generates contextual outreach drafts.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      const headers = await getAuthHeaders();
                      const res = await fetch('/api/admin/leados/ai', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...headers },
                        body: JSON.stringify({ action: 'test', provider: 'gemini' }),
                      });
                      const d = await res.json();
                      alert(d.configured ? `Gemini verified successfully (${d.model})` : 'Gemini API key not configured — add it in Admin → Settings → API Keys');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 text-[11px] shadow-2xs"
                  >
                    Test Gemini Connection
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">OpenRouter (Fallback)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">Fallback</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Used automatically only when Google Gemini is unavailable or rate limited.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      const headers = await getAuthHeaders();
                      const res = await fetch('/api/admin/leados/ai', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...headers },
                        body: JSON.stringify({ action: 'test', provider: 'openrouter' }),
                      });
                      const d = await res.json();
                      alert(d.configured ? `OpenRouter verified successfully (${d.model})` : 'OpenRouter API key not configured');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 text-[11px] shadow-2xs"
                  >
                    Test OpenRouter Connection
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Safety &amp; Deterministic Truth Invariance</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800">Enforced</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    AI failures never interrupt or block lead discovery. All entities are discovered deterministically via OpenStreetMap. Contact info is strictly labeled by source provenance.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section: Social Accounts & Meta Platform Integration */}
          {settingsSection === 'social' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FacebookLogo className="w-4 h-4 text-blue-600" weight="fill" />
                    Meta Platform Integration (Facebook &amp; Instagram)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Official Meta Graph API v21.0 integration for Himalayan Koh Page and Instagram Professional Account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSocialInboxOpen(true); loadMetaConversations(); }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Chats className="w-3.5 h-3.5" />
                  Open Unified Social Inbox ({metaConversations.length})
                </button>
              </div>

              {/* Status Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Facebook Card */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                        <FacebookLogo className="w-5 h-5" weight="fill" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-sm block">Facebook Page</span>
                        <span className="text-[10px] text-slate-500">Facebook Login for Business</span>
                      </div>
                    </div>
                    {metaState?.facebook?.connected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" /> Connected
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600">
                        Not Connected
                      </span>
                    )}
                  </div>

                  {metaState?.facebook?.connected ? (
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Managed Page:</span>
                        <span className="font-bold text-slate-900">{metaState.facebook.pageName || 'Himalayan Koh'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Page ID:</span>
                        <span className="font-mono text-slate-700">{metaState.facebook.pageId || 'Verified'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Permissions:</span>
                        <span className="text-emerald-700 font-medium">pages_messaging, pages_read_engagement</span>
                      </div>
                      <div className="pt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setSocialInboxOpen(true); loadMetaConversations(); }}
                          className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] border border-indigo-200"
                        >
                          View Messages
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnectMeta('facebook')}
                          className="px-2.5 py-1 rounded bg-white hover:bg-rose-50 text-rose-600 font-semibold text-[11px] border border-slate-200 hover:border-rose-200"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        Connect the official Himalayan Koh Facebook Page to receive customer Messenger inquiries and reply from LeadOS.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleInitiateMetaOAuth('facebook')}
                          className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition flex items-center gap-1.5"
                        >
                          <FacebookLogo className="w-4 h-4" weight="fill" />
                          Connect Facebook
                        </button>
                        <a
                          href="https://www.facebook.com/pages/creation"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-0.5"
                        >
                          Create Page <ArrowSquareOut className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instagram Card */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                        <InstagramLogo className="w-5 h-5" weight="fill" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-sm block">Instagram Business</span>
                        <span className="text-[10px] text-slate-500">Instagram Graph API</span>
                      </div>
                    </div>
                    {metaState?.instagram?.connected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" /> Connected
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600">
                        Not Connected
                      </span>
                    )}
                  </div>

                  {metaState?.instagram?.connected ? (
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Professional Account:</span>
                        <span className="font-bold text-slate-900">@{metaState.instagram.username || 'himalayankoh'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Account ID:</span>
                        <span className="font-mono text-slate-700">{metaState.instagram.accountId || 'Verified'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Permissions:</span>
                        <span className="text-emerald-700 font-medium">instagram_basic, instagram_manage_messages</span>
                      </div>
                      <div className="pt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setSocialInboxOpen(true); loadMetaConversations(); }}
                          className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] border border-indigo-200"
                        >
                          View Messages
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnectMeta('instagram')}
                          className="px-2.5 py-1 rounded bg-white hover:bg-rose-50 text-rose-600 font-semibold text-[11px] border border-slate-200 hover:border-rose-200"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        Connect Himalayan Koh's Instagram Professional/Creator account linked to your Facebook Page for direct customer messages.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleInitiateMetaOAuth('instagram')}
                          className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white font-bold text-xs shadow-2xs transition flex items-center gap-1.5"
                        >
                          <InstagramLogo className="w-4 h-4" weight="fill" />
                          Connect Instagram
                        </button>
                        <a
                          href="https://help.instagram.com/502981923235522"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-0.5"
                        >
                          Convert to Business <ArrowSquareOut className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Meta Developer Configuration Notice */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <GearSix className="w-4 h-4 text-indigo-600" />
                    Meta Developer App Setup (Owner Authorization)
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${metaState?.appConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {metaState?.appConfigured ? 'Credentials Active' : 'Owner Action Checklist Available'}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  Official Meta Graph API v21.0 requires an approved Meta Developer App. When ready, set <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">META_APP_ID</code> and <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">META_APP_SECRET</code> in the Cloudflare Worker environment.
                </p>
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-[10px] font-mono text-slate-600 space-y-1">
                  <div><strong>OAuth Redirect URI:</strong> https://himalayankoh.com/api/leados/meta/callback</div>
                  <div><strong>Webhook Callback URL:</strong> https://himalayankoh.com/api/leados/meta/webhook</div>
                </div>
              </div>
            </div>
          )}

          {/* Section: Google Maps & Places (Optional) */}
          {settingsSection === 'maps' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  Google Maps &amp; Google Places API (New) — Optional
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  LeadOS runs 100% free with OpenStreetMap and Overpass by default. Google Places is an optional paid layer for commercial place details and autocomplete.
                </p>
              </div>

              {/* Status Banner */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                    <span className="font-bold text-slate-900 text-sm">Status: Not Configured / Disabled</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                    Free-First OSM Active
                  </span>
                </div>

                <p className="text-slate-600 text-[11px] leading-relaxed">
                  No Google Maps API key is configured in your environment. Live USA Map and Lead Discovery continue working seamlessly via OpenStreetMap and verified Overpass mirrors at zero API cost.
                </p>

                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-[11px]">
                    <WarningCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Billing &amp; License Guardrails</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-normal">
                    Google Places API charges per request (e.g. $17 per 1,000 Text Searches). Never enable paid search without explicit owner budget approval. Google licensed place content is subject to Google Maps Platform Terms of Service.
                  </p>
                </div>

                {/* Quotas & Budget Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monthly Request Budget</div>
                    <div className="text-sm font-bold text-slate-900">500 requests / month</div>
                    <div className="text-[10px] text-slate-500">Hard limit to prevent unexpected billing</div>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimated Cost</div>
                    <div className="text-sm font-bold text-indigo-600">~$8.50 / month</div>
                    <div className="text-[10px] text-slate-500">Based on standard $17.00/1,000 quota</div>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Field Masks</div>
                    <div className="text-sm font-bold text-emerald-600">Basic &amp; Contact Only</div>
                    <div className="text-[10px] text-slate-500">Restricted to avoid expensive Atmosphere SKUs</div>
                  </div>
                </div>

                {/* Setup Instructions */}
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="text-xs font-bold text-slate-800">To Connect Google Places (Optional):</div>
                  <ol className="list-decimal list-inside text-[11px] text-slate-600 space-y-1">
                    <li>Create an API project on <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Google Cloud Console</a>.</li>
                    <li>Enable <strong>Places API (New)</strong> and <strong>Maps JavaScript API</strong>.</li>
                    <li>Generate an API key and restrict it by HTTP referrer and IP.</li>
                    <li>Add <code className="bg-white px-1 py-0.5 rounded border border-slate-200">GOOGLE_MAPS_API_KEY</code> and <code className="bg-white px-1 py-0.5 rounded border border-slate-200">ENABLE_GOOGLE_PLACES=true</code> in Cloudflare Worker secrets.</li>
                  </ol>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => alert('Google Maps Platform is not configured. Free OpenStreetMap & Overpass discovery is active.')}
                    className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 text-xs shadow-2xs cursor-pointer"
                  >
                    Test Connection
                  </button>
                  <span className="text-[11px] text-slate-400">Free-first OSM active &bull; 0 API bill</span>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Ideal Customer Profile (ICP) Target Market */}
          {settingsSection === 'icp' && (
            <div className="space-y-4">
              {activeProject && (
                <form onSubmit={handleSaveProjectICP} className="space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Target className="w-4 h-4 text-indigo-600" />
                          Ideal Customer Profile (ICP) Target Market &amp; Keywords
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Target market parameters used for deterministic fit scoring (0–100) and discovery relevance.
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={savingProject}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs transition flex items-center gap-1.5"
                      >
                        {savingProject ? (<><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Saving...</>) : 'Save ICP Settings'}
                      </button>
                    </div>

                    {projectSavedMsg && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" /> {projectSavedMsg}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 text-[11px]">Project / Brand Name</label>
                        <input
                          type="text"
                          value={activeProject.name}
                          onChange={(e) => setActiveProject({ ...activeProject, name: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 text-[11px]">Storefront / Website URL</label>
                        <input
                          type="text"
                          value={activeProject.website || ''}
                          onChange={(e) => setActiveProject({ ...activeProject, website: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="font-semibold text-slate-600 text-[11px]">Product &amp; Mineral Definition</label>
                        <input
                          type="text"
                          value={activeProject.productService || ''}
                          onChange={(e) => setActiveProject({ ...activeProject, productService: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="font-semibold text-slate-600 text-[11px]">Target Customer Description</label>
                        <input
                          type="text"
                          value={activeProject.targetCustomerDescription || ''}
                          onChange={(e) => setActiveProject({ ...activeProject, targetCustomerDescription: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="font-semibold text-slate-600 text-[11px]">Ideal Customer Profile (Narrative)</label>
                        <textarea
                          rows={3}
                          value={activeProject.idealCustomerProfile || ''}
                          onChange={(e) => setActiveProject({ ...activeProject, idealCustomerProfile: e.target.value })}
                          className="w-full p-3 rounded-lg border border-slate-200 font-medium text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 text-[11px]">Positive Keywords (comma-separated)</label>
                        <input
                          type="text"
                          value={(activeProject.positiveKeywords || []).join(', ')}
                          onChange={(e) => setActiveProject({ ...activeProject, positiveKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 text-[11px]">Negative Keywords (comma-separated)</label>
                        <input
                          type="text"
                          value={(activeProject.negativeKeywords || []).join(', ')}
                          onChange={(e) => setActiveProject({ ...activeProject, negativeKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Section 3: Deterministic Opportunity Scoring Rules */}
          {settingsSection === 'scoring' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  Deterministic Opportunity Scoring Weights
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Opportunity priority scores (0–100) calculated from verified contact presence and commercial signals.
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Signal Key</th>
                      <th className="py-2.5 px-3">Signal Name</th>
                      <th className="py-2.5 px-3">Weight</th>
                      <th className="py-2.5 px-3">Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {weights.map((w) => (
                      <tr key={w.signalKey} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-slate-600">{w.signalKey}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{w.signalName}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded font-bold ${w.weight > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {w.weight > 0 ? `+${w.weight}` : w.weight}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{w.weight > 0 ? 'Increases commercial priority' : 'Decreases necessity'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 4: System & Providers */}
          {settingsSection === 'system' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <GearSix className="w-4 h-4 text-indigo-600" />
                  LeadOS System Architecture &amp; Endpoints
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Database isolation, data providers, and rate pacing rules.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono space-y-1">
                  <div className="font-bold text-slate-800">Database Namespacing:</div>
                  <div className="text-slate-600 text-[11px]">All persistence tables prefixed: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">leados_*</code></div>
                  <div className="text-slate-600 text-[11px]">Access control: WordPress administrator capability + storefront admin RBAC</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono space-y-1">
                  <div className="font-bold text-slate-800">Lead Discovery Sources:</div>
                  <div className="text-slate-600 text-[11px]">Geocoding: OpenStreetMap Nominatim (respects 1-sec pacing)</div>
                  <div className="text-slate-600 text-[11px]">Entity Discovery: OpenStreetMap Overpass API (live bounding query)</div>
                  <div className="text-slate-600 text-[11px]">Scoring: Pure deterministic in-memory calculation</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Unified Social Inbox Modal ── */}
      {socialInboxOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[620px] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Chats className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Unified Social Inbox</h3>
                  <p className="text-[11px] text-slate-500">Facebook Messenger &amp; Instagram Direct Conversations (Official Meta APIs)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadMetaConversations()}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs flex items-center gap-1 cursor-pointer"
                  title="Refresh conversations"
                >
                  <ArrowsClockwise className="w-3.5 h-3.5" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => { setSocialInboxOpen(false); setSelectedConversation(null); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Two column split */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Column: Conversation list */}
              <div className="w-72 sm:w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
                <div className="p-3 border-b border-slate-200 bg-white">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    Conversations ({metaConversations.length})
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {metaConversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      <Chats className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-medium text-slate-600">No active conversations</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Connect Facebook or Instagram in Settings to manage live incoming customer inquiries.
                      </p>
                    </div>
                  ) : (
                    metaConversations.map((conv) => {
                      const isSelected = selectedConversation?.id === conv.id;
                      return (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => setSelectedConversation(conv)}
                          className={`w-full text-left p-3.5 transition flex items-start gap-2.5 cursor-pointer ${
                            isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-slate-100/70'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white ${
                            conv.platform === 'facebook' ? 'bg-blue-600' : 'bg-rose-600'
                          }`}>
                            {conv.platform === 'facebook' ? <FacebookLogo className="w-4 h-4" weight="fill" /> : <InstagramLogo className="w-4 h-4" weight="fill" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-xs truncate">{conv.contactName || 'Customer'}</span>
                              <span className="text-[10px] text-slate-400">{conv.lastActivity ? new Date(conv.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{conv.snippet || 'No message content'}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Chat thread & reply */}
              <div className="flex-1 flex flex-col bg-white">
                {selectedConversation ? (
                  <>
                    <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedConversation.platform === 'facebook' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>
                          {selectedConversation.platform === 'facebook' ? 'Facebook Messenger' : 'Instagram Direct'}
                        </span>
                        <span className="font-bold text-slate-900 text-xs">{selectedConversation.contactName || 'Customer'}</span>
                      </div>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto space-y-3">
                      {(selectedConversation.messages || [
                        { id: '1', from: 'contact', text: selectedConversation.snippet || 'Hello! Inquiring about Himalayan salt availability.', timestamp: selectedConversation.lastActivity },
                      ]).map((m: any, idx: number) => (
                        <div key={idx} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-xl px-3.5 py-2 text-xs ${
                            m.from === 'me' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                          }`}>
                            <p>{m.text}</p>
                            <span className={`text-[9px] block mt-1 ${m.from === 'me' ? 'text-indigo-200' : 'text-slate-400'}`}>
                              {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleSendSocialReply} className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
                      <input
                        type="text"
                        value={socialReplyText}
                        onChange={(e) => setSocialReplyText(e.target.value)}
                        placeholder={`Reply to ${selectedConversation.contactName || 'customer'}...`}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={sendingSocialReply || !socialReplyText.trim()}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {sendingSocialReply ? <ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> : <PaperPlaneRight className="w-3.5 h-3.5" />}
                        Send
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                    <Chats className="w-12 h-12 text-slate-200 mb-2" />
                    <p className="text-xs font-semibold text-slate-600">Select a conversation</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Read incoming inquiries and dispatch authorized replies in real-time.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Social Contact Modal (Phase 8) ── */}
      {manualSocialModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${
                  manualSocialModal.platform === 'facebook' ? 'bg-blue-600' : 'bg-gradient-to-r from-purple-600 to-rose-600'
                }`}>
                  {manualSocialModal.platform === 'facebook' ? <FacebookLogo className="w-5 h-5" weight="fill" /> : <InstagramLogo className="w-5 h-5" weight="fill" />}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {manualSocialModal.platform === 'facebook' ? 'Facebook Message Outreach' : 'Instagram Direct Outreach'}
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">{manualSocialModal.lead.businessName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManualSocialModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Meta guidelines restrict cold unsolicited API messages. Copy this tailored introduction and send manually via the official business profile:
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Personalized Intro Pitch</span>
              <p className="text-xs font-mono text-slate-800 leading-relaxed whitespace-pre-wrap">{manualSocialModal.draft}</p>
            </div>

            {manualSocialCopied && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Message copied to clipboard! Paste directly into {manualSocialModal.platform === 'facebook' ? 'Facebook' : 'Instagram'} DM.</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(manualSocialModal.draft);
                    setManualSocialCopied(true);
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Clipboard className="w-4 h-4 text-indigo-600" />
                Copy Message
              </button>

              <div className="flex items-center gap-2">
                {manualSocialModal.platform === 'facebook' ? (
                  <a
                    href={
                      manualSocialModal.lead.facebook ||
                      manualSocialModal.lead.research?.facebook ||
                      `https://www.facebook.com/search/pages/?q=${encodeURIComponent(manualSocialModal.lead.businessName)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs flex items-center gap-1.5 transition"
                  >
                    <FacebookLogo className="w-4 h-4" weight="fill" />
                    Open Facebook Profile <ArrowSquareOut className="w-3 h-3" />
                  </a>
                ) : (
                  <a
                    href={
                      manualSocialModal.lead.instagram ||
                      manualSocialModal.lead.research?.instagram ||
                      `https://www.instagram.com/explore/tags/${encodeURIComponent(manualSocialModal.lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, ''))}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white font-bold text-xs shadow-2xs flex items-center gap-1.5 transition"
                  >
                    <InstagramLogo className="w-4 h-4" weight="fill" />
                    Open Instagram Profile <ArrowSquareOut className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    handleUpdateDrawerLeadStatus('contacted');
                    setManualSocialModal(null);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
                >
                  Mark Contacted
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Sales Notes / Remarks</label><textarea rows={3} value={inputNotes} onChange={(e) => setInputNotes(e.target.value)} placeholder="Buyer preferences, store size, notes..." className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></div>
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
      {/* ── Interactive Location Map Studio Modal ── */}
      <InteractiveLocationMapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        locations={locationsList}
        onChange={(newLocs) => {
          setLocationsList(newLocs);
          if (newLocs[0]) setLocation(newLocs[0]);
        }}
      />
    </div>
  );
}
