import { NextResponse } from 'next/server';
import { getMetaAppCredentials, verifyMetaWebhookSignature } from '@/lib/leados/meta-client';

export const runtime = 'edge';

/**
 * Handles Meta Webhook Verification (hub.challenge)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const { verifyToken } = getMetaAppCredentials();

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[meta-webhook] Hub challenge verified successfully.');
    return new Response(challenge || '', { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

/**
 * Handles incoming Meta Webhook notifications (Messenger / Instagram messages)
 */
export async function POST(request: Request) {
  const signature = request.headers.get('x-hub-signature-256');
  const rawBody = await request.text();

  const { configured } = getMetaAppCredentials();
  if (configured && !(await verifyMetaWebhookSignature(rawBody, signature))) {
    console.warn('[meta-webhook] Invalid signature rejected.');
    return NextResponse.json({ ok: false, error: 'Invalid webhook signature' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody);
    console.log('[meta-webhook] Event received:', payload.object);

    // Event intake logic (idempotent receipt)
    // Return 200 immediately per Meta requirement
    return new Response('EVENT_RECEIVED', { status: 200 });
  } catch (err) {
    return new Response('Bad Request', { status: 400 });
  }
}
