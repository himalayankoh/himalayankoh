/**
 * The one place a product status crosses between the console and WooCommerce.
 *
 * Two vocabularies exist and they are not the same list, so translating between
 * them has to be deliberate:
 *
 *   console   active | draft | ready | inactive | archived | safety_hold
 *   Woo       publish | draft | pending | private
 *
 * The bug this module exists to prevent: the console used to collapse *every*
 * non-published state into one value on the way in and write it back as
 * WooCommerce `private` on the way out, so saving a product that was a `draft`
 * silently made it private. `draft` now reads as `draft` and writes as `draft`.
 *
 * Every fold is one-directional and listed below rather than left implicit.
 * Nothing here invents a WooCommerce state: a console word only ever maps to a
 * Woo status WooCommerce actually accepts.
 */

/** Product status as WooCommerce reports and accepts it (REST v3 `status`). */
export type WooListingStatus = 'publish' | 'draft' | 'pending' | 'private';

/** The console's listing vocabulary. Structurally identical to `CatalogStatus`. */
export type ConsoleProductStatus =
  | 'active'
  | 'draft'
  | 'ready'
  | 'inactive'
  | 'archived'
  | 'safety_hold';

/**
 * Console word → WooCommerce status.
 *
 * Folds, deliberate and documented:
 *   ready       → draft   `Ready` means "a draft that now passes the playbook".
 *                         WooCommerce has no such state, and it must not be
 *                         public, so the store keeps it as a draft and the
 *                         console re-derives readiness from the product itself.
 *   archived    → private WooCommerce has no archive state. `private` is its
 *                         "exists, not public" state, which is what archiving
 *                         means here. It reads back as `Inactive` — the truthful
 *                         label for `private`.
 *   safety_hold → draft   A held product is never public; draft is the store's
 *                         non-public, editable state.
 */
const WOO_BY_CONSOLE: Record<ConsoleProductStatus, WooListingStatus> = {
  active: 'publish',
  draft: 'draft',
  ready: 'draft',
  inactive: 'private',
  archived: 'private',
  safety_hold: 'draft',
};

/** WooCommerce status → console word. Lossless for the three primary states. */
const CONSOLE_BY_WOO: Record<WooListingStatus, ConsoleProductStatus> = {
  publish: 'active',
  draft: 'draft',
  // `pending` is WooCommerce's "submitted, not yet published" — a draft here.
  pending: 'draft',
  private: 'inactive',
};

function isWooListingStatus(value: string): value is WooListingStatus {
  return value === 'publish' || value === 'draft' || value === 'pending' || value === 'private';
}

/**
 * A status a caller wants stored → the WooCommerce status to send.
 *
 * Accepts either vocabulary, so the API boundary can pass a browser payload
 * through without knowing which one the caller used, and returns `null` for a
 * value that is neither — a caller must refuse that rather than guess, because
 * guessing is how a typo turns into a private product.
 */
export function wooListingStatusFrom(value: unknown): WooListingStatus | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (isWooListingStatus(raw)) return raw;
  return WOO_BY_CONSOLE[raw as ConsoleProductStatus] ?? null;
}

/** Convenience for trusted internal callers: an unknown word is a draft. */
export function wooListingStatusOrDraft(value: unknown): WooListingStatus {
  return wooListingStatusFrom(value) ?? 'draft';
}

/**
 * A WooCommerce status → the console's word.
 *
 * Anything the store reports that is not a listing state the editor offers
 * (`trash`, `future`, `inherit`, a status a plugin registered) reads as `draft`:
 * it is not public, and draft is the honest non-public editing state.
 */
export function consoleStatusFromWoo(value: unknown): ConsoleProductStatus {
  const raw = String(value ?? '').trim();
  return isWooListingStatus(raw) ? CONSOLE_BY_WOO[raw] : 'draft';
}

/** True when a WooCommerce status is visible on the storefront. */
export function isPublicWooStatus(value: unknown): boolean {
  return consoleStatusFromWoo(value) === 'active';
}

/**
 * Reads the `status` field of an admin write body.
 *
 * The console sends its own word (`active`, `draft`, …) and the store accepts
 * only its own (`publish`, `draft`, …). Translating at this boundary means a
 * browser payload can never reach WooCommerce as `active` — which WooCommerce
 * rejects with `rest_invalid_param` after the save has already been reported as
 * a success. An unrecognised word is refused with a 400 instead of guessed at.
 */
export function readProductStatusField(
  body: Record<string, unknown>
): { ok: true; value?: WooListingStatus } | { ok: false; error: string } {
  if (!('status' in body) || body.status === undefined) return { ok: true };
  const woo = wooListingStatusFrom(body.status);
  if (woo) return { ok: true, value: woo };
  return {
    ok: false,
    error: `Unknown product status "${String(body.status)}". Supported: active, draft, ready, inactive, archived, safety_hold.`,
  };
}
