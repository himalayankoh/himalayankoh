import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/settings/serverSettings', () => ({ getSettingsForCategory: settings.read }));

import { GET } from './route';

describe('public marketing configuration privacy', () => {
  beforeEach(() => settings.read.mockReset());

  it('keeps advertising off when no owner settings exist', async () => {
    settings.read.mockResolvedValue({});
    const response = await GET();
    const config = await response.json();
    expect(config.adsenseEnabled).toBe(false);
    expect(config.autoAdsEnabled).toBe(false);
    expect(config.manualAdsEnabled).toBe(false);
  });

  it('returns only public configuration even if the stored category contains credentials', async () => {
    settings.read.mockResolvedValue({
      gaEnabled: 'true', ga4Id: 'G-TESTAUDIT',
      client_secret: 'fixture-client-secret',
      api_key: 'fixture-api-key', refresh_token_encrypted: 'fixture-sealed-token',
    });
    const response = await GET();
    const config = await response.json();
    expect(config.gaEnabled).toBe(true);
    expect(config.ga4Id).toBe('G-TESTAUDIT');
    expect(config).not.toHaveProperty('client_secret');
    expect(config).not.toHaveProperty('api_key');
    expect(config).not.toHaveProperty('refresh_token_encrypted');
    expect(JSON.stringify(config)).not.toContain('fixture-');
  });
});
