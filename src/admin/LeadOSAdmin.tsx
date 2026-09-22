'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  User,
  House,
} from '@phosphor-icons/react';
import { getAccessToken } from '@/services/wordpressAdminAuth';
import type {
  ScoredLead,
  LeadOSProject,
  SavedLeadRecord,
  SearchDiagnostics,
} from '@/lib/leados/types';
import { parseLeadOSUrlState } from '@/lib/leados/urlState';

type TabType = 'overview' | 'find' | 'library' | 'projects' | 'research' | 'scoring' | 'outreach' | 'ai' | 'settings';


const PRESET_CATEGORIES = [
  { label: 'Feed Store (Livestock & animal feed)', value: 'Feed Store' },
  { label: 'Farm Supply (Agrarian & farm cooperatives)', value: 'Farm Supply' },
  { label: 'Equestrian Store (Tack & equine stables)', value: 'Equestrian Store' },
  { label: 'Supermarket (Gourmet & organic grocery)', value: 'Supermarket' },
  { label: 'Veterinary (Animal health clinics)', value: 'Veterinary' },
];

const PRESET_LOCATIONS = [
  'Houston, TX',
  'Fort Worth, TX',
  'San Antonio, TX',
  'Billings, MT',
  'Cheyenne, WY',
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

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'wholesale_licks',
    name: 'Wholesale Animal Mineral Salt Licks (Feed & Farm)',
    category: 'Feed Store / Farm Supply',
    subject: 'Direct Wholesale Himalayan Pink Salt Mineral Licks for {business_name}',
    body: `Hi Team at {business_name},

I came across your store in {city} while researching premier agricultural and animal feed retailers in the region.

At Himalayan Koh, we offer Himalayan salt products for livestock and equine use, including blocks and carved licks on ropes. Product details and availability can be shared for your review.

Why our farm store and feed mill partners love working with us:
• Himalayan salt products for livestock and equine customers.
• Wholesale information available on request.
• Product specifications and current availability shared before any order.
• Sales support from the Himalayan Koh team.

Would you be open to reviewing our wholesale price sheet and receiving a complimentary sample pack for your store?

Best regards,

Salman Basco
Himalayan Koh Wholesale Team
sales@himalayankoh.com | (832) 224-6466
https://preview.himalayankoh.com`,
  },
  {
    id: 'equine_specialty',
    name: 'Equine & Tack Specialty (Round Salt Lick on Rope)',
    category: 'Equestrian Store',
    subject: 'Himalayan Rock Salt Licks on Rope for {business_name} Stables',
    body: `Hello {business_name} Team,

I am reaching out from Himalayan Koh regarding our signature equine salt block line.

Our carved Himalayan rock salt licks with hanging ropes are listed for equine and livestock use. We can share current product specifications and wholesale information for your review.

We supply tack shops and equestrian centers with:
• Carved round licks with hanging ropes.
• Retail and wholesale product information available on request.
• Current packaging, minimums, and availability confirmed before an order.

May I send you our quick dealer catalog and wholesale pricing for your equine customers?

Sincerely,

Himalayan Koh Equine Division
sales@himalayankoh.com | (832) 224-6466`,
  },
  {
    id: 'food_grocery',
    name: 'Bulk Food-Grade Pink Salt (Grocers & Co-ops)',
    category: 'Supermarket / Food Co-op',
    subject: 'Direct Import Himalayan Pink Salt Wholesale — {business_name}',
    body: `Hello,

We are a direct importer of food-grade Himalayan pink salt supplying organic grocery cooperatives, specialty spice retailers, and gourmet markets.

Our product offerings include:
• Fine and coarse grain culinary pink salt in 1 lb, 5 lb, and 25 lb bulk bags.
• Handcrafted Himalayan salt cooking plates and bowls.
• Product specifications and sourcing information available for review.

We would love to introduce Himalayan Koh to your shoppers in {city}. Can I share our wholesale tier pricing with you this week?

Warm regards,

Himalayan Koh Gourmet Line
Houston, TX
sales@himalayankoh.com`,
  },
  {
    id: 'commercial_distribution',
    name: 'Commercial Wholesale & Bulk Salt Supply',
    category: 'Commercial Distributor',
    subject: 'B2B Himalayan Salt Supply Partnership with {business_name}',
    body: `Hi {business_name},

I noticed your active presence as a trusted merchant in the agricultural and specialty retail space.

We speak with regional distributors and retailers about Himalayan salt products, including animal licks and culinary products. We can share current wholesale information and product specifications for review.

If you are expanding your catalog with high-velocity mineral products, let's connect for 10 minutes to discuss bulk wholesale margins.

Best regards,

Himalayan Koh B2B Wholesale
sales@himalayankoh.com | (832) 224-6466`,
  },
];

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

  // Find Leads state
  const [category, setCategory] = useState('Feed Store');
  const [customCategory, setCustomCategory] = useState('');
  const [location, setLocation] = useState('Houston, TX');
  const [researchRegion, setResearchRegion] = useState('Texas');
  const [maxResults, setMaxResults] = useState(15);
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [requirePhone, setRequirePhone] = useState(false);
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
  const [recipientEmailSource, setRecipientEmailSource] = useState<'discovered_osm' | 'manually_entered' | 'unverified'>('unverified');
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
    if (activeTab === 'library') {
      loadLibrary();
    }
  }, [activeTab, loadLibrary]);

  // Handle lead search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const effectiveCategory = category === 'custom' ? customCategory : category;
    if (!effectiveCategory.trim()) {
      setSearchError('Please select or specify a business category.');
      return;
    }
    if (!location.trim()) {
      setSearchError('Please enter a target city, region, or state.');
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchStep('1/3 Geocoding target market coordinates...');
    setLeads([]);
    setDiagnostics(null);

    try {
      const headers = await getAuthHeaders();
      setTimeout(() => setSearchStep('2/3 Querying OpenStreetMap Overpass API for verified entities...'), 700);
      setTimeout(() => setSearchStep('3/3 Normalizing records & calculating deterministic project fit...'), 1800);

      const res = await fetch('/api/admin/leados/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          category: effectiveCategory,
          location,
          projectId: selectedProjectId,
          maxResults,
          requireWebsite,
          requirePhone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to search leads');
      }

      setLeads(data.leads || []);
      setDiagnostics(data.diagnostics || null);
    } catch (err: any) {
      setSearchError(err.message || 'Error occurred during lead discovery');
    } finally {
      setSearching(false);
      setSearchStep('');
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
          provider: 'openrouter',
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
    { id: 'projects', label: 'Projects (ICP)', icon: Buildings },
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
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3">
            <House className="w-3 h-3" />
            <span>Admin</span>
            <span>/</span>
            <span className="text-slate-600 font-medium">LeadOS</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#26211c] flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#faf0eb] flex items-center justify-center">
                  <Target className="w-4.5 h-4.5 text-[#b86452]" />
                </div>
                LeadOS Intelligence
              </h1>
              <p className="text-sm text-[#6d6258] mt-1 max-w-xl">
                B2B Lead Discovery, ICP Opportunity Scoring, and Verified Prospect Library for Himalayan Koh.
              </p>
              <p className="text-xs text-[#8d8276] mt-0.5">
                Find and connect with farm stores, feed suppliers, livestock businesses, mineral buyers, distributors, and other B2B prospects.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => { changeTab('find'); setCategory('Feed Store'); setLocation('Houston, TX'); }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#b86452] hover:bg-[#8d4133] text-white flex items-center gap-1.5 transition shadow-sm"
              >
                <MagnifyingGlass className="w-3.5 h-3.5" />
                Find New Leads
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#e0d6c8] text-[#26211c] hover:bg-[#faf7f1] flex items-center gap-1.5 transition"
              >
                <DownloadSimple className="w-3.5 h-3.5" />
                Export CSV
              </button>
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
        {activeTab === 'overview' && (
          <div id="leados-panel-overview" role="tabpanel" aria-labelledby="leados-tab-overview" className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
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
                  <button onClick={() => changeTab('projects')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 flex-shrink-0">
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
        )}

        {/* ══════════ FIND LEADS TAB ══════════ */}
        {activeTab === 'find' && (
          <div id="leados-panel-find" role="tabpanel" aria-labelledby="leados-tab-find" className="space-y-5">
            <form onSubmit={handleSearch} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Find Verified Business Leads</h3>
                  <p className="text-[11px] text-slate-500">Queries live OpenStreetMap & Overpass data. Real data only — never fabricated.</p>
                </div>
                <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-600">Business Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    {PRESET_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                    <option value="custom">+ Custom Category...</option>
                  </select>
                  {category === 'custom' && (
                    <input type="text" placeholder="e.g. Grain Elevator, Tack Shop" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500" />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-600">Target Location</label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input type="text" placeholder="e.g. Houston, TX or Montana" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PRESET_LOCATIONS.slice(0, 5).map((loc) => (
                      <button key={loc} type="button" onClick={() => setLocation(loc)} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition">{loc}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-600">Filters & Actions</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={requireWebsite} onChange={(e) => setRequireWebsite(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      Website
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={requirePhone} onChange={(e) => setRequirePhone(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      Phone
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} className="px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-700 bg-white">
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={40}>40</option>
                    </select>
                    <button type="submit" disabled={searching} className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 transition">
                      {searching ? (<><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Searching...</>) : (<><MagnifyingGlass className="w-3.5 h-3.5" /> Search</>)}
                    </button>
                  </div>
                </div>
              </div>

              {searchStep && (
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-800 flex items-center gap-2">
                  <ArrowsClockwise className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  {searchStep}
                </div>
              )}
              {searchError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800 flex items-center gap-2">
                  <WarningCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                  {searchError}
                </div>
              )}
            </form>

            {diagnostics && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-slate-700">
                  <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Search Diagnostics</span>
                  <span className="text-slate-400 font-mono">{diagnostics.responseTimeMs}ms</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-600">
                  <div><span className="text-slate-400">Location:</span> <span className="font-medium text-slate-800">{diagnostics.resolvedLocation || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Raw OSM:</span> <span className="font-medium text-slate-800">{diagnostics.rawResultsCount}</span></div>
                  <div><span className="text-slate-400">Duplicates:</span> <span className="font-medium text-slate-800">{diagnostics.duplicatesRemoved}</span></div>
                  <div><span className="text-slate-400">Scored:</span> <span className="font-medium text-slate-800">{diagnostics.normalizedCount}</span></div>
                </div>
              </div>
            )}

            {leads.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Discovered Prospects ({leads.length})</h3>
                  <span className="text-[11px] text-slate-400">Sorted by Project Fit & Opportunity Score</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {leads.map((lead, idx) => {
                    const oppScore = lead.opportunityScore ?? 0;
                    const isSaving = savingLeadId === lead.businessName;
                    return (
                      <div key={`${lead.businessName}-${idx}`} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 hover:shadow-sm transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-900 leading-snug">{lead.businessName}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{lead.category}</span>
                              <span className="text-[11px] text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {[lead.city, lead.region].filter(Boolean).join(', ') || 'Local'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <ScoreBadge score={oppScore} label="Priority" />
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded-lg text-[11px] space-y-1 border border-slate-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">Verified Facts</span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1"><Globe className="w-2.5 h-2.5" /> Source: {lead.dataSource === 'openstreetmap' ? 'OpenStreetMap' : lead.dataSource}</span>
                          </div>
                          {lead.address && <div className="flex items-center gap-1.5 text-slate-600"><MapPin className="w-3 h-3 text-slate-400" /> {lead.address}</div>}
                          {lead.phone && <div className="flex items-center gap-1.5 text-slate-700 font-medium"><Phone className="w-3 h-3 text-emerald-600" /> <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a></div>}
                          {lead.website && <div className="flex items-center gap-1.5 text-indigo-600"><Globe className="w-3 h-3" /> <a href={lead.website} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">{lead.website}</a></div>}
                        </div>

                        <EvidenceSummary evidence={lead.evidence} />

                        {lead.projectFit?.reasons && lead.projectFit.reasons.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">ICP Match Signals</span>
                            <ul className="text-[11px] text-slate-600 space-y-0.5">
                              {lead.projectFit.reasons.map((r, i) => (<li key={i} className="flex items-start gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5" /> {r}</li>))}
                            </ul>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          {lead.osmUrl && <a href={lead.osmUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1">OSM Map <ArrowSquareOut className="w-3 h-3" /></a>}
                          <div className="flex items-center gap-1.5 ml-auto">
                            <button onClick={() => handleAIAnalyze(lead)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 transition">
                              <Robot className="w-3 h-3 text-indigo-600" /> AI
                            </button>
                            <button onClick={() => handleSaveToLibrary(lead)} disabled={lead.alreadySaved || isSaving} className={`px-3 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition ${lead.alreadySaved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                              {lead.alreadySaved ? (<><CheckCircle className="w-3 h-3" /> Saved</>) : isSaving ? (<><ArrowsClockwise className="w-3 h-3 animate-spin" /> Saving...</>) : (<><Plus className="w-3 h-3" /> Save</>)}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Analysis Modal */}
            {analyzingLeadName && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Robot className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-slate-900 text-sm">AI Factual Assessment</h4>
                    </div>
                    <button type="button" aria-label="Close AI factual assessment" onClick={() => { setAnalyzingLeadName(null); setAiAnalysisResult(null); }} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
                  </div>
                  <div className="text-[11px] text-slate-500">Business: <span className="text-slate-900 font-bold">{analyzingLeadName}</span></div>
                  {!aiAnalysisResult && !aiError && (
                    <div className="py-8 text-center space-y-2">
                      <ArrowsClockwise className="w-5 h-5 animate-spin mx-auto text-indigo-600" />
                      <p className="text-[11px] text-slate-500">Querying server-side model...</p>
                    </div>
                  )}
                  {aiError && <div className="p-3 bg-red-50 text-red-800 rounded-lg text-[11px] flex items-center gap-2"><WarningCircle className="w-4 h-4 text-red-600" /> {aiError}</div>}
                  {aiAnalysisResult && (
                    <div className="space-y-3 text-[11px]">
                      <div className="p-3 bg-indigo-50 rounded-lg text-indigo-950 space-y-1">
                        <span className="font-bold">Summary:</span>
                        <p className="text-indigo-900">{aiAnalysisResult.analysis?.summary}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-400 font-medium block">Suitability:</span><span className="font-bold text-slate-800">{aiAnalysisResult.analysis?.potentialValue}</span></div>
                        <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-400 font-medium block">Confidence:</span><span className="font-bold text-slate-800 capitalize">{aiAnalysisResult.analysis?.confidence}</span></div>
                      </div>
                      {aiAnalysisResult.analysis?.opportunitySignals?.length > 0 && (
                        <div className="space-y-1">
                          <span className="font-bold text-slate-700">Signals:</span>
                          <ul className="space-y-1 text-slate-600">{aiAnalysisResult.analysis.opportunitySignals.map((s: string, i: number) => (<li key={i} className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-indigo-600" /> {s}</li>))}</ul>
                        </div>
                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => { setAnalyzingLeadName(null); setAiAnalysisResult(null); }} className="w-full py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition">Close</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ LEAD LIBRARY TAB ══════════ */}
        {activeTab === 'library' && (
          <div id="leados-panel-library" role="tabpanel" aria-labelledby="leados-tab-library" className="space-y-4">
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
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="disqualified">Disqualified</option>
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
                                <StatusPill status={l.emailSource === 'manually_entered' ? 'qualified' : 'new'} />
                              </div>
                            ) : (
                              <button onClick={() => handleOpenEmailModal(l)} className="text-indigo-600 hover:underline flex items-center gap-1 font-medium"><Plus className="w-3 h-3" /> Add</button>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {l.website ? <a href={l.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 max-w-[120px] truncate">{l.website.replace(/^https?:\/\//, '')} <ArrowSquareOut className="w-2.5 h-2.5" /></a> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2.5 px-3"><ScoreBadge score={l.opportunityScore ?? 0} label="Priority" /></td>
                          <td className="py-2.5 px-3">
                            <select value={l.status} onChange={(e) => handleUpdateLeadStatus(l.id, e.target.value)} className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-semibold bg-white focus:outline-none">
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="disqualified">Disqualified</option>
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
        )}

        {/* ══════════ PROJECTS (ICP) TAB ══════════ */}
        {activeTab === 'projects' && activeProject && (
          <form onSubmit={handleSaveProjectICP} className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Ideal Customer Profile (ICP) Configuration</h3>
                  <p className="text-[11px] text-slate-500">Configures target market rules for Project Fit scoring and outreach angles.</p>
                </div>
                <button type="submit" disabled={savingProject} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5">
                  {savingProject ? (<><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Saving...</>) : 'Save ICP'}
                </button>
              </div>
              {projectSavedMsg && <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" /> {projectSavedMsg}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-1"><label className="font-semibold text-slate-600">Project Name</label><input type="text" value={activeProject.name} onChange={(e) => setActiveProject({ ...activeProject, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium" /></div>
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

        {/* ══════════ RESEARCH TAB ══════════ */}
        {activeTab === 'research' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Multi-Category Market Research</h3>
              <p className="text-[11px] text-slate-500">Run continuous batch discovery across all target categories for a specific geographic market.</p>
            </div>
            <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 text-[11px] text-indigo-950">
              <span className="font-bold block mb-1.5">Automated Scan Categories:</span>
              <div className="flex flex-wrap gap-1">{['Feed Store', 'Farm Supply', 'Equestrian Store', 'Supermarket', 'Veterinary'].map((c) => (<span key={c} className="px-2 py-0.5 rounded bg-white font-medium text-slate-700 border border-indigo-200/70">{c}</span>))}</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" name="researchRegion" aria-label="Target research region" placeholder="Target Region (e.g. Texas, Montana, Kentucky)" value={researchRegion} onChange={(e) => setResearchRegion(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium" />
              <button type="button" onClick={() => { setLocation(researchRegion || 'Texas'); changeTab('find'); }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 shadow-sm transition">Launch Scan</button>
            </div>
          </div>
        )}

        {/* ══════════ SCORING RULES TAB ══════════ */}
        {activeTab === 'scoring' && (
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
        )}

        {/* ══════════ CLIENT OUTREACH TAB ══════════ */}
        {activeTab === 'outreach' && (
          <div className="space-y-4">
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
                <div><span className="font-bold block text-amber-950">Safety Mode Active [SIMULATION]</span><p className="mt-0.5 text-amber-800">Outbound emails on staging are logged to audit trail. No emails transmitted externally unless production API key is configured.</p></div>
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
                      {sendingOutreach ? (<><ArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Sending...</>) : (<><PaperPlaneRight className="w-3.5 h-3.5" /> Send Outreach</>)}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ AI ENGINE TAB ══════════ */}
        {activeTab === 'ai' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">AI Intelligence Configuration</h3>
              <p className="text-[11px] text-slate-500">Server-side DeepSeek and OpenRouter models enrich discovered leads on-demand.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between"><span className="font-bold text-slate-900">OpenRouter Integration</span><span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-800">Active</span></div>
                <p className="text-slate-600">Model: deepseek/deepseek-chat or custom configured LLM.</p>
                <button onClick={async () => { const headers = await getAuthHeaders(); const res = await fetch('/api/admin/leados/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action: 'test', provider: 'openrouter' }) }); const d = await res.json(); alert(d.configured ? `OpenRouter connection verified (${d.model})` : 'API key not configured'); }} className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100">Test Connection</button>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between"><span className="font-bold text-slate-900">Safety & Truth Invariance</span><span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-100 text-indigo-800">Enforced</span></div>
                <p className="text-slate-600">AI failures never block search. Leads always returned deterministically. Hallucinated metrics strictly prohibited.</p>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ SETTINGS TAB ══════════ */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">LeadOS System Settings</h3>
              <p className="text-[11px] text-slate-500">System architecture, isolated database tables, and provider endpoints.</p>
            </div>
            <div className="space-y-2 text-[11px]">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono space-y-0.5">
                <div className="font-bold text-slate-800">Database Namespacing:</div>
                <div className="text-slate-600">All tables prefixed: leados_*</div>
                <div className="text-slate-600">Row Level Security: Enabled</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono space-y-0.5">
                <div className="font-bold text-slate-800">Lead Data Sources:</div>
                <div className="text-slate-600">Geocoding: OpenStreetMap Nominatim</div>
                <div className="text-slate-600">Entity Discovery: OpenStreetMap Overpass API</div>
                <div className="text-slate-600">Scoring: In-Memory Deterministic</div>
              </div>
            </div>
          </div>
        )}
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
