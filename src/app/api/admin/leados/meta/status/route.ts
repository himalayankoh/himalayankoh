import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getMetaConnectionState, disconnectMeta } from '@/lib/leados/meta-client';

export const runtime = 'edge';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const state = getMetaConnectionState();
  return NextResponse.json({
    ok: true,
    state,
  });
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const state = disconnectMeta();
  return NextResponse.json({ ok: true, state, message: 'Meta accounts disconnected successfully.' });
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json() as { action?: string };
    if (body.action === 'disconnect') {
      const state = disconnectMeta();
      return NextResponse.json({ ok: true, state, message: 'Meta accounts disconnected successfully.' });
    }
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}
