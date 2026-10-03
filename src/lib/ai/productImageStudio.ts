import { resolveAiSeoConfig } from './gemini';
import { AiAskError } from './askModel';

export const PRODUCT_IMAGE_MODEL = 'google/gemini-3.1-flash-image';
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

export async function generateProductImage(prompt: string, sources: string[]): Promise<{ image: string; model: string }> {
  const config = await resolveAiSeoConfig();
  if (!config.apiKey || config.provider !== 'openrouter') {
    throw new AiAskError('Image Studio requires an OpenRouter key with image-model access and credits. Configure it in Admin Settings.', 503);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PRODUCT_IMAGE_MODEL,
        prompt: `Edit the FIRST image, which is the real Himalayan Koh product photograph. Preserve the actual product, proportions and packaging unless the owner explicitly requests a label replacement. Additional references are numbered in their supplied order. Never add unsupported certifications, medical or animal-health claims. Generate one polished commercial image. Follow this owner instruction:\n${prompt}`,
        input_references: sources.map(url => ({ type: 'image_url', image_url: { url } })),
      }),
    });
    if (!response.ok) {
      if (response.status === 402) throw new AiAskError('OpenRouter image credits are insufficient. Add credits to the existing account; your original image is unchanged.', 402);
      if (response.status === 401 || response.status === 403) throw new AiAskError('OpenRouter rejected image-model access. Check the existing key and model permissions in Admin Settings.', 503);
      if (response.status === 429) throw new AiAskError('Image generation is rate limited. Wait a moment and retry.', 429);
      throw new AiAskError(`Image model could not complete the edit (HTTP ${response.status}). Your original image is unchanged.`, 502);
    }
    const payload = await response.json() as { data?: Array<{ b64_json?: string; media_type?: string }> };
    const item = payload.data?.[0];
    const mime = item?.media_type || 'image/png';
    if (!item?.b64_json || !/^image\/(png|jpeg|webp)$/.test(mime) || !/^[A-Za-z0-9+/]+=*$/.test(item.b64_json) || item.b64_json.length > 16 * 1024 * 1024) {
      throw new AiAskError('The model returned no usable image. Try a clearer edit instruction; nothing was saved.');
    }
    return { image: `data:${mime};base64,${item.b64_json}`, model: PRODUCT_IMAGE_MODEL };
  } catch (error) {
    if (error instanceof AiAskError) throw error;
    throw new AiAskError('The image request timed out or could not reach the provider. No image was replaced.');
  } finally { clearTimeout(timer); }
}
