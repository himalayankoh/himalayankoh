/**
 * One application's certificate review: recheck it, or record a review note.
 *
 * Nothing here approves or rejects an applicant. Approval is `/decide`, because it
 * creates the buyer's account and links the WordPress user — a commercial decision
 * with side effects. This route only owns the certificate's own state, so the two
 * facts stay separable: an application can be "additional information required" with a
 * certificate that passed every automated check, or approved with a note explaining
 * what the owner verified by hand.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import {
  adminCertificateRow,
  recheckStoredApplication,
} from '@/lib/wholesale/certificateReview';
import { getWholesaleRecord, upsertWholesaleRecord } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['RECHECK', 'REQUEST_INFO', 'REVERIFY', 'NOTE']);

/** The reviewer's identity, from the verified console session — never the body. */
function actorOf(auth: { admin: { name?: string; username?: string; email?: string } }): string {
  return auth.admin.name || auth.admin.username || auth.admin.email || 'admin';
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const { id } = await context.params;
  const applicationId = Number(id);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: 'A valid application id is required.' }, { status: 400 });
  }

  try {
    const row = await getWholesaleRecord('applications', applicationId);
    return NextResponse.json(adminCertificateRow(row));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The application could not be read.' },
      { status: 502 }
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const { id } = await context.params;
  const applicationId = Number(id);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: 'A valid application id is required.' }, { status: 400 });
  }

  let body: { action?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = String(body.action ?? '').toUpperCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { error: 'Choose a review action: recheck, request information, require renewal, or save a note.' },
      { status: 400 }
    );
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  const actor = actorOf(auth);

  try {
    const row = await getWholesaleRecord('applications', applicationId);

    if (action === 'RECHECK') {
      const { write } = recheckStoredApplication(row, actor);
      await upsertWholesaleRecord('applications', { ...write } as Record<string, unknown>, {
        id: applicationId,
        actor,
      });
      const updated = await getWholesaleRecord('applications', applicationId);
      return NextResponse.json({
        application: adminCertificateRow(updated),
        message: 'The certificate checks were run again and the result was recorded.',
      });
    }

    if (action === 'REQUEST_INFO') {
      await upsertWholesaleRecord(
        'applications',
        {
          certificate_status: 'ADDITIONAL_INFO_REQUIRED',
          certificate_reviewed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          certificate_reviewed_by: actor,
          ...(note ? { certificate_notes: note } : {}),
        },
        { id: applicationId, actor }
      );
      const updated = await getWholesaleRecord('applications', applicationId);
      return NextResponse.json({
        application: adminCertificateRow(updated),
        message: 'The certificate is marked as needing more information.',
      });
    }

    if (action === 'REVERIFY') {
      await upsertWholesaleRecord(
        'applications',
        {
          certificate_status: 'REVERIFICATION_REQUIRED',
          certificate_reviewed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          certificate_reviewed_by: actor,
          ...(note ? { certificate_notes: note } : {}),
        },
        { id: applicationId, actor }
      );
      const updated = await getWholesaleRecord('applications', applicationId);
      return NextResponse.json({
        application: adminCertificateRow(updated),
        message: 'A renewed certificate has been requested.',
      });
    }

    if (!note) {
      return NextResponse.json({ error: 'Type the note before saving it.' }, { status: 400 });
    }
    await upsertWholesaleRecord(
      'applications',
      {
        certificate_notes: note,
        certificate_reviewed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        certificate_reviewed_by: actor,
      },
      { id: applicationId, actor }
    );
    const updated = await getWholesaleRecord('applications', applicationId);
    return NextResponse.json({ application: adminCertificateRow(updated), message: 'The note was saved.' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The review could not be recorded.' },
      { status: 502 }
    );
  }
}
