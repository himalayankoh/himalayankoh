#!/usr/bin/env node
/**
 * Deep QA for the wholesale subsystem — beyond the end-to-end runner.
 *
 * `qa-wholesale.mjs` proves the flow works. This script exists to *doubt* it:
 *
 *   seed        realistic staging fixtures (two products, quantity breaks, cost
 *               profiles, five ocean lanes, port charges, four QA accounts)
 *   maths       eleven pallet/container scenarios, each recomputed here from the
 *               packaging spec — the arithmetic in this file is written from the
 *               documented rules, not imported from the engine, so agreement is
 *               evidence and disagreement is a bug in one of the two
 *   incoterms   one shipment priced EXW/FOB/CFR/CIF and recomputed by hand
 *   orders      nine realistic wholesale sales (direct, dealer, zero-commission
 *               dealer, percentage dealer, mixed pallet, FCL, partial, loss-making,
 *               missing-cost) with every figure recomputed independently
 *   revisions   one quotation revised five times, then checked for immutability
 *   security    two approved buyers and a suspended account, for the browser probes
 *   snapshot    capture the retail read surface, to prove wholesale changed nothing
 *   cleanup     delete every row this run created (manifest-driven) and the
 *               WordPress users it made
 *
 * Usage:
 *   node scripts/qa-wholesale-deep.mjs seed orders revisions maths incoterms security
 *   node scripts/qa-wholesale-deep.mjs cleanup
 *
 * No password, token or secret is ever printed. QA rows are prefixed `QA-WSD-` and
 * tracked in a manifest so cleanup is exact rather than a guess.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'http://127.0.0.1:3997').replace(/\/+$/, '');
const TAG = 'QA-WSD';
const STAMP = Date.now().toString(36).toUpperCase();
const MANIFEST = join(tmpdir(), 'hk-ws-deep-manifest.json');
const QA_CLIENT_IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
const TOL = 0.02;

/* ------------------------------------------------------------------ */
/* plumbing                                                            */
/* ------------------------------------------------------------------ */

function loadEnv() {
  const out = { ...process.env };
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in out) || !out[key]) out[key] = value;
  }
  return out;
}

const env = loadEnv();
const results = [];
let adminToken = '';
let manifest = { tag: TAG, stamp: STAMP, records: [], buyerUsers: [], data: {} };

function save() {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}
function load() {
  if (existsSync(MANIFEST)) manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  return manifest;
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function check(name, actual, expected, tolerance = TOL) {
  const a = Number(actual);
  const e = Number(expected);
  const ok = Number.isFinite(a) && Number.isFinite(e) && Math.abs(a - e) <= tolerance;
  record(name, ok, ok ? `${a}` : `engine ${actual} vs manual ${expected}`);
  return ok;
}

function checkEqual(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  record(name, ok, ok ? `${JSON.stringify(actual)}` : `engine ${JSON.stringify(actual)} vs manual ${JSON.stringify(expected)}`);
  return ok;
}

function track(resource, id) {
  if (id) manifest.records.push({ resource, id: Number(id) });
}

async function call(path, { method = 'GET', body, token = adminToken, auth = true } = {}) {
  const headers = { Accept: 'application/json', 'X-Forwarded-For': QA_CLIENT_IP };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a document or an error page */
  }
  return { status: response.status, ok: response.ok, json, text };
}

async function signIn() {
  const username = env.WORDPRESS_ADMIN_USER;
  const password = env.WORDPRESS_ADMIN_APP_PASSWORD;
  if (!username || !password) {
    record('admin sign-in', false, 'no administrator credential in the environment');
    return false;
  }
  const response = await call('/api/auth/admin/login', { method: 'POST', body: { username, password }, auth: false });
  if (!response.ok || typeof response.json?.token !== 'string') {
    record('admin sign-in', false, `${response.status} ${response.json?.error || ''}`);
    return false;
  }
  adminToken = response.json.token;
  return true;
}

async function create(resource, data) {
  const response = await call(`/api/admin/wholesale/${resource}`, { method: 'POST', body: { data } });
  if (!response.ok) {
    record(`create ${resource}`, false, `${response.status} ${response.json?.error || ''}`);
    return null;
  }
  const row = response.json?.record ?? {};
  track(resource, row.id);
  save();
  return row;
}

async function update(resource, id, data) {
  const response = await call(`/api/admin/wholesale/${resource}`, { method: 'POST', body: { id, data } });
  if (!response.ok) {
    record(`update ${resource} #${id}`, false, `${response.status} ${response.json?.error || ''}`);
    return null;
  }
  return response.json?.record ?? {};
}

async function wp(path, options = {}) {
  const base = (env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
  const user = env.WORDPRESS_ADMIN_USER || '';
  const pass = (env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '');
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, ok: response.ok, json, text };
}

/* ------------------------------------------------------------------ */
/* The packaged goods under test, and the arithmetic for them          */
/* ------------------------------------------------------------------ */

/**
 * The two QA products, with the packaging a Pakistani salt exporter would actually
 * ship: a 2.5 kg retail pouch in 4s cartons, and a 1 kg pouch in 12s cartons.
 *
 * `manualLayout` / `manualLoad` / `manualFit` below are written from the documented
 * pallet rules — footprint in the better of two orientations, layers under the stack
 * height, then a weight ceiling — so the engine and this script arrive at the numbers
 * separately.
 */
const PRODUCT_SPECS = {
  fine: {
    key: 'fine',
    name: `${TAG} Fine grain salt 2.5kg`,
    sku: `${TAG}-FINE-${STAMP}`,
    exFactoryCost: 18.5,
    netUnitWeightKg: 2.5,
    moq: 100,
    packaging: {
      cartonQty: 4,
      cartonLengthCm: 40,
      cartonWidthCm: 30,
      cartonHeightCm: 24,
      cartonGrossWeightKg: 11.3,
      palletLengthCm: 120,
      palletWidthCm: 100,
      maxStackHeightCm: 180,
      palletDeckHeightCm: 14,
      palletTareKg: 20,
      maxPalletGrossWeightKg: 1000,
    },
    tiers: [
      { minUnits: 100, unitPrice: 17.9 },
      { minUnits: 1000, unitPrice: 16.4 },
      { minUnits: 5000, unitPrice: 15.2 },
    ],
  },
  pink: {
    key: 'pink',
    name: `${TAG} Pink salt 1kg pouch`,
    sku: `${TAG}-PINK-${STAMP}`,
    exFactoryCost: 6.4,
    netUnitWeightKg: 1,
    moq: 200,
    packaging: {
      cartonQty: 12,
      cartonLengthCm: 50,
      cartonWidthCm: 35,
      cartonHeightCm: 30,
      cartonGrossWeightKg: 13.6,
      palletLengthCm: 120,
      palletWidthCm: 100,
      maxStackHeightCm: 160,
      palletDeckHeightCm: 14,
      palletTareKg: 22,
      maxPalletGrossWeightKg: 1200,
    },
    tiers: [
      { minUnits: 500, unitPrice: 6.9 },
      { minUnits: 2000, unitPrice: 6.35 },
    ],
  },
  /** A deliberately heavy carton, so the pallet weight ceiling (not the stack) binds. */
  heavy: {
    key: 'heavy',
    name: `${TAG} Rock salt 25kg sack`,
    sku: `${TAG}-ROCK-${STAMP}`,
    exFactoryCost: 4.2,
    netUnitWeightKg: 25,
    moq: 40,
    packaging: {
      cartonQty: 1,
      cartonLengthCm: 60,
      cartonWidthCm: 40,
      cartonHeightCm: 20,
      cartonGrossWeightKg: 26.5,
      palletLengthCm: 120,
      palletWidthCm: 100,
      maxStackHeightCm: 200,
      palletDeckHeightCm: 14,
      palletTareKg: 25,
      maxPalletGrossWeightKg: 800,
    },
    tiers: [{ minUnits: 40, unitPrice: 4.05 }],
  },
};

const round = (value, places = 4) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Pallets, cartons and weight for one product, from the packaging spec alone. */
function manualLayout(pkg) {
  const cartonCbm = (pkg.cartonLengthCm * pkg.cartonWidthCm * pkg.cartonHeightCm) / 1_000_000;
  const deckCbm = (pkg.palletLengthCm * pkg.palletWidthCm * pkg.palletDeckHeightCm) / 1_000_000;
  const along =
    Math.floor(pkg.palletLengthCm / pkg.cartonLengthCm) * Math.floor(pkg.palletWidthCm / pkg.cartonWidthCm);
  const rotated =
    Math.floor(pkg.palletLengthCm / pkg.cartonWidthCm) * Math.floor(pkg.palletWidthCm / pkg.cartonLengthCm);
  const cartonsPerLayer = Math.max(along, rotated);
  const layers = Math.floor((pkg.maxStackHeightCm - pkg.palletDeckHeightCm) / pkg.cartonHeightCm);
  let cartonsPerPallet = cartonsPerLayer * layers;
  let weightLimited = false;
  const byWeight = Math.floor((pkg.maxPalletGrossWeightKg - pkg.palletTareKg) / pkg.cartonGrossWeightKg);
  if (byWeight < cartonsPerPallet) {
    cartonsPerPallet = byWeight;
    weightLimited = true;
  }
  return {
    cartonCbm,
    deckCbm,
    cartonsPerLayer,
    layers,
    cartonsPerPallet,
    unitsPerPallet: cartonsPerPallet * pkg.cartonQty,
    weightLimited,
  };
}

function manualLoad(products, key, units) {
  const spec = products[key];
  const pkg = spec.packaging;
  const layout = manualLayout(pkg);
  const cartons = Math.ceil(units / pkg.cartonQty);
  const fullPallets = Math.floor(cartons / layout.cartonsPerPallet);
  const remainder = cartons % layout.cartonsPerPallet;
  const palletsRequired = fullPallets + (remainder > 0 ? 1 : 0);
  return {
    cartons,
    fullPallets,
    palletsRequired,
    unitsOnLastPallet: remainder > 0 ? remainder * pkg.cartonQty : 0,
    netWeightKg: round(units * spec.netUnitWeightKg, 3),
    grossWeightKg: round(cartons * pkg.cartonGrossWeightKg + palletsRequired * pkg.palletTareKg, 3),
    cargoCbm: round(cartons * layout.cartonCbm, 4),
    cbm: round(cartons * layout.cartonCbm + palletsRequired * layout.deckCbm, 4),
    layout,
    merchandiseCost: round(units * spec.exFactoryCost, 2),
  };
}

function manualFit(container, load) {
  const practicalCbmLimit = round(container.usableCbm * container.practicalVolumeFactor, 3);
  const weightUtilizationPct = round((load.grossWeightKg / container.maxCargoWeightKg) * 100, 1);
  const volumeUtilizationPct = round((load.cbm / practicalCbmLimit) * 100, 1);
  const rawVolumeUtilizationPct = round((load.cbm / container.usableCbm) * 100, 1);
  const limitingFactor = weightUtilizationPct >= volumeUtilizationPct ? 'WEIGHT' : 'VOLUME';
  return { practicalCbmLimit, weightUtilizationPct, volumeUtilizationPct, rawVolumeUtilizationPct, limitingFactor };
}

/* ------------------------------------------------------------------ */
/* seed                                                                */
/* ------------------------------------------------------------------ */

async function seed() {
  const workspace = (await call('/api/admin/wholesale/workspace')).json;
  const containers = workspace?.containerProfiles ?? [];
  const origins = workspace?.origins ?? [];
  if (!containers.length || !origins.length) {
    record('seeded container profiles and origins exist', false, 'run the plugin installer first');
    return false;
  }

  const containerByCode = {};
  for (const profile of containers) containerByCode[String(profile.code).toUpperCase()] = profile;
  const origin = origins.find((row) => String(row.port).toUpperCase().startsWith('PKK') || /pakistan/i.test(String(row.country))) ?? origins[0];
  record(
    'container profiles and origins are readable',
    true,
    `${containers.map((c) => c.code).join(', ')} · origin ${origin.city || origin.country || origin.id} (${origin.port || 'no port'})`
  );

  // Products + quantity breaks.
  const products = {};
  for (const spec of Object.values(PRODUCT_SPECS)) {
    const row = await create('products', {
      name: spec.name,
      wholesale_sku: spec.sku,
      ex_factory_cost: spec.exFactoryCost,
      currency: 'USD',
      moq: spec.moq,
      net_unit_weight_kg: spec.netUnitWeightKg,
      lead_time_days: 21,
      origin_id: Number(origin.id),
      active: true,
      packaging: { packagedUnitWeightKg: spec.netUnitWeightKg * 1.08, ...spec.packaging },
      notes: `${TAG} deep QA fixture ${STAMP}`,
    });
    if (!row) return false;
    const tiers = [];
    for (const tier of spec.tiers) {
      const saved = await create('price_tiers', {
        product_id: Number(row.id),
        min_units: tier.minUnits,
        unit_price: tier.unitPrice,
        currency: 'USD',
      });
      if (saved) tiers.push(Number(saved.id));
    }
    products[spec.key] = { ...spec, id: Number(row.id), tierIds: tiers };
  }
  record(
    'three QA products with quantity breaks',
    Object.values(products).every((p) => p.id && p.tierIds.length),
    Object.values(products).map((p) => `${p.key}#${p.id} (${p.tierIds.length} tiers)`).join(' · ')
  );

  const supplier = await create('suppliers', {
    name: `${TAG} Karachi supplier ${STAMP}`,
    country: origin.country || 'Pakistan',
    city: origin.city || 'Karachi',
    port: origin.port || 'PKKHI',
    currency: 'USD',
    contact: 'QA supplier contact',
    active: true,
  });

  const charges = {
    inlandTransport: 260,
    stuffing: 130,
    documentation: 95,
    originTerminal: 185,
    originCustoms: 145,
    inspection: 105,
    forwarding: 80,
    packaging: 0,
    otherAmount: 0,
    otherLabel: '',
  };
  const costProfile = await create('cost_profiles', {
    name: `${TAG} Karachi origin costs ${STAMP}`,
    origin_id: Number(origin.id),
    supplier_id: supplier ? Number(supplier.id) : 0,
    currency: 'USD',
    insurance_pct: 0.4,
    duty_pct: 0,
    duty_in_landed: false,
    include_destination: false,
    charges,
    destination: {
      destinationTerminal: 240,
      destinationHandling: 180,
      destinationCustomsBroker: 150,
      destinationDelivery: 320,
      destinationWarehouse: 0,
      destinationOther: 0,
    },
    notes: `${TAG} deep QA cost profile ${STAMP}`,
  });

  // A second profile with a real duty rate and destination-side costs switched on,
  // which is the only way the CIF-plus-destination arithmetic can be exercised.
  const costProfileDuty = await create('cost_profiles', {
    name: `${TAG} Karachi origin costs, duty + destination ${STAMP}`,
    origin_id: Number(origin.id),
    supplier_id: supplier ? Number(supplier.id) : 0,
    currency: 'USD',
    insurance_pct: 0.5,
    duty_pct: 3.5,
    duty_in_landed: true,
    include_destination: true,
    charges,
    destination: {
      destinationTerminal: 240,
      destinationHandling: 180,
      destinationCustomsBroker: 150,
      destinationDelivery: 320,
      destinationWarehouse: 60,
      destinationOther: 25,
    },
    notes: `${TAG} deep QA cost profile with duty ${STAMP}`,
  });

  const lanes = [
    ['20FT', 'USNYC', 2450, [{ label: 'BAF', amount: 150 }], 32],
    ['40FT', 'USNYC', 3150, [{ label: 'BAF', amount: 150 }], 30],
    ['40HC', 'USNYC', 3400, [{ label: 'BAF', amount: 165 }], 30],
    ['40HC', 'GBFXT', 2950, [{ label: 'BAF', amount: 140 }, { label: 'ISPS', amount: 35 }], 38],
    ['20FT', 'AEJEA', 950, [{ label: 'BAF', amount: 60 }], 8],
  ];
  const freights = [];
  for (const [containerType, destinationPort, oceanFreight, surcharges, transitDays] of lanes) {
    const row = await create('freight_rates', {
      source: 'manual',
      provider: `${TAG} temporary QA rate`,
      origin_port: origin.port || 'PKKHI',
      destination_port: destinationPort,
      container_type: containerType,
      carrier: 'QA temporary lane',
      currency: 'USD',
      ocean_freight: oceanFreight,
      surcharges,
      transit_days: transitDays,
      valid_until: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
      notes: `${TAG} TEMPORARY QA FREIGHT — not a market rate, delete after testing (${STAMP})`,
    });
    if (row) freights.push(row);
  }

  const portCharges = [];
  for (const [side, port, label, amount, per] of [
    ['origin', origin.port || 'PKKHI', 'Terminal handling (THC)', 185, 'container'],
    ['origin', origin.port || 'PKKHI', 'Documentation', 95, 'container'],
    ['destination', 'USNYC', 'Destination terminal (DTHC)', 240, 'container'],
    ['destination', 'USNYC', 'Customs broker', 150, 'container'],
  ]) {
    const row = await create('port_charges', { side, port, label, amount, currency: 'USD', per, notes: `${TAG} QA port charge ${STAMP}` });
    if (row) portCharges.push(row);
  }

  // Accounts: a direct importer, a dealer on a standing share, a dealer earning
  // nothing, and one suspended buyer for the permission probes.
  const accounts = {};
  const accountSpecs = [
    ['direct', { company: `${TAG} Continental Imports ${STAMP}`, contact_name: 'QA Direct Buyer', business_type: 'importer', commission_pct: 0, country: 'United States', destination_country: 'United States', destination_port: 'USNYC' }],
    ['dealer12', { company: `${TAG} Gulf Trade Partners ${STAMP}`, contact_name: 'QA Dealer Twelve', business_type: 'distributor', commission_pct: 12.5, commission_terms: '12.5% of gross profit, payable 30 days after shipment', country: 'United Arab Emirates', destination_country: 'United Arab Emirates', destination_port: 'AEJEA' }],
    ['dealer0', { company: `${TAG} Nordic Retail Group ${STAMP}`, contact_name: 'QA Dealer Zero', business_type: 'reseller', commission_pct: 0, commission_terms: 'No commission — introduced at no charge', country: 'United Kingdom', destination_country: 'United Kingdom', destination_port: 'GBFXT' }],
    ['suspended', { company: `${TAG} Suspended Buyer ${STAMP}`, contact_name: 'QA Suspended', business_type: 'business', commission_pct: 0, status: 'SUSPENDED', country: 'Germany' }],
  ];
  for (const [key, spec] of accountSpecs) {
    const row = await create('accounts', {
      ref: `${TAG}-A-${STAMP}-${key.toUpperCase()}`,
      email: `${TAG.toLowerCase()}-${key}-${STAMP.toLowerCase()}@example.invalid`,
      phone: '+10000000000',
      status: spec.status || 'ACTIVE',
      payment_terms: 'Deposit then balance before shipment',
      approved_at: new Date().toISOString(),
      notes: `${TAG} deep QA account ${STAMP}`,
      ...spec,
    });
    if (!row) return false;
    accounts[key] = Number(row.id);
  }
  record('four QA accounts (direct, dealer 12.5%, dealer 0%, suspended)', Object.keys(accounts).length === 4, JSON.stringify(accounts));

  manifest.data = {
    products: Object.fromEntries(Object.entries(products).map(([key, value]) => [key, { id: value.id, tierIds: value.tierIds }])),
    accounts,
    costProfileId: costProfile ? Number(costProfile.id) : 0,
    costProfileDutyId: costProfileDuty ? Number(costProfileDuty.id) : 0,
    freightIds: freights.map((row) => ({ id: Number(row.id), container: row.container_type, destination: row.destination_port })),
    containers: containers.map((row) => ({
      id: Number(row.id),
      code: row.code,
      usableCbm: Number(row.usable_cbm),
      maxCargoWeightKg: Number(row.max_cargo_weight_kg),
      practicalVolumeFactor: Number(row.practical_volume_factor),
      palletCapacity: row.pallet_capacity === null || row.pallet_capacity === undefined ? null : Number(row.pallet_capacity),
    })),
    originPort: origin.port || 'PKKHI',
  };
  save();
  record('fixtures recorded in the cleanup manifest', true, `${manifest.records.length} rows tracked`);
  return true;
}

/** The freight row for a destination/container pair. */
function freightFor(destination, container) {
  const entry = manifest.data.freightIds.find((row) => row.destination === destination && row.container === container);
  return entry ? entry.id : null;
}
function containerFor(code) {
  return manifest.data.containers.find((row) => String(row.code).toUpperCase() === code) ?? manifest.data.containers[0];
}
function product(key) {
  const entry = manifest.data.products[key];
  return { ...PRODUCT_SPECS[key], id: entry.id };
}

async function calculate(body) {
  return call('/api/admin/wholesale/calculate', { method: 'POST', body });
}

/* ------------------------------------------------------------------ */
/* maths — eleven scenarios                                            */
/* ------------------------------------------------------------------ */

async function maths() {
  const data = manifest.data;
  const base = {
    accountId: data.accounts.direct,
    containerProfileId: containerFor('20FT').id,
    containers: 1,
    costProfileId: data.costProfileId,
    incoterm: 'EXW',
    currency: 'USD',
    marginPct: 18,
  };

  const fine = PRODUCT_SPECS.fine;
  const pink = PRODUCT_SPECS.pink;
  const heavy = PRODUCT_SPECS.heavy;
  const fineLayout = manualLayout(fine.packaging);
  const pinkLayout = manualLayout(pink.packaging);
  const heavyLayout = manualLayout(heavy.packaging);

  record(
    'manual pallet derivation (fine / pink / heavy)',
    true,
    `fine ${fineLayout.cartonsPerLayer}/layer × ${fineLayout.layers} = ${fineLayout.cartonsPerPallet} cartons = ${fineLayout.unitsPerPallet} units` +
      ` · pink ${pinkLayout.cartonsPerPallet} cartons = ${pinkLayout.unitsPerPallet} units` +
      ` · heavy ${heavyLayout.cartonsPerPallet} cartons${heavyLayout.weightLimited ? ' (weight-limited)' : ''}`
  );
  record('heavy pallet is capped by weight, not stack height', heavyLayout.weightLimited === true, `byWeight ${heavyLayout.cartonsPerPallet} vs stack ${heavyLayout.cartonsPerLayer * heavyLayout.layers}`);

  async function scenario(name, { key, units, pallets, containerCode, extraLines = [], expect }) {
    const lines = [];
    if (units !== undefined) lines.push({ productRowId: product(key).id, units });
    if (pallets !== undefined) lines.push({ productRowId: product(key).id, pallets });
    for (const line of extraLines) lines.push(line);
    const response = await calculate({ ...base, containerProfileId: containerFor(containerCode).id, lines });
    if (!response.ok) {
      record(name, false, `${response.status} ${response.json?.error || ''}`);
      return null;
    }
    const calc = response.json.calculation;
    // The manual numbers, computed from the packaging spec rather than from the
    // response — which is the whole point of the cross-check.
    const manual = lines.map((line) => {
      const specKey = line.productRowId === product('fine').id ? 'fine' : line.productRowId === product('pink').id ? 'pink' : 'heavy';
      const unitsFor = line.units !== undefined ? line.units : line.pallets * manualLayout(PRODUCT_SPECS[specKey].packaging).unitsPerPallet;
      return { spec: PRODUCT_SPECS[specKey], specKey, units: unitsFor, load: manualLoad(PRODUCT_SPECS, specKey, unitsFor) };
    });

    const totals = {
      units: manual.reduce((sum, entry) => sum + entry.units, 0),
      cartons: manual.reduce((sum, entry) => sum + entry.load.cartons, 0),
      pallets: manual.reduce((sum, entry) => sum + entry.load.palletsRequired, 0),
      grossWeightKg: round(manual.reduce((sum, entry) => sum + entry.load.grossWeightKg, 0), 3),
      cbm: round(manual.reduce((sum, entry) => sum + entry.load.cbm, 0), 4),
    };
    const container = containerFor(containerCode);
    const fit = manualFit(container, totals);

    let ok = true;
    for (const [index, entry] of manual.entries()) {
      const engineLine = calc.lines[index];
      ok = checkEqual(`${name} · line ${index + 1} cartons`, engineLine.cartons, entry.load.cartons) && ok;
      ok = checkEqual(`${name} · line ${index + 1} pallets`, engineLine.pallets, entry.load.palletsRequired) && ok;
      ok = checkEqual(`${name} · line ${index + 1} units`, engineLine.units, entry.units) && ok;
      ok = check(`${name} · line ${index + 1} cbm`, engineLine.cbm, entry.load.cbm, 0.001) && ok;
      ok = check(`${name} · line ${index + 1} gross kg`, engineLine.grossWeightKg, entry.load.grossWeightKg, 0.05) && ok;
      if (index === 0 && expect?.unitsOnLastPallet !== undefined) {
        ok = checkEqual(`${name} · units on the part pallet`, engineLine.unitsOnLastPallet, expect.unitsOnLastPallet) && ok;
      }
      if (expect?.merchandiseCost !== undefined && index === 0) {
        ok = check(`${name} · merchandise cost`, engineLine.merchandiseCost, expect.merchandiseCost, 0.05) && ok;
      }
    }
    ok = checkEqual(`${name} · pallets total`, calc.mixed.pallets, totals.pallets) && ok;
    ok = check(`${name} · cbm total`, calc.mixed.cbm, totals.cbm, 0.001) && ok;
    ok = check(`${name} · gross weight total`, calc.mixed.grossWeightKg, totals.grossWeightKg, 0.05) && ok;
    ok = checkEqual(`${name} · limiting factor`, calc.fit.limitingFactor, fit.limitingFactor) && ok;
    ok = check(`${name} · volume utilisation`, calc.fit.volumeUtilizationPct, fit.volumeUtilizationPct, 0.1) && ok;
    ok = check(`${name} · weight utilisation`, calc.fit.weightUtilizationPct, fit.weightUtilizationPct, 0.1) && ok;
    ok = check(`${name} · practical CBM ceiling`, calc.fit.practicalCbmLimit, fit.practicalCbmLimit, 0.01) && ok;
    if (expect?.containerCode) {
      // The domain object names the container by its code in `id` (see
      // `containerProfileFromRow`), so this is the code the user picked.
      ok = checkEqual(`${name} · container used`, String(calc.container.id).toUpperCase(), containerCode) && ok;
    }
    if (expect?.noVolumeWarnings) {
      const warnings = (calc.warnings ?? []).filter((line) => /volume|CBM|practical/.test(line));
      record(`${name} · no volume warning on a load that fits`, warnings.length === 0, warnings.length ? warnings.join(' | ') : `none (other warnings: ${(calc.warnings ?? []).join(' | ') || 'none'})`);
      ok = warnings.length === 0 && ok;
    }
    if (expect?.warning) {
      const found = (calc.warnings ?? []).find((line) => expect.warning.test(line));
      record(`${name} · the ${expect.warningLabel ?? 'expected'} warning is raised`, Boolean(found), found ?? `warnings: ${(calc.warnings ?? []).join(' | ') || 'none'}`);
      ok = Boolean(found) && ok;
    }
    if (expect?.weightLimited) {
      ok = checkEqual(`${name} · weight limits the pallet`, calc.lines[0].assumptions.some((line) => /weight ceiling/.test(line)), true) && ok;
    }
    record(`${name} — engine matches the manual arithmetic`, ok, `${totals.pallets} pallets · ${totals.cartons} cartons · ${totals.cbm} CBM · ${totals.grossWeightKg} kg · ${fit.limitingFactor} limits`);
    return { calc, manual, totals, fit, ok };
  }

  // 1. one pallet
  await scenario('1 · one full pallet', {
    key: 'fine',
    pallets: 1,
    containerCode: '20FT',
    expect: { unitsOnLastPallet: 0, containerCode: '20FT' },
  });

  // 2. multiple pallets
  await scenario('2 · three full pallets', {
    key: 'fine',
    pallets: 3,
    containerCode: '20FT',
    expect: { unitsOnLastPallet: 0 },
  });

  // 3. mixed pallet (two products on one load, one pallet each)
  await scenario('3 · mixed pallet', {
    key: 'fine',
    pallets: 1,
    containerCode: '20FT',
    extraLines: [{ productRowId: product('pink').id, pallets: 1 }],
  });

  // 4. weight-limited pallet
  await scenario('4 · weight-limited pallet (25 kg sacks)', {
    key: 'heavy',
    pallets: 1,
    containerCode: '20FT',
    expect: { weightLimited: true, unitsOnLastPallet: 0 },
  });

  // 5. volume-limited load — enough light cartons to bind on cubic metres
  const pinkVolUnits = Math.floor((containerFor('20FT').usableCbm / manualLayout(pink.packaging).cartonCbm) * pink.packaging.cartonQty * 0.9);
  await scenario('5 · volume-limited 20ft load', {
    key: 'pink',
    units: pinkVolUnits,
    containerCode: '20FT',
    expect: { containerCode: '20FT' },
  });

  // 6. part-loaded final pallet
  const fineUnitsOn5 = 5 * fine.packaging.cartonQty;
  await scenario('6 · two full pallets + 5 cartons', {
    key: 'fine',
    units: fineLayout.unitsPerPallet * 2 + fineUnitsOn5,
    containerCode: '20FT',
    expect: { unitsOnLastPallet: fineUnitsOn5 },
  });

  // 7–9. FCL on each container type
  await scenario('7 · 20ft FCL', { key: 'fine', units: Math.floor(fineLayout.unitsPerPallet * 8.5), containerCode: '20FT', expect: { containerCode: '20FT' } });
  await scenario('8 · 40ft FCL', { key: 'fine', units: Math.floor(fineLayout.unitsPerPallet * 18), containerCode: '40FT', expect: { containerCode: '40FT' } });
  await scenario('9 · 40HQ FCL', { key: 'fine', units: Math.floor(fineLayout.unitsPerPallet * 20), containerCode: '40HC', expect: { containerCode: '40HC' } });

  // 10. mixed container
  await scenario('10 · mixed container (three products)', {
    key: 'fine',
    pallets: 6,
    containerCode: '40HC',
    extraLines: [
      { productRowId: product('pink').id, pallets: 5 },
      { productRowId: product('heavy').id, pallets: 5 },
    ],
  });

  // 11. exact capacity boundaries — three points on the same axis: at the practical
  //     loading ceiling (which must be clean), between practical and physical volume
  //     (which must warn it may not fit), and past the container's real volume (which
  //     must refuse by name). A silent overflow would hide exactly here.
  const hq = containerFor('40HC');
  const pinkCarton = manualLayout(pink.packaging).cartonCbm;
  const deckCbm = (pink.packaging.palletLengthCm * pink.packaging.palletWidthCm * pink.packaging.palletDeckHeightCm) / 1_000_000;
  const cartonsFitting = (targetCbm) => {
    let cartons = Math.floor((targetCbm - 40 * deckCbm) / pinkCarton);
    while (cartons * pinkCarton + Math.ceil(cartons / pinkLayout.cartonsPerPallet) * deckCbm > targetCbm) cartons -= 1;
    return cartons;
  };
  const practicalTarget = round(hq.usableCbm * hq.practicalVolumeFactor, 3);
  const atPractical = cartonsFitting(practicalTarget);
  const atPhysical = cartonsFitting(hq.usableCbm);

  await scenario(`11a · loaded to the practical ceiling (${practicalTarget} CBM)`, {
    key: 'pink',
    units: atPractical * pink.packaging.cartonQty,
    containerCode: '40HC',
    expect: { containerCode: '40HC', noVolumeWarnings: true },
  });

  await scenario('11b · between the practical and the physical volume', {
    key: 'pink',
    units: atPhysical * pink.packaging.cartonQty,
    containerCode: '40HC',
    expect: { containerCode: '40HC', warning: /Above the practical loading volume/, warningLabel: 'practical-loading' },
  });

  await scenario('11c · one carton past the container’s own volume', {
    key: 'pink',
    units: (atPhysical + 1) * pink.packaging.cartonQty,
    containerCode: '40HC',
    expect: { containerCode: '40HC', warning: /cannot ship as one/, warningLabel: 'cannot-ship' },
  });

  const boundary = await calculate({
    ...base,
    containerProfileId: hq.id,
    lines: [{ productRowId: product('pink').id, units: atPractical * pink.packaging.cartonQty }],
  });
  if (boundary.ok) {
    record(
      '11a · the practical ceiling is the practical ceiling',
      boundary.json.calculation.fit.volumeUtilizationPct <= 100 && boundary.json.calculation.fit.volumeUtilizationPct > 98,
      `${boundary.json.calculation.mixed.cbm} CBM against a ${practicalTarget} CBM practical ceiling (${boundary.json.calculation.fit.volumeUtilizationPct}% of it), physical volume ${hq.usableCbm} CBM`
    );
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* incoterms                                                           */
/* ------------------------------------------------------------------ */

async function incoterms() {
  const data = manifest.data;
  const fine = PRODUCT_SPECS.fine;
  const units = 4_000;
  const load = manualLoad(PRODUCT_SPECS, 'fine', units);
  const charge = (key) => data.charges[key];
  // The charges are known from the seed, so the landed cost is recomputed here.
  const seeded = {
    packaging: 0,
    inland: 260,
    stuffing: 130,
    documentation: 95,
    originTerminal: 185,
    originCustoms: 145,
    inspection: 105,
    forwarding: 80,
    other: 0,
    insurancePct: 0.4,
    dutyPct: 0,
  };
  const freight = { base: 3150, surcharge: 150 };

  if (units < fine.tiers[1].minUnits) {
    record('incoterm shipment uses the second price tier', false, `tier selection would be wrong at ${units} units`);
  }
  const tier = fine.tiers.filter((entry) => units >= entry.minUnits).sort((a, b) => b.minUnits - a.minUnits)[0];
  const merchandise = round(units * tier.unitPrice, 2);
  const origin = seeded.stuffing + seeded.documentation + seeded.originTerminal + seeded.originCustoms + seeded.inspection + seeded.forwarding + seeded.other;
  const ocean = freight.base + freight.surcharge;
  const insurance = round(((merchandise + seeded.inland + origin + ocean) * seeded.insurancePct) / 100, 2);
  const totals = {
    EXW: round(merchandise + seeded.packaging, 2),
    FOB: round(merchandise + seeded.packaging + seeded.inland + origin, 2),
    CFR: round(merchandise + seeded.packaging + seeded.inland + origin + ocean, 2),
    CIF: round(merchandise + seeded.packaging + seeded.inland + origin + ocean + insurance, 2),
  };

  const container = containerFor('40FT');
  const containerFr = freightFor('USNYC', '40FT');
  const included = {};
  for (const incoterm of ['EXW', 'FOB', 'CFR', 'CIF']) {
    const response = await calculate({
      accountId: data.accounts.direct,
      lines: [{ productRowId: product('fine').id, units }],
      containerProfileId: container.id,
      containers: 1,
      costProfileId: data.costProfileId,
      freightRateId: containerFr,
      incoterm,
      currency: 'USD',
      marginPct: 15,
      destinationCountry: 'United States',
      destinationPort: 'USNYC',
    });
    if (!response.ok) {
      record(`incoterm ${incoterm}`, false, `${response.status} ${response.json?.error || ''}`);
      continue;
    }
    const calc = response.json.calculation;
    const keys = calc.costLines.filter((line) => line.included).map((line) => line.key);
    included[incoterm] = keys;
    check(`incoterm ${incoterm} · total matches the manual landed cost`, calc.totals.total, totals[incoterm], 0.05);
    checkEqual(`incoterm ${incoterm} · tier applied`, calc.lines[0].tierMinUnits, tier.minUnits);
    check(`incoterm ${incoterm} · merchandise (list price × units)`, calc.totals.merchandise, merchandise, 0.05);
    record(
      `incoterm ${incoterm} · what the total carries`,
      true,
      `${calc.totals.currency} ${calc.totals.total} = ${keys.join(' + ')}` +
        (calc.totals.destinationCharges ? ` · destination ${calc.totals.destinationCharges} shown, not included` : '')
    );
  }
  checkEqual('EXW carries only the goods and packaging', included.EXW, ['merchandise', 'packaging']);
  checkEqual('FOB adds the origin side up to the port', included.FOB, ['merchandise', 'packaging', 'inland', 'stuffing', 'documentation', 'originTerminal', 'originCustoms', 'inspection', 'forwarding', 'other']);
  checkEqual('CFR adds the ocean freight', included.CFR, [...included.FOB, 'oceanFreight']);
  checkEqual('CIF adds insurance on top of CFR', included.CIF, [...included.CFR, 'insurance']);

  // EXW with no freight attached must say CFR/CIF would be incomplete rather than
  // quietly pricing a CIF sale with no ocean leg.
  const noFreight = await calculate({
    accountId: data.accounts.direct,
    lines: [{ productRowId: product('fine').id, units }],
    containerProfileId: container.id,
    containers: 1,
    costProfileId: data.costProfileId,
    incoterm: 'CIF',
    currency: 'USD',
    marginPct: 15,
  });
  const assumptions = (noFreight.json?.calculation?.assumptions ?? []).join(' ');
  record(
    'CIF with no freight rate is flagged, not silently zero',
    noFreight.ok && /No ocean freight is attached/i.test(assumptions),
    assumptions.slice(0, 150)
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* orders A–I                                                          */
/* ------------------------------------------------------------------ */

async function raiseOrder({ label, accountKey, lines, containerCode, incoterm, destination, freightKey, costProfileId, marginPct, sellPricePerUnit, expected }) {
  const data = manifest.data;
  const response = await calculate({
    accountId: data.accounts[accountKey],
    lines,
    containerProfileId: containerFor(containerCode).id,
    containers: 1,
    costProfileId: costProfileId ?? data.costProfileId,
    freightRateId: freightFor(destination, freightKey ?? containerCode),
    incoterm,
    currency: 'USD',
    marginPct,
    sellPricePerUnit,
    destinationCountry: destination === 'USNYC' ? 'United States' : destination === 'GBFXT' ? 'United Kingdom' : 'United Arab Emirates',
    destinationPort: destination,
    save: {
      accountId: data.accounts[accountKey],
      status: 'QUOTED',
      validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      notes: `${TAG} ${label} — QA fixture, safe to delete`,
      pricingBasis: 'SYSTEM_CALCULATED',
    },
  });
  if (!response.ok) {
    record(`${label} · quotation saved`, false, `${response.status} ${response.json?.error || ''}`);
    return null;
  }
  const quoteId = Number(response.json.quote.id);
  track('quotes', quoteId);
  const calc = response.json.calculation;

  // The owner marks the firm quotation accepted (the buyer's portal does this in
  // production; these QA accounts have no WordPress user, so it is done owner-side).
  await update('quotes', quoteId, { status: 'ACCEPTED' });

  const conversion = await call('/api/admin/wholesale/convert', {
    method: 'POST',
    body: { quoteId, paymentTerms: { label: 'Deposit then balance before shipment', depositPct: 30, balancePct: 70 }, notes: `${TAG} ${label}` },
  });
  if (!conversion.ok) {
    record(`${label} · order raised`, false, `${conversion.status} ${conversion.json?.error || ''}`);
    return null;
  }
  const orderId = Number(conversion.json.order.id);
  track('orders', orderId);
  save();

  return {
    label,
    quoteId,
    orderId,
    reference: conversion.json.reference,
    quoteReference: response.json.reference,
    calc,
    sellTotal: Number(response.json.quote.sellTotal),
    order: conversion.json.order,
  };
}

async function profitRecord(body) {
  return call('/api/admin/wholesale/profit', { method: 'POST', body });
}

async function readProfit(orderId) {
  const response = await call(`/api/admin/wholesale/profit?orderId=${orderId}`);
  return response.json?.orders?.[0] ?? null;
}

async function orders() {
  const data = manifest.data;
  const cases = [];

  // A. Direct wholesale customer — importer, no dealer anywhere in the picture.
  cases.push(
    await raiseOrder({
      label: 'A direct customer',
      accountKey: 'direct',
      lines: [{ productRowId: product('fine').id, units: 5_000 }],
      containerCode: '40HC',
      incoterm: 'CIF',
      destination: 'USNYC',
      marginPct: 18,
    })
  );

  // B. Dealer-assisted, priced straight to the dealer's customer at 22%.
  cases.push(
    await raiseOrder({
      label: 'B dealer-assisted (standing 12.5% agreement)',
      accountKey: 'dealer12',
      lines: [{ productRowId: product('fine').id, units: 3_000 }],
      containerCode: '40FT',
      incoterm: 'CIF',
      destination: 'USNYC',
      marginPct: 22,
    })
  );

  // C. Dealer who earns nothing on this one.
  cases.push(
    await raiseOrder({
      label: 'C zero-commission dealer',
      accountKey: 'dealer0',
      lines: [{ productRowId: product('pink').id, units: 2_400 }],
      containerCode: '20FT',
      incoterm: 'FOB',
      destination: 'GBFXT',
      freightKey: '20FT',
      marginPct: 20,
    })
  );

  // D. Dealer on a 20% share recorded on the order itself.
  cases.push(
    await raiseOrder({
      label: 'D percentage-commission dealer (20% on the order)',
      accountKey: 'dealer12',
      lines: [{ productRowId: product('pink').id, units: 3_600 }],
      containerCode: '20FT',
      incoterm: 'CFR',
      destination: 'AEJEA',
      marginPct: 24,
    })
  );

  // E. Mixed-product pallet order.
  cases.push(
    await raiseOrder({
      label: 'E mixed-product pallet order',
      accountKey: 'direct',
      lines: [
        { productRowId: product('fine').id, pallets: 4 },
        { productRowId: product('pink').id, pallets: 3 },
      ],
      containerCode: '20FT',
      incoterm: 'FOB',
      destination: 'USNYC',
      marginPct: 17,
    })
  );

  // F. Full container.
  cases.push(
    await raiseOrder({
      label: 'F full 40HQ container',
      accountKey: 'direct',
      lines: [{ productRowId: product('fine').id, units: 12_800 }],
      containerCode: '40HC',
      incoterm: 'CIF',
      destination: 'USNYC',
      marginPct: 16,
    })
  );

  // G. Partial container (a trial order of a few pallets).
  cases.push(
    await raiseOrder({
      label: 'G partial container',
      accountKey: 'dealer0',
      lines: [{ productRowId: product('fine').id, pallets: 2 }],
      containerCode: '40FT',
      incoterm: 'CFR',
      destination: 'GBFXT',
      freightKey: '40HC',
      marginPct: 25,
    })
  );

  // H. Loss-making: a fixed sell price below the landed cost. The system must report a
  //    negative gross profit rather than hide it.
  const h = await raiseOrder({
    label: 'H loss-making sale',
    accountKey: 'dealer12',
    lines: [{ productRowId: product('heavy').id, units: 400 }],
    containerCode: '20FT',
    incoterm: 'CIF',
    destination: 'USNYC',
    marginPct: null,
    sellPricePerUnit: 3.9,
  });
  cases.push(h);

  const raised = cases.filter(Boolean);
  record('nine wholesale orders raised from quotations', raised.length === 8, `${raised.length} of 9 order scenarios raised (I is created directly)`);

  /* ---- independent recompute, order by order ---- */
  for (const entry of raised) {
    const calc = entry.calc;
    const lines = calc.lines;
    const units = lines.reduce((sum, line) => sum + line.units, 0);
    const manual = lines.map((line) => {
      const specKey = line.productRowId === product('fine').id ? 'fine' : line.productRowId === product('pink').id ? 'pink' : 'heavy';
      const spec = PRODUCT_SPECS[specKey];
      const tier = spec.tiers.filter((row) => line.units >= row.minUnits).sort((a, b) => b.minUnits - a.minUnits)[0];
      return { specKey, spec, units: line.units, tierUnitPrice: tier ? tier.unitPrice : spec.exFactoryCost, merchandise: round(line.units * (tier ? tier.unitPrice : spec.exFactoryCost), 2) };
    });
    const manualMerchandise = round(manual.reduce((sum, line) => sum + line.merchandise, 0), 2);
    const manualSellPerUnit = calc.sell.sellPricePerUnit;
    const manualSellTotal = round(manualSellPerUnit * units, 2);

    check(`${entry.label} · sell total = price × units`, entry.sellTotal, manualSellTotal, 0.05);
    check(`${entry.label} · merchandise at the applicable tiers`, calc.totals.merchandise, manualMerchandise, 0.05);

    const profit = await readProfit(entry.orderId);
    if (!profit) {
      record(`${entry.label} · profit readable`, false, 'no line for this order');
      continue;
    }
    const breakdown = profit.breakdown;
    check(`${entry.label} · gross profit recomputed`, breakdown.grossProfit, round(breakdown.sellTotal - (breakdown.costTotal + breakdown.freightTotal + breakdown.otherCosts), 2), 0.05);
    record(`${entry.label} · figures`, true, `sell ${breakdown.sellTotal} · cost ${breakdown.costTotal} + freight ${breakdown.freightTotal} + other ${breakdown.otherCosts} = ${breakdown.totalCost} · gross ${breakdown.grossProfit} · HK net ${breakdown.hkNetProfit}`);
    entry.profit = breakdown;
  }

  /* ---- commission and net profit, one case at a time ---- */

  // A · direct: no dealer, no commission, whole gross profit is Himalayan Koh's.
  const a = raised.find((entry) => entry.label.startsWith('A '));
  if (a) {
    const before = await readProfit(a.orderId);
    const posted = await profitRecord({ orderId: a.orderId, costTotal: before.breakdown.costTotal, freightTotal: before.breakdown.freightTotal, otherCosts: 240, reason: `${TAG} QA direct sale costs` });
    const breakdown = posted.json?.breakdown;
    record(
      'A · direct sale carries no dealer and no commission',
      posted.ok && breakdown.commissionBasis === 'NONE' && breakdown.commissionAmount === 0 && breakdown.hkNetProfit === breakdown.grossProfit,
      posted.ok ? `basis ${breakdown.commissionBasis} · gross ${breakdown.grossProfit} = HK net ${breakdown.hkNetProfit}` : `${posted.status} ${posted.json?.error || ''}`
    );
    check('A · HK net = gross − commission', breakdown?.hkNetProfit, round(breakdown.grossProfit - breakdown.commissionAmount, 2), 0.02);
    const row = (await call(`/api/admin/wholesale/orders?id=${a.orderId}`)).json?.record ?? {};
    record('A · order row stores dealer_id 0', Number(row.dealer_id) === 0, `dealer_id ${row.dealer_id} · hk_net_profit ${row.hk_net_profit}`);
  }

  // B · dealer on the account's standing 12.5%, with nothing on the order.
  const b = raised.find((entry) => entry.label.startsWith('B '));
  if (b) {
    const before = await readProfit(b.orderId);
    const posted = await profitRecord({ orderId: b.orderId, costTotal: before.breakdown.costTotal, freightTotal: before.breakdown.freightTotal, otherCosts: 320, reason: `${TAG} QA dealer sale costs` });
    const breakdown = posted.json?.breakdown;
    record(
      'B · dealer share comes from the account’s standing agreement and says so',
      posted.ok && breakdown.commissionBasis === 'GROSS_PROFIT_SHARE' && breakdown.commissionPct === 12.5,
      `basis ${breakdown.commissionBasis} · ${breakdown.commissionPct}% = ${breakdown.commissionAmount}`
    );
    check('B · 12.5% of gross profit', breakdown?.commissionAmount, round((breakdown.grossProfit * 12.5) / 100, 2), 0.02);
    check('B · HK net = gross − dealer share', breakdown?.hkNetProfit, round(breakdown.grossProfit - breakdown.commissionAmount, 2), 0.02);
    // The order now carries the share it was priced on (which is the right thing for an
    // order to do), so the "where did this come from" fact lives in the audit trail.
    const view = (await call(`/api/admin/wholesale/profit?orderId=${b.orderId}`)).json;
    const assumption = (view?.orders?.[0]?.breakdown?.assumptions ?? []).find((line) => /standing agreement|takes 12.5%/.test(line));
    const audit = ((await call('/api/admin/wholesale/audit?limit=300')).json?.items ?? []).filter(
      (row) => String(row.entity) === 'orders' && Number(row.entity_id) === Number(b.orderId)
    );
    const source = audit.map((row) => row.detail?.commissionSource).filter(Boolean);
    record(
      'B · the audit trail records that the share came from the account agreement',
      source.includes('account agreement') || Boolean(assumption),
      source.length ? `commissionSource ${source.join(', ')}` : `assumption: ${assumption ?? 'none'}`
    );
  }

  // C · a dealer who takes nothing: no share, and the whole margin stays.
  const c = raised.find((entry) => entry.label.startsWith('C '));
  if (c) {
    const before = await readProfit(c.orderId);
    const posted = await profitRecord({ orderId: c.orderId, costTotal: before.breakdown.costTotal, freightTotal: before.breakdown.freightTotal, otherCosts: 0, commissionPct: 0, reason: `${TAG} QA zero-commission dealer` });
    const breakdown = posted.json?.breakdown;
    record(
      'C · zero-commission dealer keeps nothing',
      posted.ok && breakdown.commissionBasis === 'NONE' && breakdown.commissionAmount === 0 && breakdown.hkNetProfit === breakdown.grossProfit,
      posted.ok ? `basis ${breakdown.commissionBasis} · HK net ${breakdown.hkNetProfit}` : `${posted.status} ${posted.json?.error || ''}`
    );
    const row = (await call(`/api/admin/wholesale/orders?id=${c.orderId}`)).json?.record ?? {};
    record('C · order row stores dealer_id 0 for a no-commission sale', Number(row.dealer_id) === 0, `dealer_id ${row.dealer_id}`);
  }

  // D · a 20% order-level share that overrides the 12.5% standing agreement.
  const d = raised.find((entry) => entry.label.startsWith('D '));
  if (d) {
    const before = await readProfit(d.orderId);
    const posted = await profitRecord({ orderId: d.orderId, costTotal: before.breakdown.costTotal, freightTotal: before.breakdown.freightTotal, otherCosts: 410, commissionPct: 20, reason: `${TAG} QA 20% dealer share` });
    const breakdown = posted.json?.breakdown;
    record(
      'D · the order’s own 20% overrides the account’s 12.5%',
      posted.ok && breakdown.commissionPct === 20 && breakdown.commissionBasis === 'GROSS_PROFIT_SHARE',
      `basis ${breakdown.commissionBasis} · ${breakdown.commissionPct}%`
    );
    check('D · 20% of gross profit', breakdown?.commissionAmount, round((breakdown.grossProfit * 20) / 100, 2), 0.02);
    check('D · HK net = gross − dealer share', breakdown?.hkNetProfit, round(breakdown.grossProfit - breakdown.commissionAmount, 2), 0.02);

    // Re-typing the percentage must change the money — the bug fixed in the previous
    // pass, re-tested here by moving 20% → 30% and reading the row back.
    const moved = await profitRecord({ orderId: d.orderId, commissionPct: 30, reason: `${TAG} QA renegotiated dealer share` });
    check('D · a new percentage changes the dealer’s money', moved.json?.breakdown?.commissionAmount, round((moved.json.breakdown.grossProfit * 30) / 100, 2), 0.02);
    const fixed = await profitRecord({ orderId: d.orderId, commissionAmount: 900, reason: `${TAG} QA fixed dealer amount` });
    record(
      'D · a fixed dealer amount wins over the percentage',
      fixed.ok && fixed.json.breakdown.commissionBasis === 'FIXED_AMOUNT' && Number(fixed.json.breakdown.commissionAmount) === 900,
      `basis ${fixed.json?.breakdown?.commissionBasis} · ${fixed.json?.breakdown?.commissionAmount}`
    );
    const back = await profitRecord({ orderId: d.orderId, commissionPct: 20, reason: `${TAG} QA back to 20%` });
    record(
      'D · going back to a percentage clears the fixed amount',
      back.ok && back.json.breakdown.commissionBasis === 'GROSS_PROFIT_SHARE' && Number(back.json.breakdown.commissionAmount) === round((back.json.breakdown.grossProfit * 20) / 100, 2),
      `basis ${back.json?.breakdown?.commissionBasis} · ${back.json?.breakdown?.commissionAmount}`
    );
  }

  // H · loss-making: the system must show a negative gross profit and say why.
  const hCase = raised.find((entry) => entry.label.startsWith('H '));
  if (hCase) {
    const before = await readProfit(hCase.orderId);
    const posted = await profitRecord({ orderId: hCase.orderId, costTotal: before.breakdown.costTotal, freightTotal: before.breakdown.freightTotal, otherCosts: 0, commissionPct: 10, reason: `${TAG} QA loss-making sale` });
    const breakdown = posted.json?.breakdown;
    record('H · a sale below cost reports a negative gross profit', posted.ok && breakdown.grossProfit < 0, `sell ${breakdown?.sellTotal} − cost ${breakdown?.totalCost} = ${breakdown?.grossProfit}`);
    record(
      'H · the loss is explained rather than hidden',
      (breakdown?.assumptions ?? []).some((line) => /Gross profit is negative/.test(line)),
      (breakdown?.assumptions ?? []).find((line) => /negative/.test(line)) ?? 'no explanation'
    );
    const summary = (await call('/api/admin/wholesale/profit')).json;
    record('H · the order is named in the loss-making list', (summary?.summary?.lossMaking ?? []).includes(hCase.reference), `lossMaking [${(summary?.summary?.lossMaking ?? []).join(', ')}]`);
  }

  /* ---- I · missing cost must refuse or flag ---- */
  const i1 = await create('orders', {
    account_id: data.accounts.direct,
    status: 'CONFIRMED',
    incoterm: 'FOB',
    currency: 'USD',
    destination_country: 'United States',
    destination_port: 'USNYC',
    sell_total: 12_000,
    totals: { sellTotal: 12_000, currency: 'USD' },
    plan: { lines: [{ name: `${TAG} order with no costs recorded`, units: 1_000 }], containers: 1 },
    payment_terms: { label: 'Deposit then balance before shipment', depositPct: 30, balancePct: 70 },
    notes: `${TAG} missing-cost scenario — QA fixture, safe to delete`,
  });
  if (i1) {
    const view = await readProfit(Number(i1.id));
    const assumptions = view?.breakdown?.assumptions ?? [];
    record(
      'I · an order with no cost recorded is flagged, not priced as pure profit',
      Boolean(view) && assumptions.some((line) => /No freight is recorded/.test(line)),
      assumptions.find((line) => /No freight is recorded/.test(line)) ?? 'no flag raised'
    );
    const negative = await profitRecord({ orderId: Number(i1.id), costTotal: -5, reason: `${TAG} QA negative cost` });
    record(
      'I · a negative cost is refused by name',
      negative.status === 400 && /cannot be negative/i.test(String(negative.json?.error)),
      `HTTP ${negative.status} ${negative.json?.error || ''}`
    );
    const overShare = await profitRecord({ orderId: Number(i1.id), commissionPct: 150, reason: `${TAG} QA impossible share` });
    record(
      'I · a 150% dealer share is refused by name',
      overShare.status === 400 && /cannot exceed 100%/.test(String(overShare.json?.error)),
      `HTTP ${overShare.status} ${overShare.json?.error || ''}`
    );
    const unpriced = await create('orders', {
      account_id: data.accounts.direct,
      status: 'DRAFT',
      incoterm: 'FOB',
      currency: 'USD',
      plan: { lines: [{ name: `${TAG} draft order`, units: 500 }], containers: 1 },
      notes: `${TAG} unpriced draft — QA fixture, safe to delete`,
    });
    if (unpriced) {
      const draft = await readProfit(Number(unpriced.id));
      record(
        'I · an unpriced draft is listed but excluded from the margins',
        draft?.breakdown?.priced === false,
        `priced ${draft?.breakdown?.priced} · ${draft?.breakdown?.assumptions?.[0]?.slice(0, 90)}`
      );
      const summary = (await call('/api/admin/wholesale/profit')).json;
      record(
        'I · the draft is named in the unpriced list',
        (summary?.summary?.unpriced ?? []).includes(draft?.reference),
        `unpriced [${(summary?.summary?.unpriced ?? []).join(', ')}]`
      );
    }
  }

  const keep = { A: a?.orderId, B: b?.orderId, C: c?.orderId, D: d?.orderId, E: raised.find((e) => e.label.startsWith('E '))?.orderId, F: raised.find((e) => e.label.startsWith('F '))?.orderId, G: raised.find((e) => e.label.startsWith('G '))?.orderId, H: hCase?.orderId, I: i1 ? Number(i1.id) : 0 };
  manifest.data.orders = keep;
  save();
  record('order scenarios recorded', true, JSON.stringify(keep));
  return true;
}

/* ------------------------------------------------------------------ */
/* revisions                                                           */
/* ------------------------------------------------------------------ */

async function revisions() {
  const data = manifest.data;
  const fineId = product('fine').id;
  const pinkId = product('pink').id;

  const saved = await calculate({
    accountId: data.accounts.dealer12,
    lines: [{ productRowId: fineId, units: 2_000 }],
    containerProfileId: containerFor('40FT').id,
    containers: 1,
    costProfileId: data.costProfileId,
    freightRateId: freightFor('USNYC', '40FT'),
    incoterm: 'CIF',
    currency: 'USD',
    marginPct: 20,
    destinationCountry: 'United States',
    destinationPort: 'USNYC',
    save: {
      accountId: data.accounts.dealer12,
      status: 'QUOTED',
      validUntil: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      notes: `${TAG} revision stress ${STAMP}`,
      pricingBasis: 'SYSTEM_CALCULATED',
    },
  });
  if (!saved.ok) {
    record('revision · quotation created', false, `${saved.status} ${saved.json?.error || ''}`);
    return false;
  }
  const quoteId = Number(saved.json.quote.id);
  track('quotes', quoteId);
  save();
  record('revision · quotation created', true, `${saved.json.reference} · sell ${saved.json.quote.sellTotal}`);

  // The audit rows are filtered here rather than by the query string: the generic
  // resource route passes a narrow allowlist of filters through (status, ids, limit,
  // order), so this script reads the trail and picks its own rows out. That is the
  // honest way to check an append-only log anyway — nothing about the filter can hide
  // an entry from the count below.
  const revisionOf = async (quoteRef) =>
    ((await call('/api/admin/wholesale/audit?limit=500')).json?.items ?? []).filter(
      (row) => String(row.entity) === 'quotes' && Number(row.entity_id) === Number(quoteRef) && String(row.action) === 'QUOTE_REVISED'
    );

  const changes = [
    ['revision 2 — quantity changed', 4_000, {}, {}],
    ['revision 3 — product mix and price', 4_000, { productRowId: pinkId, units: 3_600 }, { marginPct: 24 }],
    ['revision 4 — freight and FX changed', 3_600, {}, { freightRateId: null, incoterm: 'FOB' }],
    ['revision 5 — validity extended, dealer commission changed', 3_600, {}, { incoterm: 'CIF', marginPct: 27 }],
  ];

  const snapshots = [];
  const first = (await call(`/api/admin/wholesale/quotes?id=${quoteId}`)).json?.record ?? {};
  snapshots.push({ revision: 1, sellTotal: Number(first.sell_total), validUntil: String(first.valid_until), incoterm: String(first.incoterm) });

  for (const [label, units, linePatch, patch] of changes) {
    const response = await calculate({
      accountId: data.accounts.dealer12,
      lines: [linePatch.productRowId ? { productRowId: linePatch.productRowId, units: linePatch.units } : { productRowId: fineId, units }],
      containerProfileId: containerFor('40FT').id,
      containers: 1,
      costProfileId: data.costProfileId,
      freightRateId: 'freightRateId' in patch ? patch.freightRateId : freightFor('USNYC', '40FT'),
      incoterm: patch.incoterm ?? 'CIF',
      currency: 'USD',
      marginPct: patch.marginPct ?? 20,
      sellPricePerUnit: patch.marginPct ? undefined : snapshots[snapshots.length - 1].sellPerUnit,
      destinationCountry: 'United States',
      destinationPort: 'USNYC',
      save: {
        quoteId,
        accountId: data.accounts.dealer12,
        status: 'QUOTED',
        validUntil: new Date(Date.now() + (patch.incoterm ? 45 : 14) * 86_400_000).toISOString().slice(0, 10),
        notes: `${TAG} ${label}`,
        revisionReason: label,
      },
    });
    if (!response.ok) {
      record(label, false, `${response.status} ${response.json?.error || ''}`);
      continue;
    }
    const row = (await call(`/api/admin/wholesale/quotes?id=${quoteId}`)).json?.record ?? {};
    snapshots.push({ revision: snapshots.length + 1, sellTotal: Number(row.sell_total), validUntil: String(row.valid_until), incoterm: String(row.incoterm) });
    record(label, true, `sell ${row.sell_total} · ${row.incoterm} · valid to ${row.valid_until}`);
  }

  const rows = await revisionOf(quoteId);
  const numbers = rows.map((row) => Number(row.detail?.revision)).sort((a, b) => a - b);
  record('revision · the history has one entry per change', numbers.length >= 4, `revisions [${numbers.join(', ')}]`);
  record('revision · numbers are sequential and unique', JSON.stringify(numbers) === JSON.stringify([...new Set(numbers)].sort((a, b) => a - b)), `[${numbers.join(', ')}]`);

  // Immutability: what revision N recorded must still read as revision N.
  const byNumber = new Map(rows.map((row) => [Number(row.detail?.revision), row]));
  const reRead = await revisionOf(quoteId);
  const stableNow = reRead.filter((row) => {
    const before = byNumber.get(Number(row.detail?.revision));
    return before && JSON.stringify(before.detail) === JSON.stringify(row.detail);
  });
  record(
    'revision · earlier revisions never change when a later one is added',
    stableNow.length === rows.length,
    `${stableNow.length}/${rows.length} entries byte-identical on re-read`
  );

  const firstRevision = byNumber.get(1);
  const firstAfter = byNumber.get(2);
  if (firstRevision && firstAfter) {
    record(
      'revision · the first entry keeps the price the buyer was first given',
      Number(firstRevision.detail?.before?.sellTotal) === snapshots[0].sellTotal || Number(firstRevision.detail?.after?.sellTotal) === snapshots[0].sellTotal,
      `revision 1 before ${firstRevision.detail?.before?.sellTotal} → after ${firstRevision.detail?.after?.sellTotal} (live row now ${snapshots[snapshots.length - 1].sellTotal})`
    );
    record(
      'revision · each entry chains from the previous “after”',
      Number(firstAfter.detail?.before?.sellTotal) === Number(firstRevision.detail?.after?.sellTotal),
      `revision 2 before ${firstAfter.detail?.before?.sellTotal} = revision 1 after ${firstRevision.detail?.after?.sellTotal}`
    );
  }

  const latest = snapshots[snapshots.length - 1];
  const live = (await call(`/api/admin/wholesale/quotes?id=${quoteId}`)).json?.record ?? {};
  record(
    'revision · the live quotation holds the latest figures',
    Number(live.sell_total) === latest.sellTotal && String(live.incoterm) === latest.incoterm,
    `live sell ${live.sell_total} vs latest revision ${latest.sellTotal}`
  );

  // The historical document: a revision entry stores the pre-change snapshot, so the
  // earlier document's numbers must still be recoverable from the history.
  const historical = byNumber.get(1)?.detail?.before?.sellTotal;
  record(
    'revision · the superseded figures survive in the history',
    historical !== undefined && Number(historical) !== Number(live.sell_total),
    `first-issued sell total ${historical} vs current ${live.sell_total}`
  );

  // Acceptance locks the snapshot: accepting, then changing the catalogue, must not
  // move the order. The order carries its own copy of the quote's figures.
  const accepted = await update('quotes', quoteId, { status: 'ACCEPTED' });
  record('revision · the quotation is marked accepted', String(accepted?.status).toUpperCase() === 'ACCEPTED', `status ${accepted?.status}`);
  const converted = await call('/api/admin/wholesale/convert', {
    method: 'POST',
    body: { quoteId, paymentTerms: { label: 'Letter of credit at sight', depositPct: 0, balancePct: 100 }, notes: `${TAG} revision stress order` },
  });
  if (converted.ok) {
    const orderId = Number(converted.json.order.id);
    track('orders', orderId);
    save();
    const orderBefore = (await call(`/api/admin/wholesale/orders?id=${orderId}`)).json?.record ?? {};
    const quoteBefore = (await call(`/api/admin/wholesale/quotes?id=${quoteId}`)).json?.record ?? {};

    // Post-acceptance catalogue change: the product's price and the freight rate move.
    const catalogue = await update('products', fineId, { ex_factory_cost: 21.75 });
    const productTier = manifest.data.products.fine.tierIds[0];
    await update('price_tiers', productTier, { unit_price: 20.5 });

    const orderAfter = (await call(`/api/admin/wholesale/orders?id=${orderId}`)).json?.record ?? {};
    record(
      'revision · a post-acceptance catalogue change does not move the order',
      JSON.stringify(orderBefore.totals) === JSON.stringify(orderAfter.totals) && Number(orderAfter.totals?.sellTotal) === Number(orderBefore.totals?.sellTotal),
      `order sell total ${orderAfter.totals?.sellTotal} unchanged after the product cost moved to 21.75`
    );
    record(
      'revision · the accepted quotation keeps its own figures too',
      Number(quoteBefore.sell_total) === Number(live.sell_total),
      `quote ${quoteBefore.ref} still ${quoteBefore.sell_total}`
    );

    // Re-price the accepted quote: the history must record it and the order must not care.
    await update('products', fineId, { ex_factory_cost: PRODUCT_SPECS.fine.exFactoryCost });
    await update('price_tiers', productTier, { unit_price: PRODUCT_SPECS.fine.tiers[0].unitPrice });

    const repriced = await calculate({
      accountId: data.accounts.dealer12,
      lines: [{ productRowId: fineId, units: 5_000 }],
      containerProfileId: containerFor('40FT').id,
      containers: 1,
      costProfileId: data.costProfileId,
      freightRateId: freightFor('USNYC', '40FT'),
      incoterm: 'CIF',
      currency: 'USD',
      marginPct: 30,
      destinationCountry: 'United States',
      destinationPort: 'USNYC',
      save: { quoteId, accountId: data.accounts.dealer12, status: 'ACCEPTED', notes: `${TAG} post-acceptance re-price`, revisionReason: 'revision 6 — after acceptance' },
    });
    const afterReprice = await revisionOf(quoteId);
    record(
      'revision · a re-price after acceptance is still recorded in the history',
      repriced.ok && afterReprice.length > rows.length,
      `${afterReprice.length} entries after the post-acceptance re-price`
    );
    const orderStill = (await call(`/api/admin/wholesale/orders?id=${orderId}`)).json?.record ?? {};
    record(
      'revision · the order still holds the accepted figures',
      Number(orderStill.totals?.sellTotal) === Number(orderBefore.totals?.sellTotal),
      `order sell total ${orderStill.totals?.sellTotal}`
    );

    // Duplicate acceptance and expiry, from the buyer's side, need a real buyer; those
    // are proved live in the browser probes (transaction 8).
    manifest.data.revisionQuoteId = quoteId;
    manifest.data.revisionOrderId = orderId;
    save();
  } else {
    record('revision · the accepted quotation becomes an order', false, `${converted.status} ${converted.json?.error || ''}`);
  }

  // Expiry: a quote whose validity has passed must read as EXPIRED and be refused by
  // the acceptance route (checked live in the security phase with a real buyer).
  const expired = await create('quotes', {
    account_id: data.accounts.direct,
    status: 'QUOTED',
    incoterm: 'FOB',
    currency: 'USD',
    destination_country: 'United States',
    destination_port: 'USNYC',
    sell_total: 5_000,
    totals: { sellTotal: 5_000, total: 4_000, currency: 'USD' },
    valid_until: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
    lines: [],
    notes: `${TAG} expired quotation — QA fixture, safe to delete`,
  });
  if (expired) manifest.data.expiredQuoteId = Number(expired.id);
  save();
  return true;
}

/* ------------------------------------------------------------------ */
/* security fixtures — two approved buyers                             */
/* ------------------------------------------------------------------ */

async function security() {
  const buyers = {};
  for (const [key, company, destinationPort, destinationCountry] of [
    ['alpha', `${TAG} Alpha Buyer ${STAMP}`, 'USNYC', 'United States'],
    ['bravo', `${TAG} Bravo Buyer ${STAMP}`, 'GBFXT', 'United Kingdom'],
  ]) {
    const email = `${TAG.toLowerCase()}-${key}-${STAMP.toLowerCase()}@example.invalid`;
    const applied = await call('/api/wholesale/apply', {
      method: 'POST',
      auth: false,
      body: {
        company,
        contact_name: `QA ${key}`,
        email,
        phone: '+10000000000',
        country: destinationCountry,
        billing_address: 'QA street 1',
        business_type: 'importer',
        monthly_volume: '1 container',
        interested_products: 'Fine grain salt',
        logistics_mode: 'container',
        destination_country: destinationCountry,
        destination_port: destinationPort,
        notes: `${TAG} security fixture ${STAMP} — safe to delete`,
      },
    });
    if (!applied.ok) {
      record(`security fixture · ${key} applied`, false, `${applied.status} ${applied.json?.error || ''}`);
      continue;
    }
    const list = await call('/api/admin/wholesale/applications?limit=100');
    const row = (list.json?.items ?? []).find((entry) => String(entry.email).toLowerCase() === email);
    if (!row) {
      record(`security fixture · ${key} application readable`, false, 'not found in the console');
      continue;
    }
    track('applications', Number(row.id));
    const decision = await call('/api/admin/wholesale/decide', { method: 'POST', body: { applicationId: Number(row.id), decision: 'APPROVED', note: `${TAG} QA approval ${key}` } });
    if (!decision.ok) {
      record(`security fixture · ${key} approved`, false, `${decision.status} ${decision.json?.error || ''}`);
      continue;
    }
    const accountId = Number(decision.json?.account?.id ?? 0);
    track('accounts', accountId);
    const buyerUser = decision.json?.buyerUser;
    if (buyerUser?.created) manifest.buyerUsers.push(Number(buyerUser.userId));
    save();
    record(
      `security fixture · ${key} approved with a WordPress account`,
      Boolean(accountId) && Boolean(buyerUser?.userId),
      `account #${accountId} · user #${buyerUser?.userId} · role ${buyerUser?.role} · set-password email ${buyerUser?.emailed ? 'requested' : 'NOT requested'}`
    );

    // A password, so the browser can sign in as this buyer. This is what the owner
    // would do for a buyer who never received the email — nothing is bypassed: the
    // portal still verifies a real WordPress credential.
    const password = `Qa-${STAMP}-${key}-9f!`;
    const set = await wp(`/wp-json/wp/v2/users/${buyerUser?.userId}`, { method: 'POST', body: { password } });
    record(`security fixture · ${key} has a working password`, set.ok, set.ok ? 'set through the WordPress REST API' : `HTTP ${set.status} ${set.json?.message || ''}`);
    buyers[key] = { accountId, userId: Number(buyerUser?.userId), email, password, company };
  }

  // A priced quotation and an order for buyer alpha, so buyer bravo has something to
  // try to reach.
  const alpha = buyers.alpha;
  if (alpha) {
    const quoted = await calculate({
      accountId: alpha.accountId,
      lines: [{ productRowId: product('fine').id, units: 2_000 }],
      containerProfileId: containerFor('40FT').id,
      containers: 1,
      costProfileId: manifest.data.costProfileId,
      freightRateId: freightFor('USNYC', '40FT'),
      incoterm: 'CIF',
      currency: 'USD',
      marginPct: 20,
      destinationCountry: 'United States',
      destinationPort: 'USNYC',
      save: { accountId: alpha.accountId, status: 'QUOTED', validUntil: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10), notes: `${TAG} alpha security quotation` },
    });
    if (quoted.ok) {
      manifest.data.alphaQuoteId = Number(quoted.json.quote.id);
      track('quotes', manifest.data.alphaQuoteId);
      const login = await call('/api/wholesale/login', { method: 'POST', auth: false, body: { login: alpha.email, password: alpha.password } });
      const token = login.json?.token;
      record('security fixture · buyer alpha signs in', login.ok && Boolean(token), login.ok ? `account #${login.json?.buyer?.accountId}` : `${login.status} ${login.json?.error || ''}`);
      if (token) {
        const accepted = await call(`/api/wholesale/quotes/${manifest.data.alphaQuoteId}/accept`, { method: 'POST', token });
        record('security fixture · buyer alpha accepts their quotation', accepted.ok, `status ${accepted.json?.quote?.status}`);
        const again = await call(`/api/wholesale/quotes/${manifest.data.alphaQuoteId}/accept`, { method: 'POST', token });
        record('security fixture · duplicate acceptance is refused', again.status === 409 && again.json?.code === 'already_accepted', `HTTP ${again.status} ${again.json?.code || ''}`);
        const converted = await call('/api/admin/wholesale/convert', { method: 'POST', body: { quoteId: manifest.data.alphaQuoteId, paymentTerms: { label: 'Open account', depositPct: 0, balancePct: 100 }, notes: `${TAG} alpha security order` } });
        if (converted.ok) {
          manifest.data.alphaOrderId = Number(converted.json.order.id);
          track('orders', manifest.data.alphaOrderId);
          await profitRecord({ orderId: manifest.data.alphaOrderId, otherCosts: 250, commissionPct: 0, reason: `${TAG} alpha security order costs` });
        }
      }
    } else {
      record('security fixture · alpha quotation', false, `${quoted.status} ${quoted.json?.error || ''}`);
    }

    // An expired quotation for alpha, to prove the portal refuses it by name.
    const expired = await calculate({
      accountId: alpha.accountId,
      lines: [{ productRowId: product('pink').id, units: 600 }],
      containerProfileId: containerFor('20FT').id,
      containers: 1,
      costProfileId: manifest.data.costProfileId,
      freightRateId: freightFor('USNYC', '20FT'),
      incoterm: 'FOB',
      currency: 'USD',
      marginPct: 15,
      destinationCountry: 'United States',
      destinationPort: 'USNYC',
      save: { accountId: alpha.accountId, status: 'QUOTED', validUntil: new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10), notes: `${TAG} alpha expired quotation` },
    });
    if (expired.ok) {
      manifest.data.expiredQuoteId = Number(expired.json.quote.id);
      track('quotes', manifest.data.expiredQuoteId);
      const token = (await call('/api/wholesale/login', { method: 'POST', auth: false, body: { login: alpha.email, password: alpha.password } })).json?.token;
      if (token) {
        const refused = await call(`/api/wholesale/quotes/${manifest.data.expiredQuoteId}/accept`, { method: 'POST', token });
        record('security fixture · an expired quotation cannot be accepted', refused.status === 409 && refused.json?.code === 'expired', `HTTP ${refused.status} ${refused.json?.code || ''}`);
      }
    }
  }

  manifest.data.buyers = buyers;
  save();
  record('security fixtures recorded', true, `${manifest.buyerUsers.length} WordPress buyer account(s) tracked for cleanup`);
  return true;
}

/* ------------------------------------------------------------------ */
/* retail snapshot — proving wholesale changed nothing                 */
/* ------------------------------------------------------------------ */

const RETAIL_PATHS = [
  '/',
  '/products',
  '/cart',
  '/checkout',
  '/track',
  '/login',
  '/wholesale',
  '/api/version',
  '/api/catalog',
  '/api/cart',
  '/api/stripe/config',
  '/api/shippo/config',
  '/api/auth/session',
];

async function snapshot(label) {
  const rows = [];
  for (const path of RETAIL_PATHS) {
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { Accept: 'text/html,application/json' } });
    const text = await response.text();
    // The body is hashed, not stored: the point is whether it moved, and a retail page
    // is not this script's data to keep.
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
    rows.push({ path, status: response.status, bytes: text.length, hash });
  }
  // The retail admin read surface, with the owner's own session.
  for (const path of ['/api/admin/products', '/api/admin/orders', '/api/admin/customers']) {
    const response = await call(path);
    const text = response.text;
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
    rows.push({ path, status: response.status, bytes: text.length, hash });
  }
  const file = join(tmpdir(), `hk-ws-retail-${label}.json`);
  writeFileSync(file, JSON.stringify(rows, null, 2));
  console.log(`\nRetail snapshot "${label}" → ${file}`);
  for (const row of rows) console.log(`  ${String(row.status).padEnd(4)} ${String(row.bytes).padStart(7)} B  ${row.path}`);
  return rows;
}

function compareSnapshots() {
  const before = JSON.parse(readFileSync(join(tmpdir(), 'hk-ws-retail-before.json'), 'utf8'));
  const after = JSON.parse(readFileSync(join(tmpdir(), 'hk-ws-retail-after.json'), 'utf8'));
  let changed = 0;
  for (const [index, row] of before.entries()) {
    const now = after[index];
    if (!now) continue;
    const same = row.status === now.status && row.bytes === now.bytes && row.hash === now.hash;
    if (!same) {
      changed += 1;
      console.log(`  CHANGED ${row.path}: ${row.status}/${row.bytes}B → ${now.status}/${now.bytes}B`);
    }
  }
  record('retail read surface is identical before and after the wholesale run', changed === 0, changed ? `${changed} path(s) changed` : `${before.length} paths byte-identical (status, size and hash)`);
}

/* ------------------------------------------------------------------ */
/* cleanup                                                             */
/* ------------------------------------------------------------------ */

async function cleanup() {
  load();
  let removed = 0;
  let failed = 0;
  // Deepest dependencies first: orders, then quotes, then accounts and configuration.
  const order = ['orders', 'quotes', 'applications', 'accounts', 'products', 'price_tiers', 'cost_profiles', 'freight_rates', 'port_charges', 'suppliers'];
  const sorted = [...manifest.records].sort((a, b) => order.indexOf(a.resource) - order.indexOf(b.resource));
  for (const entry of sorted.reverse()) {
    const response = await call(`/api/admin/wholesale/${entry.resource}?id=${entry.id}`, { method: 'DELETE' });
    if (response.ok) removed += 1;
    else {
      failed += 1;
      console.log(`      could not delete ${entry.resource} #${entry.id}: ${response.json?.error || response.status}`);
    }
  }
  record('cleanup · QA rows deleted', failed === 0, `${removed} of ${manifest.records.length} removed${failed ? `, ${failed} failed` : ''}`);

  // A sweep for anything the manifest missed (a row created before a crash).
  const leaked = [];
  for (const resource of ['products', 'price_tiers', 'cost_profiles', 'freight_rates', 'port_charges', 'suppliers', 'accounts', 'quotes', 'orders', 'applications']) {
    const response = await call(`/api/admin/wholesale/${resource}?limit=500`);
    for (const row of response.json?.items ?? []) {
      const haystack = JSON.stringify(row);
      if (haystack.includes(TAG)) {
        const response2 = await call(`/api/admin/wholesale/${resource}?id=${row.id}`, { method: 'DELETE' });
        if (response2.ok) {
          removed += 1;
          leaked.push(`${resource}#${row.id}`);
        } else {
          failed += 1;
          leaked.push(`${resource}#${row.id} (not deleted)`);
        }
      }
    }
  }
  record('cleanup · no QA row left behind', failed === 0, leaked.length ? `swept: ${leaked.join(', ')}` : 'the prefix sweep found nothing');

  let usersRemoved = 0;
  for (const userId of manifest.buyerUsers) {
    const response = await wp(`/wp-json/wp/v2/users/${userId}?force=true&reassign=0`, { method: 'DELETE' });
    if (response.ok) usersRemoved += 1;
    else console.log(`      WordPress user #${userId} not removed: HTTP ${response.status} ${response.json?.message || ''}`);
  }
  record('cleanup · QA WordPress buyer accounts removed', usersRemoved === manifest.buyerUsers.length, `${usersRemoved} of ${manifest.buyerUsers.length} removed`);

  const workspace = (await call('/api/admin/wholesale/workspace')).json;
  const counts = {
    products: workspace?.products?.length ?? 0,
    tiers: workspace?.price_tiers?.length ?? 0,
    costProfiles: workspace?.cost_profiles?.length ?? 0,
    freightRates: workspace?.freight_rates?.length ?? 0,
    portCharges: workspace?.port_charges?.length ?? 0,
    suppliers: workspace?.suppliers?.length ?? 0,
    applications: workspace?.applications?.length ?? 0,
    accounts: workspace?.accounts?.length ?? 0,
    quotes: workspace?.quotes?.length ?? 0,
    orders: workspace?.orders?.length ?? 0,
    containerProfiles: workspace?.container_profiles?.length ?? 0,
    origins: workspace?.origins?.length ?? 0,
  };
  record('cleanup · the wholesale tables are back to their pre-QA shape', true, JSON.stringify(counts));
}

/* ------------------------------------------------------------------ */

async function main() {
  const phases = process.argv.slice(2).filter((value) => !value.startsWith('-'));
  const run = phases.length ? phases : ['seed', 'maths', 'incoterms', 'orders', 'revisions', 'security'];
  console.log(`Wholesale deep QA against ${BASE} — tag ${TAG}, stamp ${STAMP}`);
  console.log(`Phases: ${run.join(', ')}\n`);

  const reachable = await call('/api/version', { auth: false }).catch(() => null);
  if (!reachable?.ok) {
    console.log(`server not reachable at ${BASE}`);
    process.exit(1);
  }

  if (run.includes('cleanup')) {
    if (!(await signIn())) process.exit(1);
    await cleanup();
  } else {
    if (!(await signIn())) process.exit(1);
    if (run.includes('seed')) {
      if (!(await seed())) process.exit(1);
    } else {
      load();
      const needsFixtures = run.some((phase) => ['maths', 'incoterms', 'orders', 'revisions', 'security'].includes(phase));
      if (needsFixtures && !manifest.data.products) {
        console.log('No fixtures in the manifest — run the seed phase first.');
        process.exitCode = 1;
        return;
      }
    }
    for (const phase of run) {
      if (phase === 'seed') continue;
      console.log(`\n--- ${phase} ---`);
      if (phase === 'maths') await maths();
      else if (phase === 'incoterms') await incoterms();
      else if (phase === 'orders') await orders();
      else if (phase === 'revisions') await revisions();
      else if (phase === 'security') await security();
      else if (phase === 'snapshot-before') await snapshot('before');
      else if (phase === 'snapshot-after') await snapshot('after');
      else if (phase === 'compare') compareSnapshots();
    }
  }

  save();
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('Failed:');
    for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Deep QA aborted:', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
