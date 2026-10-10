import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./storefrontClient', () => ({ storefrontRequest: store.request }));
import { siteSettingsApi } from './siteContent';

describe('WordPress setting-name round trips', () => {
  beforeEach(() => store.request.mockReset());
  it('reads the lowercase keys WordPress writes using registered application names', async () => {
    store.request.mockResolvedValue({ values: { gaenabled: 'true', ga4id: 'G-ROUNDTRIP', mobiledensity: 'low', showadsonmobile: 'false' } });
    const values = await siteSettingsApi.read('marketing');
    expect(values).toMatchObject({ gaEnabled: 'true', ga4Id: 'G-ROUNDTRIP', mobileDensity: 'low', showAdsOnMobile: 'false' });
  });
  it('prefers the current normalized value over an older mixed-case duplicate, including a cleared field', async () => {
    store.request.mockResolvedValue({ values: { gaEnabled: 'true', gaenabled: 'false', ga4Id: 'G-OLDVALUE', ga4id: null } });
    expect(await siteSettingsApi.read('marketing')).toMatchObject({ gaEnabled: 'false', ga4Id: null });
  });
  it('preserves arbitrary collection keys and snake-case OAuth keys', async () => {
    store.request.mockResolvedValue({ values: { client_id: 'public-client', refresh_token_encrypted: 'sealed-fixture' } });
    expect(await siteSettingsApi.read('google_oauth')).toEqual({ client_id: 'public-client', refresh_token_encrypted: 'sealed-fixture' });
    store.request.mockResolvedValue({ values: { 'draft-1': '{"status":"draft"}' } });
    expect(await siteSettingsApi.read('campaign_drafts')).toEqual({ 'draft-1': '{"status":"draft"}' });
  });
});
