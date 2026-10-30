import type { NormalizedLead, ProjectFitResult, LeadOSProject } from './types';

function includesAny(haystack: string | null | undefined, needles: string[]): boolean {
  if (!haystack) return false;
  const h = haystack.toLowerCase();
  return needles.some((n) => n && h.includes(n.toLowerCase()));
}

/**
 * Deterministic Project Fit scoring based on the Project's configured ICP.
 * Completely deterministic — same inputs always yield the exact same score.
 * AI can supplement this, but this baseline is authoritative and never breaks.
 */
export function calculateDeterministicProjectFit(
  lead: NormalizedLead,
  project: LeadOSProject
): ProjectFitResult {
  let score = 0;
  const reasons: string[] = [];

  const businessCategories = (project.businessCategories || []).map((c) => c.toLowerCase());
  const industries = (project.industries || []).map((i) => i.toLowerCase());
  const preferredLocations = (project.preferredLocations || []).map((l) => l.toLowerCase());
  const countries = (project.countries || []).map((c) => c.toLowerCase());
  const positiveKeywords = (project.positiveKeywords || []).map((k) => k.toLowerCase());
  const negativeKeywords = (project.negativeKeywords || []).map((k) => k.toLowerCase());

  const leadCategory = (lead.category || '').toLowerCase();
  const leadName = (lead.businessName || '').toLowerCase();
  const leadLocation = [lead.city, lead.region, lead.country].filter(Boolean).join(' ').toLowerCase();

  // 1. Category match (strongest signal)
  if (businessCategories.length > 0 && businessCategories.some((c) => leadCategory === c)) {
    score += 40;
    reasons.push(`Direct category match: "${lead.category}" aligns with target ICP categories.`);
  } else if (
    businessCategories.length > 0 &&
    businessCategories.some((c) => leadCategory.includes(c) || c.includes(leadCategory))
  ) {
    score += 25;
    reasons.push(`Related category match: "${lead.category}" matches target niche.`);
  }

  // 2. Geographic match
  if (preferredLocations.length > 0 && preferredLocations.some((l) => leadLocation.includes(l))) {
    score += 20;
    reasons.push(`Geographic target: Located in key target region (${lead.region || lead.city || 'target state'}).`);
  } else if (countries.length > 0 && countries.some((c) => leadLocation.includes(c))) {
    score += 15;
    reasons.push(`Geographic target: Located in primary target country (${lead.country || 'US'}).`);
  }

  // 3. Keyword positive signals
  if (
    positiveKeywords.length > 0 &&
    (includesAny(leadName, positiveKeywords) || includesAny(leadCategory, positiveKeywords))
  ) {
    score += 20;
    reasons.push('Positive keyword match: Business name or profile mentions target keywords.');
  }

  // 4. Negative keyword penalties
  if (
    negativeKeywords.length > 0 &&
    (includesAny(leadName, negativeKeywords) || includesAny(leadCategory, negativeKeywords))
  ) {
    score -= 30;
    reasons.push('Negative keyword exclusion: Matches non-target industry criteria.');
  }

  // 5. Baseline for configured ICP
  if (project.idealCustomerProfile) {
    score += 10;
    if (reasons.length === 0) {
      reasons.push('Baseline profile match evaluated against ICP.');
    }
  }

  // Concrete outreach angles grounded in project product and lead data
  const outreachAngles: string[] = [];
  const product = project.productService || project.name;
  const targetDesc = project.targetCustomerDescription;

  if (targetDesc) {
    outreachAngles.push(`Potential ${targetDesc.replace(/^for /i, '')}.`);
  }
  if (product) {
    outreachAngles.push(`Wholesale supplier candidate for ${product}.`);
  }
  if (industries.length > 0 && industries.some((i) => leadCategory.includes(i) || i.includes(leadCategory))) {
    outreachAngles.push('Strategic distributor in key agricultural / retail sector.');
  }
  if (lead.website) {
    outreachAngles.push('Active online storefront / presence — suitable for digital inquiry.');
  } else {
    outreachAngles.push('Direct telephone or physical mail outreach recommended.');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasons: reasons.length > 0 ? reasons : ['General prospect — evaluated against active project profile.'],
    outreachAngles,
    method: 'deterministic',
  };
}
