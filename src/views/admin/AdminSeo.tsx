'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Package,
  FolderTree,
  FileText,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { getFreshAccessToken } from '../../services/wordpressAdminAuth';
import { getWooAdminProduct, updateWooAdminProduct } from '../../lib/admin/wooProductApi';
import { NICHE_SECTIONS } from '../../lib/catalog/nicheSections';

interface ProductItem {
  id: number;
  slug: string;
  name: string;
  price: string;
  sku: string;
  category: string;
  description: string;
  image?: string;
  inStock?: boolean;
}

interface SeoDraftResponse {
  language: 'en';
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  imageAltSuggestions: string[];
  shortSeoCopy: string;
  notes: string[];
  warnings?: string[];
}

interface ConnectionStatus {
  state: 'CONNECTED' | 'NOT CONFIGURED' | 'INVALID KEY' | 'QUOTA/RATE LIMITED' | 'MODEL UNAVAILABLE' | 'SERVER ERROR';
  model: string;
  provider?: string;
  keySource?: string;
  detail: string;
}

export default function AdminSeo() {
  const { session } = useAuthContext();

  // Mode: 'product' | 'category'
  const [sourceMode, setSourceMode] = useState<'product' | 'category'>('product');

  // Real products
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Categories
  const categories = NICHE_SECTIONS;
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>(NICHE_SECTIONS[0].key);

  // Connection status
  const [connStatus, setConnStatus] = useState<ConnectionStatus | null>(null);
  const [testingConn, setTestingConn] = useState(false);

  // Custom keywords input
  const [customKeywords, setCustomKeywords] = useState('');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeoDraftResponse | null>(null);

  // Editable review fields
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewMeta, setReviewMeta] = useState('');
  const [reviewCopy, setReviewCopy] = useState('');

  // Clipboard feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Writing the reviewed draft onto the product, and the store's own answer.
  const [applying, setApplying] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const getAuthToken = useCallback(async (): Promise<string> => {
    if (session?.access_token) return session.access_token;
    const fresh = await getFreshAccessToken();
    return fresh || '';
  }, [session]);

  // Load real catalog products
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        setLoadingProducts(true);
        const res = await fetch('/api/catalog');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.products)) {
          setProducts(data.products);
          if (data.products.length > 0) {
            setSelectedProductId(data.products[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load products for SEO:', err);
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  // Test connection
  const testConnection = useCallback(async () => {
    setTestingConn(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/seo/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status) {
        setConnStatus(data.status);
      } else if (data.error) {
        setConnStatus({
          state: 'SERVER ERROR',
          model: 'unknown',
          detail: data.error,
        });
      }
    } catch (err) {
      setConnStatus({
        state: 'SERVER ERROR',
        model: 'unknown',
        detail: err instanceof Error ? err.message : 'Failed to connect',
      });
    } finally {
      setTestingConn(false);
    }
  }, [getAuthToken]);

  // Test on mount
  useEffect(() => {
    testConnection();
  }, [testConnection]);

  // Selected item data
  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;
  const selectedCategory = categories.find((c) => c.key === selectedCategoryKey) || categories[0];

  // Copy helper
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Generate SEO handler
  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);

    const token = await getAuthToken();
    const keywords = customKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    let payload: Record<string, unknown>;

    if (sourceMode === 'product') {
      if (!selectedProduct) {
        setGenError('Please select a product first.');
        setGenerating(false);
        return;
      }
      payload = {
        subject: 'product',
        name: selectedProduct.name,
        facts: {
          sku: selectedProduct.sku,
          price: selectedProduct.price,
          category: selectedProduct.category,
          description: selectedProduct.description,
        },
        keywords,
      };
    } else {
      payload = {
        subject: 'category',
        name: selectedCategory.label,
        facts: {
          category: selectedCategory.label,
          description: selectedCategory.description,
        },
        keywords,
      };
    }

    try {
      const res = await fetch('/api/admin/seo/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      if (json.draft) {
        setDraft(json.draft);
        setReviewTitle(json.draft.seoTitle || '');
        setReviewMeta(json.draft.metaDescription || '');
        setReviewCopy(json.draft.shortSeoCopy || '');
      } else {
        throw new Error('No draft returned by server.');
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'SEO generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Writes the reviewed draft onto the product in the store.
   *
   * It goes through the same write seam the product editor saves with — the
   * values land in the product's own `meta_data` (`_yoast_wpseo_title`,
   * `_yoast_wpseo_metadesc`, `_himalayan_koh_seo_keywords`), which is what the
   * storefront reads and what the store's own admin shows. The product is then
   * read back, because "saved" is only honest if the store hands the value back:
   * a write that is kept but not returned would otherwise be reported as done.
   *
   * Categories are not products: a shelf's copy lives in the hub's content, and
   * that is edited on the Category Hubs screen, so this stays a product action.
   */
  const applyToStore = async () => {
    if (!selectedProduct || !draft) return;
    setApplying(true);
    setApplyError(null);
    setApplyNotice(null);
    const title = reviewTitle.trim();
    const description = reviewMeta.trim();
    try {
      // A form left open past the session's expiry must not fail the write.
      await getFreshAccessToken();
      const keywords = [draft.primaryKeyword, ...draft.secondaryKeywords]
        .map((keyword) => keyword.trim())
        .filter((keyword, index, all) => keyword.length > 0 && all.indexOf(keyword) === index);

      const result = await updateWooAdminProduct(selectedProduct.id, {
        seo: { title: title || null, description: description || null },
        seoKeywords: keywords,
      });

      const refused = result.ignored.map((entry) => `${entry.field}: ${entry.reason}`);
      if (refused.length) {
        setApplyError(`The store would not store: ${refused.join('; ')}`);
      }

      const stored = await getWooAdminProduct(selectedProduct.id)
        .then((answer) => answer.product)
        .catch(() => null);
      const storedTitle = stored?.seoTitle ?? null;

      if (!stored) {
        setApplyNotice(
          'The store accepted the write, but the product could not be read back to confirm it. Check the product in WooCommerce.'
        );
      } else if (storedTitle === (title || null)) {
        setApplyNotice(
          `Saved and read back from the store: ${title ? `“${title}”` : 'the SEO title is now empty'}. The storefront shows it on its next render.`
        );
      } else {
        setApplyNotice(
          `The store reports ${storedTitle ? `“${storedTitle}”` : 'nothing'} for the SEO title, not what was sent. Check the product in WooCommerce.`
        );
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'The SEO could not be written to the store.');
    } finally {
      setApplying(false);
    }
  };

  const copyAllBundle = () => {
    if (!draft) return;
    const bundle = `=== SEO METADATA ===\nTitle: ${reviewTitle}\nMeta Description: ${reviewMeta}\nPrimary Keyword: ${draft.primaryKeyword}\nSecondary Keywords: ${draft.secondaryKeywords.join(', ')}\n\n=== SHORT COPY ===\n${reviewCopy}\n\n=== IMAGE ALT TEXT ===\n${draft.imageAltSuggestions.join('\n')}`;
    copyToClipboard(bundle, 'bundle');
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-16">
      {/* Header & Connection Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Sparkles size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Himalayan Koh SEO Engine</h1>
                <p className="text-xs text-gray-500">
                  Server-side AI copy grounded strictly in real WooCommerce catalog facts. English copy only.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {connStatus && (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    connStatus.state === 'CONNECTED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connStatus.state === 'CONNECTED' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  {connStatus.state}
                </span>

                <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-gray-100 text-gray-700 border border-gray-200">
                  {connStatus.model}
                </span>
              </div>
            )}

            <button
              onClick={testConnection}
              disabled={testingConn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors border border-gray-300 disabled:opacity-60"
            >
              <RefreshCw size={13} className={testingConn ? 'animate-spin' : ''} />
              Test Connection
            </button>
          </div>
        </div>

        {connStatus?.detail && (
          <p className="mt-3 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-2.5">
            {connStatus.detail}
          </p>
        )}
      </div>

      {/* Source Selector: Product vs Category */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column: Grounding Selection */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">1. Select Grounding Source</h2>

            {/* Source Mode Toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSourceMode('product')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  sourceMode === 'product'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Package size={14} />
                Product
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('category')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  sourceMode === 'category'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FolderTree size={14} />
                Category
              </button>
            </div>

            {/* Product Selector */}
            {sourceMode === 'product' ? (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gray-700">
                  Published WooCommerce Products ({products.length})
                </label>
                {loadingProducts ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
                    <Loader2 size={16} className="animate-spin text-amber-500" />
                    Loading catalog products...
                  </div>
                ) : (
                  <select
                    value={selectedProductId ?? ''}
                    onChange={(e) => setSelectedProductId(Number(e.target.value))}
                    className="w-full text-xs bg-white border border-gray-300 rounded-xl p-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                )}

                {selectedProduct && (
                  <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-2 text-xs">
                    <div className="font-semibold text-gray-900">{selectedProduct.name}</div>
                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                      <div>
                        <span className="font-medium">SKU:</span> {selectedProduct.sku}
                      </div>
                      <div>
                        <span className="font-medium">Price:</span> {selectedProduct.price}
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium">Shelf:</span> {selectedProduct.category}
                      </div>
                    </div>
                    {selectedProduct.description && (
                      <div className="text-gray-500 line-clamp-3 pt-1 border-t border-amber-100/60">
                        {selectedProduct.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Category Selector */
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gray-700">
                  Store Taxonomy Shelves ({categories.length})
                </label>
                <select
                  value={selectedCategoryKey}
                  onChange={(e) => setSelectedCategoryKey(e.target.value)}
                  className="w-full text-xs bg-white border border-gray-300 rounded-xl p-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-2 text-xs">
                  <div className="font-semibold text-gray-900">{selectedCategory.label}</div>
                  <div className="text-gray-600">{selectedCategory.description}</div>
                  <div className="text-gray-400 font-mono">key: {selectedCategory.key}</div>
                </div>
              </div>
            )}

            {/* Optional keywords */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="block text-xs font-medium text-gray-700">
                Target Keywords (Optional, comma-separated)
              </label>
              <input
                type="text"
                value={customKeywords}
                onChange={(e) => setCustomKeywords(e.target.value)}
                placeholder="e.g. pink salt wholesale, mineral licks"
                className="w-full text-xs bg-white border border-gray-300 rounded-xl p-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            {/* Action button */}
            <button
              onClick={handleGenerate}
              disabled={generating || (sourceMode === 'product' && !selectedProduct)}
              className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating English SEO...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate SEO Draft
                </>
              )}
            </button>

            {genError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{genError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Columns: Generate → Review → Apply */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                2. Review &amp; Copy Draft (English Output)
              </h2>
              {draft && (
                <button
                  onClick={copyAllBundle}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
                >
                  {copiedKey === 'bundle' ? <Check size={14} /> : <Copy size={14} />}
                  {copiedKey === 'bundle' ? 'Copied Bundle!' : 'Copy All SEO Data'}
                </button>
              )}
            </div>

            {!draft ? (
              <div className="py-16 text-center text-gray-400 space-y-2">
                <FileText size={36} className="mx-auto text-gray-300" />
                <p className="text-sm font-medium text-gray-600">No SEO draft generated yet</p>
                <p className="text-xs max-w-sm mx-auto text-gray-400">
                  Select a real WooCommerce product or category on the left, then click &quot;Generate SEO Draft&quot; to review suggestions.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warnings if any */}
                {draft.warnings && draft.warnings.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                    <ShieldAlert size={16} className="shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      {draft.warnings.map((w, idx) => (
                        <div key={idx}>{w}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SEO Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-800 flex items-center gap-2">
                      SEO Title
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          reviewTitle.length <= 60
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {reviewTitle.length}/60 chars
                      </span>
                    </label>
                    <button
                      onClick={() => copyToClipboard(reviewTitle, 'title')}
                      className="text-xs text-gray-500 hover:text-amber-700 inline-flex items-center gap-1"
                    >
                      {copiedKey === 'title' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      {copiedKey === 'title' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    className="w-full text-xs font-medium p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                {/* Meta Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-800 flex items-center gap-2">
                      Meta Description
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          reviewMeta.length <= 155
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {reviewMeta.length}/155 chars
                      </span>
                    </label>
                    <button
                      onClick={() => copyToClipboard(reviewMeta, 'meta')}
                      className="text-xs text-gray-500 hover:text-amber-700 inline-flex items-center gap-1"
                    >
                      {copiedKey === 'meta' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      {copiedKey === 'meta' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={reviewMeta}
                    onChange={(e) => setReviewMeta(e.target.value)}
                    className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                {/* Primary & Secondary Keywords */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-800">Primary Keyword</label>
                      <button
                        onClick={() => copyToClipboard(draft.primaryKeyword, 'kw-pri')}
                        className="text-xs text-gray-500 hover:text-amber-700 inline-flex items-center gap-1"
                      >
                        {copiedKey === 'kw-pri' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      </button>
                    </div>
                    <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800">
                      {draft.primaryKeyword}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-800">Secondary Keywords</label>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {draft.secondaryKeywords.map((kw, i) => (
                        <span
                          key={i}
                          onClick={() => copyToClipboard(kw, `sec-${i}`)}
                          className="cursor-pointer text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-lg border border-gray-200 transition-colors"
                          title="Click to copy"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Image Alt Suggestions */}
                {draft.imageAltSuggestions && draft.imageAltSuggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-800">Image Alt Text Suggestions</label>
                    <div className="space-y-1.5">
                      {draft.imageAltSuggestions.map((alt, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700"
                        >
                          <span>{alt}</span>
                          <button
                            onClick={() => copyToClipboard(alt, `alt-${i}`)}
                            className="text-gray-400 hover:text-amber-700 shrink-0 ml-2"
                          >
                            {copiedKey === `alt-${i}` ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Short Factual Copy */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-800">Factual Product Copy (English)</label>
                    <button
                      onClick={() => copyToClipboard(reviewCopy, 'copy')}
                      className="text-xs text-gray-500 hover:text-amber-700 inline-flex items-center gap-1"
                    >
                      {copiedKey === 'copy' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      {copiedKey === 'copy' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={reviewCopy}
                    onChange={(e) => setReviewCopy(e.target.value)}
                    className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                {/* Notes */}
                {draft.notes && draft.notes.length > 0 && (
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-800 space-y-1">
                    <span className="font-semibold">Fact Grounding Notes:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                      {draft.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Apply Section */}
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    3. Apply to WordPress / WooCommerce
                  </h3>
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                    <div className="flex items-start gap-3">
                      <Info size={18} className="text-gray-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-gray-600 space-y-1">
                        {sourceMode === 'product' ? (
                          <>
                            <p className="font-semibold text-gray-800">
                              Written to the product in the store, then read back
                            </p>
                            <p>
                              Applying writes the reviewed title, meta description and keywords onto{' '}
                              {selectedProduct ? selectedProduct.name : 'the selected product'} as the store&apos;s own SEO fields (
                              <code className="bg-gray-200 px-1 py-0.5 rounded text-[11px]">_yoast_wpseo_title</code>,{' '}
                              <code className="bg-gray-200 px-1 py-0.5 rounded text-[11px]">_yoast_wpseo_metadesc</code>
                              ) — the same write the product editor&apos;s SEO tab makes — and then reads the product
                              back, so &quot;saved&quot; here means the store returned the value.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold text-gray-800">A shelf&apos;s own copy is edited elsewhere</p>
                            <p>
                              A category is not a product: its title, meta description and landing copy belong to the
                              hub, and they are edited on the <span className="font-medium text-gray-800">Category Hubs</span>{' '}
                              screen. Use the copy buttons above if you want the draft somewhere else.
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        onClick={() => void applyToStore()}
                        disabled={applying || sourceMode !== 'product' || !selectedProduct}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                      >
                        {applying ? <Loader2 size={13} className="animate-spin" /> : null}
                        {applying ? 'Writing to the store…' : 'Apply to Store'}
                      </button>
                      <button
                        onClick={copyAllBundle}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                      >
                        <Copy size={13} />
                        Copy All Metadata
                      </button>
                    </div>

                    {applyNotice && (
                      <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                        {applyNotice}
                      </p>
                    )}
                    {applyError && (
                      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                        {applyError}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
