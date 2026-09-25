/**
 * Writing a quote revision down.
 *
 * ## When a revision is recorded
 *
 * Only when a figure a buyer could hold us to has actually changed. Re-saving a quote
 * without touching its price, validity or basis writes nothing — a history padded with
 * no-op entries is a history nobody reads. The comparison is the pure diff in
 * `quoteLifecycle`, applied to the stored row and to the row as it will be after this
 * write, so the two are compared on the same fields the console displays.
 *
 * ## The write is append-only
 *
 * A revision is an `hk_wholesale_audit` row: it carries the actor, the time, the reason
 * and both snapshots, and no screen can edit or delete it. The quote row itself keeps
 * only current figures, which is what makes the history the record of what changed.
 *
 * ## A failed history must not fail the edit
 *
 * If the audit write fails the quote update still stands — losing the note about a
 * price change is bad, refusing to save an owner's correction because a log row would
 * not insert is worse. The failure is reported in the returned result so the route can
 * say so rather than pretending it was recorded.
 *
 * Server-only (it reads and writes through the plugin).
 */

import {
  buildQuoteRevision,
  commercialSnapshotFromRow,
  diffCommercial,
  revisionFromAuditRow,
  type QuoteRevision,
} from './quoteLifecycle';
import { listWholesaleRecords, upsertWholesaleRecord } from './store';

/** The stored columns a quote write may carry that a revision cares about. */
const TRACKED_COLUMNS = ['status', 'currency', 'sell_total', 'margin_pct', 'incoterm', 'containers', 'valid_until', 'destination_country', 'destination_port', 'totals', 'lines'] as const;

export interface RevisionResult {
  revision: QuoteRevision | null;
  changed: string[];
  /** The stored history could not be extended; the quote edit itself stands. */
  logFailed: boolean;
  error?: string;
}

/**
 * Records a revision when this write changes a commercial figure.
 *
 * The caller passes the row **as it was read before the update** (`stored`) together
 * with the field set it wrote. That ordering matters: the history is written after a
 * successful update, so a revision can never describe a change that did not happen,
 * and the "before" figures come from a row that was read before the write rather than
 * from a second read that would already show the new price.
 */
export async function recordQuoteRevision(input: {
  quoteId: number;
  /** The quote row as it was before this write. Omitted → it is read now. */
  stored?: Record<string, unknown>;
  data: Record<string, unknown>;
  actor: string;
  reason?: string | null;
  now?: Date;
}): Promise<RevisionResult> {
  if (!input.quoteId) return { revision: null, changed: [], logFailed: false };

  let stored = input.stored;
  if (!stored) {
    const rows = await listWholesaleRecords('quotes', { id: input.quoteId, limit: 1 });
    if (!rows.length) return { revision: null, changed: [], logFailed: false };
    stored = rows[0] as Record<string, unknown>;
  }
  const merged: Record<string, unknown> = { ...stored };
  for (const column of TRACKED_COLUMNS) {
    if (input.data[column] !== undefined) merged[column] = input.data[column];
  }

  const before = commercialSnapshotFromRow(stored);
  const after = commercialSnapshotFromRow(merged);
  const changed = diffCommercial(before, after);
  if (!changed.length) return { revision: null, changed: [], logFailed: false };

  const previous = await previousRevisionNumber(input.quoteId);
  const row = buildQuoteRevision({
    quoteRowId: input.quoteId,
    before,
    after,
    actor: input.actor,
    reason: input.reason ?? null,
    previousRevision: previous,
    at: input.now ?? new Date(),
    changed,
  });

  try {
    await upsertWholesaleRecord('audit', row as unknown as Record<string, unknown>, { actor: input.actor });
    return { revision: row.detail, changed: changed as string[], logFailed: false };
  } catch (error) {
    return {
      revision: null,
      changed: changed as string[],
      logFailed: true,
      error: error instanceof Error ? error.message : 'The revision could not be recorded.',
    };
  }
}

/** The highest revision number already stored for a quote. 0 when there are none. */
async function previousRevisionNumber(quoteId: number): Promise<number> {
  try {
    const rows = await listWholesaleRecords('audit', {
      entity: 'quotes',
      entity_id: quoteId,
      action: 'QUOTE_REVISED',
      limit: 100,
      order: 'id',
    });
    return rows.reduce((highest, entry) => {
      const detail = entry.detail && typeof entry.detail === 'object' ? (entry.detail as Record<string, unknown>) : {};
      const revision = Number(detail.revision) || 0;
      return revision > highest ? revision : highest;
    }, 0);
  } catch {
    // An unreadable history means the new entry is numbered from 0; the entry itself
    // carries its own snapshots, so nothing about the change is lost.
    return 0;
  }
}

/** A quote's stored history, newest first. Empty when WordPress cannot be read. */
export async function readQuoteRevisions(quoteId: number): Promise<QuoteRevision[]> {
  try {
    const rows = await listWholesaleRecords('audit', {
      entity: 'quotes',
      entity_id: quoteId,
      action: 'QUOTE_REVISED',
      limit: 100,
      order: 'id',
    });
    // Parsing lives in `quoteLifecycle` with the rest of the revision vocabulary, so
    // an audit row read by this module and one read by a screen cannot disagree.
    return rows
      .map((row) => revisionFromAuditRow(row))
      .filter((entry): entry is QuoteRevision => entry !== null)
      .sort((a, b) => b.revision - a.revision);
  } catch {
    return [];
  }
}
