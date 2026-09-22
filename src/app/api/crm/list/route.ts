/**
 * CRM lead list + CSV export — admin only.
 *
 * Reads the WordPress `crm_leads` table through `lib/leados/crm`. The filters,
 * the CSV columns and the response shape are unchanged; only the source of the
 * rows moved. Admin identity comes from the WordPress-signed session token that
 * `verifyAdminRequest` validates.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listCrmLeads } from '@/lib/leados/crm';

export const dynamic = 'force-dynamic';

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const source = (searchParams.get('source') || '').trim();
    const couponUsedParam = searchParams.get('couponUsed');
    const format = (searchParams.get('format') || 'json').toLowerCase();

    const couponUsed =
      couponUsedParam === '1' || couponUsedParam === '0' ? couponUsedParam : undefined;

    const items = await listCrmLeads({ search, source, couponUsed });

    if (format === 'csv') {
      const headers = ['id', 'email', 'name', 'phone', 'source', 'page_url', 'coupon_code', 'coupon_used', 'created_at'];
      const rows = items.map((l) => [
        escapeCsv(l.id),
        escapeCsv(l.email),
        escapeCsv(l.name),
        escapeCsv(l.phone),
        escapeCsv(l.source),
        escapeCsv(l.page_url),
        escapeCsv(l.coupon_code),
        escapeCsv(l.coupon_used ? 'true' : 'false'),
        escapeCsv(l.created_at),
      ]);
      const csvText = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return new Response(csvText, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="crm-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ ok: true, leads: items });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to list CRM leads' },
      { status: 500 }
    );
  }
}
