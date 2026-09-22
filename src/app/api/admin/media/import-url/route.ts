import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { checkFetchableUrl } from '@/lib/scrape/urlSafety';
import { WordPressApiError } from '@/lib/backend/wordpress';
import { MAX_MEDIA_BYTES, uploadMediaToWordPress } from '@/lib/media/wordpressMedia';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = MAX_MEDIA_BYTES;
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
    const message = isAbort ? 'Image download timed out (15s limit reached).' : err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: isAbort ? 504 : 500 });
  } finally {
    clearTimeout(timer);
  }
}
