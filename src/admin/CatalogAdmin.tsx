// ============================================================================
// HIMALAYAN KOH — CATALOG ADMIN (Catalog Launch Phase)
//
// Store-backed product management + promotions for the admin. Everything
// persists through the catalog repository (admin session → the console's own
// /api/admin routes → WooCommerce/WordPress). No fake facts: UNKNOWN stays
// UNKNOWN, merchandising flags are admin decisions, delete prefers archive.
// ============================================================================
import { useState, useEffect, useCallback, useMemo, useRef, Fragment, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, PencilSimple, Trash, ArrowLeft, Copy, Eye,
  MagnifyingGlass, FloppyDisk, Image as ImageIcon, Stack, Tag, Globe, Truck, Package, CurrencyDollar,
  GearSix, X, Download, List, Megaphone, Warning, Brain, UploadSimple, Sparkle, CaretDown, CaretUp, ArrowSquareOut, Rocket, BookBookmark,
  DotsThreeVertical, Clock, CheckCircle, DotsSixVertical, ArrowsClockwise, ArrowsHorizontal, Sun,
} from '@phosphor-icons/react';
import Modal from '../components/common/Modal';
import Popover from '../components/common/Popover';
import { useApp } from '../App';
import { getFreshAccessToken, getSession } from '../services/wordpressAdminAuth';
import {
  setDbToken, listProducts, getProduct, createProduct, updateProduct, setProductStatus,
  archiveProduct, hardDeleteProduct, duplicateProduct, saveProductImages, saveProductVariants,
  createCategory,
  listCategories, listCoupons, createCoupon, updateCoupon, deleteCoupon,
  listOffers, createOffer, updateOffer, deleteOffer, getStoreSettings, saveStoreSettings,
  uid, isWooId,
  type ProductInput,
} from '../features/catalog/repository';
import { listRecommendations } from '../features/hermes/repository';
import type { HermesRecommendationRow } from '../features/hermes/types';
import {
  type CatalogProduct, type CatalogCategory, type CatalogImage, type CatalogVariant, type Coupon, type StoreOffer, type StoreSettings,
} from '../features/catalog/types';
import { buildFeedCsv, buildProductJsonLd, buildProductMeta, productPath } from '../features/catalog/seo';
import { adminPublicVisibility } from '../features/catalog/visibility';
import {
  COMMERCE_READINESS_LABELS, SOURCE_TYPE_LABELS, INVENTORY_SOURCE_LABELS,
  type CommerceReadiness,
} from '../features/catalog/commerceReadiness';
import { SUPPLIER_SOURCE_PRESETS, supplierSearchUrl } from '../features/catalog/supplierSource';
import { getAutoPublishEnabled, setAutoPublishEnabled } from '../features/catalog/autoPublish';
import { generateSeoJson } from '../features/ai/seo';
import { useSeoJobStore } from '../features/catalog/seoJobStore';
import {
  CATALOG_COLUMN_LABELS, loadCatalogColumns, saveCatalogColumns, loadServerColumns, saveServerColumns, moveColumn,
  type CatalogColumnKey,
} from '../features/catalog/tableColumns';
import { parseHtmlPage } from '../features/ai/importer';
import { prepareImageForUpload } from '../lib/image-upload';
import { getListingPlaybook, validateListingAgainstPlaybook, supplierBrandForUrl } from '../features/catalog/listingPlaybook';
import { humanSaveError } from '../features/catalog/saveError';
import { hasCatalogImageUrl } from '../features/catalog/imageUrl';
import { AIImportPanel } from './AIImportPanel';
import {
  parseCsvImport, classifyDuplicates,
  type CsvImportRow, type DuplicateMatch, type DupCandidate,
} from '../features/catalog/csvImport';

const I = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';
const FI = 'w-full px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all bg-white h-8 text-gray-700';
const L = 'block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5';
const BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  ready: 'bg-blue-100 text-blue-700',
  draft: 'bg-gray-100 text-gray-600',
  inactive: 'bg-amber-100 text-amber-700',
  archived: 'bg-red-100 text-red-600',
};

const READINESS_BADGE: Record<CommerceReadiness, string> = {
  COMMERCE_READY: 'bg-green-100 text-green-700',
  SOURCE_PENDING: 'bg-red-100 text-red-600',
  ECONOMICS_PENDING: 'bg-orange-100 text-orange-700',
  FULFILLMENT_PENDING: 'bg-amber-100 text-amber-700',
  RISK_REVIEW: 'bg-purple-100 text-purple-700',
  DRAFT: 'bg-gray-100 text-gray-600',
};

// "Supplier source" presets + marketplace search-link builder live in
// features/catalog/supplierSource (one shared home for the Quick Add and
// Detail Add dropdowns and the URL prefill below).

// Header-click sorting for the seller-hub table: which sort keys each column
// toggles between (asc <-> desc), and the direction a first click uses.
const HEADER_SORT: Partial<Record<CatalogColumnKey, { asc: string; desc: string; first: string }>> = {
  product: { asc: 'name', desc: 'name-desc', first: 'name' },
  price: { asc: 'price-asc', desc: 'price-desc', first: 'price-asc' },
  margin: { asc: 'margin-asc', desc: 'margin', first: 'margin' },
  stock: { asc: 'stock-asc', desc: 'stock-desc', first: 'stock-desc' },
  views: { asc: 'views-asc', desc: 'views', first: 'views' },
  interest: { asc: 'interest-asc', desc: 'interest', first: 'interest' },
  age: { asc: 'oldest', desc: 'newest', first: 'newest' },
};

// Descriptive tooltips kept on the analytics/lifecycle headers.
const COLUMN_TIPS: Partial<Record<CatalogColumnKey, string>> = {
  views: 'Real first-party view_item events, last 90 days',
  interest: 'Wishlist saves (distinct visitors, site_events) - add-to-cart shown when no saves yet',
  age: 'Time since first live (published_at), falling back to created_at',
};

// Human explanation of what a row is missing for complete SEO.
function seoExplain(p: CatalogProduct): string {
  const missing: string[] = [];
  if (!p.seoTitleStored) missing.push('title');
  if (!p.seoDescriptionStored) missing.push('meta description');
  if ((p.seoKeywords || []).length === 0) missing.push('keywords');
  return missing.length === 0 ? 'SEO complete (title + meta + keywords)' : `Missing SEO: ${missing.join(', ')}`;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${BADGE[status] || BADGE.draft}`}>{status}</span>;
}

/** Groups every hidden row by its reason so the header count explains itself on
 * hover (for example "52 unverified commerce readiness · 11 missing usable
 * product image"). */
function publicVisibilitySummary(products: CatalogProduct[]): string {
  const counts = new Map<string, number>();
  for (const p of products) {
    const v = adminPublicVisibility(p);
    if (v.listable) continue;
    const key = v.reason || 'unknown reason';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${n} ${reason}`)
    .join(' · ');
}

/** Distinguishes ACTIVE (owner approved the listing) from PUBLIC (the
 * storefront will actually serve it). Uses the same contract the storefront
 * applies, so the operator sees the real reason instead of a misleading badge. */
function VisibilityBadge({ product }: { product: CatalogProduct }) {
  const { listable, reason } = adminPublicVisibility(product);
  if (listable) {
    return (
      <a href={productPath(product)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5 hover:bg-emerald-100 transition-colors" title="Publicly listable — served on storefront">
        <Eye size={10} /> PUBLIC
      </a>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5"
      title={`Not publicly listable — ${reason || 'unverified conditions'}. The storefront returns 404 for this PDP and it is excluded from the sitemap.`}
    >
      NOT PUBLIC — {reason || 'unverified'}
    </span>
  );
}

function ReadinessBadge({ readiness }: { readiness?: CommerceReadiness | null }) {
  if (!readiness) return <span className="text-xs text-gray-300">—</span>;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${READINESS_BADGE[readiness] || BADGE.draft}`}>{COMMERCE_READINESS_LABELS[readiness] || readiness}</span>;
}

// eBay-style listing age from the genuine first-live date (published_at),
// falling back to created_at only for products that were never published.
// Time of day (e.g. "2:14 PM") — shown beside listing age so sellers see the
// exact clock time a listing went live, not just how many days ago.
function timeLabel(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function ageLabel(iso: string | undefined | null, nowMs: number | null): string {
  if (!iso || nowMs === null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((nowMs - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function endsInLabel(iso: string | null | undefined, nowMs: number | null): string | null {
  if (!iso || nowMs === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - nowMs) / 86400000);
  if (days < 0) return 'Ended';
  return days === 0 ? 'Ends today' : `Ends in ${days}d`;
}

function useDbToken() {
  useEffect(() => {
    // Refresh first so a long-open admin session never writes with a stale
    // (expired) JWT — getFreshAccessToken refreshes when near/at expiry.
    void getFreshAccessToken().then((t) => setDbToken(t));
  }, []);
}

// ============================================================================
// PRODUCT LIST
// ============================================================================
export function CatalogProductsPage() {
  useDbToken();
  const nav = useNavigate();
  const { notify } = useApp();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cats, setCats] = useState<CatalogCategory[]>([]);
  const [offers, setOffers] = useState<StoreOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const [fCat, setFCat] = useState('all');
  const [fFlag, setFFlag] = useState('all');
  const [fReady, setFReady] = useState('all');
  const [fSource, setFSource] = useState('all');
  const [fImage, setFImage] = useState('all');
  const [fSeo, setFSeo] = useState('all');
  // Default: newest-first — the products the owner most recently added are the
  // ones they care about; alphabetical order hides them in a growing catalog.
  const [sort, setSort] = useState('newest');
  const [delId, setDelId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  // Auto-publish toggle (persisted server-side, shared across devices).
  const [autoPublish, setAutoPublish] = useState<boolean | null>(null);
  const [autoPublishConfirm, setAutoPublishConfirm] = useState(false);
  const [autoPublishBusy, setAutoPublishBusy] = useState(false);
  // Background Auto-SEO job - lives in a module store so it survives navigation.
  const seo = useSeoJobStore();
  // Keep the first render deterministic: browser storage is applied after
  // hydration so a saved column order cannot change the server HTML.
  const [colOrder, setColOrder] = useState<CatalogColumnKey[]>(() => loadCatalogColumns(null));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [renderNowMs, setRenderNowMs] = useState<number | null>(null);
  const [dragCol, setDragCol] = useState<CatalogColumnKey | null>(null);
  // Row height resize state: tracks which row is being resized and the drag offset.
  const [rowHeight, setRowHeight] = useState<number>(48);
  const rowResizeRef = useRef<{ startY: number; startH: number } | null>(null);

  const onRowResizeStart = useCallback((e: React.MouseEvent, productId: string) => {
    e.preventDefault();
    e.stopPropagation();
    rowResizeRef.current = { startY: e.clientY, startH: rowHeight };
    const onMove = (ev: MouseEvent) => {
      if (!rowResizeRef.current) return;
      const dy = ev.clientY - rowResizeRef.current.startY;
      setRowHeight(Math.max(32, Math.min(200, rowResizeRef.current.startH + dy)));
    };
    const onUp = () => {
      rowResizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [rowHeight]);
  useEffect(() => {
    let cancelled = false;
    void getAutoPublishEnabled().then((v) => { if (!cancelled) setAutoPublish(v); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setColOrder(loadCatalogColumns(window.localStorage));
    useSeoJobStore.getState().hydrate();
    // Client-only state is applied only after the SSR/client first render agrees.
    setRenderNowMs(Date.now());
    setHydrated(true);
  }, []);
  // Guard for the store's onFinished callback: skip the reload if we've unmounted.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  // First-party analytics: views + add-to-cart interest + wishlist saves per product.
  const [stats, setStats] = useState<Record<string, { views: number; views7d: number; views30d: number; interest: number; saved: number }> | null>(null);
  const [statsNote, setStatsNote] = useState<string | null>(null);
  // Per-row quick edits.
  const [priceEdit, setPriceEdit] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [rowAnchor, setRowAnchor] = useState<HTMLElement | null>(null);
  const [listingModal, setListingModal] = useState<CatalogProduct | null>(null);
  const [promoOpen, setPromoOpen] = useState<string | null>(null);
  const [promoAnchor, setPromoAnchor] = useState<HTMLElement | null>(null);
  const [priceBulk, setPriceBulk] = useState<{ open: boolean; mode: 'inc-pct' | 'dec-pct' | 'inc-fixed' | 'dec-fixed' | 'set'; value: string; busy: boolean }>({ open: false, mode: 'dec-pct', value: '', busy: false });
  const PRICE_MODE_LABEL: Record<string, string> = {
    'inc-pct': 'Increase by',
    'dec-pct': 'Decrease by',
    'inc-fixed': 'Increase by',
    'dec-fixed': 'Decrease by',
    set: 'Set exact price to',
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [productResult, categoryResult, offerResult] = await Promise.allSettled([
        listProducts(true),
        listCategories(),
        listOffers(),
      ]);
      if (productResult.status === 'rejected') {
        throw productResult.reason instanceof Error
          ? productResult.reason
          : new Error('The product catalog could not be loaded.');
      }
      setProducts(productResult.value);
      // Auxiliary data must not turn a successful product read into a fake
      // empty catalog. Filters simply remain at their deterministic defaults.
      setCats(categoryResult.status === 'fulfilled' ? categoryResult.value : []);
      setOffers(offerResult.status === 'fulfilled' ? offerResult.value : []);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'The product catalog could not be loaded.';
      setLoadError(message);
      notify(`Could not load catalog: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  // Real first-party views/interest from the server endpoint (one request,
  // aggregated server-side — never N+1, never a raw analytics download).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getFreshAccessToken();
        const r = await fetch('/api/admin/product-stats', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { stats?: Record<string, { views: number; views7d: number; views30d: number; interest: number; saved: number }>; unavailable?: string };
        if (!cancelled) { setStats(j.stats ?? null); setStatsNote(j.unavailable ?? null); }
      } catch {
        if (!cancelled) { setStats(null); setStatsNote('Analytics unavailable'); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Local patch after any quick edit — the row updates from the fresh DB row
  // (margin recomputes, published_at refreshes) without a full reload.
  const patchLocal = (upd: CatalogProduct | null) => {
    if (!upd) return;
    setProducts((prev) => prev.map((p) => (p.id === upd.id ? upd : p)));
  };

  // -------------------------------------------------------------------------
  // AUTO SEO (fixed eligibility). The bug: rowToProduct falls back
  // seo_title → name and seo_description → short_description for DISPLAY, so
  // `p.seoTitle && p.seoDescription` was ALWAYS truthy and the bulk run
  // reported "all listings already have SEO" even when the DB columns were
  // NULL. Eligibility now reads the raw persisted columns only
  // (seoTitleStored / seoDescriptionStored / seoKeywords).
  // -------------------------------------------------------------------------
  const seoStatus = (p: CatalogProduct): 'complete' | 'incomplete' | 'missing' => {
    const title = !!p.seoTitleStored;
    const desc = !!p.seoDescriptionStored;
    const kw = (p.seoKeywords || []).length > 0;
    if (title && desc && kw) return 'complete';
    if (title || desc || kw) return 'incomplete';
    return 'missing';
  };

  const generateAndSaveSeo = async (p: CatalogProduct) => {
    const category = cats.find((c) => c.id === p.categoryId)?.name || p.categoryName || '';
    const parsed = await generateSeoJson(buildProductSeoPrompt(p, category));
    const kw = Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords.map(String).slice(0, 8) : [];
    const slug = String(parsed.slug || p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);
    const upd = await updateProduct(p.id, {
      seoTitle: String(parsed.seoTitle || '').trim(),
      seoDescription: String(parsed.metaDescription || '').trim(),
      seoKeywords: kw,
      ...(slug ? { canonicalSlug: slug } : {}),
    });
    patchLocal(upd);
  };

  // Bulk Auto SEO - the actual loop lives in the module-level seoJobStore so it
  // keeps running (and keeps reporting progress) while the user navigates to
  // another admin page and back. Processes Missing + Incomplete only, NEVER
  // overwrites Complete. The store reports complete/updated/skipped/failed.
  const runAutoSeo = async (targets: CatalogProduct[]) => {
    const work = targets.filter((p) => p.name.trim() && seoStatus(p) !== 'complete');
    if (work.length === 0) {
      notify(`All ${targets.length} selected product(s) already have complete SEO.`, 'info');
      return;
    }
    if (!window.confirm(`Auto-generate and save SEO for ${work.length} product(s)? Complete SEO is never overwritten.`)) return;
    setDbToken(await getFreshAccessToken());
    const started = await useSeoJobStore.getState().start({
      targets,
      statusOf: seoStatus,
      runOne: generateAndSaveSeo,
      onFinished: async () => {
        if (mountedRef.current) await load();
      },
    });
    if (started) {
      const skipped = targets.length - work.length;
      notify(`Auto SEO job started — ${work.length} to process, ${skipped} already complete. It keeps running in the background; progress shows here and on each row.`);
    }
  };

  const autoSeoBulk = () => void runAutoSeo(products);

  const toggleAutoPublish = async (on: boolean) => {
    setAutoPublishBusy(true);
    try {
      const next = await setAutoPublishEnabled(on);
      if (next === null) { notify('Could not save the auto-list setting — try again.', 'error'); return; }
      setAutoPublish(next);
      notify(next ? 'Auto-list enabled — products that become commerce-ready will publish on save.' : 'Auto-list disabled — drafts stay drafts.');
    } finally { setAutoPublishBusy(false); setAutoPublishConfirm(false); }
  };

  // A run killed by a full page reload restores its checkpoint from localStorage
  // (`interrupted`). Resume resolves those ids back to the rows currently loaded;
  // products that actually saved before the reload are now 'complete' and get
  // skipped by the same eligibility check, so nothing is regenerated or overwritten.
  const resumeInterruptedSeo = async () => {
    const inter = useSeoJobStore.getState().interrupted;
    if (!inter) return;
    const byId = new Map(products.map((p) => [p.id, p]));
    const targets = inter.ids.map((id) => byId.get(id)).filter((p): p is CatalogProduct => Boolean(p));
    if (targets.length === 0) {
      notify('The products from the interrupted SEO run are gone from the catalog — cleared.', 'info');
      useSeoJobStore.getState().dismissInterrupted();
      return;
    }
    const work = targets.filter((p) => p.name.trim() && seoStatus(p) !== 'complete');
    if (work.length === 0) {
      notify('The remaining products from the interrupted SEO run already have complete SEO.', 'info');
      useSeoJobStore.getState().dismissInterrupted();
      return;
    }
    if (!window.confirm(`Resume Auto SEO for the ${work.length} product(s) left from the interrupted run? Complete SEO is never overwritten.`)) return;
    setDbToken(await getFreshAccessToken());
    const started = await useSeoJobStore.getState().resume({
      targets,
      statusOf: seoStatus,
      runOne: generateAndSaveSeo,
      onFinished: async () => {
        if (mountedRef.current) await load();
      },
    });
    if (started) notify(`Auto SEO resumed — ${work.length} to process. It keeps running in the background.`);
  };

  // Column header click -> toggle asc/desc (first click uses the useful default).
  const headerSort = (k: CatalogColumnKey) => {
    const s = HEADER_SORT[k];
    if (!s) return;
    setSort((prev) => (prev === s.asc ? s.desc : prev === s.desc ? s.asc : s.first));
  };

  // Column header drag -> reorder, persisted per-device in localStorage AND
  // server-side (per admin) so the layout follows the seller across devices.
  const reorderColumns = (from: CatalogColumnKey, to: CatalogColumnKey) => {
    if (from === to) return;
    const next = moveColumn(colOrder, from, to);
    setColOrder(next);
    saveCatalogColumns(next, typeof localStorage !== 'undefined' ? localStorage : null);
    void saveServerColumns(next);
  };

  // Pull the server-side column order on mount so another device's layout
  // (or a previous session) applies immediately. Server wins over the stale
  // local copy when it has an order for this admin.
  useEffect(() => {
    let cancelled = false;
    void loadServerColumns().then((server) => {
      if (cancelled || !server) return;
      setColOrder(server);
      saveCatalogColumns(server, window.localStorage);
    });
    return () => { cancelled = true; };
  }, []);

  // "All statuses" hides archived rows — archive is a folder, not a status
  // you keep scrolling past. Archived products are only visible when the
  // user explicitly picks the "Archived" filter (or clicks the chip).
  const filtered = useMemo(() => products.filter((p) => {
    if (fStatus === 'all' && p.status === 'archived') return false;
    if (fStatus !== 'all' && p.status !== fStatus) return false;
    if (fCat !== 'all' && p.categoryId !== fCat) return false;
    if (fReady !== 'all' && (p.commerceReadiness ?? null) !== (fReady === 'none' ? null : fReady)) return false;
    if (fSource !== 'all') {
      const src = (p.supplierSource || '').toLowerCase();
      const st = p.sourceType || null;
      if (fSource === 'kong' && !(/kong/.test(src) || st === 'RETAIL_REFERENCE_ONLY')) return false;
      if (fSource === 'cj' && !(/cj/.test(src) || st === 'CJ_DROPSHIPPING')) return false;
      if (fSource === 'other' && (/kong/.test(src) || /cj/.test(src))) return false;
      if (fSource === 'unknown' && (src || st)) return false;
      if (fSource === 'cost-unknown' && (p.costPrice > 0 || p.landedCost > 0)) return false;
      if (fSource === 'shipping-unknown' && !(p.shippingCost > 0 || p.freeShipping)) return false;
      if (fSource === 'low-margin' && !(p.costPrice > 0 && p.marginPercent != null && p.marginPercent < 40)) return false;
      if (fSource === 'stock-unknown' && !(p.stockStatus === 'unknown' || p.stockStatus == null)) return false;
    }
    if (fFlag === 'featured' && !p.featured) return false;
    if (fFlag === 'new' && !p.newArrival) return false;
    if (fFlag === 'sale' && !(p.compareAtPrice > p.price)) return false;
    if (fFlag === 'free-shipping' && !p.freeShipping) return false;
    if (fFlag === 'low-stock' && !(Boolean(p.trackInventory) && p.inventoryQty <= p.lowStockThreshold)) return false;
    if (fImage === 'no-image' && p.images.length > 0) return false;
    if (fImage === 'has-image' && p.images.length === 0) return false;
    if (fImage === 'single-image' && p.images.length <= 1) return false;
    if (fSeo !== 'all' && seoStatus(p) !== fSeo) return false;
    if (q) {
      const needle = q.toLowerCase();
      return [p.name, p.brand, p.sku, p.categoryName, ...p.tags].join(' ').toLowerCase().includes(needle);
    }
    return true;
  }), [products, fStatus, fCat, fFlag, fReady, fSource, fImage, fSeo, q]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const listDate = (p: CatalogProduct) => Date.parse(p.publishedAt || p.createdAt || '') || 0;
    // Interest sorts saved-count first (distinct savers), then add-to-cart events.
    const interestScore = (p: CatalogProduct) => {
      const s = stats?.[p.id];
      return ((s?.saved ?? 0) * 100000) + (s?.interest ?? 0);
    };
    switch (sort) {
      case 'newest': return rows.sort((a, b) => listDate(b) - listDate(a));
      case 'oldest': return rows.sort((a, b) => listDate(a) - listDate(b));
      case 'name-desc': return rows.sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')));
      case 'price-asc': return rows.sort((a, b) => a.price - b.price);
      case 'price-desc': return rows.sort((a, b) => b.price - a.price);
      case 'margin': return rows.sort((a, b) => (b.marginPercent ?? -1) - (a.marginPercent ?? -1));
      case 'margin-asc': return rows.sort((a, b) => (a.marginPercent ?? -1) - (b.marginPercent ?? -1));
      case 'stock-desc': return rows.sort((a, b) => (b.inventoryQty ?? -1) - (a.inventoryQty ?? -1));
      case 'stock-asc': return rows.sort((a, b) => (a.inventoryQty ?? -1) - (b.inventoryQty ?? -1));
      case 'views': return rows.sort((a, b) => (stats?.[b.id]?.views ?? -1) - (stats?.[a.id]?.views ?? -1));
      case 'views-asc': return rows.sort((a, b) => (stats?.[a.id]?.views ?? -1) - (stats?.[b.id]?.views ?? -1));
      case 'interest': return rows.sort((a, b) => interestScore(b) - interestScore(a));
      case 'interest-asc': return rows.sort((a, b) => interestScore(a) - interestScore(b));
      default: return rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
  }, [filtered, sort, stats]);

  const archivedCount = useMemo(() => products.filter((p) => p.status === 'archived').length, [products]);

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------
  const allVisibleSelected = sorted.length > 0 && sorted.every((p) => selectedIds.has(p.id));
  const someVisibleSelected = sorted.some((p) => selectedIds.has(p.id));
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map((p) => p.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  // -------------------------------------------------------------------------
  // Quick edits (no page reload — row patches from the fresh DB row)
  // -------------------------------------------------------------------------
  const quickCategory = async (p: CatalogProduct, catId: string) => {
    try {
      const upd = await updateProduct(p.id, { categoryId: catId || null });
      patchLocal(upd);
      notify(catId ? `Category saved` : 'Category cleared');
    } catch (e) {
      notify(`Could not update category: ${(e as Error).message}`, 'error');
    }
  };

  const quickStatus = async (p: CatalogProduct, status: CatalogProduct['status']) => {
    try {
      const upd = await setProductStatus(p.id, status);
      patchLocal(upd);
      notify(status === 'active' ? 'Product is now LIVE on the storefront' : `Status → ${status}`);
    } catch (e) {
      notify(`Could not update status: ${(e as Error).message}`, 'error');
    }
  };

  const savePrice = async (p: CatalogProduct) => {
    const v = Number(priceDraft);
    if (priceDraft.trim() === '' || !Number.isFinite(v) || v <= 0) {
      notify('Enter a valid price greater than 0', 'error');
      return;
    }
    try {
      const upd = await updateProduct(p.id, { price: Math.round(v * 100) / 100 });
      patchLocal(upd);
      notify('Price saved');
      setPriceEdit(null);
    } catch (e) {
      notify(`Could not update price: ${(e as Error).message}`, 'error');
    }
  };

  const onArchive = async () => {
    if (!delId) return;
    setArchiving(true);
    try {
      await archiveProduct(delId);
      notify('Product archived (history kept)');
      setDelId(null);
      await load();
    } catch (e) {
      notify(`Could not archive: ${(e as Error).message}`, 'error');
    } finally {
      setArchiving(false);
    }
  };

  const onDuplicate = async (id: string) => {
    try {
      await duplicateProduct(id);
      notify('Product duplicated as draft');
      await load();
    } catch (e) {
      notify(`Could not duplicate: ${(e as Error).message}`, 'error');
    }
  };

  const onHardDelete = async () => {
    if (!delId) return;
    const targetId = delId;
    setDelId(null);
    setProducts((prev) => prev.filter((p) => p.id !== targetId));
    try {
      await hardDeleteProduct(targetId);
      notify('Product permanently deleted');
      await load();
    } catch (e) {
      notify(`Could not delete: ${(e as Error).message}`, 'error');
      await load();
    }
  };

  const onRestore = async (id: string) => {
    try {
      await setProductStatus(id, 'draft');
      notify('Product restored to Draft');
      await load();
    } catch (e) {
      notify(`Could not restore: ${(e as Error).message}`, 'error');
    }
  };

  // -------------------------------------------------------------------------
  // Bulk actions
  // -------------------------------------------------------------------------
  const runBulk = async (verb: string, fn: (p: CatalogProduct) => Promise<void>) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const p = products.find((x) => x.id === ids[i]);
        if (!p) continue;
        try { await fn(p); } catch { failed++; }
      }
      notify(failed === 0 ? `${verb} — ${ids.length} product${ids.length === 1 ? '' : 's'} updated` : `${verb} — ${ids.length - failed} updated, ${failed} failed`, failed ? 'error' : 'success');
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  const onBulkStatus = (status: CatalogProduct['status']) => {
    void runBulk(`Status → ${status}`, (p) => setProductStatus(p.id, status).then((u) => { if (u) patchLocal(u); }));
  };
  const onBulkCategory = (catId: string) => {
    void runBulk('Category', (p) => updateProduct(p.id, { categoryId: catId || null }).then((u) => { if (u) patchLocal(u); }));
  };
  const onBulkPromote = (on: boolean) => {
    void runBulk(on ? 'Promoted' : 'Promotion removed', (p) => updateProduct(p.id, on ? { promoted: true } : { promoted: false, saleEnabled: false }).then((u) => { if (u) patchLocal(u); }));
  };

  const applyBulkPrice = async () => {
    const { mode, value } = priceBulk;
    const v = Number(value);
    if (value.trim() === '' || !Number.isFinite(v) || v <= 0) {
      notify('Enter a valid positive amount/percent', 'error');
      return;
    }
    const ids = [...selectedIds];
    const targets = products.filter((p) => ids.includes(p.id));
    // Preview all resulting prices first — never allow a negative/zero price.
    const next = targets.map((p) => {
      let np = p.price;
      if (mode === 'inc-pct') np = p.price * (1 + v / 100);
      else if (mode === 'dec-pct') np = p.price * (1 - v / 100);
      else if (mode === 'inc-fixed') np = p.price + v;
      else if (mode === 'dec-fixed') np = p.price - v;
      else np = v; // set exact
      return { p, np: Math.round(np * 100) / 100 };
    });
    if (next.some((x) => x.np <= 0)) {
      notify('Result would produce a zero/negative price — nothing applied', 'error');
      return;
    }
    setPriceBulk((s) => ({ ...s, busy: true }));
    let failed = 0;
    for (const x of next) {
      try { const u = await updateProduct(x.p.id, { price: x.np }); if (u) patchLocal(u); } catch { failed++; }
    }
    setPriceBulk({ open: false, mode: 'dec-pct', value: '', busy: false });
    setSelectedIds(new Set());
    notify(failed === 0 ? `Prices updated — ${next.length} product${next.length === 1 ? '' : 's'}` : `${next.length - failed} updated, ${failed} failed`, failed ? 'error' : 'success');
  };

  const onBulkHardDelete = async () => {
    setBulkBusy(true);
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    setBulkOpen(false);
    setProducts((prev) => prev.filter((p) => !ids.includes(p.id)));
    try {
      for (const id of ids) {
        await hardDeleteProduct(id);
      }
      notify(`${ids.length} product${ids.length === 1 ? '' : 's'} permanently deleted`);
      await load();
    } catch (e) {
      notify(`Bulk delete stopped: ${(e as Error).message}`, 'error');
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  const onBulkArchive = async () => {
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      for (const id of ids) {
        await archiveProduct(id);
      }
      notify(`${ids.length} product${ids.length === 1 ? '' : 's'} archived`);
      setSelectedIds(new Set());
      setBulkOpen(false);
      await load();
    } catch (e) {
      notify(`Bulk archive stopped: ${(e as Error).message}`, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // Listing duration (optional expiry — display only, never auto-enforced).
  const saveListingEnds = async (iso: string | null) => {
    if (!listingModal) return;
    try {
      const upd = await updateProduct(listingModal.id, { listingEndsAt: iso });
      patchLocal(upd);
      notify(iso ? 'Listing end date saved' : 'Listing set to no expiry (Good ’Til Cancelled)');
      setListingModal(null);
    } catch (e) {
      notify(`Could not save listing duration: ${(e as Error).message}`, 'error');
    }
  };

  const offersFor = (p: CatalogProduct) => offers.filter((o) => o.isActive && (o.productIds.includes(p.id) || (p.categoryId ? o.categoryIds.includes(p.categoryId) : false)));
  const promoLabel = (p: CatalogProduct) => {
    if (p.saleEnabled && p.discountValue != null && p.discountValue > 0) {
      return p.discountType === 'percent' ? `${p.discountValue}% Off` : `$${p.discountValue.toFixed(2)} Off`;
    }
    if (p.promoted) return 'Promoted';
    return 'None';
  };

  if (loading) return <section aria-busy="true" aria-label="Products" className="space-y-5">
    <div><h1 className="text-2xl font-bold text-[#26211C]">Products</h1><p role="status" className="mt-1 text-sm text-[#6D6258]">Loading your WooCommerce catalogue…</p></div>
    <div aria-hidden="true" className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({length:4},(_,i)=><div key={i} className="h-24 rounded-xl border border-[#E0D6C8] bg-white animate-pulse" />)}</div>
    <div aria-hidden="true" className="rounded-xl border border-[#E0D6C8] bg-white p-4 space-y-4">{Array.from({length:6},(_,i)=><div key={i} className="h-12 rounded bg-[#FAF7F1] animate-pulse" />)}</div>
  </section>;

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center">
        <h1 className="text-lg font-semibold text-red-900">Products could not be loaded</h1>
        <p className="mt-2 text-sm text-red-700">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900 leading-none">Products</h1>
          <span className="text-xs text-gray-300">|</span>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
            <span className="font-semibold text-gray-800">{products.length} total</span>
            <span>·</span>
            <span
              className="text-emerald-700 font-medium"
              title="Rows the storefront actually serves: the shared public-listing contract, not just the commerce-readiness column."
            >
              {products.filter((p) => adminPublicVisibility(p).listable).length} publicly listable
            </span>
            <span>·</span>
            <span
              className="text-amber-700 font-medium"
              title={publicVisibilitySummary(products) || 'Nothing hidden'}
            >
              {products.filter((p) => !adminPublicVisibility(p).listable).length} not publicly listable
            </span>
            {archivedCount > 0 && (
              <>
                <span>·</span>
                <button
                  onClick={() => setFStatus(fStatus === 'archived' ? 'all' : 'archived')}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${fStatus === 'archived' ? 'bg-red-50 text-red-700 border-red-200' : 'text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                  title="Show or hide the archived folder"
                >
                  {fStatus === 'archived' ? '← All products' : `Archived (${archivedCount})`}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={autoSeoBulk} disabled={seo.running} title="Auto-generate + save SEO for every listed product missing/incomplete SEO — complete SEO is never overwritten. Keeps running while you work on other pages." className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-xs">
            <Sparkle size={13} />{seo.running ? `${seo.done}/${seo.total}` : 'Auto SEO'}
          </button>
          <button
            onClick={() => { if (autoPublish === null) return; if (autoPublish) void toggleAutoPublish(false); else setAutoPublishConfirm(true); }}
            disabled={autoPublish === null || autoPublishBusy}
            title={autoPublish ? 'Auto-publish is ON — a saved product that becomes commerce-ready is published automatically. Click to turn off.' : 'When ON, a product saved as commerce-ready is automatically published (status → Active). You will confirm before enabling.'}
            className={`px-2.5 py-1.5 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-xs disabled:opacity-50 ${autoPublish ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-500 hover:bg-gray-600'}`}
          >
            <Rocket size={13} />{autoPublish === null ? 'Auto-list…' : autoPublish ? 'Auto-list: ON' : 'Auto-list: OFF'}
          </button>
          <button onClick={() => setCsvOpen(true)} title="Import products from a Zeedrop / supplier CSV — saved as drafts" className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-xs">
            <UploadSimple size={13} />CSV Import
          </button>
          <button onClick={() => nav('/admin/products/new')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-xs">
            <Plus size={13} weight="bold" />Add Product
          </button>
        </div>
      </div>

      {/* Bulk Auto SEO progress - from the background store, so it persists
          across navigation and shows the live position when you come back. */}
      {seo.running && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-purple-800 font-medium flex items-center gap-2">
              <Sparkle size={14} />Auto SEO — {seo.done}/{seo.total}
            </span>
            <span className="text-xs text-purple-600 truncate">{seo.current}</span>
          </div>
          <div className="mt-2 h-1.5 bg-purple-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${seo.total ? Math.round((seo.done / seo.total) * 100) : 0}%` }} />
          </div>
          {seo.errors > 0 && <p className="text-xs text-amber-600 mt-1">{seo.errors} failed so far — continuing.</p>}
          <p className="text-[11px] text-purple-500 mt-1">Running in the background — switch pages and it keeps going.</p>
        </div>
      )}
      {seo.report && !seo.running && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5 text-xs text-purple-800 flex flex-wrap gap-x-4 gap-y-1">
          <span>SEO complete: <b>{seo.report.complete}</b></span>
          <span>Generated/updated: <b>{seo.report.updated}</b></span>
          <span>Skipped: <b>{seo.report.skipped}</b></span>
          <span>Failed: <b>{seo.report.failed}</b></span>
        </div>
      )}

      {/* Interrupted-run offer - a full page reload killed a running Auto SEO
          job; the store restored its checkpoint from localStorage, so the
          remaining products can be resumed instead of lost. */}
      {hydrated && seo.interrupted && !seo.running && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-amber-900 font-semibold flex items-center gap-2">
            <Warning size={16} />Auto SEO was interrupted
          </span>
          <span className="text-xs text-amber-700">
            {seo.interrupted.processed} of {seo.interrupted.ids.length} products were processed before the page reloaded.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void resumeInterruptedSeo()}
              disabled={loading || seo.running}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
            >
              Resume remaining
            </button>
            <button
              onClick={() => useSeoJobStore.getState().dismissInterrupted()}
              className="px-3 py-1.5 border border-amber-300 hover:bg-amber-100 text-amber-800 text-xs font-medium rounded-lg"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-2 shadow-xs space-y-1.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
          <div className="relative col-span-2">
            <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, SKU, tag…" className={`${FI} pl-8`} aria-label="Search products" />
          </div>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={FI} aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="ready">Ready</option>
            <option value="draft">Draft</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} className={FI} aria-label="Filter by category">
            <option value="all">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={fReady} onChange={(e) => setFReady(e.target.value)} className={FI} aria-label="Filter by commerce readiness">
            <option value="all">All readiness</option>
            <option value="COMMERCE_READY">Commerce Ready</option>
            <option value="SOURCE_PENDING">Source Pending</option>
            <option value="ECONOMICS_PENDING">Economics Pending</option>
            <option value="FULFILLMENT_PENDING">Fulfillment Pending</option>
            <option value="RISK_REVIEW">Risk Review</option>
            <option value="DRAFT">Draft</option>
            <option value="none">Unclassified</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={FI} aria-label="Sort products">
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Name</option>
            <option value="name-desc">Sort: Name (Z → A)</option>
            <option value="price-asc">Sort: Price (low → high)</option>
            <option value="price-desc">Sort: Price (high → low)</option>
            <option value="margin">Sort: Margin (high → low)</option>
            <option value="margin-asc">Sort: Margin (low → high)</option>
            <option value="stock-desc">Sort: Stock (high → low)</option>
            <option value="stock-asc">Sort: Stock (low → high)</option>
            <option value="views">Sort: Most viewed</option>
            <option value="views-asc">Sort: Least viewed</option>
            <option value="interest">Sort: Most interest</option>
            <option value="interest-asc">Sort: Least interest</option>
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 pt-0.5">
          <select value={fFlag} onChange={(e) => setFFlag(e.target.value)} className={FI} aria-label="Filter by merchandising flag">
            <option value="all">All flags</option>
            <option value="featured">Featured</option>
            <option value="new">New arrival</option>
            <option value="sale">On sale</option>
            <option value="free-shipping">Free shipping</option>
            <option value="low-stock">Low stock</option>
          </select>
          <select value={fSeo} onChange={(e) => setFSeo(e.target.value)} className={FI} aria-label="Filter by SEO state">
            <option value="all">All SEO states</option>
            <option value="complete">SEO complete</option>
            <option value="incomplete">SEO incomplete</option>
            <option value="missing">SEO missing</option>
          </select>
          <select value={fSource} onChange={(e) => setFSource(e.target.value)} className={FI} aria-label="Filter by source / economics">
            <option value="all">All sources</option>
            <option value="kong">KONG</option>
            <option value="cj">CJ</option>
            <option value="other">Other source</option>
            <option value="unknown">Source unknown</option>
            <option value="cost-unknown">Cost unknown</option>
            <option value="shipping-unknown">Shipping unknown</option>
            <option value="low-margin">Low margin (&lt;40%)</option>
            <option value="stock-unknown">Stock unknown</option>
          </select>
          <select value={fImage} onChange={(e) => setFImage(e.target.value)} className={FI} aria-label="Filter by image status">
            <option value="all">All images</option>
            <option value="no-image">No images</option>
            <option value="has-image">Has image</option>
            <option value="single-image">Single image only</option>
          </select>
        </div>
      </div>

      {/* Contextual bulk bar — only when products are selected */}
      {selectedIds.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-indigo-900">{selectedIds.size} selected</span>
          <button onClick={clearSelection} className="px-2.5 py-1.5 border text-xs rounded-lg bg-white text-gray-600 hover:bg-gray-50">Clear</button>
          <span className="w-px h-6 bg-indigo-200" />
          <button onClick={() => void runAutoSeo(products.filter((p) => selectedIds.has(p.id)))} disabled={bulkBusy || seo.running} className="px-2.5 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-xs rounded-lg flex items-center gap-1.5">
            <Sparkle size={13} />Auto SEO
          </button>
          <select
            value=""
            onChange={(e) => { if (e.target.value) { onBulkStatus(e.target.value as CatalogProduct['status']); e.target.value = ''; } }}
            disabled={bulkBusy}
            className="px-2 py-1.5 border border-indigo-200 rounded-lg text-xs bg-white cursor-pointer disabled:opacity-50"
            aria-label="Bulk change status"
          >
            <option value="">Status…</option>
            <option value="active">Active</option>
            <option value="ready">Ready</option>
            <option value="draft">Draft</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value=""
            onChange={(e) => { if (e.target.value) { onBulkCategory(e.target.value === '__none__' ? '' : e.target.value); e.target.value = ''; } }}
            disabled={bulkBusy}
            className="px-2 py-1.5 border border-indigo-200 rounded-lg text-xs bg-white cursor-pointer disabled:opacity-50"
            aria-label="Bulk change category"
          >
            <option value="">Category…</option>
            <option value="__none__">— Clear category —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setPriceBulk((s) => ({ ...s, open: true }))} disabled={bulkBusy} className="px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded-lg">Adjust Price…</button>
          <button onClick={() => onBulkPromote(true)} disabled={bulkBusy} className="px-2.5 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs rounded-lg">Promote</button>
          <button onClick={() => onBulkPromote(false)} disabled={bulkBusy} className="px-2.5 py-1.5 border text-xs rounded-lg bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">Remove Promotion</button>
          <button onClick={onBulkArchive} disabled={bulkBusy} className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs rounded-lg">Archive</button>
          <button onClick={() => setBulkOpen(true)} disabled={bulkBusy} className="px-2.5 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs rounded-lg flex items-center gap-1"><Trash size={12} />Delete</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Dynamic height: fills remaining viewport space. Table scrolls when
            content overflows; otherwise uses all available vertical space. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px]">
            <thead className="bg-gray-50 text-left text-[11px] text-gray-500 uppercase tracking-wider shadow-xs">
              <tr>
                {/* sticky on each th (not thead): pins the column-name bar to the
                    top of the scroll area while side-scrolling the wide table */}
                <th className="sticky top-0 z-10 bg-gray-50 px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                    onChange={toggleSelectAll}
                    aria-label="Select all visible products"
                    title={sorted.length ? `Select all ${sorted.length} visible products` : 'No products to select'}
                  />
                </th>
                {colOrder.map((k) => {
                  const s = HEADER_SORT[k];
                  const active = s && (sort === s.asc || sort === s.desc) ? (sort === s.asc ? 'asc' : 'desc') : null;
                  const label = CATALOG_COLUMN_LABELS[k];
                  return (
                    <th
                      key={k}
                      draggable
                      onDragStart={(e) => { setDragCol(k); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', k); } catch { /* Firefox requires setData */ } }}
                      onDragOver={(e) => { if (dragCol && dragCol !== k) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                      onDrop={(e) => { e.preventDefault(); if (dragCol) reorderColumns(dragCol, k); setDragCol(null); }}
                      onDragEnd={() => setDragCol(null)}
                      onClick={s ? () => headerSort(k) : undefined}
                      className={`sticky top-0 z-10 bg-gray-50 px-3 py-2 whitespace-nowrap select-none ${dragCol === k ? 'opacity-40' : ''} ${s ? 'cursor-pointer hover:text-gray-800' : ''}`}
                      title={s ? `Click to sort by ${label} — drag to reorder columns` : (COLUMN_TIPS[k] ? `${COLUMN_TIPS[k]} — drag to reorder` : 'Drag to reorder columns')}
                    >
                      <span className="inline-flex items-center gap-1">
                        {s && active === 'asc' && <CaretUp size={10} weight="bold" />}
                        {s && active === 'desc' && <CaretDown size={10} weight="bold" />}
                        <span>{label}</span>
                        <DotsSixVertical size={12} className="text-gray-300" />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const st = stats?.[p.id];
                const ageIso = p.publishedAt || p.createdAt;
                const endsIn = p.listingEndsAt ? endsInLabel(p.listingEndsAt, renderNowMs) : null;
                const myOffers = offersFor(p);
                const seoState = seoStatus(p);
                const justSeoed = seo.running && seo.doneIds.includes(p.id);
                const cells: Record<CatalogColumnKey, ReactNode> = {
                  product: (
                    <td className="px-3 py-1.5 max-w-[400px]">
                      <div className="flex items-center gap-2.5">
                        <div className="relative group w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-300 shrink-0 overflow-hidden">
                          <Package size={16} className="shrink-0" />
                          {p.images[0]?.url?.trim() ? (
                            <img src={p.images[0].url} alt="" loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          ) : null}
                          {p.images.length > 0 && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm(`Remove ${p.images.length === 1 ? 'the image' : `${p.images.length} images`} from "${p.name}"?`)) return;
                                try {
                                  setDbToken(await getFreshAccessToken());
                                  const remaining = p.images.filter((_, i) => i !== 0);
                                  const upd = await saveProductImages(p.id, remaining.map((img) => ({ url: img.url, alt: img.altText || '' })));
                                  if (upd) patchLocal(upd);
                                  notify('Image removed');
                                } catch (err) {
                                  notify(`Could not remove image: ${(err as Error).message}`, 'error');
                                }
                              }}
                              className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                              title="Remove image"
                            >
                              <X size={8} weight="bold" />
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => nav(`/admin/products/edit/${p.id}`)}
                          title={`Edit ${p.name}`}
                          className="min-w-0 text-left cursor-pointer group"
                        >
                          <p className="font-medium text-xs group-hover:text-blue-600 group-hover:underline break-words leading-tight" style={{ minWidth: 0 }}>{p.name}</p>
                          <p className="text-[10px] text-gray-400 break-words leading-tight">{p.brand}{p.sku ? ` · ${p.sku}` : ''}</p>
                        </button>
                      </div>
                    </td>
                  ),
                  category: (
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                      <div className="flex flex-col gap-0.5 min-w-[110px]">
                        <select
                          value={p.categoryId ?? ''}
                          onChange={(e) => void quickCategory(p, e.target.value)}
                          title="Quick-edit category"
                          className="text-[11px] font-semibold text-gray-600 border rounded px-1.5 py-0.5 cursor-pointer focus:outline-none bg-white max-w-[150px]"
                          aria-label={`Set ${p.name} category`}
                        >
                          <option value="">—</option>
                          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </td>
                  ),
                  status: (
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <select
                          value={p.status === 'active' ? 'active' : p.status}
                          onChange={(e) => void quickStatus(p, e.target.value as CatalogProduct['status'])}
                          title="Quick-edit status"
                          className="text-[11px] font-semibold border rounded px-1.5 py-0.5 cursor-pointer focus:outline-none bg-white"
                          aria-label={`Set ${p.name} status`}
                        >
                          <option value="active">Active</option>
                          <option value="ready">Ready</option>
                          <option value="draft">Draft</option>
                          <option value="inactive">Inactive</option>
                          <option value="archived">Archived</option>
                        </select>
                        <VisibilityBadge product={p} />
                      </div>
                    </td>
                  ),
                  price: (
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {priceEdit === p.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={priceDraft}
                            onChange={(e) => setPriceDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void savePrice(p); if (e.key === 'Escape') setPriceEdit(null); }}
                            className="w-18 px-1.5 py-0.5 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                            aria-label={`Edit price for ${p.name}`}
                          />
                          <button onClick={() => void savePrice(p)} title="Save price" className="p-1 text-green-600 hover:bg-green-50 rounded"><FloppyDisk size={13} /></button>
                          <button onClick={() => setPriceEdit(null)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={13} /></button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setPriceEdit(p.id); setPriceDraft(String(p.price)); }}
                          title="Click to edit price"
                          className="inline-flex items-center gap-1 group"
                        >
                          <span className="font-semibold text-xs text-gray-900">${p.price.toFixed(2)}</span>
                          <PencilSimple size={11} className="text-gray-300 group-hover:text-blue-500" />
                          {p.compareAtPrice > p.price && <span className="text-[10px] text-gray-400 line-through">${p.compareAtPrice.toFixed(2)}</span>}
                        </button>
                      )}
                    </td>
                  ),
                  margin: (
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                      {p.costPrice > 0 ? (
                        <span className="text-gray-500">${p.costPrice.toFixed(2)}</span>
                      ) : <span className="text-gray-300">—</span>}
                      {p.marginPercent != null && (
                        <span className={`ml-1.5 font-semibold ${p.marginPercent < 40 ? 'text-red-600' : 'text-green-700'}`}>{p.marginPercent.toFixed(0)}%</span>
                      )}
                    </td>
                  ),
                  stock: (
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                      {!p.trackInventory ? (
                        p.stockStatus === 'in_stock' ? (
                          <span className="text-green-700 font-medium">In stock</span>
                        ) : p.stockStatus === 'out_of_stock' ? (
                          <span className="text-red-600 font-medium">Out of stock</span>
                        ) : p.stockStatus === 'on_backorder' ? (
                          <span className="text-amber-600 font-medium">On backorder</span>
                        ) : (
                          <span className="text-green-700 font-medium">In stock</span>
                        )
                      ) : (
                        <span className={p.inventoryQty <= p.lowStockThreshold && p.lowStockThreshold > 0 ? 'text-red-600 font-semibold' : ''} title={`${INVENTORY_SOURCE_LABELS[p.inventorySource || 'UNKNOWN']} stock`}>
                          {p.inventoryQty <= 0 ? (p.stockStatus === 'out_of_stock' ? 'Out of stock' : '0') : p.inventoryQty}
                        </span>
                      )}
                      {p.inventoryQty > 0 && p.inventorySource === 'INTERNAL_STOCK' && <span className="text-[10px] text-gray-400 ml-1">internal</span>}
                    </td>
                  ),
                  views: (
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {stats == null ? (
                        <span className="text-xs text-gray-300" title={statsNote || 'Loading analytics…'}>—</span>
                      ) : (
                        <span className="relative inline-block group cursor-help">
                          <span className="text-xs text-gray-600">{st?.views ?? 0}</span>
                          <span className="pointer-events-none absolute left-0 top-full mt-1 z-30 hidden whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600 shadow-lg group-hover:block">
                            <span className="block font-semibold text-gray-800">Product views (first-party)</span>
                            <span className="block">Total (90d): {st?.views ?? 0}</span>
                            <span className="block">Last 7 days: {st?.views7d ?? 0}</span>
                            <span className="block">Last 30 days: {st?.views30d ?? 0}</span>
                            {statsNote && <span className="block text-amber-600">{statsNote}</span>}
                          </span>
                        </span>
                      )}
                    </td>
                  ),
                  interest: (
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {stats == null ? (
                        <span className="text-xs text-gray-300" title={statsNote || 'Loading analytics…'}>—</span>
                      ) : (
                        <span className="relative inline-block group cursor-help">
                          <span className="text-xs text-gray-600">{(st?.saved ?? 0) > 0 ? `${st?.saved} saved` : (st?.interest ?? 0)}</span>
                          <span className="pointer-events-none absolute left-0 top-full mt-1 z-30 hidden whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600 shadow-lg group-hover:block">
                            <span className="block font-semibold text-gray-800">Interest (90d, first-party)</span>
                            <span className="block">Saved: {st?.saved ?? 0} distinct visitors who saved and didn't remove</span>
                            <span className="block">Add-to-cart: {st?.interest ?? 0} events</span>
                            <span className="block text-gray-400">Saved counts come from the storefront wishlist hearts (site_events).</span>
                          </span>
                        </span>
                      )}
                    </td>
                  ),
                  age: (
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className="relative inline-block group cursor-help">
                        <span className="text-xs font-semibold text-gray-700">{ageLabel(ageIso, renderNowMs)}</span>
                        {ageIso && <span className="ml-1 text-[10px] text-gray-400">{timeLabel(ageIso)}</span>}
                        {endsIn && <span className="ml-1 text-[10px] text-amber-600">· {endsIn}</span>}
                        <span className="pointer-events-none absolute left-0 top-full mt-1 z-30 hidden whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600 shadow-lg group-hover:block">
                          <span className="block">Listed: {ageIso ? new Date(ageIso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</span>
                          <span className="block">Age: {ageIso ? `${renderNowMs === null ? '—' : Math.max(0, Math.floor((renderNowMs - new Date(ageIso).getTime()) / 86400000))} days · ${timeLabel(ageIso)}` : '—'}</span>
                          {p.publishedAt && <span className="block text-gray-400">First live: {new Date(p.publishedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                          {p.createdAt && p.createdAt !== p.publishedAt && <span className="block text-gray-400">Created: {new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                          {!p.publishedAt && <span className="block text-gray-400">Never published — age from created date ({p.createdAt ? new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'})</span>}
                          {p.listingEndsAt && <span className="block">Ends: {new Date(p.listingEndsAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                        </span>
                      </span>
                    </td>
                  ),
                  promotion: (
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className="relative inline-block">
                        <button
                          type="button"
                          onClick={(e) => { if (promoOpen === p.id) { setPromoOpen(null); setPromoAnchor(null); } else { setPromoOpen(p.id); setPromoAnchor(e.currentTarget); } }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap border ${p.saleEnabled || p.promoted ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}
                          title="Click to change promotion"
                        >
                          {promoLabel(p)}
                        </button>
                        <Popover anchor={promoAnchor} open={promoOpen === p.id} onClose={() => setPromoOpen(null)} width={240}>
                          <div className="p-3 text-xs">
                              <p className="font-semibold text-gray-800 mb-2">Promotion</p>
                              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                                <input type="checkbox" checked={p.promoted} onChange={(e) => void updateProduct(p.id, { promoted: e.target.checked }).then((u) => { patchLocal(u); notify(e.target.checked ? 'Product promoted' : 'Promotion removed'); }).catch((err) => notify(`Could not update: ${(err as Error).message}`, 'error'))} className="w-4 h-4" />
                                Promoted
                              </label>
                              <div className="flex items-center gap-1.5 mb-1">
                                <input
                                  type="number" min="0" step="0.01" defaultValue={p.saleEnabled && p.discountValue != null ? String(p.discountValue) : ''}
                                  placeholder="% off"
                                  className="w-20 px-1.5 py-1 border border-gray-200 rounded text-xs focus:outline-none"
                                  aria-label="Quick percent-off sale"
                                />
                                <button
                                  onClick={(e) => {
                                    const v = Number((e.currentTarget.previousElementSibling as HTMLInputElement).value);
                                    if (!Number.isFinite(v) || v <= 0 || v >= 100) { notify('Enter a valid percent between 1 and 99', 'error'); return; }
                                    void updateProduct(p.id, { saleEnabled: true, discountType: 'percent', discountValue: Math.round(v * 10) / 10, compareAtPrice: p.compareAtPrice > p.price ? p.compareAtPrice : p.price }).then((u) => { patchLocal(u); notify(`${v}% sale applied`); setPromoOpen(null); }).catch((err) => notify(`Could not update: ${(err as Error).message}`, 'error'));
                                  }}
                                  className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-[11px]"
                                >
                                  Apply %
                                </button>
                              </div>
                              <button onClick={() => void updateProduct(p.id, { saleEnabled: false, discountValue: undefined }).then((u) => { patchLocal(u); notify('Sale removed'); setPromoOpen(null); }).catch((err) => notify(`Could not update: ${(err as Error).message}`, 'error'))} className="text-[11px] text-gray-500 hover:underline mb-2">
                                Remove sale
                              </button>
                              {myOffers.length > 0 && (
                                <div className="border-t border-gray-100 pt-2 mt-1">
                                  <p className="text-[10px] text-gray-400 mb-1">Active store offers covering this product:</p>
                                  {myOffers.slice(0, 3).map((o) => <p key={o.id} className="text-[11px] text-purple-700">{o.name} — {o.offerType === 'percentage' ? `${o.value}%` : o.offerType === 'product_sale' ? `$${o.value?.toFixed(2)} off` : o.offerType.replace('_', ' ')}</p>)}
                                </div>
                              )}
                              <a href="/admin/promotions" className="block mt-2 text-[11px] font-semibold text-blue-600 hover:underline">Open Promotions →</a>
                          </div>
                        </Popover>
                      </span>
                    </td>
                  ),
                  readiness: (
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="relative inline-block group cursor-help">
                          <ReadinessBadge readiness={p.commerceReadiness ?? null} />
                          <span className="pointer-events-none absolute right-0 top-full mt-1 z-30 hidden whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600 shadow-lg group-hover:block">
                            {p.commerceReadiness === 'COMMERCE_READY' && <span>Storefront-eligible. Source, cost & fulfillment verified.</span>}
                            {p.commerceReadiness === 'SOURCE_PENDING' && <span>No verified purchasing path (retail-ref only or unknown source).</span>}
                            {p.commerceReadiness === 'ECONOMICS_PENDING' && <span>Supplier exists but cost/landed unknown.</span>}
                            {p.commerceReadiness === 'FULFILLMENT_PENDING' && <span>Cost known but stock/shipping not verified.</span>}
                            {p.commerceReadiness === 'RISK_REVIEW' && <span>Unresolved critical risk (battery/IP/regulatory).</span>}
                            {!p.commerceReadiness && <span>Not classified yet.</span>}
                          </span>
                        </span>
                        {justSeoed ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700"><CheckCircle size={10} weight="bold" />SEO done</span>
                        ) : seoState === 'complete' ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-600" title={seoExplain(p)}><CheckCircle size={10} />SEO</span>
                        ) : seoState === 'incomplete' ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600" title={seoExplain(p)}><Warning size={10} />SEO ~</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400" title="No SEO set — run Auto SEO"><Globe size={10} />SEO</span>
                        )}
                      </div>
                    </td>
                  ),
                  actions: (
                    <td className="px-3 py-1.5">
                      <span className="relative inline-block">
                        <button
                          type="button"
                          onClick={(e) => { if (rowMenu === p.id) { setRowMenu(null); setRowAnchor(null); } else { setRowMenu(p.id); setRowAnchor(e.currentTarget); } }}
                          className="p-1 hover:bg-gray-100 rounded text-gray-500"
                          title="Row actions"
                          aria-label={`Actions for ${p.name}`}
                        >
                          <DotsThreeVertical size={14} />
                        </button>
                        <Popover anchor={rowAnchor} open={rowMenu === p.id} onClose={() => setRowMenu(null)} width={192}>
                          <div className="py-1 text-sm">
                              {p.status === 'archived' ? (
                                <button onClick={() => { setRowMenu(null); void onRestore(p.id); }} className="w-full text-left px-3 py-2 hover:bg-amber-50 text-amber-600 flex items-center gap-2"><Copy size={14} />Restore to Draft</button>
                              ) : (
                                <>
                                  <button onClick={() => { setRowMenu(null); nav(`/admin/products/edit/${p.id}`); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><PencilSimple size={14} />Edit</button>
                                  <a href={productPath(p)} onClick={() => setRowMenu(null)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700"><ArrowSquareOut size={14} />View live</a>
                                  <button onClick={() => { setRowMenu(null); void onDuplicate(p.id); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><Copy size={14} />Duplicate</button>
                                  <button onClick={() => { setRowMenu(null); void runAutoSeo([p]); }} disabled={seo.running} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-purple-700"><Sparkle size={14} />Auto SEO</button>
                                  <button onClick={() => { setRowMenu(null); setListingModal(p); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><Clock size={14} />Listing duration…</button>
                                  <button onClick={() => { setRowMenu(null); setDelId(p.id); }} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash size={14} />Archive / Delete</button>
                                </>
                              )}
                          </div>
                        </Popover>
                      </span>
                    </td>
                  ),
                };
                return (
                  <tr key={p.id} className="border-t hover:bg-blue-50/40 transition-colors group/row" style={{ height: rowHeight }}>
                    <td className="px-3 py-1.5 relative">
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Select ${p.name}`} />
                      {/* Row resize handle */}
                      <div
                        className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize opacity-0 group-hover/row:opacity-100 transition-opacity"
                        onMouseDown={(e) => onRowResizeStart(e, p.id)}
                        title="Drag to resize row height"
                      />
                    </td>
                    {colOrder.map((k) => <Fragment key={k}>{cells[k]}</Fragment>)}
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-10 text-center text-gray-400 text-xs">No products match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={!!delId} onClose={() => setDelId(null)} title="Archive / Delete Product">
        <p className="text-gray-600 mb-3">Archive keeps the product for history and removes it from the storefront. Hard delete permanently removes the row and its images/variants.</p>
        <div className="flex gap-3">
          <button onClick={onArchive} disabled={archiving} className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-medium disabled:opacity-50">
            {archiving ? 'Archiving…' : 'Archive (recommended)'}
          </button>
          <button onClick={onHardDelete} className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-medium">Hard Delete</button>
          <button onClick={() => setDelId(null)} className="flex-1 py-2.5 border rounded-lg">Cancel</button>
        </div>
      </Modal>

      <Modal isOpen={bulkOpen} onClose={() => !bulkBusy && setBulkOpen(false)} title={`Archive / Delete ${selectedIds.size} Product${selectedIds.size === 1 ? '' : 's'}`}>
        <p className="text-gray-600 mb-3">Archive keeps history and removes them from the storefront. Hard delete permanently removes the rows and their images/variants. This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onBulkArchive} disabled={bulkBusy} className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-medium disabled:opacity-50">
            {bulkBusy ? 'Working…' : 'Archive (recommended)'}
          </button>
          <button onClick={onBulkHardDelete} disabled={bulkBusy} className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-medium disabled:opacity-50">
            {bulkBusy ? 'Working…' : 'Hard Delete'}
          </button>
          <button onClick={() => setBulkOpen(false)} disabled={bulkBusy} className="flex-1 py-2.5 border rounded-lg disabled:opacity-50">Cancel</button>
        </div>
      </Modal>

      {/* Bulk price adjustment with preview */}
      <Modal isOpen={priceBulk.open} onClose={() => !priceBulk.busy && setPriceBulk((s) => ({ ...s, open: false }))} title={`Adjust Price — ${selectedIds.size} Product${selectedIds.size === 1 ? '' : 's'}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" name="pm" checked={priceBulk.mode === 'dec-pct'} onChange={() => setPriceBulk((s) => ({ ...s, mode: 'dec-pct' }))} />Decrease by %</label>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" name="pm" checked={priceBulk.mode === 'inc-pct'} onChange={() => setPriceBulk((s) => ({ ...s, mode: 'inc-pct' }))} />Increase by %</label>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" name="pm" checked={priceBulk.mode === 'dec-fixed'} onChange={() => setPriceBulk((s) => ({ ...s, mode: 'dec-fixed' }))} />Decrease by $</label>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" name="pm" checked={priceBulk.mode === 'inc-fixed'} onChange={() => setPriceBulk((s) => ({ ...s, mode: 'inc-fixed' }))} />Increase by $</label>
            <label className="flex items-center gap-2 text-sm text-gray-600 col-span-2"><input type="radio" name="pm" checked={priceBulk.mode === 'set'} onChange={() => setPriceBulk((s) => ({ ...s, mode: 'set' }))} />Set exact price</label>
          </div>
          <input
            type="number" min="0.01" step="0.01" value={priceBulk.value}
            onChange={(e) => setPriceBulk((s) => ({ ...s, value: e.target.value }))}
            placeholder={priceBulk.mode.includes('pct') ? 'Percent (e.g. 5)' : 'Amount in USD (e.g. 2.00)'}
            className={I}
            aria-label="Price adjustment value"
          />
          {(() => {
            const v = Number(priceBulk.value);
            const targets = products.filter((p) => selectedIds.has(p.id));
            if (priceBulk.value.trim() === '' || !Number.isFinite(v) || v <= 0) return <p className="text-xs text-gray-400">Enter a valid positive value to preview.</p>;
            const samples = targets.slice(0, 5).map((p) => {
              let np = p.price;
              if (priceBulk.mode === 'inc-pct') np = p.price * (1 + v / 100);
              else if (priceBulk.mode === 'dec-pct') np = p.price * (1 - v / 100);
              else if (priceBulk.mode === 'inc-fixed') np = p.price + v;
              else if (priceBulk.mode === 'dec-fixed') np = p.price - v;
              else np = v;
              return { name: p.name.slice(0, 40), from: p.price, to: Math.round(np * 100) / 100 };
            });
            const anyInvalid = targets.some((p) => {
              let np = p.price;
              if (priceBulk.mode === 'inc-pct') np = p.price * (1 + v / 100);
              else if (priceBulk.mode === 'dec-pct') np = p.price * (1 - v / 100);
              else if (priceBulk.mode === 'inc-fixed') np = p.price + v;
              else if (priceBulk.mode === 'dec-fixed') np = p.price - v;
              else np = v;
              return Math.round(np * 100) / 100 <= 0;
            });
            return (
              <div className="bg-gray-50 rounded-lg p-3 text-xs">
                <p className="font-semibold text-gray-800 mb-1">{selectedIds.size} products selected — {PRICE_MODE_LABEL[priceBulk.mode]} {v}{priceBulk.mode.includes('pct') ? '%' : '$'}</p>
                {samples.map((s) => <p key={s.name} className="text-gray-500">${s.from.toFixed(2)} → <b>${s.to.toFixed(2)}</b> · {s.name}</p>)}
                {targets.length > 5 && <p className="text-gray-400 mt-1">…and {targets.length - 5} more</p>}
                {anyInvalid && <p className="text-red-600 font-semibold mt-1">This would produce a zero/negative price — nothing will be applied.</p>}
              </div>
            );
          })()}
          <div className="flex gap-3">
            <button onClick={applyBulkPrice} disabled={priceBulk.busy} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg font-medium">{priceBulk.busy ? 'Applying…' : 'Apply to selected'}</button>
            <button onClick={() => setPriceBulk((s) => ({ ...s, open: false }))} disabled={priceBulk.busy} className="flex-1 py-2.5 border rounded-lg disabled:opacity-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Listing duration (optional expiry — display only, never auto-enforced) */}
      <Modal isOpen={!!listingModal} onClose={() => setListingModal(null)} title="Listing Duration">
        {listingModal && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Optional eBay-style listing end date. This is seller visibility only — Himalayan Koh never auto-archives a product when the date passes; you decide what to do. Default is no expiry (Good ’Til Cancelled).</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['No expiry', null],
                ['7 days', '7'],
                ['30 days', '30'],
                ['60 days', '60'],
                ['90 days', '90'],
              ] as const).map(([label, days]) => (
                <button
                  key={label}
                  onClick={() => {
                    if (days === null) { void saveListingEnds(null); return; }
                    const d = new Date(Date.now() + Number(days) * 86400000);
                    void saveListingEnds(d.toISOString());
                  }}
                  className="py-2 border rounded-lg text-sm hover:bg-gray-50"
                >
                  {label}
                </button>
              ))}
              <label className="flex flex-col justify-center items-center gap-1 py-2 border rounded-lg text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                Custom
                <input
                  type="date"
                  className="text-xs border rounded px-1"
                  onChange={(e) => { if (e.target.value) void saveListingEnds(new Date(e.target.value + 'T23:59:59').toISOString()); }}
                />
              </label>
            </div>
            {listingModal.listingEndsAt && (
              <p className="text-xs text-amber-600">Currently ends {new Date(listingModal.listingEndsAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} ({endsInLabel(listingModal.listingEndsAt, renderNowMs) || '—'}).</p>
            )}
            <button onClick={() => setListingModal(null)} className="w-full py-2.5 border rounded-lg">Close</button>
          </div>
        )}
      </Modal>

      {autoPublishConfirm && (
        <Modal isOpen onClose={() => setAutoPublishConfirm(false)}>
          <div className="p-5 space-y-4 w-[440px] max-w-[92vw]">
            <h3 className="text-lg font-bold">Enable auto-listing?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              When ON, any product you save that is <b>commerce-ready</b> (full source, cost, stock
              &amp; shipping verified) is automatically published — status becomes <b>Active</b> and
              it appears on the storefront immediately. Drafts that are not yet commerce-ready stay
              drafts. You can turn this off any time.
            </p>
            <p className="text-sm bg-luxe-gold-soft border border-luxe-gold/30 rounded-xl px-4 py-3 text-luxe-gold-dark">
              {(() => {
                const readyDrafts = products.filter((p) =>
                  p.status !== 'active' && p.commerceReadiness === 'COMMERCE_READY'
                ).length;
                return readyDrafts > 0
                  ? <b>{readyDrafts} draft{readyDrafts === 1 ? '' : 's'} currently commerce-ready</b>
                  : <span>No drafts are commerce-ready right now — the next save that completes a draft will publish it.</span>;
              })()}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAutoPublishConfirm(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={() => void toggleAutoPublish(true)} disabled={autoPublishBusy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-50">
                {autoPublishBusy ? 'Enabling…' : 'Enable auto-list'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <CsvImportModal
        open={csvOpen}
        onClose={() => { if (!csvOpen) return; setCsvOpen(false); }}
        existing={products}
        cats={cats}
        notify={notify}
        onImported={load}
      />
    </div>
  );
}
// ============================================================================
// CSV BULK IMPORT MODAL (Zeedrop / supplier CSV → Luxedge drafts)
//
// Paste or upload a CSV, preview parsed rows, flag duplicates (item ID > URL >
// normalized title), then import the selected rows as DRAFT products with
// images + variants. Auto-publish is NEVER allowed here.
// ============================================================================
function CsvImportModal({ open, onClose, existing, cats, notify, onImported }: {
  open: boolean;
  onClose: () => void;
  existing: CatalogProduct[];
  cats: CatalogCategory[];
  notify: (msg: string, kind?: 'success' | 'error') => void;
  onImported: () => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<{ row: CsvImportRow; duplicate: DuplicateMatch | null }[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText(''); setFileName(''); setPreview(null); setSelected(new Set()); setErrors([]);
  };

  const parse = () => {
    const res = parseCsvImport(text);
    if (res.rows.length === 0) {
      setErrors(['No product rows found. Make sure the CSV has a title/name column and at least one data row.']);
      setPreview(null);
      return;
    }
    const candidates: DupCandidate[] = existing.map((p) => ({
      id: p.id, name: p.name, supplierUrl: p.supplierUrl, supplierProductRef: p.supplierProductRef,
    }));
    const classified = classifyDuplicates(res.rows, candidates);
    setPreview(classified);
    setErrors([
      ...res.skipped.map((s) => `Row ${s.line}: ${s.reason} (skipped)`),
      ...res.warnings,
      ...(res.rows.length > 50 ? [`Large import (${res.rows.length} rows) — imported as drafts, review before publishing.`] : []),
    ]);
    // Auto-select non-duplicate rows only
    setSelected(new Set(classified.map((_, i) => i).filter((i) => !classified[i].duplicate)));
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(f);
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(preview ? preview.map((_, i) => i) : []));
  const clearAll = () => setSelected(new Set());

  const importSelected = async () => {
    if (!preview) return;
    setBusy(true);
    let created = 0, dupSkipped = 0, failed = 0;
    const fails: string[] = [];
    for (const i of [...selected]) {
      const { row, duplicate } = preview[i];
      if (duplicate) { dupSkipped++; continue; }
      try {
        const catName = row.category?.trim().toLowerCase();
        const catId = catName ? cats.find((c) => c.name.toLowerCase() === catName)?.id ?? null : null;
        const input: ProductInput = {
          name: row.name,
          shortDescription: row.shortDescription,
          description: row.description,
          price: row.price,
          compareAtPrice: row.compareAtPrice,
          costPrice: row.costPrice,
          sku: row.sku,
          inventoryQty: row.inventoryQty,
          shippingCost: row.shippingCost,
          freeShipping: row.freeShipping,
          // Listing Playbook brand rule (e.g. HimalayanKoh) wins over row brand.
          brand: supplierBrandForUrl(row.supplierUrl, undefined) || row.brand || 'Himalayan Koh',
          categoryId: catId,
          tags: row.tags,
          supplierSource: row.supplierSource || 'Zeedrop',
          supplierUrl: row.supplierUrl,
          supplierProductRef: row.supplierProductRef,
          status: 'draft',
          ogImage: row.images[0] || undefined,
          evidenceNotes: `Imported via CSV${fileName ? ` (${fileName})` : ''}${row.supplierSource ? ` from ${row.supplierSource}` : ''}`,
        };
        const product = await createProduct(input);
        if (row.images.length > 0) {
          await saveProductImages(product.id, row.images.map((url, n) => ({
            url, isPrimary: n === 0, sortOrder: n, kind: 'product' as const,
          })), { reload: false });
        }
        if (row.variants.length > 0) {
          await saveProductVariants(product.id, row.variants.map((v) => ({ attributes: v.attributes })), { reload: false });
        }
        created++;
      } catch (e) {
        failed++;
        fails.push(`${row.name.slice(0, 48)}: ${(e as Error).message}`);
      }
    }
    notify(
      `CSV import: ${created} created as draft${dupSkipped ? ` · ${dupSkipped} duplicates skipped` : ''}${failed ? ` · ${failed} failed` : ''}`,
      failed ? 'error' : 'success',
    );
    if (fails.length) setErrors(fails.slice(0, 6));
    setBusy(false);
    reset();
    await onImported();
  };

  const DUP_LABEL: Record<string, string> = {
    supplierProductRef: 'Duplicate — same supplier item ID',
    supplierUrl: 'Duplicate — same supplier URL',
    title: 'Duplicate — same title',
  };

  return (
    <Modal isOpen={open} onClose={() => { if (!busy) onClose(); }} title="CSV Bulk Import — creates DRAFT products" size="lg">
      <div className="space-y-4">
        <div className="text-xs text-gray-500 leading-relaxed">
          Paste a Zeedrop / supplier CSV or upload a file. Recognized columns: title/name, price, compare/cost price,
          images (URLs separated by comma or newline), description, variants (<code className="bg-gray-100 px-1 rounded">Color:Red; Size:M</code>),
          supplier URL, item ID, source, brand, category, sku, stock, shipping cost, tags.
          Everything imports as <b>DRAFT</b> — nothing publishes automatically.
        </div>

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <button onClick={() => fileRef.current?.click()} className="px-3 py-2 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-50 flex items-center gap-1.5">
            <UploadSimple size={13} />{fileName || 'Upload .csv'}
          </button>
          <button
            onClick={parse}
            disabled={!text.trim()}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold"
          >
            Parse CSV
          </button>
          {fileName && (
            <button onClick={() => { setFileName(''); setText(''); setPreview(null); }} className="px-3 py-2 text-xs text-gray-500 hover:text-red-500">Clear file</button>
          )}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'title,price,images,supplier url\nPremium Dog Toy,12.99,https://…/a.jpg | https://…/b.jpg,https://supplier.com/item/123'}
          rows={6}
          className={`${I} font-mono text-xs`}
        />

        {errors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs space-y-1 max-h-28 overflow-auto">
            {errors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        )}

        {preview && (
          <>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{preview.length} rows parsed · {selected.size} selected</span>
              <span className="flex gap-2">
                <button onClick={selectAll} className="hover:text-indigo-600 font-semibold">Select all</button>
                <button onClick={clearAll} className="hover:text-red-500 font-semibold">Clear</button>
              </span>
            </div>
            <div className="border rounded-lg overflow-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-2 text-left"><input type="checkbox" checked={selected.size === preview.length && preview.length > 0} onChange={(e) => (e.target.checked ? selectAll() : clearAll())} /></th>
                    <th className="px-2 py-2 text-left">Title</th>
                    <th className="px-2 py-2 text-left">Price</th>
                    <th className="px-2 py-2 text-left">Images</th>
                    <th className="px-2 py-2 text-left">Supplier ref / URL</th>
                    <th className="px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map(({ row, duplicate }, i) => (
                    <tr key={i} className={duplicate ? 'bg-red-50/50' : ''}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} disabled={!!duplicate} />
                      </td>
                      <td className="px-2 py-1.5 max-w-[220px] truncate" title={row.name}>{row.name}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.price != null ? `$${row.price}` : '—'}</td>
                      <td className="px-2 py-1.5">{row.images.length > 0 ? `${row.images.length} img` : <span className="text-amber-600">no images</span>}</td>
                      <td className="px-2 py-1.5 max-w-[160px] truncate">{row.supplierProductRef || row.supplierUrl || '—'}</td>
                      <td className="px-2 py-1.5">
                        {duplicate ? (
                          <span className="text-red-600 font-medium" title={duplicate.product.name}>⚠ {DUP_LABEL[duplicate.field]}</span>
                        ) : (
                          <span className="text-gray-400">draft</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={importSelected}
                disabled={busy || selected.size === 0}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
              >
                {busy ? 'Importing…' : <>Import {selected.size} as Draft <FloppyDisk size={15} /></>}
              </button>
              <button onClick={() => { if (!busy) onClose(); }} className="px-6 py-2.5 border rounded-lg text-sm font-semibold disabled:opacity-40">Cancel</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ============================================================================
// AI INTELLIGENCE PANEL (Phase L — product-level research evidence)
//
// Shows Hermes / Salman OS research evidence that references this product.
// AI can NEVER change commerce readiness: readiness/source/economics stay
// authoritative from the Commerce Truth model. This panel is read-only
// research context (last research, confidence, source URLs, risks, and the
// recorded SEO/marketing opportunities from the suggestion).
// ============================================================================
function AiIntelPanel({ product }: { product: CatalogProduct }) {
  const [rows, setRows] = useState<HermesRecommendationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listRecommendations()
      .then((all) => {
        if (!alive) return;
        const hay = `${product.name} ${product.brand} ${product.sku} ${product.supplierProductRef || ''}`.toLowerCase();
        const matched = all.filter((r) => {
          const n = String(r.product_name || '').toLowerCase();
          return n && (hay.includes(n) || n.includes(product.name.toLowerCase()) || (r.source_ref && hay.includes(String(r.source_ref).toLowerCase())));
        });
        setRows(matched.slice(0, 6));
      })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [product.name, product.brand, product.sku, product.supplierProductRef]);

  return (
    <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-4">
      <p className="text-xs font-bold text-indigo-800 mb-2 flex items-center gap-1.5"><Brain size={13} />AI INTELLIGENCE — research evidence only</p>
      {loading ? <p className="text-[11px] text-gray-400">Loading research…</p> : rows.length === 0 ? (
        <p className="text-[11px] text-gray-500">No Hermes / Salman OS research references this product yet. AI can never change COMMERCE_READY / SOURCE_PENDING / ECONOMICS_PENDING / FULFILLMENT_PENDING / RISK_REVIEW — those are Commerce Truth decisions.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white rounded-lg border border-indigo-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-gray-800">{r.product_name}</p>
                <span className="text-[10px] text-gray-400">confidence {r.confidence === null ? '—' : `${Math.round(r.confidence * 100)}%`} · {r.source}</span>
              </div>
              {r.benefits && <p className="text-[11px] text-gray-600 mt-1"><b>SEO/marketing opportunity:</b> {r.benefits}</p>}
              {r.marketing_potential && <p className="text-[11px] text-gray-600 mt-0.5"><b>Marketing:</b> {r.marketing_potential}</p>}
              {r.risks && <p className="text-[11px] text-amber-700 mt-0.5"><b>Risks (research claim):</b> {r.risks}</p>}
              {r.source_url && <p className="text-[10px] mt-1"><a href={r.source_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">{r.source_url}</a></p>}
              <p className="text-[9px] text-gray-400 mt-1">Received {new Date(r.created_at).toLocaleString()} · research claims require Himalayan Koh verification before use.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PRODUCT EDITOR
// ============================================================================
type EditorTab = 'general' | 'pricing' | 'inventory' | 'shipping' | 'images' | 'variants' | 'promotions' | 'commerce' | 'seo';

// SEO is deliberately LAST — the owner asked for it to come at the end.
const TABS: { id: EditorTab; label: string; icon: React.ReactNode; required?: boolean }[] = [
  { id: 'general', label: 'General', icon: <Package size={14} />, required: true },
  { id: 'pricing', label: 'Pricing', icon: <CurrencyDollar size={14} />, required: true },
  { id: 'inventory', label: 'Inventory', icon: <Stack size={14} /> },
  { id: 'shipping', label: 'Shipping', icon: <Truck size={14} /> },
  { id: 'images', label: 'Images', icon: <ImageIcon size={14} />, required: true },
  { id: 'variants', label: 'Variants', icon: <List size={14} /> },
  { id: 'promotions', label: 'Promotions', icon: <Tag size={14} /> },
  { id: 'commerce', label: 'Commerce', icon: <Truck size={14} /> },
  { id: 'seo', label: 'SEO', icon: <Globe size={14} /> },
];

export function CatalogProductEditor() {
  const { id: paramId } = useParams<{ id: string }>();
  const isNew = !paramId;
  const nav = useNavigate();
  const { notify } = useApp();
  useDbToken();

  const [cats, setCats] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // A save that did not happen stays on screen. The toast it also raises is gone
  // after four seconds, which is how a refused save came to look like a save.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>('general');
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  // Quick Add = compact one-screen form; Detail Add = full tabbed editor;
  // AI Import = the shared AI product import engine (research → review → draft).
  // The mode can be deep-linked via ?mode=quick|detail|ai (e.g. from the
  // Dashboard Create Product cards).
  const [searchParams] = useSearchParams();
  const urlMode = searchParams.get('mode');
  const [mode, setMode] = useState<'quick' | 'detail' | 'ai'>(
    urlMode === 'detail' || urlMode === 'ai' ? urlMode : 'quick',
  );
  const [p, setP] = useState<CatalogProduct | null>(null);
  const [originalProduct, setOriginalProduct] = useState<CatalogProduct | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  // Status the product had when the editor loaded it. The Listing Playbook
  // gate blocks *publishing* (transition into Live); it must NOT block edits
  // of a listing that is already live — otherwise legacy live products
  // (e.g. imported Woo products with 1 image) become uneditable and even a
  // price change is rejected.
  const [originStatus, setOriginStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setHydrated(false);
      const cs = await listCategories();
      setCats(cs);
      if (paramId) {
        const prod = await getProduct(paramId, true);
        if (!prod) { notify('Product not found', 'error'); nav('/admin/products'); return; }
        setOriginStatus(prod.status);
        setP(prod);
        setOriginalProduct(prod);
        setDirtyFields(new Set());
        setHydrated(true);
      } else {
        const initialNew: CatalogProduct = {
          id: '', slug: '', name: '', shortDescription: '', description: '', features: [], specifications: {},
          categoryId: cs[0]?.id ?? null, categoryName: cs[0]?.name ?? '', brand: '', status: 'active',
          price: 0, compareAtPrice: 0, costPrice: 0, landedCost: 0, marginPercent: null, currency: 'USD',
          sku: '', inventoryQty: 0, stockStatus: 'in_stock', lowStockThreshold: 0, shippingCost: 0,
          freeShipping: false, deliveryMinDays: null, deliveryMaxDays: null, usInventory: false,
          tags: [], featured: false, newArrival: false, trending: false, bestRated: false, bestSeller: false,
          promoted: false, saleEnabled: false, seoTitle: '', seoDescription: '', seoTitleStored: null, seoDescriptionStored: null, seoKeywords: [],
          commerceReadiness: null, sourceType: null, inventorySource: null, fulfillmentMethod: null,
          supplierUrl: null, supplierStockStatus: null, riskFlags: [],
          images: [], variants: [], createdAt: '', updatedAt: '', publishedAt: null,
        };
        setP(initialNew);
        setOriginalProduct(initialNew);
        setOriginStatus(null);
        setDirtyFields(new Set());
        setHydrated(true);
      }
    } catch (e) {
      notify(`Could not load: ${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [paramId, nav]);

  useEffect(() => { void load(); }, [paramId]);

  const set = <K extends keyof CatalogProduct>(k: K, v: CatalogProduct[K]) => {
    setDirtyFields((prev) => new Set(prev).add(k));
    setP((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const handleSave = async (productOverride?: CatalogProduct) => {
    if (!hydrated || loading || saving) return;
    const productToSave = productOverride ?? p;
    if (!productToSave) return;
    if (!productToSave.name.trim()) { setSaveError('Product name is required.'); notify('Product name is required', 'error'); return; }
    if (!isNew && dirtyFields.size === 0 && !productOverride) {
      notify('No changes to save');
      return;
    }
    if (isNew && !(productToSave.price > 0)) { setSaveError('Price must be greater than 0.'); notify('Price must be greater than 0', 'error'); return; }
    if (dirtyFields.has('price') && !(productToSave.price > 0)) { setSaveError('Price must be greater than 0.'); notify('Price must be greater than 0', 'error'); return; }
    const currentProduct = productToSave;
    // Already-live listing: edits (price, inventory, status, copy…) must save.
    // Playbook gaps become loud warnings instead of hard blockers.
    const wasLive = originStatus === 'active';
    if (currentProduct.images.length === 0 && !wasLive && (isNew || dirtyFields.has('images'))) {
      const msg = 'At least one image is required before activating a premium listing.';
      setSaveError(msg); notify(msg, 'error'); setTab('images'); return;
    }
    // Listing Playbook gate — publishing a listing as Live needs verified
    // images (no placeholders / inline base64) and supplier data. Draft
    // saves and edits of already-live products get non-blocking warnings;
    // only the transition into Live is blocked, with the exact reason.
    const pb = await getListingPlaybook();
    const verdict = validateListingAgainstPlaybook(pb, {
      name: currentProduct.name,
      status: currentProduct.status,
      categoryName: currentProduct.categoryName,
      images: currentProduct.images,
      supplierUrl: currentProduct.supplierUrl,
      supplierName: currentProduct.supplierSource,
      supplierSku: currentProduct.supplierProductRef,
    });
    if (currentProduct.status === 'active' && !verdict.ok && !wasLive) {
      const msg = `Cannot save as Live: ${verdict.errors.join(' ')}`;
      setSaveError(msg);
      notify(msg, 'error');
      setTab('images');
      return;
    }
    if (currentProduct.status === 'active' && !verdict.ok && wasLive) {
      console.warn(`Playbook gaps on live product: ${verdict.errors.join(' ')}`);
    }
    if (verdict.warnings.length) {
      console.warn(`Listing warnings: ${verdict.warnings.join(' ')}`);
    }
    setSaveError(null);
    setSaving(true);
    try {
      // Refresh the session token before writing — a form left open past the
      // 1h JWT expiry must not fail the save with Supabase 401 "JWT expired".
      setDbToken(await getFreshAccessToken());
      const isWoo = isWooId(currentProduct.id);

      let saved: CatalogProduct | null = null;
      if (isNew) {
        const input: ProductInput = {
          name: currentProduct.name.trim(),
          shortTitle: currentProduct.shortTitle,
          subtitle: currentProduct.subtitle,
          shortDescription: currentProduct.shortDescription,
          description: currentProduct.description,
          features: currentProduct.features,
          specifications: currentProduct.specifications,
          categoryId: currentProduct.categoryId,
          brand: currentProduct.brand,
          status: currentProduct.status,
          price: currentProduct.price,
          compareAtPrice: currentProduct.compareAtPrice,
          costPrice: currentProduct.costPrice,
          landedCost: currentProduct.landedCost,
          currency: currentProduct.currency,
          sku: currentProduct.sku,
          inventoryQty: currentProduct.inventoryQty,
          stockStatus: currentProduct.stockStatus,
          lowStockThreshold: currentProduct.lowStockThreshold,
          shippingCost: currentProduct.shippingCost,
          freeShipping: currentProduct.freeShipping,
          deliveryMinDays: currentProduct.deliveryMinDays,
          deliveryMaxDays: currentProduct.deliveryMaxDays,
          shippingNote: currentProduct.shippingNote,
          usInventory: currentProduct.usInventory,
          supplierSource: currentProduct.supplierSource,
          supplierProductRef: currentProduct.supplierProductRef,
          commerceReadiness: currentProduct.commerceReadiness,
          sourceType: currentProduct.sourceType,
          inventorySource: currentProduct.inventorySource,
          fulfillmentMethod: currentProduct.fulfillmentMethod,
          supplierUrl: currentProduct.supplierUrl,
          supplierStockStatus: currentProduct.supplierStockStatus,
          riskFlags: currentProduct.riskFlags,
          tags: currentProduct.tags,
          featured: currentProduct.featured,
          newArrival: currentProduct.newArrival,
          trending: currentProduct.trending,
          bestRated: currentProduct.bestRated,
          bestSeller: currentProduct.bestSeller,
          promoted: currentProduct.promoted,
          saleEnabled: currentProduct.saleEnabled,
          discountType: currentProduct.discountType,
          discountValue: currentProduct.discountValue,
          seoTitle: currentProduct.seoTitle,
          seoDescription: currentProduct.seoDescription,
          seoKeywords: currentProduct.seoKeywords,
          canonicalSlug: currentProduct.canonicalSlug,
          ogImage: currentProduct.ogImage,
          ownerNotes: currentProduct.ownerNotes,
          evidenceNotes: currentProduct.evidenceNotes,
        };
        saved = await createProduct(input);
      } else {
        // True PATCH / merge semantics: only touched fields are sent to the backend
        const patch: Partial<ProductInput> = {};
        if (dirtyFields.has('name')) patch.name = currentProduct.name.trim();
        if (dirtyFields.has('shortTitle')) patch.shortTitle = currentProduct.shortTitle;
        if (dirtyFields.has('subtitle')) patch.subtitle = currentProduct.subtitle;
        if (dirtyFields.has('shortDescription')) patch.shortDescription = currentProduct.shortDescription;
        if (dirtyFields.has('description')) patch.description = currentProduct.description;
        if (dirtyFields.has('features')) patch.features = currentProduct.features;
        if (dirtyFields.has('specifications')) patch.specifications = currentProduct.specifications;
        if (dirtyFields.has('categoryId')) patch.categoryId = currentProduct.categoryId;
        if (dirtyFields.has('brand')) patch.brand = currentProduct.brand;
        if (dirtyFields.has('status')) patch.status = currentProduct.status;
        if (dirtyFields.has('price')) patch.price = currentProduct.price;
        if (dirtyFields.has('compareAtPrice')) patch.compareAtPrice = currentProduct.compareAtPrice;
        if (dirtyFields.has('costPrice')) patch.costPrice = currentProduct.costPrice;
        if (dirtyFields.has('landedCost')) patch.landedCost = currentProduct.landedCost;
        if (dirtyFields.has('currency')) patch.currency = currentProduct.currency;
        if (dirtyFields.has('sku')) patch.sku = currentProduct.sku;
        if (dirtyFields.has('inventoryQty')) patch.inventoryQty = currentProduct.inventoryQty;
        if (dirtyFields.has('stockStatus')) patch.stockStatus = currentProduct.stockStatus;
        if (dirtyFields.has('lowStockThreshold')) patch.lowStockThreshold = currentProduct.lowStockThreshold;
        if (dirtyFields.has('shippingCost')) patch.shippingCost = currentProduct.shippingCost;
        if (dirtyFields.has('freeShipping')) patch.freeShipping = currentProduct.freeShipping;
        if (dirtyFields.has('deliveryMinDays')) patch.deliveryMinDays = currentProduct.deliveryMinDays;
        if (dirtyFields.has('deliveryMaxDays')) patch.deliveryMaxDays = currentProduct.deliveryMaxDays;
        if (dirtyFields.has('shippingNote')) patch.shippingNote = currentProduct.shippingNote;
        if (dirtyFields.has('usInventory')) patch.usInventory = currentProduct.usInventory;
        if (dirtyFields.has('supplierSource')) patch.supplierSource = currentProduct.supplierSource;
        if (dirtyFields.has('supplierProductRef')) patch.supplierProductRef = currentProduct.supplierProductRef;
        if (dirtyFields.has('commerceReadiness')) patch.commerceReadiness = currentProduct.commerceReadiness;
        if (dirtyFields.has('sourceType')) patch.sourceType = currentProduct.sourceType;
        if (dirtyFields.has('inventorySource')) patch.inventorySource = currentProduct.inventorySource;
        if (dirtyFields.has('fulfillmentMethod')) patch.fulfillmentMethod = currentProduct.fulfillmentMethod;
        if (dirtyFields.has('supplierUrl')) patch.supplierUrl = currentProduct.supplierUrl;
        if (dirtyFields.has('supplierStockStatus')) patch.supplierStockStatus = currentProduct.supplierStockStatus;
        if (dirtyFields.has('riskFlags')) patch.riskFlags = currentProduct.riskFlags;
        if (dirtyFields.has('tags')) patch.tags = currentProduct.tags;
        if (dirtyFields.has('featured')) patch.featured = currentProduct.featured;
        if (dirtyFields.has('newArrival')) patch.newArrival = currentProduct.newArrival;
        if (dirtyFields.has('trending')) patch.trending = currentProduct.trending;
        if (dirtyFields.has('bestRated')) patch.bestRated = currentProduct.bestRated;
        if (dirtyFields.has('bestSeller')) patch.bestSeller = currentProduct.bestSeller;
        if (dirtyFields.has('promoted')) patch.promoted = currentProduct.promoted;
        if (dirtyFields.has('saleEnabled')) patch.saleEnabled = currentProduct.saleEnabled;
        if (dirtyFields.has('discountType')) patch.discountType = currentProduct.discountType;
        if (dirtyFields.has('discountValue')) patch.discountValue = currentProduct.discountValue;
        if (dirtyFields.has('seoTitle')) patch.seoTitle = currentProduct.seoTitle;
        if (dirtyFields.has('seoDescription')) patch.seoDescription = currentProduct.seoDescription;
        if (dirtyFields.has('seoKeywords')) patch.seoKeywords = currentProduct.seoKeywords;
        if (dirtyFields.has('canonicalSlug')) patch.canonicalSlug = currentProduct.canonicalSlug;
        if (dirtyFields.has('ogImage')) patch.ogImage = currentProduct.ogImage;
        if (dirtyFields.has('ownerNotes')) patch.ownerNotes = currentProduct.ownerNotes;
        if (dirtyFields.has('evidenceNotes')) patch.evidenceNotes = currentProduct.evidenceNotes;

        if (isWoo && dirtyFields.has('images')) {
          (patch as Record<string, unknown>).images = currentProduct.images;
        }

        saved = await updateProduct(currentProduct.id, patch);
      }
      if (!saved) throw new Error('The backend did not return the saved product.');
      const imagePayload = currentProduct.images.map((img, i) => ({
        id: img.id || undefined,
        url: img.url,
        altText: img.altText,
        kind: img.kind,
        isPrimary: img.isPrimary,
        sortOrder: i,
        variantId: img.variantId || null,
      }));
      const variantPayload = currentProduct.variants.map((v) => ({
        id: v.id || undefined,
        attributes: v.attributes,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        costPrice: v.costPrice,
        inventoryQty: v.inventoryQty,
        status: v.status,
        lowStockThreshold: v.lowStockThreshold,
      }));

      // Parallelize image and variant DB writes (for local products; Woo images are updated atomically above)
      if (!isWoo) {
        const writes = [];
        if (dirtyFields.has('images')) writes.push(saveProductImages(saved.id, imagePayload, { reload: false }));
        if (dirtyFields.has('variants')) writes.push(saveProductVariants(saved.id, variantPayload, { reload: false }));
        if (writes.length) await Promise.all(writes);
      }
      // Auto-list: if enabled and this save made the product commerce-ready
      // while it was still a draft, publish it (status → active) so it shows
      // on the storefront without a second manual step. The playbook gate
      // applies here too — never auto-publish a listing that fails it.
      const wasDraft = saved.status !== 'active';
      if (wasDraft && saved.commerceReadiness === 'COMMERCE_READY' && verdict.ok && (await getAutoPublishEnabled())) {
        const published = await updateProduct(saved.id, { status: 'active' });
        if (published) notify('Auto-published — product is commerce-ready.');
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
      notify(isNew ? 'Product created' : 'Product saved');
      setSaveError(null);
      // The product row response predates the image/variant writes above. Do
      // not replace local state with that stale row or a newly imported image
      // appears briefly and then vanishes from the editor.
      const refreshed = await getProduct(saved.id, true);
      const nextProduct = refreshed ?? { ...saved, images: currentProduct.images, variants: currentProduct.variants };
      if (isNew) {
        nav(`/admin/products/edit/${saved.id}`);
      } else {
        setP(nextProduct);
        setOriginalProduct(nextProduct);
        setDirtyFields(new Set());
      }
    } catch (e) {
      setSaveStatus('idle');
      // The store's own words, translated — and kept on screen, because a toast
      // that vanishes leaves the owner believing the save went through.
      const message = humanSaveError((e as Error).message);
      setSaveError(message);
      notify(`Save failed: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addTag = (t: string) => { const v = t.trim(); if (v && !p?.tags.includes(v)) set('tags', [...(p?.tags || []), v]); };
  const removeTag = (t: string) => set('tags', (p?.tags || []).filter((x) => x !== t));

  // Create a category on the fly (persists to Supabase) and select it.
  const addCategory = async (name: string): Promise<CatalogCategory | null> => {
    const n = name.trim();
    if (!n) { notify('Category name is required', 'error'); return null; }
    const existing = cats.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) { set('categoryId', existing.id); notify(`Category "${existing.name}" already exists — selected`, 'error'); return existing; }
    setAddingCat(true);
    try {
      const c = await createCategory({ name: n });
      setCats((prev) => [...prev, c]);
      set('categoryId', c.id);
      notify(`Category "${c.name}" added`);
      setNewCatOpen(false); setNewCatName('');
      return c;
    } catch (e) {
      notify(`Could not save category: ${(e as Error).message}`, 'error');
      return null;
    } finally { setAddingCat(false); }
  };

  if (loading || !hydrated || !p) {
    return (
      <div className="space-y-4 animate-pulse" role="status" aria-label="Loading product editor">
        <div className="h-12 bg-gray-100 rounded-xl border border-gray-200" />
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-lg" />
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="h-28 bg-gray-100 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sticky action bar (mobile): Save / status stay reachable while the
          form scrolls and the on-screen keyboard never buries the primary
          action. Harmless on desktop where the same bar stays above the fold. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <button onClick={() => nav('/admin/products')} className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0"><ArrowLeft size={16} /></button>
        <h1 className="font-bold text-gray-800 whitespace-nowrap">{isNew ? 'Add Product' : 'Edit Product'}</h1>
        <span className="h-4 w-px bg-gray-200 shrink-0" aria-hidden="true" />
        {isNew && (
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 shrink-0">
            <button onClick={() => setMode('quick')} className={`btn-glow px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${mode === 'quick' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>⚡ Quick</button>
            <button onClick={() => setMode('detail')} className={`btn-glow px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${mode === 'detail' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>Detail</button>
            <button onClick={() => setMode('ai')} className={`btn-glow px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${mode === 'ai' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`} title="AI Import — research any product URL and save as a draft">✨ AI Import</button>
          </div>
        )}
        <button onClick={() => nav('/admin/listing-playbook')} className="px-2.5 py-1.5 border border-blue-200 bg-blue-50 rounded-lg text-[11px] font-semibold text-blue-700 hover:bg-blue-100 flex items-center gap-1 shrink-0" title="Listing Playbook — listing rules applied on save">
          <BookBookmark size={13} /> Playbook
        </button>
        <div className="flex-1" />
        {!isNew && mode !== 'ai' && (
          <>
            <button onClick={() => nav(productPath(p))} title="Preview product page" className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-green-600 hover:bg-green-50 flex items-center gap-1.5 shrink-0"><Eye size={14} /> Preview</button>
            <a href={productPath(p)} title="View live on storefront" className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 flex items-center gap-1.5 shrink-0"><ArrowSquareOut size={14} /> View</a>
          </>
        )}
        {mode !== 'ai' && (
          <>
            <div className="relative shrink-0">
              <select value={p.status} onChange={(e) => set('status', e.target.value as CatalogProduct['status'])} className="appearance-none pl-2 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs font-medium bg-white cursor-pointer" aria-label="Product status">
                <option value="active">Live</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><CaretDown size={11} /></span>
            </div>
            {saveStatus === 'saved' && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 shrink-0">
                <CheckCircle size={14} weight="bold" /> Saved
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-xs text-blue-600 font-medium animate-pulse flex items-center gap-1 shrink-0">
                Saving…
              </span>
            )}
            <button onClick={() => void handleSave()} disabled={saving || loading || !hydrated} className="btn-glow px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0">
              <FloppyDisk size={14} />{saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        {/* A refused save, where the owner is looking. It stays until the next
            save attempt, so an edit that did not reach the store cannot be
            mistaken for one that did. */}
        {saveError && (
          <div role="alert" className="w-full flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            <Warning size={14} weight="bold" className="mt-0.5 shrink-0" />
            <span className="flex-1">Not saved — {saveError}</span>
            <button type="button" onClick={() => setSaveError(null)} aria-label="Dismiss save error" className="shrink-0 text-red-700 hover:text-red-900">
              <X size={13} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {isNew && mode === 'quick' && <QuickAddForm product={p} cats={cats} onChange={setP} onAddCategory={addCategory} />}

      {isNew && mode === 'ai' && <AIImportPanel />}

      {(!isNew || mode === 'detail') && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${tab === t.id ? 'bg-blue-500 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      )}

      {(!isNew || mode === 'detail') && <div className="bg-white rounded-xl border p-5">
        {/* ── GENERAL ── */}
        {tab === 'general' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className={L}>Product name <span className="text-red-500">*</span> <span className="normal-case font-normal text-gray-400">required</span></label><input value={p.name} onChange={(e) => set('name', e.target.value)} className={I} placeholder="e.g. Handcrafted Himalayan Pink Salt Lamp (Natural Shape)" /></div>
            <div><label className={L}>Short title <span className="normal-case font-normal text-gray-400">(optional)</span></label><input value={p.shortTitle || ''} onChange={(e) => set('shortTitle', e.target.value)} className={I} /></div>
            <div><label className={L}>Subtitle <span className="normal-case font-normal text-gray-400">(optional)</span></label><input value={p.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)} className={I} /></div>
            <div className="sm:col-span-2"><label className={L}>Short description <span className="normal-case font-normal text-gray-400">(optional)</span></label><textarea value={p.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} rows={2} className={I} /></div>
            <div className="sm:col-span-2"><label className={L}>Description <span className="normal-case font-normal text-gray-400">(optional)</span></label><textarea value={p.description} onChange={(e) => set('description', e.target.value)} rows={6} className={I} placeholder="Concise opening benefit, key features, practical use, sizing, care. No fake claims." /></div>
            <div>
              <label className={L}>Category</label>
              <div className="flex gap-1.5">
                <select value={p.categoryId || ''} onChange={(e) => set('categoryId', e.target.value || null)} className={I}>
                  <option value="">— Uncategorized —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => { setNewCatOpen(!newCatOpen); setNewCatName(''); }} className="shrink-0 px-3 border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold whitespace-nowrap">+ Add</button>
              </div>
              {newCatOpen && (
                <div className="flex gap-1.5 mt-1.5">
                  <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addCategory(newCatName); }} placeholder="New category name" className={I} autoFocus />
                  <button type="button" onClick={() => void addCategory(newCatName)} disabled={addingCat || !newCatName.trim()} className="shrink-0 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold whitespace-nowrap">{addingCat ? 'Adding…' : 'Add'}</button>
                </div>
              )}
            </div>
            <div><label className={L}>Brand <span className="normal-case font-normal text-gray-400">(optional)</span></label><input value={p.brand} onChange={(e) => set('brand', e.target.value)} className={I} placeholder="e.g. Himalayan Koh" /></div>
            <div className="sm:col-span-2">
              <label className={L}>Tags</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {p.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">{t}<button onClick={() => removeTag(t)}><X size={11} /></button></span>
                ))}
                <input
                  className="flex-1 min-w-[140px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none"
                  placeholder="Add tag + Enter"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
                />
              </div>
            </div>
            <div className="sm:col-span-2"><label className={L}>Owner notes <span className="normal-case font-normal text-gray-400">(admin only)</span></label><textarea value={p.ownerNotes || ''} onChange={(e) => set('ownerNotes', e.target.value)} rows={2} className={I} /></div>
          </div>
        )}

        {/* ── PRICING ── */}
        {tab === 'pricing' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className={L}>Supplier cost (USD)</label><input type="number" min="0" step="0.01" value={p.costPrice || ''} onChange={(e) => set('costPrice', +e.target.value)} className={I} /></div>
            <div><label className={L}>Landed cost (USD) — freight verified</label><input type="number" min="0" step="0.01" value={p.landedCost || ''} onChange={(e) => set('landedCost', +e.target.value)} className={I} /></div>
            <div><label className={L}>Retail price (USD) <span className="text-red-500">*</span> <span className="normal-case font-normal text-gray-400">required</span></label><input type="number" min="0" step="0.01" value={p.price || ''} onChange={(e) => set('price', +e.target.value)} className={I} /></div>
            <div><label className={L}>Compare-at price (USD) — genuine promo value only</label><input type="number" min="0" step="0.01" value={p.compareAtPrice || ''} onChange={(e) => set('compareAtPrice', +e.target.value)} className={I} /></div>
            <div className="sm:col-span-2 bg-gray-50 rounded-lg p-4 text-sm">
              <p className="font-semibold mb-1">Margin check</p>
              {p.costPrice > 0 && p.price > 0
                ? <p className="text-gray-600">Est. margin {(100 - (p.costPrice / p.price) * 100).toFixed(1)}% (landed cost {p.landedCost > 0 ? `$${p.landedCost.toFixed(2)}` : 'unknown'}). {p.landedCost <= 0 ? <span className="text-amber-600">Flag: landed cost unknown — verify freight before final publishing.</span> : null}</p>
                : <p className="text-gray-400">Enter a cost and price to see estimated margin.</p>}
            </div>
          </div>
        )}

        {/* ── INVENTORY ── */}
        {tab === 'inventory' && (
          <div className="space-y-5">
            <div className="bg-gray-50 border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-2xl font-black text-gray-900 mt-0.5">
                  {!p.trackInventory ? (
                    <span className="text-emerald-700 text-xl font-bold">
                      {p.stockStatus === 'in_stock' ? 'In stock' : p.stockStatus === 'out_of_stock' ? 'Out of stock' : 'On backorder'}{' '}
                      <span className="text-sm font-normal text-gray-500">(unmanaged)</span>
                    </span>
                  ) : (
                    <>{p.inventoryQty} <span className="text-sm font-normal text-gray-500">units available</span></>
                  )}
                </p>
                {p.supplierSource === 'Own Stock' || p.inventorySource === 'INTERNAL_STOCK' || !p.supplierSource ? (
                  <p className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1">
                    <CheckCircle size={13} weight="bold" /> Own Stock is authoritative — internal quantity controls storefront availability.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Source: {p.supplierSource}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  Last updated: {p.updatedAt ? new Date(p.updatedAt).toLocaleString() : 'Just now'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Stock Stepper</label>
                <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white shadow-xs p-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(0, p.inventoryQty - 1);
                      set('inventoryQty', next);
                      if (next === 0 && p.stockStatus === 'in_stock') set('stockStatus', 'out_of_stock');
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 active:bg-gray-200 font-bold text-base transition-colors"
                    aria-label="Decrease stock"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={p.inventoryQty}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      set('inventoryQty', val);
                      if (val === 0 && p.stockStatus === 'in_stock') set('stockStatus', 'out_of_stock');
                      else if (val > 0 && p.stockStatus === 'out_of_stock') set('stockStatus', 'in_stock');
                    }}
                    className="w-18 text-center text-sm font-bold text-gray-800 focus:outline-none"
                    aria-label="Stock quantity"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = p.inventoryQty + 1;
                      set('inventoryQty', next);
                      if (p.stockStatus === 'out_of_stock') set('stockStatus', 'in_stock');
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 active:bg-gray-200 font-bold text-base transition-colors"
                    aria-label="Increase stock"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={L}>SKU</label><input value={p.sku} onChange={(e) => set('sku', e.target.value)} className={I} /></div>
              <div><label className={L}>Stock status</label>
                <select value={p.stockStatus} onChange={(e) => set('stockStatus', e.target.value as CatalogProduct['stockStatus'])} className={I}>
                  <option value="in_stock">In stock</option>
                  <option value="low_stock">Low stock</option>
                  <option value="out_of_stock">Out of stock</option>
                  <option value="on_backorder">On backorder</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div><label className={L}>Low stock threshold</label><input type="number" min="0" value={p.lowStockThreshold} onChange={(e) => set('lowStockThreshold', +e.target.value)} className={I} /></div>
              <div className="flex items-center gap-2 pt-6">
                <input id="us-inv" type="checkbox" checked={p.usInventory} onChange={(e) => set('usInventory', e.target.checked)} className="w-4 h-4" />
                <label htmlFor="us-inv" className="text-sm text-gray-600">USA inventory verified (real warehouse evidence)</label>
              </div>
            </div>
          </div>
        )}

        {/* ── SHIPPING ── */}
        {tab === 'shipping' && <ShippingTab product={p} set={set} />}

        {/* ── IMAGES ── */}
        {tab === 'images' && <ImageManager product={p} onProduct={(next) => setP(next)} />}

        {/* ── VARIANTS ── */}
        {tab === 'variants' && <VariantManager product={p} onProduct={(next) => setP(next)} />}

        {/* ── SEO ── */}
        {tab === 'seo' && <SeoTab product={p} cats={cats} set={set} onSave={handleSave} />}

        {/* ── COMMERCE / SOURCING ── */}
        {tab === 'commerce' && (
          <div className="space-y-5">
            {/* Sourcing & Inventory Choice */}
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Inventory & Sourcing Model</h3>
                <p className="text-xs text-gray-500 mt-0.5">Select how this product is sourced and stocked. Himalayan Koh uses 4 verified options.</p>
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                {(['Own Stock', 'Amazon', 'eBay', 'Walmart'] as const).map((src) => {
                  const isSelected = p.supplierSource === src || (!p.supplierSource && src === 'Own Stock');
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => {
                        set('supplierSource', src);
                        if (src === 'Own Stock') {
                          set('sourceType', 'OWNER_STOCK');
                          set('inventorySource', 'INTERNAL_STOCK');
                        } else {
                          set('sourceType', 'OTHER_VERIFIED');
                          set('inventorySource', 'SUPPLIER_VERIFIED');
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">{src}</span>
                        {isSelected && <CheckCircle size={16} weight="bold" className="text-blue-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {src === 'Own Stock'
                          ? 'Internal warehouse stock. Physical inventory is authoritative.'
                          : `External ${src} product reference.`}
                      </p>
                    </button>
                  );
                })}
              </div>

              {p.supplierSource && p.supplierSource !== 'Own Stock' && (
                <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <label className={L}>External Product / Listing URL</label>
                    <input
                      value={p.supplierUrl || ''}
                      onChange={(e) => set('supplierUrl', e.target.value)}
                      className={I}
                      placeholder="https://… (external reference URL)"
                    />
                  </div>
                  <div>
                    <label className={L}>External SKU / Item ID / ASIN</label>
                    <input
                      value={p.supplierProductRef || ''}
                      onChange={(e) => set('supplierProductRef', e.target.value)}
                      className={I}
                      placeholder="e.g. B08XYZ1234 or Item #"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Simplified Readiness Overview Card */}
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Final Readiness Summary</h3>
                  <p className="text-xs text-gray-500">Commercial readiness required for storefront publication.</p>
                </div>
                <ReadinessBadge readiness={p.commerceReadiness} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Status</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5 capitalize">{p.status}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Publication</p>
                  <div className="mt-0.5"><VisibilityBadge product={p} /></div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Inventory Source</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{p.supplierSource || 'Own Stock'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Stock</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{p.inventoryQty} units</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Selling Price</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">${p.price.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Cost</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{p.costPrice > 0 ? `$${p.costPrice.toFixed(2)}` : '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Margin</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{p.marginPercent != null ? `${p.marginPercent.toFixed(1)}%` : '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Shipping</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{p.freeShipping ? 'Free' : p.shippingCost > 0 ? `$${p.shippingCost.toFixed(2)}` : 'Calculated'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Delivery</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{p.deliveryMinDays && p.deliveryMaxDays ? `${p.deliveryMinDays}–${p.deliveryMaxDays}d` : 'Standard'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Risk Flags</p>
                  <p className={`text-sm font-bold mt-0.5 ${p.riskFlags?.length ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {p.riskFlags?.length ? `${p.riskFlags.length} flagged` : 'Clean'}
                  </p>
                </div>
              </div>

              {p.riskFlags && p.riskFlags.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                  <p className="font-semibold text-amber-800 flex items-center gap-1.5"><Warning size={14} /> Attention required:</p>
                  {p.riskFlags.map((rf) => <p key={rf} className="text-amber-700 ml-4">• {rf}</p>)}
                </div>
              )}

              {/* Collapsible Advanced Details */}
              <details className="group border rounded-lg p-3 bg-gray-50/50">
                <summary className="text-xs font-semibold text-gray-600 cursor-pointer flex items-center justify-between">
                  <span>Advanced details & diagnostics</span>
                  <span className="text-xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-3 text-xs">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><span className="text-gray-500">Source Type:</span> <span className="font-mono">{p.sourceType || 'UNKNOWN'}</span></div>
                    <div><span className="text-gray-500">Inventory Source:</span> <span className="font-mono">{p.inventorySource || 'UNKNOWN'}</span></div>
                    <div><span className="text-gray-500">Fulfillment Method:</span> <span className="font-mono">{p.fulfillmentMethod || 'Internal Warehouse'}</span></div>
                    <div><span className="text-gray-500">Landed Cost:</span> <span className="font-mono">${p.landedCost || 0}</span></div>
                  </div>
                  {p.evidenceNotes && (
                    <div className="p-2 bg-white rounded border">
                      <p className="font-semibold text-gray-600">Evidence Notes:</p>
                      <p className="text-gray-500 whitespace-pre-wrap">{p.evidenceNotes}</p>
                    </div>
                  )}
                  <AiIntelPanel product={p} />
                </div>
              </details>
            </div>
          </div>
        )}

        {/* ── PROMOTIONS ── */}
        {tab === 'promotions' && <PromoTab product={p} set={set} />}
      </div>}
    </div>
  );
}

// ============================================================================
// SEO TAB (with one-click AI generation + save)
// ============================================================================

/** Factual SEO prompt shared by the per-product tab and the list bulk run. */
function buildProductSeoPrompt(p: CatalogProduct, category: string): string {
  return `Write premium, honest SEO for this authentic Himalayan salt and mineral product for Himalayan Koh (a premium US artisan and mineral salt store).
Product name: ${p.name}
Brand: ${p.brand || 'Himalayan Koh'}
Category: ${category || 'Himalayan Pink Salt'}
Short description: ${p.shortDescription || ''}
Long description: ${p.description || ''}

Return ONLY valid JSON with EXACTLY these keys:
{"seoTitle": "<=60 chars, factual, no fake claims", "metaDescription": "<=160 chars, factual", "focusKeyword": "one primary keyword", "seoKeywords": ["5-8 keywords"], "slug": "url-friendly-slug"}
No other text.`;
}

function SeoTab({ product, cats, set, onSave }: { product: CatalogProduct; cats: CatalogCategory[]; set: <K extends keyof CatalogProduct>(k: K, v: CatalogProduct[K]) => void; onSave?: (product?: CatalogProduct) => Promise<void> }) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);

  const addKeyword = (k: string) => { const v = k.trim(); if (v && !product.seoKeywords.includes(v)) set('seoKeywords', [...product.seoKeywords, v]); };
  const removeKeyword = (k: string) => set('seoKeywords', product.seoKeywords.filter((x) => x !== k));

  const generateWithAI = async (saveNow: boolean) => {
    if (!product.name.trim()) { notify('Enter the product name first', 'error'); return; }
    setBusy(true);
    try {
      const category = cats.find((c) => c.id === product.categoryId)?.name || product.categoryName || '';
      const parsed = await generateSeoJson(buildProductSeoPrompt(product, category));
      const kw = Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords.map(String).slice(0, 8) : [];
      const slug = String(parsed.slug || product.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);
      const nextKeywords = parsed.focusKeyword
        ? (kw.includes(String(parsed.focusKeyword)) ? kw : [String(parsed.focusKeyword), ...kw])
        : kw;
      const nextProduct: CatalogProduct = {
        ...product,
        seoTitle: String(parsed.seoTitle || '').trim(),
        seoDescription: String(parsed.metaDescription || '').trim(),
        seoKeywords: nextKeywords,
        ...(slug ? { canonicalSlug: slug } : {}),
      };
      set('seoTitle', nextProduct.seoTitle);
      set('seoDescription', nextProduct.seoDescription);
      set('seoKeywords', nextProduct.seoKeywords);
      if (slug) set('canonicalSlug', slug);
      if (saveNow && onSave) {
        await onSave(nextProduct);
        notify('SEO generated and saved');
      } else {
        notify('SEO generated — review before saving');
      }
    } catch (e) {
      notify(`AI SEO failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const meta = buildProductMeta(product);
  const jsonLd = buildProductJsonLd(product);

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5"><Sparkle size={15} />SEO & Meta — write nothing, let AI do it</p>
          <p className="text-xs text-indigo-600 mt-0.5">One click generates a factual SEO title, meta description, keywords and slug from your product name AND saves the product (secure server-side — uses the first configured AI key). You can still edit everything.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => generateWithAI(true)} disabled={busy || !product.name.trim()} className="btn-glow px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5">
            <Sparkle size={15} />{busy ? 'Working…' : 'Generate SEO & Save'}
          </button>
          {onSave && (
            <button onClick={() => generateWithAI(false)} disabled={busy || !product.name.trim()} className="px-3 py-2 text-xs text-indigo-600 hover:underline disabled:opacity-50">
              Generate only
            </button>
          )}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><label className={L}>SEO title</label><input value={product.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} className={I} placeholder="Auto-generated or write your own" /></div>
        <div className="sm:col-span-2"><label className={L}>Meta description</label><textarea value={product.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} rows={3} className={I} placeholder="Auto-generated or write your own" /></div>
        <div className="sm:col-span-2">
          <label className={L}>SEO keywords</label>
          <div className="flex flex-wrap gap-1.5 items-center">
            {product.seoKeywords.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{k}<button onClick={() => removeKeyword(k)}><X size={11} /></button></span>
            ))}
            <input
              className="flex-1 min-w-[140px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none"
              placeholder="Add keyword + Enter"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5"><Globe size={13} />Live SEO preview (deterministic — no fake data)</p>
            <p className="text-sm font-semibold text-blue-900">{meta.title}</p>
            <p className="text-xs text-gray-500">{meta.canonical}</p>
            <p className="text-xs text-gray-600 mt-1">{meta.description}</p>
            <details className="mt-2"><summary className="text-xs text-blue-700 cursor-pointer">Product JSON-LD</summary><pre className="mt-1 text-[10px] bg-white rounded p-2 overflow-auto max-h-40">{JSON.stringify(jsonLd, null, 1)}</pre></details>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SHIPPING TAB (Package specs, dimensions, presets, and Shippo connection)
// ============================================================================
function ShippingTab({ product, set }: { product: CatalogProduct; set: <K extends keyof CatalogProduct>(k: K, v: CatalogProduct[K]) => void }) {
  const specs = (product.specifications || {}) as Record<string, unknown>;
  const [weightLbs, setWeightLbs] = useState<number>(() => Number(specs.weightLbs) || (Number(specs.weightOz) ? Number(specs.weightOz) / 16 : 2));
  const [lengthIn, setLengthIn] = useState<number>(() => Number(specs.lengthIn) || 10);
  const [widthIn, setWidthIn] = useState<number>(() => Number(specs.widthIn) || 10);
  const [heightIn, setHeightIn] = useState<number>(() => Number(specs.heightIn) || 6);
  const [packagePreset, setPackagePreset] = useState<string>(() => String(specs.packagePreset || 'BOX_10_10_6'));
  const [ratingZip, setRatingZip] = useState('90210');
  const [shippoRates, setShippoRates] = useState<Array<{ provider: string; serviceName: string; amount: number; estimatedDays: number | null }>>([]);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [shippoNote, setShippoNote] = useState<string | null>(null);

  const updateSpecs = (patch: Record<string, unknown>) => {
    const updated = { ...specs, ...patch };
    set('specifications', updated);
  };

  const onPresetChange = (presetKey: string) => {
    setPackagePreset(presetKey);
    const presets: Record<string, { l: number; w: number; h: number; wt?: number }> = {
      BOX_10_10_6: { l: 10, w: 10, h: 6, wt: 6 },
      BOX_9_5_5_5: { l: 9.5, w: 9.5, h: 5.5, wt: 4 },
      BOX_30_BLOCK: { l: 8.5, w: 7.5, h: 6.5, wt: 30 },
      BOX_BAG_18: { l: 10, w: 10, h: 8, wt: 18 },
      BOX_BAG_45: { l: 12, w: 10, h: 8, wt: 45 },
    };
    if (presets[presetKey]) {
      const { l, w, h, wt } = presets[presetKey];
      setLengthIn(l);
      setWidthIn(w);
      setHeightIn(h);
      if (wt && !weightLbs) setWeightLbs(wt);
      updateSpecs({ packagePreset: presetKey, lengthIn: l, widthIn: w, heightIn: h, ...(wt && !weightLbs ? { weightLbs: wt } : {}) });
    } else {
      updateSpecs({ packagePreset: 'custom' });
    }
  };

  const calculateShippo = async () => {
    setRatingLoading(true);
    setShippoNote(null);
    try {
      const res = await fetch('/api/shippo/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: {
            fullName: 'Admin Rate Estimate',
            addressLine1: '100 Universal City Plaza',
            city: 'Universal City',
            state: 'CA',
            postalCode: ratingZip || '90210',
            country: 'US',
          },
          items: [{ productId: product.id, quantity: 1, weightLbs: Math.max(0.1, weightLbs) }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 || !data.configured) {
        setShippoNote('Shippo live carrier API is not configured in this environment (set SHIPPO_API_TOKEN in env). Storefront uses standard flat rates.');
        setShippoRates([]);
      } else if (!res.ok) {
        setShippoNote(data.error || 'Shippo rate check unavailable for this destination.');
        setShippoRates([]);
      } else {
        const rates = Array.isArray(data.rates) ? data.rates : [];
        setShippoRates(rates);
        if (rates.length === 0) setShippoNote('No carrier rates returned for these dimensions/weight.');
      }
    } catch (e) {
      setShippoNote(`Rate check error: ${(e as Error).message}`);
    } finally {
      setRatingLoading(false);
    }
  };

  const bestShippoRate = shippoRates[0] || null;

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={L}>Customer Shipping Cost (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={product.shippingCost || ''}
            onChange={(e) => set('shippingCost', +e.target.value)}
            className={I}
            placeholder="0.00"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={product.freeShipping}
              onChange={(e) => set('freeShipping', e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="font-semibold">Free shipping on this product (Customer pays $0)</span>
          </label>
        </div>
        <div>
          <label className={L}>Delivery Min Days</label>
          <input
            type="number"
            min="0"
            value={product.deliveryMinDays ?? ''}
            onChange={(e) => set('deliveryMinDays', e.target.value ? +e.target.value : null)}
            className={I}
            placeholder="e.g. 2"
          />
        </div>
        <div>
          <label className={L}>Delivery Max Days</label>
          <input
            type="number"
            min="0"
            value={product.deliveryMaxDays ?? ''}
            onChange={(e) => set('deliveryMaxDays', e.target.value ? +e.target.value : null)}
            className={I}
            placeholder="e.g. 5"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={L}>Shipping Note (Truthful)</label>
          <input
            value={product.shippingNote || ''}
            onChange={(e) => set('shippingNote', e.target.value)}
            className={I}
            placeholder="e.g. Ships carefully packed from our US warehouse via tracked carrier."
          />
        </div>
      </div>

      {/* Package Dimensions & Weight */}
      <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Package Dimensions & Weight</h4>
            <p className="text-xs text-gray-500">Authoritative package specs used for carrier rating and dispatch.</p>
          </div>
          <div className="w-64">
            <select
              value={packagePreset}
              onChange={(e) => onPresetChange(e.target.value)}
              className="w-full text-xs font-medium border border-gray-300 rounded-lg p-1.5 bg-white"
            >
              <option value="custom">Custom Box</option>
              <option value="BOX_10_10_6">Standard Box — 10 × 10 × 6 in</option>
              <option value="BOX_9_5_5_5">Medium Square Box — 9.5 × 9.5 × 5.5 in</option>
              <option value="BOX_30_BLOCK">Heavy Block Box — 8.5 × 7.5 × 6.5 in</option>
              <option value="BOX_BAG_18">18 lb Bag Box — 10 × 10 × 8 in</option>
              <option value="BOX_BAG_45">45 lb Heavy Sack — 12 × 10 × 8 in</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Weight (lb)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={weightLbs || ''}
              onChange={(e) => {
                const val = +e.target.value;
                setWeightLbs(val);
                updateSpecs({ weightLbs: val, weightOz: Math.round(val * 16) });
              }}
              className={I}
              placeholder="e.g. 12"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Length (in)</label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={lengthIn || ''}
              onChange={(e) => {
                const val = +e.target.value;
                setLengthIn(val);
                updateSpecs({ lengthIn: val, packagePreset: 'custom' });
              }}
              className={I}
              placeholder="10"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Width (in)</label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={widthIn || ''}
              onChange={(e) => {
                const val = +e.target.value;
                setWidthIn(val);
                updateSpecs({ widthIn: val, packagePreset: 'custom' });
              }}
              className={I}
              placeholder="10"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Height (in)</label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={heightIn || ''}
              onChange={(e) => {
                const val = +e.target.value;
                setHeightIn(val);
                updateSpecs({ heightIn: val, packagePreset: 'custom' });
              }}
              className={I}
              placeholder="6"
            />
          </div>
        </div>
      </div>

      {/* Shippo Live Carrier Rating Connection */}
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Truck size={15} className="text-blue-600" /> Shippo Carrier Rate Connection
            </h4>
            <p className="text-xs text-gray-500">Live rate estimate based on real Shippo USPS/carrier rules.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Test Zip:</span>
            <input
              type="text"
              value={ratingZip}
              onChange={(e) => setRatingZip(e.target.value)}
              className="w-20 px-2 py-1 text-xs border rounded-lg text-center font-mono"
            />
            <button
              type="button"
              onClick={calculateShippo}
              disabled={ratingLoading}
              className="btn-glow px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
            >
              {ratingLoading ? 'Checking…' : 'Check Shippo Rate'}
            </button>
          </div>
        </div>

        {/* Live Carrier Breakdown */}
        <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-100 text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">Customer shipping:</span>
            <span className="font-bold text-gray-900">{product.freeShipping ? 'FREE ($0.00)' : `$${product.shippingCost.toFixed(2)}`}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">Estimated internal carrier cost:</span>
            <span className="font-bold text-blue-700">
              {bestShippoRate ? `$${bestShippoRate.amount.toFixed(2)} (${bestShippoRate.provider} ${bestShippoRate.serviceName})` : 'Calculable via Shippo'}
            </span>
          </div>
          <div className="flex justify-between items-center text-gray-600">
            <span>Package dimensions:</span>
            <span className="font-mono">{lengthIn || 10} × {widthIn || 10} × {heightIn || 6} in</span>
          </div>
          <div className="flex justify-between items-center text-gray-600">
            <span>Weight:</span>
            <span className="font-mono">{weightLbs || 2} lb</span>
          </div>
          <div className="flex justify-between items-center text-gray-600">
            <span>Carrier source:</span>
            <span className="font-semibold">Shippo API</span>
          </div>
        </div>

        {shippoNote && (
          <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            {shippoNote}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PROMOTIONS TAB (with single product summary header + economic suggestions)
// ============================================================================
function PromoTab({ product, set }: { product: CatalogProduct; set: <K extends keyof CatalogProduct>(k: K, v: CatalogProduct[K]) => void }) {
  const { notify } = useApp();

  // Deterministic economics-based suggestion — clearly a suggestion, never a
  // fake claim. Margin math only; merchandising flags stay owner decisions.
  const suggest = () => {
    const margin = product.costPrice > 0 && product.price > 0 ? (1 - product.costPrice / product.price) * 100 : null;
    if (margin == null) { notify('Enter supplier cost + retail price first', 'error'); return; }
    // A 10% discount keeps margin healthy when there is at least 40% gross.
    if (margin >= 45) {
      set('saleEnabled', true);
      set('discountType', 'percent');
      set('discountValue', 10);
      set('compareAtPrice', product.price > 0 ? Math.round(product.price * 100) / 100 : 0);
      notify(`Suggested: 10% off keeps ~${(margin - 10).toFixed(0)}% margin — review before saving.`);
    } else {
      notify(`Margin is ${margin.toFixed(0)}% — a sale is not suggested (would drop below a healthy margin).`, 'error');
    }
  };

  const primaryImage = product.images.find((im) => im.isPrimary) || product.images[0];

  return (
    <div className="space-y-5">
      {/* Product Summary Header (Single product representation) */}
      <div className="bg-gray-50 border rounded-xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-lg bg-white border flex items-center justify-center shrink-0 overflow-hidden">
          {primaryImage?.url ? (
            <img src={primaryImage.url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package size={24} className="text-gray-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate">{product.name || 'Untitled Product'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            SKU: <span className="font-mono font-medium text-gray-700">{product.sku || 'None'}</span> · Retail Price: <span className="font-semibold text-gray-800">${product.price.toFixed(2)}</span>
            {product.compareAtPrice > product.price && <span className="text-gray-400 line-through ml-1.5">${product.compareAtPrice.toFixed(2)}</span>}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {product.saleEnabled && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">Sale ({product.discountValue ? `${product.discountValue}${product.discountType === 'percent' ? '%' : '$'}` : 'Active'})</span>}
            {product.featured && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">Featured</span>}
            {product.newArrival && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">New Arrival</span>}
            {product.promoted && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">Promoted</span>}
            {product.trending && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">Trending</span>}
            {product.bestRated && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">Best Rated</span>}
            {product.bestSeller && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">Best Seller</span>}
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5"><Sparkle size={15} />Promotions & Merchandising</p>
          <p className="text-xs text-indigo-600 mt-0.5">Economics-based suggestions keep margins safe. Merchandising flags require genuine evidence.</p>
        </div>
        <button onClick={suggest} className="btn-glow px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5">
          <Sparkle size={15} />Suggest a sale (economics)
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className={L}>Sale enabled</label>
          <div className="flex items-center gap-2">
            <input id="sale-on" type="checkbox" checked={product.saleEnabled} onChange={(e) => set('saleEnabled', e.target.checked)} className="w-4 h-4" />
            <label htmlFor="sale-on" className="text-sm text-gray-600">Apply a store discount to this product</label>
          </div>
        </div>
        <div><label className={L}>Discount type</label>
          <select value={product.discountType || 'percent'} onChange={(e) => set('discountType', e.target.value as CatalogProduct['discountType'])} className={I}>
            <option value="percent">Percentage (%)</option>
            <option value="fixed">Fixed amount ($)</option>
          </select>
        </div>
        <div><label className={L}>Discount value</label><input type="number" min="0" step="0.01" value={product.discountValue ?? ''} onChange={(e) => set('discountValue', e.target.value ? +e.target.value : undefined)} className={I} /></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {([
          ['featured', 'Featured', 'Show in featured/top-picks sections'],
          ['newArrival', 'New arrival', 'Show in New Arrivals section'],
          ['promoted', 'Promoted', 'Highlight in promotions'],
        ] as const).map(([key, label, hint]) => (
          <label key={key} className="flex items-start gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={Boolean(product[key])} onChange={(e) => set(key, e.target.checked)} className="w-4 h-4 mt-0.5" />
            <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-gray-400">{hint}</span></span>
          </label>
        ))}
        {([
          ['trending', 'Trending', 'Only with real evidence or an explicit owner merchandising decision'],
          ['bestRated', 'Best rated', 'Only with verified customer ratings'],
          ['bestSeller', 'Best seller', 'Only with verified sales evidence'],
        ] as const).map(([key, label, hint]) => (
          <label key={key} className="flex items-start gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={Boolean(product[key])} onChange={(e) => set(key, e.target.checked)} className="w-4 h-4 mt-0.5" />
            <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-amber-600">{hint}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// QUICK ADD FORM (compact one-screen product creation)
// ============================================================================
function SupplierSourceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const preset = SUPPLIER_SOURCE_PRESETS.find((x) => x.toLowerCase() === value.trim().toLowerCase());
  const [custom, setCustom] = useState(!preset && value.trim() !== '');
  return (
    <>
      <select
        value={preset ? preset : custom ? '__other' : ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__other') { setCustom(true); onChange(''); }
          else { setCustom(false); onChange(v); }
        }}
        className={I}
      >
        <option value="">— Select —</option>
        {SUPPLIER_SOURCE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value="__other">Other / Custom…</option>
      </select>
      {custom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${I} mt-1.5`}
          placeholder="e.g. Himalayan Koh (own brand)"
        />
      )}
    </>
  );
}

function QuickAddForm({ product, cats, onChange, onAddCategory }: { product: CatalogProduct; cats: CatalogCategory[]; onChange: (p: CatalogProduct) => void; onAddCategory?: (name: string) => Promise<CatalogCategory | null> }) {
  const set = <K extends keyof CatalogProduct>(k: K, v: CatalogProduct[K]) => onChange({ ...product, [k]: v });
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  const addNewCat = async () => {
    if (!onAddCategory) return;
    setAddingCat(true);
    try { const c = await onAddCategory(newCatName); if (c) set('categoryId', c.id); } finally { setAddingCat(false); }
  };

  const removeTag = (t: string) => onChange({ ...product, tags: product.tags.filter((x) => x !== t) });
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,$/, '');
    if (!t || product.tags.includes(t)) return;
    onChange({ ...product, tags: [...product.tags, t] });
  };

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <p className="text-xs text-gray-500">Quick Add — essentials plus the fields SEO needs. Everything else defaults to safe values and can be refined later in Detail Add. <span className="text-red-500">*</span> = required.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={L}>Product name <span className="text-red-500">*</span></label>
          <input value={product.name} onChange={(e) => set('name', e.target.value)} className={I} placeholder="e.g. Handcrafted Himalayan Pink Salt Lamp (Natural Shape)" autoFocus />
        </div>
        <div>
          <label className={L}>Category</label>
          <div className="flex gap-1.5">
            <select value={product.categoryId || ''} onChange={(e) => set('categoryId', e.target.value || null)} className={I}>
              <option value="">— Uncategorized —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => { setNewCatOpen(!newCatOpen); setNewCatName(''); }} className="shrink-0 px-3 border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold whitespace-nowrap">+ Add</button>
          </div>
          {newCatOpen && (
            <div className="flex gap-1.5 mt-1.5">
              <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addNewCat(); }} placeholder="New category name" className={I} autoFocus />
              <button type="button" onClick={() => void addNewCat()} disabled={addingCat || !newCatName.trim()} className="shrink-0 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold whitespace-nowrap">{addingCat ? 'Adding…' : 'Add'}</button>
            </div>
          )}
        </div>
        <div><label className={L}>Brand <span className="normal-case font-normal text-gray-400">(optional)</span></label><input value={product.brand} onChange={(e) => set('brand', e.target.value)} className={I} placeholder="e.g. Himalayan Koh" /></div>
        <div>
          <label className={L}>Retail price (USD) <span className="text-red-500">*</span></label>
          <input type="number" min="0" step="0.01" value={product.price || ''} onChange={(e) => set('price', +e.target.value)} className={I} placeholder="0.00" />
        </div>
        <div>
          <label className={L}>Compare-at price (USD) <span className="normal-case font-normal text-gray-400">(optional — shows a sale)</span></label>
          <input type="number" min="0" step="0.01" value={product.compareAtPrice || ''} onChange={(e) => set('compareAtPrice', +e.target.value)} className={I} placeholder="0.00" />
        </div>
        <div><label className={L}>Supplier cost (USD) — optional</label><input type="number" min="0" step="0.01" value={product.costPrice || ''} onChange={(e) => set('costPrice', +e.target.value)} className={I} placeholder="Optional" /></div>
        <div>
          <label className={L}>Stock quantity</label>
          <input type="number" min="0" value={product.inventoryQty} onChange={(e) => set('inventoryQty', +e.target.value)} className={I} placeholder="0" />
        </div>
        <div className="sm:col-span-2">
          <label className={L}>Supplier source <span className="normal-case font-normal text-gray-400">(optional)</span></label>
          <SupplierSourceSelect
            value={product.supplierSource || ''}
            onChange={(v) => {
              const prevSearch = supplierSearchUrl(product.supplierSource || '', product.name);
              const currentUrl = (product.supplierUrl || '').trim();
              const next = { ...product, supplierSource: v };
              const search = supplierSearchUrl(v, product.name);
              if (search && (!currentUrl || currentUrl === prevSearch)) next.supplierUrl = search;
              onChange(next);
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={L}>Supplier URL <span className="normal-case font-normal text-gray-400">(marketplace search — replace with the real listing page)</span></label>
          <input value={product.supplierUrl || ''} onChange={(e) => set('supplierUrl', e.target.value)} className={I} placeholder="https://… (picking a source above auto-fills its search for this product)" />
        </div>
        <div className="sm:col-span-2">
          <label className={L}>Supplier SKU <span className="normal-case font-normal text-gray-400">(optional — for sourcing traceability)</span></label>
          <input value={product.supplierProductRef || ''} onChange={(e) => set('supplierProductRef', e.target.value)} className={I} placeholder="e.g. HK-SALT-001 or marketplace item ID" />
        </div>
        <div className="sm:col-span-2 grid sm:grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-gray-700 pb-2"><input type="checkbox" checked={product.freeShipping} onChange={(e) => set('freeShipping', e.target.checked)} className="w-4 h-4" />Free shipping on this product</label></div>
          <div>
            <label className={L}>Shipping cost (USD) <span className="normal-case font-normal text-gray-400">— if not free</span></label>
            <input type="number" min="0" step="0.01" value={product.shippingCost || ''} onChange={(e) => set('shippingCost', +e.target.value)} className={I} placeholder="0.00" />
          </div>
          <div className="sm:col-span-2">
            <label className={L}>Estimated delivery <span className="normal-case font-normal text-gray-400">(optional, business days)</span></label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={product.deliveryMinDays ?? ''} onChange={(e) => set('deliveryMinDays', e.target.value ? +e.target.value : null)} className={I} placeholder="min" aria-label="Delivery min days" />
              <span className="text-xs text-gray-400">–</span>
              <input type="number" min="0" value={product.deliveryMaxDays ?? ''} onChange={(e) => set('deliveryMaxDays', e.target.value ? +e.target.value : null)} className={I} placeholder="max" aria-label="Delivery max days" />
              <span className="text-xs text-gray-500 whitespace-nowrap">days</span>
            </div>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={L}>Short description <span className="normal-case font-normal text-gray-400">(optional)</span></label>
          <textarea value={product.shortDescription || ''} onChange={(e) => set('shortDescription', e.target.value)} rows={2} className={I} placeholder="One-line customer-facing summary (also used for SEO meta)." />
        </div>
        <div className="sm:col-span-2">
          <label className={L}>Description <span className="normal-case font-normal text-gray-400">(optional)</span></label>
          <textarea value={product.description || ''} onChange={(e) => set('description', e.target.value)} rows={4} className={I} placeholder="Concise opening benefit, key features, practical use, sizing, care. No fake claims." />
        </div>
        <div className="sm:col-span-2">
          <label className={L}>Tags</label>
          <div className="flex flex-wrap gap-1.5 items-center">
            {product.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">{t}<button type="button" onClick={() => removeTag(t)}><X size={11} /></button></span>
            ))}
            <input
              className="flex-1 min-w-[140px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none"
              placeholder="Add tag + Enter"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
            />
          </div>
        </div>
      </div>

      {/* Images — full editor (upload to storage, URL, fetch-all, main picker, bg removal, alt) */}
      <div>
        <label className={L}>Images (up to 5) — click an image to make it the main thumbnail <span className="text-red-500">*</span></label>
        <ImageManager product={product} onProduct={onChange} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared image upload helper — sends a data URL to the admin-only storage
// endpoint and returns a durable public URL. Falls back to the data URL when
// storage is unavailable (the row then persists only if the URL is kept, so
// callers should surface the warning honestly).
// ---------------------------------------------------------------------------
async function uploadImageToStorage(dataUrl: string, filename: string, contentType: string): Promise<string> {
  let token = await getFreshAccessToken();
  let r = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ productId: 'product', filename, contentType, base64: dataUrl }),
  });
  // If the token expired mid-session (or clock drift), force-refresh and retry once
  if (r.status === 401 || r.status === 403) {
    const refreshed = await getSession(true);
    token = refreshed?.accessToken || null;
    if (token) {
      r = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId: 'product', filename, contentType, base64: dataUrl }),
      });
    }
  }
  const j = await r.json().catch(() => null);
  if (r.ok && j?.publicUrl) return String(j.publicUrl);
  if (r.status === 401) {
    throw new Error('Unauthorized — session expired. Please sign out and sign back in.');
  }
  if (r.status === 403) {
    throw new Error('Forbidden — admin privileges required.');
  }
  // Fail honestly — never a phantom data-URL row that vanishes after reload.
  throw new Error(j?.error || `Image upload failed (HTTP ${r.status})`);
}

/**
 * Remove a solid/light background from an image using edge flood-fill.
 * Pure client-side canvas — no API key, no external service. Best results on
 * product shots with a plain (white/light) backdrop; not a magic cutout for
 * busy scenes. Returns a PNG data URL.
 */
async function removeImageBackground(dataUrl: string): Promise<string> {
  // External HTTP images must be fetched as a blob first to avoid canvas
  // cross-origin tainting, which prevents getImageData() from working.
  let safeUrl = dataUrl;
  if (/^https?:\/\//i.test(dataUrl)) {
    try {
      const resp = await fetch(dataUrl);
      if (!resp.ok) throw new Error(`Image fetch failed (HTTP ${resp.status})`);
      const blob = await resp.blob();
      safeUrl = URL.createObjectURL(blob);
    } catch {
      // Fall through — the direct load may still work for same-origin or
      // CORS-enabled servers; if it taints the canvas the catch below
      // provides a user-friendly error.
    }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not load image'));
    i.src = safeUrl;
  });
  const maxDim = 1200;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  // Seed color = average of the four corners (the presumed backdrop).
  const corner = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)];
  const seed = [
    Math.round(corners.reduce((s, c) => s + c[0], 0) / corners.length),
    Math.round(corners.reduce((s, c) => s + c[1], 0) / corners.length),
    Math.round(corners.reduce((s, c) => s + c[2], 0) / corners.length),
  ];
  const tol = 40;
  const near = (r: number, g: number, b: number) =>
    Math.abs(r - seed[0]) <= tol && Math.abs(g - seed[1]) <= tol && Math.abs(b - seed[2]) <= tol;

  // BFS from every border pixel, clearing connected background regions.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) { stack.push(x, (height - 1) * width + x); }
  for (let y = 0; y < height; y++) { stack.push(y * width, y * width + width - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    const i = p * 4;
    if (!near(data[i], data[i + 1], data[i + 2])) continue;
    visited[p] = 1;
    data[i + 3] = 0; // transparent
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }
  ctx.putImageData(imageData, 0, 0);
  if (safeUrl !== dataUrl) URL.revokeObjectURL(safeUrl);
  return canvas.toDataURL('image/png');
}

/**
 * Load an image URL into a canvas, apply a transformation, and return a data URL.
 * Handles cross-origin images by fetching as blob first.
 */
async function transformImage(dataUrl: string, transform: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Promise<string> {
  let safeUrl = dataUrl;
  if (/^https?:\/\//i.test(dataUrl)) {
    try {
      const resp = await fetch(dataUrl);
      if (!resp.ok) throw new Error(`Image fetch failed (HTTP ${resp.status})`);
      safeUrl = URL.createObjectURL(await resp.blob());
    } catch { /* fall through */ }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not load image'));
    i.src = safeUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { if (safeUrl !== dataUrl) URL.revokeObjectURL(safeUrl); return dataUrl; }
  ctx.drawImage(img, 0, 0);
  transform(ctx, canvas.width, canvas.height);
  if (safeUrl !== dataUrl) URL.revokeObjectURL(safeUrl);
  return canvas.toDataURL('image/png');
}

/** Rotate image by 90 degrees clockwise. */
async function rotateImage90(dataUrl: string): Promise<string> {
  let safeUrl = dataUrl;
  if (/^https?:\/\//i.test(dataUrl)) {
    try {
      const resp = await fetch(dataUrl);
      if (resp.ok) safeUrl = URL.createObjectURL(await resp.blob());
    } catch { /* fall through */ }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not load image'));
    i.src = safeUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight; // swapped
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext('2d');
  if (!ctx) { if (safeUrl !== dataUrl) URL.revokeObjectURL(safeUrl); return dataUrl; }
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  if (safeUrl !== dataUrl) URL.revokeObjectURL(safeUrl);
  return canvas.toDataURL('image/png');
}

/** Flip image horizontally. */
async function flipImageH(dataUrl: string): Promise<string> {
  return transformImage(dataUrl, (ctx, w, h) => {
    const imgData = ctx.getImageData(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(ctx.canvas, -w, 0);
    ctx.restore();
  });
}

/** Adjust brightness (-100 to +100) and contrast (-100 to +100). */
async function adjustBrightness(dataUrl: string, brightness: number, contrast: number): Promise<string> {
  return transformImage(dataUrl, (ctx, w, h) => {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const b = brightness * 2.55; // -255 to 255
    const c = (259 * (contrast + 255)) / (255 * (259 - contrast));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(c * (data[i] - 128 + b) + 128);
      data[i + 1] = clamp(c * (data[i + 1] - 128 + b) + 128);
      data[i + 2] = clamp(c * (data[i + 2] - 128 + b) + 128);
    }
    ctx.putImageData(imageData, 0, 0);
  });
}

function clamp(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }

// ============================================================================
// IMAGE MANAGER
// ============================================================================
function ImageManager({ product, onProduct }: { product: CatalogProduct; onProduct: (p: CatalogProduct) => void }) {
  const { notify } = useApp();
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [finding, setFinding] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [editBusy, setEditBusy] = useState(false);

  /**
   * Find this product's images on the store BY NAME.
   *
   * The paste-a-URL flow only works when the editor already knows the exact
   * page. This asks the server to find it: the resolver matches the name
   * against the site's sitemap, fetches the best page, extracts its images and
   * lets the configured AI provider (OpenRouter/Gemini) drop the ones that are
   * not this product. The browser never holds a key and never needs the URL.
   */
  const findByTitle = async () => {
    const title = (product.name || '').trim();
    if (!title) { notify('Enter the product name first — the search uses it', 'error'); return; }
    setFinding(true);
    try {
      const token = await getFreshAccessToken();
      const r = await fetch('/api/admin/product-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ title }),
      });
      const j = (await r.json().catch(() => null)) as {
        error?: string;
        images?: { url: string }[];
        pages?: unknown[];
        ai?: { used: boolean; kept: number; provider: string | null; model: string | null; reason: string };
      } | null;
      if (!r.ok) { notify(j?.error || `Image search failed (HTTP ${r.status})`, 'error'); return; }

      const found = (j?.images || []).map((i) => i.url).filter((u) => /^https?:\/\//i.test(u));
      if (!found.length) {
        notify(
          j?.pages?.length
            ? 'No images found on the pages that matched — check the product name.'
            : 'No matching product page found on the store for this name.',
          'error'
        );
        return;
      }
      const existing = new Set(product.images.map((i) => i.url));
      const room = Math.max(0, 5 - product.images.length);
      const fresh = found.filter((u) => !hasCatalogImageUrl([...existing], u)).slice(0, room);
      if (!fresh.length) { notify('Everything found for this name is already added (max 5 images).', 'error'); return; }

      const startLen = product.images.length;
      onProduct({
        ...product,
        images: [
          ...product.images,
          ...fresh.map((u, i) => ({ id: uid(), productId: product.id, url: u, altText: '', kind: 'product' as const, isPrimary: startLen === 0 && i === 0, sortOrder: startLen + i, variantId: null })),
        ],
      });
      const aiNote = j?.ai?.used ? `AI kept ${j.ai.kept} (${j.ai.provider} ${j.ai.model})` : 'not AI-ranked';
      notify(`Found ${found.length} image${found.length === 1 ? '' : 's'} for “${title}” — ${aiNote}; added ${fresh.length}.`);
    } catch (e) {
      notify(`Image search failed: ${(e as Error).message}`, 'error');
    } finally {
      setFinding(false);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const addByUrl = async () => {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { notify('Enter a valid image URL (https://…)', 'error'); return; }
    if (product.images.length >= 5) { notify('Max 5 images total', 'error'); return; }
    if (hasCatalogImageUrl(product.images.map((image) => image.url), u)) {
      notify('This image URL is already attached to the product.', 'error');
      return;
    }
    setUploading(true);
    try {
      const token = await getFreshAccessToken();
      const res = await fetch('/api/admin/media/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: u, productId: product.id || 'imported' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Import failed (HTTP ${res.status})`);
      }
      const isFirst = product.images.length === 0;
      const nextImages = [
        ...product.images,
        {
          id: uid(),
          productId: product.id,
          url: String(data.publicUrl),
          altText: alt.trim() || product.name,
          kind: 'product' as const,
          isPrimary: isFirst,
          sortOrder: product.images.length,
          variantId: null,
        },
      ];
      onProduct({ ...product, images: nextImages });
      // Existing products persist URL imports immediately. This prevents a
      // later editor refresh/save response from replacing the local image list
      // before the user has another chance to click Save. New products still
      // defer until they receive an id from their first product save.
      if (product.id) {
        await saveProductImages(product.id, nextImages.map((img) => ({
          id: img.id,
          url: img.url,
          altText: img.altText,
          kind: img.kind,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
          variantId: img.variantId,
        })), { reload: false });
      }
      setUrl('');
      setAlt('');
      notify(product.id
        ? 'Image imported, uploaded, and attached to this product'
        : 'Image imported and uploaded to storage — save product to persist');
    } catch (err) {
      notify(`Could not import image: ${(err as Error).message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const addByFile = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = Math.max(0, 5 - product.images.length);
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!picked.length) { notify('Max 5 images total', 'error'); return; }
    setUploading(true);
    try {
      const startLen = product.images.length;
      const added: CatalogImage[] = [];
      for (const f of picked) {
        try {
          // Downscale/convert client-side first so the upload fits the storage
          // bucket's 5 MB limit and allowed MIME types (fixes phantom uploads
          // that used to fall back to inline base64 and vanish on reload).
          const prep = await prepareImageForUpload(f);
          const stored = await uploadImageToStorage(prep.dataUrl, prep.filename, prep.contentType);
          added.push({ id: uid(), productId: product.id, url: stored, altText: f.name, kind: 'product', isPrimary: startLen === 0 && added.length === 0, sortOrder: startLen + added.length - 1, variantId: null });
        } catch (e) {
          const msg = (e as Error).message || 'Upload failed';
          const isAuth = /unauthorized|expired|forbidden|sign\s*in|session/i.test(msg);
          const hint = isAuth ? '' : ' Try a smaller image or add an image URL instead.';
          notify(`Could not upload ${f.name}: ${msg}.${hint}`, 'error');
        }
      }
      if (added.length) {
        onProduct({ ...product, images: [...product.images, ...added] });
        notify(added.length === 1 ? 'Image uploaded' : `${added.length} images uploaded`);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Fetch ALL images from a product page URL and add them (deduped, up to 5).
  const importAllFromUrl = async () => {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { notify('Enter a valid page/image URL', 'error'); return; }
    setUploading(true);
    try {
      // If it's a direct image URL, just add it.
      if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) { void addByUrl(); return; }
      let token = await getFreshAccessToken();
      let r = await fetch(`/api/fetch-page?url=${encodeURIComponent(u)}`, {
        headers: { Accept: 'text/plain', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (r.status === 401 || r.status === 403) {
        const refreshed = await getSession(true);
        token = refreshed?.accessToken || null;
        if (token) {
          r = await fetch(`/api/fetch-page?url=${encodeURIComponent(u)}`, {
            headers: { Accept: 'text/plain', Authorization: `Bearer ${token}` },
          });
        }
      }
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        notify(j?.error || `Page fetch failed (HTTP ${r.status})`, 'error');
        return;
      }
      const parsed = parseHtmlPage(await r.text());
      const found = parsed.images.filter((i) => {
        if (!i.startsWith('http')) return false;
        // Exclude SVGs (WooCommerce cannot import them as product images)
        // and common placeholder/icon/logo/spinner images.
        if (/\.svg(\?|$)/i.test(i)) return false;
        if (/(placeholder|favicon|icon|badge|sprite|loader|spinner|logo|pixel|transparent|1x1)/i.test(i)) return false;
        // Only keep raster product images
        if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(i)) return false;
        return true;
      });
      if (!found.length) { notify('No product images found on that page.', 'error'); return; }
      const existing = new Set(product.images.map((i) => i.url));
      const fresh = found.filter((i) => !hasCatalogImageUrl([...existing], i)).slice(0, 5 - product.images.length);
      if (!fresh.length) { notify('All images from that page are already added (max 5).', 'error'); return; }
      const startLen = product.images.length;
      onProduct({
        ...product,
        images: [...product.images, ...fresh.map((u2, i) => ({ id: uid(), productId: product.id, url: u2, altText: '', kind: 'product' as const, isPrimary: startLen === 0 && i === 0, sortOrder: startLen + i, variantId: null }))],
      });
      notify(`Imported ${fresh.length} image${fresh.length === 1 ? '' : 's'} from the page — delete the ones you do not want.`);
    } finally {
      setUploading(false);
    }
  };

  const setPrimary = (idx: number) => {
    onProduct({ ...product, images: product.images.map((img, i) => ({ ...img, isPrimary: i === idx })) });
  };

  const remove = (idx: number) => {
    const removed = product.images[idx];
    let imgs = product.images.filter((_, i) => i !== idx);
    if (removed?.isPrimary && imgs.length > 0 && !imgs.some((i) => i.isPrimary)) {
      imgs = imgs.map((img, i) => ({ ...img, isPrimary: i === 0 }));
    }
    onProduct({ ...product, images: imgs });
  };

  const update = (idx: number, patch: Partial<CatalogImage>) => {
    onProduct({ ...product, images: product.images.map((img, i) => (i === idx ? { ...img, ...patch } : img)) });
  };

  // Remove background client-side, then persist the result to storage.
  const onRemoveBackground = async (idx: number) => {
    const img = product.images[idx];
    if (!img) return;
    setProcessing(idx);
    try {
      const removed = await removeImageBackground(img.url);
      const stored = await uploadImageToStorage(removed, `bg-removed-${idx}.png`, 'image/png');
      onProduct({ ...product, images: product.images.map((x, i) => (i === idx ? { ...x, url: stored } : x)) });
      notify('Background removed — the new version is saved as the image.');
    } catch (e) {
      notify(`Background removal failed: ${(e as Error).message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const onRotate = async (idx: number) => {
    const img = product.images[idx];
    if (!img) return;
    setProcessing(idx);
    try {
      const rotated = await rotateImage90(img.url);
      const stored = await uploadImageToStorage(rotated, `rotated-${idx}.png`, 'image/png');
      onProduct({ ...product, images: product.images.map((x, i) => (i === idx ? { ...x, url: stored } : x)) });
      notify('Image rotated 90° and saved.');
    } catch (e) {
      notify(`Rotation failed: ${(e as Error).message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const onFlipH = async (idx: number) => {
    const img = product.images[idx];
    if (!img) return;
    setProcessing(idx);
    try {
      const flipped = await flipImageH(img.url);
      const stored = await uploadImageToStorage(flipped, `flipped-${idx}.png`, 'image/png');
      onProduct({ ...product, images: product.images.map((x, i) => (i === idx ? { ...x, url: stored } : x)) });
      notify('Image flipped horizontally and saved.');
    } catch (e) {
      notify(`Flip failed: ${(e as Error).message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const onAdjust = async (idx: number) => {
    const img = product.images[idx];
    if (!img) return;
    setEditBusy(true);
    try {
      const adjusted = await adjustBrightness(img.url, brightness, contrast);
      const stored = await uploadImageToStorage(adjusted, `adjusted-${idx}.png`, 'image/png');
      onProduct({ ...product, images: product.images.map((x, i) => (i === idx ? { ...x, url: stored } : x)) });
      notify('Brightness/contrast applied and saved.');
      setEditIdx(null);
      setBrightness(0);
      setContrast(0);
    } catch (e) {
      notify(`Adjustment failed: ${(e as Error).message}`, 'error');
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add bar: upload from PC + URL + alt */}
      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
        <div className="flex flex-wrap gap-2 items-end">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addByFile(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || product.images.length >= 5} className="btn-glow px-3.5 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm flex items-center gap-1.5">
            <UploadSimple size={15} />{uploading ? 'Working…' : `Upload from PC (${product.images.length}/5)`}
          </button>
          <div className="flex-1 min-w-[200px]">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={I} placeholder="Image URL — or paste a product page to fetch ALL its images" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); importAllFromUrl(); } }} />
          </div>
          <div className="flex-1 min-w-[140px]"><input value={alt} onChange={(e) => setAlt(e.target.value)} className={I} placeholder="Alt text (optional)" /></div>
          <button onClick={addByUrl} disabled={uploading} className="btn-glow px-3.5 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white rounded-lg text-sm flex items-center gap-1.5"><Plus size={15} />Add URL</button>
          {/* Sibling of the URL button, never nested inside it: a <button> inside
              a <button> is invalid HTML and produces a hydration error. */}
          <button onClick={findByTitle} disabled={uploading || finding} className="px-3.5 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 rounded-lg text-sm flex items-center gap-1.5" title="Search the store for this product by its name and pull its images (AI filters out the ones that are not this product)"><Sparkle size={15} />{finding ? 'Searching…' : 'Find by name'}</button>
          <button onClick={importAllFromUrl} disabled={uploading} className="px-3.5 py-2 border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 rounded-lg text-sm flex items-center gap-1.5" title="Fetch every image found on the pasted page URL and add them all (max 5)">
            <Download size={15} />Fetch all from page
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Up to 5 images. Images are attached through the configured staging media backend and keep their durable public URL. “Find by name” searches the store for this product and pulls its images (AI drops the ones that are not it); paste a product page URL + “Fetch all from page” to pull every image from a page you already know. Then ✕ the ones you do not want.</p>
      </div>

      {/* Image grid with thumbnail picker */}
      {product.images.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border border-dashed rounded-xl"><ImageIcon size={28} className="mx-auto mb-2 text-gray-300" />No images yet — upload or add at least one.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {product.images.map((img, idx) => (
            <div key={img.id || idx} className={`relative group rounded-xl overflow-hidden border-2 transition-all ${img.isPrimary ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}`}>
              {/* Image preview */}
              <button type="button" onClick={() => setPrimary(idx)} className="block w-full relative aspect-square bg-gray-100" title="Click to make this the main thumbnail">
                <span className="absolute inset-0 flex items-center justify-center text-gray-300"><ImageIcon size={24} className="shrink-0" /></span>
                {img.url?.trim() ? (
                  <img src={img.url} alt={img.altText || ''} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : null}
              </button>
              {img.isPrimary && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">MAIN</span>}
              <button type="button" onClick={() => remove(idx)} className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 hover:bg-red-600 shadow" title="Remove image">✕</button>

              {/* Editing toolbar — always visible, not hidden behind hover */}
              <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-t border-gray-100">
                <button type="button" onClick={() => onRemoveBackground(idx)} disabled={processing === idx}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition-colors"
                  title="Remove solid background (client-side)">
                  {processing === idx ? '⟳ Processing…' : '✂ Remove bg'}
                </button>
                <button type="button" onClick={() => onRotate(idx)} disabled={processing === idx}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  title="Rotate 90° clockwise">
                  <ArrowsClockwise size={11} /> Rotate
                </button>
                <button type="button" onClick={() => onFlipH(idx)} disabled={processing === idx}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
                  title="Flip horizontally">
                  <ArrowsHorizontal size={11} /> Flip
                </button>
                <button type="button" onClick={() => setEditIdx(editIdx === idx ? null : idx)}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${editIdx === idx ? 'bg-amber-100 border-amber-300 text-amber-800' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}
                  title="Adjust brightness and contrast">
                  <Sun size={11} /> Adjust
                </button>
              </div>

              {/* Brightness/contrast editor (expandable) */}
              {editIdx === idx && (
                <div className="px-3 py-2 bg-amber-50 border-t border-amber-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-amber-700 w-16">Bright</label>
                    <input type="range" min={-50} max={50} value={brightness} onChange={(e) => setBrightness(+e.target.value)} className="flex-1 h-1 accent-amber-500" />
                    <span className="text-[10px] text-amber-600 w-6 text-right">{brightness > 0 ? '+' : ''}{brightness}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-amber-700 w-16">Contrast</label>
                    <input type="range" min={-50} max={50} value={contrast} onChange={(e) => setContrast(+e.target.value)} className="flex-1 h-1 accent-amber-500" />
                    <span className="text-[10px] text-amber-600 w-6 text-right">{contrast > 0 ? '+' : ''}{contrast}</span>
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => onAdjust(idx)} disabled={editBusy}
                      className="px-3 py-1 text-[11px] font-semibold rounded-md bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">
                      {editBusy ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>
              )}

              {/* Metadata fields */}
              <div className="p-2 space-y-1.5 bg-white">
                <input value={img.altText} onChange={(e) => update(idx, { altText: e.target.value })} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Alt text" />
                <div className="flex gap-1.5">
                  <select value={img.kind} onChange={(e) => update(idx, { kind: e.target.value as CatalogImage['kind'] })} className="text-[11px] px-2 py-1 border border-gray-200 rounded flex-1" aria-label="Image kind">
                    <option value="product">Product</option>
                    <option value="lifestyle">Lifestyle</option>
                    <option value="creative">Creative</option>
                    <option value="video">Video</option>
                  </select>
                  <select value={img.variantId || ''} onChange={(e) => update(idx, { variantId: e.target.value || null })} className="text-[11px] px-2 py-1 border border-gray-200 rounded flex-1" aria-label="Variant image link">
                    <option value="">No variant</option>
                    {product.variants.map((v) => (
                      <option key={v.id} value={v.id}>{Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' · ') || v.sku || v.id}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        The other half of the product page's imagery: the images this site ships
        for the product, which the store has no record of. Before this panel the
        editor showed only the WooCommerce gallery, so a product whose page
        displayed four photographs showed one placeholder card here and nothing
        explained the gap.
      */}
      {(product.storefrontDefaultImages?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
            <Globe size={14} />
            {product.storefrontDefaultImages!.length} storefront image
            {product.storefrontDefaultImages!.length === 1 ? '' : 's'} WooCommerce does not hold
          </p>
          <p className="text-xs text-amber-800 mt-1">
            The product page shows these <strong>before</strong> the images above. They ship with this
            site and are matched to the product by slug or SKU, so they are not media items in the
            store, they cannot be edited or removed from here, and a save never writes them into the
            WooCommerce gallery. The way to make them ordinary store images is to import them into
            WordPress media, then retire this product&apos;s curated defaults.
          </p>
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {product.storefrontDefaultImages!.map((src) => (
              <figure key={src} className="rounded-lg overflow-hidden border border-amber-200 bg-white">
                <img src={src} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                <figcaption className="px-1.5 py-1 text-[10px] font-medium text-amber-700 truncate" title={src}>
                  Site default
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VARIANT MANAGER
// ============================================================================
function VariantManager({ product, onProduct }: { product: CatalogProduct; onProduct: (p: CatalogProduct) => void }) {
  const { notify } = useApp();
  // Variants are OPTIONAL — collapsed by default, expand only when needed.
  const [open, setOpen] = useState(() => product.variants.length > 0);
  const [v, setV] = useState<{ color: string; size: string; sku: string; price: string; qty: string }>({ color: '', size: '', sku: '', price: '', qty: '' });

  const add = () => {
    if (!v.color && !v.size) { notify('Enter a color or size', 'error'); return; }
    const attributes: Record<string, string> = {};
    if (v.color.trim()) attributes.color = v.color.trim();
    if (v.size.trim()) attributes.size = v.size.trim();
    onProduct({ ...product, variants: [...product.variants, { id: uid(), productId: product.id, attributes, sku: v.sku.trim(), price: v.price ? +v.price : product.price, compareAtPrice: null, costPrice: null, inventoryQty: v.qty ? +v.qty : 0, status: 'active', lowStockThreshold: 0 }] });
    setV({ color: '', size: '', sku: '', price: '', qty: '' });
  };

  const update = (vid: string, patch: Partial<CatalogVariant>) => {
    onProduct({ ...product, variants: product.variants.map((x) => (x.id === vid ? { ...x, ...patch } : x)) });
  };
  const remove = (vid: string) => {
    onProduct({ ...product, variants: product.variants.filter((x) => x.id !== vid) });
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3 border rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <List size={16} className="text-gray-500" />
          Variants <span className="text-xs font-normal text-gray-400">— optional, only when the product has options like color/size</span>
        </span>
        <span className={`text-xs font-semibold ${open ? 'text-blue-600' : 'text-gray-500'}`}>
          {product.variants.length > 0 ? `${product.variants.length} added` : 'Click to expand'}
          <span className="ml-1">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <>
          <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap gap-2 items-end">
            <div><label className={L}>Color</label><input value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className={I} placeholder="Gray" /></div>
            <div><label className={L}>Size</label><input value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} className={I} placeholder="Large" /></div>
            <div><label className={L}>SKU</label><input value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} className={I} /></div>
            <div><label className={L}>Price</label><input type="number" step="0.01" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} className={I} placeholder={String(product.price)} /></div>
            <div><label className={L}>Stock</label><input type="number" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} className={I} /></div>
            <button onClick={add} className="btn-glow px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1.5"><Plus size={15} />Add variant</button>
          </div>
          <p className="text-xs text-gray-400">Only genuine variant options. Assign a variant image in the Images tab — never guess a variant→image link.</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="px-3 py-2">Options</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Compare</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {product.variants.map((x) => (
                  <tr key={x.id} className="border-t">
                    <td className="px-3 py-2">{Object.entries(x.attributes).map(([k, val]) => <span key={k} className="mr-2"><span className="text-gray-400">{k}:</span> {val}</span>)}</td>
                    <td className="px-3 py-2"><input value={x.sku} onChange={(e) => update(x.id, { sku: e.target.value })} className="px-2 py-1 border rounded text-xs" /></td>
                    <td className="px-3 py-2"><input type="number" step="0.01" value={x.price ?? ''} onChange={(e) => update(x.id, { price: e.target.value ? +e.target.value : null })} className="px-2 py-1 border rounded text-xs w-20" /></td>
                    <td className="px-3 py-2"><input type="number" step="0.01" value={x.compareAtPrice ?? ''} onChange={(e) => update(x.id, { compareAtPrice: e.target.value ? +e.target.value : null })} className="px-2 py-1 border rounded text-xs w-20" /></td>
                    <td className="px-3 py-2"><input type="number" value={x.inventoryQty} onChange={(e) => update(x.id, { inventoryQty: +e.target.value })} className="px-2 py-1 border rounded text-xs w-20" /></td>
                    <td className="px-3 py-2"><button onClick={() => remove(x.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash size={14} /></button></td>
                  </tr>
                ))}
                {product.variants.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No variants — sold as one option.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// PROMOTIONS (coupons + offers + free shipping)
// ============================================================================
export function CatalogPromotionsPage() {
  useDbToken();
  const { notify } = useApp();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [offers, setOffers] = useState<StoreOffer[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [couponModal, setCouponModal] = useState<Coupon | 'new' | null>(null);
  const [offerModal, setOfferModal] = useState<StoreOffer | 'new' | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, os, ss, ps] = await Promise.all([listCoupons(), listOffers(), getStoreSettings(), listProducts()]);
      setCoupons(cs); setOffers(os); setSettings(ss); setProducts(ps);
    } catch (e) {
      notify(`Could not load promotions: ${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    try {
      await saveStoreSettings(settings);
      notify('Free-shipping settings saved');
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`, 'error');
    }
  };

  const onDeleteCoupon = async (id: string) => {
    try { await deleteCoupon(id); notify('Coupon deleted'); await load(); } catch (e) { notify(`Could not delete: ${(e as Error).message}`, 'error'); }
  };
  const onDeleteOffer = async (id: string) => {
    try { await deleteOffer(id); notify('Offer deleted'); await load(); } catch (e) { notify(`Could not delete: ${(e as Error).message}`, 'error'); }
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Loading promotions…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Promotions</h1><p className="text-sm text-gray-500">Coupons, store offers and free-shipping rules — all editable, no fake urgency.</p></div>
        <div className="flex gap-2">
          <button onClick={() => setCouponModal('new')} className="btn-glow px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg flex items-center gap-2"><Plus size={16} />Coupon</button>
          <button onClick={() => setOfferModal('new')} className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg flex items-center gap-2"><Megaphone size={16} />Offer</button>
        </div>
      </div>

      {/* Free shipping strategy */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Truck size={16} className="text-blue-600" />Free Shipping Strategy</h2>
        {settings && (
          <div className="flex flex-wrap gap-4 items-end">
            <label className="flex items-center gap-2 text-sm text-gray-600 pb-2"><input type="checkbox" checked={settings.freeShippingEnabled} onChange={(e) => setSettings({ ...settings, freeShippingEnabled: e.target.checked })} className="w-4 h-4" />Enable free shipping</label>
            <div><label className={L}>Cart minimum ($)</label><input type="number" min="0" step="0.01" value={settings.freeShippingThreshold} onChange={(e) => setSettings({ ...settings, freeShippingThreshold: +e.target.value })} className={`${I} w-32`} /></div>
            <button onClick={saveSettings} className="btn-glow px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm">Save rule</button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">Storewide threshold + per-product free-shipping flags (set on each product). This is a business rule, not a supplier shipping claim.</p>
      </div>

      {/* Coupons */}
      <div className="bg-white rounded-xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Coupons</h2>
          <span className="text-xs text-gray-400">{coupons.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="px-5 py-3">Code</th><th className="px-5 py-3">Discount</th><th className="px-5 py-3">Min cart</th><th className="px-5 py-3">Window</th><th className="px-5 py-3">Usage</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-5 py-3"><span className="font-mono font-semibold">{c.code}</span><div className="text-xs text-gray-400">{c.description || ''}</div></td>
                  <td className="px-5 py-3">{c.discountType === 'percent' ? `${c.discountValue}%` : `$${c.discountValue.toFixed(2)}`}</td>
                  <td className="px-5 py-3">${c.minCartValue.toFixed(2)}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{c.startAt ? new Date(c.startAt).toLocaleDateString() : '—'} → {c.endAt ? new Date(c.endAt).toLocaleDateString() : 'open'}</td>
                  <td className="px-5 py-3 text-xs">{c.usageLimit != null ? `${c.usedCount}/${c.usageLimit}` : `${c.usedCount}`}</td>
                  <td className="px-5 py-3"><StatusBadge status={c.isActive ? 'active' : 'inactive'} /></td>
                  <td className="px-5 py-3 flex gap-1">
                    <button onClick={() => setCouponModal(c)} className="p-1.5 hover:bg-blue-50 rounded text-blue-600"><PencilSimple size={15} /></button>
                    <button onClick={() => onDeleteCoupon(c.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash size={15} /></button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No coupons yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Offers */}
      <div className="bg-white rounded-xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Store Offers</h2>
          <span className="text-xs text-gray-400">{offers.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Value</th><th className="px-5 py-3">Scope</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} className="border-t hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">{o.name}</td>
                  <td className="px-5 py-3 text-xs">{o.offerType.replace('_', ' ')}</td>
                  <td className="px-5 py-3">{o.value != null ? (o.offerType === 'percentage' ? `${o.value}%` : `$${o.value.toFixed(2)}`) : '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{o.productIds.length} products · {o.categoryIds.length} categories</td>
                  <td className="px-5 py-3"><StatusBadge status={o.isActive ? 'active' : 'inactive'} /></td>
                  <td className="px-5 py-3 flex gap-1">
                    <button onClick={() => setOfferModal(o)} className="p-1.5 hover:bg-blue-50 rounded text-blue-600"><PencilSimple size={15} /></button>
                    <button onClick={() => onDeleteOffer(o.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash size={15} /></button>
                  </td>
                </tr>
              ))}
              {offers.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No store offers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Merchandising & Promotions */}
      <ProductPromotionsManager
        products={products}
        onProductUpdated={(upd) => setProducts((prev) => prev.map((x) => (x.id === upd.id ? upd : x)))}
      />

      <FeedPanel products={products} />

      <CouponModal coupon={couponModal} onClose={() => setCouponModal(null)} onSaved={load} />
      <OfferModal offer={offerModal} products={products} onClose={() => setOfferModal(null)} onSaved={load} />
    </div>
  );
}

function ProductPromotionsManager({ products, onProductUpdated }: { products: CatalogProduct[]; onProductUpdated: (p: CatalogProduct) => void }) {
  const { notify } = useApp();
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [editingPromo, setEditingPromo] = useState<Partial<CatalogProduct>>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)));
  }, [products, search]);

  const selectProduct = (p: CatalogProduct) => {
    setSelectedProduct(p);
    setEditingPromo({
      saleEnabled: p.saleEnabled,
      discountType: p.discountType || 'percent',
      discountValue: p.discountValue ?? 10,
      compareAtPrice: p.compareAtPrice,
      featured: p.featured,
      newArrival: p.newArrival,
      promoted: p.promoted,
      trending: p.trending,
      bestRated: p.bestRated,
      bestSeller: p.bestSeller,
    });
  };

  const handleSavePromo = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const payload: Partial<ProductInput> = {
        saleEnabled: Boolean(editingPromo.saleEnabled),
        discountType: editingPromo.discountType || 'percent',
        discountValue: editingPromo.discountValue != null ? Number(editingPromo.discountValue) : undefined,
        compareAtPrice: editingPromo.compareAtPrice != null ? Number(editingPromo.compareAtPrice) : undefined,
        featured: Boolean(editingPromo.featured),
        newArrival: Boolean(editingPromo.newArrival),
        promoted: Boolean(editingPromo.promoted),
        trending: Boolean(editingPromo.trending),
        bestRated: Boolean(editingPromo.bestRated),
        bestSeller: Boolean(editingPromo.bestSeller),
      };
      const updated = await updateProduct(selectedProduct.id, payload);
      if (updated) {
        onProductUpdated(updated);
        setSelectedProduct(updated);
        notify(`Promotions saved for ${updated.name}`);
      }
    } catch (e) {
      notify(`Could not save promotion: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Tag size={18} className="text-blue-600" />
            Product Merchandising & Promotions
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Search products to inspect promotion states and configure discounts, featured status, and evidence-backed badges.
          </p>
        </div>
        <div className="w-72">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-400"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><MagnifyingGlass size={13} /></span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-72 border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Price</th>
              <th className="px-3 py-2 text-left">Current Promotion State</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.slice(0, 30).map((p) => {
              const isSelected = selectedProduct?.id === p.id;
              const img = p.images[0]?.url;
              return (
                <tr key={p.id} className={`hover:bg-blue-50/40 transition-colors ${isSelected ? 'bg-blue-50/70' : ''}`}>
                  <td className="px-3 py-2 flex items-center gap-2 max-w-[260px]">
                    <div className="w-7 h-7 rounded bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-gray-400" />}
                    </div>
                    <span className="truncate font-medium text-gray-800" title={p.name}>{p.name}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600">{p.sku || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">${p.price.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {p.saleEnabled && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">Sale</span>}
                      {p.featured && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-semibold">Featured</span>}
                      {p.newArrival && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-semibold">New</span>}
                      {p.promoted && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-semibold">Promoted</span>}
                      {p.trending && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold">Trending</span>}
                      {p.bestRated && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold">Best Rated</span>}
                      {p.bestSeller && <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-semibold">Best Seller</span>}
                      {!p.saleEnabled && !p.featured && !p.newArrival && !p.promoted && !p.trending && !p.bestRated && !p.bestSeller && (
                        <span className="text-gray-400 text-[11px]">Standard</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => selectProduct(p)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold ${
                        isSelected ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {isSelected ? 'Editing' : 'Configure'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">No products match your search.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedProduct && (
        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">
              Configuring Promotions: <span className="text-blue-700">{selectedProduct.name}</span>
            </h3>
            <button onClick={() => setSelectedProduct(null)} className="p-1 hover:bg-gray-200 rounded text-gray-400"><X size={15} /></button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2 pt-2">
              <input
                id="cfg-sale"
                type="checkbox"
                checked={Boolean(editingPromo.saleEnabled)}
                onChange={(e) => setEditingPromo({ ...editingPromo, saleEnabled: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="cfg-sale" className="text-xs font-semibold text-gray-700">Enable Store Discount</label>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Discount Type</label>
              <select
                value={editingPromo.discountType || 'percent'}
                onChange={(e) => setEditingPromo({ ...editingPromo, discountType: e.target.value as 'percent' | 'fixed' })}
                className="w-full text-xs p-1.5 border rounded-lg bg-white"
              >
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Dollar Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Discount Value</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editingPromo.discountValue ?? ''}
                onChange={(e) => setEditingPromo({ ...editingPromo, discountValue: e.target.value ? +e.target.value : 0 })}
                className="w-full text-xs p-1.5 border rounded-lg bg-white"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            {[
              { key: 'featured', label: 'Featured Product' },
              { key: 'newArrival', label: 'New Arrival' },
              { key: 'promoted', label: 'Promoted' },
              { key: 'trending', label: 'Trending', caution: 'Requires real trend evidence' },
              { key: 'bestRated', label: 'Best Rated', caution: 'Requires verified reviews' },
              { key: 'bestSeller', label: 'Best Seller', caution: 'Requires sales volume evidence' },
            ].map(({ key, label, caution }) => (
              <label key={key} className="p-2 border rounded-lg bg-white flex items-start gap-2 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={Boolean(editingPromo[key as keyof typeof editingPromo])}
                  onChange={(e) => setEditingPromo({ ...editingPromo, [key]: e.target.checked })}
                  className="w-4 h-4 mt-0.5"
                />
                <div>
                  <span className="text-xs font-medium block text-gray-800">{label}</span>
                  {caution && <span className="text-[10px] text-amber-600 block">{caution}</span>}
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSavePromo}
              disabled={saving}
              className="btn-glow px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <FloppyDisk size={14} /> {saving ? 'Saving…' : 'Save Promotion'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedPanel({ products }: { products: CatalogProduct[] }) {
  const { notify } = useApp();
  const active = products.filter((p) => p.status === 'active');
  const download = () => {
    const csv = buildFeedCsv(active);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'himalayan-koh-merchant-feed.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    notify('Feed CSV downloaded (data only — nothing submitted externally)');
  };
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><GearSix size={16} className="text-blue-600" />Ads / Feed Readiness</h2>
          <p className="text-xs text-gray-500 mt-1">Merchant Center / Meta / Pinterest-ready rows for {active.length} ACTIVE products. No campaign, no billing, no submission — data only.</p>
        </div>
        <button onClick={download} className="btn-glow px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm flex items-center gap-2"><Download size={15} />Download feed CSV</button>
      </div>
    </div>
  );
}

function CouponModal({ coupon, onClose, onSaved }: { coupon: Coupon | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useApp();
  const [f, setF] = useState(() => ({
    code: coupon !== 'new' && coupon ? coupon.code : '',
    description: coupon !== 'new' && coupon ? coupon.description || '' : '',
    discountType: coupon !== 'new' && coupon ? coupon.discountType : 'percent' as 'percent' | 'fixed',
    discountValue: coupon !== 'new' && coupon ? coupon.discountValue : 10,
    minCartValue: coupon !== 'new' && coupon ? coupon.minCartValue : 0,
    usageLimit: coupon !== 'new' && coupon && coupon.usageLimit != null ? coupon.usageLimit : null,
    isActive: coupon !== 'new' && coupon ? coupon.isActive : true,
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setF({
      code: coupon !== 'new' && coupon ? coupon.code : '',
      description: coupon !== 'new' && coupon ? coupon.description || '' : '',
      discountType: coupon !== 'new' && coupon ? coupon.discountType : 'percent',
      discountValue: coupon !== 'new' && coupon ? coupon.discountValue : 10,
      minCartValue: coupon !== 'new' && coupon ? coupon.minCartValue : 0,
      usageLimit: coupon !== 'new' && coupon && coupon.usageLimit != null ? coupon.usageLimit : null,
      isActive: coupon !== 'new' && coupon ? coupon.isActive : true,
    });
  }, [coupon]);

  const save = async () => {
    if (!f.code.trim()) { notify('Code required', 'error'); return; }
    if (!(f.discountValue > 0)) { notify('Discount value must be > 0', 'error'); return; }
    setSaving(true);
    try {
      const input = { code: f.code, description: f.description, discountType: f.discountType, discountValue: f.discountValue, minCartValue: f.minCartValue, usageLimit: f.usageLimit, isActive: f.isActive };
      if (coupon === 'new') await createCoupon(input); else if (coupon) await updateCoupon(coupon.id, input);
      notify('Coupon saved');
      onClose(); onSaved();
    } catch (e) {
      notify(`Could not save coupon: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!coupon} onClose={onClose} title={coupon === 'new' ? 'New Coupon' : 'Edit Coupon'}>
      <div className="space-y-4 px-6 pb-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={L}>Code</label><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className={I} placeholder="WELCOME10" /></div>
          <div><label className={L}>Description</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={I} placeholder="10% first-order promotion" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={L}>Type</label>
            <select value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value as 'percent' | 'fixed' })} className={I}>
              <option value="percent">Percentage</option><option value="fixed">Fixed ($)</option>
            </select>
          </div>
          <div><label className={L}>Value</label><input type="number" min="0" step="0.01" value={f.discountValue} onChange={(e) => setF({ ...f, discountValue: +e.target.value })} className={I} /></div>
          <div><label className={L}>Min cart ($)</label><input type="number" min="0" step="0.01" value={f.minCartValue} onChange={(e) => setF({ ...f, minCartValue: +e.target.value })} className={I} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={L}>Usage limit (blank = unlimited)</label><input type="number" min="0" value={f.usageLimit ?? ''} onChange={(e) => setF({ ...f, usageLimit: e.target.value ? +e.target.value : null })} className={I} /></div>
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-gray-600 pb-2"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="w-4 h-4" />Active</label></div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={save} disabled={saving} className="btn-glow flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg font-medium">{saving ? 'Saving…' : 'Save coupon'}</button>
          <button onClick={onClose} className="flex-1 py-2.5 border rounded-lg">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function OfferModal({ offer, products, onClose, onSaved }: { offer: StoreOffer | 'new' | null; products: CatalogProduct[]; onClose: () => void; onSaved: () => void }) {
  const { notify } = useApp();
  const [f, setF] = useState(() => ({
    name: offer !== 'new' && offer ? offer.name : '',
    offerType: offer !== 'new' && offer ? offer.offerType : 'percentage' as StoreOffer['offerType'],
    value: offer !== 'new' && offer && offer.value != null ? String(offer.value) : '',
    productIds: offer !== 'new' && offer ? offer.productIds : [] as string[],
    categoryIds: offer !== 'new' && offer ? offer.categoryIds : [] as string[],
    isActive: offer !== 'new' && offer ? offer.isActive : true,
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setF({
      name: offer !== 'new' && offer ? offer.name : '',
      offerType: offer !== 'new' && offer ? offer.offerType : 'percentage',
      value: offer !== 'new' && offer && offer.value != null ? String(offer.value) : '',
      productIds: offer !== 'new' && offer ? offer.productIds : [],
      categoryIds: offer !== 'new' && offer ? offer.categoryIds : [],
      isActive: offer !== 'new' && offer ? offer.isActive : true,
    });
  }, [offer]);

  const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = async () => {
    if (!f.name.trim()) { notify('Offer name required', 'error'); return; }
    setSaving(true);
    try {
      const input = {
        name: f.name, offerType: f.offerType, value: f.value ? +f.value : null,
        productIds: f.productIds, categoryIds: f.categoryIds, isActive: f.isActive,
      };
      if (offer === 'new') await createOffer(input); else if (offer) await updateOffer(offer.id, input);
      notify('Offer saved');
      onClose(); onSaved();
    } catch (e) {
      notify(`Could not save offer: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!offer} onClose={onClose} title={offer === 'new' ? 'New Offer' : 'Edit Offer'} size="lg">
      <div className="space-y-4 px-6 pb-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={L}>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={I} placeholder="Free Shipping Week" /></div>
          <div><label className={L}>Type</label>
            <select value={f.offerType} onChange={(e) => setF({ ...f, offerType: e.target.value as StoreOffer['offerType'] })} className={I}>
              <option value="percentage">Percentage sale</option>
              <option value="product_sale">Product sale</option>
              <option value="category_sale">Category sale</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={L}>Value ({f.offerType === 'percentage' ? '%' : '$'})</label><input type="number" min="0" step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} className={I} /></div>
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-gray-600 pb-2"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="w-4 h-4" />Active</label></div>
        </div>
        {(f.offerType === 'product_sale' || f.offerType === 'category_sale') && (
          <div>
            <label className={L}>Scope</label>
            <div className="border rounded-lg max-h-40 overflow-y-auto p-2 grid sm:grid-cols-2 gap-1">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded px-2 py-1">
                  <input type="checkbox" checked={f.productIds.includes(p.id)} onChange={() => setF({ ...f, productIds: toggle(f.productIds, p.id) })} className="w-3.5 h-3.5" />
                  {p.name}
                </label>
              ))}
              {products.length === 0 && <span className="text-xs text-gray-400 p-2">No products yet.</span>}
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg font-medium">{saving ? 'Saving…' : 'Save offer'}</button>
          <button onClick={onClose} className="flex-1 py-2.5 border rounded-lg">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
