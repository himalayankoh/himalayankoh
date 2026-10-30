import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { chatComplete, isCallableProvider, resolveAiSeoConfig, resolveConfigFor, GeminiError, type AiSeoConfig } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

/**
 * Text generation proxy.
 *
 * The console sends the provider it selected (and an optional fallback chain),
 * and this route used to ignore both and always call the routing default — so
 * "Make Default" and every per-provider choice were cosmetic, and a key attached
 * for DeepSeek, OpenAI, Anthropic or Codex could never actually be used. The
 * requested provider is honoured now, with the fallback only consulted when the
 * primary genuinely fails.
 */
export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { prompt?: string; system?: string; provider?: string; model?: string; fallback?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = (body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const system = (body.system || 'You are an honest, accurate assistant for Himalayan Koh. Return clean factual responses.').trim();

  const primary = isCallableProvider(body.provider)
    ? await resolveConfigFor(body.provider, body.model?.trim() || undefined)
    : await resolveAiSeoConfig();

  if (!primary.apiKey) {
    return NextResponse.json(
      { error: 'No AI provider is configured. Please configure an API key in Admin Settings.' },
      { status: 503 },
    );
  }

  const attempt = async (config: AiSeoConfig) =>
    chatComplete(config, { user: prompt, system, maxTokens: 1500, temperature: 0.3 });

  try {
    try {
      const text = await attempt(primary);
      return NextResponse.json({ text, provider: primary.provider, model: primary.model });
    } catch (primaryError) {
      // Only a provider the caller named as a fallback is tried, and only once —
      // no silent loop, and the error surfaces when the fallback fails too.
      if (!isCallableProvider(body.fallback) || body.fallback === primary.provider) throw primaryError;
      const fallbackConfig = await resolveConfigFor(body.fallback);
      if (!fallbackConfig.apiKey) throw primaryError;
      const text = await attempt(fallbackConfig);
      return NextResponse.json({ text, provider: fallbackConfig.provider, model: fallbackConfig.model });
    }
  } catch (err) {
    const msg = err instanceof GeminiError ? err.message : err instanceof Error ? err.message : 'AI generation request failed';
    const status = err instanceof GeminiError ? err.status : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
