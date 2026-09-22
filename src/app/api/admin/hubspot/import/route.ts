/**
 * Imports HubSpot contacts into the CRM.
 *
 * The CRM inbox reads WordPress (`crm/v1/leads`, via `lib/leados/crm`), and this route
 * used to write to a Supabase `crm_leads` table — so a contact imported here landed
 * somewhere the console could not see. It writes through the same plugin the inbox
 * reads now, which is the whole fix: one CRM, one place leads live.
 *
 * Dedupe is by email against the leads the plugin already holds. `skipped` reports the
 * contacts that were already there plus the ones HubSpot did not return an email for,
 * because "imported 3 of 100" is only useful next to the reason for the other 97.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listContacts, HubspotNotConfiguredError } from '@/lib/hubspot/client';
import { createCrmLead, listCrmLeads } from '@/lib/leados/crm';

export const dynamic = 'force-dynamic';

const IMPORT_LIMIT = 100;

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const contacts = await listContacts(IMPORT_LIMIT);
    if (contacts.length === 0) {
      return NextResponse.json({ ok: true, imported: 0, skipped: 0 });
    }

    // A HubSpot contact without an email address cannot be deduped or contacted, and
    // the plugin rejects it anyway — counted as skipped rather than attempted.
    const withEmail = contacts.filter((contact) => Boolean(contact.email?.trim()));

    const existing = await listCrmLeads();
    const known = new Set(existing.map((lead) => lead.email.trim().toLowerCase()));

    let imported = 0;

    for (const contact of withEmail) {
      const email = contact.email.trim().toLowerCase();
      if (known.has(email)) continue;

      try {
        await createCrmLead({
          email,
          name: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || email,
          phone: contact.phone,
          company: contact.company,
          source: 'other',
          page_url: null,
        });
        known.add(email);
        imported += 1;
      } catch (error) {
        // One rejected contact must not abandon the rest of the import; the count of
        // what did not land is what the caller reports.
        console.warn(`HubSpot contact ${email} could not be imported:`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      // Already-present contacts, contacts with no email, and any the CRM refused.
      skipped: contacts.length - imported,
    });
  } catch (error) {
    if (error instanceof HubspotNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('HubSpot import failed:', error);
    const message = error instanceof Error ? error.message : 'HubSpot import failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
