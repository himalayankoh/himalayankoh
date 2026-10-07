/**
 * Packaging readiness — what is still missing from one product's packaging record.
 *
 * ## Why this is separate from the panel
 *
 * The owner-facing worklist, the per-row status pill and the live check inside the
 * editor must all answer the same question, and the answer must not depend on which
 * one is asking. Keeping the computation here (React-free) means a unit test can pin
 * it, and the console cannot drift from the engine.
 *
 * ## Where the answer comes from
 *
 * `packagingFromJson` fills a documented default behind every core field, and names
 * each field it had to fill in `defaultsUsed`. That list is the only honest source for
 * "the owner has not entered this" — the defaulted profile alone looks almost complete.
 * `packagingCompleteness` then derives the status from the same facts, so the worklist
 * and the calculator's completeness warning can never disagree.
 */

import { packagingFromJson } from './mapping';
import { packagingCompleteness } from './engine';
import { PACKAGING_FIELDS, PACKAGING_LABELS, UNIT_DIMENSION_KEYS } from './packagingFields';

export { UNIT_DIMENSION_KEYS };

export interface PackagingReadiness {
  status: 'COMPLETE' | 'NEEDS_REVIEW' | 'INCOMPLETE';
  /** The engine's grouped reasons, in its own vocabulary. */
  missingFields: string[];
  /** The exact fields still blank, in the order the form shows them. */
  missingKeys: string[];
  /** The same fields as the labels the form shows, so a message can name them directly. */
  missingLabels: string[];
}

/** A unit dimension counts as missing until it holds a positive measurement. */
function hasPositiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Reads either the stored blob or the values currently in the form — they are the same
 * shape, so a live check and a saved check cannot disagree.
 */
export function packagingReadiness(raw: unknown): PackagingReadiness {
  const { profile, defaultsUsed } = packagingFromJson(raw);
  const { status, missingFields } = packagingCompleteness(profile, defaultsUsed);
  const values = profile as unknown as Record<string, unknown>;

  // Walk the form's own field list so the order the owner reads here matches the order
  // they fill it in: a field on a documented default, plus the unit dimensions that have
  // no default and are simply still blank.
  const missingKeys = PACKAGING_FIELDS.filter((field) => {
    if (defaultsUsed.includes(field.key)) return true;
    return UNIT_DIMENSION_KEYS.includes(field.key) && !hasPositiveNumber(values[field.key]);
  }).map((field) => field.key);

  return {
    status,
    missingFields,
    missingKeys,
    missingLabels: missingKeys.map((key) => PACKAGING_LABELS[key] ?? key),
  };
}
