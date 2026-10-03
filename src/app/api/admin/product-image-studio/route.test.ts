import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ admin: true, generate: vi.fn() }));
vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest: async () => state.admin ? { ok: true, userId: 'admin' } : { ok: false, error: 'Sign in', status: 401 } }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/ai/gemini', () => ({ resolveAiSeoConfig: async () => ({ apiKey: 'test-only-provider-key', provider: 'openrouter' }) }));
vi.mock('@/lib/ai/productImageStudio', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/productImageStudio')>(), generateProductImage: state.generate }));
vi.mock('@/lib/backend/config', () => ({ backendConfig: { wordpressBaseUrl: 'https://wp.example.test/staging' } }));
vi.mock('@/lib/env', () => ({ publicEnv: { siteUrl: 'https://preview.example.test' } }));
import { GET, POST } from './route';
const request = (body: unknown, origin?: string) => new Request('https://preview.example.test/api/admin/product-image-studio', { method: 'POST', headers: origin ? { Origin: origin } : {}, body: JSON.stringify(body) });
beforeEach(() => { state.admin = true; state.generate.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
describe('Product image studio access and honest availability', () => {
  it('requires admin before reading provider status or generating', async () => {
    state.admin = false;
    expect((await GET(new Request('https://preview.example.test/api/admin/product-image-studio'))).status).toBe(401);
    expect((await POST(request({ prompt: 'Edit', sources: [] }))).status).toBe(401);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it('keeps image tooling unavailable when credits are exhausted, without exposing keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { total_credits: 1, total_usage: 1.01 } })));
    const body = await (await GET(new Request('https://preview.example.test/api/admin/product-image-studio'))).json();
    expect(body.available).toBe(false);
    expect(body.detail).toContain('needs credits');
    expect(JSON.stringify(body)).not.toContain('test-only-provider-key');
  });
  it('rejects cross-origin and arbitrary reference requests before calling AI', async () => {
    expect((await POST(request({ prompt: 'Edit', sources: [] }, 'https://attacker.test'))).status).toBe(403);
    expect((await POST(request({ prompt: 'Edit', sources: ['https://attacker.test/secret.png'] }))).status).toBe(400);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it('returns a generated preview without product or media mutations', async () => {
    state.generate.mockResolvedValue({ image: 'data:image/png;base64,aGVsbG8=', model: 'image-model' });
    const response = await POST(request({ prompt: 'Add a horse', sources: ['/images/products/salt.webp'] }));
    expect(response.status).toBe(200);
    expect((await response.json()).image).toContain('data:image/png');
    expect(state.generate).toHaveBeenCalledWith('Add a horse', ['https://preview.example.test/images/products/salt.webp']);
  });
});
