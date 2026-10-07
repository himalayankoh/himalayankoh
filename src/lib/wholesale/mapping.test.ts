import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  accountFromRow,
  applicationFromRow,
  containerProfileFromRow,
  costProfileFromRow,
  freightRateFromRow,
  freightRateToRow,
  packagingFromJson,
  packagingToJson,
  productFromRow,
  quoteFromRow,
} from './mapping';
import { isLclRate } from './engine';
import { WHOLESALE_RESOURCES } from './store';
import { DEFAULT_PACKAGING_PROFILE } from './types';

/**
 * The conversion layer, and one contract test that is worth more than the rest.
 *
 * `store.ts` and the plugin have to agree on the set of record names: the app's list
 * decides what a console request may ask for, and the plugin's schema decides what can
 * actually be written. If those two drift, the symptom is a 400 at runtime in the one
 * screen nobody tested — so the plugin's own declaration is read here and compared.
 */

const PLUGIN = join(process.cwd(), 'wordpress', 'hk-wholesale.php');

describe('plugin contract', () => {
  it('exposes exactly the record types the app asks for', () => {
    const source = readFileSync(PLUGIN, 'utf8');
    const resources = [...source.matchAll(/^\t\t'([a-z_]+)'\s+=> array\(\n\t\t\t'columns'/gm)].map(
      (match) => match[1]
    );

    expect(resources.length).toBeGreaterThan(0);
    expect([...resources].sort()).toEqual([...WHOLESALE_RESOURCES].sort());
  });

  it('is administrator-only: no route is reachable without manage_options', () => {
    const source = readFileSync(PLUGIN, 'utf8');
    // Each registered method carries its own callback, so the count may exceed the
    // route count (one route here serves GET, POST and DELETE). What must never
    // happen is a callback that is not the capability check: the app reaches these
    // routes with the WordPress application password of an administrator, and any
    // `__return_true` would open the whole wholesale store to anonymous callers.
    const registrations = source.match(/register_rest_route\(/g)?.length ?? 0;
    const guards = source.match(/'permission_callback'\s*=>\s*([^,\n]+)/g) ?? [];
    const nonCapability = guards.filter((line) => !line.includes('$manage'));

    expect(registrations).toBeGreaterThan(0);
    expect(guards.length).toBeGreaterThanOrEqual(registrations);
    expect(nonCapability).toEqual([]);
    expect(source).not.toMatch(/permission_callback'\s*=>\s*'__return_true'/);
  });

  it('drops unknown columns instead of trusting a request body', () => {
    const source = readFileSync(PLUGIN, 'utf8');
    expect(source).toMatch(/function hk_wholesale_filter_payload/);
    expect(source).toMatch(/if \( ! isset\( \$columns\[ \$key \] \) \) \{\s*\n\s*continue;/);
  });
});

describe('packaging', () => {
  it('falls back to the documented default and names the fields it fell back on', () => {
    const { profile, defaultsUsed } = packagingFromJson({ cartonQty: 4, cartonGrossWeightKg: 11.3 });
    expect(profile.cartonQty).toBe(4);
    expect(profile.cartonGrossWeightKg).toBe(11.3);
    expect(defaultsUsed).toContain('palletLengthCm');
    expect(defaultsUsed).not.toContain('cartonQty');
    // The rest of the profile is still usable, so the calculator can run and say so.
    expect(profile.palletLengthCm).toBe(DEFAULT_PACKAGING_PROFILE.palletLengthCm);
  });

  it('treats an absent optional ceiling as unknown, not as zero', () => {
    const { profile } = packagingFromJson({ cartonQty: 4 });
    expect(profile.maxPalletGrossWeightKg).toBe(DEFAULT_PACKAGING_PROFILE.maxPalletGrossWeightKg);
    const explicit = packagingFromJson({ cartonQty: 4, maxPalletGrossWeightKg: 0 });
    expect(explicit.profile.maxPalletGrossWeightKg).toBe(DEFAULT_PACKAGING_PROFILE.maxPalletGrossWeightKg);
  });

  it('survives a malformed blob rather than throwing', () => {
    expect(packagingFromJson('not json').defaultsUsed.length).toBeGreaterThan(0);
    expect(packagingFromJson(null).profile.cartonQty).toBe(DEFAULT_PACKAGING_PROFILE.cartonQty);
  });

  it('round-trips through storage without losing an override', () => {
    const stored = packagingToJson({
      ...DEFAULT_PACKAGING_PROFILE,
      cartonQty: 6,
      cartonsPerLayer: 5,
      layers: 4,
    });
    const { profile } = packagingFromJson(stored);
    expect(profile.cartonQty).toBe(6);
    expect(profile.cartonsPerLayer).toBe(5);
    expect(profile.layers).toBe(4);
  });

  it('round-trips every field the owner packaging form offers', () => {
    // The form writes exactly these keys (ConfigPanels PACKAGING_FIELDS / this module's
    // PACKAGING_FIELDS + the optional enrichments). Save → reload must be lossless, or the
    // owner re-enters data the engine then reads back as a default.
    const full = {
      ...DEFAULT_PACKAGING_PROFILE,
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
      maxPalletGrossWeightKg: 1050,
      cartonsPerLayer: 5,
      layers: 4,
      unitLengthCm: 30,
      unitWidthCm: 20,
      unitHeightCm: 12,
    };
    const { profile, defaultsUsed } = packagingFromJson(packagingToJson(full));
    expect(defaultsUsed).toEqual([]);
    for (const [key, value] of Object.entries(full)) {
      expect((profile as unknown as Record<string, unknown>)[key], key).toBe(value);
    }
  });
});

describe('products', () => {
  it('keeps cost and reference separate, and reports the id a write can address', () => {
    const product = productFromRow({
      id: 7,
      woo_product_id: 2494,
      name: 'Fine Grain',
      wholesale_sku: 'HK-WS-FINE',
      moq: 4,
      ex_factory_cost: 18.5,
      currency: 'USD',
      active: 1,
      packaging: { cartonQty: 4 },
    });

    expect(product.rowId).toBe(7);
    expect(product.id).toBe('7');
    expect(product.wooProductId).toBe(2494);
    expect(product.exFactoryCost).toBe(18.5);
    expect(product.active).toBe(true);
  });

  it('reads an inactive product as inactive rather than as missing', () => {
    expect(productFromRow({ id: 1, active: 0 }).active).toBe(false);
    expect(productFromRow({ id: 1 }).active).toBe(false);
  });
});

describe('cost profiles', () => {
  it('flattens the stored charge blobs back into the engine shape', () => {
    const profile = costProfileFromRow({
      id: 2,
      name: 'Karachi FOB',
      origin_id: 1,
      currency: 'PKR',
      charges: { inlandTransport: 300, stuffing: 150, otherLabel: 'Weighbridge', otherAmount: 40 },
      destination: { destinationTerminal: 500 },
      insurance_pct: 0.4,
      duty_pct: 3.5,
      include_destination: 1,
      duty_in_landed: 0,
    });

    expect(profile.inlandTransport).toBe(300);
    expect(profile.stuffing).toBe(150);
    expect(profile.otherLabel).toBe('Weighbridge');
    expect(profile.otherAmount).toBe(40);
    expect(profile.destinationTerminal).toBe(500);
    expect(profile.insurancePct).toBe(0.4);
    expect(profile.includeDestination).toBe(true);
    expect(profile.dutyInLanded).toBe(false);
  });
});

describe('freight', () => {
  it('keeps a rate’s source, and never promotes a manual rate to a fetched one', () => {
    expect(freightRateFromRow({ id: 1, provider: 'Forwarder A', source: 'manual' }).source).toBe('manual');
    expect(freightRateFromRow({ id: 2, source: 'api' }).source).toBe('api');
    expect(freightRateFromRow({ id: 3 }).source).toBe('manual');
  });

  it('stores an LCL rate canonically however it was typed', () => {
    // LCL is not a container, so the stored value is the engine's own word for it: the
    // recommendation reads this column, and three spellings of one thing is three rates
    // the owner cannot filter.
    for (const typed of ['LCL', 'lcl', 'Lcl', ' LCL ', 'L.C.L.', 'Less than Container Load']) {
      expect(freightRateToRow({ containerType: typed }).container_type, typed).toBe('LCL');
    }
  });

  it('stores an FCL wording exactly as the forwarder wrote it', () => {
    // A rate is evidence of what was quoted. `20GP` must not become a profile id here —
    // the calculation resolves the wording to a profile at match time (`normalizeContainerKey`),
    // and rewriting it on the way in would both invent an id nobody quoted and discard
    // what the forwarder actually wrote.
    for (const typed of ['20FT', '20GP', '20 DV', "20' GP", '40FT', '40HQ', "40' High Cube", '45HC']) {
      expect(freightRateToRow({ containerType: typed }).container_type, typed).toBe(typed);
    }
  });

  it('round-trips a stored LCL rate as one the engine recognises', () => {
    const stored = freightRateToRow({ containerType: ' lcl ', oceanFreight: 300 });
    const rate = freightRateFromRow({ id: 6, ...stored });
    expect(rate.containerType).toBe('LCL');
    // The same predicate the shipment recommendation splits on, so a stored rate cannot
    // read as LCL to the console and as FCL to the engine.
    expect(isLclRate(rate.containerType)).toBe(true);
    expect(rate.oceanFreight).toBe(300);
  });

  it('reads surcharges back as items', () => {
    const rate = freightRateFromRow({
      id: 4,
      surcharges: [
        { label: 'BAF', amount: 180 },
        { label: 'THC', amount: 120 },
      ],
    });
    expect(rate.surcharges).toEqual([
      { label: 'BAF', amount: 180 },
      { label: 'THC', amount: 120 },
    ]);
  });
});

describe('containers', () => {
  it('uses the code as the engine id so a lane lookup matches', () => {
    const profile = containerProfileFromRow({ id: 9, code: '20FT', name: '20ft Standard', usable_cbm: 33.2 });
    expect(profile.id).toBe('20FT');
    expect(profile.rowId).toBe(9);
  });
});

describe('applications and accounts', () => {
  it('maps an application into the reviewer’s vocabulary', () => {
    const application = applicationFromRow({
      id: 5,
      company: 'Acme Foods',
      contact_name: 'Jane Buyer',
      email: 'JANE@ACME.EXAMPLE',
      country: 'United States',
      business_type: 'distributor',
      logistics_mode: 'container',
      status: 'PENDING',
    });
    expect(application.status).toBe('PENDING');
    expect(application.businessType).toBe('distributor');
    expect(application.loadPreference).toBe('container');
    expect(application.decidedBy).toBeNull();
  });

  it('only calls an ACTIVE account a customer', () => {
    expect(accountFromRow({ id: 1, status: 'ACTIVE' }).role).toBe('wholesale_customer');
    expect(accountFromRow({ id: 2, status: 'SUSPENDED' }).role).toBe('wholesale_pending');
    expect(accountFromRow({ id: 2, status: 'SUSPENDED' }).status).toBe('SUSPENDED');
  });
});

describe('quotes', () => {
  it('keeps the snapshot with the quote rather than pointing at live rows', () => {
    const quote = quoteFromRow({
      id: 11,
      ref: 'HK-WS-Q00011',
      account_id: 3,
      status: 'quoted',
      incoterm: 'cif',
      currency: 'USD',
      containers: 2,
      lines: [
        {
          name: 'Fine Grain',
          units: 1000,
          cartonQty: 4,
          exFactoryUnitCost: 17.9,
          packaging: { cartonQty: 4, cartonGrossWeightKg: 11.3 },
        },
      ],
      fx: [{ from: 'PKR', to: 'USD', rate: 0.0036, source: 'manual', retrievedAt: '2026-09-20T00:00:00.000Z' }],
      totals: { total: 24_291.4, perUnit: 24.2914, currency: 'USD' },
      sell_total: 31_000,
      valid_until: '2026-10-20T00:00:00.000Z',
    });

    expect(quote.status).toBe('QUOTED');
    expect(quote.incoterm).toBe('CIF');
    expect(quote.confidence).toBe('CONFIRMED');
    expect(quote.lines[0].exFactoryUnitCost).toBe(17.9);
    expect(quote.lines[0].packaging.cartonQty).toBe(4);
    expect(quote.snapshot.fx).toHaveLength(1);
  });

  it('reads an unpriced request as working state, not as a quotation', () => {
    const quote = quoteFromRow({ id: 12, status: 'SUBMITTED', sell_total: 0 });
    expect(quote.confidence).toBe('INDICATIVE');
    expect(quote.totals).toBeNull();
  });
});
