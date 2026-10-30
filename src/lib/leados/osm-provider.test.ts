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
  it('does not label produce cooperatives as feed stores, but keeps observed feed suppliers',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({elements:[{type:'node',id:1,lat:29.76,lon:-95.36,tags:{name:'Plant It Forward',shop:'farm'}},{type:'node',id:2,lat:29.77,lon:-95.37,tags:{name:'Sam Houston Feed & Supply',shop:'farm'}},{type:'node',id:3,lat:29.78,lon:-95.38,tags:{name:'Agricultural Store',shop:'agrarian'}}]})));
    expect((await queryOverpass(input)).leads.map(l=>l.businessName)).toEqual(['Sam Houston Feed & Supply','Agricultural Store']);
  });
});
