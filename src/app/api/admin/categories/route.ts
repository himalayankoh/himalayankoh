/**
 * The console's category read and create.
 *
 * Categories are WooCommerce terms, so this route is a thin, authenticated door
 * onto `lib/woo/taxonomyWrite` — the same credentialed path the product editor
 * uses. It exists for the same reason `/api/admin/catalog` does: the console is
 * client-side, and the WooCommerce consumer key/secret must never reach a
 * browser bundle.
 *
 * A create that collides with an existing slug answers 409 rather than letting
 * WooCommerce invent `-2`, and a failure to reach the store answers 502. Nothing
 * is mirrored to a second database, and nothing is reported as saved until the
 * store has answered.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  CategoryWriteError,
  createWooCategory,
  listWooCategories,
} from '@/lib/woo/taxonomyWrite';

export const dynamic = 'force-dynamic';

async function guard(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return null;
}

function failure(error: unknown) {
  if (error instanceof CategoryWriteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'The categories could not be read.';
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  try {
    return NextResponse.json({ categories: await listWooCategories() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;

  try {
    const category = await createWooCategory({
      name: typeof record.name === 'string' ? record.name : '',
      slug: typeof record.slug === 'string' ? record.slug : undefined,
      description: typeof record.description === 'string' ? record.description : undefined,
      parent: typeof record.parent === 'number' ? record.parent : undefined,
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
