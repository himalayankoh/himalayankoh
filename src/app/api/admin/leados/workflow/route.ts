import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { leadosRequest, getSavedLeadById } from '@/lib/leados/db';
import { createIntroduction, PRODUCT_INTERESTS, type ProductInterest } from '@/lib/leados/intelligence';
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

    let items: Array<Record<string, unknown>> = [];
    try {
      const wpResult = await leadosRequest<{ items?: Array<Record<string, unknown>> }>('/workflow', {
        params: { kind, lead_id: leadId || undefined },
      });
      if (Array.isArray(wpResult.items)) {
        items = wpResult.items;
      }
    } catch {
      // Fall through to fallback settings store if WP plugin endpoint is pending update
    }

    // Also read and merge from persistent settings store
    try {
      const fallbackSettings = await siteSettingsApi.read('leados_drafts');
      if (fallbackSettings && typeof fallbackSettings === 'object') {
        for (const [k, v] of Object.entries(fallbackSettings)) {
          if (!v) continue;
          try {
            const parsed = JSON.parse(v);
            if (parsed && typeof parsed === 'object') {
              if (leadId && parsed.lead_id !== leadId && parsed.leadId !== leadId) continue;
              if (!items.some((it) => it.id === parsed.id || it.id === k)) {
                items.push({
                  id: parsed.id || k,
                  lead_id: parsed.lead_id || parsed.leadId,
                  kind: parsed.kind || 'draft',
                  state: parsed.state || 'draft',
                  revision: parsed.revision || 1,
                  payload: parsed.payload || parsed,
                  created_at: parsed.created_at || new Date().toISOString(),
                  updated_at: parsed.updated_at || new Date().toISOString(),
                });
              }
            }
          } catch {}
        }
      }
    } catch {}

    return NextResponse.json(
      {
        ok: true,
        data: { items },
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

    if (!['save_draft', 'update_status', 'approve', 'reject', 'reserve', 'dispatch_result', 'pause', 'save_search', 'record_reply', 'suppress', 'export_crm'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported workflow action.' }, { status: 400 });
    }

    if (action === 'save_draft') {
      const leadId = String(body.leadId || body.lead_id || '');
      const lead = await getSavedLeadById(leadId);
      if (!lead) return NextResponse.json({ error: 'Save the lead before drafting.' }, { status: 404 });

      const interest: ProductInterest = PRODUCT_INTERESTS.includes(body.productInterest) ? body.productInterest : 'horse_salt';
      const intro = body.assist === true ? await assistIntroduction(lead, interest) : createIntroduction(lead, interest);

      const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim().slice(0, 250) : intro.subject;
      const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 12000) : intro.message;

      const checked = validateOutboundCopy(`${subject}\n${message}`);
      if (!checked.ok) {
        return NextResponse.json({ error: 'Remove unsupported product claims before saving.', claims: checked.claims }, { status: 400 });
      }

      const draftId = String(body.id || body.draftId || `draft-${leadId}-${Date.now()}`);
      const draftState = String(body.state || 'draft');
      const draftPayload = {
        leadId,
        recipient: String(body.recipient || lead.email || '').trim(),
        subject,
        message,
        productInterest: interest,
        productUrl: typeof body.productUrl === 'string' ? body.productUrl : undefined,
        couponCode: typeof body.couponCode === 'string' ? body.couponCode : undefined,
        outreachMode: typeof body.outreachMode === 'string' ? body.outreachMode : 'wholesale',
        notes: typeof body.notes === 'string' ? body.notes : '',
        senderEmail: 'sales@himalayankoh.com',
        updatedAt: new Date().toISOString(),
      };

      const workflowRecord = {
        id: draftId,
        lead_id: leadId,
        kind: 'draft',
        state: draftState,
        revision: Number.isInteger(body.revision) ? body.revision + 1 : 1,
        payload: draftPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Try WordPress leados_workflows table first
      try {
        const wpRes = await leadosRequest('/workflow', {
          method: 'POST',
          body: {
            action: 'save_draft',
            id: draftId,
            state: draftState,
            revision: workflowRecord.revision,
            ...draftPayload,
            leadId,
          },
        });
        // Also mirror into site settings for instant durability
        await siteSettingsApi.write('leados_drafts', {
          [draftId]: JSON.stringify(workflowRecord),
        }).catch(() => {});

        return NextResponse.json({ ok: true, data: wpRes, item: workflowRecord }, { headers: { 'Cache-Control': 'private, no-store' } });
      } catch {
        // Fallback to site settings store if WP table endpoint is unreachable
        await siteSettingsApi.write('leados_drafts', {
          [draftId]: JSON.stringify(workflowRecord),
        });

        return NextResponse.json(
          {
            ok: true,
            data: { ok: true, id: draftId, revision: workflowRecord.revision, state: draftState, item: workflowRecord },
            item: workflowRecord,
          },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      }
    }

    if (action === 'update_status' || action === 'approve' || action === 'reject') {
      const targetId = String(body.id || body.draftId || '');
      const newState = action === 'approve' ? 'owner_approved' : action === 'reject' ? 'draft' : String(body.state || 'draft');

      try {
        const wpRes = await leadosRequest('/workflow', { method: 'POST', body: { ...body, state: newState } });
        return NextResponse.json({ ok: true, data: wpRes });
      } catch {
        // Fallback to updating draft in settings store
        const existingSettings = await siteSettingsApi.read('leados_drafts');
        if (existingSettings && targetId && existingSettings[targetId]) {
          try {
            const parsed = JSON.parse(existingSettings[targetId]!);
            parsed.state = newState;
            parsed.updated_at = new Date().toISOString();
            await siteSettingsApi.write('leados_drafts', { [targetId]: JSON.stringify(parsed) });
            return NextResponse.json({ ok: true, data: { ok: true, id: targetId, state: newState } });
          } catch {}
        }
      }
    }

    const data = await leadosRequest('/workflow', { method: 'POST', body });
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Workflow action error: ${msg}` }, { status: 409 });
  }
}
