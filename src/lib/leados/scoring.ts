import type { NormalizedLead, OpportunityScoreResult } from './types';

export const DEFAULT_SCORE_WEIGHTS: Record<string, { weight: number; name: string }> = {
  website: { weight: 35, name: 'Website present (reachability)' },
  phone: { weight: 35, name: 'Phone present (reachability)' },
  email: { weight: 30, name: 'Email present (reachability)' },
  provider_identity: { weight: 20, name: 'Provider record identity (confidence)' },
  address: { weight: 10, name: 'Address present (confidence)' },
};

export interface LeadEvidenceScores {
  icpFit: number;
  reachability: number;
  dataConfidence: number;
  commercialPriority: number;
  reasons: string[];
}

function has(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * Calculates only from observed lead facts and an independently calculated ICP
 * fit. Missing contact data lowers reachability; it never creates opportunity.
 */
export function calculateLeadEvidence(
  lead: NormalizedLead,
  icpFit = 0,
): LeadEvidenceScores {
  const reachability = Math.round(
    (has(lead.website) ? 35 : 0) +
    (has(lead.phone) ? 35 : 0) +
    (has(lead.email) ? 30 : 0),
  );
  const dataConfidence = Math.round(
    (has(lead.dataSource) ? 40 : 0) +
    (has(lead.osmType) && has(lead.osmId) ? 35 : 0) +
    (has(lead.address) || (lead.latitude !== null && lead.longitude !== null) ? 25 : 0),
  );
  const boundedIcpFit = Math.max(0, Math.min(100, Math.round(icpFit)));
  const commercialPriority = Math.round(
    boundedIcpFit * 0.6 + reachability * 0.25 + dataConfidence * 0.15,
  );
  const reasons: string[] = [];
  if (boundedIcpFit > 0) reasons.push(`ICP fit: ${boundedIcpFit}/100 based on category and target geography.`);
  if (has(lead.website)) reasons.push('Website observed.');
  else reasons.push('No website observed; reachability is reduced.');
  if (has(lead.phone)) reasons.push('Phone observed.');
  else reasons.push('No phone observed; reachability is reduced.');
  if (has(lead.email)) reasons.push(`Email observed${lead.emailSource ? ` (${lead.emailSource})` : ''}.`);
  else reasons.push('No email observed; reachability is reduced.');
  if (has(lead.osmType) && has(lead.osmId)) reasons.push(`Provider identity: ${lead.osmType}/${lead.osmId}.`);
  else reasons.push('Provider identity is unavailable; confidence is reduced.');

  return {
    icpFit: boundedIcpFit,
    reachability,
    dataConfidence,
    commercialPriority: Math.max(0, Math.min(100, commercialPriority)),
    reasons,
  };
}

/** Compatibility wrapper for existing callers. The old ambiguous score now
 * means transparent commercial priority, not a data-deficiency opportunity. */
export function calculateOpportunityScore(
  lead: NormalizedLead,
  _customWeights?: Record<string, { weight: number; name: string }>,
  icpFit = 0,
): OpportunityScoreResult {
  const evidence = calculateLeadEvidence(lead, icpFit);
  return {
    score: evidence.commercialPriority,
    signals: evidence.reasons,
    ...evidence,
  };
}
