/**
 * Update or delete one WooCommerce product category.
 *
 * The rules live in `lib/woo/taxonomyWrite` rather than here, so the screen and
 * any future caller cannot disagree about them: a slug that is already taken is
 * answered 409 (never auto-suffixed), and a delete is refused while products are
 * still filed under the term, because WooCommerce would otherwise move them to
 * Uncategorized and call that a success.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  CategoryWriteError,
  deleteWooCategory,
  updateWooCategory,
} from '@/lib/woo/taxonomyWrite';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof CategoryWriteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'The category could not be updated.';
  return NextResponse.json({ error: message }, { status: 502 });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'A category id is required.' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;

  try {
    const category = await updateWooCategory(id, {
      name: typeof record.name === 'string' ? record.name : undefined,
      slug: typeof record.slug === 'string' ? record.slug : undefined,
      description: typeof record.description === 'string' ? record.description : undefined,
      parent: typeof record.parent === 'number' ? record.parent : undefined,
    });
    return NextResponse.json({ category });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'A category id is required.' }, { status: 400 });

  try {
    const category = await deleteWooCategory(id);
    return NextResponse.json({ category });
  } catch (error) {
    return failure(error);
  }
}
