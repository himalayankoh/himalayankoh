import type { CheckoutShippingAddress } from './types';

/**
 * Reads the address shape the checkout posts to the Shippo routes.
 *
 * One parser for validation and suggestions: two copies would drift, and a field
 * one route accepts but the other silently drops is a suggestion that can never
 * be applied.
 */
export function parseCheckoutAddress(
  body: Record<string, unknown>,
): CheckoutShippingAddress | null {
  const address = body.address as Record<string, unknown> | undefined;
  if (!address) return null;

  const fullName = typeof address.fullName === 'string' ? address.fullName.trim() : '';
  const addressLine1 = typeof address.addressLine1 === 'string' ? address.addressLine1.trim() : '';
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const state = typeof address.state === 'string' ? address.state.trim() : '';
  const postalCode = typeof address.postalCode === 'string' ? address.postalCode.trim() : '';
  const country =
    typeof address.country === 'string' ? address.country.trim() : 'United States';

  if (!fullName || !addressLine1 || !city || !state || !postalCode) {
    return null;
  }

  return {
    fullName,
    addressLine1,
    addressLine2:
      typeof address.addressLine2 === 'string' ? address.addressLine2.trim() : undefined,
    city,
    state,
    postalCode,
    country,
  };
}
