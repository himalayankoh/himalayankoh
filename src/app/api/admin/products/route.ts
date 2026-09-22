/**
 * Admin product collection: list and create.
 *
 * Server-only by construction: the WooCommerce consumer key/secret never reach
 * the browser, so the console writes through here rather than to the store
 * directly. Every response is a sanitized DTO — never the raw Woo payload,
 * which carries every field the store happens to expose.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { hasWooCommerceCredentials } from '@/lib/backend/credentials';
import { createWooProduct, listWooProducts, WooWriteError } from '@/lib/woo/productWrite';
import { fromWooProduct, isUnusablePrice } from '@/lib/woo/productPayload';

/** Maps the request body onto a patch, dropping keys the caller did not send. */
function readPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const passThrough = [
    'name',
    'slug',
    'status',
    'description',
    'shortDescription',
    'sku',
    'price',
    'compareAtPrice',
    'categoryIds',
    'tags',
    'images',
    'type',
    'manageStock',
    'stockQuantity',
    'stockStatus',
    'backorders',
    'lowStockAmount',
    'weight',
    'dimensions',
    'costPrice',
    'landedCost',
    'packagePreset',
    'seoKeywords',
    'canonicalSlug',
    'featured',
    'seo',
  ];
  for (const key of passThrough) {
    if (key in body) patch[key] = body[key];
  }
  return patch;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!hasWooCommerceCredentials()) {
    return NextResponse.json(
      {
        error:
          'WooCommerce is not connected: WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET are not set on the server.',
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  try {
    const rows = await listWooProducts({
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? 'any',
      page: Number(url.searchParams.get('page') ?? '1') || 1,
      perPage: Number(url.searchParams.get('perPage') ?? '100') || 100,
      categoryId: url.searchParams.get('categoryId')
        ? Number(url.searchParams.get('categoryId'))
        : undefined,
    });
    return NextResponse.json({ products: rows.map(fromWooProduct) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The store could not be read.' },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  for (const field of ['price', 'compareAtPrice'] as const) {
    if (isUnusablePrice(body[field])) {
      return NextResponse.json({ error: `${field} must be a number.` }, { status: 400 });
    }
  }

  try {
    const result = await createWooProduct(readPatch(body) as never);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof WooWriteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The product could not be created.' },
      { status: 502 }
    );
  }
}
