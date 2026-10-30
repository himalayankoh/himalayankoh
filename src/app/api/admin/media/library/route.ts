/**
 * The store's image library, as the admin sees it.
 *
 * WordPress owns these files — every image the owner uploads or imports through
 * the admin becomes a Media Library attachment, and so does every product photo
 * WooCommerce holds. That means one endpoint answers the owner's whole question:
 * *what images does the store have, and which of them are in a product?*
 *
 *   GET    /api/admin/media/library?page=&perPage=&search=&scope=
 *   PATCH  /api/admin/media/library   { id, altText?, title? }
 *   DELETE /api/admin/media/library?id=<attachment id>
 *
 * ## Why the reads are authenticated
 *
 * `/wp/v2/media` answers an unauthenticated read with published attachments only.
 * An admin library has to show an upload the moment it lands, before anyone has
 * touched it, so these calls carry the administrator application password — the
 * same one `lib/media/wordpressMedia.ts` writes with. Nothing here is public: the
 * route is behind the admin session.
 *
 * ## Why the usage index reads the *admin* catalogue
 *
 * The question "is this image on a product?" was answered from
 * `getCatalogProducts()`, which is scoped to what the **storefront** may serve.
 * That scope silently dropped every draft, every unlisted and every off-niche
 * product — and a product missing from the index is a product whose photos look
 * unused, so the library offered to delete them and the DELETE below would have
 * done it. Measured on staging: 5 of the 6 products were indexed and 27 product
 * photos were reported as belonging to nobody. This now reads
 * `listWooProducts({ status: 'any' })`: every status, everything the console can
 * edit, because "does a product render this file" is a question about the store's
 * data, not about who may see it.
 *
 * ## Why DELETE refuses an image a product is using
 *
 * Deleting the attachment a product renders leaves that product with a broken
 * photo, and the damage shows up on the storefront, not here. So an in-use image
 * is refused with the products named, and the owner can decide to detach it first.
 * If the usage check itself cannot run, nothing is deleted either — see below.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WordPressApiError, wordpressRequest, wordpressRequestWithMeta } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { listWooProducts } from '@/lib/woo/productWrite';
import { buildImageUsageIndex, usageForImage, type ImageUsage } from '@/lib/media/libraryUsage';
import type { LibraryImage } from '@/lib/media/libraryTypes';

export const dynamic = 'force-dynamic';

/** The store holds ~316 images today; one page covers the grid and "Load more" the rest. */
const DEFAULT_PER_PAGE = 60;
const MAX_PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 25_000;
/** How many product pages the usage index will walk before giving up: 1,000 products. */
const MAX_PRODUCT_PAGES = 10;
const PRODUCTS_PER_PAGE = 100;
/** How many media pages a scoped read will scan: 1,200 images. */
const MAX_SCAN_PAGES = 12;

/** Which slice of the library the caller wants, decided here rather than in the browser. */
const SCOPES = ['all', 'unused', 'in_use'] as const;
type Scope = (typeof SCOPES)[number];

interface WpMedia {
  id?: number;
  date?: string;
  source_url?: string;
  alt_text?: string;
  mime_type?: string;
  title?: { rendered?: string };
  media_details?: {
    width?: number;
    height?: number;
    filesize?: number;
    sizes?: Record<string, { source_url?: string; width?: number; height?: number }>;
  };
}

/** The smallest stored copy WordPress offers, so the grid does not pull full-size files. */
function thumbnailFor(media: WpMedia): string {
  const sizes = media.media_details?.sizes ?? {};
  return (
    sizes.medium?.source_url ||
    sizes.thumbnail?.source_url ||
    sizes.large?.source_url ||
    media.source_url ||
    ''
  );
}

/**
 * Every product's images, indexed for matching — every status, trash excluded.
 *
 * Throws rather than returning an empty index: an empty index means "no product
 * uses any image", which is the one wrong answer that leads to deleting a photo a
 * live product renders. Callers that only show badges may swallow this; the
 * delete path must not.
 */
async function loadUsageIndex(): Promise<Map<string, ImageUsage[]>> {
  const products: { id: string; name: string; images: string[] }[] = [];

  for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
    const rows = await listWooProducts({ status: 'any', perPage: PRODUCTS_PER_PAGE, page });
    for (const row of rows) {
      if (row.status === 'trash' || !row.id) continue;
      products.push({
        id: String(row.id),
        name: row.name || `Product ${row.id}`,
        images: (row.images ?? [])
          .map((image) => (typeof image?.src === 'string' ? image.src.trim() : ''))
          .filter(Boolean),
      });
    }
    if (rows.length < PRODUCTS_PER_PAGE) break;
  }

  return buildImageUsageIndex(products);
}

function clampInt(raw: string | null, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
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

/** One WordPress media page, at the asked-for width. */
function fetchMediaPage(page: number, perPage: number, search: string) {
  return wordpressRequestWithMeta<WpMedia[]>('/wp/v2/media', {
    params: {
      media_type: 'image',
      per_page: perPage,
      page,
      search: search || undefined,
      orderby: 'date',
      order: 'desc',
      _fields: 'id,date,source_url,alt_text,mime_type,title,media_details',
    },
    credentials: requireWordPressCredentials(),
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
}

function toLibraryImage(item: WpMedia, usageIndex: Map<string, ImageUsage[]>): LibraryImage {
  return {
    id: Number(item.id),
    url: String(item.source_url),
    thumbnail: thumbnailFor(item),
    title: (item.title?.rendered || '').trim(),
    alt: (item.alt_text || '').trim(),
    width: item.media_details?.width ?? null,
    height: item.media_details?.height ?? null,
    bytes: item.media_details?.filesize ?? null,
    mimeType: item.mime_type || '',
    date: item.date ?? null,
    usedBy: usageForImage(String(item.source_url), usageIndex),
  };
}

const hasStoredFile = (item: WpMedia): item is WpMedia & { id: number; source_url: string } =>
  !!item?.id && !!item.source_url;

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const page = clampInt(url.searchParams.get('page'), 1, 1000);
  const perPage = clampInt(url.searchParams.get('perPage'), DEFAULT_PER_PAGE, MAX_PER_PAGE);
  const search = (url.searchParams.get('search') || '').trim();
  const requestedScope = url.searchParams.get('scope') || 'all';
  const scope: Scope = (SCOPES as readonly string[]).includes(requestedScope)
    ? (requestedScope as Scope)
    : 'all';

  try {
    if (scope === 'all') {
      // Attachment pickers do not render usage badges. Do not load the entire
      // catalogue on every picker page; the Media Hub keeps its usage audit.
      const includeUsage = url.searchParams.get('usage') !== '0';
      const [media, usageIndex] = await Promise.all([
        fetchMediaPage(page, perPage, search),
        includeUsage ? loadUsageIndex().catch(() => new Map<string, ImageUsage[]>()) : Promise.resolve(new Map<string, ImageUsage[]>()),
      ]);
      const rows = Array.isArray(media.data) ? media.data : [];
      const images = rows.filter(hasStoredFile).map((item) => toLibraryImage(item, usageIndex));

      // X-WP-TotalPages is authoritative when WordPress sends it; a full page is the
      // honest fallback when the header is missing.
      const hasMore = media.totalPages ? page < media.totalPages : images.length === perPage;

      return NextResponse.json({
        ok: true,
        images,
        page,
        perPage,
        scope,
        total: media.total,
        totalPages: media.totalPages,
        hasMore,
        usageIncluded: includeUsage,
      });
    }
    const usageIndex = await loadUsageIndex().catch(() => new Map<string, ImageUsage[]>());

    /*
     * A scoped read filters by usage, and WordPress cannot filter by that — so the
     * whole library has to be seen before the first page of the filtered result can
     * be honest. Filtering in the browser instead was the other option, but the grid
     * loads 60 newest files at a time and most of those are product photos, so
     * "not in a product" would have shown a near-empty page until the owner clicked
     * "Load more" several times.
     */
    const first = await fetchMediaPage(1, MAX_PER_PAGE, search);
    const pageCount = Math.min(Math.max(first.totalPages ?? 1, 1), MAX_SCAN_PAGES);
    const rest = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) =>
        fetchMediaPage(index + 2, MAX_PER_PAGE, search).catch(() => null)
      )
    );

    const rows = [
      ...(Array.isArray(first.data) ? first.data : []),
      ...rest.flatMap((answer) => (Array.isArray(answer?.data) ? answer.data : [])),
    ];

    const matched = rows
      .filter(hasStoredFile)
      .map((item) => toLibraryImage(item, usageIndex))
      .filter((image) => (scope === 'unused' ? image.usedBy.length === 0 : image.usedBy.length > 0));

    const total = matched.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;

    return NextResponse.json({
      ok: true,
      images: matched.slice(start, start + perPage),
      page,
      perPage,
      scope,
      total,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (error) {
    return failure(error, 'The image library could not be read.');
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { id?: number | string; altText?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'A media id is required.' }, { status: 400 });
  }
  if (body.altText === undefined && body.title === undefined) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  try {
    await wordpressRequest<WpMedia>(`/wp/v2/media/${id}`, {
      method: 'POST',
      credentials: requireWordPressCredentials(),
      body: {
        ...(body.altText !== undefined ? { alt_text: String(body.altText).slice(0, 500) } : {}),
        ...(body.title !== undefined ? { title: String(body.title).slice(0, 200) } : {}),
      },
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return failure(error, 'The image could not be updated.');
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'A media id is required.' }, { status: 400 });
  }

  try {
    const credentials = requireWordPressCredentials();

    // The in-use check needs the catalogue, and a catalogue read that failed must
    // not be read as "nothing uses this". Failing closed is the only safe answer
    // here: refusing a delete the owner can retry costs a minute, and the other
    // way round costs a live product its photo.
    let usageIndex: Map<string, ImageUsage[]>;
    try {
      usageIndex = await loadUsageIndex();
    } catch {
      return NextResponse.json(
        {
          error:
            'The product list could not be read, so this image was not deleted — nothing was checked, and it may be a product photo. Try again in a moment.',
        },
        { status: 503 }
      );
    }

    // Read the file's URL first: the catalogue joins on the file name, so the
    // in-use check cannot run without it.
    const media = await wordpressRequest<WpMedia>(`/wp/v2/media/${id}`, {
      params: { _fields: 'id,source_url,title' },
      credentials,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const used = usageForImage(String(media.source_url || ''), usageIndex);
    if (used.length > 0) {
      const names = used.map((u) => u.name).join(', ');
      return NextResponse.json(
        {
          error: `This image is used by ${used.length} product${used.length === 1 ? '' : 's'} (${names}). Remove it from ${used.length === 1 ? 'that product' : 'those products'} first — deleting it now would break their photos.`,
          usedBy: used,
        },
        { status: 409 }
      );
    }

    await wordpressRequest<WpMedia>(`/wp/v2/media/${id}`, {
      method: 'DELETE',
      params: { force: true },
      credentials,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return failure(error, 'The image could not be deleted.');
  }
}
