import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { leadosRequest, getSavedLeadById } from '@/lib/leados/db';
import { createIntroduction, PRODUCT_INTERESTS } from '@/lib/leados/intelligence';
import { validateOutboundCopy } from '@/lib/leados/claims';
import { outreachReadiness } from '@/lib/leados/n8n';
import { assistIntroduction } from '@/lib/leados/draftAssistant';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const kind = new URL(request.url).searchParams.get('kind') || 'draft';
    if (!['draft', 'saved_search', 'activity'].includes(kind)) return NextResponse.json({ error: 'Invalid workflow type.' }, { status: 400 });
    const data = await leadosRequest('/workflow', { params: { kind } });
    return NextResponse.json({ ok: true, data, readiness: outreachReadiness(), providers: { overpass: true, searxng: Boolean((process.env.LEADOS_SEARXNG_URL && process.env.LEADOS_SEARXNG_TOKEN) || process.env.LEADOS_RESEARCH_WORKER_TOKEN), researchWorker: Boolean(process.env.LEADOS_RESEARCH_WORKER_TOKEN), browser: false, premium: false } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'LeadOS workflow storage unavailable; plugin 2.0 is required.' }, { status: 503 }); }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    if (!['save_draft', 'approve', 'reject', 'pause', 'save_search', 'record_reply', 'suppress', 'export_crm'].includes(body.action)) return NextResponse.json({ error: 'Unsupported workflow action.' }, { status: 400 });
    if (body.action === 'save_draft') {
      const lead = await getSavedLeadById(String(body.leadId || ''));
      if (!lead) return NextResponse.json({ error: 'Save the lead before drafting.' }, { status: 404 });
      const interest = PRODUCT_INTERESTS.includes(body.productInterest) ? body.productInterest : 'horse_salt';
      const intro = body.assist === true ? await assistIntroduction(lead, interest) : createIntroduction(lead, interest);
      body.subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 250) : intro.subject;
      body.message = typeof body.message === 'string' ? body.message.trim().slice(0, 12000) : intro.message;
      const checked = validateOutboundCopy(`${body.subject}\n${body.message}`);
      if (!checked.ok) return NextResponse.json({ error: 'Remove unsupported product claims before saving.', claims: checked.claims }, { status: 400 });
      body.recipient = lead.email || '';
      body.productInterest = interest;
    }
    const data = await leadosRequest('/workflow', { method: 'POST', body });
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Workflow action rejected. Refresh the record and check its approval or suppression state.' }, { status: 409 }); }
}
