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
import {
  PRODUCT_WRITE_FIELDS,
  fromWooProduct,
  isUnusablePrice,
  unsupportedProductWriteFields,
} from '@/lib/woo/productPayload';
import { readProductStatusField } from '@/lib/woo/productStatus';

/**
 * Maps the request body onto a patch, dropping keys the caller did not send.
 *
 * The allowlist is the mapper's own (`PRODUCT_WRITE_FIELDS`), so this route and
 * the PUT route accept exactly what can be stored and nothing else.
 */
function readPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of PRODUCT_WRITE_FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  return patch;
}

/**
 * Keys the caller sent that no layer can store. Reported through the same
 * `ignored` channel a store-refused field uses, so a create that dropped a
 * field cannot answer 201 as though it had kept it.
 */
function unappliedFields(body: Record<string, unknown>): Array<{ field: string; reason: string }> {
  return unsupportedProductWriteFields(body);
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
    return NextResponse.json({ products: rows.filter((r) => r.status !== 'trash').map(fromWooProduct) });
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

  // The console's status word becomes WooCommerce's, or the create is refused:
  // WooCommerce rejects a status it does not know with `rest_invalid_param`.
  const status = readProductStatusField(body);
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 });
  const writeBody = status.value ? { ...body, status: status.value } : body;

  try {
    const result = await createWooProduct(readPatch(writeBody) as never);
    return NextResponse.json(
      { ...result, ignored: [...result.ignored, ...unappliedFields(writeBody)] },
      { status: 201 },
    );
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
