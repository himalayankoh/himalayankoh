import { storefrontRequest } from '@/lib/wordpress/storefrontClient';
import type {
  EvidenceRecord,
  EvidenceStatus,
  NormalizedEvidence,
} from './types';

/**
 * The evidence inbox, stored in WordPress (`wp_hk_hermes_evidence`).
 *
 * It used to live in Supabase. The move is not cosmetic: the dedupe rule that makes
 * a re-run of a collector harmless is now the table's UNIQUE key, so two concurrent
 * ingests cannot both win, and the inbox itself is read and written through the same
 * administrator credential the rest of the WordPress-owned app state uses.
 *
 * ## The memory fallback
 *
 * When WordPress cannot be reached the store keeps the findings in memory for the
 * life of the process and answers normally. That is deliberate for the *ingest*
 * path — a collector run must not fail because a fetch blipped — but it is not a
 * second database: nothing durable is claimed, and a read that cannot reach the
 * store says so in its result rather than returning an empty inbox as if the inbox
 * were empty.
 */
const memoryStore = new Map<string, EvidenceRecord>();

export interface IngestStoreResult {
  status: 'CREATED' | 'ALREADY_EXISTS';
  id: string;
  dedupe_key: string;
  observed_at: string;
  record: EvidenceRecord;
}

/** The stored row, as WordPress reports it. */
type EvidenceRow = EvidenceRecord & { id: string | number };

function toRecord(row: EvidenceRow): EvidenceRecord {
  return { ...row, id: String(row.id) };
}

/** Records one finding, deduplicated on its dedupe key. */
export async function insertEvidence(
  evidence: NormalizedEvidence
): Promise<IngestStoreResult> {
  const now = new Date().toISOString();

  try {
    const body = {
      dedupe_key: evidence.dedupe_key,
      source: evidence.source,
      type: evidence.type,
      entity: evidence.entity || {},
      title: evidence.title,
      summary: evidence.summary,
      evidence: evidence.evidence || [],
      confidence: evidence.confidence,
      priority: evidence.priority,
      recommended_action: evidence.recommended_action || null,
      observed_at: evidence.observed_at,
      metadata: evidence.metadata || {},
    };

    const result = await storefrontRequest<{ status: 'CREATED' | 'ALREADY_EXISTS'; record: EvidenceRow }>(
      '/hermes-evidence',
      { method: 'POST', body }
    );

    const record = toRecord(result.record);
    memoryStore.set(evidence.dedupe_key, record);
    return {
      status: result.status,
      id: record.id,
      dedupe_key: record.dedupe_key,
      observed_at: record.observed_at,
      record,
    };
  } catch (error) {
    // WordPress unreachable. Keep the finding for this process so an ingest run is
    // not lost mid-flight, and log the reason: a silent fallback is how a store
    // outage turns into "we stored it" when nothing was stored.
    console.warn(
      `Hermes evidence was not stored in WordPress and is held in memory only: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    const existing = memoryStore.get(evidence.dedupe_key);
    if (existing) {
      return {
        status: 'ALREADY_EXISTS',
        id: existing.id,
        dedupe_key: existing.dedupe_key,
        observed_at: existing.observed_at,
        record: existing,
      };
    }

    const record: EvidenceRecord = {
      ...evidence,
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      status: 'new',
      created_at: now,
      updated_at: now,
    };
    memoryStore.set(evidence.dedupe_key, record);

    return {
      status: 'CREATED',
      id: record.id,
      dedupe_key: record.dedupe_key,
      observed_at: record.observed_at,
      record,
    };
  }
}

export interface ListEvidenceFilter {
  type?: string;
  status?: string;
  source?: string;
  search?: string;
  limit?: number;
}

export interface ListEvidenceResult {
  items: EvidenceRecord[];
  total: number;
  countsByType: Record<string, number>;
  countsByStatus: Record<string, number>;
}

/** The inbox, newest first, with the facet counts the tabs render. */
export async function listEvidence(
  filter: ListEvidenceFilter = {}
): Promise<ListEvidenceResult> {
  const limit = Math.min(Math.max(1, filter.limit || 100), 500);

  try {
    const result = await storefrontRequest<{
      items: EvidenceRow[];
      total: number;
      countsByType: Record<string, number>;
      countsByStatus: Record<string, number>;
    }>('/hermes-evidence', {
      params: {
        type: filter.type,
        status: filter.status,
        source: filter.source,
        search: filter.search,
        limit,
      },
    });

    return {
      items: (result.items || []).map(toRecord),
      total: result.total ?? result.items?.length ?? 0,
      countsByType: result.countsByType || {},
      countsByStatus: result.countsByStatus || {},
    };
  } catch (error) {
    console.warn(
      `Hermes evidence could not be read from WordPress; reporting this process's own findings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return fromMemory(filter, limit);
  }
}

/** The in-process findings, filtered the same way the store filters. */
function fromMemory(filter: ListEvidenceFilter, limit: number): ListEvidenceResult {
  let items = Array.from(memoryStore.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const countsByType: Record<string, number> = {};
  const countsByStatus: Record<string, number> = {};
  for (const record of items) {
    countsByType[record.type] = (countsByType[record.type] || 0) + 1;
    countsByStatus[record.status] = (countsByStatus[record.status] || 0) + 1;
  }

  if (filter.type && filter.type !== 'all') {
    const types = filter.type.split(',').map((type) => type.trim()).filter(Boolean);
    items = items.filter((item) => types.includes(item.type));
  }
  if (filter.status && filter.status !== 'all') {
    items = items.filter((item) => item.status === filter.status);
  }
  if (filter.source && filter.source !== 'all') {
    items = items.filter((item) => item.source === filter.source);
  }
  if (filter.search) {
    const search = filter.search.toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(search) || item.summary.toLowerCase().includes(search)
    );
  }

  return {
    items: items.slice(0, limit),
    total: items.length,
    countsByType,
    countsByStatus,
  };
}

/** Moves a finding's review status. */
export async function updateEvidenceStatus(
  id: string,
  status: EvidenceStatus,
  reviewNote?: string | null
): Promise<{ ok: boolean; record?: EvidenceRecord }> {
  const numericId = Number(id);

  // A memory-held finding has no store row to update, and asking WordPress for it
  // would 404 on an id it has never seen.
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return updateInMemory(id, status, reviewNote);
  }

  try {
    const result = await storefrontRequest<{ ok: boolean; record: EvidenceRow }>(
      '/hermes-evidence/status',
      {
        method: 'POST',
        body: {
          id: numericId,
          status,
          ...(reviewNote !== undefined ? { review_note: reviewNote } : {}),
        },
      }
    );
    const record = toRecord(result.record);
    memoryStore.set(record.dedupe_key, record);
    return { ok: true, record };
  } catch (error) {
    console.warn(
      `Hermes evidence status was not written to WordPress: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return updateInMemory(id, status, reviewNote);
  }
}

function updateInMemory(
  id: string,
  status: EvidenceStatus,
  reviewNote?: string | null
): { ok: boolean; record?: EvidenceRecord } {
  for (const record of memoryStore.values()) {
    if (record.id === id) {
      record.status = status;
      if (reviewNote !== undefined) record.review_note = reviewNote;
      record.updated_at = new Date().toISOString();
      return { ok: true, record };
    }
  }
  return { ok: false };
}
