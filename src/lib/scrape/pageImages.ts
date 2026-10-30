/**
 * Server-side product-image discovery.
 *
 * Two jobs, both of which the admin console needs and neither of which can run
 * in the browser (CORS + the provider key):
 *
 *  1. `fetchPageHtml` / `extractImagesFromHtml` — fetch a page and pull its
 *     product images, mirroring the rules the client already trusts
 *     (`features/ai/importer.ts#parseHtmlPage`): og:image, twitter:image,
 *     JSON-LD, real <img> attributes and srcset, with CDN thumbnails upscaled
 *     and logos/icons/badges/pixels dropped.
 *
 *  2. `fetchImagesForTitle` — the owner's ask: give it the product title and it
 *     finds the matching page(s) ON THE STORE'S OWN SITE (sitemap-driven token
 *     matching, plus a direct slug guess), then returns their images.
 *
 * `rankImagesWithAi` then asks the configured model (OpenRouter/Gemini, via the
 * console's single key) which of those images actually belong to the title. It
 * can only ever *filter* the list it was given — a URL the model invents is
 * discarded, so the model can never introduce an image we did not fetch.
 */

import { checkFetchableUrl } from './urlSafety';
import { askModel, extractJsonObject } from '../ai/askModel';

export interface PageImage {
  url: string;
  /** Where on the page it came from. */
  source: 'og' | 'twitter' | 'jsonld' | 'img';
  /** 1 = explicitly declared as THE product image, lower = weaker evidence. */
  weight: number;
}

export interface PageFetchResult {
  ok: boolean;
  status: number | null;
  html: string;
  finalUrl: string;
  error: string | null;
}

const USER_AGENT =
  'Mozilla/5.0 (compatible; HimalayanKohAdminBot/1.0; +https://preview.himalayankoh.com) AppleWebKit/537.36';

const MAX_HTML_BYTES = 2_000_000;

/** Fetch a page's HTML for server-side parsing. Read-only GET, size- and time-capped. */
export async function fetchPageHtml(
  rawUrl: string,
  options: { timeoutMs?: number } = {}
): Promise<PageFetchResult> {
  const safety = checkFetchableUrl(rawUrl);
  if (!safety.ok) {
    return { ok: false, status: null, html: '', finalUrl: '', error: safety.reason };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(safety.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const body = await response.text();
    const html = body.length > MAX_HTML_BYTES ? body.slice(0, MAX_HTML_BYTES) : body;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        html,
        finalUrl: response.url || safety.url,
        error: `The page responded with HTTP ${response.status}.`,
      };
    }
    return { ok: true, status: response.status, html, finalUrl: response.url || safety.url, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      html: '',
      finalUrl: safety.url,
      error: /abort/i.test(message) ? 'The page took too long to respond.' : `Could not reach the page (${message}).`,
    };
  } finally {
    clearTimeout(timer);
  }
}

const JUNK_IMAGE = /(favicon|logo|icon|badge|sprite|loader|spinner|pixel|transparent\.gif|placeholder|1x1|avatar|payment|flag)/i;

/** Absolutize + de-thumbnail an image URL; '' when it is not a usable image. */
export function normalizeImageUrl(raw: string, baseUrl: string): string {
  let value = (raw || '').trim().replace(/^['"]|['"]$/g, '').replace(/\\/g, '');
  if (!value) return '';
  if (value.startsWith('//')) value = `https:${value}`;
  if (!/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value, baseUrl || undefined).toString();
    } catch {
      return '';
    }
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  if (JUNK_IMAGE.test(value)) return '';
  let cleaned = value
    .replace(/\b_(\d{2,3}x\d{2,3}|thumb|small|compact|thumbnail)\b/gi, '_1200x')
    .replace(/\.avif$/i, '')
    .replace(/(\.(?:jpe?g|png|webp))_[\w\d.]+$/i, '$1')
    .replace(/\/s-l\d+\.(jpg|png)/i, '/s-l1600.$1');
  if (!/\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(cleaned) && !/image/i.test(parsed.pathname)) {
    // Allow query-driven image CDNs (e.g. ?format=jpg) but not arbitrary text assets.
    if (!/(\?|&)(format|fm|w|width)=/i.test(cleaned)) return '';
  }
  cleaned = cleaned.replace(/#.*$/, '');
  return cleaned;
}

function metaContent(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

/** Pull every image a product page actually declares. Order = evidence strength. */
export function extractImagesFromHtml(html: string, baseUrl: string): PageImage[] {
  const found = new Map<string, PageImage>();
  const add = (raw: string, source: PageImage['source'], weight: number) => {
    const url = normalizeImageUrl(raw, baseUrl);
    if (!url) return;
    const existing = found.get(url);
    if (existing && existing.weight >= weight) return;
    found.set(url, { url, source, weight });
  };

  add(metaContent(html, 'og:image:secure_url'), 'og', 10);
  add(metaContent(html, 'og:image'), 'og', 10);
  add(metaContent(html, 'twitter:image'), 'twitter', 8);
  add(metaContent(html, 'twitter:image:src'), 'twitter', 8);

  // JSON-LD Product images are declared data, not layout.
  for (const block of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = block[1];
    for (const m of raw.matchAll(/"image"\s*:\s*(?:"([^"]+)"|\[([^\]]*)\])/gi)) {
      const single = m[1];
      const list = m[2];
      if (single) add(single, 'jsonld', 9);
      if (list) for (const u of list.matchAll(/"([^"]+)"/g)) add(u[1], 'jsonld', 9);
    }
  }

  for (const m of html.matchAll(
    /(?:src|data-src|data-zoom-image|data-large[-_]image|data-original|data-high[-_]res|data-old-hires|data-full-size-image-url|data-hd-src|data-ks-lazyload)=["']([^"']+)["']/gi
  )) {
    add(m[1], 'img', 4);
  }

  for (const m of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    for (const candidate of m[1].split(',').map((c) => c.trim().split(/\s+/)[0])) {
      add(candidate, 'img', 3);
    }
  }

  return [...found.values()].sort((a, b) => b.weight - a.weight);
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'pack', 'size', 'new', 'buy', 'shop', 'sale']);

/**
 * Tokens that identify a product. Digits always count, however short: in
 * "Himalayan Rock Salt — 45 lbs" the `45` is the most distinctive token in the
 * title, and dropping it (as a plain length filter does) is what let a lamp
 * page outrank the real product page.
 */
function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    // Two characters is enough only for a number ("45" identifies a pack size);
    // bare single digits are noise — "2–3 large chunks" must not dilute every
    // candidate's score with a "2" and a "3".
    .filter((t) => (t.length >= 3 || (t.length >= 2 && /\d/.test(t))) && !STOP_WORDS.has(t));
}

/** A number is a stronger signal of the same product than a common word. */
function tokenWeight(token: string): number {
  return /\d/.test(token) ? 2 : 1;
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Score how well a page URL answers a product title (0..1). */
export function scoreUrlAgainstTitle(url: string, title: string): number {
  const tokens = titleTokens(title);
  if (!tokens.length) return 0;
  let haystack = url.toLowerCase();
  try {
    haystack = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    /* keep the raw string */
  }
  const total = tokens.reduce((sum, token) => sum + tokenWeight(token), 0);
  const matched = tokens
    .filter((token) => haystack.includes(token))
    .reduce((sum, token) => sum + tokenWeight(token), 0);
  const ratio = matched / total;
  return haystack.includes(slugifyTitle(title)) ? Math.min(1, ratio + 0.35) : ratio;
}

/**
 * Collect the store's product-page URLs.
 *
 * No single entry point is reliable across both storefronts we serve:
 * WordPress answers `/sitemap.xml` with a redirect and publishes
 * `/product-sitemap.xml`, and a flat index may be at `/sitemap_index.xml`. So
 * every known root is tried, and when none of them yields pages we fall back to
 * the links on the shop page — which is always present and always current.
 */
async function collectSitePages(origin: string): Promise<string[]> {
  const base = origin.replace(/\/+$/, '');
  const seen = new Set<string>();

  for (const root of [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/product-sitemap.xml`]) {
    const res = await fetchPageHtml(root, { timeoutMs: 12_000 });
    if (!res.ok || !res.html) continue;
    const locs = [...res.html.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
    for (const loc of locs.filter((u) => !/\.xml(\?|$)/i.test(u))) seen.add(loc);
    for (const child of locs.filter((u) => /\.xml(\?|$)/i.test(u)).slice(0, 8)) {
      const childRes = await fetchPageHtml(child, { timeoutMs: 12_000 });
      if (!childRes.ok) continue;
      for (const m of childRes.html.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
        const loc = m[1].trim();
        if (!/\.xml(\?|$)/i.test(loc)) seen.add(loc);
      }
    }
  }

  if (!seen.size) {
    for (const shopPath of ['/shop/', '/products']) {
      const shop = await fetchPageHtml(`${base}${shopPath}`, { timeoutMs: 15_000 });
      if (!shop.ok) continue;
      for (const m of shop.html.matchAll(/href=["']([^"']*\/product[s]?\/[^"'#?]+)/gi)) {
        try {
          seen.add(new URL(m[1], shop.finalUrl || base).toString());
        } catch {
          /* ignore a malformed href */
        }
      }
      if (seen.size) break;
    }
  }

  return [...seen];
}

export interface ImageCandidate {
  /** Pages that were looked at, with why they were chosen. */
  pages: { url: string; score: number; fetched: boolean; status: number | null; error: string | null }[];
}

export interface ResolvedImages extends ImageCandidate {
  images: PageImage[];
  /** Every page considered, best first — so a weak match is visible, not hidden. */
  candidates: { url: string; score: number }[];
  /** Populated when the AI ranking ran (or explains why it did not). */
  ai: { used: boolean; provider: string | null; model: string | null; reason: string; kept: number };
}

/**
 * Find the pages on `origin` that best answer `title`, then their images.
 * When `explicitUrl` is given it is used instead of searching.
 */
export async function fetchImagesForTitle(input: {
  title: string;
  origin: string;
  explicitUrl?: string;
  /** How many pages may SUCCEED (each contributes images). */
  maxPages?: number;
  /** How many pages may be TRIED before giving up. */
  maxAttempts?: number;
}): Promise<ResolvedImages> {
  const maxPages = Math.max(1, Math.min(input.maxPages ?? 2, 3));
  const maxAttempts = Math.max(maxPages, Math.min(input.maxAttempts ?? 4, 6));
  const pages: ResolvedImages['pages'] = [];

  let candidates: { url: string; score: number }[] = [];
  if (input.explicitUrl) {
    candidates = [{ url: input.explicitUrl, score: 1 }];
  } else {
    // A store publishes product pages under one of two shapes: /products/<slug>
    // (this app) or /product/<slug> (the WordPress store). The guessed URLs are
    // high-scoring but may not exist, so attempts and successes are budgeted
    // separately: the guess is tried first, and a 404 does not consume the
    // allowance for pages that actually have images.
    const base = input.origin.replace(/\/+$/, '');
    const slug = slugifyTitle(input.title);
    const guesses = [`${base}/products/${slug}`, `${base}/product/${slug}`];
    const scored = (await collectSitePages(input.origin))
      .map((url) => ({ url, score: scoreUrlAgainstTitle(url, input.title) }))
      .filter((entry) => entry.score >= 0.4);
    const seen = new Set<string>();
    candidates = [...scored, ...guesses.map((url) => ({ url, score: scoreUrlAgainstTitle(url, input.title) }))]
      .filter((entry) => (seen.has(entry.url) ? false : seen.add(entry.url)))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxAttempts);
  }

  const images = new Map<string, PageImage>();
  let tried = 0;
  let succeeded = 0;
  for (const candidate of candidates) {
    if (tried >= maxAttempts || succeeded >= maxPages) break;
    tried += 1;
    const res = await fetchPageHtml(candidate.url);
    pages.push({
      url: candidate.url,
      score: Number(candidate.score.toFixed(3)),
      fetched: res.ok,
      status: res.status,
      error: res.error,
    });
    if (!res.ok) continue;
    succeeded += 1;
    for (const image of extractImagesFromHtml(res.html, res.finalUrl || candidate.url)) {
      if (!images.has(image.url)) images.set(image.url, image);
    }
  }

  return {
    pages,
    candidates,
    images: [...images.values()].sort((a, b) => b.weight - a.weight).slice(0, 16),
    ai: { used: false, provider: null, model: null, reason: 'AI ranking not run.', kept: 0 },
  };
}

/**
 * Ask the model which of the fetched images actually belong to this title.
 * Strictly a filter: any URL not in `images` is ignored.
 */
export async function rankImagesWithAi(
  title: string,
  images: PageImage[],
  timeoutMs = 25_000
): Promise<ResolvedImages['ai'] & { keptUrls: string[] }> {
  const allowed = new Set(images.map((i) => i.url));
  const idle = { used: false, provider: null, model: null, kept: 0, keptUrls: images.map((i) => i.url) };
  if (images.length <= 1) {
    return { ...idle, reason: 'Only one image — nothing to rank.' };
  }

  const system =
    'You match product photographs to a product listing. You may only choose from the URLs given. ' +
    'Prefer images that clearly show the product itself over lifestyle, logo, packaging or unrelated shots. ' +
    'Reply with JSON only.';

  const prompt = `Product title: ${title}

Candidate image URLs (in page order, strongest evidence first):
${images.map((i, idx) => `${idx + 1}. ${i.url}`).join('\n')}

Which of these images show THIS product and are worth publishing? Reply with:
{"keep": ["<url>", ...], "reason": "<one short sentence>"}
Only use URLs from the list above.`;

  try {
    const result = await askModel({ prompt, system, json: true, timeoutMs, maxTokens: 600 });
    const parsed = extractJsonObject(result.text);
    const keep = Array.isArray(parsed?.keep) ? (parsed?.keep as unknown[]).map(String) : null;
    if (!keep || !keep.length) {
      return { ...idle, reason: 'The model returned no usable selection; images left unranked.' };
    }
    const keptUrls = keep.filter((url) => allowed.has(url));
    if (!keptUrls.length) {
      return { ...idle, reason: 'The model selected only URLs that were not fetched; images left unranked.' };
    }
    return {
      used: true,
      provider: result.provider,
      model: result.model,
      reason: typeof parsed?.reason === 'string' ? parsed.reason.slice(0, 240) : 'Ranked by AI.',
      kept: keptUrls.length,
      keptUrls,
    };
  } catch (error) {
    return {
      ...idle,
      reason: `AI ranking unavailable (${error instanceof Error ? error.message : 'unknown error'}); images left unranked.`,
    };
  }
}
