export interface StripePublicConfig {
  publishableKey: string;
  publishableKeySource: 'db' | 'env' | 'unset';
  /**
   * Both keys are present **and** come from the same Stripe mode, so the card form
   * can confirm the PaymentIntent this deployment created. This is the only field
   * a caller should treat as "card payments will work".
   */
  configured: boolean;
  mode: 'test' | 'live';
  webhookConfigured: boolean;
  /**
   * Which key is stored, and in which mode — never the value. Optional so a
   * client bundle cached from before the field existed still type-checks.
   */
  keyStatus?: {
    publishable: 'test' | 'live' | 'missing' | 'unknown';
    secret: 'test' | 'live' | 'missing' | 'unknown';
    webhook: 'present' | 'missing';
  };
  /** Two usable keys from different Stripe modes: a checkout that cannot confirm. */
  modeMismatch?: boolean;
  /**
   * The first reason this deployment may not charge at all — e.g. a live key on a
   * non-production origin. Null when it may charge. Shown to staff, never a value.
   */
  chargingBlockedReason?: string | null;
  /** Which keys are usable, as plain booleans — never the values. */
  availability?: {
    publishableKeyAvailable: boolean;
    secretKeyAvailable: boolean;
    webhookSecretAvailable: boolean;
  };
  /**
   * Whether the WordPress settings category behind the keys could be read, and
   * with what HTTP status. `ok:false` with 401/403 means this deployment cannot
   * see stored settings at all, so every stored key looks unset.
   */
  settingsRead?: { ok: boolean; status: number | null };
}

export async function loadStripeConfig(): Promise<StripePublicConfig> {
  const response = await fetch('/api/stripe/config');
  if (!response.ok) {
    throw new Error('Unable to load Stripe configuration.');
  }
  return response.json() as Promise<StripePublicConfig>;
}
