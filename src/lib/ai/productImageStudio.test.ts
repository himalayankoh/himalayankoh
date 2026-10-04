import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateProductImage, PRODUCT_IMAGE_MODEL, GEMINI_IMAGE_MODEL, validateStudioImageSource } from './productImageStudio';
const config = vi.hoisted(() => ({ provider: 'openrouter', apiKey: 'test-only-provider-secret', model: 'google/gemini-2.5-flash' }));
const gemini = vi.hoisted(() => ({ provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash' }));
vi.mock('./gemini', () => ({
  resolveAiSeoConfig: async () => config,
  resolveConfigFor: async (provider: string) => (provider === 'gemini' ? gemini : config),
}));
const site = 'https://preview.example.test';
const wp = 'https://shop.example.test/staging';
beforeEach(() => { config.provider = 'openrouter'; config.apiKey = 'test-only-provider-secret'; gemini.apiKey = ''; });
afterEach(() => vi.unstubAllGlobals());
describe('Image studio source boundary', () => {
  it('accepts curated storefront and staging media images', () => {
    expect(validateStudioImageSource('/images/products/salt.webp', site, wp)).toBe(`${site}/images/products/salt.webp`);
    expect(validateStudioImageSource(`${wp}/wp-content/uploads/2026/10/label.png`, site, wp)).toContain('/staging/wp-content/uploads/');
    expect(validateStudioImageSource('data:image/png;base64,aGVsbG8=', site, wp)).toContain('data:image/png');
  });
  it.each(['http://127.0.0.1/image.png', 'https://attacker.test/private.png', `${wp}/wp-json/settings.png`, `${site}/api/private.png`, `${wp}/wp-content/uploads/label.png?token=secret`, `${wp}/wp-content/uploads/../../../settings.png`, 'data:text/html;base64,aGVsbG8='])('rejects arbitrary or credential-bearing sources: %s', input => {
    expect(() => validateStudioImageSource(input, site, wp)).toThrow();
  });
  it('refuses oversized inline references', () => expect(() => validateStudioImageSource(`data:image/png;base64,${'A'.repeat(8_000_000)}`, site, wp)).toThrow('5 MB'));
});
describe('Image editing — Gemini first, OpenRouter fallback', () => {
  it('uses the Google AI Studio key directly, with no OpenRouter credits involved', async () => {
    gemini.apiKey = 'test-only-gemini-secret';
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateProductImage('Replace with the uploaded label', ['data:image/png;base64,c291cmNl', 'data:image/png;base64,bGFiZWw=']);
    expect(result).toEqual({ image: 'data:image/png;base64,aGVsbG8=', model: GEMINI_IMAGE_MODEL });
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain(GEMINI_IMAGE_MODEL);
    expect(JSON.stringify(result)).not.toContain(gemini.apiKey);
  });

  it('falls back to OpenRouter when there is no Gemini key', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ b64_json: 'aGVsbG8=', media_type: 'image/png' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateProductImage('Replace with the uploaded label', ['data:image/png;base64,c291cmNl', 'data:image/png;base64,bGFiZWw=']);
    expect(result).toEqual({ image: 'data:image/png;base64,aGVsbG8=', model: PRODUCT_IMAGE_MODEL });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/images');
    expect(JSON.parse(options.body as string).input_references).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });

  it('surfaces a rejected Gemini key instead of masking it with a fallback', async () => {
    gemini.apiKey = 'test-only-gemini-secret';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(generateProductImage('Edit', ['data:image/png;base64,c291cmNl'])).rejects.toThrow('Gemini rejected the image-model key');
  });

  it('reports insufficient OpenRouter credits without a phantom image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(config.apiKey, { status: 402 })));
    await expect(generateProductImage('Edit', ['data:image/png;base64,c291cmNl'])).rejects.toThrow('credits are insufficient');
  });

  it('refuses a text-only response instead of declaring success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'I edited it' } }] })));
    await expect(generateProductImage('Edit', ['data:image/png;base64,c291cmNl'])).rejects.toThrow('no usable image');
  });

  it('refuses when neither a Gemini key nor OpenRouter is configured', async () => {
    config.apiKey = ''; gemini.apiKey = ''; const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(generateProductImage('Edit', ['data:image/png;base64,c291cmNl'])).rejects.toThrow('Google AI Studio (Gemini) key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
