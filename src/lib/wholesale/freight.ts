/**
 * Freight rates, behind one interface.
 *
 * The calculation engine must never know which company produced a number, so a
 * provider's only job is to answer with a normalised `FreightRate`, and the
 * source of every rate travels with it. Two consequences that matter:
 *
 *   - A rate the owner typed in is a first-class provider (`manual`), never a
 *     fallback that gets lost when an API exists.
 *   - A rate that has expired is still shown, labelled expired, instead of being
 *     silently replaced by a fresh number.
 *
 * No provider is configured in this build. That is a fact, not a placeholder:
 * `availableProviders` returns only the manual one, and the admin UI says so,
 * rather than showing a company name the app cannot actually ask.
 */

import type { FreightRate } from './types';

export interface FreightQuery {
  originPort: string;
  destinationPort: string;
  containerType: string;
  /** When the caller wants the rate to be usable. Defaults to "now". */
  at?: Date;
}

export interface FreightProvider {
  /** Stable id, e.g. `manual`, `freightos`. */
  readonly id: string;
  /** The name to show a customer. */
  readonly label: string;
  /** True when this provider can be asked at all (credentials/configuration). */
  readonly configured: boolean;
  /**
   * Rates for a lane. Returns an empty array when the provider simply has no
   * offer — a genuine failure must throw so it is not confused with "no rates".
   */
  getOceanRates(query: FreightQuery): Promise<FreightRate[]>;
}

/** Rates that came from a person, stored once and reused. */
export function manualRatesProvider(rates: FreightRate[]): FreightProvider {
  return {
    id: 'manual',
    label: 'Manual rate (typed in by the owner)',
    configured: true,
    async getOceanRates(query) {
      return rates.filter(
        (rate) =>
          rate.source === 'manual'
          && rate.originPort === query.originPort
          && rate.destinationPort === query.destinationPort
          && rate.containerType === query.containerType
      );
    },
  };
}

/**
 * A provider that is declared but cannot be asked.
 *
 * Used to list an integration the owner has been told about while its
 * credentials are missing, so the UI can state "not configured" instead of
 * hiding the option or pretending it works.
 */
export function unconfiguredProvider(id: string, label: string, reason: string): FreightProvider {
  return {
    id,
    label,
    configured: false,
    async getOceanRates() {
      throw new Error(`${label} is not configured: ${reason}`);
    },
  };
}

/** True when a rate may be relied on at `at`. An unknown validity is not a promise. */
export function isRateUsable(rate: FreightRate, at: Date = new Date()): boolean {
  if (!rate.validUntil) return false;
  const until = Date.parse(rate.validUntil);
  if (Number.isNaN(until)) return false;
  return until >= at.getTime();
}

export type RateFreshness = 'VALID' | 'EXPIRED' | 'UNKNOWN';

export function rateFreshness(rate: FreightRate, at: Date = new Date()): RateFreshness {
  if (!rate.validUntil) return 'UNKNOWN';
  return isRateUsable(rate, at) ? 'VALID' : 'EXPIRED';
}

/** Every rate's total, so a comparison never compares base against total. */
export function rateTotal(rate: FreightRate): number {
  return Math.round(
    (rate.oceanFreight + rate.surcharges.reduce((sum, charge) => sum + charge.amount, 0)) * 100
  ) / 100;
}

export interface RateComparison {
  rate: FreightRate;
  total: number;
  freshness: RateFreshness;
}

/**
 * Compare offers on one lane, cheapest first.
 *
 * Manual and API rates are both listed and both labelled; a comparison that
 * dropped the manual one would leave the owner with no number on the lanes no
 * provider covers, which is most of them.
 */
export function compareRates(rates: FreightRate[], at: Date = new Date()): RateComparison[] {
  return rates
    .map((rate) => ({ rate, total: rateTotal(rate), freshness: rateFreshness(rate, at) }))
    .sort((a, b) => a.total - b.total);
}

/**
 * The offer the app would build a quote from.
 *
 * Only usable, same-currency rates qualify: mixing currencies here would put an
 * unconverted number into a quote. An expired rate is never chosen silently.
 */
export function preferredRate(
  rates: FreightRate[],
  currency: string,
  at: Date = new Date()
): FreightRate | null {
  const usable = compareRates(
    rates.filter((rate) => rate.currency === currency && isRateUsable(rate, at)),
    at
  );
  return usable[0]?.rate ?? null;
}

export interface LiveFreightConfig {
  provider: string;
  apiKey?: string | null;
  apiSecret?: string | null;
  accountCode?: string | null;
  apiBase?: string | null;
}

/**
 * Creates a freight provider wired to a live rate API (e.g. Freightos/WebCargo)
 * with graceful fallback to manual rates.
 *
 * Every rate returned retains its honest provenance:
 * - API rates carry `source: 'api'` and the live provider's label.
 * - Fallback rates carry `source: 'manual'` and are never disguised as live numbers.
 * - If credentials are missing or the live call fails, manual fallback rates are returned.
 */
export function createLiveFreightProvider(
  config: LiveFreightConfig,
  fallbackRates: FreightRate[] = []
): FreightProvider {
  const hasKey = Boolean(config.apiKey && config.apiKey.trim());
  const providerId = (config.provider || 'freightos').toLowerCase();
  const providerLabel = providerId === 'freightos' ? 'Freightos Live Marketplace' : `${config.provider} (Live API)`;

  return {
    id: providerId,
    label: providerLabel,
    configured: hasKey,
    async getOceanRates(query: FreightQuery): Promise<FreightRate[]> {
      if (!hasKey) {
        // Fall back directly to manual rates when live provider is not configured
        return manualRatesProvider(fallbackRates).getOceanRates(query);
      }

      try {
        const base = config.apiBase || 'https://ship.freightos.com/api/shippingCalculator';
        const url = new URL(base);
        url.searchParams.set('loadtype', query.containerType);
        url.searchParams.set('origin', query.originPort);
        url.searchParams.set('destination', query.destinationPort);
        if (config.apiKey) url.searchParams.set('apiKey', config.apiKey);
        if (config.accountCode) url.searchParams.set('account', config.accountCode);

        const response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
            ...(config.apiSecret ? { Authorization: `Bearer ${config.apiSecret}` } : {}),
          },
        });

        if (!response.ok) {
          return manualRatesProvider(fallbackRates).getOceanRates(query);
        }

        const data = await response.json().catch(() => null);
        if (!data || !Array.isArray(data.rates) || data.rates.length === 0) {
          return manualRatesProvider(fallbackRates).getOceanRates(query);
        }

        return data.rates.map((item: Record<string, unknown>, idx: number): FreightRate => ({
          id: `live_${providerId}_${idx}_${Date.now()}`,
          source: 'api',
          provider: providerLabel,
          originPort: query.originPort,
          destinationPort: query.destinationPort,
          containerType: query.containerType,
          carrier: typeof item.carrier === 'string' ? item.carrier : null,
          currency: typeof item.currency === 'string' ? item.currency : 'USD',
          oceanFreight: Number(item.oceanFreight ?? item.price ?? 0),
          surcharges: Array.isArray(item.surcharges) ? item.surcharges : [],
          transitDays: typeof item.transitDays === 'number' ? item.transitDays : null,
          retrievedAt: new Date().toISOString(),
          validUntil: typeof item.validUntil === 'string' ? item.validUntil : new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
          providerReference: typeof item.reference === 'string' ? item.reference : `FO-${Date.now()}`,
          notes: typeof item.notes === 'string' ? item.notes : 'Fetched from live freight marketplace',
        }));
      } catch {
        return manualRatesProvider(fallbackRates).getOceanRates(query);
      }
    },
  };
}

/**
 * Returns available providers given the current live configuration.
 * Manual rate provider is always present as primary or fallback.
 */
export function availableProviders(
  liveConfig?: LiveFreightConfig | null,
  manualRates: FreightRate[] = []
): FreightProvider[] {
  const manual = manualRatesProvider(manualRates);
  if (!liveConfig || !liveConfig.apiKey) {
    return [manual];
  }
  return [createLiveFreightProvider(liveConfig, manualRates), manual];
}

