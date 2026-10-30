/**
 * POST /api/hermes/ingest
 *
 * Dedicated ingestion endpoint for Hermes / Salman OS / n8n research evidence.
 * Purely for research evidence — NEVER modifies WooCommerce products, pricing,
 * inventory, blog posts, settings, or production.
 */

import { NextResponse } from 'next/server';
import { verifyHermesAuth } from '@/lib/hermes/auth';
import { validateEvidencePayload } from '@/lib/hermes/evidenceContract';
import { insertEvidence } from '@/lib/hermes/evidenceStore';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const MAX_PAYLOAD_BYTES = 100 * 1024; // 100 KB limit

export async function POST(request: Request) {
  // 1. Rate limiting (per IP/caller)
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'global';

  const rateCheck = checkRateLimit(`hermes:ingest:${clientIp}`, {
    limit: 120,
    windowMs: 60_000,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before submitting more evidence.' },
      { status: 429 }
    );
  }

  // 2. Authentication check
  const auth = await verifyHermesAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error || 'Authentication required' },
      { status: auth.status || 401 }
    );
  }

  // 3. Payload size check
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: 'Payload exceeds maximum allowed size of 100KB' },
      { status: 413 }
    );
  }

  // 4. Parse JSON
  let rawBody: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Payload exceeds maximum allowed size of 100KB' },
        { status: 413 }
      );
    }
    rawBody = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // 5. Schema validation
  const validation = validateEvidencePayload(rawBody);
  if (!validation.ok || !validation.data) {
    return NextResponse.json(
      {
        error: 'Validation failed against Normalized Evidence contract',
        details: validation.errors,
      },
      { status: 400 }
    );
  }

  // 6. Store with deduplication
  try {
    const storeResult = await insertEvidence(validation.data);

    if (storeResult.status === 'ALREADY_EXISTS') {
      return NextResponse.json(
        {
          status: 'ALREADY_EXISTS',
          dedupe_key: storeResult.dedupe_key,
          id: storeResult.id,
          observed_at: storeResult.observed_at,
          message: 'Research evidence already received with this dedupe_key (idempotent)',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        status: 'CREATED',
        dedupe_key: storeResult.dedupe_key,
        id: storeResult.id,
        observed_at: storeResult.observed_at,
        message: 'Research evidence accepted for review',
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Storage operation failed';
    return NextResponse.json(
      { error: 'Internal error processing research evidence', detail: message },
      { status: 500 }
    );
  }
}
