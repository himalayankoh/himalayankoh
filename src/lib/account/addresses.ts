/**
 * The browser's half of saved addresses.
 *
 * Same shape as the wishlist and cart clients: thin transport over routes that own
 * the authorisation. Note what these functions no longer take — a user id. The old
 * `addressesApi.getUserAddresses(userId)` was handed the signed-in user's Supabase
 * id and filtered Supabase rows by it, and once sign-in stopped minting that id
 * every one of those reads returned nothing and every write was orphaned. The
 * route derives the owner from the session instead, so there is no parameter a
 * caller could fill in with somebody else's id.
 *
 * The token is the **customer session** — minted after WordPress verified the
 * shopper's password, carrying their WooCommerce customer id
 * (`lib/auth/customerClient.ts`).
 */

import { getCustomerAccessToken } from '../auth/customerClient';
import type { AddressInput, SavedAddress } from './addressInput';

export type { AddressInput, SavedAddress };

function authorizedHeaders(): Record<string, string> {
  const token = getCustomerAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...authorizedHeaders(), ...(init?.headers ?? {}) },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || 'Your saved addresses could not be reached right now.');
  }
  return body;
}

export const addressesApi = {
  /** The customer's saved addresses, defaults first. */
  async getAddresses(): Promise<SavedAddress[]> {
    const body = await call<{ addresses: SavedAddress[] }>('/api/account/addresses');
    return body.addresses ?? [];
  },

  async createAddress(input: AddressInput): Promise<SavedAddress> {
    const body = await call<{ address: SavedAddress }>('/api/account/addresses', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return body.address;
  },

  async updateAddress(id: number, patch: Partial<AddressInput>): Promise<SavedAddress> {
    const body = await call<{ address: SavedAddress }>(`/api/account/addresses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return body.address;
  },

  /**
   * Makes one address the default for an axis.
   *
   * Expressed as a named operation even though it is a one-field patch, because
   * "set default" is what a customer asks for and the invariant it has to respect —
   * only one default per axis — belongs to the storage layer rather than to a
   * caller who might forget to clear the previous one.
   */
  async setDefaultAddress(id: number, kind: 'shipping' | 'billing' = 'shipping'): Promise<SavedAddress> {
    return addressesApi.updateAddress(
      id,
      kind === 'shipping' ? { is_default_shipping: true } : { is_default_billing: true }
    );
  },

  async deleteAddress(id: number): Promise<void> {
    await call<{ deleted: boolean }>(`/api/account/addresses/${id}`, { method: 'DELETE' });
  },
};
