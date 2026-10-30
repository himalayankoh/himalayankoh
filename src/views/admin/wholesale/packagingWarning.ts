// ============================================================================
// Packaging-safety warning — the net/gross guard
//
// Live owner data has every product with no packaging profile, so the engine
// falls back to DEFAULT_PACKAGING_PROFILE. Net weight is the products' own net
// unit weights summed; gross weight comes from the default carton; and the two
// disagree in a physically impossible way (net 20,412 kg > gross 2,925 kg).
//
// The console must never present that as a usable number. This module is the
// single decision point for the banner, so the three states it can return —
// impossible (error), fallback (warn), complete (none) — live in one place and
// are pinned by a unit test. It is deliberately React-free so it can be tested
// without a renderer.
// ============================================================================

export interface PackagingWarningLine {
  completeness: { status: 'COMPLETE' | 'NEEDS_REVIEW' | 'INCOMPLETE'; missingFields: string[] } | null | undefined;
  netWeightKg: number;
  grossWeightKg: number;
}

export interface PackagingWarning {
  severity: 'error' | 'warn';
  title: string;
  message: string;
}

/**
 * The visibility and severity of the packaging-safety warning for one loaded line.
 *
 * Pure — no React, no engine. Returns `null` when nothing must be shown, so the
 * caller can render nothing rather than a hidden banner.
 */
export function getPackagingWarning(line: PackagingWarningLine): PackagingWarning | null {
  if (!line || !line.completeness || line.completeness.status === 'COMPLETE') {
    return null;
  }

  if (line.netWeightKg > line.grossWeightKg) {
    return {
      severity: 'error',
      title: 'Net weight exceeds gross weight',
      message: 'Net weight exceeds gross weight because packaging data is incomplete. Do not use this calculation for a final quote.',
    };
  }

  return {
    severity: 'warn',
    title: 'Packaging data incomplete',
    message: "Default packaging is being used, so weight and pallet calculations may be inaccurate. Enter the factory's actual carton and pallet data before relying on this quote.",
  };
}
