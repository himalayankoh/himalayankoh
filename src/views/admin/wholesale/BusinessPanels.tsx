'use client';

import { useState } from 'react';
import { Check, Download, FileText, Percent, Printer, Send, Truck, UserCheck, UserX, X } from 'lucide-react';
import {
  convertWholesaleQuote,
  decideWholesaleApplication,
  downloadWholesaleQuoteDocument,
  openWholesaleQuoteDocument,
  saveWholesaleRecord,
  type WholesaleOverview,
  type WholesaleRow,
} from '@/lib/admin/wholesaleConsoleApi';
// The same expiry rule the buyer's portal and the printed document use, so the console
// cannot call a quotation live while the buyer is being told it lapsed.
import { effectiveQuoteStatus } from '@/lib/wholesale/quoteLifecycle';
import {
  Button,
  ConversionFunnelBar,
  DataTable,
  Field,
  KpiCard,
  Notice,
  Panel,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  numberValue,
  rowId,
  text,
  useWriter,
} from './ui';

/**
 * The commercial half of the wholesale console.
 *
 * These panels are where a person *decides* something — approve a buyer, send a
 * quotation, accept one, raise an order — so they are built around the decision rather
 * than around the record. Every action reports the server's answer, and none of them
 * takes an irreversible step quietly: converting a quotation asks for the payment terms
 * first, and a status change is a state the buyer will see.
 */

function money(value: unknown, currency = 'USD'): string {
  const parsed = numberValue(value);
  if (parsed === null || parsed === 0) return '—';
  return `${currency} ${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value: unknown): string {
  const raw = text(value);
  if (!raw) return '—';
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toLocaleDateString();
}

function Badge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export function OverviewPanel({ overview }: { overview: WholesaleOverview | null }) {
  if (!overview) {
    return (
      <Panel title="Overview">
        <p className="text-sm text-charcoal-light">Loading the wholesale numbers…</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          label="Applications awaiting review"
          value={overview.applications.pending}
          hint="Read by a person, not an algorithm"
          tone={overview.applications.pending > 0 ? 'warn' : 'plain'}
        />
        <KpiCard
          label="Approved buyers"
          value={overview.accounts.active}
          hint="Active wholesale accounts"
          tone="good"
        />
        <KpiCard
          label="Open requests"
          value={overview.quotes.open}
          hint="Sent to us or with our team"
          tone="info"
        />
        <KpiCard
          label="Accepted quotations"
          value={overview.quotes.accepted}
          hint="Won, not yet ordered"
          tone={overview.quotes.accepted > 0 ? 'good' : 'plain'}
        />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          label="Quoted value"
          value={money(overview.quotes.quoted_value)}
          hint={overview.definitions?.quoted_value}
        />
        <KpiCard
          label="Accepted value"
          value={money(overview.quotes.accepted_value)}
          hint={overview.definitions?.accepted_value}
        />
        <KpiCard
          label="Booked value"
          value={money(overview.orders.booked_value)}
          hint={overview.definitions?.booked_value}
          tone="accent"
        />
        <KpiCard
          label="Wholesale orders"
          value={overview.orders.total}
          hint="Trade orders, separate from retail"
        />
      </div>

      <Panel
        title="Commercial Pipeline"
        description="Progression from incoming wholesale applications through approved trade accounts, active quotations, to booked container orders."
      >
        <ConversionFunnelBar
          applications={overview.applications.pending + overview.accounts.active}
          approvedAccounts={overview.accounts.active}
          quotes={overview.quotes.open + overview.quotes.accepted}
          orders={overview.orders.total}
        />
      </Panel>

      {/*
        `[&>*]:min-w-0` is load-bearing. A grid item defaults to `min-width: auto`,
        which is its min-content width — and each of these panels holds a
        `DataTable` wide enough to read (7 columns), so the column blew out to
        380px inside a 320px pane and the whole console pane scrolled sideways.
        Letting the items shrink lets the table's own `overflow-x-auto` host do
        the scrolling, which is what it is there for.
      */}
      <div className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        <Panel title="Destinations" description="Countries the book has shipped to, by order count.">
          <DataTable
            columns={[
              { key: 'country', label: 'Country', render: (row) => <span className="text-charcoal">{row.country || 'Not recorded'}</span> },
              { key: 'orders', label: 'Orders', align: 'right', render: (row) => <span className="text-charcoal">{row.orders}</span> },
            ]}
            rows={overview.destinations}
            rowKey={(row) => row.country}
            empty="No wholesale orders yet."
          />
        </Panel>

        <Panel
          title="Container utilisation"
          description="Averaged from the loading plan each order was raised with. An order with no plan recorded counts as not measured, never as zero."
        >
          <DataTable
            columns={[
              { key: 'container', label: 'Container', render: (row) => <span className="text-charcoal font-mono text-xs">{row.container}</span> },
              { key: 'orders', label: 'Orders', align: 'right', render: (row) => <span className="text-charcoal">{row.orders}</span> },
              { key: 'weight', label: 'Weight', align: 'right', render: (row) => (
                <span className="text-charcoal-light">{row.avgWeightUtilizationPct === null ? 'not measured' : `${row.avgWeightUtilizationPct}%`}</span>
              ) },
              { key: 'volume', label: 'Volume', align: 'right', render: (row) => (
                <span className="text-charcoal-light">{row.avgVolumeUtilizationPct === null ? 'not measured' : `${row.avgVolumeUtilizationPct}%`}</span>
              ) },
            ]}
            rows={overview.container_utilisation}
            rowKey={(row) => row.container}
            empty="No container plans recorded yet."
          />
        </Panel>
      </div>

      <Panel title="Recent activity" description="Every write to a wholesale record, with who made it.">
        <DataTable
          columns={[
            { key: 'at', label: 'When', render: (row) => <span className="text-charcoal-light text-xs">{date(row.at)}</span> },
            { key: 'actor', label: 'Who', render: (row) => <span className="text-charcoal">{text(row.actor) || 'system'}</span> },
            { key: 'action', label: 'Action', render: (row) => <span className="text-charcoal-light">{text(row.action)}</span> },
            { key: 'entity', label: 'Record', render: (row) => (
              <span className="text-charcoal-light text-xs font-mono">{text(row.entity)} #{text(row.entity_id)}</span>
            ) },
          ]}
          rows={overview.audit.recent}
          rowKey={(row, index) => String(rowId(row) ?? `audit-${index}`)}
          empty="No activity recorded yet."
        />
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

export function ApplicationsPanel({
  applications,
  reload,
}: {
  applications: WholesaleRow[];
  reload: () => Promise<void> | void;
}) {
  const [filter, setFilter] = useState('PENDING');
  const writer = useWriter();

  const shown = filter === 'ALL' ? applications : applications.filter((row) => text(row.status) === filter);

  async function decide(row: WholesaleRow, decision: string) {
    const id = rowId(row);
    if (!id) return;
    const result = await writer.run(
      () => decideWholesaleApplication({ applicationId: id, decision }),
      decision === 'APPROVED'
        ? 'Approved — the buyer now has a wholesale account.'
        : `Application marked ${decision.replace(/_/g, ' ').toLowerCase()}.`
    );
    if (!result) return;
    await reload();
    // Approval also settles whether the buyer can sign in at all, because WordPress is
    // where their password lives. Saying which of the two happened is the difference
    // between "approved" and "they can actually reach the portal".
    if (decision === 'APPROVED' && result.buyerUser?.message) {
      writer.setSaved(result.buyerUser.message);
    }
  }

  return (
    <Panel
      title="Applications"
      description="One row is one business asking to buy wholesale. Approving creates the wholesale account and, when the business has no WordPress user yet, a sign-in account with the wholesale buyer role plus WordPress's own set-password email — a buyer who already has a WordPress account keeps it and its role untouched. Your written reply is still yours to send."
      actions={
        <Select
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'MORE_INFO_REQUIRED', label: 'More information required' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'SUSPENDED', label: 'Suspended' },
            { value: 'ALL', label: 'All applications' },
          ]}
        />
      }
    >
      <div className="space-y-5">
        {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}
        {writer.saved ? <Notice kind="success">{writer.saved}</Notice> : null}

        <DataTable
          columns={[
            { key: 'company', label: 'Business', render: (row) => (
              <div>
                <p className="text-charcoal font-medium">{text(row.company)}</p>
                <p className="text-xs text-charcoal-light">
                  {text(row.contact_name)} · {text(row.email)}
                  {text(row.phone) ? ` · ${text(row.phone)}` : ''}
                </p>
              </div>
            ) },
            { key: 'where', label: 'Where', render: (row) => (
              <div className="text-xs text-charcoal-light">
                <p>{[text(row.country), text(row.business_type)].filter(Boolean).join(' · ') || '—'}</p>
                <p>
                  {[text(row.destination_country), text(row.destination_port)].filter(Boolean).join(' → ') || 'destination not stated'}
                </p>
              </div>
            ) },
            { key: 'volume', label: 'Volume', render: (row) => (
              <div className="text-xs text-charcoal-light">
                <p>{text(row.monthly_volume) || 'not stated'}</p>
                <p>{text(row.logistics_mode) || ''}</p>
              </div>
            ) },
            { key: 'status', label: 'Status', render: (row) => <Badge status={text(row.status, 'PENDING')} /> },
            { key: 'received', label: 'Received', align: 'right', render: (row) => (
              <span className="text-charcoal-light text-xs">{date(row.created_at)}</span>
            ) },
            { key: 'actions', label: '', align: 'right', render: (row) => {
              const status = text(row.status);
              return (
                <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                  {status !== 'APPROVED' ? (
                    <button
                      type="button"
                      onClick={() => decide(row, 'APPROVED')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                    >
                      <Check className="w-3 h-3" />
                      Approve
                    </button>
                  ) : (
                    <span className="text-xs text-charcoal-light">
                      {numberValue(row.account_id) ? `Account #${text(row.account_id)}` : 'Account created'}
                    </span>
                  )}
                  {status !== 'MORE_INFO_REQUIRED' ? (
                    <button
                      type="button"
                      onClick={() => decide(row, 'MORE_INFO_REQUIRED')}
                      className="px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                    >
                      More info
                    </button>
                  ) : null}
                  {status !== 'REJECTED' ? (
                    <button
                      type="button"
                      onClick={() => decide(row, 'REJECTED')}
                      className="px-2.5 py-1 rounded-full border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Reject
                    </button>
                  ) : null}
                </span>
              );
            } },
          ]}
          rows={shown}
          rowKey={(row, index) => String(rowId(row) ?? `application-${index}`)}
          empty={filter === 'PENDING' ? 'No applications awaiting review.' : 'No applications with that status.'}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export function AccountsPanel({
  accounts,
  reload,
}: {
  accounts: WholesaleRow[];
  reload: () => Promise<void> | void;
}) {
  const writer = useWriter();

  async function setStatus(row: WholesaleRow, status: 'ACTIVE' | 'SUSPENDED') {
    const id = rowId(row);
    if (!id) return;
    const done = await writer.run(
      () => saveWholesaleRecord('accounts', { status }, id),
      status === 'ACTIVE' ? 'Account reactivated.' : 'Account suspended — the buyer loses portal access on their next request.'
    );
    if (done) await reload();
  }

  /**
   * The dealer's standing share of profit.
   *
   * Set on the account rather than on each order because it is an agreement with a
   * partner, not a per-shipment decision — and it is copied onto an order when that
   * order is raised, so changing it here cannot rewrite a margin already agreed.
   */
  async function setCommission(row: WholesaleRow) {
    const id = rowId(row);
    if (!id) return;
    const current = numberValue(row.commission_pct) ?? 0;
    const answer = window.prompt(
      `Dealer's share of gross profit on orders from ${text(row.company) || 'this account'} (percent, 0 for none):`,
      String(current)
    );
    if (answer === null) return;
    const parsed = numberValue(answer);
    if (parsed === null || parsed < 0 || parsed > 100) {
      writer.setError('A share of profit is a number between 0 and 100.');
      return;
    }
    const done = await writer.run(
      () => saveWholesaleRecord('accounts', { commission_pct: parsed }, id),
      parsed > 0
        ? `Recorded: this account's orders carry a ${parsed}% dealer share of gross profit.`
        : 'Recorded: no dealer share on this account.'
    );
    if (done) await reload();
  }

  return (
    <Panel
      title="Wholesale accounts"
      description="Approved buyers. Terms and destination are the account's default; each quotation and order keeps its own copy, so changing them here never edits a document you have already sent."
    >
      <div className="space-y-5">
        {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}
        {writer.saved ? <Notice kind="success">{writer.saved}</Notice> : null}

        <DataTable
          columns={[
            { key: 'company', label: 'Business', render: (row) => (
              <div>
                <p className="text-charcoal font-medium">{text(row.company)}</p>
                <p className="text-xs text-charcoal-light">
                  {text(row.ref) ? `${text(row.ref)} · ` : ''}
                  {text(row.contact_name)} · {text(row.email)}
                </p>
              </div>
            ) },
            { key: 'type', label: 'Type', render: (row) => <span className="text-charcoal-light text-xs">{text(row.business_type) || '—'}</span> },
            { key: 'dest', label: 'Destination', render: (row) => (
              <span className="text-charcoal-light text-xs">
                {[text(row.destination_country), text(row.destination_port)].filter(Boolean).join(' → ') || '—'}
              </span>
            ) },
            { key: 'terms', label: 'Terms', render: (row) => (
              <span className="text-charcoal-light text-xs">{text(row.payment_terms) || 'Confirmed per order'}</span>
            ) },
            { key: 'dealer', label: 'Dealer share', render: (row) => (
              <span className="text-charcoal-light text-xs inline-flex items-center gap-1">
                <Percent className="w-3 h-3 text-himalayan" />
                {numberValue(row.commission_pct) ? `${numberValue(row.commission_pct)}% of gross profit` : 'direct sale'}
              </span>
            ) },
            { key: 'status', label: 'Status', render: (row) => <Badge status={text(row.status, 'ACTIVE')} /> },
            { key: 'approved', label: 'Approved', align: 'right', render: (row) => (
              <span className="text-charcoal-light text-xs">{date(row.approved_at)}</span>
            ) },
            { key: 'actions', label: '', align: 'right', render: (row) => (
              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => void setCommission(row)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                >
                  <Percent className="w-3 h-3" />
                  Set share
                </button>
                {text(row.status) === 'ACTIVE' ? (
                  <button
                    type="button"
                    onClick={() => setStatus(row, 'SUSPENDED')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    <UserX className="w-3 h-3" />
                    Suspend
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus(row, 'ACTIVE')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                  >
                    <UserCheck className="w-3 h-3" />
                    Reactivate
                  </button>
                )}
              </span>
            ) },
          ]}
          rows={accounts}
          rowKey={(row, index) => String(rowId(row) ?? `account-${index}`)}
          empty="No wholesale accounts yet. Approve an application to create one."
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Quotations                                                          */
/* ------------------------------------------------------------------ */

const PAYMENT_TERM_LABELS = [
  'Proforma — 100% before shipment',
  'Deposit then balance before shipment',
  'Deposit then balance against documents',
  'Letter of credit at sight',
  'Open account',
];

export function QuotesPanel({
  quotes,
  accounts,
  vocabulary,
  reload,
  onPrice,
}: {
  quotes: WholesaleRow[];
  accounts: WholesaleRow[];
  vocabulary: { quoteStatuses: string[] };
  reload: () => Promise<void> | void;
  /** Hands a quotation back to the calculator so the owner can re-price it. */
  onPrice: (quoteId: number) => void;
}) {
  const writer = useWriter();
  const [converting, setConverting] = useState<WholesaleRow | null>(null);
  const [terms, setTerms] = useState({ label: PAYMENT_TERM_LABELS[1], depositPct: '30', notes: '' });

  const accountName = (id: unknown): string => {
    const row = accounts.find((account) => rowId(account) === numberValue(id));
    return row ? text(row.company) : `Account #${text(id)}`;
  };

  /**
   * The status a reader should be shown: the stored one, unless its validity date has
   * passed. A lapsed quotation is displayed as `EXPIRED` while the stored word stays
   * `QUOTED` — that is the history, and the audit trail keeps it.
   */
  const displayStatus = (row: WholesaleRow): string =>
    effectiveQuoteStatus(text(row.status, 'DRAFT'), text(row.valid_until) || null);

  const lineSummary = (row: WholesaleRow): string => {
    const lines = Array.isArray(row.lines) ? row.lines : [];
    if (!lines.length) return 'no lines';
    const units = lines.reduce((total, line) => {
      const entry = (line && typeof line === 'object' ? line : {}) as Record<string, unknown>;
      return total + (numberValue(entry.units) ?? 0);
    }, 0);
    return `${lines.length} product${lines.length === 1 ? '' : 's'} · ${units.toLocaleString('en-US')} units`;
  };

  async function setStatus(row: WholesaleRow, status: string) {
    const id = rowId(row);
    if (!id) return;
    const done = await writer.run(() => saveWholesaleRecord('quotes', { status }, id), `Quotation marked ${status}.`);
    if (done) await reload();
  }

  async function convert() {
    if (!converting) return;
    const id = rowId(converting);
    if (!id) return;
    const deposit = numberValue(terms.depositPct) ?? 0;
    const done = await writer.run(
      () =>
        convertWholesaleQuote({
          quoteId: id,
          paymentTerms: {
            label: terms.label,
            depositPct: deposit,
            balancePct: Math.max(0, 100 - deposit),
            detail: terms.notes,
          },
          notes: terms.notes,
        }),
      'Wholesale order raised.'
    );
    if (done) {
      setConverting(null);
      await reload();
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Quotations"
        description="Requests from buyers and the quotations issued against them. A quotation's cost, freight and exchange rate are frozen when it is priced — re-pricing it here creates a new snapshot rather than editing the one the buyer holds."
      >
        <div className="space-y-5">
          {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}
          {writer.saved ? <Notice kind="success">{writer.saved}</Notice> : null}

          <DataTable
            columns={[
              { key: 'ref', label: 'Reference', render: (row) => (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-charcoal">{text(row.ref) || `#${text(row.id)}`}</span>
                    <span className="px-1.5 py-0.5 rounded bg-charcoal/5 text-[10px] font-mono text-charcoal-light">
                      Rev {row.revision ? text(row.revision) : '1'}
                    </span>
                  </div>
                  <p className="text-[11px] text-charcoal-light mt-0.5">{date(row.created_at)}</p>
                </div>
              ) },
              { key: 'buyer', label: 'Buyer', render: (row) => (
                <div>
                  <p className="text-charcoal font-medium">{accountName(row.account_id)}</p>
                  <p className="text-xs text-charcoal-light">{lineSummary(row)}</p>
                </div>
              ) },
              { key: 'lane', label: 'Basis / lane', render: (row) => (
                <span className="text-charcoal-light text-xs">
                  <span className="font-medium text-charcoal">{text(row.incoterm, 'EXW')}</span>
                  {text(row.destination_country) ? ` · ${text(row.destination_country)}` : ''}
                  {text(row.destination_port) ? ` (${text(row.destination_port)})` : ''}
                </span>
              ) },
              { key: 'source', label: 'Source', render: (row) => {
                const src = text(row.source, 'portal');
                return (
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-charcoal-light">
                    {src === 'portal' ? 'Buyer RFQ' : src === 'manual' ? 'Trade Desk' : src}
                  </span>
                );
              } },
              { key: 'value', label: 'Quoted', align: 'right', render: (row) => (
                <span className="font-medium text-charcoal">{money(row.sell_total, text(row.currency, 'USD'))}</span>
              ) },
              { key: 'valid', label: 'Valid to', align: 'right', render: (row) => (
                <span className="text-charcoal-light text-xs">
                  {text(row.valid_until) ? date(row.valid_until) : 'not stated'}
                  {displayStatus(row) === 'EXPIRED' && text(row.status) !== 'EXPIRED' ? (
                    <span className="block text-amber-700 font-semibold">lapsed</span>
                  ) : null}
                </span>
              ) },
              { key: 'status', label: 'Status', render: (row) => <Badge status={displayStatus(row)} /> },
              { key: 'actions', label: '', align: 'right', render: (row) => {
                const id = rowId(row);
                const status = text(row.status);
                return (
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    {id ? (
                      <button
                        type="button"
                        onClick={() => onPrice(id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                      >
                        <FileText className="w-3 h-3" />
                        Price
                      </button>
                    ) : null}
                    {id ? (
                      <button
                        type="button"
                        onClick={() => {
                          void writer.run(
                            () => openWholesaleQuoteDocument(id),
                            'Quotation opened in a new tab — print or save it from there.'
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                      >
                        <Printer className="w-3 h-3" />
                        Print
                      </button>
                    ) : null}
                    {id ? (
                      <button
                        type="button"
                        onClick={() => {
                          void writer.run(
                            () => downloadWholesaleQuoteDocument(id),
                            'Quotation downloaded as a file.'
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    ) : null}
                    {status === 'SUBMITTED' ? (
                      <button
                        type="button"
                        onClick={() => setStatus(row, 'UNDER_REVIEW')}
                        className="px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                      >
                        Review
                      </button>
                    ) : null}
                    {status === 'QUOTED' ? (
                      <button
                        type="button"
                        onClick={() => setStatus(row, 'ACCEPTED')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                      >
                        <Check className="w-3 h-3" />
                        Accepted
                      </button>
                    ) : null}
                    {status === 'ACCEPTED' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConverting(row);
                          setTerms({ label: PAYMENT_TERM_LABELS[1], depositPct: '30', notes: '' });
                          writer.clear();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-charcoal text-white text-xs font-semibold hover:bg-charcoal-light"
                      >
                        <Truck className="w-3 h-3" />
                        Raise order
                      </button>
                    ) : null}
                    {status === 'QUOTED' || status === 'SUBMITTED' || status === 'UNDER_REVIEW' ? (
                      <button
                        type="button"
                        onClick={() => setStatus(row, 'EXPIRED')}
                        className="px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal-light hover:bg-charcoal/5"
                      >
                        Expire
                      </button>
                    ) : null}
                  </span>
                );
              } },
            ]}
            rows={quotes}
            rowKey={(row, index) => String(rowId(row) ?? `quote-${index}`)}
            empty="No quotations yet."
          />
        </div>
      </Panel>

      {converting ? (
        <Panel
          title={`Raise an order — ${text(converting.ref) || `#${text(converting.id)}`}`}
          description="This records the agreement and the terms. It charges nothing, sends no documents and emails nobody: the money moves by bank transfer between people, on the terms you choose here."
          actions={
            <Button variant="ghost" onClick={() => setConverting(null)}>
              <X className="w-4 h-4" />
              Cancel
            </Button>
          }
        >
          <div className="space-y-4 max-w-2xl">
            <Field label="Payment terms">
              <Select
                value={terms.label}
                onChange={(value) => setTerms({ ...terms, label: value })}
                options={PAYMENT_TERM_LABELS.map((label) => ({ value: label, label }))}
              />
            </Field>
            <Field label="Deposit %" hint={`Balance will be recorded as ${Math.max(0, 100 - (numberValue(terms.depositPct) ?? 0))}%.`}>
              <TextInput
                type="number"
                value={terms.depositPct}
                onChange={(value) => setTerms({ ...terms, depositPct: value })}
              />
            </Field>
            <Field label="Notes for the order" wide>
              <TextArea value={terms.notes} onChange={(value) => setTerms({ ...terms, notes: value })} />
            </Field>

            {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}

            <div className="flex items-center gap-3">
              <Button onClick={convert} busy={writer.saving}>
                <Send className="w-4 h-4" />
                Raise wholesale order
              </Button>
              <Button variant="ghost" onClick={() => setConverting(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export function OrdersPanel({
  orders,
  accounts,
  quotes = [],
  vocabulary,
  reload,
}: {
  orders: WholesaleRow[];
  accounts: WholesaleRow[];
  quotes?: WholesaleRow[];
  vocabulary: { orderStatuses: string[] };
  reload: () => Promise<void> | void;
}) {
  const writer = useWriter();

  const accountName = (id: unknown): string => {
    const row = accounts.find((account) => rowId(account) === numberValue(id));
    return row ? text(row.company) : `Account #${text(id)}`;
  };

  const quoteRef = (id: unknown): string => {
    if (!id) return '—';
    const num = numberValue(id);
    const q = quotes.find((item) => rowId(item) === num);
    return q ? (text(q.ref) || `#${num}`) : `#${num}`;
  };

  const dealerDetail = (row: WholesaleRow) => {
    const acc = accounts.find((a) => rowId(a) === numberValue(row.account_id));
    const commPct = numberValue(row.commission_pct) ?? numberValue(acc?.commission_pct) ?? 0;
    if (commPct > 0) {
      return {
        isDealer: true,
        label: `${commPct}% profit share`,
      };
    }
    return {
      isDealer: false,
      label: 'Direct sale',
    };
  };

  async function update(row: WholesaleRow, patch: Record<string, unknown>, message: string) {
    const id = rowId(row);
    if (!id) return;
    const done = await writer.run(() => saveWholesaleRecord('orders', patch, id), message);
    if (done) await reload();
  }

  return (
    <Panel
      title="Wholesale orders"
      description="Trade orders raised from accepted quotations. They are deliberately not WooCommerce orders: a container must not consume retail stock reservation or trigger a storefront email."
    >
      <div className="space-y-5">
        {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}
        {writer.saved ? <Notice kind="success">{writer.saved}</Notice> : null}

        <DataTable
          columns={[
            { key: 'ref', label: 'Reference', render: (row) => (
              <div>
                <p className="font-mono text-xs font-semibold text-charcoal">{text(row.ref) || `#${text(row.id)}`}</p>
                <p className="text-[11px] text-charcoal-light">{date(row.created_at)}</p>
              </div>
            ) },
            { key: 'buyer', label: 'Buyer', render: (row) => (
              <div>
                <p className="text-charcoal font-medium">{accountName(row.account_id)}</p>
                <p className="text-xs text-charcoal-light">
                  {text(row.incoterm)}
                  {text(row.destination_country) ? ` · ${text(row.destination_country)}` : ''}
                </p>
              </div>
            ) },
            { key: 'quote', label: 'Quote source', render: (row) => (
              <span className="font-mono text-xs text-charcoal-light">{quoteRef(row.quote_id)}</span>
            ) },
            { key: 'dealer', label: 'Dealer', render: (row) => {
              const d = dealerDetail(row);
              return (
                <span className={`text-xs ${d.isDealer ? 'text-charcoal font-medium' : 'text-charcoal-light'}`}>
                  {d.label}
                </span>
              );
            } },
            { key: 'value', label: 'Order value', align: 'right', render: (row) => (
              <span className="font-medium text-charcoal">{money(row.sell_total, text(row.currency, 'USD'))}</span>
            ) },
            { key: 'cost', label: 'Landed cost', align: 'right', render: (row) => (
              <span className="text-charcoal-light text-xs">{money(row.cost_total, text(row.currency, 'USD'))}</span>
            ) },
            { key: 'dealer_comm', label: 'Dealer comm.', align: 'right', render: (row) => (
              <span className="text-charcoal-light text-xs">{money(row.dealer_commission, text(row.currency, 'USD'))}</span>
            ) },
            { key: 'hk_net', label: 'HK Net profit', align: 'right', render: (row) => {
              const profit = numberValue(row.hk_net_profit);
              const tone = profit !== null && profit < 0 ? 'text-rose-600 font-semibold' : 'text-charcoal font-semibold';
              return <span className={tone}>{money(row.hk_net_profit, text(row.currency, 'USD'))}</span>;
            } },
            { key: 'paid', label: 'Paid / Balance', align: 'right', render: (row) => (
              <div className="text-xs">
                <p className="text-charcoal">{money(row.paid_amount, text(row.currency, 'USD'))}</p>
                {numberValue(row.sell_total) && numberValue(row.sell_total)! > 0 ? (
                  <p className="text-charcoal-light text-[11px]">
                    bal {money((numberValue(row.sell_total) ?? 0) - (numberValue(row.paid_amount) ?? 0), text(row.currency, 'USD'))}
                  </p>
                ) : null}
              </div>
            ) },
            { key: 'status', label: 'Status', render: (row) => <Badge status={text(row.status, 'DRAFT')} /> },
            { key: 'actions', label: '', align: 'right', render: (row) => (
              <span className="inline-flex items-center gap-2">
                <select
                  className="px-2.5 py-1.5 rounded-xl border border-charcoal/15 text-xs text-charcoal bg-white"
                  value={text(row.status, 'DRAFT')}
                  onChange={(event) => update(row, { status: event.target.value }, 'Order status updated.')}
                >
                  {vocabulary.orderStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const current = numberValue(row.paid_amount) ?? 0;
                    const next = window.prompt('Amount received (this records the payment; it does not take one):', String(current));
                    if (next === null) return;
                    const parsed = numberValue(next);
                    if (parsed === null) {
                      writer.setError('That is not a number.');
                      return;
                    }
                    void update(row, { paid_amount: parsed }, 'Payment recorded.');
                  }}
                  className="px-2.5 py-1 rounded-full border border-charcoal/15 text-xs font-semibold text-charcoal hover:bg-charcoal/5"
                >
                  Record payment
                </button>
              </span>
            ) },
          ]}
          rows={orders}
          rowKey={(row, index) => String(rowId(row) ?? `order-${index}`)}
          empty="No wholesale orders yet. Raise one from an accepted quotation."
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export function AuditPanel({ rows }: { rows: WholesaleRow[] }) {
  const [filter, setFilter] = useState('');

  const shown = filter ? rows.filter((row) => text(row.entity) === filter) : rows;

  return (
    <Panel
      title="Audit trail"
      description="Every create, update and delete on a wholesale record, with the actor from the admin session. A quotation's status changes are logged as their own action, so a re-priced quote leaves a readable history."
      actions={
        <TextInput value={filter} onChange={setFilter} placeholder="Filter by record type, e.g. quotes" />
      }
    >
      <DataTable
        columns={[
          { key: 'at', label: 'When', render: (row) => <span className="text-charcoal-light text-xs">{text(row.at)}</span> },
          { key: 'actor', label: 'Who', render: (row) => <span className="text-charcoal">{text(row.actor) || 'system'}</span> },
          { key: 'action', label: 'Action', render: (row) => <span className="text-charcoal-light">{text(row.action)}</span> },
          { key: 'entity', label: 'Record', render: (row) => (
            <span className="text-charcoal-light text-xs font-mono">
              {text(row.entity)} #{text(row.entity_id)}
            </span>
          ) },
          { key: 'detail', label: 'Detail', render: (row) => {
            const detail = (row.detail && typeof row.detail === 'object' ? row.detail : {}) as Record<string, unknown>;
            const fields = Array.isArray(detail.fields) ? (detail.fields as unknown[]).map(String) : [];
            if (fields.length) return <span className="text-charcoal-light text-xs">{fields.join(', ')}</span>;
            if (detail.status) return <span className="text-charcoal-light text-xs">status → {text(detail.status)}</span>;
            return <span className="text-charcoal-light text-xs">—</span>;
          } },
        ]}
        rows={shown}
        rowKey={(row, index) => String(rowId(row) ?? `audit-${index}`)}
        empty="No audit entries yet."
      />
    </Panel>
  );
}

export { Badge as WholesaleStatusBadge, money as wholesaleMoney, date as wholesaleDate };
