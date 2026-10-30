import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { leadosRequest, getSavedLeadById, updateSavedLead, WordPressApiError } from '@/lib/leados/db';
import { createIntroduction, determineProductRelevance, PRODUCT_INTERESTS, type ProductInterest } from '@/lib/leados/intelligence';
import { validateOutboundCopy } from '@/lib/leados/claims';
import { outreachReadiness } from '@/lib/leados/n8n';
import { assistIntroduction } from '@/lib/leados/draftAssistant';
import { siteSettingsApi } from '@/lib/wordpress/siteContent';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') || 'draft';
    const leadId = url.searchParams.get('lead_id') || url.searchParams.get('leadId') || '';

    if (!['draft', 'saved_search', 'activity'].includes(kind)) {
      return NextResponse.json({ error: 'Invalid workflow type.' }, { status: 400 });
    }

    let items: Array<Record<string, any>> = [];
    try {
      const wpResult = await leadosRequest<{ items?: Array<Record<string, any>> }>('/workflow', {
        params: { kind, lead_id: leadId || undefined },
      });
      if (Array.isArray(wpResult.items)) {
        items = leadId
          ? wpResult.items.filter(
              (it) => String(it.lead_id || it.payload?.lead_id || it.payload?.leadId || '') === leadId
            )
          : wpResult.items;
      }
    } catch {
      // Fall through to fallback settings store if WP plugin endpoint is unavailable
    }

    // Also read and merge metadata from persistent settings store
    try {
      const fallbackSettings = await siteSettingsApi.read('leados_drafts');
      if (fallbackSettings && typeof fallbackSettings === 'object') {
        for (const [k, v] of Object.entries(fallbackSettings)) {
          if (!v) continue;
          try {
            const parsed = JSON.parse(v);
            if (!parsed || typeof parsed !== 'object') continue;
            const parsedLeadId = String(parsed.lead_id || parsed.leadId || parsed.payload?.lead_id || parsed.payload?.leadId || '');
            if (leadId && parsedLeadId !== leadId) continue;
            const targetId = String(parsed.id || k);
            const existingIdx = items.findIndex((it) => String(it.id) === targetId);
            if (existingIdx >= 0) {
              // Merge rich UI metadata (outreachMode, productUrl, couponCode, recipientName) into authoritative WP record
              const wpItem = items[existingIdx];
              items[existingIdx] = {
                ...wpItem,
                payload: {
                  ...(parsed.payload || {}),
                  ...(wpItem.payload || {}),
                  outreachMode: wpItem.payload?.outreachMode || parsed.payload?.outreachMode || 'wholesale',
                  productUrl: wpItem.payload?.productUrl || parsed.payload?.productUrl,
                  couponCode: wpItem.payload?.couponCode || parsed.payload?.couponCode,
                  recipientName: wpItem.payload?.recipientName || parsed.payload?.recipientName,
                },
              };
            } else if (kind === 'draft' && (parsed.kind || 'draft') === 'draft') {
              items.push({
                id: targetId,
                lead_id: parsedLeadId,
                kind: parsed.kind || 'draft',
                state: parsed.state || 'draft',
                revision: typeof parsed.revision === 'number' ? parsed.revision : 1,
                payload: parsed.payload || parsed,
                created_at: parsed.created_at || new Date().toISOString(),
                updated_at: parsed.updated_at || new Date().toISOString(),
              });
            }
          } catch {}
        }
      }
    } catch {}

    let automationConfig: Record<string, any> | null = null;
    let approvedCampaign: Record<string, any> | null = null;
    try {
      const configSettings = await siteSettingsApi.read('leados_config');
      if (configSettings && typeof configSettings === 'object') {
        if (configSettings.leados_auto_research) {
          automationConfig = JSON.parse(configSettings.leados_auto_research);
        }
        if (configSettings.leados_approved_campaign) {
          approvedCampaign = JSON.parse(configSettings.leados_approved_campaign);
        }
      }
    } catch {}

    return NextResponse.json(
      {
        ok: true,
        items,
        data: { items },
        automationConfig,
        approvedCampaign,
        readiness: outreachReadiness(),
        providers: {
          overpass: true,
          searxng: Boolean(
            (process.env.LEADOS_SEARXNG_URL && process.env.LEADOS_SEARXNG_TOKEN) ||
              process.env.LEADOS_RESEARCH_WORKER_TOKEN
          ),
          researchWorker: Boolean(process.env.LEADOS_RESEARCH_WORKER_TOKEN),
          browser: false,
          premium: false,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Workflow storage read error: ${msg}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const action = String(body.action || '');

    if (
      ![
        'save_draft',
        'update_status',
        'approve',
        'reject',
        'reserve',
        'dispatch_result',
        'pause',
        'save_search',
        'record_reply',
        'suppress',
        'export_crm',
        'save_automation_config',
        'save_approved_campaign',
      ].includes(action)
    ) {
      return NextResponse.json({ error: 'Unsupported workflow action.' }, { status: 400 });
    }

    if (action === 'save_automation_config') {
      const configPayload = {
        enabled: body.enabled !== false,
        workflowId: 'rxIGjn6VQmn6MA8h',
        intervalHours: 6,
        priorityStates: Array.isArray(body.priorityStates)
          ? body.priorityStates
          : ['TX', 'MT', 'WY', 'KS', 'NE', 'OK', 'CO', 'IA', 'KY'],
        targetCategories: Array.isArray(body.targetCategories)
          ? body.targetCategories
          : ['Agriculture & Livestock', 'Feed Store', 'Ranch & Horse Facility', 'Equestrian Store', 'Farm Supply', 'Livestock Distributor'],
        updatedAt: new Date().toISOString(),
      };
      await siteSettingsApi.write('leados_config', {
        leados_auto_research: JSON.stringify(configPayload),
      });
      return NextResponse.json({ ok: true, automationConfig: configPayload }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (action === 'save_approved_campaign') {
      const maxRecipients = Math.min(250, Math.max(1, Number(body.maxRecipients) || 250));
      const maxEmailCredits = Math.min(500, Math.max(1, Number(body.maxEmailCredits) || 500));
      const campaignPayload = {
        campaignName: String(body.campaignName || 'Himalayan Koh Opted-In Newsletter & Wholesale Update').trim(),
        approvedTemplate: String(body.approvedTemplate || 'wholesale').trim(),
        audienceType: 'subscribed_opted_in_only',
        sendingChannel: body.sendingChannel === 'transactional_b2b' ? 'transactional_b2b' : 'omnisend_opted_in',
        schedule: String(body.schedule || 'Weekly (Tuesdays 10:00 AM CST)').trim(),
        maxRecipients,
        maxEmailCredits,
        endDate: String(body.endDate || '').trim(),
        suppressionRules:
          String(
            body.suppressionRules ||
              'Exclude unsubscribed, bounced, and do_not_contact records; auto-stop when quota or end date is reached'
          ).trim(),
        authorized: Boolean(body.authorized),
        paused: body.paused !== undefined ? Boolean(body.paused) : !Boolean(body.authorized),
        authorizedAt: body.authorized ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
      await siteSettingsApi.write('leados_config', {
        leados_approved_campaign: JSON.stringify(campaignPayload),
      });
      return NextResponse.json({ ok: true, approvedCampaign: campaignPayload }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (action === 'save_draft') {
      const leadId = String(body.leadId || body.lead_id || '').trim();
      if (!leadId) return NextResponse.json({ error: 'Lead ID is required before drafting.' }, { status: 400 });
      let lead = await getSavedLeadById(leadId);
      if (!lead) return NextResponse.json({ error: 'Save the lead before drafting.' }, { status: 404 });

      const requestedRecipient = String(body.recipient || body.recipientEmail || '').trim().toLowerCase();
      if (requestedRecipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedRecipient)) {
        const currentLeadEmail = (lead.email || '').trim().toLowerCase();
        if (requestedRecipient !== currentLeadEmail) {
          const updated = await updateSavedLead(leadId, {
            email: requestedRecipient,
            emailSource: lead.emailSource === 'company_website' && !currentLeadEmail ? 'company_website' : 'manually_entered',
          });
          if (updated) lead = updated;
        }
      }

      const interest: ProductInterest = PRODUCT_INTERESTS.includes(body.productInterest)
        ? body.productInterest
        : determineProductRelevance(lead).productInterest;
      const intro = body.assist === true ? await assistIntroduction(lead, interest) : createIntroduction(lead, interest);

      const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim().slice(0, 250) : intro.subject;
      const rawMessageInput =
        typeof body.message === 'string' && body.message.trim()
          ? body.message
          : typeof body.body === 'string' && body.body.trim()
          ? body.body
          : '';
      const message = rawMessageInput ? rawMessageInput.trim().slice(0, 12000) : intro.message;

      const checked = validateOutboundCopy(`${subject}\n${message}`);
      if (!checked.ok) {
        return NextResponse.json({ error: 'Remove unsupported product claims before saving.', claims: checked.claims }, { status: 400 });
      }

      const rawIdCandidate = body.id || body.draftId || body.existingId;
      const existingId =
        typeof rawIdCandidate === 'string' && String(rawIdCandidate).trim()
          ? String(rawIdCandidate).trim()
          : undefined;
      const rawRevisionCandidate = body.revision ?? body.existingRevision;
      const existingRevision = Number.isInteger(rawRevisionCandidate) ? Number(rawRevisionCandidate) : undefined;
      const recipientFinal = requestedRecipient || (lead.email || '').trim().toLowerCase();
      const senderEmail =
        body.senderEmail === 'salman@himalayankoh.com' ? 'salman@himalayankoh.com' : 'sales@himalayankoh.com';

      const draftPayload = {
        leadId,
        recipient: recipientFinal,
        recipientName: typeof body.recipientName === 'string' ? body.recipientName.trim() : lead.businessName,
        subject,
        message,
        productInterest: interest,
        productUrl: typeof body.productUrl === 'string' ? body.productUrl : undefined,
        couponCode: typeof body.couponCode === 'string' ? body.couponCode : undefined,
        outreachMode: typeof body.outreachMode === 'string' ? body.outreachMode : 'wholesale',
        notes: typeof body.notes === 'string' ? body.notes : '',
        senderEmail,
        approvedBy: null,
        updatedAt: new Date().toISOString(),
      };

      try {
        const wpRes = await leadosRequest<{ item?: Record<string, any> }>('/workflow', {
          method: 'POST',
          body: {
            action: 'save_draft',
            ...(existingId ? { id: existingId } : {}),
            ...(existingRevision !== undefined ? { revision: existingRevision } : {}),
            ...(recipientFinal ? { recipient: recipientFinal } : {}),
            leadId,
            subject,
            message,
            productInterest: interest,
          },
        });

        const wpItem = wpRes?.item;
        const savedId = String(wpItem?.id || existingId || `draft-${leadId}-${Date.now()}`);
        const savedRevision = typeof wpItem?.revision === 'number' ? wpItem.revision : (existingRevision ? existingRevision + 1 : 1);
        const savedState = String(wpItem?.state || 'draft');

        const workflowRecord = {
          id: savedId,
          lead_id: leadId,
          kind: 'draft',
          state: savedState,
          revision: savedRevision,
          payload: {
            ...draftPayload,
            ...(wpItem?.payload || {}),
            recipient: wpItem?.payload?.recipient || recipientFinal,
            subject,
            message,
            outreachMode: draftPayload.outreachMode,
            productUrl: draftPayload.productUrl,
            couponCode: draftPayload.couponCode,
            recipientName: draftPayload.recipientName,
          },
          created_at: wpItem?.created_at || new Date().toISOString(),
          updated_at: wpItem?.updated_at || new Date().toISOString(),
        };

        await siteSettingsApi.write('leados_drafts', {
          [savedId]: JSON.stringify(workflowRecord),
        }).catch(() => {});

        return NextResponse.json(
          {
            ok: true,
            id: savedId,
            revision: savedRevision,
            state: savedState,
            item: workflowRecord,
            data: { ok: true, id: savedId, revision: savedRevision, state: savedState, item: workflowRecord },
          },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      } catch (err) {
        if (err instanceof WordPressApiError && err.status >= 400 && err.status < 500) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        const fallbackId = existingId || `draft-${leadId}-${Date.now()}`;
        const fallbackRevision = existingRevision ? existingRevision + 1 : 1;
        const workflowRecord = {
          id: fallbackId,
          lead_id: leadId,
          kind: 'draft',
          state: 'draft',
          revision: fallbackRevision,
          payload: draftPayload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await siteSettingsApi.write('leados_drafts', {
          [fallbackId]: JSON.stringify(workflowRecord),
        });

        return NextResponse.json(
          {
            ok: true,
            id: fallbackId,
            revision: fallbackRevision,
            state: 'draft',
            item: workflowRecord,
            data: { ok: true, id: fallbackId, revision: fallbackRevision, state: 'draft', item: workflowRecord },
          },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      }
    }

    if (action === 'update_status' || action === 'approve' || action === 'reject') {
      const targetId = String(body.id || body.draftId || '').trim();
      if (!targetId) {
        return NextResponse.json({ error: 'Draft ID is required.' }, { status: 400 });
      }
      if (action === 'approve' && !Number.isInteger(body.revision)) {
        return NextResponse.json({ error: 'Draft revision is required for approval.' }, { status: 400 });
      }
      const newState = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : String(body.state || 'draft');

      try {
        const wpRes = await leadosRequest<{ item?: Record<string, any> }>('/workflow', {
          method: 'POST',
          body: {
            ...body,
            id: targetId,
            action,
            state: newState,
          },
        });
        const wpItem = wpRes?.item;
        const updatedRev = typeof wpItem?.revision === 'number' ? wpItem.revision : (Number.isInteger(body.revision) ? Number(body.revision) + 1 : 1);
        const updatedState = String(wpItem?.state || newState);

        // Mirror state and revision into settings fallback store if present
        try {
          const existingSettings = await siteSettingsApi.read('leados_drafts');
          if (existingSettings && existingSettings[targetId]) {
            const parsed = JSON.parse(existingSettings[targetId]!);
            parsed.state = updatedState;
            parsed.revision = updatedRev;
            parsed.payload = {
              ...(parsed.payload || {}),
              ...(wpItem?.payload || {}),
            };
            parsed.updated_at = new Date().toISOString();
            await siteSettingsApi.write('leados_drafts', { [targetId]: JSON.stringify(parsed) });
          }
        } catch {}

        return NextResponse.json({
          ok: true,
          id: targetId,
          revision: updatedRev,
          state: updatedState,
          item: wpItem,
          data: wpRes,
        });
      } catch (err) {
        if (err instanceof WordPressApiError && err.status >= 400 && err.status < 500) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        // Fallback to updating draft in settings store only on upstream 5xx/network error
        const existingSettings = await siteSettingsApi.read('leados_drafts');
        if (existingSettings && targetId && existingSettings[targetId]) {
          try {
            const parsed = JSON.parse(existingSettings[targetId]!);
            if (Number.isInteger(body.revision) && parsed.revision !== body.revision) {
              return NextResponse.json({ error: 'Draft revision changed; refresh.' }, { status: 409 });
            }
            parsed.state = newState;
            parsed.revision = (parsed.revision || 1) + 1;
            if (action === 'approve') {
              parsed.payload = { ...(parsed.payload || {}), approvedBy: 1, approvedAt: new Date().toISOString() };
            }
            parsed.updated_at = new Date().toISOString();
            await siteSettingsApi.write('leados_drafts', { [targetId]: JSON.stringify(parsed) });
            return NextResponse.json({
              ok: true,
              id: targetId,
              revision: parsed.revision,
              state: newState,
              item: parsed,
              data: { ok: true, id: targetId, revision: parsed.revision, state: newState, item: parsed },
            });
          } catch {}
        }
        throw err;
      }
    }

    const data = await leadosRequest('/workflow', { method: 'POST', body });
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: unknown) {
    if (err instanceof WordPressApiError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Workflow action error: ${msg}` }, { status: 409 });
  }
}
