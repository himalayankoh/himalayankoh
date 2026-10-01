/**
 * Browser client for the admin image library.
 *
 * Every call carries the signed-in admin's bearer token — the API routes hold the
 * WordPress application password, and the browser never sees it.
 *
 * Uploads reuse two things that already exist rather than inventing a second path:
 * `prepareImageForUpload` (the canvas pass that guarantees an image fits the 5 MB
 * limit and a WordPress-allowed MIME type) and `/api/upload-image` (which writes
 * to the WordPress Media Library). A second upload implementation is how the
 * "1/5 → 0/5" phantom-success bug happened the first time.
 */

import { getAccessToken } from '../../services/wordpressAdminAuth';
import { prepareImageForUpload } from '../image-upload';
import type { LibraryPage } from './libraryTypes';

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { ...(extra || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** The server's own message when it sent one, so the owner reads the real reason. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    /* not JSON — fall through to the caller's wording plus the status */
  }
  return `${fallback} (HTTP ${response.status})`;
}

export async function listLibraryImages(options: {
  page?: number;
  perPage?: number;
  search?: string;
  /**
   * Which half of the library to read. `unused` is the library proper — files no
   * product displays; `in_use` is the product photos. Filtering server-side keeps
   * the pagination and the totals honest: a client-side filter over 60 loaded
   * files would have reported "42 library images" when the store holds 275.
   */
  scope?: 'all' | 'unused' | 'in_use';
} = {}): Promise<LibraryPage> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', String(options.page));
  if (options.perPage) params.set('perPage', String(options.perPage));
  if (options.search) params.set('search', options.search);
  if (options.scope && options.scope !== 'all') params.set('scope', options.scope);

  const response = await fetch(`/api/admin/media/library?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!response.ok) throw new Error(await readError(response, 'The image library could not be read.'));

  const data = (await response.json()) as LibraryPage & { ok?: boolean };
  return {
    images: Array.isArray(data.images) ? data.images : [],
    page: data.page ?? 1,
    perPage: data.perPage ?? 0,
    total: data.total ?? null,
    hasMore: data.hasMore === true,
  };
}

/** Uploads one file to the WordPress Media Library and returns its new identity. */
export async function uploadLibraryImage(
  file: File,
  altText?: string
): Promise<{ publicUrl: string; mediaId: number }> {
  const prepared = await prepareImageForUpload(file);

  const response = await fetch('/api/upload-image', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      base64: prepared.dataUrl,
      contentType: prepared.contentType,
      filename: prepared.filename,
      // The media *title* is the file's own name, so the library reads like the
      // folder the owner uploaded from even though the stored file is uniquely named.
      title: file.name || prepared.filename,
      ...(altText ? { altText } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response, `“${file.name || 'image'}” could not be uploaded.`));
  }
  const data = (await response.json()) as { publicUrl?: string; mediaId?: number; path?: string };
  const mediaId = Number(data.mediaId ?? data.path);
  if (!data.publicUrl || !Number.isFinite(mediaId)) {
    throw new Error('The upload reported success but returned no image. It was not stored.');
  }
  return { publicUrl: data.publicUrl, mediaId };
}

/** Imports an image from a public URL, server-side, into the library. */
export async function importLibraryImageFromUrl(
  url: string
): Promise<{ publicUrl: string; mediaId: number }> {
  const response = await fetch('/api/admin/media/import-url', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(await readError(response, 'That image could not be imported.'));

  const data = (await response.json()) as { publicUrl?: string; mediaId?: number };
  if (!data.publicUrl) throw new Error('The import reported success but returned no image.');
  return { publicUrl: data.publicUrl, mediaId: Number(data.mediaId) };
}

export async function updateLibraryImage(input: {
  id: number;
  altText?: string;
  title?: string;
}): Promise<void> {
  const response = await fetch('/api/admin/media/library', {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response, 'The image could not be saved.'));
}

/**
 * The filename the server chose, read back out of `Content-Disposition`. The
 * header carries both `filename` and `filename*`; the plain one is what the
 * anchor needs, and the server has already stripped anything unsafe from it.
 */
function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="([^"]*)"/i);
  const name = (match?.[1] || '').trim();
  return name || fallback;
}

/**
 * Saves one image to the machine.
 *
 * The file comes through `/api/admin/media/library/download` rather than straight
 * from the media host: WordPress serves images `Content-Disposition: inline` with
 * no CORS header, so an `<a download>` would open a tab and a client-side `fetch`
 * could not read the body. Fetched as a blob here, so the admin bearer token
 * travels in a header — never in a query string the browser would log.
 *
 * Returns the filename it saved under, so the caller can say which file landed.
 */
export async function downloadLibraryImage(image: { id: number; url: string }): Promise<string> {
  const response = await fetch(
    `/api/admin/media/library/download?id=${encodeURIComponent(String(image.id))}`,
    { headers: await authHeaders() }
  );
  if (!response.ok) throw new Error(await readError(response, 'The image could not be downloaded.'));

  const blob = await response.blob();
  const fallback = image.url.split('/').pop()?.split('?')[0] || `image-${image.id}`;
  const filename = filenameFromDisposition(response.headers.get('content-disposition'), fallback);

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the save in some browsers; give it a moment.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);

  return filename;
}

/**
 * Deletes an image. Refused by the server while a product still renders it, with
 * that product named — the message is the server's, not a generic failure.
 */
export async function deleteLibraryImage(id: number): Promise<void> {
  const response = await fetch(`/api/admin/media/library?id=${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!response.ok) throw new Error(await readError(response, 'The image could not be deleted.'));
}
