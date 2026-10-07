// ============================================================================
// Console readiness — the "what is still missing" contract
//
// The readiness screen tells the owner which wholesale screens cannot answer yet and
// what to type to unblock them. The contract that matters is that it measures the
// records rather than guessing: the owner's real state (no cost profiles, no freight
// rates, every product on the default packaging profile) must produce exactly the
// requirements that are actually blocking, and a fully configured workspace must
// produce none. Both directions are pinned, together with the two cases that are easy
// to get wrong — a live freighter standing in for stored rates, and an inactive
// product not counting against packaging.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { consoleReadiness, type ConsoleReadinessInput } from './consoleReadiness';
import { PACKAGING_LABELS } from './packagingFields';

/** Every measured packaging field, so a product can be marked Complete honestly. */
const MEASURED = {
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

/** Optional enrichments: absent from a profile that is nevertheless Complete. */
const OPTIONAL_KEYS = ['maxPalletGrossWeightKg', 'cartonsPerLayer', 'layers'];

const EMPTY: ConsoleReadinessInput = {
  products: [],
  costProfiles: [],
  freightRates: [],
  containerProfiles: [],
  accounts: [],
  freightProvider: null,
};

/** The owner's live state: products on defaults, nothing configured around them. */
const OWNER_STATE: ConsoleReadinessInput = {
  products: [
    { id: 1, name: 'Himalayan Rock Salt — 45 lb', active: 1 },
    { id: 2, name: 'Himalayan Salt Lick 1–2 lb', active: 1, packaging: { ...MEASURED } },
    { id: 3, name: 'Retired line', active: 0 },
  ],
  costProfiles: [],
  freightRates: [],
  containerProfiles: [{ id: 1, code: '40HC' }],
  accounts: [{ id: 1, name: 'QA buyer' }],
  freightProvider: { provider: 'manual', ready: false, missing: [] },
};

function keys(input: ConsoleReadinessInput): string[] {
  return consoleReadiness(input).requirements.map((entry) => entry.key);
}

describe('consoleReadiness', () => {
  it('names the owner’s real blockers, in the order that unblocks the most', () => {
    const readiness = consoleReadiness(OWNER_STATE);
    expect(keys(OWNER_STATE)).toEqual(['cost-profiles', 'freight-rates', 'packaging']);
    expect(readiness.complete).toBe(false);

    const packaging = readiness.requirements.find((entry) => entry.key === 'packaging');
    expect(packaging?.missing).toContain('1 of 2 products');
    expect(packaging?.tab).toBe('products');
  });

  it('leaves a configured screen out and reports it as already in place', () => {
    const readiness = consoleReadiness(OWNER_STATE);
    // A box and a buyer exist, so neither is asked for again.
    expect(keys(OWNER_STATE)).not.toContain('container-profiles');
    expect(keys(OWNER_STATE)).not.toContain('wholesale-accounts');
    expect(readiness.working.join('\n')).toContain('Container profiles — 1 configured');
    expect(readiness.working.join('\n')).toContain('Wholesale accounts — 1 account configured');
  });

  it('counts only the active catalogue, and the measured product is not outstanding', () => {
    const readiness = consoleReadiness(OWNER_STATE);
    // Three rows, one inactive and one measured, so two are in scope and one is done.
    expect(readiness.packaging).toEqual({ complete: 1, total: 2 });
  });

  it('names the fields the owner must enter, in the form’s own vocabulary', () => {
    const packaging = consoleReadiness(OWNER_STATE).requirements.find(
      (entry) => entry.key === 'packaging'
    );
    // The product with nothing entered is missing every required field; each is named by
    // its label, never by a raw key.
    for (const [key, value] of Object.entries(PACKAGING_LABELS)) {
      if (OPTIONAL_KEYS.includes(key)) continue;
      expect(packaging?.toEnter).toContain(value);
    }
    // The optional enrichments are not asked for: a profile is complete without them.
    for (const key of OPTIONAL_KEYS) {
      expect(packaging?.toEnter).not.toContain(PACKAGING_LABELS[key]);
    }
    expect(packaging?.toEnter.some((line) => line.startsWith('Open each product'))).toBe(true);
  });

  it('asks for nothing when everything is entered', () => {
    const readiness = consoleReadiness({
      ...OWNER_STATE,
      products: [{ id: 1, active: 1, packaging: { ...MEASURED } }],
      costProfiles: [{ id: 1, name: 'EXW Karachi' }],
      freightRates: [{ id: 1, container_type: '20FT', ocean_freight: 1500 }],
    });
    expect(readiness.requirements).toEqual([]);
    expect(readiness.complete).toBe(true);
    expect(readiness.working.join('\n')).toContain('Packaging — every active product has its own measured figures');
  });

  it('a connected live provider stands in for stored rates', () => {
    expect(keys(OWNER_STATE)).toContain('freight-rates');
    const withProvider = consoleReadiness({
      ...OWNER_STATE,
      freightProvider: { provider: 'freightos', ready: true, missing: [] },
    });
    expect(withProvider.requirements.map((entry) => entry.key)).not.toContain('freight-rates');
    expect(withProvider.working.join('\n')).toContain('priced from the connected live provider');
  });

  it('flags the missing records a first-time workspace has', () => {
    const readiness = consoleReadiness({ ...EMPTY, products: [{ id: 1, active: 1 }] });
    expect(readiness.requirements.map((entry) => entry.key)).toEqual([
      'container-profiles',
      'cost-profiles',
      'freight-rates',
      'packaging',
      'wholesale-accounts',
    ]);
    // Every requirement names what to enter and what it is holding up: a list of problems
    // with no instruction would just be a list of problems.
    for (const requirement of readiness.requirements) {
      expect(requirement.toEnter.length).toBeGreaterThan(0);
      expect(requirement.blocks.length).toBeGreaterThan(0);
      expect(requirement.missing.length).toBeGreaterThan(0);
      expect(requirement.tab.length).toBeGreaterThan(0);
    }
  });

  it('asks for a rate that can be LCL, and never warns that LCL cannot be entered', () => {
    // The freight-rate form offers LCL beside the box sizes now, so a caveat saying an LCL
    // rate could not be typed in from this console would be a lie.
    const freight = consoleReadiness(OWNER_STATE).requirements.find(
      (entry) => entry.key === 'freight-rates'
    );
    expect(freight?.toEnter.join(' ')).toMatch(/LCL/);
    expect(freight?.caveat ?? '').not.toMatch(/LCL/);
  });

  it('says a lane from the owner’s own US stock needs no ocean rate', () => {
    // The one case where this screen is not the answer. Left unsaid it reads as an
    // unfilled gap, and sends the owner looking for a rate that does not exist.
    const freight = consoleReadiness(OWNER_STATE).requirements.find(
      (entry) => entry.key === 'freight-rates'
    );
    expect(freight?.caveat).toMatch(/United States stock/);
    expect(freight?.caveat).toMatch(/local\/state freight/);
  });

  it('names the local/state freight charge on the cost profile a US lane is priced with', () => {
    const costs = consoleReadiness(OWNER_STATE).requirements.find(
      (entry) => entry.key === 'cost-profiles'
    );
    expect(costs?.toEnter.join(' ')).toMatch(/local\/state freight/);
  });

  it('reports a workspace with no catalogue as needing nothing to fix', () => {
    const readiness = consoleReadiness(EMPTY);
    expect(readiness.packaging).toEqual({ complete: 0, total: 0 });
    // No products means no packaging requirement — there is nothing to measure yet.
    expect(readiness.requirements.map((entry) => entry.key)).not.toContain('packaging');
  });
});
