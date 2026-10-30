import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  getAllEmailAccounts,
  toClientMailboxView,
  saveEmailAccountCredentials,
  type MailboxEmail,
  SUPPORTED_MAILBOXES,
} from '@/lib/email/accountConfig';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const accounts = await getAllEmailAccounts();
    const clientViews = accounts.map(toClientMailboxView);
    return NextResponse.json({ ok: true, accounts: clientViews });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch email accounts';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

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
    const updated = await saveEmailAccountCredentials({
      mailbox,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort ? Number(body.smtpPort) : undefined,
      smtpUser: body.smtpUser,
      smtpPass: body.smtpPass,
      imapHost: body.imapHost,
      imapPort: body.imapPort ? Number(body.imapPort) : undefined,
      imapUser: body.imapUser,
      imapPass: body.imapPass,
    });

    return NextResponse.json({
      ok: true,
      account: toClientMailboxView(updated),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save email account credentials';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
