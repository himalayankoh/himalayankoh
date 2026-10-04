import { resolveAiSeoConfig, resolveConfigFor } from './gemini';
import { AiAskError } from './askModel';

/** OpenRouter image-model id (Nano Banana 2). */
export const PRODUCT_IMAGE_MODEL = 'google/gemini-3.1-flash-image';
/** The same model, addressed directly through Google AI Studio / the Gemini API. */
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Only public store assets or bounded uploaded image data may reach the provider. */
export function validateStudioImageSource(value: unknown, siteUrl: string, wordpressUrl: string): string {
  if (typeof value !== 'string') throw new AiAskError('Choose a product or reference image.', 400);
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) {
    if (value.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 100) throw new AiAskError('Reference images must be 5 MB or smaller.', 413);
    return value;
  }
  let url: URL;
  try { url = new URL(value, siteUrl); } catch { throw new AiAskError('Invalid image source.', 400); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/\.(png|jpe?g|webp)$/i.test(url.pathname)) {
    throw new AiAskError('Use a public store image or upload a PNG, JPEG or WebP reference.', 400);
  }
  const site = new URL(siteUrl);
  const wp = wordpressUrl ? new URL(wordpressUrl) : null;
  const storedAsset = url.origin === site.origin && url.pathname.startsWith('/images/');
  const uploadedAsset = wp && url.origin === wp.origin && url.pathname.startsWith(`${wp.pathname.replace(/\/$/, '')}/wp-content/uploads/`);
  if (!storedAsset && !uploadedAsset) throw new AiAskError('Select an image from this store’s library or upload a reference from your computer.', 400);
  return url.href;
}

/** The owner instruction wrapped with the store's standing image guardrails. */
function buildImagePrompt(prompt: string): string {
  return `Edit the FIRST image, which is the real Himalayan Koh product photograph. Preserve the actual product, proportions and packaging unless the owner explicitly requests a label replacement. Additional references are numbered in their supplied order. Never add unsupported certifications, medical or animal-health claims. Generate one polished commercial image. Follow this owner instruction:\n${prompt}`;
}

/** The provider's own error text (never a header or the key), so a refusal is actionable. */
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Turn a validated source (data URL or store URL) into inline bytes for Gemini. */
async function sourceToInline(source: string): Promise<{ mimeType: string; data: string }> {
  const dataMatch = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(source);
  if (dataMatch) return { mimeType: dataMatch[1], data: dataMatch[2] };

  const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new AiAskError('A reference image could not be downloaded.', 502);
  const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) throw new AiAskError('A reference image was not a PNG, JPEG or WebP.', 400);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new AiAskError('Reference images must be 5 MB or smaller.', 413);
  return { mimeType, data: bytesToBase64(bytes) };
}

/** Direct Google AI Studio (Gemini API) image edit — no OpenRouter credits involved. */
async function generateWithGemini(prompt: string, sources: string[], apiKey: string, signal: AbortSignal): Promise<{ image: string; model: string }> {
  const inline = await Promise.all(sources.map(sourceToInline));
  const parts = [
    { text: buildImagePrompt(prompt) },
    ...inline.map((item) => ({ inline_data: { mime_type: item.mimeType, data: item.data } })),
  ];

  const response = await fetch(
    `${GEMINI_API_ROOT}/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
  );

  if (!response.ok) {
    const detail = await providerDetail(response);
    if (response.status === 401 || response.status === 403) throw new AiAskError('Gemini rejected the image-model key. Check the Google AI Studio key in AI Hub.', 401);
    if (response.status === 429) throw new AiAskError(`Gemini refused this image request (quota or rate limit for ${GEMINI_IMAGE_MODEL}).${detail}`, 429);
    throw new AiAskError(`Gemini image model could not complete the edit (HTTP ${response.status}).${detail} Your original image is unchanged.`, 502);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  if (payload.promptFeedback?.blockReason) throw new AiAskError(`Gemini refused the request (${payload.promptFeedback.blockReason}).`, 422);

  for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data || part.inline_data?.data;
    const mime = part.inlineData?.mimeType || part.inline_data?.mime_type || 'image/png';
    if (data && /^image\/(png|jpeg|webp)$/.test(mime) && data.length <= 16 * 1024 * 1024) {
      return { image: `data:${mime};base64,${data}`, model: GEMINI_IMAGE_MODEL };
    }
  }
  throw new AiAskError('The model returned no usable image. Try a clearer edit instruction; nothing was saved.');
}

/** OpenRouter image edit (Nano Banana 2) — needs image credits on the OpenRouter account. */
async function generateWithOpenRouter(prompt: string, sources: string[], apiKey: string, signal: AbortSignal): Promise<{ image: string; model: string }> {
  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: PRODUCT_IMAGE_MODEL,
      prompt: buildImagePrompt(prompt),
      input_references: sources.map((url) => ({ type: 'image_url', image_url: { url } })),
    }),
  });

  if (!response.ok) {
    if (response.status === 402) throw new AiAskError('OpenRouter image credits are insufficient. Add a Google AI Studio (Gemini) key in AI Hub to keep editing without credits, or top up the existing account.', 402);
    if (response.status === 401 || response.status === 403) throw new AiAskError('OpenRouter rejected image-model access. Check the existing key and model permissions in Admin Settings.', 503);
    if (response.status === 429) throw new AiAskError('Image generation is rate limited. Wait a moment and retry.', 429);
    throw new AiAskError(`Image model could not complete the edit (HTTP ${response.status}). Your original image is unchanged.`, 502);
  }

  const payload = (await response.json()) as { data?: Array<{ b64_json?: string; media_type?: string }> };
  const item = payload.data?.[0];
  const mime = item?.media_type || 'image/png';
  if (!item?.b64_json || !/^image\/(png|jpeg|webp)$/.test(mime) || !/^[A-Za-z0-9+/]+=*$/.test(item.b64_json) || item.b64_json.length > 16 * 1024 * 1024) {
    throw new AiAskError('The model returned no usable image. Try a clearer edit instruction; nothing was saved.');
  }
  return { image: `data:${mime};base64,${item.b64_json}`, model: PRODUCT_IMAGE_MODEL };
}

/**
 * Generate one edited product image.
 *
 * Gemini first: the owner's Google AI Studio key is charged directly and does not
 * depend on OpenRouter credits, which is what used to stop image work dead. Only
 * when no Gemini key exists (or it fails transiently) does this fall back to
 * OpenRouter. A Gemini key that the provider rejects is surfaced as-is rather
 * than silently masked by a fallback that would also fail.
 */
export async function generateProductImage(prompt: string, sources: string[]): Promise<{ image: string; model: string }> {
  const [gemini, routing] = await Promise.all([resolveConfigFor('gemini'), resolveAiSeoConfig()]);
  const geminiKey = gemini.apiKey;
  const openrouterKey = routing.provider === 'openrouter' ? routing.apiKey : '';

  if (!geminiKey && !openrouterKey) {
    throw new AiAskError('Image Studio needs a Google AI Studio (Gemini) key — attach one in AI Hub → Google AI Studio — or OpenRouter image credits.', 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    let geminiError: unknown = null;
    if (geminiKey) {
      try {
        return await generateWithGemini(prompt, sources, geminiKey, controller.signal);
      } catch (error) {
        // A rejected key is the owner's problem to fix, not a reason to try the
        // other provider silently.
        if (error instanceof AiAskError && (error.status === 401 || error.status === 403)) throw error;
        geminiError = error;
      }
    }
    if (openrouterKey) return await generateWithOpenRouter(prompt, sources, openrouterKey, controller.signal);
    throw geminiError instanceof AiAskError ? geminiError : new AiAskError('Image generation failed and no OpenRouter fallback is configured.', 502);
  } catch (error) {
    if (error instanceof AiAskError) throw error;
    throw new AiAskError('The image request timed out or could not reach the provider. No image was replaced.');
  } finally {
    clearTimeout(timer);
  }
}
