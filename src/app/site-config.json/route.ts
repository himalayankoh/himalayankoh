import { NextResponse } from 'next/server';
import { getSettingsForCategory } from '@/lib/settings/serverSettings';
import { DEFAULT_CONFIG, PLACEMENT_KEYS, AD_SLOT_RE } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

export async function GET() {
  const marketingSettings = await getSettingsForCategory('marketing');

  // Start with default config
  const config = structuredClone(DEFAULT_CONFIG);

  if (marketingSettings) {
    if (marketingSettings.gaEnabled !== undefined) {
      config.gaEnabled = marketingSettings.gaEnabled === 'true';
    }
    if (marketingSettings.ga4Id !== undefined) {
      config.ga4Id = marketingSettings.ga4Id || '';
    }
    if (marketingSettings.adsenseEnabled !== undefined) {
      config.adsenseEnabled = marketingSettings.adsenseEnabled === 'true';
    }
    if (marketingSettings.adsenseClientId !== undefined) {
      config.adsenseClientId = marketingSettings.adsenseClientId || '';
    }
    if (marketingSettings.publisherId !== undefined) {
      config.publisherId = marketingSettings.publisherId || '';
    }
    if (marketingSettings.autoAdsEnabled !== undefined) {
      config.autoAdsEnabled = marketingSettings.autoAdsEnabled === 'true';
    }
    if (marketingSettings.manualAdsEnabled !== undefined) {
      config.manualAdsEnabled = marketingSettings.manualAdsEnabled === 'true';
    }
    if (marketingSettings.adsTxtRecord !== undefined) {
      config.adsTxtRecord = marketingSettings.adsTxtRecord || '';
    }
    if (['low', 'balanced', 'high'].includes(marketingSettings.density || '')) {
      config.density = marketingSettings.density as typeof config.density;
    }
    if (['low', 'balanced'].includes(marketingSettings.mobileDensity || '')) {
      config.mobileDensity = marketingSettings.mobileDensity as typeof config.mobileDensity;
    }
    if (marketingSettings.showAdsOnMobile !== undefined) config.showAdsOnMobile = marketingSettings.showAdsOnMobile === 'true';
    try {
      const exclusions = JSON.parse(marketingSettings.exclusions || '{}');
      for (const key of Object.keys(config.exclusions) as (keyof typeof config.exclusions)[]) {
        if (key !== 'admin' && typeof exclusions?.[key] === 'boolean') config.exclusions[key] = exclusions[key];
      }
    } catch { /* Keep safe defaults for malformed stored settings. */ }
    try {
      const placements = JSON.parse(marketingSettings.placements || '{}');
      for (const key of PLACEMENT_KEYS) {
        const placement = placements?.[key];
        if (typeof placement?.enabled === 'boolean' && typeof placement.slot === 'string' && (!placement.slot || AD_SLOT_RE.test(placement.slot))) {
          config.placements[key] = { enabled: placement.enabled, slot: placement.slot.slice(0, 32) };
        }
      }
    } catch { /* Keep safe defaults for malformed stored settings. */ }
  }

  // Set appropriate cache headers for a config that changes infrequently
  // but needs to be fresh when updated.
  return NextResponse.json(config, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    },
  });
}
