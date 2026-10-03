import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { resolveAiSeoConfig } from '@/lib/ai/gemini';
import { AiAskError } from '@/lib/ai/askModel';
import { generateProductImage, PRODUCT_IMAGE_MODEL, validateStudioImageSource } from '@/lib/ai/productImageStudio';
import { backendConfig } from '@/lib/backend/config';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const config = await resolveAiSeoConfig();
  const configured = !!config.apiKey && config.provider === 'openrouter';
  let available = false;
  let detail = 'Configure OpenRouter image-model access and credits in Admin Settings.';
  if (configured) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(8_000) });
      const data = await response.json() as { data?: { total_credits?: number; total_usage?: number } };
      available = response.ok && Number(data.data?.total_credits ?? 0) - Number(data.data?.total_usage ?? 0) > 0;
      detail = available ? 'Image Studio is ready. Generation uses your OpenRouter credits.' : response.ok ? 'AI Image Studio needs credits on the existing OpenRouter account.' : 'Image provider access could not be verified. Check the existing OpenRouter account.';
    } catch { detail = 'Image provider availability could not be checked. Try opening Images again.'; }
  }
  return NextResponse.json({ configured, available, detail, provider: config.provider, model: PRODUCT_IMAGE_MODEL }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const origin = request.headers.get('origin');
  if (origin && !isAllowedRequestOrigin(origin, request.url)) return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 });
  if (!checkRateLimit(`product-image:${auth.userId}`, { limit: 4, windowMs: 60_000 }).allowed) return NextResponse.json({ error: 'Please wait before generating more images.' }, { status: 429 });
  try {
    const raw = await request.text();
    if (raw.length > 21 * 1024 * 1024) return NextResponse.json({ error: 'Image references are too large.' }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 3000) return NextResponse.json({ error: 'Enter an edit instruction of up to 3,000 characters.' }, { status: 400 });
    if (!Array.isArray(body.sources) || !body.sources.length || body.sources.length > 3) return NextResponse.json({ error: 'Choose one source image and up to two references.' }, { status: 400 });
    const sources = body.sources.map(source => validateStudioImageSource(source, publicEnv.siteUrl, backendConfig.wordpressBaseUrl));
    const result = await generateProductImage(prompt, sources);
    // Preview only: uploading and applying are explicit, separate owner actions.
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AiAskError ? error.message : 'Invalid image edit request.' }, { status: error instanceof AiAskError ? error.status : 400 });
  }
}
