/**
 * WordPress Media Library uploads — the one module that puts a file into WordPress.
 *
 * Supabase Storage owned the storefront's images (buckets `products`, `categories`,
 * `blog`). WordPress owns media now, and this is the app's only writer.
 *
 * ## Why this is not `wordpressRequest`
 *
 * That client sends JSON, which is right for every other endpoint and wrong for this
 * one: WordPress's media endpoint takes the file as the raw request body with the
 * filename in `Content-Disposition`. So this module composes its own request — and
 * because it bypasses the shared client, it re-implements that client's two
 * non-negotiables explicitly: an explicit timeout, and fatal-page detection rather
 * than presenting a WordPress PHP fatal as "unexpected token '<'".
 *
 * ## Server-only
 *
 * An administrator application password is full site access. Nothing here may be
 * imported by a browser bundle: uploads arrive as route-handler requests, not from
 * the browser talking to WordPress.
 *
 * ## Existing Supabase-hosted images
 *
 * Nothing in this module rewrites a URL. An image that already lives on a Supabase
 * bucket keeps its URL and keeps working; `scripts/migrate-media-to-wordpress.mjs`
 * is the explicit, resumable job that copies those files in and reports what it
 * could not move. A half-migrated media library with silently broken images is the
 * outcome this split exists to prevent.
 */

import { backendConfig } from '@/lib/backend/config';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import { looksLikeHtml, looksLikeWordPressFatal } from '@/lib/backend/wordpressFatal.mjs';

/** Default ceiling for a media upload. Matches the admin upload UI's own limit. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

const UPLOAD_TIMEOUT_MS = 45_000;

/** A media item as WordPress reports it, reduced to what callers need. */
export interface UploadedMedia {
  /** The attachment id — what `featured_media` and Woo product images point at. */
  id: number;
  /** The public URL of the stored file. */
  sourceUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

interface WpMediaResponse {
  id?: number;
  source_url?: string;
  mime_type?: string;
  media_details?: { width?: number; height?: number };
}

/** A filename WordPress (and every filesystem under it) will accept. */
function safeFilename(filename: string, fallbackExt: string): string {
  const trimmed = (filename || '').trim();
  const base = trimmed.split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[.-]+/, '');
  if (!cleaned) return `upload-${Date.now()}.${fallbackExt}`;
  return cleaned.length > 120 ? `${cleaned.slice(0, 100)}.${cleaned.split('.').pop()}` : cleaned;
}

/** The image extension implied by a content type, for a filename that lost one. */
export function extensionForContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  return map[contentType.toLowerCase()] ?? 'jpg';
}

/**
 * Uploads a file to the WordPress Media Library.
 *
 * Throws `WordPressApiError` on every failure path — including the unconfigured case,
 * which is the one that must not look like a successful upload: an image the owner
 * believes is saved and that is not is worse than a visible error.
 */
export async function uploadMediaToWordPress(input: {
  buffer: Uint8Array;
  filename: string;
  contentType: string;
  title?: string;
  altText?: string;
}): Promise<UploadedMedia> {
  const base = backendConfig.wordpressApiRoot;
  if (!base) {
    throw new WordPressApiError({
      message: 'WordPress is not configured for this deployment (WORDPRESS_BASE_URL is empty).',
      path: '/wp/v2/media',
      status: 0,
    });
  }

  if (input.buffer.byteLength === 0) {
    throw new WordPressApiError({ message: 'The file is empty.', path: '/wp/v2/media', status: 0 });
  }
  if (input.buffer.byteLength > MAX_MEDIA_BYTES) {
    throw new WordPressApiError({
      message: `The file is larger than the ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB limit.`,
      path: '/wp/v2/media',
      status: 0,
    });
  }

  const credentials = requireWordPressCredentials();
  const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  const filename = safeFilename(input.filename, extensionForContentType(input.contentType));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${base}/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': input.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        Accept: 'application/json',
      },
      body: input.buffer as unknown as BodyInit,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new WordPressApiError({
      message: aborted
        ? `The upload to WordPress timed out after ${UPLOAD_TIMEOUT_MS}ms.`
        : `The upload to WordPress failed: ${error instanceof Error ? error.message : String(error)}`,
      path: '/wp/v2/media',
      status: 0,
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text().catch(() => '');
  const isFatal = looksLikeWordPressFatal(raw);

  if (!response.ok || isFatal) {
    let message = `WordPress rejected the upload (HTTP ${response.status}).`;
    if (isFatal) {
      message =
        `WordPress threw a PHP fatal error (HTTP ${response.status}) on /wp/v2/media. ` +
        'The media endpoint is broken on the origin — a server-side WordPress problem, not a client bug.';
    } else if (!looksLikeHtml(raw)) {
      try {
        const parsed = JSON.parse(raw) as { code?: string; message?: string };
        if (parsed.message) message = `WordPress error ${parsed.code ?? response.status}: ${parsed.message}`;
      } catch {
        /* neither HTML nor JSON — the generic message stands */
      }
    }
    throw new WordPressApiError({
      message,
      path: '/wp/v2/media',
      status: response.status,
      isWordPressFatal: isFatal,
      isHtmlResponse: looksLikeHtml(raw),
    });
  }

  let media: WpMediaResponse;
  try {
    media = JSON.parse(raw) as WpMediaResponse;
  } catch {
    throw new WordPressApiError({
      message: 'WordPress accepted the upload but returned a body that was not valid JSON.',
      path: '/wp/v2/media',
      status: response.status,
    });
  }

  if (!media.id || !media.source_url) {
    throw new WordPressApiError({
      message: 'WordPress accepted the upload but returned no media id or URL.',
      path: '/wp/v2/media',
      status: response.status,
    });
  }

  if (input.altText || input.title) {
    // Alt text is set in a second call because the upload endpoint takes no fields
    // at all — the alternative is losing it, and alt text is what makes a product or
    // article image usable with a screen reader.
    await wordpressRequest<WpMediaResponse>(`/wp/v2/media/${media.id}`, {
      method: 'POST',
      credentials,
      body: {
        ...(input.altText ? { alt_text: input.altText.slice(0, 500) } : {}),
        ...(input.title ? { title: input.title.slice(0, 200) } : {}),
      },
      timeoutMs: 20_000,
    }).catch((error) => {
      // The file itself is stored; only the label failed. Reported, not thrown —
      // an uploaded image with a missing alt text is still a usable image.
      console.warn('WordPress media alt text could not be saved:', error);
    });
  }

  return {
    id: Number(media.id),
    sourceUrl: String(media.source_url),
    mimeType: String(media.mime_type ?? input.contentType),
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
  };
}

/**
 * The media library item for an existing URL, if WordPress already holds it.
 *
 * Used before uploading so re-saving a post or a product does not copy the same
 * image into the library a second time. WordPress's search matches an attachment's
 * slug and title, and the exact URL is then compared, because a search hit is not
 * proof of identity.
 */
export async function findMediaByUrl(url: string): Promise<UploadedMedia | null> {
  const target = (url || '').trim();
  if (!target) return null;

  const filename = target.split('/').pop()?.split('?')[0] || '';
  const search = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  if (!search) return null;

  try {
    const items = await wordpressRequest<WpMediaResponse[]>('/wp/v2/media', {
      params: { search, per_page: 20, media_type: 'image' },
      credentials: requireWordPressCredentials(),
      timeoutMs: 20_000,
    });
    const match = (Array.isArray(items) ? items : []).find((item) => String(item.source_url ?? '') === target);
    if (!match?.id || !match.source_url) return null;
    return {
      id: Number(match.id),
      sourceUrl: String(match.source_url),
      mimeType: String(match.mime_type ?? 'image/*'),
      width: match.media_details?.width ?? null,
      height: match.media_details?.height ?? null,
    };
  } catch {
    return null;
  }
}
