import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { saveLeadToLibrary } from '@/lib/leados/db';
import { classifyLivestockEligibility } from '@/lib/leados/intelligence';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { lead, projectId } = body;

    if (!lead || !lead.businessName) {
      return NextResponse.json({ error: 'Valid lead data with businessName is required' }, { status: 400 });
    }

    // POLICY ENFORCEMENT: Reject non-livestock businesses per owner livestock-only directive
    const eligibility = classifyLivestockEligibility({
      businessName: lead.businessName,
      category: lead.category,
      notes: lead.notes,
      website: lead.website,
      address: lead.address,
      city: lead.city,
      region: lead.region,
    });

    if (eligibility.classification === 'IRRELEVANT') {
      return NextResponse.json(
        {
          error: `Lead rejected: ${lead.businessName} is classified as unrelated per Himalayan Koh Livestock-Only policy (${eligibility.reason}).`,
          skipped: true,
        },
        { status: 422 }
      );
    }

    const saved = await saveLeadToLibrary(
      {
        ...lead,
        opportunityScore: lead.opportunityScore,
        opportunitySignals: lead.opportunitySignals,
        projectFitScore: lead.projectFit?.score,
        projectFitReasons: lead.projectFit?.reasons,
        outreachAngles: lead.projectFit?.outreachAngles,
      },
      projectId
    );

    return NextResponse.json({ ok: true, lead: saved });
  } catch (error) {
    console.error('LeadOS save lead error:', error);
    return NextResponse.json({ error: 'Failed to save lead to library' }, { status: 500 });
  }
}
