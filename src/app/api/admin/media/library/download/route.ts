/**
 * `GET /api/admin/media/library/download?id=<attachment id>` — one image, as a file.
 *
 * The library grid renders WordPress-hosted files from another origin, and a
 * cross-origin `<a download>` is ignored by browsers: WordPress serves these
 * files `Content-Disposition: inline`, so the click opens a tab instead of saving.
 * A client-side `fetch` cannot fix that either — the media host sends no
 * `Access-Control-Allow-Origin`, so the body is unreadable. This route is the one
 * place that can hand the browser the bytes with a filename attached.
 *
 * It reads the attachment's own `source_url` rather than accepting a URL from the
 * caller, and refuses anything that is not on the configured WordPress origin, so
 * it can never be turned into a proxy for an arbitrary host. It needs no
 * credentials to fetch the file — media files are public — so the administrator
 * application password is never sent anywhere but the REST API.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import { backendConfig } from '@/lib/backend/config';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';

export const dynamic = 'force-dynamic';

/** A file bigger than this is refused rather than held in memory. */
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;

interface WpMedia {
  id?: number;
  source_url?: string;
  title?: { rendered?: string };
  mime_type?: string;
}

/**
 * The name the owner gets on disk.
 *
 * Uploads are stored under a UUID, so the URL basename is useless to a human —
 * the media *title* is the original file name in that case. Prefer the title when
 * it already carries an extension, otherwise fall back to the URL. Either way a
 * path separator or a quote can never reach the header.
 */
export function mediaDownloadFilename(media: WpMedia): string {
  const urlName = String(media.source_url || '').split('/').pop()?.split('?')[0] || '';
  const title = String(media.title?.rendered || '').trim();
  const titleLooksLikeFile = /\.[a-z0-9]{2,5}$/i.test(title);
  const base = titleLooksLikeFile ? title : urlName || title || `image-${media.id ?? 'download'}`;

  const cleaned = base
    .replace(/[\\/]+/g, '-')
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(0, 140);

  return cleaned || `image-${media.id ?? 'download'}`;
}

function failure(error: unknown, fallback: string) {
  if (error instanceof WordPressApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status || 502 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'A media id is required.' }, { status: 400 });
  }

  try {
    const media = await wordpressRequest<WpMedia>(`/wp/v2/media/${id}`, {
      params: { _fields: 'id,source_url,title,mime_type' },
      credentials: requireWordPressCredentials(),
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const sourceUrl = String(media.source_url || '');
    if (!sourceUrl) {
      return NextResponse.json({ error: 'That image has no stored file.' }, { status: 404 });
    }

    // Same origin as the configured WordPress site, or nothing is fetched: this
    // route must never follow a URL a tampered media entry could point elsewhere.
    const allowed = new URL(backendConfig.wordpressBaseUrl);
    const target = new URL(sourceUrl);
    if (target.origin !== allowed.origin) {
      return NextResponse.json(
        { error: 'That file is not hosted on the store’s WordPress site, so it cannot be downloaded from here.' },
        { status: 400 }
      );
    }

    const file = await fetch(sourceUrl, { redirect: 'follow' });
    if (!file.ok) {
      return NextResponse.json(
        { error: `The stored file answered HTTP ${file.status}.` },
        { status: 502 }
      );
    }

    const declaredLength = Number(file.headers.get('content-length') || 0);
    if (declaredLength > MAX_DOWNLOAD_BYTES) {
      return NextResponse.json(
        { error: `That file is larger than ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)} MB, which this console will not pull through.` },
        { status: 413 }
      );
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
      return NextResponse.json({ error: 'That file is too large to download here.' }, { status: 413 });
    }

    const filename = mediaDownloadFilename(media);
    const contentType = media.mime_type || file.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // No explicit Content-Length: the runtime sets it from the body, and a
        // hand-written one only risks disagreeing with the bytes actually sent.
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return failure(error, 'The image could not be downloaded.');
  }
}
