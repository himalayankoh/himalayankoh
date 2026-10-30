/**
 * Wholesale profit, on the server, from the order's own frozen figures.
 *
 * ## Why the console does not compute this
 *
 * A margin is the number a business is judged on, and it must be the same number in
 * the overview, on the order and in an export. So there is one implementation — the
 * pure engine in `profit.ts` — and this route is the only way the browser sees it.
 *
 * ## Direct sale and dealer sale are both first-class
 *
 * An order can belong to the trade customer who bought it, or to a dealer who brought
 * that customer. The breakdown always names which: the dealer's share comes off gross
 * profit before Himalayan Koh's net, and on a direct order there is no dealer share at
 * all. A commission percentage the order does not carry falls back to the account's
 * standing agreement — and says so, because "the dealer takes 20%" and "we agreed 20%
 * with this dealer last year" are different facts.
 *
 * ## Recording a figure is an audited write
 *
 * `POST` stores the profit snapshot on the order (cost, freight, other, commission,
 * net) and writes an audit row. It never touches the sell total: that is the price the
 * buyer agreed to, and it is changed on the quote/order, not while reviewing a margin.
 *
 * ## No currency is ever added to another
 *
 * The summary totals one currency and names the rest. Converting them would need an
 * FX rate the order does not carry, and a profit figure built on an invented rate is
 * worse than an unsummed one.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { accountFromRow, orderFromRow } from '@/lib/wholesale/mapping';
import {
  computeProfit,
  profitInputFromRow,
  summariseProfit,
  WholesaleProfitError,
  type OrderProfitLine,
} from '@/lib/wholesale/profit';
import { listWholesaleRecords, upsertWholesaleRecord, WHOLESALE_AGGREGATE_TIMEOUT_MS } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

interface AccountLookup {
  name: string;
  commissionPct: number;
  isDealer: boolean;
}

/** The account names and standing commission agreements, read once per request. */
async function accountLookup(): Promise<Map<number, AccountLookup>> {
  const rows = await listWholesaleRecords('accounts', { limit: 500 }, { timeoutMs: WHOLESALE_AGGREGATE_TIMEOUT_MS });
  const map = new Map<number, AccountLookup>();
  for (const row of rows) {
    const account = accountFromRow(row);
    const businessType = account.businessType ?? '';
    map.set(account.rowId, {
      name: account.companyName || account.contactName || account.email,
      commissionPct: account.commissionPct,
      // A dealer is an account we pay, not one that pays us. The business type is the
      // owner's own label, so it is what decides this — not a guess from the numbers.
      isDealer: businessType === 'distributor' || businessType === 'reseller',
    });
  }
  return map;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const params = new URL(request.url).searchParams;
  const orderId = Number(params.get('orderId') ?? 0);

  try {
    const [orderRows, accounts] = await Promise.all([
      listWholesaleRecords('orders', orderId ? { id: orderId, limit: 1 } : { limit: 300 }, { timeoutMs: WHOLESALE_AGGREGATE_TIMEOUT_MS }),
      accountLookup(),
    ]);

    const lines: OrderProfitLine[] = [];
    const assumptions: string[] = [];

    for (const row of orderRows) {
      const order = orderFromRow(row);
      const account = accounts.get(Number(order.accountId) || 0);

      // The order's own commission wins; the account's standing agreement is the
      // fallback, and the note below records which one was used — "the dealer takes
      // 20% on this order" and "we agreed 20% with them last year" are different facts.
      const input = profitInputFromRow(row, account?.name ?? null);
      const fromAgreement = !input.commissionPct && Boolean(account?.commissionPct);
      const breakdown = computeProfit(fromAgreement ? { ...input, commissionPct: account!.commissionPct } : input);

      if (fromAgreement) {
        assumptions.push(
          `${order.reference || `#${order.rowId}`}: the commission comes from ${account?.name}'s standing agreement (${account!.commissionPct}%), not from the order.`
        );
      }

      lines.push({
        orderId: order.rowId,
        reference: order.reference || `#${order.rowId}`,
        accountId: Number(order.accountId) || 0,
        accountName: account?.name ?? 'Unknown account',
        status: order.status,
        dealerName: breakdown.commissionBasis === 'NONE' ? null : (account?.name ?? null),
        breakdown,
      });
    }

    const summary = summariseProfit(lines);

    return NextResponse.json({
      summary: { ...summary, assumptions: [...summary.assumptions, ...assumptions] },
      orders: lines,
      // Where each figure came from, so a reader can check the arithmetic.
      formula: [
        'sell total − (cost + freight + other costs) = gross profit',
        'gross profit − dealer share = Himalayan Koh net profit',
      ],
      note:
        'Costs, freight and commission are the figures frozen on each order. Nothing here is converted between currencies and nothing is recalculated from today’s supplier prices.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The profit figures could not be read.';
    return NextResponse.json({ error: message }, { status: error instanceof WholesaleProfitError ? 400 : 502 });
  }
}

/** The figures an owner may record against an order. Never the sell total. */
export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  let body: {
    orderId?: number;
    costTotal?: number;
    freightTotal?: number;
    otherCosts?: number;
    commissionPct?: number;
    commissionAmount?: number | null;
    reason?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const orderId = Number(body.orderId ?? 0);
  if (!orderId) return NextResponse.json({ error: 'An order id is required.' }, { status: 400 });

  try {
    const rows = await listWholesaleRecords('orders', { id: orderId, limit: 1 });
    if (!rows.length) return NextResponse.json({ error: 'No such wholesale order.' }, { status: 404 });

    const accountId = Number(rows[0].account_id ?? 0);
    const accounts = await accountLookup();
    const account = accounts.get(accountId);

    const input = profitInputFromRow(rows[0], account?.name ?? null);
    const statedPct = body.commissionPct !== undefined;
    const statedAmount = body.commissionAmount !== undefined;
    if (body.costTotal !== undefined) input.costTotal = Number(body.costTotal);
    if (body.freightTotal !== undefined) input.freightTotal = Number(body.freightTotal);
    if (body.otherCosts !== undefined) input.otherCosts = Number(body.otherCosts);
    if (statedPct) {
      input.commissionPct = Number(body.commissionPct);
      // A percentage in the request is the owner stating the share, and the panel
      // offers no fixed-amount field. Without this, a fixed amount stored on an
      // earlier edit keeps winning (`computeProfit` gives a fixed amount precedence),
      // so typing a new percentage — or zeroing it — silently changed nothing: the
      // dealer kept the old money and the screen showed a percentage that was not the
      // one being applied.
      if (!statedAmount) input.commissionAmount = null;
    }
    if (statedAmount) {
      input.commissionAmount = body.commissionAmount ?? null;
      // And the mirror of that rule: an agreed fixed amount is the whole of the
      // dealer's share, so a percentage left on the row must not survive to fight it
      // on the next read — otherwise the order reports a share it is not paying.
      input.commissionPct = 0;
    }
    // The account's standing agreement is the fallback, on the same terms the read
    // path uses it: only when nobody has said anything about the commission here (no
    // percentage in the request, no fixed amount in the request, nothing on the row).
    // Without this, recording a dealer order's costs wiped the dealer's agreed share
    // and stored a net profit with no commission deducted at all.
    const fromAgreement =
      !statedPct && !statedAmount && input.commissionPct === 0 && input.commissionAmount === null && Boolean(account?.commissionPct);
    if (fromAgreement) input.commissionPct = account!.commissionPct;
    if (fromAgreement) input.dealerName = account?.name ?? input.dealerName ?? null;

    const breakdown = computeProfit(input);

    const actor = auth.admin.name || auth.admin.username || auth.admin.email;
    const saved = await upsertWholesaleRecord(
      'orders',
      {
        cost_total: breakdown.costTotal,
        freight_total: breakdown.freightTotal,
        other_costs: breakdown.otherCosts,
        commission_pct: breakdown.commissionPct,
        // The stored amount is the *computed* one when a share was given, so an export
        // does not have to redo the arithmetic, and a fixed amount when that was agreed.
        commission_amount: breakdown.commissionAmount,
        hk_net_profit: breakdown.hkNetProfit,
        dealer_id: breakdown.commissionBasis === 'NONE' ? 0 : accountId,
      },
      { id: orderId, actor }
    );

    await upsertWholesaleRecord(
      'audit',
      {
        at: new Date().toISOString(),
        actor,
        action: 'ORDER_PROFIT_RECORDED',
        entity: 'orders',
        entity_id: orderId,
        detail: {
          reason: body.reason ? String(body.reason).slice(0, 500) : '',
          // Where the dealer's share came from, so the trail explains the figure rather
          // than leaving a reader to guess whether it was agreed on this order or
          // inherited from the account.
          commissionSource: fromAgreement ? 'account agreement' : statedAmount ? 'fixed amount on this order' : statedPct ? 'stated on this order' : 'none',
          breakdown: {
            sellTotal: breakdown.sellTotal,
            costTotal: breakdown.costTotal,
            freightTotal: breakdown.freightTotal,
            otherCosts: breakdown.otherCosts,
            grossProfit: breakdown.grossProfit,
            commissionPct: breakdown.commissionPct,
            commissionAmount: breakdown.commissionAmount,
            hkNetProfit: breakdown.hkNetProfit,
            currency: breakdown.currency,
          },
        },
      },
      { actor }
    );

    return NextResponse.json({ order: orderFromRow(saved as Record<string, unknown>), breakdown });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The profit figure could not be recorded.';
    return NextResponse.json({ error: message }, { status: error instanceof WholesaleProfitError ? 400 : 502 });
  }
}
