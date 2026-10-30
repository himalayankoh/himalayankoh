import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { testSmtpAuthentication } from '@/lib/email/imapClient';
import {
  getEmailAccount,
  saveEmailAccountCredentials,
  type MailboxEmail,
  SUPPORTED_MAILBOXES,
} from '@/lib/email/accountConfig';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mailbox = String(body.mailbox || '').trim().toLowerCase() as MailboxEmail;
  if (!SUPPORTED_MAILBOXES.includes(mailbox)) {
    return NextResponse.json(
      { error: `Invalid mailbox "${mailbox}". Must be one of: ${SUPPORTED_MAILBOXES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const current = await getEmailAccount(mailbox);
    const host = body.host || current.smtpHost || 'premium164.web-hosting.com';
    const port = Number(body.port || current.smtpPort || 465);
    const user = body.user || current.smtpUser || mailbox;

    // Use passed password if not empty/masked; otherwise use stored password
    let pass = body.pass;
    if (!pass || pass.startsWith('••')) {
      pass = current.smtpPass;
    }

    if (!pass) {
      return NextResponse.json(
        {
          ok: false,
          status: 'auth_failed',
          error: `No SMTP password configured for ${mailbox}. Enter mailbox password first.`,
        },
        { status: 400 }
      );
    }

    const result = await testSmtpAuthentication({ host, port, user, pass, timeoutMs: 12000 });

    // Persist verified status
    const newStatus = result.ok ? 'authenticated' : 'auth_failed';
    await saveEmailAccountCredentials({
      mailbox,
      smtpStatus: newStatus,
      lastError: result.error || null,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMTP verification test failed';
    return NextResponse.json({ ok: false, status: 'connection_failed', error: message }, { status: 500 });
  }
}
