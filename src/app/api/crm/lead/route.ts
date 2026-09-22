/**
 * CRM lead capture — public endpoint (campaign popups, gift-drop signups).
 *
 * Writes to the WordPress `crm_leads` table through `lib/leados/crm` instead of
 * the Supabase admin client. Validation is unchanged, so callers see the same
 * status codes and the same `{ ok, lead }` shape.
 */

import { NextResponse } from 'next/server';
import { createCrmLead } from '@/lib/leados/crm';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      name?: string;
      phone?: string;
      company?: string;
      source?: string;
      page_url?: string;
      coupon_code?: string;
      metadata?: Record<string, unknown>;
      opted_in?: boolean;
    } | null;

    if (!body || !body.email || typeof body.email !== 'string') {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address format.' }, { status: 400 });
    }

    const lead = await createCrmLead({
      email,
      name: body.name ? String(body.name).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      company: body.company ? String(body.company).trim() : null,
      source: body.source ? String(body.source).trim() : 'other',
      page_url: body.page_url ? String(body.page_url).trim() : null,
      coupon_code: body.coupon_code ? String(body.coupon_code).trim() : null,
      metadata: body.metadata || {},
      opted_in: body.opted_in !== false,
    });

    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to save lead' },
      { status: 500 }
    );
  }
}
