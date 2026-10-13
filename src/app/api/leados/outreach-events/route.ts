import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { leadosRequest } from '@/lib/leados/db';

export async function POST(request: Request) {
  const secret = process.env.LEADOS_EVENT_TOKEN || '';
  const received = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (secret.length < 32 || Buffer.byteLength(received) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(received), Buffer.from(secret))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.dispatchId || !body.eventId || !['sending','sent','delivered','bounced','replied','unsubscribed'].includes(body.state)) return NextResponse.json({ error: 'Invalid delivery event.' }, { status: 400 });
    const data = await leadosRequest('/workflow', { method: 'POST', body: { action: 'event', id: body.dispatchId, eventId: String(body.eventId).slice(0, 200), state: body.state } });
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Event not applied; retry with the same event ID.' }, { status: 409 }); }
}
