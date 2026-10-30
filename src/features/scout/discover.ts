// ============================================================================
// HIMALAYAN KOH — SCOUT AUTONOMOUS DISCOVERY (Phase 4A closure)
//
// Query-based discovery: turn a plain-language query ("pink salt", "salt
// accessories") into a deduped list of real product-page URLs, then hand
// them to the existing research pipeline. Manual URL mode stays available
// as an advanced option in the admin UI.
//
// Discovery uses PUBLIC search endpoints only (DuckDuckGo HTML) fetched
// through the same proxies the importer already uses — no scraping
// credentials, no brittle proxy chains, no secrets in the browser.
// ============================================================================

import { hostOf } from './normalize';

export interface DiscoverOptions {
  /** Plain-language query, e.g. "pink salt" or "salt licks". */
  query: string;
  /** Target market appended to the query, e.g. "USA". */
  market?: string;
  /** Maximum number of URLs to return (default 25). */
  maxResults?: number;
  /** Optional max supplier cost — used to bias the query, not fabricate data. */
  maxSupplierCost?: number;
  /** Optional category keyword (fine/coarse/lamp/bath…) appended to the query. */
  category?: string;
}

/**
 * Concrete Himalayan Koh product types used to expand a generic query
 * ("pink salt") into real product searches. Each becomes its own search so a
 * category-level query still surfaces actual product pages. Never invents
 * results — it only broadens the query into honest product terms.
 */
export const QUERY_EXPANSIONS = [
  'himalayan pink salt',
  'pink salt fine',
  'pink salt coarse',
  'salt lamp',
  'himalayan salt lamp',
  'bath salt',
  'salt block for livestock',
  'salt lick',
  'salt grinder',
  'salt and pepper set',
  'salt scrub',
  'pickling salt',
  'soaking salt',
  'salt slab',
  'salt gift set',
];

export interface DiscoverResult {
  query: string;
  /** Raw links extracted from the search results (pre-filter). */
  rawLinks: string[];
  /** Links after product-page filtering + dedupe. */
  urls: string[];
  /** How many raw links were dropped as non-product pages. */
  filtered: number;
  /** How many were dropped as duplicates. */
  duplicates: number;
  /** Optional warning (e.g. "search endpoint unreachable"). */
  warning?: string;
  /** Which search source produced the results (e.g. 'duckduckgo', 'mojeek'). */
  source?: string;
}

/** Decode a DuckDuckGo /l/?uddg= redirect URL into the real target. */
export function decodeRedirectUrl(href: string): string | null {
  try {
    const u = new URL(href);
    const uddg = u.searchParams.get('uddg');
    if (uddg) return uddg;
    // Some links are already direct (no uddg wrapper).
    if (u.hostname === 'duckduckgo.com' && u.pathname === '/l/') return null;
    return href;
  } catch {
    return null;
  }
}

/** Extract http(s) links from raw search-result text (HTML or markdown). */
export function extractLinks(raw: string): string[] {
  const out = new Set<string>();
  // Markdown links: [title](url)
  for (const m of raw.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
    out.add(m[1]);
  }
  // HTML <a href="...">
  for (const m of raw.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) {
    out.add(m[1]);
  }
  // Bare URLs
  for (const m of raw.matchAll(/(https?:\/\/[^\s<>"')\]]+)/g)) {
    const s = m[1].replace(/[.,;:!?]+$/, '');
    if (/^https?:\/\//i.test(s)) out.add(s);
  }
  return [...out];
}

/** Strip tracking params and trailing slashes for a stable product URL. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    // Remove common tracking params.
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid']) {
      u.searchParams.delete(k);
    }
    let s = u.toString();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) s = s.replace(/([^/])\/$/, '$1');
    return s;
  } catch {
    return url;
  }
}

const NON_PRODUCT_PATH = /^\/(?:search|category|categories|collections?|shop(?:-[a-z]+)?(?:\/|$)|account|login|cart|checkout|about|contact|privacy|terms|blog|news|faq|help|sitemap|track|support|wishlist|gift|deals?|sale|clearance|brands?|vendors?|policies?|returns|shipping|stores?|wholesale)(?:[/?#]|$)/i;

/** Listing/nav segments that must never be treated as product pages. */
const LISTING_SEGMENT = /^(?:search|category|categories|collections?|shop|account|login|cart|checkout|about|contact|privacy|terms|blog|news|faq|help|sitemap|track|support|wishlist|gift|deals?|sale|clearance|brands?|vendors?|returns|shipping|stores?|wholesale|products(?:-all)?|all|new|featured|index|home)$/i;

const BLOCKED_DOMAINS = /(?:duckduckgo|bing|google|yahoo|facebook|instagram|pinterest|youtube|tiktok|reddit|wikipedia|wikihow|aliexpress\.com\/category|amazon\.(?:com|co\.uk|de|ca)\/(?:s\?|b\/|gp\/bestsellers|gp\/new-releases|stores|events))/i;

/** Heuristic: is this link likely a single product page (not a listing)? */
export function isLikelyProductPage(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname;
    if (BLOCKED_DOMAINS.test(host + u.pathname)) return false;
    const path = u.pathname;
    // Must have a real path (a domain root is a listing, not a product).
    if (path.length < 2 || path === '/') return false;
    // Category/search/account/cart/blog paths are not single products.
    if (NON_PRODUCT_PATH.test(path)) return false;
    const segments = path.split('/').filter(Boolean);
    // Deep product paths (>= 2 segments) are almost always product pages.
    if (segments.length >= 2) return true;
    // Single-segment path: reject listing/nav segments and generic plurals
    // (salt-licks, lamps, grinders = listings; pink-salt-fine-1kg = a product).
    // The research pipeline is the real product filter — discovery only avoids
    // category/blog/search pages.
    const seg = segments[0];
    if (LISTING_SEGMENT.test(seg)) return false;
    if (/s$/.test(seg) && /^(?:salt|lick|block|lamp|grain|grinder|scrub|soak|bath|slab|crystal|chunk|shaker|mill|gift|suppl|accessor)[a-z-]*s$/i.test(seg)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Dedupe a URL list by canonical host+path, preferring the first seen. */
export function dedupeUrls(urls: string[]): { urls: string[]; duplicates: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  let duplicates = 0;
  for (const raw of urls) {
    const clean = cleanUrl(raw);
    const key = dedupeKeyForUrl(clean);
    if (!key || seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    out.push(clean);
  }
  return { urls: out, duplicates };
}

function dedupeKeyForUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = hostOf(url);
    // Ignore query strings except real product IDs on the retail hosts the
    // evidence rules actually search.
    const q = /(?:amazon|target|walmart|tractorsupply)\./i.test(host) ? u.search : '';
    return `${host}${u.pathname.replace(/\/+$/, '')}${q}`;
  } catch {
    return '';
  }
}

/**
 * Search-source fallback chain (resilience): discovery never depends on a
 * single public search endpoint. Each source is a keyless HTML endpoint
 * fetched through the same proxy chain as the importer — nothing new ships
 * in the bundle. If one source is down/empty the next is tried, so a single
 * API outage can never take the whole Supplier DB down.
 */
export const SEARCH_SOURCES = [
  { id: 'duckduckgo', label: 'DuckDuckGo HTML', build: (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
  { id: 'mojeek', label: 'Mojeek', build: (q: string) => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}` },
  { id: 'startpage', label: 'Startpage HTML', build: (q: string) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}` },
];

/** Build the primary (DuckDuckGo) search URL — kept for legacy callers/tests. */
export function buildSearchUrl(opts: DiscoverOptions): string {
  const parts = [opts.query.trim(), opts.market?.trim(), opts.category?.trim()].filter(Boolean);
  if (opts.maxSupplierCost && opts.maxSupplierCost > 0) {
    parts.push(`under $${opts.maxSupplierCost}`);
  }
  const q = parts.join(' ');
  return SEARCH_SOURCES[0].build(q);
}

/**
 * Build the concrete search queries for one discovery run. A generic
 * category-level query ("pink salt") is expanded into specific salt
 * product types so real product pages surface; a product-specific query
 * ("Himalayan Salt Medium Grain 45 lbs") is searched as-is.
 */
export function buildQueries(opts: DiscoverOptions): string[] {
  const q = opts.query.trim();
  if (!q) return [];
  const market = opts.market?.trim() || '';
  const cost = opts.maxSupplierCost && opts.maxSupplierCost > 0 ? ` under $${opts.maxSupplierCost}` : '';
  const suffix = [market, cost].filter(Boolean).join(' ');
  const mk = (term: string) => [term, suffix].filter(Boolean).join(' ');

  // Product-specific: contains a concrete product noun or brand word → search
  // the ORIGINAL query as-is. A product-specific seed query (e.g. a CJ-seeded
  // concept like "himalayan salt cooking slab") must NEVER be replaced by
  // unrelated
  // generic QUERY_EXPANSIONS — the original query is the authoritative search
  // term. The noun list covers the concrete salt-product vocabulary actually
  // used by the CJ seed concepts (cage, playpen, mat, blanket, ramp, sofa, bag,
  // backpack, trailer, seat belt, clothes, shoe, fence, saucer, tub, …).
  if (/\b(?:salt|lick|block|lamp|grain|grinder|scrub|soak|bath|slab|crystal|chunk|shaker|mill|dust|brine|pickling|deodorant|inhaler|tealight|candle ?holder|platter|tile|pouch|sack|bag|bulk|wholesale|edible|livestock|horse|cattle)\b/i.test(q)) {
    return [mk(q)];
  }
  // STRUCTURAL GUARANTEE (Phase 4J/4K): a query that names this store's own
  // niche AND carries enough concrete phrase (>= 3 significant tokens) is a
  // specific product query, NOT a generic category — even when its product noun
  // is not in the list above (e.g. "himalayan pink salt grinder stainless
  // steel"). Only genuinely generic category phrases ("pink salt", "salt
  // accessories") get expanded.
  const NICHE = /\b(?:salt|himalayan|pink salt|mineral)\b/i;
  const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (NICHE.test(q) && tokens.length >= 3) {
    return [mk(q)];
  }
  // Generic category query → expand into concrete product types.
  return QUERY_EXPANSIONS.map((term) => mk(term));
}

/**
 * Run autonomous discovery: fetch search results through the provided fetcher
 * (defaults to the importer's public-proxy path), decode redirects, filter to
 * product pages, dedupe, and return up to maxResults URLs.
 *
 * The fetcher receives the search URL and returns raw page text/markdown.
 * Returns a warning instead of throwing when the search endpoint is
 * unreachable, so the admin UI can show "try manual URL mode" honestly.
 */
export async function discoverUrls(
  opts: DiscoverOptions,
  fetchRaw: (url: string) => Promise<string> = fetchRawPage
): Promise<DiscoverResult> {
  const queries = buildQueries(opts);
  if (!queries.length) {
    return { query: opts.query, rawLinks: [], urls: [], filtered: 0, duplicates: 0, warning: 'Empty query.' };
  }

  const max = Math.max(1, opts.maxResults ?? 25);
  const seenLinks = new Set<string>();
  const urls: string[] = [];
  let filtered = 0;
  let duplicates = 0;
  let warning = '';
  // Track which search source actually produced results (audit/UI honesty).
  let sourceUsed: string | null = null;

  for (const query of queries) {
    const q = [opts.market?.trim(), opts.category?.trim()].filter(Boolean).join(' ');
    const fullQuery = [query, q].filter(Boolean).join(' ');
    // Try each search source in order; a source that is down or returns junk
    // falls through to the next. A single search endpoint outage must never
    // kill discovery for the whole run.
    let raw = '';
    for (const src of SEARCH_SOURCES) {
      try {
        const candidate = await fetchRaw(src.build(fullQuery));
        if (candidate && candidate.trim().length >= 100) {
          raw = candidate;
          sourceUsed = src.id;
          break;
        }
        warning = warning || `Search source “${src.label}” returned no usable content for “${query}”.`;
      } catch (e) {
        warning = warning || `Search source “${src.label}” unreachable for “${query}”: ${(e as Error).message}`;
      }
    }
    if (!raw) continue;
    for (const link of extractLinks(raw)) {
      const real = decodeRedirectUrl(link);
      if (!real) continue;
      if (seenLinks.has(real)) { duplicates++; continue; }
      seenLinks.add(real);
      if (!isLikelyProductPage(real)) { filtered++; continue; }
      const clean = cleanUrl(real);
      if (!urls.includes(clean)) urls.push(clean);
      if (urls.length >= max) break;
    }
    if (urls.length >= max) break;
  }

  return {
    query: opts.query,
    rawLinks: [...seenLinks],
    urls: urls.slice(0, max),
    filtered,
    duplicates,
    warning: warning || undefined,
    source: sourceUsed ?? undefined,
  };
}

/**
 * Default raw fetcher: try the server proxy first (production), then the
 * public Jina Reader (returns markdown with links preserved), then allorigins.
 * Mirrors the importer's proxy chain so nothing new is added to the bundle.
 */
export async function fetchRawPage(url: string): Promise<string> {
  // Server proxy (production only; returns null in Vite dev).
  try {
    const r = await fetch(`/api/fetch-page?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(40_000),
      headers: { Accept: 'text/plain' },
    });
    if (r.ok) {
      const ct = r.headers.get('content-type') || '';
      const text = await r.text();
      if (!ct.includes('text/html') && !ct.includes('javascript') && !/<!doctype html/i.test(text)) {
        return text;
      }
    }
  } catch {
    /* fall through */
  }
  const proxies: { label: string; url: string }[] = [
    { label: 'Jina Reader', url: `https://r.jina.ai/${encodeURIComponent(url)}` },
    { label: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  ];
  let lastErr = '';
  for (const { label, url: proxy } of proxies) {
    try {
      const r = await fetch(proxy, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
      if (r.ok) {
        const text = await r.text();
        if (text.trim().length >= 100) return text;
        lastErr = `${label}: empty`;
      } else {
        lastErr = `${label}: HTTP ${r.status}`;
      }
    } catch (e) {
      lastErr = `${label}: ${(e as Error).message}`;
    }
  }
  throw new Error(lastErr || 'no proxy available');
}
