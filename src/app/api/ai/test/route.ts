import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { testAiSeoConnection, isCallableProvider } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { provider?: string; model?: string } = {};
  try {
    body = await request.json();
  } catch {
    // A body is optional — no body means "test the routing default".
  }

  const requested = typeof body.provider === 'string' ? body.provider.trim() : '';

  // The AI Hub draws one card per provider, so "Test" must test the card it sits
  // on. It used to ignore the request and test the routing default, so pressing
  // Test on Gemini reported OpenRouter's result. A provider with no server-side
  // handler says so instead of reporting someone else's connection.
  if (requested && !isCallableProvider(requested)) {
    return NextResponse.json({
      ok: false,
      message: `${requested} is not wired server-side in this app — it has no handler and no key store.`,
    });
  }

  try {
    const provider = isCallableProvider(requested) ? requested : undefined;
    const status = await testAiSeoConnection({ provider, model: body.model?.trim() || undefined });
    const ok = status.state === 'CONNECTED';
    return NextResponse.json({
      ok,
      message: ok ? `Connected successfully to ${status.provider} (${status.model})` : status.detail,
      status,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : 'Connection test failed',
    });
  }
}
