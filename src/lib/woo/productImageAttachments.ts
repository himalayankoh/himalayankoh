/**
 * Attaching a gallery image the store already holds, instead of making
 * WooCommerce fetch it again.
 *
 * ## The failure this exists to end
 *
 * The console sends a product's gallery as URLs. WooCommerce reads an
 * `images[]` entry that has no `id` as *"a file I have to download"*: it fetches
 * the URL over HTTP (`wc_rest_upload_image_from_url`) and stores a second copy
 * in the media library. For an image this console uploaded through
 * `/wp/v2/media` — which is already a media item in this very WordPress install —
 * that makes the store open an HTTP request to its own domain, through
 * Cloudflare, back to the origin answering the write. When that self-request does
 * not complete, WooCommerce raises
 * `woocommerce_product_image_upload_error` and refuses the **entire** product
 * update: the owner's edit is lost, including every field that has nothing to do
 * with imagery.
 *
 * It is not a hypothetical. Product 2683's gallery holds
 * `4da5dc89-…-1.png`, `1e224339-…-1.webp`, `a4e0616d-…-1.webp` and
 * `042891a5-…-1.webp` — the `-1` is WordPress renaming a duplicate of a file it
 * already had, i.e. the re-download happening on save. The un-suffixed
 * `4da5dc89-….png` (attachment 2675) is still in the library, and the owner's
 * save was refused over it.
 *
 * ## Two sources of ids, cheapest first
 *
 * 1. **The product's own gallery.** `updateWooProduct` has already read it, so an
 *    image the store is showing right now is attached for free — no lookup, no
 *    request.
 * 2. **The media library**, for a URL that is a file in this WordPress install
 *    but is not on this product yet — the freshly-uploaded case, and the
 *    `-1`-suffixed copy of a file that is, both resolve by their own URL.
 *
 * A genuinely remote URL (a supplier's photography, a CDN) is left exactly as it
 * was: that is a file the store *should* fetch, and sideloading it is the only
 * way it becomes a media item.
 *
 * Everything here is server-only: it reads the media library with an
 * administrator credential.
 */

import { backendConfig } from '@/lib/backend/config';
import { findMediaByUrl } from '@/lib/media/wordpressMedia';

/** One `images[]` entry as the console or the mapper writes it. */
export type ImageWriteEntry =
  | string
  | { id?: number; src?: string; alt?: string; name?: string };

/** The attachment reference a gallery read gives back for one image. */
export interface MediaRef {
  id?: number;
  src?: string;
}

/** A media lookup. `findMediaByUrl` is the real one; tests inject their own. */
export type MediaLookup = (url: string) => Promise<{ id?: number } | null>;

/**
 * The comparison key for two references to the same file.
 *
 * Scheme, host and path only: WordPress may serve the same upload over http and
 * https, with or without a cache-busting query, and `source_url` never carries a
 * fragment. Uploaded filenames are lower-cased by WordPress, so folding case
 * cannot conflate two different files. A string that is not a URL is compared as
 * written — it is not the same file as anything.
 */
export function mediaUrlKey(src: string): string {
  const raw = (src || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const port = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${url.hostname}${port}${url.pathname}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * True for a URL that names a file in this WordPress install's uploads
 * directory.
 *
 * This is the gate on the *only* HTTP call this module makes: a lookup costs a
 * media search, so it is spent on the case where the answer can plausibly be
 * "yes, the store already has this file". A third-party URL is never queried —
 * it is not in the library, and asking would make every import wait on a search
 * that cannot match.
 *
 * The path test (`/wp-content/uploads/`) is what makes it safe, and the host
 * test accepts a subdomain either way round so a site reached as `www.` or as a
 * preview host still counts as the same install.
 */
export function isWordPressUploadsUrl(
  src: string,
  base: string = backendConfig.wordpressBaseUrl
): boolean {
  const candidate = parseUrl(src);
  const origin = parseUrl(base);
  if (!candidate || !origin) return false;
  if (!candidate.pathname.includes('/wp-content/uploads/')) return false;
  return (
    candidate.hostname === origin.hostname ||
    candidate.hostname.endsWith(`.${origin.hostname}`) ||
    origin.hostname.endsWith(`.${candidate.hostname}`)
  );
}

function parseUrl(value: string): URL | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** URL → attachment id, for every image a product read reported. */
export function attachmentIdsByUrl(images: Array<MediaRef> | undefined): Map<string, number> {
  const index = new Map<string, number>();
  for (const image of images ?? []) {
    const id = Number(image?.id);
    const key = mediaUrlKey(String(image?.src ?? ''));
    if (!key || !Number.isFinite(id) || id <= 0) continue;
    if (!index.has(key)) index.set(key, id);
  }
  return index;
}

function entrySrc(entry: ImageWriteEntry): string {
  if (typeof entry === 'string') return entry;
  return String(entry?.src ?? '');
}

function entryId(entry: ImageWriteEntry): number | null {
  if (typeof entry === 'string' || !entry) return null;
  const id = Number(entry.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function withId(entry: ImageWriteEntry, id: number): ImageWriteEntry {
  // A bare URL becomes an object: the id is the whole point, and WooCommerce
  // reads the pair as "this attachment", not "download this".
  if (typeof entry === 'string') return { id, src: entry.trim() };
  return { ...entry, id };
}

/**
 * How many entries gain an id, and which URLs still need a lookup.
 *
 * Split out from the async resolver so the matching rule — exact URL against the
 * store's own gallery — can be pinned in a test without a store, and so the
 * decision to spend an HTTP call is visible as a list of URLs rather than hidden
 * inside a loop.
 */
export function planImageAttachments(
  images: Array<ImageWriteEntry> | undefined,
  known: Array<MediaRef> | undefined,
  base: string = backendConfig.wordpressBaseUrl
): { images: Array<ImageWriteEntry>; unresolved: string[]; attached: number } {
  const index = attachmentIdsByUrl(known);
  const unresolved: string[] = [];
  const seen = new Set<string>();
  let attached = 0;
  const next = (images ?? []).map((entry) => {
    if (entryId(entry) !== null) return entry;
    const src = entrySrc(entry);
    const key = mediaUrlKey(src);
    const id = key ? index.get(key) : undefined;
    if (id) {
      attached += 1;
      return withId(entry, id);
    }
    // Only a same-origin uploads URL is worth a media search, and only once per
    // URL however many times the gallery names it.
    if (src.trim() && isWordPressUploadsUrl(src, base) && !seen.has(key)) {
      seen.add(key);
      unresolved.push(src.trim());
    }
    return entry;
  });
  return { images: next, unresolved, attached };
}

/**
 * The gallery a write should send: every entry whose file the store already
 * holds carries that attachment's id.
 *
 * Never throws and never blanks an entry. A lookup that fails or finds nothing
 * leaves the URL in place, which is the behaviour this console had before — the
 * store fetches the file, and if it cannot, the error is reported rather than
 * swallowed.
 */
export async function attachExistingMedia(
  images: Array<ImageWriteEntry> | undefined,
  known: Array<MediaRef> | undefined,
  options: { lookup?: MediaLookup; base?: string } = {}
): Promise<Array<ImageWriteEntry> | undefined> {
  if (images === undefined) return undefined;

  const base = options.base ?? backendConfig.wordpressBaseUrl;
  const lookup = options.lookup ?? findMediaByUrl;
  const { images: planned, unresolved } = planImageAttachments(images, known, base);
  if (unresolved.length === 0) return planned;

  const resolved = new Map<string, number>();
  for (const url of unresolved) {
    const key = mediaUrlKey(url);
    if (resolved.has(key)) continue;
    try {
      const media = await lookup(url);
      const id = Number(media?.id);
      if (Number.isFinite(id) && id > 0) resolved.set(key, id);
    } catch {
      // A library lookup that fails is not a failed save: the URL stays on the
      // entry and the store's own download path answers for it, as before.
    }
  }
  if (resolved.size === 0) return planned;

  return planned.map((entry) => {
    if (entryId(entry) !== null) return entry;
    const id = resolved.get(mediaUrlKey(entrySrc(entry)));
    return id ? withId(entry, id) : entry;
  });
}
