import { afterEach, describe, expect, it, vi } from 'vitest';
import { askModel } from './askModel';
vi.mock('./gemini', () => ({ resolveAiSeoConfig: async () => ({ apiKey: 'test-only-key', provider: 'openrouter', model: 'google/gemini-2.5-flash' }) }));
afterEach(() => vi.unstubAllGlobals());
describe('Real keyword research grounding', () => {
  it('enables a real search and passes provider citations separately from copy', async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: '{"keywords":["horse salt lick"]}', annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.test/horse', title: 'Horse products' } }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await askModel({ prompt: 'Research', webSearch: true });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.plugins).toEqual([{ id: 'web', engine: 'exa', max_results: 3 }]);
    expect(result.sources).toEqual([{ url: 'https://example.test/horse', title: 'Horse products' }]);
  });
  it('fails closed when a model gives uncited keyword guesses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'Guess keywords' } }] })));
    await expect(askModel({ prompt: 'Research', webSearch: true })).rejects.toThrow('no cited evidence');
    expect((await askModel({ prompt: 'Ordinary copy' })).text).toBe('Guess keywords');
  });
});
