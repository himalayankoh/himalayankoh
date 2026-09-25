#!/usr/bin/env node
/**
 * Live end-to-end QA for the wholesale subsystem.
 *
 * Runs the whole trade flow against a running server and the real WordPress: a buyer
 * applies, the owner approves, the catalogue is priced, a container is calculated, a
 * quotation is issued and printed, it is accepted, an order is raised, the profit is
 * recorded and read back — then every test row is deleted again.
 *
 * Usage:
 *   node scripts/qa-wholesale.mjs                       # assumes http://127.0.0.1:3997
 *   BASE=https://preview.himalayankoh.com node scripts/qa-wholesale.mjs
 *
 * Two credential rules, both deliberate:
 *
 *   - The admin session is minted through the application's **own** login route with
 *     the WordPress administrator credential from the server env. Nothing is bypassed
 *     and nothing is invented.
 *   - No password, token or secret is ever printed. Failures print the server's own
 *     error text, which is the point of the exercise.
 *
 * Every record it creates is prefixed `QA-WS-` (or an obvious test company name) and
 * deleted at the end, so a run leaves no trade data behind.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'http://127.0.0.1:3997').replace(/\/+$/, '');
const TAG = `QA-WS-${Date.now().toString(36).toUpperCase()}`;
/**
 * The public application route allows five submissions an hour per caller, and that
 * limit is correct — an unauthenticated write must be bounded. A *test* run would
 * exhaust it after five runs, so each run presents its own forwarding address, which
 * is the key the limiter uses for a direct (non-Cloudflare) request. In production
 * Cloudflare sets `cf-connecting-ip` at the edge and that wins, so this convenience
 * cannot be used to get around the limit on a deployed system.
 */
const QA_CLIENT_IP = `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

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
const created = { application: null, account: null, quote: null, order: null, buyerUser: 0, email: '', buyerToken: '', seed: null, records: [] };
let adminToken = '';

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
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
    /* HTML (a document) or an error page */
  }
  return { status: response.status, ok: response.ok, json, text, headers: response.headers };
}

/* ------------------------------------------------------------------ */
/* 1. The owner's own session                                          */
/* ------------------------------------------------------------------ */

async function signIn() {
  const username = env.WORDPRESS_ADMIN_USER;
  const password = env.WORDPRESS_ADMIN_APP_PASSWORD;
  if (!username || !password) {
    record('admin sign-in (WordPress credential present)', false, 'WORDPRESS_ADMIN_USER / _APP_PASSWORD absent');
    return false;
  }

  const response = await call('/api/auth/admin/login', {
    method: 'POST',
    body: { username, password },
    auth: false,
  });

  if (!response.ok || typeof response.json?.token !== 'string') {
    record('admin sign-in through the app’s own route', false, `${response.status} ${response.json?.error || ''}`);
    return false;
  }

  adminToken = response.json.token;
  record('admin sign-in through the app’s own route', true, `role=${response.json.user?.role || 'admin'}`);
  return true;
}

/* ------------------------------------------------------------------ */
/* 2. Workspace, seeding and pricing                                   */
/* ------------------------------------------------------------------ */

async function workspace() {
  const response = await call('/api/admin/wholesale/workspace');
  if (!response.ok) {
    record('workspace read', false, `${response.status} ${response.json?.error || ''}`);
    return null;
  }
  const data = response.json;
  record(
    'workspace read',
    true,
    `plugin ${data.vocabulary?.pluginVersion || 'unknown'} · schema v${data.vocabulary?.pluginDbVersion || '?'} ` +
      `(installed v${data.vocabulary?.installedDbVersion || '?'}) · ${data.containerProfiles?.length ?? 0} containers · ${data.origins?.length ?? 0} origins`
  );
  // A missing table is the one failure the screens cannot show: every read returns an
  // empty list and only a write fails, so it is asserted before anything is priced.
  const missing = data.vocabulary?.missingTables ?? [];
  record(
    'the plugin reported a complete schema',
    missing.length === 0,
    missing.length ? `missing store(s): ${missing.join(', ')}${data.vocabulary?.schemaError ? ` — ${data.vocabulary.schemaError}` : ''}` : 'no table is missing'
  );
  return data;
}

async function saveRecord(resource, data, tag = `${TAG}-${resource}`) {
  const response = await call(`/api/admin/wholesale/${resource}`, { method: 'POST', body: { data } });
  if (!response.ok) {
    record(`create ${resource}`, false, `${response.status} ${response.json?.error || ''}`);
    return null;
  }
  const id = Number(response.json?.record?.id ?? 0);
  if (id) created.records.push({ resource, id });
  return { id, row: response.json?.record ?? {} };
}

async function catalogueSeed() {
  const origin = (await call('/api/admin/wholesale/origins?limit=5')).json?.items?.[0];
  if (!origin) {
    record('seeded origin available', false, 'no origins in the plugin');
    return null;
  }

  const product = await saveRecord('products', {
    name: `${TAG} Fine grain salt`,
    wholesale_sku: `${TAG}-FINE`,
    ex_factory_cost: 18.5,
    currency: 'USD',
    moq: 100,
    net_unit_weight_kg: 2.5,
    lead_time_days: 21,
    origin_id: Number(origin.id),
    active: true,
    packaging: {
      cartonQty: 4,
      packagedUnitWeightKg: 2.72,
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
  });
  if (!product) return null;

  const tier = await saveRecord('price_tiers', {
    product_id: product.id,
    min_units: 100,
    unit_price: 17.9,
    currency: 'USD',
  });

  const costProfile = await saveRecord('cost_profiles', {
    name: `${TAG} origin costs`,
    origin_id: Number(origin.id),
    currency: 'USD',
    insurance_pct: 0.4,
    duty_pct: 0,
    include_destination: false,
    duty_in_landed: false,
    charges: { inlandTransport: 250, stuffing: 120, documentation: 90, originTerminal: 180, originCustoms: 140, inspection: 100, forwarding: 75, packaging: 0, otherAmount: 0, otherLabel: '' },
    destination: { destinationTerminal: 0, destinationHandling: 0, destinationCustomsBroker: 0, destinationDelivery: 0, destinationWarehouse: 0, destinationOther: 0 },
  });

  const freight = await saveRecord('freight_rates', {
    source: 'manual',
    provider: 'QA manual rate',
    origin_port: origin.port || 'KAPE',
    destination_port: 'USNYC',
    container_type: '20FT',
    carrier: 'QA carrier',
    currency: 'USD',
    ocean_freight: 2400,
    surcharges: [{ label: 'BAF', amount: 150 }],
    transit_days: 32,
    valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  });

  const ok = Boolean(product.id && tier?.id && costProfile?.id && freight?.id);
  record(
    'catalogue seeded (product, tier, cost profile, freight rate)',
    ok,
    ok ? `product #${product.id}, tier #${tier.id}, costs #${costProfile.id}, freight #${freight.id}` : 'one or more writes failed'
  );

  return ok
    ? {
        productId: product.id,
        costProfileId: costProfile.id,
        freightId: freight.id,
        originPort: origin.port || 'KAPE',
        containerProfiles: (await call('/api/admin/wholesale/container_profiles?limit=10')).json?.items ?? [],
      }
    : null;
}

/* ------------------------------------------------------------------ */
/* 3. Buyer applies, owner approves                                    */
/* ------------------------------------------------------------------ */

async function applicationFlow() {
  const email = `${TAG.toLowerCase()}@example.invalid`;
  created.email = email;
  const response = await call('/api/wholesale/apply', {
    method: 'POST',
    auth: false,
    // The public route's vocabulary (the plugin's column names), not the camelCase
    // the screens happen to use in their form state.
    body: {
      company: `${TAG} Trading BV`,
      contact_name: 'QA Buyer',
      email,
      phone: '+10000000000',
      country: 'Netherlands',
      billing_address: 'QA street 1',
      business_type: 'distributor',
      monthly_volume: '2 containers',
      interested_products: 'Fine grain salt',
      logistics_mode: 'container',
      destination_country: 'United States',
      destination_port: 'USNYC',
      notes: `${TAG} automated QA submission — safe to delete`,
    },
  });

  if (!response.ok) {
    const limited = response.status === 429 ? ' (the public rate limit — five an hour per caller)' : '';
    record('buyer application submitted', false, `${response.status} ${response.json?.error || ''}${limited}`);
    return false;
  }

  // The public route deliberately does not return the row id — an applicant has no
  // business knowing the sequence number of the table. So the *reference* it does
  // return is the evidence, and the owner's own session finds the row it names.
  const reference = String(response.json?.reference || '');
  record(
    'buyer application submitted',
    response.json?.submitted === true && Boolean(reference),
    `${reference} · status ${response.json?.status || 'unset'}`
  );

  const list = await call('/api/admin/wholesale/applications?limit=100');
  const row = (list.json?.items ?? []).find(
    (entry) => String(entry.email || '').toLowerCase() === email || String(entry.ref || '') === reference
  );
  const applicationId = Number(row?.id ?? 0);
  created.application = applicationId || null;
  record('the submitted application is readable in the console', Boolean(applicationId), applicationId ? `application #${applicationId} (${row.status})` : 'not found');
  if (!applicationId) return false;

  // Approving creates the account and links it to the WordPress user by email.
  const decision = await call('/api/admin/wholesale/decide', {
    method: 'POST',
    body: { applicationId, decision: 'APPROVED', note: `${TAG} QA approval` },
  });
  if (!decision.ok) {
    record('application approved', false, `${decision.status} ${decision.json?.error || ''}`);
    return false;
  }

  let accountId = Number(decision.json?.account?.id ?? 0);
  if (!accountId) {
    const accounts = await call('/api/admin/wholesale/accounts?limit=100&email=' + encodeURIComponent(email));
    accountId = Number((accounts.json?.items ?? []).find((entry) => String(entry.email || '').toLowerCase() === email)?.id ?? 0);
  }
  created.account = accountId || null;
  record(
    'application approved and account created',
    Boolean(accountId),
    `account #${accountId} · application is ${decision.json?.application?.status || 'approved'}`
  );

  // Approval also decides whether the buyer can sign in at all: WordPress is where a
  // password hash lives, so an approved buyer with no WordPress user has nowhere to log
  // in. The role it creates is the permission boundary and is asserted, not assumed.
  const buyer = decision.json?.buyerUser;
  // Only a user *this run* created is ever deleted from WordPress (see `cleanup`): a
  // pre-existing account keeps its role and is left alone.
  if (buyer?.created) created.buyerUser = Number(buyer.userId) || 0;
  record(
    'the buyer has a WordPress sign-in account with no admin authority',
    Boolean(buyer?.created) && buyer?.role === 'hk_wholesale_buyer',
    buyer ? `user #${buyer.userId} · role ${buyer.role} · set-password email ${buyer.emailed ? 'requested' : 'not requested'}` : 'the plugin reported nothing about the buyer user'
  );

  // The portal must refuse a wholesale buyer a console session even though the account
  // and the WordPress user now both exist.
  const buyerOnConsole = await call('/api/admin/wholesale/workspace', { token: 'not-a-real-token' });
  record(
    'a forged token cannot read the console',
    buyerOnConsole.status === 401,
    `HTTP ${buyerOnConsole.status} ${buyerOnConsole.json?.error || ''}`
  );

  return Boolean(accountId);
}

/* ------------------------------------------------------------------ */
/* 4. Calculate, save a quotation, print it                            */
/* ------------------------------------------------------------------ */

async function quoteFlow(seed, accountId) {
  const containerProfileId = Number(seed.containerProfiles?.[0]?.id ?? 0) || 1;

  const calculation = await call('/api/admin/wholesale/calculate', {
    method: 'POST',
    body: {
      accountId,
      lines: [{ productRowId: seed.productId, units: 1000 }],
      containerProfileId,
      containers: 1,
      costProfileId: seed.costProfileId,
      freightRateId: seed.freightId,
      incoterm: 'CIF',
      currency: 'USD',
      marginPct: 18,
      destinationCountry: 'United States',
      destinationPort: 'USNYC',
      includeDestination: false,
      includeDuty: false,
      save: {
        accountId,
        status: 'QUOTED',
        validUntil: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
        notes: `${TAG} QA quotation`,
        pricingBasis: 'SYSTEM_CALCULATED',
      },
    },
  });

  if (!calculation.ok) {
    record('container calculated and quotation saved', false, `${calculation.status} ${calculation.json?.error || ''}`);
    return false;
  }

  const calc = calculation.json.calculation;
  const quoteId = Number(calculation.json.quote?.id ?? 0);
  created.quote = quoteId || null;

  record(
    'container calculated (pallets, weight, CBM, limiting factor)',
    Number(calc.mixed?.pallets ?? 0) > 0 && Number(calc.totals?.total ?? 0) > 0,
    `${calc.mixed?.pallets} pallets · ${Number(calc.mixed?.grossWeightKg ?? 0).toLocaleString('en-US')} kg · ${calc.mixed?.cbm} CBM · ${calc.fit?.limitingFactor} limits · total ${calc.totals?.currency} ${calc.totals?.total}`
  );
  record(
    'quotation saved with a reference',
    Boolean(quoteId) && String(calculation.json.reference || '').startsWith('HK-WS-Q'),
    `${calculation.json.reference} · sell ${calculation.json.quote?.sellTotal ?? '—'}`
  );

  if (quoteId) {
    const document = await call(`/api/admin/wholesale/quote-document?id=${quoteId}`);
    const html = document.text;
    record(
      'quotation document rendered',
      document.ok && html.includes(calculation.json.reference) && html.includes('Himalayan Koh'),
      document.ok ? `${html.length} bytes` : `${document.status} ${document.json?.error || ''}`
    );
    record(
      'document states the basis and the load',
      /CIF/.test(html) && /Quoted lines/.test(html),
      /Not included on this basis/.test(html) ? 'destination charges and duty shown as beyond the basis' : 'no exclusions section'
    );
  }
  return quoteId;
}

/* ------------------------------------------------------------------ */
/* 5. Accept, convert, record profit                                   */
/* ------------------------------------------------------------------ */

async function orderFlow(quoteId) {
  // The buyer accepts the quotation from the portal (see buyerAcceptanceFlow); the owner
  // does not re-accept it here. The row is read back from WordPress rather than trusting
  // the buyer route's own success answer.
  const accepted = await call(`/api/admin/wholesale/quotes?id=${quoteId}`);
  const status = String(accepted.json?.record?.status || '').toUpperCase();
  record(
    'the quotation is stored as ACCEPTED after the buyer accepted it',
    accepted.ok && status === 'ACCEPTED',
    accepted.ok ? `status ${status}` : `${accepted.status} ${accepted.json?.error || ''}`
  );

  const conversion = await call('/api/admin/wholesale/convert', {
    method: 'POST',
    body: { quoteId, paymentTerms: { label: 'Deposit then balance before shipment', depositPct: 30, balancePct: 70 }, notes: `${TAG} QA order` },
  });
  if (!conversion.ok) {
    record('order raised from the accepted quotation', false, `${conversion.status} ${conversion.json?.error || ''}`);
    return false;
  }
  const orderId = Number(conversion.json?.order?.id ?? 0);
  created.order = orderId || null;
  record('order raised from the accepted quotation', Boolean(orderId) && String(conversion.json.reference).startsWith('HK-WS-O'), `${conversion.json.reference} · terms 30/70`);

  if (!orderId) return false;

  const profit = await call('/api/admin/wholesale/profit');
  const line = profit.json?.orders?.find((entry) => entry.orderId === orderId);
  record(
    'profit computed for the order',
    profit.ok && Boolean(line),
    line
      ? `sell ${line.breakdown.sellTotal} − cost ${line.breakdown.totalCost} = gross ${line.breakdown.grossProfit}, dealer ${line.breakdown.commissionAmount}, HK net ${line.breakdown.hkNetProfit}`
      : `${profit.status} ${profit.json?.error || 'order missing from the profit view'}`
  );

  const recorded = await call('/api/admin/wholesale/profit', {
    method: 'POST',
    body: { orderId, costTotal: line?.breakdown.costTotal ?? 0, freightTotal: line?.breakdown.freightTotal ?? 0, otherCosts: 200, commissionPct: 20, reason: `${TAG} QA figures` },
  });
  record(
    'profit figures recorded on the order',
    recorded.ok,
    recorded.ok
      ? `dealer ${recorded.json.breakdown.commissionAmount} (${recorded.json.breakdown.commissionBasis}), HK net ${recorded.json.breakdown.hkNetProfit}`
      : `${recorded.status} ${recorded.json?.error || ''}`
  );

  // Read the order back from WordPress rather than trusting the write's own answer:
  // this is what proves the dealer/profit columns exist on the installed plugin and
  // that the figures actually persisted.
  const orderRow = (await call(`/api/admin/wholesale/orders?id=${orderId}`)).json?.record ?? {};
  const storedNet = orderRow.hk_net_profit;
  record(
    'the order row carries the profit and dealer fields',
    storedNet !== undefined && storedNet !== null && String(storedNet) !== '' && Number(orderRow.commission_pct) === 20,
    storedNet === undefined || storedNet === null
      ? 'the installed plugin returned no hk_net_profit column — the server is running a build older than the app'
      : `hk_net_profit ${storedNet} · commission_pct ${orderRow.commission_pct} · dealer_id ${orderRow.dealer_id}`
  );

  const audit = await call('/api/admin/wholesale/audit?limit=20');
  const actions = (audit.json?.items ?? []).map((row) => String(row.action));
  record(
    'audit trail recorded the trade events',
    actions.includes('QUOTE_REVISED') || actions.includes('ORDER_PROFIT_RECORDED'),
    actions.filter((action) => /QUOTE|ORDER/.test(action)).slice(0, 4).join(', ') || 'no matching actions'
  );

  return true;
}

/* ------------------------------------------------------------------ */
/* 5b. The buyer's own side of the same trade                         */
/* ------------------------------------------------------------------ */

/**
 * Sets a password on the WordPress account, the way an administrator does when a buyer
 * is locked out.
 *
 * The QA cannot read the set-password link that approval emailed, so it does what the
 * site owner would do in that situation: sets one through WordPress's own REST API with
 * the administrator application password. This bypasses nothing that matters — the
 * buyer still has to prove a real WordPress credential to get a wholesale session, and
 * the credential is WordPress's, not the app's.
 */
async function setWordPressUserPassword(userId, password) {
  const base = (env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
  const user = env.WORDPRESS_ADMIN_USER || '';
  const pass = (env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!base || !user || !pass || !userId) return { ok: false, error: 'no administrator credential' };

  const response = await fetch(`${base}/wp-json/wp/v2/users/${userId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    },
    body: JSON.stringify({ password }),
  });
  if (response.ok) return { ok: true, error: '' };
  const body = await response.json().catch(() => null);
  return { ok: false, error: `HTTP ${response.status} ${body?.message || ''}` };
}

/**
 * Sign in as the approved buyer and check what the portal does and does not show.
 *
 * This is the half a console-only test cannot reach: the session the buyer gets, the
 * trade they can see (their own and only their own) and the trade they cannot see (cost,
 * freight, margin, another account's paperwork) — plus the two refusals that matter, on
 * the owner's console and on the retail admin.
 */
/**
 * Signs the approved buyer in once and remembers the token.
 *
 * Two flows need it — accepting a quotation, and reading the portal back — and a buyer
 * only ever has one session in this run, so it is minted here rather than twice.
 */
async function signInBuyer() {
  if (created.buyerToken) return true;
  const password = `Qa-${TAG}-9f!`;
  const set = await setWordPressUserPassword(created.buyerUser, password);
  if (!set.ok) {
    record('buyer sign-in (a password could be set for the test account)', false, set.error);
    return false;
  }

  const login = await call('/api/wholesale/login', {
    method: 'POST',
    auth: false,
    body: { login: created.email, password },
  });
  const token = typeof login.json?.token === 'string' ? login.json.token : '';
  record(
    'the approved buyer signs in and gets a wholesale session',
    login.ok && Boolean(token),
    login.ok ? `account #${login.json?.buyer?.accountId} · ${login.json?.buyer?.company || ''} · role ${login.json?.buyer?.role || '?'}` : `${login.status} ${login.json?.error || ''}`
  );
  created.buyerToken = token;
  return Boolean(token);
}

/**
 * The buyer's own act: accepting a firm quotation from the portal.
 *
 * This is the half the console cannot do for them. It accepts for real, refuses a second
 * acceptance, refuses another account's quotation, and refuses an RFQ nobody has priced —
 * the four states a buyer actually meets.
 */
async function buyerAcceptanceFlow() {
  if (!(await signInBuyer())) return false;
  const token = created.buyerToken;

  const accept = await call(`/api/wholesale/quotes/${created.quote}/accept`, { method: 'POST', token });
  const quote = accept.json?.quote;
  record(
    'the buyer accepts the firm quotation from the portal',
    accept.ok && accept.json?.accepted === true && String(quote?.status) === 'ACCEPTED',
    accept.ok
      ? `${quote?.reference || `#${created.quote}`} is now ${quote?.status}`
      : `${accept.status} ${accept.json?.error || ''}`
  );

  const again = await call(`/api/wholesale/quotes/${created.quote}/accept`, { method: 'POST', token });
  record(
    'a second acceptance is refused with already_accepted',
    again.status === 409 && again.json?.code === 'already_accepted',
    `HTTP ${again.status} ${again.json?.code || ''}`
  );

  // An id belonging to no one on this account is "no such quotation", not a 403 that
  // would confirm another account's row exists.
  const foreign = await call('/api/wholesale/quotes/999999/accept', { method: 'POST', token });
  record(
    'the buyer cannot accept another account’s quotation',
    foreign.status === 404,
    `HTTP ${foreign.status} ${foreign.json?.error || ''}`
  );

  // An unpriced request is not a free one: it must be refused, and refused by name.
  const seed = created.seed;
  const containerProfileId = Number(seed?.containerProfiles?.[0]?.id ?? 0) || 1;
  const rfq = await call('/api/admin/wholesale/calculate', {
    method: 'POST',
    body: {
      accountId: created.account,
      lines: [{ productRowId: seed.productId, units: 500 }],
      containerProfileId,
      containers: 1,
      costProfileId: seed.costProfileId,
      freightRateId: seed.freightId,
      incoterm: 'FOB',
      currency: 'USD',
      marginPct: 15,
      destinationCountry: 'United States',
      destinationPort: 'USNYC',
      save: { accountId: created.account, status: 'SUBMITTED', notes: `${TAG} QA unpriced RFQ` },
    },
  });
  const rfqId = Number(rfq.json?.quote?.id ?? 0);
  if (rfqId) created.records.push({ resource: 'quotes', id: rfqId });
  const refuse = rfqId
    ? await call(`/api/wholesale/quotes/${rfqId}/accept`, { method: 'POST', token })
    : { status: 0, json: {} };
  record(
    'an unpriced request cannot be accepted',
    refuse.status === 409 && refuse.json?.code === 'not_priced',
    rfqId ? `HTTP ${refuse.status} ${refuse.json?.code || ''}` : 'the unpriced RFQ could not be created'
  );

  return true;
}

async function buyerFlow() {
  if (!(await signInBuyer())) return false;
  const token = created.buyerToken;

  const signedIn = await call('/api/wholesale/session', { token });
  record(
    'the portal re-reads the buyer from the server on load',
    signedIn.ok && signedIn.json?.authenticated === true,
    signedIn.ok ? `${signedIn.json?.buyer?.email} · ${signedIn.json?.buyer?.ref || ''}` : `${signedIn.status} ${signedIn.json?.error || ''}`
  );

  const quotes = await call('/api/wholesale/quotes', { token });
  const own = (quotes.json?.quotes ?? []).find((row) => Number(row.id) === Number(created.quote));
  record(
    'the buyer sees their own quotation',
    quotes.ok && Boolean(own),
    quotes.ok ? `${quotes.json?.count} quotation(s), including ${own?.reference || own?.ref || `#${created.quote}`}` : `${quotes.status} ${quotes.json?.error || ''}`
  );

  const orders = await call('/api/wholesale/orders', { token });
  record(
    'the buyer sees their own order',
    orders.ok && (orders.json?.orders ?? []).some((row) => Number(row.id) === Number(created.order)),
    orders.ok ? `${orders.json?.count} order(s)` : `${orders.status} ${orders.json?.error || ''}`
  );

  const document = await call(`/api/wholesale/quotes/${created.quote}/document`, { token });
  record(
    'the buyer can print their own quotation',
    document.ok && /Himalayan Koh/.test(document.text),
    document.ok ? `${document.text.length} bytes` : `${document.status} ${document.json?.error || ''}`
  );

  // The disclosure boundary, checked against the bytes the portal would render rather
  // than against what the screen happens to display: a cost centre that leaks into the
  // payload is a leak even if no component draws it.
  const payload = [quotes.text, orders.text, document.text, (await call('/api/wholesale/catalog', { token })).text].join('\n');
  const leaks = ['unitCost', 'exFactory', 'marginPct', 'grossProfit', 'hkNetProfit', 'commissionAmount', 'oceanFreight']
    .filter((term) => payload.includes(term));
  record(
    'no cost, freight, margin or commission figure reaches the buyer',
    leaks.length === 0,
    leaks.length ? `found: ${leaks.join(', ')}` : 'none of the internal terms appear in any buyer response'
  );

  const someoneElsesQuote = await call('/api/wholesale/quotes/1/document', { token });
  record(
    'the buyer cannot open another account’s quotation',
    !someoneElsesQuote.ok,
    `HTTP ${someoneElsesQuote.status} (${someoneElsesQuote.status === 404 ? 'not found' : someoneElsesQuote.json?.error || ''})`
  );

  const consoleAttempt = await call('/api/admin/wholesale/workspace', { token });
  record(
    'a wholesale buyer token cannot open the owner’s console',
    consoleAttempt.status === 401,
    `HTTP ${consoleAttempt.status} ${consoleAttempt.json?.error || ''}`
  );

  const retailAttempt = await call('/api/admin/products', { token });
  record(
    'a wholesale buyer token cannot open the retail admin',
    retailAttempt.status === 401,
    `HTTP ${retailAttempt.status} ${retailAttempt.json?.error || ''}`
  );

  const noToken = await call('/api/wholesale/quotes', { auth: false });
  record('the portal requires a session', noToken.status === 401, `HTTP ${noToken.status}`);

  return true;
}

/* ------------------------------------------------------------------ */
/* 6. Cleanup                                                          */
/* ------------------------------------------------------------------ */

/**
 * Removes the WordPress sign-in account this run created, through WordPress's own REST
 * API with the administrator application password.
 *
 * The wholesale rows are deleted first, so the account the approval created is the last
 * thing standing; WordPress refuses to delete a user who still owns content, which is the
 * right refusal for an account that has something attached to it.
 */
async function deleteCreatedBuyerUser() {
  if (!created.buyerUser) return 'no buyer WordPress account was created by this run';

  const base = (env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
  const user = env.WORDPRESS_ADMIN_USER || '';
  const pass = (env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!base || !user || !pass) return 'no administrator credential — the test account is left behind';

  try {
    // `reassign=0` is what WordPress asks for on a user delete: it means "this account
    // owns nothing" — which is true of an account an approval has just created, and the
    // only case this script ever deletes.
    const response = await fetch(`${base}/wp-json/wp/v2/users/${created.buyerUser}?force=true&reassign=0`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
      },
    });
    if (response.ok) return `WordPress account #${created.buyerUser} removed`;
    const body = await response.json().catch(() => null);
    return `WordPress account #${created.buyerUser} could not be removed (HTTP ${response.status} ${body?.message || ''})`;
  } catch (error) {
    return `WordPress account #${created.buyerUser} could not be removed (${error instanceof Error ? error.message : 'request failed'})`;
  }
}

async function cleanup() {
  let removed = 0;
  for (const entry of [...created.records].reverse()) {
    const response = await call(`/api/admin/wholesale/${entry.resource}?id=${entry.id}`, { method: 'DELETE' });
    if (response.ok) removed += 1;
    else console.log(`      could not delete ${entry.resource} #${entry.id}: ${response.json?.error || response.status}`);
  }
  for (const [resource, id] of [
    ['orders', created.order],
    ['quotes', created.quote],
    ['accounts', created.account],
    ['applications', created.application],
  ]) {
    if (!id) continue;
    const response = await call(`/api/admin/wholesale/${resource}?id=${id}`, { method: 'DELETE' });
    if (response.ok) removed += 1;
    else console.log(`      could not delete ${resource} #${id}: ${response.json?.error || response.status}`);
  }
  record('QA rows deleted', true, `${removed} row(s) removed (including the application, account, quote and order)`);
  const userResult = await deleteCreatedBuyerUser();
  record('the test WordPress account was removed', !/could not be removed/.test(userResult), userResult);
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log(`Wholesale QA against ${BASE} — tag ${TAG}\n`);

  const reachable = await call('/api/version', { auth: false }).catch(() => null);
  if (!reachable?.ok) {
    console.log(`FAIL  server not reachable at ${BASE} — start it with: npx next dev -p 3997`);
    process.exit(1);
  }

  if (!(await signIn())) {
    console.log('\nCannot continue without an admin session.');
    process.exit(1);
  }

  const data = await workspace();
  const seed = data ? await catalogueSeed() : null;
  if (seed && (await applicationFlow())) {
    created.seed = seed;
    const quoteId = await quoteFlow(seed, created.account);
    if (quoteId) {
      // The buyer accepts first — that is what the portal is for; the owner then converts
      // the accepted quotation and reads back what it produced.
      await buyerAcceptanceFlow();
      await orderFlow(quoteId);
      await buyerFlow();
    }
  }

  await cleanup();

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('Failed:');
    for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('QA aborted:', error instanceof Error ? error.message : error);
  process.exit(1);
});
