/**
 * One admin product: read (with its variations), update, archive, restore,
 * duplicate.
 *
 * The variation update rides on the product PUT rather than getting its own
 * endpoint because it is one editing act. A caller that changes a parent price
 * and three variation prices expects all of them applied or none, and a client
 * issuing N requests cannot offer that.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { hasWooCommerceCredentials } from '@/lib/backend/credentials';
import {
  duplicateWooProduct,
  getWooProduct,
  listWooVariations,
  permanentlyDeleteWooProduct,
  restoreWooProduct,
  trashWooProduct,
  updateWooProduct,
  updateWooVariation,
  WooWriteError,
} from '@/lib/woo/productWrite';
import { fromWooProduct, isUnusablePrice, variationPriceRange, type AdminVariationPatch } from '@/lib/woo/productPayload';
import { readProductStatusField } from '@/lib/woo/productStatus';

const PATCH_FIELDS = [
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
] as const;

const VARIATION_FIELDS = [
  'regularPrice',
  'salePrice',
  'sku',
  'manageStock',
  'stockQuantity',
  'stockStatus',
] as const;

function readPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of PATCH_FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  return patch;
}

function readVariationPatches(body: Record<string, unknown>): Array<{ id: number } & AdminVariationPatch> {
  if (!Array.isArray(body.variations)) return [];
  const out: Array<{ id: number } & AdminVariationPatch> = [];
  for (const entry of body.variations) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = Number(record.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const patch: Record<string, unknown> = { id };
    for (const field of VARIATION_FIELDS) {
      if (field in record) patch[field] = record[field];
    }
    out.push(patch as unknown as { id: number } & AdminVariationPatch);
  }
  return out;
}

function productId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function fail(error: unknown, fallback: string) {
  if (error instanceof WooWriteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 502 }
  );
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await context.params;
  const id = productId(rawId);
  if (id === null) return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 });

  if (!hasWooCommerceCredentials()) {
    return NextResponse.json({ error: 'WooCommerce is not connected on the server.' }, { status: 503 });
  }

  try {
    const product = await getWooProduct(id);
    const variations = product.type === 'variable' ? await listWooVariations(id) : [];
    const record = fromWooProduct(product);
    if ((record.price === null || record.price <= 0) && variations.length > 0) {
      const range = variationPriceRange(variations);
      if (range) {
        record.price = range.min;
        record.compareAtPrice = range.max > range.min ? range.max : null;
      }
    }
    return NextResponse.json({
      product: record,
      variations,
    });
  } catch (error) {
    return fail(error, 'The product could not be read.');
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await context.params;
  const id = productId(rawId);
  if (id === null) return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  // A price that cannot be read as a number is refused here rather than
  // dropped by the mapper: a silent no-op on the price would answer 200 while
  // leaving the store unchanged. See `isUnusablePrice`.
  for (const field of ['price', 'compareAtPrice'] as const) {
    if (isUnusablePrice(body[field])) {
      return NextResponse.json({ error: `${field} must be a number.` }, { status: 400 });
    }
  }

  // A listing status is translated from the console's word to WooCommerce's own
  // here, and an unknown word is refused. Without this the browser's `active`
  // reached WooCommerce verbatim, which answers `rest_invalid_param` — after the
  // editor had already shown the save as done.
  const status = readProductStatusField(body);
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 });
  const writeBody = status.value ? { ...body, status: status.value } : body;

  try {
    const patch = readPatch(writeBody);
    const variationPatches = readVariationPatches(writeBody);

    // Variations first: if one of them is rejected, the parent edit has not
    // happened yet, so a failed save cannot leave a half-edited product behind.
    const updatedVariations = [];
    for (const variationPatch of variationPatches) {
      const { id: variationId, ...rest } = variationPatch;
      updatedVariations.push(await updateWooVariation(id, variationId, rest));
    }

    const result = Object.keys(patch).length
      ? await updateWooProduct(id, patch as never)
      : { product: fromWooProduct(await getWooProduct(id)), applied: [], ignored: [] };

    return NextResponse.json({ ...result, variations: updatedVariations });
  } catch (error) {
    return fail(error, 'The product could not be updated.');
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await context.params;
  const id = productId(rawId);
  if (id === null) return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 });

  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'trash';

  try {
    if (action === 'restore') return NextResponse.json(await restoreWooProduct(id));
    if (action === 'duplicate') return NextResponse.json(await duplicateWooProduct(id), { status: 201 });
    if (action === 'delete' || action === 'force' || action === 'hard_delete') {
      await permanentlyDeleteWooProduct(id);
      return NextResponse.json({ success: true, deleted: id });
    }
    return NextResponse.json(await trashWooProduct(id));
  } catch (error) {
    return fail(error, 'The product could not be deleted.');
  }
}
