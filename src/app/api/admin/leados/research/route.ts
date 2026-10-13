import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { leadosRequest, getSavedLeadById, updateSavedLead } from '@/lib/leados/db';
import { publicCompanyUrl, qualifyLead, PRODUCT_INTERESTS } from '@/lib/leados/intelligence';
import type { NormalizedLead, ProductInterest } from '@/lib/leados/types';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const saved = body.id ? await getSavedLeadById(String(body.id)) : null;
    const lead = saved || body.lead;
    if (!lead?.businessName || !lead.website || !publicCompanyUrl(lead.website)) return NextResponse.json({ error: 'A public company website is required.' }, { status: 400 });
    if (body.policyReviewed !== true) return NextResponse.json({ error: 'Review the company site terms before requesting bounded public research.' }, { status: 400 });
    const findings = await leadosRequest<Partial<NormalizedLead>>('/research/website', { method: 'POST', body: { website: publicCompanyUrl(lead.website) }, timeoutMs: 50000 });
    const merged = { ...lead, ...findings, research: { ...lead.research, ...findings.research, sources: [...(lead.research?.sources || []), ...(findings.research?.sources || [])] } } as NormalizedLead;
    const interest: ProductInterest = PRODUCT_INTERESTS.includes(body.productInterest) ? body.productInterest : lead.research?.productInterest || 'horse_salt';
    merged.research = { ...merged.research, productInterest: interest, qualification: qualifyLead(merged, interest) };
    // Never overwrite a manually edited email with discovery. Record observed evidence separately.
    if (saved) await updateSavedLead(saved.id, { research: merged.research,
      ...(!saved.address && findings.address ? {address:findings.address} : {}), ...(!saved.city && findings.city ? {city:findings.city} : {}),
      ...(!saved.region && findings.region ? {region:findings.region} : {}), ...(!saved.country && findings.country ? {country:findings.country} : {}),
      ...(!saved.phone && findings.phone ? {phone:findings.phone} : {}),
      ...(saved.emailSource !== 'manually_entered' && findings.email ? { email: findings.email, emailSource: 'company_website' } : {}) });
    return NextResponse.json({ ok: true, lead: merged }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Website research could not complete. Check source policies or retry later.' }, { status: 502 });
  }
}
