/**
 * LeadOS outreach — send a vetted email to a saved lead.
 *
 * The lead it reads and the audit row it writes used to come straight from the
 * Supabase client. Both now go through `lib/leados/db`, so the outreach trail
 * lands in the same WordPress tables as the rest of LeadOS instead of a database
 * the rest of the console has already left.
 *
 * The claim check stays first: nothing is sent, and nothing is recorded, until
 * the copy has passed it.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSavedLeadById, recordAuditEntry, leadosRequest, WordPressApiError } from '@/lib/leados/db';
import { validateOutboundCopy } from '@/lib/leados/claims';
import { sendLeadOSMail } from '@/lib/leados/emailProvider';
import { outreachReadiness, dispatchApprovedDraft } from '@/lib/leados/n8n';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    if (body.simulation !== true) {
      const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
      const revision = typeof body.revision === 'number' && Number.isInteger(body.revision) ? body.revision : null;
      if (!draftId || revision === null || revision < 1) {
        return NextResponse.json({ error: 'A persisted approved draft and its current revision are required.' }, { status: 400 });
      }
      const readiness = outreachReadiness();
      if (!readiness.ready) {
        return NextResponse.json(
          { error: 'Outbound disabled until sender and n8n compliance controls are verified.', blockers: readiness.blockers },
          { status: 503 }
        );
      }
      const reserved = await leadosRequest<{ item: { id: string; revision?: number; payload: { lead_id?: string; recipient: string; subject: string; message: string } } }>(
        '/workflow',
        { method: 'POST', body: { action: 'reserve', id: draftId, revision } }
      );
      const draft = { id: reserved.item.id, ...reserved.item.payload };
      const check = validateOutboundCopy(`${draft.subject}\n${draft.message}`);
      const result = check.ok
        ? await dispatchApprovedDraft(draft)
        : { state: 'unknown' as const, error: 'Approved copy contains unsupported claims; owner review required.' };
      await leadosRequest('/workflow', {
        method: 'POST',
        body: { action: 'dispatch_result', id: draft.id, state: result.state, error: 'error' in result ? result.error : '' },
      });
      await recordAuditEntry({
        action: `outreach_${result.state}`,
        entityType: 'lead',
        entityId: draft.lead_id || (typeof body.leadId === 'string' ? body.leadId : draft.id),
        details: {
          draftId: draft.id,
          revision: reserved.item.revision ?? revision,
          recipient: draft.recipient,
          subject: draft.subject,
          state: result.state,
          createdAt: new Date().toISOString(),
        },
      }).catch(() => {});
      return NextResponse.json({ ok: result.state === 'queued', draftId: draft.id, ...result }, { status: result.state === 'queued' ? 202 : 502 });
    }

    const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
    const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';
    const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const templateId = typeof body.templateId === 'string' ? body.templateId : null;
    const simulationRequested = body.simulation === true;

    if (!leadId) return NextResponse.json({ error: 'A saved LeadOS lead is required.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return NextResponse.json({ error: 'A valid recipient email address is required.' }, { status: 400 });
    }
    if (!subject) return NextResponse.json({ error: 'Email subject line is required.' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Email message body is required.' }, { status: 400 });

    const claimCheck = validateOutboundCopy(`${subject}\n${message}`);
    if (!claimCheck.ok) {
      return NextResponse.json({ error: 'Outbound copy contains claims that are not approved.', claims: claimCheck.claims }, { status: 400 });
    }

    const lead = await getSavedLeadById(leadId);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found in the active workspace.' }, { status: 404 });
    }

    // IMPORTANT: Simulated outreach / test messages must NEVER create or sync an Omnisend contact.
    const result = await sendLeadOSMail({ to: recipientEmail, subject, text: message }, { simulationRequested });
    const auditDetails = {
      recipient: recipientEmail,
      recipientName: recipientName || null,
      subject,
      templateId,
      provider: result.provider,
      state: result.state,
      providerMessageId: result.providerMessageId,
      omnisendSynced: false,
      sender: 'sales@himalayankoh.com',
      createdAt: new Date().toISOString(),
    };

    await recordAuditEntry({
      action: `outreach_${result.state}`,
      entityType: 'lead',
      entityId: leadId,
      details: auditDetails,
    });

    if (result.state === 'simulated') {
      return NextResponse.json({
        ok: true,
        state: result.state,
        simulated: true,
        provider: result.provider,
        omnisendSynced: false,
        message: '[SIMULATION] No external email was sent, no Omnisend contact was created, and the lead was not marked Contacted.',
      });
    }
    if (result.state === 'provider_unavailable') {
      return NextResponse.json({ ok: false, state: result.state, error: result.error }, { status: 503 });
    }
    return NextResponse.json({ ok: false, state: result.state, error: result.error || 'Email provider failed.' }, { status: 502 });
  } catch (error) {
    if (error instanceof WordPressApiError && error.status >= 400 && error.status < 500) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('LeadOS outreach send error:', error);
    return NextResponse.json({ error: 'Failed to process outreach email request.' }, { status: 500 });
  }
}

