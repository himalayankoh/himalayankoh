/**
 * Whether a buyer may accept the quotation in front of them.
 *
 * ## Why this is a pure function and not four `if`s in a route
 *
 * "Can this be accepted?" is the one decision in the portal that commits the buyer's
 * money, and it has more cases than it looks: not priced yet, priced, already accepted,
 * expired by date while still stored as QUOTED (the case that quietly matters — nobody
 * flips a status when a validity date passes), withdrawn, or a draft that is ours and
 * not theirs. Rules like that drift when they live in a handler, and a drifted rule is
 * a price accepted after it expired. So the decision lives here, is total, and every
 * branch is pinned by a test.
 *
 * ## Expiry is derived, never trusted to the row
 *
 * A stored `QUOTED` row whose `valid_until` has passed is *expired*, and this is where
 * that is decided. The clock is a parameter, so the same function answers the same way
 * in a test as it does in the request.
 *
 * Pure and isomorphic: reads a stored row, returns a verdict, touches nothing.
 */

import { isQuoteExpired } from './quoteLifecycle';

export interface AcceptanceVerdict {
  ok: boolean;
  /** HTTP status the route should answer with when `ok` is false. */
  status: number;
  /** A stable machine code, for a screen that wants to branch rather than parse prose. */
  code: 'accepted' | 'expired' | 'already_accepted' | 'not_priced' | 'not_acceptable';
  /** The buyer-facing sentence. Written for a buyer, not for a log. */
  message: string;
}

/** Statuses in which the buyer has already committed, or we have moved past them. */
const ALREADY_DONE = new Set(['ACCEPTED', 'CONVERTED_TO_ORDER']);
/** Statuses that legitimately precede a quotation. */
const NOT_PRICED = new Set(['SUBMITTED', 'UNDER_REVIEW']);

/**
 * The verdict for one stored quote row, as the buyer may see it.
 *
 * `row` is the quote the caller has already established belongs to this buyer — this
 * function never widens access, it only decides whether the state allows acceptance.
 */
export function buyerAcceptance(
  row: Record<string, unknown> | null | undefined,
  now: Date = new Date()
): AcceptanceVerdict {
  const status = String((row && row.status) ?? '').toUpperCase();

  if (status === 'QUOTED') {
    // Expiry wins over the stored status: a quotation past its date is not acceptable
    // merely because nobody changed a field.
    if (isQuoteExpired((row && (row.valid_until as string | null)) ?? null, now)) {
      return {
        ok: false,
        status: 409,
        code: 'expired',
        message: 'This quotation has expired. Ask your account manager for a current price.',
      };
    }
    return { ok: true, status: 200, code: 'accepted', message: 'Quotation accepted.' };
  }

  if (ALREADY_DONE.has(status)) {
    return {
      ok: false,
      status: 409,
      code: 'already_accepted',
      message: 'You have already accepted this quotation.',
    };
  }

  if (NOT_PRICED.has(status)) {
    return {
      ok: false,
      status: 409,
      code: 'not_priced',
      message: 'This request has not been priced yet. We will email you when the quotation is ready.',
    };
  }

  // DRAFT (our working paper), REJECTED, EXPIRED, SUSPENDED, and anything unknown.
  return {
    ok: false,
    status: 409,
    code: 'not_acceptable',
    message: 'This quotation cannot be accepted in its current state. Contact your account manager.',
  };
}
