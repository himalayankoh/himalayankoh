import { describe, it, expect } from 'vitest';
import { calculateOpportunityScore, calculateLeadEvidence, DEFAULT_SCORE_WEIGHTS } from './scoring';
import { calculateDeterministicProjectFit } from './project-fit';
import { resolveOsmTags } from './osm-provider';
import { HK_DEFAULT_PROJECT } from './db';
import { validateOutboundCopy, LEADOS_CLAIMS } from './claims';
import type { NormalizedLead } from './types';

describe('LeadOS scoring, evidence, and project fit', () => {
  const sampleLead: NormalizedLead = {
    businessName: 'Lone Star Farm & Feed Supply',
    category: 'Feed Store',
    address: '100 County Road 42',
    city: 'Houston',
    region: 'Texas',
    country: 'United States',
    website: null,
    phone: '713-555-0199',
    email: null,
    latitude: 29.7604,
    longitude: -95.3698,
    osmType: 'node',
    osmId: '12345678',
    osmUrl: 'https://www.openstreetmap.org/node/12345678',
    dataSource: 'openstreetmap',
  };

  it('does not reward missing contact data', () => {
    const missing = calculateLeadEvidence(sampleLead, 80);
    const complete = calculateLeadEvidence({ ...sampleLead, website: 'https://example.com', email: 'sales@example.com' }, 80);
    expect(missing.reachability).toBeLessThan(complete.reachability);
    expect(missing.commercialPriority).toBeLessThan(complete.commercialPriority);
    expect(missing.reasons.join(' ')).toContain('No email observed');
  });

  it('returns explainable compatibility priority and positive contact weights', () => {
    const result = calculateOpportunityScore(sampleLead, undefined, 80);
    expect(result.score).toBe(result.commercialPriority);
    expect(DEFAULT_SCORE_WEIGHTS.email.weight).toBeGreaterThan(0);
    expect(result.signals.some((signal) => signal.includes('reduced'))).toBe(true);
  });

  it('blocks unverified outbound claims', () => {
    expect(validateOutboundCopy('We offer Himalayan salt products.').ok).toBe(true);
    const blocked = validateOutboundCopy('Our products are 84+ essential trace minerals and third-party laboratory tested.');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.claims).toContain('essential_minerals');
    expect(LEADOS_CLAIMS.filter((claim) => !claim.allowedInOutbound).length).toBeGreaterThan(0);
  });

  it('evaluates strong project fit for Himalayan Koh B2B Salt ICP', () => {
    const fit = calculateDeterministicProjectFit(sampleLead, HK_DEFAULT_PROJECT);
    expect(fit.score).toBeGreaterThanOrEqual(80);
    expect(fit.reasons.length).toBeGreaterThan(0);
    expect(fit.outreachAngles.length).toBeGreaterThan(0);
    expect(fit.method).toBe('deterministic');
  });

  it('applies negative keyword penalties for non-target businesses', () => {
    const irrelevantLead: NormalizedLead = { ...sampleLead, businessName: 'Express Fast Food & Gas Station', category: 'Fast Food' };
    const fit = calculateDeterministicProjectFit(irrelevantLead, HK_DEFAULT_PROJECT);
    expect(fit.score).toBeLessThan(50);
  });

  it('resolves OSM tags accurately for target categories', async () => {
    const feedTags = await resolveOsmTags('Feed Store');
    expect(feedTags.tags.some((t) => t.key === 'shop' && (t.value === 'agrarian' || t.value === 'farm'))).toBe(true);
  });
});
