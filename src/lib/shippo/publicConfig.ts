export interface ShippoPublicConfig {
  enabled: boolean;
  configured: boolean;
  reason: string | null;
}

/**
 * Runtime Shippo status. Falls back to disabled if the endpoint is unreachable, so a
 * checkout whose rate lookup cannot be trusted prices delivery from the store's own
 * flat table instead of showing nothing.
 */
export async function loadShippoConfig(): Promise<ShippoPublicConfig> {
  try {
    const response = await fetch('/api/shippo/config');
    if (!response.ok) {
      return { enabled: false, configured: false, reason: 'Unable to load Shippo configuration.' };
    }
    return (await response.json()) as ShippoPublicConfig;
  } catch {
    return { enabled: false, configured: false, reason: 'Unable to load Shippo configuration.' };
  }
}
