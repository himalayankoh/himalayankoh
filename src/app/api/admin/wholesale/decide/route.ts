/**
 * Approving or rejecting a wholesale application.
 *
 * Its own route rather than a `[resource]` write because a decision is not a field
 * edit: approving an applicant creates their account, links it to the WordPress user
 * whose password they will sign in with, and writes the audit entry. The plugin does
 * all three in one call so an approved applicant cannot end up without an account —
 * and this route is the only thing that can trigger it, behind a console session.
 *
 * A rejection or a "need more information" moves the status and records who decided.
 * Nothing here notifies the applicant: the reply is a human email, which is the
 * correct channel for a commercial decision.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { decideWholesaleApplication } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

const DECISIONS = new Set(['APPROVED', 'REJECTED', 'MORE_INFO_REQUIRED', 'SUSPENDED', 'PENDING']);

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  let body: { applicationId?: number; decision?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const applicationId = Number(body.applicationId ?? 0);
  const decision = String(body.decision ?? '').toUpperCase();

  if (!applicationId) {
    return NextResponse.json({ error: 'An application id is required.' }, { status: 400 });
  }
  if (!DECISIONS.has(decision)) {
    return NextResponse.json({ error: `"${body.decision}" is not an application decision.` }, { status: 400 });
  }

  try {
    const result = await decideWholesaleApplication({
      applicationId,
      decision,
      note: body.note ? String(body.note).slice(0, 500) : '',
      actor: auth.admin.name || auth.admin.username || auth.admin.email,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The decision could not be recorded.' },
      { status: 502 }
    );
  }
}
