'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgePercent, Coins, Loader2, Percent, PiggyBank, TrendingDown } from 'lucide-react';
import {
  fetchWholesaleProfit,
  saveWholesaleProfit,
  type WholesaleProfitResponse,
  type WholesaleRow,
} from '@/lib/admin/wholesaleConsoleApi';
import {
  Button,
  Field,
  FinancialWaterfallBar,
  KpiCard,
  Notice,
  Panel,
  TextInput,
  numberValue,
} from './ui';

/**
 * Margin, commission and what is actually left.
 *
 * ## Why this is its own view rather than a column on Orders
 *
 * A wholesale order's *value* is not its *result*. The figure an owner makes a
 * decision on is gross profit after freight and destination costs, and then the
 * dealer's share of it — four numbers that do not fit in one column, and that a
 * business can get badly wrong by reading only the invoice total.
 *
 * ## Every figure is read, never guessed here
 *
 * The arithmetic runs on the server (`lib/wholesale/profit.ts`) and this screen shows
 * what it returned, including the formula and the assumptions. Nothing is recomputed
 * in the browser: a margin that differs between the screen and an export is worse than
 * no screen at all.
 *
 * ## The assumptions stay visible
 *
 * Where a figure is missing — no sell total yet, no freight recorded, a commission
 * taken from the account's standing agreement rather than the order — the panel prints
 * that next to the numbers instead of presenting a confident total built on a gap.
 */

function money(value: number, currency: string): string {
  return `${currency} ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number): string {
  return `${Number(value).toFixed(2)}%`;
}

export default function ProfitPanel({ orders }: { orders: WholesaleRow[] }) {
  const [data, setData] = useState<WholesaleProfitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ costTotal: '', freightTotal: '', otherCosts: '', commissionPct: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchWholesaleProfit());
    } catch (caught) {
      // The server's own sentence: a WordPress failure must not read as "no profit".
      setError(caught instanceof Error ? caught.message : 'The profit figures could not be read.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing(orderId: number, breakdown: WholesaleProfitResponse['orders'][number]['breakdown']) {
    setEditing(orderId);
    setSaved('');
    setError('');
    setDraft({
      costTotal: String(breakdown.costTotal || ''),
      freightTotal: String(breakdown.freightTotal || ''),
      otherCosts: String(breakdown.otherCosts || ''),
      commissionPct: String(breakdown.commissionPct || ''),
      reason: '',
    });
  }

  async function save(orderId: number) {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const result = await saveWholesaleProfit({
        orderId,
        costTotal: numberValue(draft.costTotal) ?? 0,
        freightTotal: numberValue(draft.freightTotal) ?? 0,
        otherCosts: numberValue(draft.otherCosts) ?? 0,
        commissionPct: numberValue(draft.commissionPct) ?? 0,
        reason: draft.reason,
      });
      setEditing(null);
      setSaved(
        `Figures recorded. Gross profit ${money(result.breakdown.grossProfit, result.breakdown.currency)}, Himalayan Koh net ${money(
          result.breakdown.hkNetProfit,
          result.breakdown.currency
        )}.`
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The figures could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-charcoal-light py-16 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Working out the margins…
      </div>
    );
  }

  const summaryProductCost = Math.max(0, data?.orders.reduce((sum, o) => sum + (o.breakdown.costTotal || 0), 0) ?? 0);
  const summaryFreightCost = Math.max(0, data?.orders.reduce((sum, o) => sum + (o.breakdown.freightTotal || 0), 0) ?? 0);
  const summaryOtherCosts = Math.max(0, data?.orders.reduce((sum, o) => sum + (o.breakdown.otherCosts || 0), 0) ?? 0);

  return (
    <div className="space-y-6">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {saved ? <Notice kind="success">{saved}</Notice> : null}

      {data ? (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <KpiCard
              label="Gross revenue"
              value={money(data.summary.sellTotal, data.summary.currency)}
              hint={`${data.summary.pricedOrders} of ${data.summary.orders} order(s) priced`}
              tone="accent"
            />
            <KpiCard
              label="Product cost"
              value={money(summaryProductCost, data.summary.currency)}
              hint="Factory ex-works goods & origin charges"
            />
            <KpiCard
              label="Ocean freight"
              value={money(summaryFreightCost, data.summary.currency)}
              hint="Carrier transit & fuel surcharges"
            />
            <KpiCard
              label="Other landed charges"
              value={money(summaryOtherCosts, data.summary.currency)}
              hint="Port, terminal & customs charges"
            />
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <KpiCard
              label="Gross profit"
              value={money(data.summary.grossProfit, data.summary.currency)}
              hint={`${percent(data.summary.grossMarginPct)} of revenue`}
              tone={data.summary.grossProfit < 0 ? 'warn' : 'good'}
            />
            <KpiCard
              label="Dealer commission"
              value={money(data.summary.dealerCommission, data.summary.currency)}
              hint="Contracted shares to partner dealers"
            />
            <KpiCard
              label="Himalayan Koh net profit"
              value={money(data.summary.hkNetProfit, data.summary.currency)}
              hint={`${percent(data.summary.hkNetMarginPct)} retained margin`}
              tone={data.summary.hkNetProfit < 0 ? 'warn' : 'good'}
            />
            <KpiCard
              label="Loss-making orders"
              value={data.summary.lossMaking.length}
              hint={data.summary.lossMaking.length ? data.summary.lossMaking.join(', ') : 'None — all orders positive'}
              tone={data.summary.lossMaking.length ? 'warn' : 'plain'}
            />
          </div>

          <Panel
            title="Financial Waterfall & Margin Distribution"
            description="Visual decomposition of gross revenue into goods cost, ocean freight, other landed charges, dealer commission, and Himalayan Koh retained net profit."
          >
            <FinancialWaterfallBar
              revenue={data.summary.sellTotal}
              productCost={summaryProductCost > 0 ? summaryProductCost : Math.max(0, data.summary.totalCost - summaryFreightCost - summaryOtherCosts)}
              freightCost={summaryFreightCost}
              otherCost={summaryOtherCosts}
              dealerCommission={data.summary.dealerCommission}
              hkNetProfit={data.summary.hkNetProfit}
              currency={data.summary.currency}
            />
          </Panel>

          <Panel
            title="How each figure is arrived at"
            description={data.note}
            actions={
              <Button variant="ghost" onClick={() => void load()}>
                Refresh
              </Button>
            }
          >
            <ul className="text-sm text-charcoal-light space-y-1">
              {data.formula.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Percent className="w-3.5 h-3.5 mt-1 text-himalayan" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {data.summary.assumptions.length ? (
              <div className="mt-4 space-y-2">
                {data.summary.assumptions.map((assumption) => (
                  <Notice key={assumption} kind="info">
                    {assumption}
                  </Notice>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Orders by margin"
            description="Each row keeps the costs it was raised with. Recording figures here changes the order's own record, never the price the buyer agreed."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-charcoal-light border-b border-charcoal/10">
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3">Dealer</th>
                    <th className="py-2 pr-3 text-right">Sell</th>
                    <th className="py-2 pr-3 text-right">Cost</th>
                    <th className="py-2 pr-3 text-right">Freight</th>
                    <th className="py-2 pr-3 text-right">Gross</th>
                    <th className="py-2 pr-3 text-right">Dealer share</th>
                    <th className="py-2 pr-3 text-right">HK net</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((line) => {
                    const b = line.breakdown;
                    return (
                      <tr key={line.orderId} className="border-b border-charcoal/5 align-top">
                        <td className="py-2.5 pr-3">
                          <span className="font-mono text-xs text-charcoal">{line.reference}</span>
                          <p className="text-xs text-charcoal-light">{line.status.replace(/_/g, ' ')}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-charcoal">{line.accountName}</td>
                        <td className="py-2.5 pr-3 text-xs text-charcoal-light">
                          {b.commissionBasis === 'NONE' ? (
                            'direct sale'
                          ) : (
                            <>
                              <span className="flex items-center gap-1 text-charcoal">
                                <BadgePercent className="w-3 h-3 text-himalayan" />
                                {b.dealerName || 'dealer'}
                              </span>
                              <span>
                                {b.commissionBasis === 'FIXED_AMOUNT'
                                  ? `fixed ${money(b.commissionAmount, b.currency)}`
                                  : `${b.commissionPct}% of gross profit`}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-charcoal">{b.priced ? money(b.sellTotal, b.currency) : 'not priced'}</td>
                        <td className="py-2.5 pr-3 text-right text-charcoal-light">{money(b.totalCost, b.currency)}</td>
                        <td className="py-2.5 pr-3 text-right text-charcoal-light">{money(b.freightTotal, b.currency)}</td>
                        <td className={`py-2.5 pr-3 text-right ${b.grossProfit < 0 ? 'text-amber-700' : 'text-charcoal'}`}>
                          {money(b.grossProfit, b.currency)}
                          <p className="text-xs text-charcoal-light">{b.priced ? percent(b.grossMarginPct) : '—'}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-charcoal-light">{money(b.commissionAmount, b.currency)}</td>
                        <td className={`py-2.5 pr-3 text-right font-semibold ${b.hkNetProfit < 0 ? 'text-amber-700' : 'text-charcoal'}`}>
                          {money(b.hkNetProfit, b.currency)}
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => startEditing(line.orderId, b)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                          >
                            <PiggyBank className="w-3 h-3" />
                            Record figures
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.orders.length === 0 ? (
              <p className="text-sm text-charcoal-light py-6">
                No wholesale orders yet. Raise one from an accepted quotation, then record what it actually cost.
              </p>
            ) : null}
          </Panel>

          {editing ? (
            <Panel
              title={`Record the cost picture — ${data.orders.find((line) => line.orderId === editing)?.reference ?? `#${editing}`}`}
              description="These are the figures the margin is worked out from. The sell total is not editable here: it is the price the buyer agreed, and it belongs to the quotation."
              actions={
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              }
            >
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 max-w-4xl">
                <Field label="Product cost" hint="Goods and origin charges, as they actually were">
                  <TextInput type="number" value={draft.costTotal} onChange={(value) => setDraft({ ...draft, costTotal: value })} />
                </Field>
                <Field label="Freight" hint="Ocean freight and surcharges on this order">
                  <TextInput type="number" value={draft.freightTotal} onChange={(value) => setDraft({ ...draft, freightTotal: value })} />
                </Field>
                <Field label="Other costs" hint="Destination, duty, extras actually incurred">
                  <TextInput type="number" value={draft.otherCosts} onChange={(value) => setDraft({ ...draft, otherCosts: value })} />
                </Field>
                <Field label="Dealer share of profit %" hint="0 for a direct sale">
                  <TextInput
                    type="number"
                    value={draft.commissionPct}
                    onChange={(value) => setDraft({ ...draft, commissionPct: value })}
                  />
                </Field>
                <Field label="Why these figures" hint="Kept in the audit trail next to the change" wide>
                  <TextInput value={draft.reason} onChange={(value) => setDraft({ ...draft, reason: value })} />
                </Field>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button onClick={() => void save(editing)} busy={saving}>
                  <Coins className="w-4 h-4" />
                  Record figures
                </Button>
                <span className="text-xs text-charcoal-light inline-flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  Nothing here charges, invoices or emails anyone.
                </span>
              </div>
            </Panel>
          ) : null}
        </>
      ) : (
        <Panel title="Margin & profit">
          <p className="text-sm text-charcoal-light mb-4">
            The profit view needs the wholesale orders, and WordPress did not answer. Nothing has been changed.
          </p>
          <Button onClick={() => void load()}>Try again</Button>
        </Panel>
      )}

      {orders.length === 0 ? (
        <Panel title="Nothing to report yet">
          <p className="text-sm text-charcoal-light">
            Once an accepted quotation becomes an order, its costs, the dealer&apos;s share and Himalayan Koh&apos;s net profit all appear here and stay
            on the order&apos;s own record.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
