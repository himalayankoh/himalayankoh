import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { testAiSeoConnection } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const origin = request.headers.get('origin') || '';
  if (origin && !isAllowedRequestOrigin(origin, request.url)) {
    return NextResponse.json({ error: 'This origin may not call the SEO assistant.' }, { status: 403 });
  }

  const limit = checkRateLimit(`seo-status:${auth.userId}`, { limit: 15, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many status checks. Wait a moment and try again.' },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider') || undefined;
  const model = searchParams.get('model') || undefined;

  try {
    const status = await testAiSeoConnection({
      provider: provider as any,
      model,
    });
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Status check failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
