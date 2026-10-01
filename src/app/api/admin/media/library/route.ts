/**
 * The store's image library, as the admin sees it.
 *
 * WordPress owns these files — every image the owner uploads or imports through
 * the admin becomes a Media Library attachment, and so does every product photo
 * WooCommerce holds. That means one endpoint answers the owner's whole question:
 * *what images does the store have, and which of them are in a product?*
 *
 *   GET    /api/admin/media/library?page=&perPage=&search=
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
 * ## Why DELETE refuses an image a product is using
 *
 * Deleting the attachment a product renders leaves that product with a broken
 * photo, and the damage shows up on the storefront, not here. So an in-use image
 * is refused with the products named, and the owner can decide to detach it first.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WordPressApiError, wordpressRequest, wordpressRequestWithMeta } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import { buildImageUsageIndex, usageForImage, type ImageUsage } from '@/lib/media/libraryUsage';
import type { LibraryImage } from '@/lib/media/libraryTypes';

export const dynamic = 'force-dynamic';

/** The store holds ~95 images today; one page covers it and "Load more" takes the rest. */
const DEFAULT_PER_PAGE = 60;
const MAX_PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 25_000;

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
 * Every product's images, indexed for matching. A catalogue read that fails costs
 * the library its usage badges, never the images themselves.
 */
async function loadUsageIndex(): Promise<Map<string, ImageUsage[]>> {
  try {
    const { products } = await getCatalogProducts();
    return buildImageUsageIndex(
      products.map((product) => ({
        id: String(product.id),
        name: product.name,
        images: Array.isArray(product.images) ? product.images : [],
      }))
    );
  } catch {
    return new Map();
  }
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

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const page = clampInt(url.searchParams.get('page'), 1, 1000);
  const perPage = clampInt(url.searchParams.get('perPage'), DEFAULT_PER_PAGE, MAX_PER_PAGE);
  const search = (url.searchParams.get('search') || '').trim();

  try {
    const [media, usageIndex] = await Promise.all([
      wordpressRequestWithMeta<WpMedia[]>('/wp/v2/media', {
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
      }),
      loadUsageIndex(),
    ]);

    const rows = Array.isArray(media.data) ? media.data : [];
    const images: LibraryImage[] = rows
      .filter((item): item is WpMedia & { id: number; source_url: string } => !!item?.id && !!item.source_url)
      .map((item) => ({
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
      }));

    // X-WP-TotalPages is authoritative when WordPress sends it; a full page is the
    // honest fallback when the header is missing.
    const hasMore = media.totalPages
      ? page < media.totalPages
      : images.length === perPage;

    return NextResponse.json({
      ok: true,
      images,
      page,
      perPage,
      total: media.total,
      totalPages: media.totalPages,
      hasMore,
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

    // Read the file's URL first: the catalogue joins on the file name, so the
    // in-use check cannot run without it.
    const media = await wordpressRequest<WpMedia>(`/wp/v2/media/${id}`, {
      params: { _fields: 'id,source_url,title' },
      credentials,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const used = usageForImage(String(media.source_url || ''), await loadUsageIndex());
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
