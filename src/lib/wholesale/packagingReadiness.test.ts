// ============================================================================
// Packaging readiness — the owner's worklist contract
//
// The worklist tells the owner exactly which fields are still blank, and the same
// function drives the per-row pill and the live check inside the editor. If it
// drifts from the engine's completeness check, the console shows one story and the
// calculator another — so both directions are pinned here: a fresh product must
// name every required field, a measured product must name none, and a partly filled
// one must name exactly what is left.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { packagingReadiness, UNIT_DIMENSION_KEYS } from './packagingReadiness';
import { PACKAGING_FIELDS, PACKAGING_LABELS } from './packagingFields';

/**
 * Every measured field. The three optional enrichments (`maxPalletGrossWeightKg`,
 * `cartonsPerLayer`, `layers`) are included but never required — a profile is
 * complete without them.
 */
const MEASURED: Record<string, number> = {
  cartonQty: 6,
  packagedUnitWeightKg: 12.5,
  cartonLengthCm: 41,
  cartonWidthCm: 31,
  cartonHeightCm: 25,
  cartonGrossWeightKg: 12.1,
  palletLengthCm: 122,
  palletWidthCm: 102,
  maxStackHeightCm: 182,
  palletDeckHeightCm: 15,
  palletTareKg: 22,
  unitLengthCm: 30,
  unitWidthCm: 20,
  unitHeightCm: 12,
};

const OPTIONAL_KEYS = ['maxPalletGrossWeightKg', 'cartonsPerLayer', 'layers'];
/** The fields a product must have to be Complete, in the form's order. */
const REQUIRED_KEYS = PACKAGING_FIELDS.map((field) => field.key).filter(
  (key) => !OPTIONAL_KEYS.includes(key)
);

describe('packagingReadiness', () => {
  it('a product with nothing entered is INCOMPLETE and names every required field', () => {
    const readiness = packagingReadiness({});
    expect(readiness.status).toBe('INCOMPLETE');
    expect(readiness.missingKeys).toEqual(REQUIRED_KEYS);
    // The optional enrichments are absent but must not be reported as missing.
    for (const key of OPTIONAL_KEYS) {
      expect(readiness.missingKeys).not.toContain(key);
    }
    // Every named field has a human label, so the owner never sees a raw key.
    for (const key of readiness.missingKeys) {
      expect(readiness.missingLabels).toContain(PACKAGING_LABELS[key]);
    }
  });

  it('treats unset and unparseable records the same as blank', () => {
    expect(packagingReadiness(null).missingKeys).toEqual(REQUIRED_KEYS);
    expect(packagingReadiness('not a record').missingKeys).toEqual(REQUIRED_KEYS);
  });

  it('a fully measured product is COMPLETE with nothing left to name', () => {
    const readiness = packagingReadiness({ ...MEASURED });
    expect(readiness.status).toBe('COMPLETE');
    expect(readiness.missingKeys).toEqual([]);
    expect(readiness.missingFields).toEqual([]);
    expect(readiness.missingLabels).toEqual([]);
  });

  it('a partly filled product is NEEDS_REVIEW and names exactly what is left', () => {
    const { maxStackHeightCm, ...rest } = MEASURED;
    const readiness = packagingReadiness(rest);
    expect(readiness.status).toBe('NEEDS_REVIEW');
    expect(readiness.missingKeys).toEqual(['maxStackHeightCm']);
    expect(readiness.missingLabels).toEqual([PACKAGING_LABELS.maxStackHeightCm]);
    // The engine's own vocabulary still counts it against completeness.
    expect(readiness.missingFields).toContain('Max Stack Height');
    expect(maxStackHeightCm).toBeGreaterThan(0);
  });

  it('names the unit dimensions even when every defaulted field is set', () => {
    const coreOnly = Object.fromEntries(
      Object.entries(MEASURED).filter(([key]) => !UNIT_DIMENSION_KEYS.includes(key))
    );
    const readiness = packagingReadiness(coreOnly);
    expect(readiness.missingKeys).toEqual([...UNIT_DIMENSION_KEYS]);
    expect(readiness.status).toBe('NEEDS_REVIEW');
  });

  it('reads the values currently in the form the same way it reads a saved record', () => {
    // The live check passes form state, where every box is a string.
    const asTyped = Object.fromEntries(
      Object.entries(MEASURED).map(([key, value]) => [key, String(value)])
    );
    const readiness = packagingReadiness(asTyped);
    expect(readiness.status).toBe('COMPLETE');
    expect(readiness.missingKeys).toEqual([]);
  });
});
