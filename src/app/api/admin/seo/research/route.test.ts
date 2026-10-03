import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ admin: true, ask: vi.fn() }));
vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest: async () => state.admin ? { ok: true, userId: 'admin' } : { ok: false, error: 'Login required', status: 401 } }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/ai/askModel', () => ({ askModel: state.ask, AiAskError: class extends Error { status = 502; } }));
import { POST } from './route';
const request = (body: unknown) => new Request('https://preview.himalayankoh.com/api/admin/seo/research', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { state.admin = true; state.ask.mockReset(); });
describe('Market keyword research endpoint', () => {
  it('requires an admin before incurring provider costs', async () => {
    state.admin = false;
    expect((await POST(request({ name: 'Salt' }))).status).toBe(401);
    expect(state.ask).not.toHaveBeenCalled();
  });
  it('returns only real evidence and qualitative suggestions without saving product fields', async () => {
    state.ask.mockResolvedValue({ text: '{"keywords":["horse salt lick"],"summary":"Buyer-intent wording"}', sources: [{ url: 'https://example.test/horse', title: 'Horse' }], provider: 'openrouter', model: 'gemini' });
    const response = await POST(request({ name: 'Horse salt', context: 'Horse audience' }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.keywords).toEqual(['horse salt lick']);
    expect(body.sources).toHaveLength(1);
    expect(state.ask.mock.calls[0][0].webSearch).toBe(true);
    expect(body).not.toHaveProperty('searchVolume');
  });
  it('refuses uncited responses and never reports research success', async () => {
    state.ask.mockResolvedValue({ text: '{"keywords":["guessed keyword"]}', sources: [] });
    const response = await POST(request({ name: 'Salt' }));
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty('keywords');
  });
});
