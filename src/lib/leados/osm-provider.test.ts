import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryOverpass } from './osm-provider';

const input = { tags: [{ key: 'shop', value: 'agrarian' }], lat: 29.76, lon: -95.36, radiusKm: 25, maxResults: 15, nodeOnly: false, category: 'Feed Store' };
afterEach(() => vi.unstubAllGlobals());

describe('Overpass response validity', () => {
  it.each([{ remark: 'runtime error: timeout', elements: [] }, { remark: 'partial response', elements: [{ type: 'node', id: 1, tags: { name: 'Partial business' } }] }, {}])('rejects an incomplete HTTP 200 response: %j', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    const result = await queryOverpass(input);
    expect(result.error).toBeTruthy();
    expect(result.leads).toEqual([]);
  });
  it('accepts an actual empty dataset without an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ elements: [] })));
    expect(await queryOverpass(input)).toMatchObject({ leads: [], rawCount: 0, error: null });
  });
});
