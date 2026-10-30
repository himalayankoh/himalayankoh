/**
 * A saved address: its shape, and what makes one complete.
 *
 * Pure — no database, no network, no WordPress. Both the API route and the
 * browser client use it, so the length limits and the required-field rule live in
 * exactly one place instead of being restated (and drifting) on each side.
 *
 * The column names match the WordPress table one for one
 * (`hk_addresses` in `wordpress/himalayan-koh-storefront.php`), because the row
 * travels through three systems — browser, our API, the plugin — and a rename in
 * the middle would be a rename in the middle of a payload.
 *
 * These rows used to live in Supabase, keyed by the Supabase user id. That key no
 * longer identifies anybody: customer sign-in mints a **WooCommerce customer id**
 * (`lib/auth/customerSession.ts`), which is what the wishlist's `owner` and the
 * cart binding already use. The customer id is therefore never part of this
 * shape: the routes derive it from the session, and a browser-supplied id would be
 * an id a browser could forge.
 */

/** The text columns, in the order the table stores them. */
export const ADDRESS_TEXT_FIELDS = [
  'label',
  'full_name',
  'phone',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
] as const;

export type AddressTextField = (typeof ADDRESS_TEXT_FIELDS)[number];

/** Per-column caps, matching the schema — a longer value is truncated, not stored. */
export const ADDRESS_LIMITS: Record<AddressTextField, number> = {
  label: 191,
  full_name: 191,
  phone: 64,
  address_line1: 191,
  address_line2: 191,
  city: 191,
  state: 191,
  postal_code: 32,
  country: 64,
};

/** An address is meaningless without these; the rest are optional detail. */
export const ADDRESS_REQUIRED_FIELDS: readonly AddressTextField[] = [
  'full_name',
  'address_line1',
  'city',
  'state',
  'postal_code',
  'country',
];

/** What a caller may send to save an address. */
export interface AddressInput {
  label?: string;
  full_name: string;
  phone?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
}

/** What the account portal renders, as WordPress returns it. */
export interface SavedAddress extends AddressInput {
  id: number;
  is_default_shipping: boolean;
  is_default_billing: boolean;
  created_at: string;
}

export type AddressInputResult =
  | { ok: true; value: AddressInput }
  | { ok: false; error: string };

const INCOMPLETE =
  'An address needs a name, street, city, state, postal code and country.';

/**
 * Validates one address payload.
 *
 * Trims and caps text rather than rejecting it, so a long address line is stored
 * as much of itself as the column holds instead of failing the customer's save —
 * and reports *which* requirement is missing rather than a generic refusal, since
 * the form has one field per requirement and the message has to name the right one.
 */
export function readAddressInput(raw: unknown): AddressInputResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'An address is required.' };
  }
  const record = raw as Record<string, unknown>;

  const text = (field: AddressTextField): string =>
    typeof record[field] === 'string'
      ? (record[field] as string).trim().slice(0, ADDRESS_LIMITS[field])
      : '';

  const missing = ADDRESS_REQUIRED_FIELDS.filter((field) => text(field) === '');
  if (missing.length) return { ok: false, error: INCOMPLETE };

  const value: AddressInput = {
    full_name: text('full_name'),
    address_line1: text('address_line1'),
    city: text('city'),
    state: text('state'),
    postal_code: text('postal_code'),
    country: text('country'),
  };

  if (text('label')) value.label = text('label');
  if (text('phone')) value.phone = text('phone');
  if (text('address_line2')) value.address_line2 = text('address_line2');
  if (record.is_default_shipping === true) value.is_default_shipping = true;
  if (record.is_default_billing === true) value.is_default_billing = true;

  return { ok: true, value };
}

export type AddressPatchResult =
  | { ok: true; value: Partial<AddressInput> }
  | { ok: false; error: string };

/**
 * Validates a partial address — one field, or a new default.
 *
 * A patch must name at least one field, because an empty patch is a request that
 * silently succeeded at nothing, and it may not blank a required field: clearing
 * `city` on a saved address would leave the customer a row that checkout cannot
 * use.
 */
export function readAddressPatch(raw: unknown): AddressPatchResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'An address update is required.' };
  }
  const record = raw as Record<string, unknown>;
  const value: Partial<AddressInput> = {};

  for (const field of ADDRESS_TEXT_FIELDS) {
    if (record[field] === undefined) continue;
    if (typeof record[field] !== 'string') continue;
    const text = (record[field] as string).trim().slice(0, ADDRESS_LIMITS[field]);
    if (text === '' && ADDRESS_REQUIRED_FIELDS.includes(field)) {
      return { ok: false, error: INCOMPLETE };
    }
    value[field] = text;
  }

  if (record.is_default_shipping === true || record.is_default_shipping === false) {
    value.is_default_shipping = record.is_default_shipping;
  }
  if (record.is_default_billing === true || record.is_default_billing === false) {
    value.is_default_billing = record.is_default_billing;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'No address fields were supplied.' };
  }

  return { ok: true, value };
}
