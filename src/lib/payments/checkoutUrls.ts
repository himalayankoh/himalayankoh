import { SITE_ORIGIN } from '@/lib/site/origin';

/**
 * Public site origin for Stripe return URLs.
 *
 * Uses the one resolved origin rather than a local copy: a second resolution
 * here could disagree with the canonical tags, which is precisely the class of
 * bug `@/lib/site/origin` was introduced to end.
 */
function siteOrigin(): string {
  return SITE_ORIGIN;
}

export function getStripeSuccessUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/checkout/success`;
  }
  const origin = siteOrigin();
  return origin ? `${origin}/checkout/success` : '/checkout/success';
}

export function getStripeCancelUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/checkout/cancel`;
  }
  const origin = siteOrigin();
  return origin ? `${origin}/checkout/cancel` : '/checkout/cancel';
}
