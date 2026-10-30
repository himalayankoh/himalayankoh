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
  /**
   * The staging-only payment simulator, as this deployment judges it.
   *
   * Reported here rather than fetched separately because the answer comes from the
   * *same* settings row as the keys, so the payment priority below costs no extra
   * round trip. `available` is already the full decision — switch and origin — and is
   * what the checkout mounts a Test Payment form on. On production it is always
   * `false`, whatever the switch says.
   */
  stagingSimulator?: StagingSimulatorPublicStatus;
  /**
   * Which payment path the checkout should use. The server decides it, in one place,
   * so the screen and the routes cannot disagree: a real card form first, the
   * simulator second, an honest refusal last. An invoice is never an option.
   */
  checkoutPaymentOption?: 'stripe' | 'staging_simulator' | 'unavailable';
}

export interface StagingSimulatorPublicStatus {
  available: boolean;
  /** The switch alone, before the origin gate — for the console to explain itself. */
  enabled: boolean;
  source: 'setting' | 'env' | 'default';
  /** Why it is unavailable. Safe to display: never a key, never a value. */
  reason: string | null;
  /** The two simulator cards, so the panel can offer them as quick fills. */
  testCards: { success: string; decline: string };
}

export async function loadStripeConfig(): Promise<StripePublicConfig> {
  const response = await fetch('/api/stripe/config');
  if (!response.ok) {
    throw new Error('Unable to load Stripe configuration.');
  }
  return response.json() as Promise<StripePublicConfig>;
}
