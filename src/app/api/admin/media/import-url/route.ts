import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { checkFetchableUrl } from '@/lib/scrape/urlSafety';
import { WordPressApiError } from '@/lib/backend/wordpress';
import { MAX_MEDIA_BYTES, uploadMediaToWordPress } from '@/lib/media/wordpressMedia';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = MAX_MEDIA_BYTES;

/**
 * True when reading the remote image failed at the connection level — DNS, TLS,
 * a refused connection — rather than because of anything this server did.
 * `fetch` reports all of those as a bare `TypeError: fetch failed` with the real
 * reason on `cause`, so the cause is what distinguishes them.
 */
function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === 'fetch failed') return true;
  const cause = (error as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === 'string' && cause.code.length > 0;
}
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { url?: string; productId?: string; altText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrl = (body.url || '').trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }

  // 1. SSRF Safety Verification
  const safety = checkFetchableUrl(rawUrl);
  if (!safety.ok) {
    return NextResponse.json({ error: `Security check rejected this URL: ${safety.reason}` }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  // Which half of the import failed. Both halves fetch over the network, so
  // without this an unreachable WordPress would be reported as an unreachable
  // image URL.
  let stage: 'fetch' | 'upload' = 'fetch';

  try {
    // 2. Fetch external image server-side
    const response = await fetch(safety.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not fetch image from source (HTTP ${response.status} ${response.statusText})` },
        { status: 502 }
      );
    }

    // 3. Validate content-type
    const rawContentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = ALLOWED_MIME_TYPES[rawContentType];
    if (!ext) {
      return NextResponse.json(
        { error: `Source URL returned an invalid or unsupported content-type: "${rawContentType}". Must be JPG, PNG, WebP, GIF, or AVIF.` },
        { status: 415 }
      );
    }

    // 4. Validate size before or during buffer loading
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength && contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image size (${Math.round(contentLength / 1024)} KB) exceeds the 5 MB limit.` },
        { status: 413 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image size (${Math.round(buffer.length / 1024)} KB) exceeds the 5 MB limit.` },
        { status: 413 }
      );
    }

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Fetched image is empty.' }, { status: 400 });
    }

    // The bytes are the ones that were just fetched and validated. WordPress owns
    // the file from here: it becomes a Media Library item, so WooCommerce can use
    // it, WordPress's own editors can see it, and the storefront gets one URL.
    stage = 'upload';
    try {
      const media = await uploadMediaToWordPress({
        buffer,
        filename: `${crypto.randomUUID()}.${ext}`,
        contentType: rawContentType,
        title: rawUrl.split('/').pop()?.split('?')[0] || 'imported-image',
      });

      return NextResponse.json({
        success: true,
        publicUrl: media.sourceUrl,
        mediaId: media.id,
        contentType: rawContentType,
        size: buffer.length,
        filename: media.sourceUrl.split('/').pop() || `${crypto.randomUUID()}.${ext}`,
      });
    } catch (uploadError) {
      if (uploadError instanceof WordPressApiError) {
        return NextResponse.json({ error: uploadError.message }, { status: uploadError.status || 502 });
      }
      throw uploadError;
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort) {
      return NextResponse.json(
        { error: 'Image download timed out (15s limit reached).' },
        { status: 504 }
      );
    }
    if (stage === 'fetch' && isNetworkFailure(err)) {
      // Measured live: an unreachable host answered `500 {"error":"fetch failed"}`,
      // which says nothing about what the owner typed.
      return NextResponse.json(
        {
          error:
            'Unable to fetch that image URL. Check that it is a public link to a real image file and that the host is reachable from the server.',
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    );
  } finally {
    clearTimeout(timer);
  }
}
