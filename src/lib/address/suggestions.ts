import type { CheckoutShippingAddress } from '@/lib/shippo/types';

/**
 * Turns the address a shopper typed into a small set of standard US layouts that
 * a carrier can match.
 *
 * This exists because a carrier rejects `BLOCK DR 4027` with "multiple addresses
 * were found": the house number is at the end, which is not how a US address is
 * written, and the customer is left with an error instead of a correction. The
 * fix is not to loosen validation — it is to show the corrected address and let
 * the shopper accept it.
 */

const STREET_SUFFIXES: Record<string, string> = {
  ave: 'avenue',
  av: 'avenue',
  blvd: 'boulevard',
  cir: 'circle',
  ct: 'court',
  dr: 'drive',
  hwy: 'highway',
  ln: 'lane',
  pkwy: 'parkway',
  pl: 'place',
  rd: 'road',
  st: 'street',
  ter: 'terrace',
};

const UNIT_AT_END =
  /\s+(#\s*\S+|\b(?:apt|apartment|unit|ste|suite|fl|floor|rm|room)\b\.?\s*[\w-]+(?:\s*[\w-]+)?)$/i;

function clean(value: string | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

export interface NormalizedStreetLines {
  line1: string;
  line2?: string;
}

/**
 * Normalizes one US street line without inventing anything.
 *
 * Two corrections are safe enough to apply automatically as a *suggestion*:
 * a unit typed on line 1 is moved to line 2, and a house number typed after the
 * street name is moved in front of it. PO boxes are left alone because their
 * number is already in the right place.
 */
export function normalizeStreetLine(
  line1: string,
  line2: string | undefined,
  postalCode: string,
): NormalizedStreetLines {
  let first = clean(line1);
  let second = clean(line2);

  if (!first) {
    return { line1: '', line2: second || undefined };
  }

  // A unit belongs on line 2. If line 1 repeats one that line 2 already holds,
  // dropping the duplicate is still safer than letting it look like a house
  // number to the reversal below.
  const unit = first.match(UNIT_AT_END);
  if (unit) {
    if (!second) second = clean(unit[1]);
    first = first.slice(0, unit.index).trim();
  }

  if (!/^(?:p\.?\s*o\.?\s*box|rural route|rr|hc)\b/i.test(first)) {
    const reversed = first.match(/^(.+?)\s+(\d{2,6}[A-Za-z]?(?:-\d+)?)$/);
    const trailing = reversed?.[2];
    const zip = postalCode.replace(/-.*$/, '').trim();
    if (
      reversed &&
      trailing &&
      trailing !== zip &&
      /[A-Za-z]/.test(reversed[1]) &&
      reversed[1].trim().length > 0
    ) {
      first = `${trailing} ${reversed[1].trim()}`;
    }
  }

  return { line1: first, line2: second || undefined };
}

function expandSuffix(line: string): string {
  const parts = line.split(' ');
  if (parts.length < 2) return line;

  const raw = parts[parts.length - 1].replace(/[.,]/g, '');
  const suffix = STREET_SUFFIXES[raw.toLowerCase()];
  if (!suffix) return line;

  const upper = raw === raw.toUpperCase();
  parts[parts.length - 1] = upper
    ? suffix.toUpperCase()
    : suffix.charAt(0).toUpperCase() + suffix.slice(1);
  return parts.join(' ');
}

/**
 * Removes the duplicate unit Shippo can return in both street lines.
 *
 * Its response for `4027 Block Dr Apt 216` puts the unit in `street1` and again
 * in `street2`. Rendering both reads as "Apt 216 · Apt 216" and applying both
 * sends the same unit twice, so the unit stays on line 2 and comes out of line 1.
 */
export function tidySuggestedAddress(
  address: CheckoutShippingAddress,
): CheckoutShippingAddress {
  const line1 = clean(address.addressLine1);
  const line2 = clean(address.addressLine2);
  if (!line2) return address;

  const suffix = ` ${line2}`.toLowerCase();
  if (!line1.toLowerCase().endsWith(suffix)) return address;

  return {
    ...address,
    addressLine1: line1.slice(0, line1.length - suffix.length).trim(),
    addressLine2: line2,
  };
}

/** The identity used to avoid showing the same correction twice. */
export function addressKey(address: CheckoutShippingAddress): string {
  return [
    address.addressLine1,
    address.addressLine2 || '',
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .map((part) => clean(part).toLowerCase())
    .join('|');
}

/**
 * The original address plus the layouts worth asking the carrier about.
 *
 * The first variant is always the shopper's own address, so the caller can
 * compare the carrier's answer with what was typed. Later variants are only
 * validated as candidates; nothing is written back without the shopper's click.
 */
export function buildAddressVariants(address: CheckoutShippingAddress): CheckoutShippingAddress[] {
  const variants: CheckoutShippingAddress[] = [];
  const seen = new Set<string>();

  const add = (candidate: CheckoutShippingAddress) => {
    const key = addressKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(candidate);
  };

  add(address);

  const street = normalizeStreetLine(
    address.addressLine1,
    address.addressLine2,
    address.postalCode,
  );
  const normalized = {
    ...address,
    addressLine1: street.line1,
    addressLine2: street.line2,
  };
  add(normalized);
  add({ ...normalized, addressLine1: expandSuffix(normalized.addressLine1) });

  return variants;
}

export type AddressSuggestionKey =
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode';

export interface AddressSuggestionField {
  key: AddressSuggestionKey;
  label: string;
  current: string;
  suggested: string;
}

const FIELD_LABELS: Array<[AddressSuggestionKey, string]> = [
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['postalCode', 'ZIP code'],
];

/**
 * The fields where the suggested address differs from what is in the form.
 *
 * Comparisons are case-insensitive: a carrier returning `IRVING` for `Irving`
 * is not a correction worth asking the shopper to accept, while `75038` becoming
 * `75038-7733` is.
 */
export function addressSuggestionFields(
  current: CheckoutShippingAddress,
  suggested: CheckoutShippingAddress,
): AddressSuggestionField[] {
  return FIELD_LABELS.map(([key, label]) => ({
    key,
    label,
    current: clean(current[key]),
    suggested: clean(suggested[key]),
  })).filter(
    (field) =>
      field.suggested !== '' && field.current.toLowerCase() !== field.suggested.toLowerCase(),
  );
}
