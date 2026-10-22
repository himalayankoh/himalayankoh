/**
 * The resale-certificate review queue.
 *
 * Returns every application with its certificate metadata and the checks that ran —
 * and never the certificate file itself. The bytes travel only when a reviewer opens
 * one, through `/certificates/[id]/file`, which is why this list is cheap enough to
 * refresh after every decision.
 *
 * The audit rows are included so the Customers screen can show a timeline without a
 * second request per applicant.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { adminCertificateRow } from '@/lib/wholesale/certificateReview';
import { listWholesaleRecords } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  try {
    const [applications, audit] = await Promise.all([
      listWholesaleRecords('applications', { limit: 500 }, { timeoutMs: 45_000 }),
      listWholesaleRecords('audit', { entity: 'applications', limit: 500 }, { timeoutMs: 45_000 }),
    ]);

    return NextResponse.json({
      applications: applications.map(adminCertificateRow),
      audit,
      count: applications.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The certificate review queue could not be read: ${error.message}`
            : 'The certificate review queue could not be read.',
      },
      { status: 502 }
    );
  }
}
