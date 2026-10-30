/**
 * What each integration is doing, and whether Gemini answers.
 *
 * Read-only except for the explicit `action: 'test-gemini'`, which asks the model
 * provider one metadata question. No secret value is ever part of the response —
 * see `lib/admin/integrationStatus` for what is reported instead.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { readIntegrationStatuses } from '@/lib/admin/integrationStatus';
import { testGeminiConnection } from '@/lib/ai/gemini';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const probe = params.get('probe') !== '0';

  try {
    const { integrations, checkedAt } = await readIntegrationStatuses({ probe });
    return NextResponse.json({ integrations, checkedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Integration status could not be read.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  if (record.action !== 'test-gemini') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  // A connection test costs an upstream request, so it is rate-limited per admin
  // rather than per screen: a stuck button must not become a hammer.
  const limit = checkRateLimit(`gemini-test:${auth.userId}`, { limit: 12, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many connection tests. Wait a minute and try again.' },
      { status: 429 }
    );
  }

  const status = await testGeminiConnection();
  return NextResponse.json({ gemini: status });
}
