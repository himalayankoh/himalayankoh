import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getUnifiedConversations, sendMetaSocialMessage } from '@/lib/leados/meta-client';

export const runtime = 'edge';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const conversations = await getUnifiedConversations();
    return NextResponse.json({
      ok: true,
      conversations,
      count: conversations.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch conversations';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json() as {
      platform: 'facebook' | 'instagram';
      recipientId: string;
      messageText: string;
    };

    if (!body.recipientId || !body.messageText?.trim()) {
      return NextResponse.json({ ok: false, error: 'Recipient ID and message text are required.' }, { status: 400 });
    }

    const result = await sendMetaSocialMessage({
      platform: body.platform || 'facebook',
      recipientId: body.recipientId,
      messageText: body.messageText.trim(),
    });

    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error || 'Failed to send message.' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request payload';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
