/**
 * POST /api/admin/product-images
 *
 * "Find images for this product title." The admin paste-a-URL flow only works
 * when a human already knows the exact page; this answers the question the
 * editor actually has — *given the title, where does the store already show this
 * product?* — by matching the title against the site's own sitemap, trying the
 * obvious product slug, fetching the best pages, and extracting their images.
 *
 * The AI step is a FILTER, never a source: it may only keep or drop URLs we
 * already fetched, so a model can never introduce an image into the catalog.
 * When no key is configured (or the model errors) the images are returned
 * unranked, with a reason — the feature degrades, it does not fail.
 *
 * Security: admin session, origin-checked, rate-limited, and every fetched URL
 * passes the SSRF guard. Read-only against the site; writes nothing.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { resolveRuntimeSiteOrigin } from '@/lib/site/origin';
import { backendConfig } from '@/lib/backend/config';
import { checkFetchableUrl } from '@/lib/scrape/urlSafety';
import { fetchImagesForTitle, rankImagesWithAi } from '@/lib/scrape/pageImages';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const origin = request.headers.get('origin') || '';
  if (origin && !isAllowedRequestOrigin(origin, request.url)) {
    return NextResponse.json({ error: 'This origin may not use the image finder.' }, { status: 403 });
  }

  const limit = checkRateLimit(`product-images:${auth.userId}`, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many image searches in the last minute. Wait a moment.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'A product title is required.' }, { status: 400 });

  const explicitUrl = typeof record.url === 'string' ? record.url.trim() : '';
  if (explicitUrl && !checkFetchableUrl(explicitUrl).ok) {
    return NextResponse.json({ error: checkFetchableUrl(explicitUrl).reason }, { status: 400 });
  }

  // The store the admin is working on. Defaults to the catalogue this deployment
  // already reads its products from — production is never implied, only used when
  // asked for. Neither a build-time constant nor the Worker's own hostname is used
  // as the primary source: the constant had degraded to `http://localhost:3000` on
  // staging (every page refused), and a Worker fetching its own hostname answers
  // `HTTP 522`, so "search our own store" has to go through the backend.
  const requestedOrigin = typeof record.origin === 'string' ? record.origin.trim() : '';
  let siteOrigin = resolveRuntimeSiteOrigin(request.url, {
    catalogueBackend: backendConfig.wordpressBaseUrl,
  });
  if (requestedOrigin) {
    const safety = checkFetchableUrl(requestedOrigin);
    if (!safety.ok) return NextResponse.json({ error: safety.reason }, { status: 400 });
    siteOrigin = safety.url.replace(/\/+$/, '');
  }

  const resolved = await fetchImagesForTitle({ title, origin: siteOrigin, explicitUrl: explicitUrl || undefined });
  const rank = record.rank !== false;
  // Unranked means "keep everything we found", stated in the same shape so the
  // caller never has to branch on whether ranking ran.
  const ai = rank
    ? await rankImagesWithAi(title, resolved.images)
    : { ...resolved.ai, keptUrls: resolved.images.map((image) => image.url) };

  const keptUrls = new Set(ai.keptUrls);
  const images = ai.used ? resolved.images.filter((image) => keptUrls.has(image.url)) : resolved.images;

  return NextResponse.json(
    {
      title,
      origin: siteOrigin,
      images,
      // Say plainly what was searched and what came back, so an empty result
      // reads as "nothing matched" rather than "the feature is broken".
      pages: resolved.pages,
      candidates: resolved.candidates,
      ai: { used: ai.used, provider: ai.provider, model: ai.model, reason: ai.reason, kept: ai.kept },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
