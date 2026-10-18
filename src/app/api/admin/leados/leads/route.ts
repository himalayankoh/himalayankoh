import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listSavedLeads, updateSavedLead, deleteSavedLead } from '@/lib/leados/db';
import { crawlBusinessWebsite } from '@/lib/leados/crawler';
import { syncLeadOSProspect } from '@/lib/omnisend/client';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '500', 10);

  try {
    const { leads, total } = await listSavedLeads({ search, status, page, limit });
    return NextResponse.json(
      { ok: true, leads, total, page, limit },
      { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=120' } }
    );
  } catch (error) {
    console.error('LeadOS get leads error:', error);
    return NextResponse.json({ error: 'Failed to retrieve saved leads' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'enrich_contacts';

    if (action === 'sync_omnisend') {
      const { leads } = await listSavedLeads({ page: 1, limit: 500 });
      const withEmail = leads.filter((l) => l.email && l.email.includes('@'));
      let syncedCount = 0;
      let failedCount = 0;

      for (const lead of withEmail.slice(0, 50)) {
        const res = await syncLeadOSProspect({
          email: lead.email!,
          businessName: lead.businessName,
          phone: lead.phone || undefined,
          city: lead.city || undefined,
          state: lead.region || undefined,
        });
        if (res.ok) syncedCount++;
        else failedCount++;
      }

      return NextResponse.json({
        ok: true,
        syncedCount,
        failedCount,
        totalWithEmail: withEmail.length,
      });
    }

    if (action === 'enrich_contacts') {
      const { leads } = await listSavedLeads({ page: 1, limit: 500, skipCache: true });
      const requestedIds: string[] | null = Array.isArray(body.leadIds) ? body.leadIds : null;
      const candidates = leads
        .filter((l) => {
          if (requestedIds && !requestedIds.includes(l.id)) return false;
          if (!l.website) return false;
          const hasFb = Boolean(l.facebook || l.research?.facebook);
          const hasIg = Boolean(l.instagram || l.research?.instagram);
          return !l.email || !hasFb || !hasIg;
        })
        .slice(0, 12);

      let enrichedCount = 0;
      let newEmails = 0;
      let newSocials = 0;

      for (const lead of candidates) {
        if (!lead.website) continue;
        const crawled = await crawlBusinessWebsite(lead.website, {
          knownBusinessName: lead.businessName,
          knownCategory: lead.category || undefined,
        });
        if (!crawled.success) continue;

        const existingFb = lead.facebook || lead.research?.facebook || null;
        const existingIg = lead.instagram || lead.research?.instagram || null;
        const emailToSet = !lead.email && crawled.email ? crawled.email : undefined;
        const phoneToSet = !lead.phone && crawled.phone ? crawled.phone : undefined;
        const fbToSet = !existingFb && crawled.facebookUrl ? crawled.facebookUrl : undefined;
        const igToSet = !existingIg && crawled.instagramUrl ? crawled.instagramUrl : undefined;

        if (emailToSet || phoneToSet || fbToSet || igToSet) {
          await updateSavedLead(lead.id, {
            ...(emailToSet ? { email: emailToSet, emailSource: 'company_website' } : {}),
            ...(phoneToSet ? { phone: phoneToSet } : {}),
            ...(fbToSet ? { facebook: fbToSet } : {}),
            ...(igToSet ? { instagram: igToSet } : {}),
            research: {
              ...(lead.research || {}),
              ...(fbToSet ? { facebook: fbToSet } : {}),
              ...(igToSet ? { instagram: igToSet } : {}),
              lastVerifiedAt: crawled.crawledAt,
            },
          });
          enrichedCount++;
          if (emailToSet) newEmails++;
          if (fbToSet || igToSet) newSocials++;
        }
      }

      return NextResponse.json({
        ok: true,
        scannedCount: candidates.length,
        enrichedCount,
        newEmails,
        newSocials,
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('LeadOS post leads action error:', error);
    return NextResponse.json({ error: 'Failed to process lead action' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { id, ...patch } = body;
    if (!id) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    const updated = await updateSavedLead(id, patch);
    if (!updated) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lead: updated });
  } catch (error) {
    console.error('LeadOS patch lead error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    await deleteSavedLead(id);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('LeadOS delete lead error:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}
