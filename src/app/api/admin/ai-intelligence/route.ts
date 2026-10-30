/**
 * GET & PATCH /api/admin/ai-intelligence
 *
 * Protected admin endpoints for reviewing Hermes / Salman OS / n8n research evidence.
 * Reading & status updates only — never automatically modifies WooCommerce or live content.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listEvidence, updateEvidenceStatus } from '@/lib/hermes/evidenceStore';
import type { EvidenceStatus } from '@/lib/hermes/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || undefined;
  const status = searchParams.get('status') || undefined;
  const source = searchParams.get('source') || undefined;
  const search = searchParams.get('search') || undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  try {
    const result = await listEvidence({
      type,
      status,
      source,
      search,
      limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not retrieve research evidence';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  const status = typeof b.status === 'string' ? b.status.trim() : '';
  const reviewNote = typeof b.review_note === 'string' ? b.review_note.trim() : undefined;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const VALID_STATUSES: EvidenceStatus[] = ['new', 'reviewed', 'accepted', 'dismissed'];
  if (!VALID_STATUSES.includes(status as EvidenceStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const result = await updateEvidenceStatus(id, status as EvidenceStatus, reviewNote);
    if (!result.ok) {
      return NextResponse.json({ error: 'Evidence record not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, record: result.record });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
