export type ClaimStatus = 'verified' | 'owner_approved' | 'unverified' | 'disabled';

export interface LeadOSClaim {
  key: string;
  text: string;
  status: ClaimStatus;
  source: string | null;
  allowedInOutbound: boolean;
}

/** Claims are deliberately conservative until an owner supplies evidence. */
export const LEADOS_CLAIMS: LeadOSClaim[] = [
  { key: 'himalayan_salt_products', text: 'Himalayan salt products', status: 'verified', source: 'catalog', allowedInOutbound: true },
  { key: 'b2b_wholesale_inquiry', text: 'B2B wholesale inquiry', status: 'verified', source: 'business purpose', allowedInOutbound: true },
  { key: 'natural', text: '100% natural', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'essential_minerals', text: '84+ essential trace minerals', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'lab_tested', text: 'Third-party laboratory tested', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'direct_import', text: 'Direct import', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'direct_importer', text: 'Direct importer', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'direct_factory_inventory', text: 'Direct factory inventory', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'food_grade', text: 'Food-grade', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'food_grade_spaced', text: 'Food grade', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'gs1_ready', text: 'GS1 barcode readiness', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'fast_shipping', text: 'Fast shipping', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'warehouse_origin', text: 'Packed or shipped from Houston', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'purity', text: 'Purity/compliance claim', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'certified', text: 'Certified', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'health_benefits', text: 'Health benefits', status: 'unverified', source: null, allowedInOutbound: false },
  { key: 'fda', text: 'FDA/certification claim', status: 'disabled', source: null, allowedInOutbound: false },
];

export function findUnsupportedOutboundClaims(text: string): string[] {
  return LEADOS_CLAIMS
    .filter((claim) => !claim.allowedInOutbound)
    .filter((claim) => new RegExp(claim.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text))
    .map((claim) => claim.key);
}

export function validateOutboundCopy(text: string): { ok: true } | { ok: false; claims: string[] } {
  const claims = findUnsupportedOutboundClaims(text);
  return claims.length ? { ok: false, claims } : { ok: true };
}
