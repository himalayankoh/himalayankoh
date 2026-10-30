/**
 * Whether a live ocean-freight provider can actually be asked.
 *
 * ## Why this is a question, not a flag
 *
 * The container calculator can price an ocean leg from three different places: a rate
 * the owner typed (always available), a provider's live rate, or nothing at all. Which
 * one applies depends on configuration that lives in *two* places — the admin console's
 * settings (where the owner pastes a key) and the deployment's environment (where a
 * Worker secret lives) — and a key that is half-present is worse than no key, because
 * the quote then fails at the moment the owner is talking to a buyer.
 *
 * So this module answers with a *status*: which provider, whether it is usable, and by
 * name which fields are still missing. Every screen that offers a live rate reads it,
 * and none of them infers readiness from a truthy string.
 *
 * ## Secrets are read, never echoed
 *
 * The key and secret are used server-side only. What leaves this module is the provider
 * name, a boolean and the *names* of missing fields — never a value, and never a masked
 * fragment either (a fragment is still a leak, and there is nothing the UI needs it for).
 *
 * Server-only: it reads the settings store, which is a credentialed WordPress read.
 */

import { getSettingsForCategory } from '@/lib/settings/serverSettings';

export type FreightProviderId = 'manual' | 'freightos';

export interface FreightProviderStatus {
  /** What is configured: `manual` when a live provider is not, because manual always is. */
  provider: FreightProviderId;
  /** What the owner asked for, whether or not it is usable. */
  requested: string;
  /** True when live rates can be fetched right now. */
  ready: boolean;
  /** Why not, in the owner's words — the fields to fill, by label. */
  missing: string[];
  /** Where the configuration came from, so a stale value can be tracked down. */
  source: 'settings' | 'environment' | 'none';
  /** The sentence a screen shows, so two screens cannot describe this differently. */
  summary: string;
}

/** The field labels as the settings screen shows them, for messages a person can act on. */
const FIELD_LABELS: Record<string, string> = {
  provider: 'Provider',
  api_key: 'API Key',
  api_secret: 'API Secret',
  account_code: 'Account / Office Code',
  api_base: 'API Base URL (optional)',
};

/** The provider that needs a credential before it can be asked. */
const LIVE_PROVIDERS = new Set(['freightos', 'webcargo', 'freightos-webcargo']);

function text(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export async function freightProviderStatus(): Promise<FreightProviderStatus> {
  let settings: Record<string, string | null> = {};
  let source: FreightProviderStatus['source'] = 'none';
  try {
    settings = await getSettingsForCategory('freight');
    if (Object.values(settings).some((value) => text(value))) source = 'settings';
  } catch {
    // A settings store that cannot be read is not a reason to claim a provider exists.
    settings = {};
  }

  const from = (key: keyof typeof FIELD_LABELS, envName: string): string => {
    const stored = text(settings[key]);
    if (stored) return stored;
    const fromEnv = text(process.env[envName]);
    if (fromEnv && source === 'none') source = 'environment';
    return fromEnv;
  };

  const requested = from('provider', 'FREIGHT_PROVIDER') || 'manual';
  const apiKey = from('api_key', 'FREIGHT_API_KEY');
  const apiSecret = from('api_secret', 'FREIGHT_API_SECRET');
  const accountCode = from('account_code', 'FREIGHT_ACCOUNT_CODE');
  const apiBase = from('api_base', 'FREIGHT_API_BASE');

  if (!LIVE_PROVIDERS.has(requested.toLowerCase())) {
    return {
      provider: 'manual',
      requested,
      ready: false,
      missing: [],
      source,
      summary:
        'No live freight provider is connected, so ocean legs are priced from the manual rates you type under Ocean freight. Every manual rate is stored with its source recorded as manual — a typed number is never presented as a fetched one.',
    };
  }

  // Which fields a provider needs is a fact about the provider, not a guess: an API key
  // is always required, a secret only where the contract issues a pair, and the account
  // code only where it is on file.
  const missing: string[] = [];
  if (!apiKey) missing.push('api_key');
  if (accountCode && !apiSecret) missing.push('api_secret');
  if (missing.length) {
    return {
      provider: 'manual',
      requested,
      ready: false,
      missing,
      source,
      summary: `Live rates need ${missing.map((key) => FIELD_LABELS[key] ?? key).join(' and ')} before ${requested} can be asked. Copy them from your provider account into Settings → Ocean Freight — Live Rates. Until then this console prices ocean legs from your manual rates.`,
    };
  }

  return {
    provider: 'freightos',
    requested,
    ready: true,
    missing: [],
    source,
    summary: `${requested} is configured${apiBase ? ` at ${apiBase}` : ''}. A fetch that fails or returns a lane with no offer still falls back to your manual rate for that lane, and the quote records which one it used.`,
  };
}

import { createLiveFreightProvider, type FreightProvider } from './freight';
import type { FreightRate } from './types';

/**
 * Returns the operational FreightProvider instance wired to current settings or env.
 * When unconfigured or upon request failure, gracefully falls back to manualRates.
 */
export async function getLiveFreightProvider(fallbackRates: FreightRate[] = []): Promise<FreightProvider> {
  let settings: Record<string, string | null> = {};
  try {
    settings = await getSettingsForCategory('freight');
  } catch {
    settings = {};
  }
  const from = (key: string, envName: string): string => {
    const stored = text(settings[key]);
    if (stored) return stored;
    return text(process.env[envName]);
  };
  return createLiveFreightProvider(
    {
      provider: from('provider', 'FREIGHT_PROVIDER') || 'manual',
      apiKey: from('api_key', 'FREIGHT_API_KEY'),
      apiSecret: from('api_secret', 'FREIGHT_API_SECRET'),
      accountCode: from('account_code', 'FREIGHT_ACCOUNT_CODE'),
      apiBase: from('api_base', 'FREIGHT_API_BASE'),
    },
    fallbackRates
  );
}

