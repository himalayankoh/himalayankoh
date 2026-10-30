/**
 * GET /api/fetch-page?url=<absolute url>
 *
 * The server-side page fetch every admin importer depends on. It was missing
 * from this app entirely, which is why "Fetch all from page", AI Import,
 * Product Scout and Listing Task all failed with `Page fetch failed (HTTP 404)`
 * — the browser was calling a route that did not exist.
 *
 * Contract the existing callers rely on (do not change casually):
 *  - the body of a successful fetch is the page's HTML, served as
 *    `text/plain` (the importers treat `text/html` as a sign that they were
 *    handed the SPA shell or an error page instead of the requested document);
 *  - a failure is JSON with an `error`, plus `diagnostics[]` on 502, which the
 *    importer surfaces verbatim in the admin log.
 *
 * Security: admin session required, origin-checked when an Origin header is
 * present, rate-limited per admin, and every target passes the SSRF guard
 * (`lib/scrape/urlSafety`) before the server will connect to it. Read-only GET.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { checkFetchableUrl } from '@/lib/scrape/urlSafety';

export const dynamic = 'force-dynamic';

const MAX_HTML_BYTES = 2_000_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; HimalayanKohAdminBot/1.0; +https://preview.himalayankoh.com) AppleWebKit/537.36';

async function fetchDirect(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
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
    return {
      ok: response.ok,
      status: response.status,
      text: body.length > MAX_HTML_BYTES ? body.slice(0, MAX_HTML_BYTES) : body,
      mode: 'direct',
      error: response.ok ? null : `The page responded with HTTP ${response.status}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null as number | null,
      text: '',
      mode: 'direct',
      error: /abort/i.test(message) ? 'The page took too long to respond.' : `Could not reach the page (${message}).`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Optional credential-backed scrape, used only when the direct fetch fails. */
async function fetchViaScrapeDo(url: string, timeoutMs: number) {
  const token = (process.env.SCRAPE_DO_TOKEN || '').trim();
  if (!token) return null;
  const endpoint = `https://api.scrape.do/?token=${encodeURIComponent(token)}&url=${encodeURIComponent(url)}`;
  const result = await fetchDirect(endpoint, timeoutMs);
  return { ...result, mode: 'scrape.do' };
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const origin = request.headers.get('origin') || '';
  if (origin && !isAllowedRequestOrigin(origin, request.url)) {
    return NextResponse.json({ error: 'This origin may not use the page fetcher.' }, { status: 403 });
  }

  const limit = checkRateLimit(`fetch-page:${auth.userId}`, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many page fetches in the last minute. Wait a moment.' }, { status: 429 });
  }

  const target = new URL(request.url).searchParams.get('url') || '';
  const safety = checkFetchableUrl(target);
  if (!safety.ok) return NextResponse.json({ error: safety.reason }, { status: 400 });

  let result = await fetchDirect(safety.url, 25_000);
  // A bot wall or a transient 5xx is worth one credential-backed retry.
  if ((!result.ok || result.text.length < 500) && (process.env.SCRAPE_DO_TOKEN || '').trim()) {
    const fallback = await fetchViaScrapeDo(safety.url, 35_000);
    if (fallback && fallback.ok && fallback.text.length > result.text.length) result = fallback;
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || 'The page could not be fetched.',
        diagnostics: [
          {
            scraper_attempt: 1,
            http_status: result.status,
            response_chars: result.text.length,
            scrape_mode: result.mode,
            product_title_found: /<title[^>]*>/i.test(result.text),
            product_image_found: /og:image/i.test(result.text),
            jsonld_product_found: /"@type"\s*:\s*"Product"/i.test(result.text),
          },
        ],
      },
      { status: 502 }
    );
  }

  return new Response(result.text, {
    status: 200,
    headers: {
      // Deliberately text/plain: the callers must be able to tell a scraped page
      // apart from an SPA shell or an application/JSON error.
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
