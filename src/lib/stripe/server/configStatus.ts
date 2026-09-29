/**
 * Whether this deployment's Stripe keys can actually take a payment *together*.
 *
 * `/api/stripe/config` used to answer "is there a publishable key and a secret
 * key?", and that is the wrong question. A `pk_live_` paired with an `sk_test_` is
 * two keys that exist and still cannot confirm the PaymentIntent the server
 * created: Stripe.js loads in live mode while the intent was made in test, so the
 * card form fails at the last step, after the customer has typed their number.
 * `configured` therefore has to mean "these two work together", or the checkout
 * mounts a payment form that cannot possibly succeed.
 *
 * The mode decision is deliberately the same one `./readiness` makes for the
 * server-side gate — `classifyStripeKey` and `hasWebhookSecret` are imported, not
 * re-implemented — so the screen the customer sees and the gate that refuses the
 * charge can never disagree about what "test mode" means.
 *
 * Pure over its inputs, so both the usable and the mismatched answer can be pinned
 * in a test without a Stripe account.
 */

import { classifyStripeKey, hasWebhookSecret, type StripeKeyMode } from './readiness';

export interface StripeKeyStatus {
  publishable: StripeKeyMode;
  secret: StripeKeyMode;
  webhook: 'present' | 'missing';
}

export interface StripeConfigStatus {
  /** Both keys exist **and** come from the same Stripe mode. */
  configured: boolean;
  /** Which mode the browser would load. Defaults to test — the safer answer. */
  mode: 'test' | 'live';
  /** Two usable keys from different modes: a checkout that cannot confirm. */
  modeMismatch: boolean;
  /**
   * A `whsec_` signing secret is stored, so a paid order can be marked paid.
   * Deliberately separate from `configured`: an owner must be able to confirm a
   * test card *before* they have a webhook endpoint to point Stripe at.
   */
  webhookConfigured: boolean;
  keyStatus: StripeKeyStatus;
  /**
   * The same facts as plain booleans, for a settings screen to render without
   * having to know that `unknown` is not `present`.
   */
  availability: {
    publishableKeyAvailable: boolean;
    secretKeyAvailable: boolean;
    webhookSecretAvailable: boolean;
  };
}

export function describeStripeConfigStatus(input: {
  publishableKey?: string | null;
  secretKey?: string | null;
  webhookSecret?: string | null;
}): StripeConfigStatus {
  const secret = classifyStripeKey(input.secretKey, 'secret');
  const publishable = classifyStripeKey(input.publishableKey, 'publishable');
  const webhookConfigured = hasWebhookSecret(input.webhookSecret);

  // 'unknown' is a key that is neither test nor live. It cannot be trusted to pair
  // with anything, so it counts as unusable rather than as a third mode — treating
  // it as a mode would let two unrecognisable strings "agree".
  const secretUsable = secret === 'test' || secret === 'live';
  const publishableUsable = publishable === 'test' || publishable === 'live';
  const modeMismatch = secretUsable && publishableUsable && secret !== publishable;

  return {
    configured: secretUsable && publishableUsable && !modeMismatch,
    mode: secret === 'live' ? 'live' : 'test',
    modeMismatch,
    webhookConfigured,
    keyStatus: {
      publishable,
      secret,
      webhook: webhookConfigured ? 'present' : 'missing',
    },
    availability: {
      // "Stored" is not "usable": a value that is neither pk_test_/pk_live_ nor
      // sk_test_/sk_live_ is present in the settings row and still cannot charge.
      publishableKeyAvailable: publishableUsable,
      secretKeyAvailable: secretUsable,
      webhookSecretAvailable: webhookConfigured,
    },
  };
}
