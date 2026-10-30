import { describe, expect, it } from 'vitest';
import { findProhibitedClaims, hasProhibitedClaim, prohibitedClaimReason } from './claims';

describe('findProhibitedClaims — what it blocks', () => {
  it.each([
    'Himalayan pink salt that cures arthritis.',
    'A natural remedy for hypertension.',
    'Prevents infection in the herd.',
    'Heals your skin in days.',
    'Treats your animals without chemicals.',
    'Antibacterial and anti-inflammatory.',
    'Detoxifies the body and boosts your immune system.',
    'Lowers blood pressure naturally.',
    'Kills bacteria on contact.',
  ])('refuses a therapeutic claim: %s', (copy) => {
    expect(hasProhibitedClaim(copy)).toBe(true);
  });

  it('refuses an invoked veterinary authority', () => {
    expect(hasProhibitedClaim('Veterinarian-recommended salt for cattle.')).toBe(true);
  });

  it.each([
    'FDA-approved Himalayan salt.',
    'Certified organic pink salt.',
    'Non-GMO verified.',
    'Kosher certified.',
    'ISO 22000 certified production.',
    'Lab-tested for purity.',
  ])('refuses a certification nobody issued: %s', (copy) => {
    expect(hasProhibitedClaim(copy)).toBe(true);
  });

  it.each([
    'Clinically proven to lower sodium.',
    'Guaranteed to heal your horse.',
    '100% safe for every animal.',
    'Proven to lose weight.',
  ])('refuses an unsupported guarantee: %s', (copy) => {
    expect(hasProhibitedClaim(copy)).toBe(true);
  });

  it('names the rule and the words that matched', () => {
    const [claim] = findProhibitedClaims('FDA-approved salt.');
    expect(claim.rule).toBe('fabricated certification');
    expect(claim.match.toLowerCase()).toContain('fda-approved');
  });

  it('returns nothing for empty input, because absent copy is not a claim', () => {
    expect(findProhibitedClaims('')).toEqual([]);
    expect(findProhibitedClaims(null)).toEqual([]);
    expect(findProhibitedClaims(undefined)).toEqual([]);
  });

  it('builds a one-line reason for a listing defect', () => {
    expect(prohibitedClaimReason('Cures arthritis.')).toContain('Prohibited claim in copy');
    expect(prohibitedClaimReason('Plain pink salt.')).toBeNull();
  });
});

/**
 * The half that matters more. The rule this module replaced refused the owner's own
 * products — salt licks and salt blocks named their animals — so every phrase the
 * catalog legitimately uses is asserted as allowed. A false positive here blocks a
 * real listing, which is a worse failure than a missed claim.
 */
describe('findProhibitedClaims — owner-approved wording it must allow', () => {
  it.each([
    'Himalayan Salt Lick — 1 to 2 lbs',
    'Himalayan Salt Lick — 3 to 4 lbs',
    'Himalayan Salt Lick — 5 to 6 lbs',
    'Himalayan Salt Lick — 12 to 14 lbs',
    'Himalayan Salt Lick — 30 lbs',
    'Himalayan Salt Block — 30 lbs',
    'Himalayan Salt Block — Rectangular 8 x 4 x 1 in',
    'Himalayan Rock Salt — 45 lbs (2–3 large chunks)',
    'Himalayan Pink Edible Salt Fine Grain Pouch — 6 lbs',
    'Himalayan Salt Fine Grain — 45 lbs (0.5–1.0 mm)',
  ])('allows the owner-approved SKU titles: %s', (copy) => {
    expect(hasProhibitedClaim(copy)).toBe(false);
  });

  it.each([
    'Salt licks for horses, cattle and deer.',
    'Livestock need sodium and chloride to maintain appetite and healthy growth.',
    'Natural rock salt for your herd, your horses and working animals.',
    'A salt lick that animals use at their own pace, in the paddock or the pasture.',
    'Trusted by ranchers across America. Premium salt for livestock and gourmet cooking.',
    'Our salt blocks for deer and cattle are pure Himalayan pink rock salt.',
    'Up to 84 minerals and trace elements for cattle, horses and deer.',
  ])('allows livestock wording the owner approved for the storefront: %s', (copy) => {
    expect(hasProhibitedClaim(copy)).toBe(false);
  });

  it('allows a verb that is a claim only next to a condition', () => {
    // "treats" as ordinary English, not a therapeutic promise.
    expect(hasProhibitedClaim('Salt that treats itself to nothing but sunshine.')).toBe(false);
    // "heals" in the brand's own tagline.
    expect(hasProhibitedClaim('Himalayan Koh — Salt that Heals')).toBe(false);
  });

  it('allows a halal or kosher statement that is a fact about the product, not a certificate', () => {
    expect(hasProhibitedClaim('Halal unprocessed Himalayan pink cooking salt.')).toBe(false);
    expect(hasProhibitedClaim('Kosher-grade rock salt.')).toBe(false);
  });

  it('allows unrefined, mineral and purity language without a certification word', () => {
    expect(hasProhibitedClaim('Unrefined and additive-free, with the iron the seam gave it.')).toBe(false);
    expect(hasProhibitedClaim('Mineral-rich pink rock salt, packed without bleaching agents.')).toBe(false);
  });
});
