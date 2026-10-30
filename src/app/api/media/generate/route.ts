/**
 * AI Media Studio — generate an image from a prompt and store it in the
 * WordPress Media Library.
 *
 * The admin Media Studio has always posted here, but this route did not exist,
 * so "Generate image" could only ever fail once a provider key was attached (the
 * button was disabled before that, which is the state the owner saw). This is the
 * route: one image, at most one provider call, stored through the same media
 * helper the rest of the console uses, and a public URL back.
 *
 * Image generation only for now. Video (Veo) needs a long-running job and
 * polling, so it answers honestly instead of pretending.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { resolveConfigFor } from '@/lib/ai/gemini';
import { MAX_MEDIA_BYTES, uploadMediaToWordPress } from '@/lib/media/wordpressMedia';

export const dynamic = 'force-dynamic';

const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
const OPENAI_API_ROOT = 'https://api.openai.com/v1';
const OPENAI_IMAGE_MODEL = 'gpt-image-1';

/** Guardrails the store always applies to generated marketing imagery. */
function buildPrompt(prompt: string): string {
  return `Create one polished commercial image for Himalayan Koh, an e-commerce store selling Himalayan pink salt and mineral salt products. Follow this instruction: ${prompt}. Do not add text overlays, watermarks, certifications, medical or animal-health claims, or logos the owner did not ask for.`;
}

/**
 * The provider's own error text, so a refusal is actionable rather than guessed
 * at. Only the message is taken — never a header, and never the key.
 */
async function providerDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const raw = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message || parsed.message || text;
    const clean = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    return clean ? ` Provider said: "${clean}"` : '';
  } catch {
    return '';
  }
}

function base64Of(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 100 && /^[A-Za-z0-9+/]+=*$/.test(value)
    ? value
    : null;
}

async function generateWithGemini(prompt: string, apiKey: string): Promise<{ base64: string; contentType: string }> {
  const response = await fetch(`${GEMINI_API_ROOT}/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(prompt) }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!response.ok) {
    const detail = await providerDetail(response);
    if (response.status === 401 || response.status === 403) throw new Error('Gemini rejected the API key. Check the Google AI Studio key in AI Hub.');
    if (response.status === 429) throw new Error(`Gemini refused this image request (quota or rate limit for ${GEMINI_IMAGE_MODEL}).${detail}`);
    if (response.status === 404) throw new Error(`The Gemini model "${GEMINI_IMAGE_MODEL}" is not available on this key.${detail}`);
    throw new Error(`Gemini image generation failed (HTTP ${response.status}).${detail}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  if (payload.promptFeedback?.blockReason) throw new Error(`Gemini refused the prompt (${payload.promptFeedback.blockReason}).`);
  for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
    const data = base64Of(part.inlineData?.data || part.inline_data?.data);
    const mime = part.inlineData?.mimeType || part.inline_data?.mime_type || 'image/png';
    if (data && /^image\/(png|jpeg|webp)$/.test(mime)) return { base64: data, contentType: mime };
  }
  throw new Error('The model returned no usable image. Try a clearer prompt.');
}

async function generateWithOpenAI(prompt: string, apiKey: string): Promise<{ base64: string; contentType: string }> {
  const response = await fetch(`${OPENAI_API_ROOT}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt: buildPrompt(prompt), size: '1024x1024', n: 1 }),
  });
  if (!response.ok) {
    const detail = await providerDetail(response);
    if (response.status === 401 || response.status === 403) throw new Error('OpenAI rejected the API key. Check the OpenAI key in AI Hub.');
    if (response.status === 429) throw new Error(`OpenAI refused this image request (quota or rate limit for ${OPENAI_IMAGE_MODEL}).${detail}`);
    throw new Error(`OpenAI image generation failed (HTTP ${response.status}).${detail}`);
  }
  const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const data = base64Of(payload.data?.[0]?.b64_json);
  if (!data) throw new Error('The model returned no usable image. Try a clearer prompt.');
  return { base64: data, contentType: 'image/png' };
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const origin = request.headers.get('origin');
  if (origin && !isAllowedRequestOrigin(origin, request.url)) return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 });
  if (!checkRateLimit(`media-generate:${auth.userId}`, { limit: 4, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Please wait before generating more media.' }, { status: 429 });
  }

  let body: { type?: string; provider?: string; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const type = body.type === 'video' ? 'video' : 'image';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 3000) {
    return NextResponse.json({ error: 'Enter a prompt of up to 3,000 characters.' }, { status: 400 });
  }
  if (type === 'video') {
    return NextResponse.json(
      { error: 'Video generation is not wired in this build — image generation with OpenAI or Gemini is available. No media was created.' },
      { status: 501 },
    );
  }

  const provider = body.provider === 'openai' ? 'openai' : 'gemini';
  try {
    const config = await resolveConfigFor(provider);
    if (!config.apiKey) {
      return NextResponse.json(
        { error: `No ${provider === 'openai' ? 'OpenAI' : 'Gemini'} key on the server yet — attach one in AI Hub → Attach Key.` },
        { status: 503 },
      );
    }

    const generated = provider === 'openai'
      ? await generateWithOpenAI(prompt, config.apiKey)
      : await generateWithGemini(prompt, config.apiKey);

    const buffer = Buffer.from(generated.base64, 'base64');
    if (buffer.length === 0) return NextResponse.json({ error: 'The model returned an empty image.' }, { status: 502 });
    if (buffer.length > MAX_MEDIA_BYTES) return NextResponse.json({ error: 'The generated image was too large to store.' }, { status: 413 });

    const extension = generated.contentType === 'image/jpeg' ? 'jpg' : generated.contentType === 'image/webp' ? 'webp' : 'png';
    const media = await uploadMediaToWordPress({
      buffer,
      filename: `himalayan-koh-ai-${crypto.randomUUID()}.${extension}`,
      contentType: generated.contentType,
      title: prompt.slice(0, 120),
      altText: prompt.slice(0, 180),
    });

    return NextResponse.json(
      { ok: true, url: media.sourceUrl, mediaId: media.id, contentType: generated.contentType, provider, model: provider === 'openai' ? OPENAI_IMAGE_MODEL : GEMINI_IMAGE_MODEL },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media generation failed.' },
      { status: 502 },
    );
  }
}
