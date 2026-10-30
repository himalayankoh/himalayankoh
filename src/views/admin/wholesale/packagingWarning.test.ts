// ============================================================================
// Packaging-safety warning — the net/gross guard
//
// Live owner data has every product with no packaging profile, so the engine
// falls back to DEFAULT_PACKAGING_PROFILE. Net weight is the products' own net
// unit weights summed, gross weight comes from the default carton, and the two
// disagree in a physically impossible way (net 20,412 kg > gross 2,925 kg).
//
// The console must never present that as a usable number. `getPackagingWarning`
// is the single decision point for the banner, so the three states it can
// return are pinned here: impossible (error), fallback (warn), complete (none).
// ============================================================================
import { describe, expect, it } from 'vitest';
import { getPackagingWarning } from './packagingWarning';

const complete = { status: 'COMPLETE' as const, missingFields: [] as string[] };
const incomplete = { status: 'INCOMPLETE' as const, missingFields: ['cartonLengthCm', 'cartonGrossWeightKg'] };
const needsReview = { status: 'NEEDS_REVIEW' as const, missingFields: ['unitLengthCm'] };

describe('getPackagingWarning', () => {
  it('flags net > gross as an error that must not be quoted', () => {
    const warning = getPackagingWarning({ completeness: incomplete, netWeightKg: 20412, grossWeightKg: 2925 });
    expect(warning?.severity).toBe('error');
    expect(warning?.title).toContain('Net weight exceeds gross weight');
    expect(warning?.message).toContain('Net weight exceeds gross weight');
    expect(warning?.message.toLowerCase()).toContain('do not use this calculation');
  });

  it('warns whenever packaging is incomplete, even when net <= gross', () => {
    const warning = getPackagingWarning({ completeness: incomplete, netWeightKg: 900, grossWeightKg: 1200 });
    expect(warning?.severity).toBe('warn');
    expect(warning?.title).toContain('Packaging data incomplete');
    expect(warning?.message).toContain("factory's actual carton and pallet data");
  });

  it('warns on NEEDS_REVIEW too, without escalating to an error', () => {
    const warning = getPackagingWarning({ completeness: needsReview, netWeightKg: 400, grossWeightKg: 500 });
    expect(warning?.severity).toBe('warn');
  });

  it('never warns when packaging is complete', () => {
    expect(getPackagingWarning({ completeness: complete, netWeightKg: 20412, grossWeightKg: 2925 })).toBeNull();
    expect(getPackagingWarning({ completeness: complete, netWeightKg: 400, grossWeightKg: 500 })).toBeNull();
  });

  it('stays silent when the engine reported no completeness block at all', () => {
    expect(getPackagingWarning({ completeness: null, netWeightKg: 20412, grossWeightKg: 2925 })).toBeNull();
    expect(getPackagingWarning({ completeness: undefined, netWeightKg: 20412, grossWeightKg: 2925 })).toBeNull();
  });
});
