/**
 * A quotation's life after it is sent: it expires, and it gets revised.
 *
 * ## Expiry is a fact about the row, not a job
 *
 * A quote that says "valid until 30 September" is expired on 1 October whether or not
 * anything ran overnight. So the effective status is *derived* here from the stored
 * `valid_until`, and every reader — the console list, the buyer's portal, the quote
 * document — shows the same answer without depending on a sweep having run. The
 * stored status is left alone: overwriting it would destroy the fact that the owner
 * once quoted it, which is what a revision history is for.
 *
 * Only statuses that are actually waiting on someone expire. An ACCEPTED or
 * CONVERTED_TO_ORDER quote is a closed agreement; a REJECTED one is already dead, and
 * an EXPIRED one stays expired. DRAFT is the owner's scratch pad and is not a promise.
 *
 * ## Revisions are audit rows
 *
 * A revision is not a second table: it is the previous commercial snapshot written to
 * `hk_wholesale_audit` with `action = QUOTE_REVISED`, which is append-only, carries the
 * actor and the time, and cannot be edited from any screen. That is the property a
 * revision history needs — a quote whose price changed must be provable later.
 *
 * The snapshot deliberately holds only the figures a buyer could be held to: the sell
 * total, the sell price per unit, the margin, the cost basis, the countersigned
 * validity date and the basis. Packaging and freight detail are already frozen on the
 * quote row itself, so copying them here would be a second copy to disagree with the
 * first.
 *
 * Pure — no I/O, no clock beyond what the caller passes in.
 */

import type { QuoteStatus } from './types';

/** Statuses that can still expire, because someone is still waiting on them. */
const EXPIRABLE: readonly QuoteStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUOTED'];

/** True when a date has passed. An absent date never expires anything. */
export function isQuoteExpired(validUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!validUntil) return false;
  const parsed = Date.parse(validUntil);
  if (!Number.isFinite(parsed)) return false;
  // A quote is valid *through* its stated day, so the comparison is by day, not by
  // the instant: a date-only value parses to midnight and would otherwise expire a
  // full day early for everyone east of UTC.
  const endOfDay = parsed + 24 * 60 * 60 * 1000;
  return now.getTime() >= endOfDay;
}

/** The status a reader should be shown, which is the stored one unless it has lapsed. */
export function effectiveQuoteStatus(
  status: string | null | undefined,
  validUntil: string | null | undefined,
  now: Date = new Date()
): QuoteStatus {
  const stored = String(status ?? '').toUpperCase() as QuoteStatus;
  if (EXPIRABLE.includes(stored) && isQuoteExpired(validUntil, now)) return 'EXPIRED';
  return stored || 'DRAFT';
}

/** Whole days until the quote lapses; negative when it already has. Null when unset. */
export function daysUntilExpiry(validUntil: string | null | undefined, now: Date = new Date()): number | null {
  if (!validUntil) return null;
  const parsed = Date.parse(validUntil);
  if (!Number.isFinite(parsed)) return null;
  return Math.ceil((parsed + 24 * 60 * 60 * 1000 - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * The sentence a screen shows about validity.
 *
 * Stated on expiry rather than on a quote that is merely valid: "valid for 3 more
 * days" on a quote nobody is thinking about is noise, while a lapsed quote that still
 * looks live is the mistake worth preventing.
 */
export function validitySentence(validUntil: string | null | undefined, now: Date = new Date()): string | null {
  const days = daysUntilExpiry(validUntil, now);
  if (days === null) return null;
  if (days < 0) return `This quotation lapsed ${Math.abs(days)} day(s) ago. Ask for a refreshed price — costs and freight move.`;
  if (days === 0) return 'This quotation is valid until the end of today.';
  if (days <= 7) return `This quotation is valid for ${days} more day(s).`;
  return null;
}

/** A date `days` from now, as the ISO day the plugin stores. */
export function validityDateFromDays(days: number, now: Date = new Date()): string {
  const safeDays = Number.isFinite(days) && days > 0 && days <= 3_650 ? Math.trunc(days) : 30;
  return new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Revisions                                                          */
/* ------------------------------------------------------------------ */

/**
 * The figures a buyer could hold us to, as they stood at one moment.
 *
 * `validUntil` is in here on purpose: extending validity is a commercial change (the
 * supplier's freight quote may have moved), and a revision history that omitted it
 * would let a quote be kept alive indefinitely with no trace.
 */
export interface QuoteCommercialSnapshot {
  status: string;
  currency: string;
  sellTotal: number;
  sellPerUnit: number;
  marginPct: number;
  costTotal: number;
  validUntil: string;
  incoterm: string;
  containers: number;
  destinationCountry: string;
  destinationPort: string;
}

/** The stored columns of a quote row, as a snapshot needs them. */
export interface QuoteSnapshotRow {
  status?: unknown;
  currency?: unknown;
  sell_total?: unknown;
  margin_pct?: unknown;
  incoterm?: unknown;
  containers?: unknown;
  valid_until?: unknown;
  destination_country?: unknown;
  destination_port?: unknown;
  totals?: unknown;
  lines?: unknown;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function unitsIn(row: QuoteSnapshotRow): number {
  const lines = Array.isArray(row.lines) ? row.lines : [];
  return lines.reduce((total, entry) => total + num(object(entry).units), 0);
}

/** A stored quote row → the snapshot a revision compares. */
export function commercialSnapshotFromRow(row: QuoteSnapshotRow): QuoteCommercialSnapshot {
  const totals = object(row.totals);
  const sellTotal = num(row.sell_total) || num(totals.sellTotal);
  const units = unitsIn(row);

  return {
    status: str(row.status).toUpperCase(),
    currency: str(row.currency) || 'USD',
    sellTotal: Math.round(sellTotal * 100) / 100,
    sellPerUnit: num(totals.sellPerUnit) || (units > 0 ? Math.round((sellTotal / units) * 10_000) / 10_000 : 0),
    marginPct: num(row.margin_pct),
    costTotal: num(totals.total) || num(totals.costTotal),
    validUntil: str(row.valid_until),
    incoterm: str(row.incoterm).toUpperCase(),
    containers: num(row.containers) || 1,
    destinationCountry: str(row.destination_country),
    destinationPort: str(row.destination_port),
  };
}

/** The fields that differ, named. Empty means "nothing commercial changed". */
export function diffCommercial(
  before: QuoteCommercialSnapshot,
  after: QuoteCommercialSnapshot
): Array<keyof QuoteCommercialSnapshot> {
  const keys = Object.keys(before) as Array<keyof QuoteCommercialSnapshot>;
  return keys.filter((key) => before[key] !== after[key]);
}

/**
 * A revision as it is stored and read back.
 *
 * `changed` is the field list, kept so a reader does not have to diff two objects to
 * answer "what actually changed here?".
 */
export interface QuoteRevision {
  revision: number;
  at: string;
  actor: string;
  reason: string;
  changed: string[];
  before: QuoteCommercialSnapshot;
  after: QuoteCommercialSnapshot;
}

/** The audit row a revision becomes. `entity_id` is the quote's row id. */
export function buildQuoteRevision(input: {
  quoteRowId: number;
  before: QuoteCommercialSnapshot;
  after: QuoteCommercialSnapshot;
  actor: string;
  reason?: string | null;
  previousRevision?: number;
  at?: Date;
  changed?: Array<keyof QuoteCommercialSnapshot>;
}): { at: string; actor: string; action: string; entity: string; entity_id: number; detail: QuoteRevision } {
  const changed = input.changed ?? diffCommercial(input.before, input.after);
  const at = (input.at ?? new Date()).toISOString();

  return {
    at,
    actor: input.actor,
    action: 'QUOTE_REVISED',
    entity: 'quotes',
    entity_id: input.quoteRowId,
    detail: {
      revision: Math.max(1, Math.trunc(input.previousRevision ?? 0) + 1),
      at,
      actor: input.actor,
      reason: (input.reason ?? '').trim().slice(0, 500),
      changed: changed as string[],
      before: input.before,
      after: input.after,
    },
  };
}

/** One audit row → a revision, or null when the row is something else. */
export function revisionFromAuditRow(row: Record<string, unknown>): QuoteRevision | null {
  const action = str(row.action).toUpperCase();
  if (action !== 'QUOTE_REVISED') return null;

  const detail = object(row.detail);
  const before = object(detail.before);
  const after = object(detail.after);
  if (!Object.keys(before).length && !Object.keys(after).length) return null;

  return {
    revision: num(detail.revision) || 1,
    at: str(detail.at) || str(row.at),
    actor: str(detail.actor) || str(row.actor),
    reason: str(detail.reason),
    changed: Array.isArray(detail.changed) ? detail.changed.map((entry) => str(entry)) : [],
    before: before as unknown as QuoteCommercialSnapshot,
    after: after as unknown as QuoteCommercialSnapshot,
  };
}

/**
 * A quote's revisions, newest first.
 *
 * The rows come from the console's own audit read, which is filtered by entity and
 * id on the server; this only parses and orders them. A row this module does not
 * recognise is skipped rather than guessed at.
 */
export function revisionHistory(rows: Array<Record<string, unknown>>): QuoteRevision[] {
  return rows
    .map(revisionFromAuditRow)
    .filter((entry): entry is QuoteRevision => entry !== null)
    .sort((a, b) => b.revision - a.revision);
}

/** A human line per changed field, for the console's history list. */
export function describeRevision(revision: QuoteRevision): string[] {
  return revision.changed.map((field) => {
    const before = (revision.before as unknown as Record<string, unknown>)[field];
    const after = (revision.after as unknown as Record<string, unknown>)[field];
    return `${humanField(field)}: ${humanValue(field, before)} → ${humanValue(field, after)}`;
  });
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  currency: 'Currency',
  sellTotal: 'Sell total',
  sellPerUnit: 'Sell price per unit',
  marginPct: 'Margin',
  costTotal: 'Cost basis',
  validUntil: 'Valid until',
  incoterm: 'Basis',
  containers: 'Containers',
  destinationCountry: 'Destination country',
  destinationPort: 'Destination port',
};

function humanField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function humanValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field === 'marginPct') return `${Number(value)}%`;
  if (field === 'containers') return String(value);
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}
