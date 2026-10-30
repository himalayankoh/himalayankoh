/**
 * Saved addresses, as WordPress stores them.
 *
 * ## Where they had to go
 *
 * WooCommerce does hold a customer's addresses, but only the two slots that ship
 * an order — billing and shipping on the customer record. The account portal has
 * always shown a *list* to pick from, which WooCommerce has no place for, so the
 * list lives in our own plugin (`wordpress/himalayan-koh-storefront.php`,
 * table `hk_addresses`) beside the wishlist, and this module is the app's client
 * for it.
 *
 * ## Why they were broken, and what fixes that
 *
 * The Supabase rows were keyed by `user_id` — the Supabase auth id — while the
 * account portal now signs in with a **WooCommerce customer id**. Nothing wrote
 * or read the old key any more, so every address list came back empty and every
 * save was invisible. The key here is the customer id from the verified session
 * (`lib/auth/customerRequest.ts`), which is the same identity the wishlist and the
 * cart binding already use: one shopper, one customer, everywhere.
 *
 * ## Who trusts whom
 *
 * The plugin's routes are administrator-only, so the browser cannot reach them;
 * the app's own routes authorise the shopper and derive `customerId` from the
 * session. Passing the id explicitly here is therefore not a hole — it is the same
 * shape as the wishlist's `owner`, and it is the reason a customer id supplied by
 * a browser never gets this far.
 *
 * Server-only: authenticates with the administrator application password.
 */

import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import type { AddressInput, SavedAddress } from './addressInput';

const NAMESPACE = '/hk-storefront/v1';

export class AddressError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AddressError';
    this.status = status;
  }
}

/**
 * Turns a WordPress failure into the answer the customer should see.
 *
 * The three cases worth separating: the plugin is not active (nothing can work
 * until it is), the app credential was refused (an operator has to fix it), and
 * the plugin's own refusal (already a sentence written for the customer).
 * Everything else is reported as a plain failure rather than guessed at.
 */
function toAddressError(error: unknown, action: string): AddressError {
  if (error instanceof WordPressApiError) {
    const code = error.code ?? '';
    if (code === 'hk_storefront_address_incomplete') {
      return new AddressError(
        'An address needs a name, street, city, state, postal code and country.',
        400
      );
    }
    if (code === 'hk_storefront_address_missing') {
      return new AddressError('That address is not saved on this account.', 404);
    }
    if (code === 'hk_storefront_address_empty_update') {
      return new AddressError('No address fields were supplied.', 400);
    }
    if (code === 'hk_storefront_address_not_saved') {
      return new AddressError('The address could not be saved.', 500);
    }
    if (error.status === 404 || code === 'rest_no_route') {
      return new AddressError(
        'Saved addresses are not available yet: the Himalayan Koh storefront plugin is not active on WordPress (it provides hk-storefront/v1). Activate it, then try again.',
        503
      );
    }
    if (error.status === 401 || error.status === 403) {
      return new AddressError(
        'WordPress refused the app credential while reading saved addresses. Check WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD.',
        502
      );
    }
    return new AddressError(`Saved addresses could not be ${action}.`, error.status === 0 ? 503 : 502);
  }

  return new AddressError(
    `Saved addresses could not be ${action}: ${error instanceof Error ? error.message : String(error)}`,
    502
  );
}

interface RawAddressResponse {
  items?: SavedAddress[];
  address?: SavedAddress | null;
  deleted?: boolean;
}

function toRow(raw: unknown): SavedAddress | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const text = (key: string): string => (typeof row[key] === 'string' ? (row[key] as string) : '');
  const flag = (key: string): boolean => row[key] === true;

  return {
    id,
    label: text('label'),
    full_name: text('full_name'),
    phone: text('phone'),
    address_line1: text('address_line1'),
    address_line2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postal_code: text('postal_code'),
    country: text('country'),
    is_default_shipping: flag('is_default_shipping'),
    is_default_billing: flag('is_default_billing'),
    created_at: text('created_at'),
  };
}

/** Every address the customer saved, defaults first. */
export async function listAddresses(customerId: number): Promise<SavedAddress[]> {
  try {
    const response = await wordpressRequest<RawAddressResponse>(`${NAMESPACE}/addresses`, {
      params: { customerId },
      credentials: requireWordPressCredentials(),
      timeoutMs: 20_000,
    });
    return (response.items ?? []).flatMap((item) => {
      const row = toRow(item);
      return row ? [row] : [];
    });
  } catch (error) {
    throw toAddressError(error, 'read');
  }
}

/** Saves a new address and returns the stored row. */
export async function createAddress(
  customerId: number,
  input: AddressInput
): Promise<SavedAddress> {
  try {
    const response = await wordpressRequest<RawAddressResponse>(`${NAMESPACE}/addresses`, {
      method: 'POST',
      body: { customerId, ...input },
      credentials: requireWordPressCredentials(),
      timeoutMs: 20_000,
    });
    const row = toRow(response.address);
    if (!row) {
      throw new AddressError('The address was saved but WordPress returned no row.', 502);
    }
    return row;
  } catch (error) {
    throw toAddressError(error, 'saved');
  }
}

/**
 * Updates one address — a field, or the default flag.
 *
 * Marking a row default is what "set default address" means, and the plugin owns
 * the invariant (exactly one default per axis) so the browser never has to clear
 * the previous default itself.
 */
export async function updateAddress(
  customerId: number,
  addressId: number,
  patch: Partial<AddressInput>
): Promise<SavedAddress> {
  try {
    const response = await wordpressRequest<RawAddressResponse>(
      `${NAMESPACE}/addresses/${addressId}`,
      {
        method: 'PATCH',
        body: { customerId, ...patch },
        credentials: requireWordPressCredentials(),
        timeoutMs: 20_000,
      }
    );
    const row = toRow(response.address);
    if (!row) {
      throw new AddressError('The address was updated but WordPress returned no row.', 502);
    }
    return row;
  } catch (error) {
    throw toAddressError(error, 'updated');
  }
}

/** Removes one address. Returns false when nothing was saved under that id. */
export async function deleteAddress(customerId: number, addressId: number): Promise<boolean> {
  try {
    const response = await wordpressRequest<RawAddressResponse>(
      `${NAMESPACE}/addresses/${addressId}`,
      {
        method: 'DELETE',
        body: { customerId },
        credentials: requireWordPressCredentials(),
        timeoutMs: 20_000,
      }
    );
    return response.deleted === true;
  } catch (error) {
    throw toAddressError(error, 'removed');
  }
}
