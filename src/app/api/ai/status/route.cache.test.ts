import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The AI Hub could not render until this route answered, and the route resolved
 * every provider from the WordPress-backed settings store on every call —
 * measured on the preview deployment (2026-10-06): 3.5 to 4 s idle, 7.4 s when it
 * ran beside `/api/admin/ai-keys`.
 *
 * These tests hold the cache to its two promises: a repeat read inside the window
 * does not touch the store again, and a failed read is not remembered.
 */

/**
 * The cache itself lives in `@/lib/ai/statusCache`: a test-only helper exported
 * from a `route.ts` fails `npm run build`, because Next.js type-checks a route
 * file's exports against the set of things a route may export.
 */
let resolveCalls = 0;
/** Set to make the settings read fail, for the not-remembered-failure case. */
let resolutionFails = false;

vi.mock('@/lib/ai/gemini', () => ({
  PROVIDER_SPECS: [
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'gemini', label: 'Gemini' },
  ],
  resolveConfigFor: async (provider: string) => {
    resolveCalls += 1;
    if (resolutionFails) throw new Error('The settings store is unreachable');
    return {
      apiKey: provider === 'openrouter' ? 'sk-configured' : '',
      model: provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-3.1-flash',
      keySource: 'console',
    };
  },
}));

const { GET } = await import('./route');
const { AI_STATUS_TTL_MS, __resetAiStatusCacheForTests } = await import('@/lib/ai/statusCache');

beforeEach(() => {
  __resetAiStatusCacheForTests();
  resolveCalls = 0;
  resolutionFails = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/ai/status', () => {
  it('resolves each provider once and reuses the answer inside the window', async () => {
    const first = await GET();
    const second = await GET();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Two providers, two reads — not two reads per request.
    expect(resolveCalls).toBe(2);
    expect(await second.json()).toEqual(await first.json());
  });

  it('re-resolves once the window has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00.000Z'));

    await GET();
    expect(resolveCalls).toBe(2);

    vi.setSystemTime(new Date(Date.now() + AI_STATUS_TTL_MS - 1));
    await GET();
    expect(resolveCalls).toBe(2);

    vi.setSystemTime(new Date(Date.now() + AI_STATUS_TTL_MS + 1));
    await GET();
    expect(resolveCalls).toBe(4);
  });

  it('does not remember a failed read', async () => {
    resolutionFails = true;
    const failed = await GET();
    expect(failed.status).toBe(200);
    expect(await failed.json()).toMatchObject({ backend: 'missing', providers: [] });

    resolutionFails = false;
    const recovered = await GET();
    const body = await recovered.json();
    expect(body.backend).toBe('configured');
    expect(body.providers).toHaveLength(2);
  });
});
