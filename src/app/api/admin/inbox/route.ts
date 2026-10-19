import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  listInboxState,
  saveInboxDraft,
  sendInboxMessage,
  updateInboxMessage,
  recordInboundEmail,
  getMailboxAndInfrastructureStatus,
  type InboxFolder,
  type InboxFilterFolder,
} from '@/lib/email/inboxStore';

export const dynamic = 'force-dynamic';

function verifyWebhookAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const validSecrets = [
    process.env.LEADOS_EVENT_TOKEN,
    process.env.CRON_SECRET,
    process.env.ADMIN_SESSION_SECRET,
    process.env.WORDPRESS_ADMIN_APP_PASSWORD,
  ].filter(Boolean);

  if (token && validSecrets.includes(token)) {
    return true;
  }
  return false;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const folder = (url.searchParams.get('folder') || 'all') as InboxFilterFolder;
    const search = url.searchParams.get('search') || '';
    const leadId = url.searchParams.get('leadId') || url.searchParams.get('lead_id') || '';
    const forceSync = url.searchParams.get('sync') === 'true' || url.searchParams.get('force_sync') === 'true';

    const result = await listInboxState({
      folder,
      search,
      leadId: leadId || undefined,
      skipExternalSync: !forceSync,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve inbox messages';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const action = String(body.action || '').trim().toLowerCase();

  // Allow webhook ingestion via bearer token or admin session
  if (action === 'inbound_webhook') {
    const isWebhookAuthorized = verifyWebhookAuth(request);
    if (!isWebhookAuthorized) {
      const adminAuth = await verifyAdminRequest(request);
      if (!adminAuth.ok) {
        return NextResponse.json({ error: 'Unauthorized webhook call.' }, { status: 401 });
      }
    }

    try {
      const result = await recordInboundEmail({
        messageId: body.messageId || body.message_id,
        inReplyTo: body.inReplyTo || body.in_reply_to,
        references: body.references,
        mailbox: body.mailbox,
        from: body.from,
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        bodyText: body.bodyText || body.text || body.body,
        bodyHtml: body.bodyHtml || body.html,
        attachments: body.attachments,
        authIndicators: body.authIndicators,
        spamScore: body.spamScore,
        createdAt: body.createdAt || body.date,
      });

      return NextResponse.json({
        ok: true,
        duplicate: result.duplicate,
        message: result.message,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to ingest inbound email';
      return NextResponse.json({ ok: false, error: errorMsg }, { status: 400 });
    }
  }

  // All other actions strictly require verified admin authentication
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (action === 'save_draft') {
      const draft = await saveInboxDraft({
        id: body.id || body.draftId,
        threadId: body.threadId,
        inReplyTo: body.inReplyTo,
        references: body.references,
        mailbox: body.mailbox,
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        bodyText: body.bodyText || body.body || body.message,
        attachments: body.attachments,
        leadId: body.leadId,
      });

      return NextResponse.json({
        ok: true,
        message: draft,
      });
    }

    if (action === 'send' || action === 'reply' || action === 'forward') {
      const sentMessage = await sendInboxMessage({
        draftId: body.draftId || body.id,
        threadId: body.threadId,
        inReplyTo: body.inReplyTo,
        references: body.references,
        mailbox: body.mailbox,
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        bodyText: body.bodyText || body.body || body.message,
        attachments: body.attachments,
        replyToMessageId: body.replyToMessageId,
        leadId: body.leadId,
      });

      return NextResponse.json({
        ok: true,
        message: sentMessage,
      });
    }

    if (action === 'update_message') {
      const operation = body.operation;
      if (!operation) {
        return NextResponse.json({ error: 'Missing operation parameter.' }, { status: 400 });
      }

      const result = await updateInboxMessage({
        id: body.id,
        threadId: body.threadId,
        operation,
        targetFolder: body.targetFolder as InboxFolder | undefined,
      });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (action === 'status') {
      const infra = await getMailboxAndInfrastructureStatus();
      return NextResponse.json({
        ok: true,
        ...infra,
      });
    }

    if (action === 'sync_imap') {
      const { syncImapMailboxes } = await import('@/lib/email/inboxStore');
      const syncResult = await syncImapMailboxes(body.mailbox);
      return NextResponse.json({
        ok: syncResult.ok,
        syncedCount: syncResult.syncedCount,
        error: syncResult.error,
      });
    }

    return NextResponse.json(
      { error: `Unsupported inbox action "${action}". Allowed: save_draft, send, reply, forward, update_message, inbound_webhook, status, sync_imap.` },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inbox action execution failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
