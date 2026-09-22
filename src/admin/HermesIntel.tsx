// ============================================================================
// HIMALAYAN KOH — ADMIN AI INTELLIGENCE (Hermes / Salman OS / n8n Feeds)
//
// Displays research evidence ingested from Hermes, Salman OS, and n8n.
// This is a REVIEW & PLANNING surface, not an execution surface:
//   - Findings arrive as research evidence (status 'new').
//   - Himalayan Koh validates, reviews, scores, and decides.
//   - Acceptance changes the review state only — it never automatically modifies
//     WooCommerce products, pricing, inventory, live blogs, or settings.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp, Modal } from '../App';
import { getFreshAccessToken } from '../services/wordpressAdminAuth';
import { listProducts } from '../features/catalog/repository';
import type { CatalogProduct } from '../features/catalog/types';
import type { EvidenceRecord, EvidenceStatus } from '../lib/hermes/types';
import {
  Brain, Target, MagnifyingGlass, Lightbulb, TrendUp, Trash, Megaphone, List, Globe,
  CaretDown, CaretRight, ShieldCheck, NotePencil, Warning, ArrowSquareOut, CheckCircle,
  ArrowClockwise, Sparkle, Link as LinkIcon, Info
} from '@phosphor-icons/react';

const STATUS_BADGES: Record<EvidenceStatus, { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', label: 'New Finding' },
  reviewed: { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', label: 'Reviewed' },
  accepted: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', label: 'Accepted for Action' },
  dismissed: { bg: 'bg-gray-100 text-gray-600 border-gray-200', text: 'text-gray-600', label: 'Dismissed' },
};

const PRIORITY_BADGES: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-800 border-rose-200',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const SOURCE_COLORS: Record<string, string> = {
  hermes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'salman-os': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  n8n: 'bg-orange-50 text-orange-700 border-orange-200',
};

type TabId =
  | 'products'
  | 'seo'
  | 'free-marketing'
  | 'free-listings'
  | 'market'
  | 'marketing'
  | 'ads'
  | 'catalog-qa';

const TAB_CONFIG: { id: TabId; label: string; icon: React.ElementType; types: string[] }[] = [
  { id: 'products', label: 'Products', icon: Target, types: ['product', 'pricing_observation', 'competitor'] },
  { id: 'seo', label: 'SEO', icon: MagnifyingGlass, types: ['seo', 'content_gap', 'blog_topic'] },
  { id: 'free-marketing', label: 'Free Marketing', icon: Megaphone, types: ['free_marketing'] },
  { id: 'free-listings', label: 'Free Listings', icon: List, types: ['free_listing'] },
  { id: 'market', label: 'Market', icon: Globe, types: ['market', 'competitor'] },
  { id: 'marketing', label: 'Marketing', icon: Lightbulb, types: ['marketing'] },
  { id: 'ads', label: 'Ads', icon: TrendUp, types: ['ads'] },
  { id: 'catalog-qa', label: 'Catalog QA', icon: ShieldCheck, types: ['catalog_qa'] },
];

export default function HermesIntel() {
  const { notify } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('products');
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [countsByType, setCountsByType] = useState<Record<string, number>>({});
  const [countsByStatus, setCountsByStatus] = useState<Record<string, number>>({});
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNoteModalId, setReviewNoteModalId] = useState<string | null>(null);
  const [reviewNoteText, setReviewNoteText] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Deterministic Catalog QA Products state
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Fetch evidence from server
  const loadEvidence = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getFreshAccessToken();
      const currentTabDef = TAB_CONFIG.find((t) => t.id === activeTab);
      const typesQuery = currentTabDef ? currentTabDef.types.join(',') : 'all';

      const query = new URLSearchParams({
        type: typesQuery,
        status: selectedStatusFilter,
        limit: '150',
      });

      const res = await fetch(`/api/admin/ai-intelligence?${query.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setItems(data.items || []);
      setCountsByType(data.countsByType || {});
      setCountsByStatus(data.countsByStatus || {});
    } catch (err) {
      console.warn('Could not load AI intelligence evidence:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedStatusFilter]);

  // Load deterministic catalog for Catalog QA tab
  const loadCatalog = useCallback(async () => {
    if (activeTab !== 'catalog-qa') return;
    setCatalogLoading(true);
    try {
      const prods = await listProducts();
      setCatalogProducts(prods || []);
    } catch {
      setCatalogProducts([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Update Status handler
  const handleUpdateStatus = async (id: string, newStatus: EvidenceStatus, note?: string) => {
    setUpdatingId(id);
    try {
      const token = await getFreshAccessToken();
      const res = await fetch('/api/admin/ai-intelligence', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id,
          status: newStatus,
          review_note: note !== undefined ? note : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Update failed');
      }

      notify(`Research finding marked ${newStatus}`);
      await loadEvidence();
    } catch (err) {
      notify(`Could not update finding: ${(err as Error).message}`, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveNote = async () => {
    if (!reviewNoteModalId) return;
    const item = items.find((i) => i.id === reviewNoteModalId);
    if (!item) return;
    await handleUpdateStatus(reviewNoteModalId, item.status, reviewNoteText.trim());
    setReviewNoteModalId(null);
    setReviewNoteText('');
  };

  // Tab Badge count
  const getTabBadgeCount = (tab: (typeof TAB_CONFIG)[number]) => {
    return tab.types.reduce((acc, t) => acc + (countsByType[t] || 0), 0);
  };

  // Contextual link builder
  const renderContextualLink = (item: EvidenceRecord) => {
    if (item.type === 'seo' || item.type === 'content_gap') {
      return (
        <a
          href="/admin/seo"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-md transition-colors border border-rose-200"
        >
          <Sparkle size={12} weight="bold" />
          <span>Open SEO Engine</span>
          <ArrowSquareOut size={11} />
        </a>
      );
    }

    if (item.type === 'blog_topic') {
      return (
        <a
          href="/admin/blog"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors border border-amber-200"
        >
          <NotePencil size={12} weight="bold" />
          <span>Open Admin Blog</span>
          <ArrowSquareOut size={11} />
        </a>
      );
    }

    if (item.entity?.sku || item.entity?.slug) {
      const searchTarget = item.entity.sku || item.entity.slug;
      return (
        <a
          href={`/admin/products?search=${encodeURIComponent(searchTarget || '')}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md transition-colors border border-emerald-200"
        >
          <Target size={12} weight="bold" />
          <span>View Product ({item.entity.sku || item.entity.slug})</span>
          <ArrowSquareOut size={11} />
        </a>
      );
    }

    if (item.entity?.category_slug) {
      return (
        <a
          href="/admin/categories"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors border border-indigo-200"
        >
          <List size={12} weight="bold" />
          <span>View Category</span>
          <ArrowSquareOut size={11} />
        </a>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Readiness Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                <Brain size={22} weight="duotone" />
              </span>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">AI Intelligence & Research Center</h1>
            </div>
            <p className="text-xs text-gray-500 mt-1.5 max-w-2xl leading-relaxed">
              Research evidence and market intelligence ingested from <span className="font-semibold text-gray-700">Hermes</span>, <span className="font-semibold text-gray-700">Salman OS</span>, and <span className="font-semibold text-gray-700">n8n</span>.
              All items are strictly <span className="font-semibold text-emerald-700">Research Evidence</span> for owner review — AI has no automated write access to live WooCommerce products, orders, blog posts, or settings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span className="text-gray-600">Ingest: <code className="font-mono text-[11px] text-gray-900 font-semibold">POST /api/hermes/ingest</code></span>
            </div>
            <button
              onClick={() => void loadEvidence()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium transition-colors"
            >
              <ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Integration Status Chips */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">Active Adapters:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
            Hermes Ingest: Ready
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Salman OS: himalayan-koh bridge
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            n8n: Webhook-ready
          </span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TAB_CONFIG.map((t) => {
            const Icon = t.icon;
            const count = getTabBadgeCount(t);
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTab(t.id);
                  setExpandedId(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon size={15} weight={isActive ? 'bold' : 'regular'} />
                <span>{t.label}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-emerald-900 text-emerald-100' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 rounded-xl border border-gray-200 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">Status Filter:</span>
          <div className="flex gap-1">
            {(['all', 'new', 'reviewed', 'accepted', 'dismissed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  selectedStatusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                {s !== 'all' && countsByStatus[s] !== undefined && ` (${countsByStatus[s]})`}
              </button>
            ))}
          </div>
        </div>

        <div className="text-gray-400 text-[11px]">
          Showing <span className="font-semibold text-gray-700">{items.length}</span> research records
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
          <ArrowClockwise size={32} className="animate-spin mx-auto text-emerald-600 mb-3" />
          <p className="text-sm font-semibold text-gray-700">Loading AI research evidence…</p>
          <p className="text-xs text-gray-400 mt-1">Connecting to authenticated evidence store</p>
        </div>
      ) : activeTab === 'catalog-qa' ? (
        /* SPECIAL DEDICATED CATALOG QA VIEW (Findings + Deterministic Truth) */
        <div className="space-y-4">
          {/* Deterministic Storefront Truth Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Total Catalog</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{catalogProducts.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">WooCommerce Staging</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Customer-Visible</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {catalogProducts.filter((p) => p.status === 'ready' || p.commerceReadiness === 'COMMERCE_READY').length}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Published & Active</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Draft SKUs</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {catalogProducts.filter((p) => p.status === 'draft').length}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">HK-LFH-6lbs + Legacy</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">QA Findings</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{items.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Research observations</p>
            </div>
          </div>

          {/* Research Findings for Catalog QA */}
          {items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
              <ShieldCheck size={44} className="mx-auto text-emerald-400 mb-3" />
              <h3 className="font-semibold text-gray-800 text-sm">No Catalog QA issues detected</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                No duplicate SKUs, broken assets, soft 404s, or schema discrepancies have been reported by Hermes or n8n monitors.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <EvidenceCard
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onStatusChange={(status) => void handleUpdateStatus(item.id, status)}
                  onOpenNoteModal={() => {
                    setReviewNoteModalId(item.id);
                    setReviewNoteText(item.review_note || '');
                  }}
                  contextualLink={renderContextualLink(item)}
                  updating={updatingId === item.id}
                />
              ))}
            </div>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center text-gray-500">
          <Brain size={44} className="mx-auto text-gray-300 mb-3" />
          <h3 className="font-semibold text-gray-800 text-sm">No research evidence found for this tab</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
            When research evidence is ingested via <code className="text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded font-mono">POST /api/hermes/ingest</code>, it will appear here for review and qualification.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <EvidenceCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onStatusChange={(status) => void handleUpdateStatus(item.id, status)}
              onOpenNoteModal={() => {
                setReviewNoteModalId(item.id);
                setReviewNoteText(item.review_note || '');
              }}
              contextualLink={renderContextualLink(item)}
              updating={updatingId === item.id}
            />
          ))}
        </div>
      )}

      {/* Review Note Modal */}
      <Modal open={!!reviewNoteModalId} onClose={() => setReviewNoteModalId(null)} title="Review & Qualification Note">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Document your evaluation decision for this research finding. Notes are recorded for owner audits and team coordination.
          </p>
          <textarea
            value={reviewNoteText}
            onChange={(e) => setReviewNoteText(e.target.value)}
            rows={4}
            placeholder="Add qualification or action notes here..."
            className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setReviewNoteModalId(null)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSaveNote()}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold"
            >
              Save Note
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface EvidenceCardProps {
  item: EvidenceRecord;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (status: EvidenceStatus) => void;
  onOpenNoteModal: () => void;
  contextualLink: React.ReactNode;
  updating: boolean;
}

function EvidenceCard({
  item,
  expanded,
  onToggleExpand,
  onStatusChange,
  onOpenNoteModal,
  contextualLink,
  updating,
}: EvidenceCardProps) {
  const statusBadge = STATUS_BADGES[item.status] || STATUS_BADGES.new;
  const priorityClass = PRIORITY_BADGES[item.priority] || PRIORITY_BADGES.medium;
  const sourceClass = SOURCE_COLORS[item.source] || 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source Tag */}
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${sourceClass}`}>
            {item.source}
          </span>
          {/* Type Tag */}
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            {item.type.replace(/_/g, ' ')}
          </span>
          {/* Priority Pill */}
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize ${priorityClass}`}>
            {item.priority} Priority
          </span>
          {/* Confidence */}
          <span className="text-[11px] font-medium text-gray-500">
            Confidence: <span className="font-bold text-gray-800">{item.confidence}%</span>
          </span>
        </div>

        {/* Status Dropdown & Note Action */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select
            value={item.status}
            disabled={updating}
            onChange={(e) => onStatusChange(e.target.value as EvidenceStatus)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${statusBadge.bg}`}
          >
            <option value="new">New Finding</option>
            <option value="reviewed">Reviewed</option>
            <option value="accepted">Accepted</option>
            <option value="dismissed">Dismissed</option>
          </select>

          <button
            onClick={onOpenNoteModal}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition-colors"
            title="Add or Edit Review Note"
          >
            <NotePencil size={15} />
          </button>
        </div>
      </div>

      {/* Card Header & Summary */}
      <div className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={onToggleExpand}
            className="text-left font-bold text-[14px] text-gray-900 hover:text-emerald-700 transition-colors flex items-center gap-1.5"
          >
            {expanded ? <CaretDown size={14} className="text-gray-400 shrink-0" /> : <CaretRight size={14} className="text-gray-400 shrink-0" />}
            <span>{item.title}</span>
          </button>

          <span className="text-[10px] text-gray-400 shrink-0">
            {item.observed_at ? new Date(item.observed_at).toLocaleDateString() : '—'}
          </span>
        </div>

        <p className={`text-xs text-gray-600 mt-1 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
          {item.summary}
        </p>

        {/* Note preview if present */}
        {item.review_note && (
          <div className="mt-2 bg-amber-50/70 border border-amber-200/60 rounded-lg px-3 py-1.5 text-[11px] text-amber-900 flex items-center gap-1.5">
            <span className="font-bold">Review Note:</span>
            <span>{item.review_note}</span>
          </div>
        )}
      </div>

      {/* Expanded Details Section */}
      {expanded && (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-3 text-xs">
          {/* Recommended Action */}
          {item.recommended_action && (
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
              <p className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                <Sparkle size={13} className="text-emerald-700" />
                <span>Recommended Research Action (Manual Review):</span>
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">{item.recommended_action}</p>
            </div>
          )}

          {/* Related Entity Information */}
          {item.entity && (item.entity.sku || item.entity.slug || item.entity.woo_id || item.entity.category_slug) && (
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex flex-wrap gap-4 text-[11px]">
              {item.entity.sku && (
                <div>
                  <span className="text-gray-400 block font-medium">SKU:</span>
                  <span className="font-mono font-bold text-gray-800">{item.entity.sku}</span>
                </div>
              )}
              {item.entity.slug && (
                <div>
                  <span className="text-gray-400 block font-medium">Product Slug:</span>
                  <span className="font-mono text-gray-700">{item.entity.slug}</span>
                </div>
              )}
              {item.entity.category_slug && (
                <div>
                  <span className="text-gray-400 block font-medium">Category:</span>
                  <span className="text-gray-700 font-semibold">{item.entity.category_slug}</span>
                </div>
              )}
              {item.entity.woo_id && (
                <div>
                  <span className="text-gray-400 block font-medium">Woo ID:</span>
                  <span className="font-mono text-gray-700">{item.entity.woo_id}</span>
                </div>
              )}
            </div>
          )}

          {/* Evidence Items / URLs */}
          {item.evidence && item.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                <LinkIcon size={12} />
                <span>Source Evidence Links:</span>
              </p>
              <ul className="space-y-1">
                {item.evidence.map((ev, idx) => (
                  <li key={idx} className="text-[11px] flex items-start gap-1.5 text-gray-600">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <div>
                      {ev.label && <span className="font-semibold text-gray-800">{ev.label}: </span>}
                      {ev.url ? (
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline break-all"
                        >
                          {ev.url}
                        </a>
                      ) : (
                        <span>{ev.observation || '—'}</span>
                      )}
                      {ev.observation && ev.url && (
                        <span className="text-gray-400 ml-1">({ev.observation})</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical Dedupe Key */}
          <div className="text-[10px] text-gray-400 flex items-center gap-2 pt-1">
            <span>Dedupe Key: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600">{item.dedupe_key}</code></span>
            <span>•</span>
            <span>Recorded: {new Date(item.created_at).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Card Footer with Contextual Link */}
      <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onToggleExpand}
          className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
        >
          {expanded ? 'Show Less' : 'View Full Evidence'}
        </button>

        <div>{contextualLink}</div>
      </div>
    </div>
  );
}
