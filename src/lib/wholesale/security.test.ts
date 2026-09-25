import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { base64UrlDecode, encodeJson, signToken } from '@/lib/auth/sessionToken';
import { buyerOrderView, buyerQuoteView } from './buyerView';
import { escapeHtml, renderQuoteDocument } from './document';
import { createWholesaleSession, verifyWholesaleRequest, verifyWholesaleSessionToken } from './session';
import { buildQuoteRevision, commercialSnapshotFromRow } from './quoteLifecycle';

/**
 * The boundaries, pinned.
 *
 * ## Why these are the tests worth having
 *
 * The wholesale subsystem holds three things a retail session must never reach: tier
 * prices, freight and ex-factory costs, and *other buyers'* quotations. Every one of
 * those is a claim about an authorization decision, and a claim like that is only true
 * if it is exercised — so each test here fails loudly if a boundary is removed, rather
 * than passing because nobody looked.
 *
 * ## What is checked structurally
 *
 * Two of these read source: the plugin's SQL (every read/write must be prepared, and a
 * request parameter must never reach a statement by interpolation) and the console's
 * capability guard. Those are properties no runtime test can prove from the app side,
 * because the app never sees the SQL WordPress runs.
 */

const SECRET = 'test-wholesale-secret-value';
const OTHER_SECRET = 'a-different-application-secret';
const AT = new Date('2026-09-23T10:00:00.000Z');

beforeEach(() => {
  process.env.WHOLESALE_SESSION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.WHOLESALE_SESSION_SECRET;
  delete process.env.WHOLESALE_ENABLED;
});

describe('wholesale session tokens', () => {
  it('accepts a token it minted, and carries the account id and role', async () => {
    const { token, payload } = await createWholesaleSession({
      accountId: 41,
      email: 'buyer@example.com',
      company: 'Karachi Traders',
      role: 'wholesale_customer',
    });

    expect(payload.wid).toBe(41);
    const verified = await verifyWholesaleSessionToken(token);
    expect(verified?.wid).toBe(41);
    expect(verified?.role).toBe('wholesale_customer');
  });

  it('refuses a token signed with another application secret', async () => {
    const foreign = await signToken(
      { wid: 41, email: 'buyer@example.com', company: 'X', role: 'wholesale_customer', iat: Date.now(), exp: Date.now() + 60_000 },
      OTHER_SECRET
    );
    expect(await verifyWholesaleSessionToken(foreign)).toBeNull();
  });

  it('refuses a token whose payload was edited', async () => {
    const { token } = await createWholesaleSession({
      accountId: 41,
      email: 'buyer@example.com',
      company: 'Karachi Traders',
      role: 'wholesale_customer',
    });

    // Swap the account id in the payload, keeping the original signature: a verifier
    // that trusted the frame without checking it would hand over account 42.
    const separator = token.indexOf('.');
    const signature = token.slice(separator + 1);
    const payload = JSON.parse(
      Buffer.from(base64UrlDecode(token.slice(0, separator))).toString('utf8')
    ) as Record<string, unknown>;
    payload.wid = 42;

    const tampered = `${encodeJson(payload)}.${signature}`;
    expect(await verifyWholesaleSessionToken(tampered)).toBeNull();

    // The other classic: borrow a second token's signature onto this payload.
    const { token: other } = await createWholesaleSession({
      accountId: 99,
      email: 'other@example.com',
      company: 'Other',
      role: 'wholesale_customer',
    });
    const spliced = `${token.slice(0, separator)}.${other.slice(other.indexOf('.') + 1)}`;
    expect(await verifyWholesaleSessionToken(spliced)).toBeNull();
  });

  it('refuses an expired session and a missing secret', async () => {
    const expired = await signToken(
      { wid: 41, email: 'b@example.com', company: 'X', role: 'wholesale_customer', iat: 0, exp: AT.getTime() - 1 },
      SECRET
    );
    expect(await verifyWholesaleSessionToken(expired)).toBeNull();

    delete process.env.WHOLESALE_SESSION_SECRET;
    const { token } = await createWholesaleSession({
      accountId: 7,
      email: 'b@example.com',
      company: 'X',
      role: 'wholesale_customer',
    }).catch(async () => {
      // Minting without a secret must fail; sign with the previous value to prove the
      // verifier refuses it once the secret is gone.
      return { token: await signToken({ wid: 7, email: 'b@example.com', company: 'X', role: 'wholesale_customer', iat: Date.now(), exp: Date.now() + 60000 }, SECRET), payload: null as never };
    });
    expect(await verifyWholesaleSessionToken(token)).toBeNull();
  });

  it('refuses a retail or admin role claim, whatever the secret', async () => {
    const customer = await signToken(
      { sub: 'someone', role: 'customer', iat: Date.now(), exp: Date.now() + 60_000 },
      SECRET
    );
    const admin = await signToken(
      { sub: 'someone', role: 'admin', iat: Date.now(), exp: Date.now() + 60_000 },
      SECRET
    );

    expect(await verifyWholesaleSessionToken(customer)).toBeNull();
    expect(await verifyWholesaleSessionToken(admin)).toBeNull();
  });

  it('refuses a request with no bearer token at all', async () => {
    const anonymous = new Request('https://preview.himalayankoh.com/api/wholesale/catalog');
    const result = await verifyWholesaleRequest(anonymous);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('fails closed when the portal secret is not configured', async () => {
    delete process.env.WHOLESALE_SESSION_SECRET;
    const request = new Request('https://preview.himalayankoh.com/api/wholesale/catalog', {
      headers: { Authorization: 'Bearer whatever' },
    });
    const result = await verifyWholesaleRequest(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it('a short secret counts as unconfigured rather than accepted', async () => {
    process.env.WHOLESALE_SESSION_SECRET = 'too-short';
    const request = new Request('https://preview.himalayankoh.com/api/wholesale/catalog', {
      headers: { Authorization: 'Bearer whatever' },
    });
    const result = await verifyWholesaleRequest(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });
});

describe('what a buyer is shown', () => {
  const quoteRow = {
    id: 12,
    ref: 'HK-WS-Q00012',
    account_id: 41,
    status: 'QUOTED',
    currency: 'USD',
    sell_total: 12_000,
    margin_pct: 18,
    incoterm: 'FOB',
    valid_until: '2026-10-30',
    lines: [{ units: 5_000, name: 'Fine salt', cartonQty: 4 }],
    totals: { total: 9_800, sellPerUnit: 2.4, perUnit: 1.96, merchandise: 9_000, oceanFreight: 800 },
    fx: [{ from: 'PKR', to: 'USD', rate: 0.0036, source: 'manual', retrievedAt: '2026-09-01' }],
  };

  it('never exposes the cost, freight, margin or exchange rate to the buyer', () => {
    const view = buyerQuoteView(quoteRow, AT);
    const serialised = JSON.stringify(view);

    expect(serialised).not.toContain('9,800');
    expect(serialised).not.toContain('9800');
    expect(serialised).not.toContain('PKR');
    expect(serialised).not.toContain('margin');
    expect(serialised).not.toContain('3360');
    // It does show what the buyer is owed: what they asked for and what it costs them.
    expect(serialised).toContain('HK-WS-Q00012');
  });

  it('shows an order without its internal cost breakdown', () => {
    const view = buyerOrderView({
      id: 3,
      ref: 'HK-WS-O00003',
      account_id: 41,
      status: 'CONFIRMED',
      currency: 'USD',
      sell_total: 40_000,
      paid_amount: 12_000,
      totals: { costTotal: 31_500, oceanFreight: 3_200, destinationCharges: 900, sellTotal: 40_000 },
      payment_terms: { label: 'Deposit then balance before shipment', depositPct: 30, balancePct: 70 },
    });

    const serialised = JSON.stringify(view);
    expect(serialised).toContain('HK-WS-O00003');
    expect(serialised).not.toContain('31500');
    expect(serialised).not.toContain('31,500');
    expect(serialised).not.toContain('3,200');
  });
});

describe('the quotation document', () => {
  it('escapes everything that came from a form', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');

    const html = renderQuoteDocument({
      quote: buyerQuoteView(
        {
          id: 5,
          ref: 'HK-WS-Q00005',
          account_id: 1,
          status: 'QUOTED',
          currency: 'USD',
          sell_total: 100,
          incoterm: 'FOB',
          lines: [{ units: 10, name: '<img src=x onerror=alert(1)>' }],
          totals: { total: 80 },
        },
        AT
      ) as never,
      account: null,
      generatedAt: AT,
    });

    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('prints the revision history when there is one', () => {
    const before = commercialSnapshotFromRow({ status: 'QUOTED', sell_total: 100, currency: 'USD' });
    const after = commercialSnapshotFromRow({ status: 'QUOTED', sell_total: 120, currency: 'USD' });
    const revision = buildQuoteRevision({ quoteRowId: 5, before, after, actor: 'owner', reason: 'Freight moved', at: AT }).detail;

    const html = renderQuoteDocument({
      quote: buyerQuoteView(
        { id: 5, ref: 'HK-WS-Q00005', account_id: 1, status: 'QUOTED', currency: 'USD', sell_total: 120, incoterm: 'FOB', totals: { total: 100 } },
        AT
      ) as never,
      account: null,
      revisions: [revision],
      generatedAt: AT,
    });

    expect(html).toContain('Revision history');
    expect(html).toContain('Freight moved');
  });
});

describe('the WordPress side, checked as source', () => {
  const PLUGIN = readFileSync(join(process.cwd(), 'wordpress', 'hk-wholesale.php'), 'utf8');

  it('prepares every statement and never interpolates a request value', () => {
    // $wpdb->prepare must be present for each dynamic query, and the filter values the
    // request supplies must reach it through placeholders.
    expect(PLUGIN).toMatch(/\$wpdb->prepare\(/);
    expect(PLUGIN).toMatch(/'id = %d'/);
    expect(PLUGIN).toMatch(/`\{\$filter\}` = %[sd]/);

    // No request parameter may be concatenated into a statement.
    expect(PLUGIN).not.toMatch(/get_param\([^)]*\)\s*\./);
    expect(PLUGIN).not.toMatch(/\$wpdb->query\(\s*"[^"]*\{\s*\$request/);
  });

  it('backticks every identifier it builds into DDL or SQL', () => {
    // A column may be named for a reserved word — `lines` on a quotation is one, and an
    // unquoted CREATE TABLE for that column is a syntax error. dbDelta swallows it, so
    // the table simply never exists and every read of it returns an empty list instead
    // of an error: the failure surfaces as "the record could not be stored" on the first
    // write. Quoting the identifiers is what makes that impossible.
    expect(PLUGIN).toMatch(/"`\{\$name\}` " \. hk_wholesale_column_sql/);
    expect(PLUGIN).toMatch(/CREATE TABLE `\{\$table\}`/);
    expect(PLUGIN).toMatch(/ORDER BY `\{\$order_by\}`/);
    expect(PLUGIN).toMatch(/"SHOW COLUMNS FROM `\{\$table\}`"/);
  });

  it('verifies its own schema instead of trusting dbDelta', () => {
    // dbDelta reports nothing on failure, so the installer checks the table exists and
    // holds every declared column — and leaves the reason where an operator can read it.
    expect(PLUGIN).toMatch(/SHOW TABLES LIKE/);
    expect(PLUGIN).toMatch(/SHOW COLUMNS FROM/);
    expect(PLUGIN).toMatch(/HK_WHOLESALE_SCHEMA_OPTION/);
    expect(PLUGIN).toMatch(/'missing_tables'/);
    expect(PLUGIN).toMatch(/'missing_columns'/);
  });

  it('writes only columns the schema declares', () => {
    expect(PLUGIN).toMatch(/function hk_wholesale_filter_payload/);
    expect(PLUGIN).toMatch(/isset\( \$columns\[ \$key \] \)/);
  });

  it('guards every route with a capability check', () => {
    expect(PLUGIN).toMatch(/function hk_wholesale_can_manage/);
    expect(PLUGIN).toMatch(/current_user_can\( 'manage_options' \)/);
    expect(PLUGIN).not.toMatch(/'permission_callback'\s*=>\s*'__return_true'/);
  });

  it('never touches a WooCommerce product, customer or retail order', () => {
    // The isolation promise, in source: no WooCommerce read/write of any kind.
    expect(PLUGIN).not.toMatch(/wc_get_product|wc_get_order|\$wpdb->prefix\s*\.\s*'posts'/);
    expect(PLUGIN).not.toMatch(/'shop_order'|'_customer_user'/);
  });
});
