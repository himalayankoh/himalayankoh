import { NextResponse } from 'next/server';
import { getSettingsForCategory } from '@/lib/settings/serverSettings';
import { DEFAULT_CONFIG } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

export async function GET() {
  const marketingSettings = await getSettingsForCategory('marketing');

  // Start with default config
  const config = { ...DEFAULT_CONFIG };

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
  }

  // Set appropriate cache headers for a config that changes infrequently
  // but needs to be fresh when updated.
  return NextResponse.json(config, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    },
  });
}
