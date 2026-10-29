/**
 * Wholesale shipping utilities: address parsing and carrier mode definitions.
 */

export type WholesaleShippingMode = 'PARCEL_USPS' | 'FREIGHT_LTL' | 'WAREHOUSE_PICKUP';

export interface ParsedShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface LiveCarrierRate {
  objectId: string;
  amount: number;
  currency: string;
  provider: string;
  serviceName: string;
  estimatedDays: number | null;
}

/**
 * Parses a free-text, multiline, or comma-separated shipping address into structured address
 * components compatible with Shippo API.
 */
export function parseShippingAddress(
  raw: string,
  fallbackName = 'Wholesale Buyer'
): ParsedShippingAddress | null {
  if (!raw || !raw.trim()) return null;

  // Normalize newlines to commas first
  const normalized = raw.replace(/\r?\n+/g, ', ');

  const parts = normalized
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  let country = 'US';
  let state = '';
  let zip = '';
  let city = '';
  let street = '';

  const remaining = [...parts];
  const last = remaining[remaining.length - 1];
  if (
    last.toLowerCase() === 'united states' ||
    last.toLowerCase() === 'usa' ||
    last.toLowerCase() === 'us'
  ) {
    country = 'US';
    remaining.pop();
  }

  const stateZip = remaining.pop() || '';
  const stateZipMatch = stateZip.match(/([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)/);
  if (stateZipMatch) {
    state = stateZipMatch[1].toUpperCase();
    zip = stateZipMatch[2];
  } else {
    state = (stateZip.match(/([A-Za-z]{2})/) || ['TX'])[0].toUpperCase();
    zip = (stateZip.match(/\d{5}/) || ['78701'])[0];
  }

  if (remaining.length > 0) {
    city = remaining.pop() || '';
  }
  street = remaining.join(', ');

  return {
    fullName: fallbackName || 'Wholesale Buyer',
    addressLine1: street || parts[0],
    city: city || 'Austin',
    state: state || 'TX',
    postalCode: zip || '78701',
    country,
  };
}
