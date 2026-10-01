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
} = {}): Promise<LibraryPage> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', String(options.page));
  if (options.perPage) params.set('perPage', String(options.perPage));
  if (options.search) params.set('search', options.search);

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
