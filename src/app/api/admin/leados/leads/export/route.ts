import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listSavedLeads } from '@/lib/leados/db';
import { escapeLeadOSCsvCell as csvCell } from '@/lib/leados/csv';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const first = await listSavedLeads({ limit: 200, page: 1 });
    if (first.total > 2000) return NextResponse.json({ error: 'More than 2,000 leads; export a filtered batch rather than a truncated collection.' }, { status: 422 });
    const leads = [...first.leads];
    for (let page = 2; leads.length < first.total; page++) {
      const batch = await listSavedLeads({ limit: 200, page });
      if (!batch.leads.length) throw new Error('Lead collection changed during export; retry.');
      leads.push(...batch.leads);
    }

    const headers = [
      'Business Name',
      'Category',
      'Address',
      'City',
      'Region',
      'Country',
      'Website',
      'Phone',
      'Email',
      'Opportunity Score',
      'Status',
      'Discovered At',
      'Email Evidence', 'Product Interest', 'Fit Score', 'Last Verified At', 'Source URLs', 'Assigned Owner', 'Next Follow-up', 'Notes', 'Tags',
    ];

    const rows = leads.map((l) => [
      csvCell(l.businessName),
      csvCell(l.category),
      csvCell(l.address),
      csvCell(l.city),
      csvCell(l.region),
      csvCell(l.country),
      csvCell(l.website),
      csvCell(l.phone),
      csvCell(l.email),
      csvCell(l.opportunityScore ?? ''),
      csvCell(l.status || 'new'),
      csvCell(l.discoveredAt || l.createdAt),
      csvCell(l.emailSource), csvCell(l.research?.productInterest), csvCell(l.research?.qualification?.score), csvCell(l.research?.lastVerifiedAt),
      csvCell((l.research?.sources || []).map((s) => s.url).join(' | ')), csvCell(l.research?.assignedOwner), csvCell(l.research?.nextFollowUp), csvCell(l.notes), csvCell((l.tags || []).join(' | ')),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="leados-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('LeadOS export CSV error:', error);
    return NextResponse.json({ error: 'Failed to export leads' }, { status: 500 });
  }
}
