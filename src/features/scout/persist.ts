// ============================================================================
// HIMALAYAN KOH — SCOUT PERSISTENCE (Phase 4A)
//
// Writes scout records to the HK WordPress admin-record store through the db
// adapter, using the ADMIN's own session (set via setAccessToken). The plugin
// allowlists every record name used here and refuses anon/customer writes, so
// persisting never bypasses authorization.
//
// Products are the exception: they have a WooCommerce owner, so a scout-created
// draft is created in the store itself (see createProductDraft below).
//
// Honesty: evidence stores VERIFIED/INFERRED/UNKNOWN statuses; nothing is
// fabricated. The product draft is created with status 'draft' only — publishing
// requires explicit owner approval later.
// ============================================================================

import type { DbAdapter } from '../../services/db';
import type { ScoutCandidate, ScoutSupplier, ScoreBreakdown, CandidateEvidence } from './types';
import { canonicalDomain } from './normalize';
// Products belong to WooCommerce, not to the console's record store, so the
// draft/publish paths below go through the store repository (which owns all Woo
// field mapping).
import { createProduct, getProduct, listCategories, listProducts, saveProductImages, setProductStatus } from '../catalog/repository';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface SupplierRow {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  api_configured: boolean;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Find a supplier by canonical domain, then slug, then name — else create it. */
export async function ensureSupplier(db: DbAdapter, s: { name: string; slug: string; baseUrl: string }): Promise<ScoutSupplier> {
  // 1) Canonical-domain match (preferred): www.kongcompany.com and
  //    kongcompany.com are the SAME supplier — never split them.
  const wantDomain = canonicalDomain(s.baseUrl);
  if (wantDomain) {
    const byDomain = await db.findFirst<SupplierRow>('suppliers', 'base_url', s.baseUrl);
    if (!byDomain) {
      // base_url may store the www form or not; match on the canonical domain.
      const all = await db.list<SupplierRow>('suppliers');
      const hit = (Array.isArray(all) ? all : []).find((r) => canonicalDomain(r.base_url || '') === wantDomain);
      if (hit) return { id: hit.id, name: hit.name, slug: hit.slug, baseUrl: hit.base_url };
    } else {
      return { id: byDomain.id, name: byDomain.name, slug: byDomain.slug, baseUrl: byDomain.base_url };
    }
  }
  // 2) Slug match (legacy behavior)
  const existing = await db.findFirst<SupplierRow>('suppliers', 'slug', s.slug);
  if (existing) {
    return { id: existing.id, name: existing.name, slug: existing.slug, baseUrl: existing.base_url };
  }
  // 3) Name match (case-insensitive) — same real supplier under a different slug
  const all = await db.list<SupplierRow>('suppliers');
  const byName = (Array.isArray(all) ? all : []).find(
    (r) => r.name.trim().toLowerCase() === s.name.trim().toLowerCase()
  );
  if (byName) return { id: byName.id, name: byName.name, slug: byName.slug, baseUrl: byName.base_url };

  const t = now();
  const row: SupplierRow = {
    id: newId(),
    name: s.name,
    slug: s.slug,
    base_url: s.baseUrl,
    api_configured: false,
    is_active: true,
    notes: 'Registered by Product Scout (Phase 4A)',
    created_at: t,
    updated_at: t,
  };
  const inserted = await db.insert<SupplierRow>('suppliers', row);
  return { id: inserted.id, name: inserted.name, slug: inserted.slug, baseUrl: inserted.base_url };
}

// ---------------------------------------------------------------------------
// Supplier products + evidence
// ---------------------------------------------------------------------------

export interface SupplierProductRow {
  id: string;
  supplier_id: string;
  supplier_sku: string | null;
  title: string;
  url: string | null;
  images: string[];
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Persist a supplier product with its raw evidence. */
export async function persistSupplierProduct(
  db: DbAdapter,
  input: { supplierId: string; title: string; url: string; images: string[]; raw: Record<string, unknown> }
): Promise<{ id: string; existing: boolean }> {
  const existing = await db.findFirst<SupplierProductRow>('supplier_products', 'url', input.url);
  if (existing) return { id: existing.id, existing: true };
  const t = now();
  const row: SupplierProductRow = {
    id: newId(),
    supplier_id: input.supplierId,
    supplier_sku: null,
    title: input.title,
    url: input.url,
    images: input.images,
    raw_data: input.raw,
    created_at: t,
    updated_at: t,
  };
  const inserted = await db.insert<SupplierProductRow>('supplier_products', row);
  return { id: inserted.id, existing: false };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export interface CandidateRow {
  id: string;
  supplier_product_id: string | null;
  title: string;
  source: string;
  source_url: string;
  images: string[];
  evidence: CandidateEvidence;
  status: ScoutCandidate['status'];
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Persist a candidate; skips when the source_url already exists (dedupe). */
export async function persistCandidate(
  db: DbAdapter,
  input: {
    supplierProductId: string | null;
    title: string;
    source: string;
    sourceUrl: string;
    images: string[];
    evidence: CandidateEvidence;
    status: ScoutCandidate['status'];
    rejectionReason?: string;
  }
): Promise<{ id: string; existing: boolean }> {
  const existing = await db.findFirst<CandidateRow>('product_candidates', 'source_url', input.sourceUrl);
  if (existing) return { id: existing.id, existing: true };
  const t = now();
  const row: CandidateRow = {
    id: newId(),
    supplier_product_id: input.supplierProductId,
    title: input.title,
    source: input.source,
    source_url: input.sourceUrl,
    images: input.images,
    evidence: input.evidence,
    status: input.status,
    rejection_reason: input.rejectionReason ?? null,
    created_at: t,
    updated_at: t,
  };
  const inserted = await db.insert<CandidateRow>('product_candidates', row);
  return { id: inserted.id, existing: false };
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export interface ScoreRow {
  id: string;
  candidate_id: string;
  overall: number;
  explanation: string;
  weights: Record<string, number>;
  breakdown: Record<string, { points: number; max: number; note: string }>;
  scored_at: string;
}

/** Persist a candidate score (one per candidate; latest wins). */
export async function persistScore(db: DbAdapter, candidateId: string, score: ScoreBreakdown): Promise<void> {
  const existing = await db.findFirst<ScoreRow>('product_scores', 'candidate_id', candidateId);
  const row: ScoreRow = {
    id: existing?.id ?? newId(),
    candidate_id: candidateId,
    overall: score.overall,
    explanation: score.explanation,
    weights: score.weights,
    breakdown: score.breakdown,
    scored_at: now(),
  };
  if (existing) {
    await db.update<ScoreRow>('product_scores', existing.id, row);
  } else {
    await db.insert<ScoreRow>('product_scores', row);
  }
}

// ---------------------------------------------------------------------------
// Agent jobs / runs / logs
// ---------------------------------------------------------------------------

export interface AgentJobRow {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: unknown;
  output: unknown;
  error: string | null;
  provider: string | null;
  model: string | null;
  token_cost: Record<string, unknown> | null;
  retries: number;
  max_retries: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export async function createJob(db: DbAdapter, type: string, input: unknown): Promise<string> {
  const row: AgentJobRow = {
    id: newId(),
    type,
    status: 'running',
    input,
    output: null,
    error: null,
    provider: null,
    model: null,
    token_cost: null,
    retries: 0,
    max_retries: 3,
    created_at: now(),
    started_at: now(),
    finished_at: null,
  };
  const inserted = await db.insert<AgentJobRow>('agent_jobs', row);
  return inserted.id;
}

export async function completeJob(
  db: DbAdapter,
  jobId: string,
  status: 'completed' | 'failed',
  output: unknown,
  error?: string,
  meta?: { provider?: string | null; model?: string | null }
): Promise<void> {
  await db.update<AgentJobRow>('agent_jobs', jobId, {
    status,
    output,
    error: error ?? null,
    finished_at: now(),
    ...(meta ? { provider: meta.provider ?? null, model: meta.model ?? null } : {}),
  } as Partial<AgentJobRow>);
}

export async function addRun(
  db: DbAdapter,
  jobId: string,
  agent: string,
  status: string,
  summary: string
): Promise<void> {
  await db.insert('agent_runs', {
    id: newId(),
    job_id: jobId,
    agent,
    status,
    summary,
    created_at: now(),
    finished_at: status === 'running' ? null : now(),
  });
}

export async function addLog(db: DbAdapter, jobId: string, level: 'info' | 'warn' | 'error', message: string): Promise<void> {
  await db.insert('agent_logs', {
    id: newId(),
    job_id: jobId,
    level,
    message,
    created_at: now(),
  });
}

// ---------------------------------------------------------------------------
// Hermes fallback queue — resilience (no single API outage kills the pipeline)
// ---------------------------------------------------------------------------

/**
 * Which stage of the supplier pipeline needs Hermes browser/computer-use.
 * Mirrors the engine fallback architecture: search → page-read → ai-analysis.
 */
export type HermesQueueStage = 'search' | 'page-read' | 'ai-analysis';

/**
 * Queue a job for Hermes (browser/computer-use) when every automated path
 * failed. Reuses the existing agent_jobs table with type PRODUCT_RESEARCH and
 * provider='hermes' + an explicit input marker, so NO schema migration is
 * needed and the audit trail stays uniform. The pipeline continues — a queued
 * item never blocks or fails the rest of the run.
 */
export async function queueHermesFallback(
  db: DbAdapter,
  stage: HermesQueueStage,
  payload: Record<string, unknown>
): Promise<string | null> {
  try {
    const row: AgentJobRow = {
      id: newId(),
      type: 'PRODUCT_RESEARCH',
      status: 'queued',
      input: { hermesQueue: true, stage, queuedAt: now(), ...payload },
      output: null,
      error: null,
      provider: 'hermes',
      model: null,
      token_cost: null,
      retries: 0,
      max_retries: 3,
      created_at: now(),
      started_at: null,
      finished_at: null,
    };
    const inserted = await db.insert<AgentJobRow>('agent_jobs', row);
    return inserted.id;
  } catch {
    // Queue write failure must never take the pipeline down — the run
    // continues with the warning already surfaced by the caller.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Product draft (owner-approval gate → status 'draft', never published)
// ---------------------------------------------------------------------------

export interface ProductDraftInput {
  title: string;
  slug: string;
  categoryId: string | null;
  price: number | null;
  compareAtPrice: number | null;
  costPrice: number | null;
  landedCost: number | null;
  images: string[];
  shortDesc: string;
  sourceUrl: string;
  supplierName: string;
}

/**
 * Create the candidate's product as a WooCommerce DRAFT.
 *
 * The console's record store deliberately refuses `products`/`product_images`
 * (see services/db.ts) — the store owns them — so a scout draft is created in
 * WooCommerce itself. The supplier and source URL ride in the description, which
 * is where a draft's provenance survives a Woo round trip. Never publishes: the
 * owner-approval gate is the store status `draft`.
 */
export async function createProductDraft(input: ProductDraftInput): Promise<{ id: string; existing: boolean }> {
  const existing = (await listProducts()).find((p) => p.slug === input.slug);
  if (existing) return { id: existing.id, existing: true };

  const created = await createProduct({
    name: input.title,
    canonicalSlug: input.slug,
    status: 'draft',
    description: `${input.shortDesc || input.title} — ${input.supplierName}. Source: ${input.sourceUrl}`,
    shortDescription: input.shortDesc || input.title,
    categoryId: input.categoryId,
    price: input.price ?? undefined,
    compareAtPrice: input.compareAtPrice ?? undefined,
    costPrice: input.costPrice ?? undefined,
    landedCost: input.landedCost ?? undefined,
    inventoryQty: 0,
  });

  const images = input.images.filter(Boolean);
  if (images.length > 0) {
    // The supplier gallery is attached to the store product. WooCommerce rejects
    // a whole image save when one URL is unacceptable and a supplier CDN URL can
    // rot between research and drafting, so a gallery failure must not discard a
    // draft that is already real — the editor can attach images afterwards.
    try {
      await saveProductImages(
        created.id,
        images.map((url, i) => ({ url, altText: input.title, isPrimary: i === 0, sortOrder: i })),
        { reload: false },
      );
    } catch {
      /* draft kept; images can be attached in the product editor */
    }
  }
  return { id: created.id, existing: false };
}

// ---------------------------------------------------------------------------
// Product publish (scout → live storefront)
// ---------------------------------------------------------------------------

export interface PublishDraftInput {
  productId: string;
  candidateId: string | null;
  candidateTitle: string;
  scoreOverall: number | null;
  /** 'owner' = explicit click (any mode); 'auto' = AUTO-mode policy gates passed. */
  channel: 'owner' | 'auto';
}

/**
 * Publish a scout-created product draft to the live storefront by setting the
 * store's own status to `active`. Requires an existing draft (caller ensures
 * it). Idempotent: an already-active product stays live without a second audit
 * job. Always writes a PRODUCT_PUBLISH audit row (best-effort — never blocks
 * publishing).
 */
export async function publishProductDraft(
  db: DbAdapter,
  input: PublishDraftInput
): Promise<{ published: boolean; reason: 'live' | 'already-live' | 'missing' }> {
  const existing = await getProduct(input.productId);
  if (!existing) return { published: false, reason: 'missing' };
  if (existing.status === 'active') return { published: true, reason: 'already-live' };

  const t = new Date().toISOString();
  // The store's own status is the publish: the candidate's product was created
  // as a draft and this is the owner's explicit approval.
  await setProductStatus(input.productId, 'active');

  try {
    const jobId = await createJob(db, 'PRODUCT_PUBLISH', { productId: input.productId, candidateId: input.candidateId, title: input.candidateTitle, channel: input.channel });
    await completeJob(db, jobId, 'completed', { productId: input.productId, publishedAt: t });
  } catch {
    /* audit is best-effort — a failed audit write never blocks publishing */
  }
  return { published: true, reason: 'live' };
}

/** Resolve a store category by exact name; null when it does not exist. */
export async function findCategoryId(name: string): Promise<string | null> {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  const categories = await listCategories();
  const hit = categories.find((c) => c.name.trim().toLowerCase() === target);
  return hit ? hit.id : null;
}

// ---------------------------------------------------------------------------
// Phase 4B — market intelligence persistence
// ---------------------------------------------------------------------------

/** Read the evidence jsonb of a candidate row (defensive about legacy shapes). */
export async function readCandidateEvidence(db: DbAdapter, id: string): Promise<Record<string, unknown> | null> {
  const row = await db.findFirst<{ id: string; evidence: Record<string, unknown> | null }>('product_candidates', 'id', id);
  if (!row) return null;
  return row.evidence && typeof row.evidence === 'object' ? row.evidence : {};
}

/** Merge market-intelligence fields into a candidate's evidence jsonb. */
export async function persistMarketIntelligence(
  db: DbAdapter,
  candidateId: string,
  analysis: { marketOpportunityScore: number; aiUsed: boolean; reasoningSummary: string; unsupportedClaims: string[] }
): Promise<void> {
  const current = (await readCandidateEvidence(db, candidateId)) || {};
  await db.update<{ id: string; evidence: Record<string, unknown> }>('product_candidates', candidateId, {
    evidence: {
      ...current,
      market: {
        marketOpportunityScore: analysis.marketOpportunityScore,
        aiUsed: analysis.aiUsed,
        reasoningSummary: analysis.reasoningSummary.slice(0, 400),
        unsupportedClaims: analysis.unsupportedClaims,
        analyzedAt: new Date().toISOString(),
      },
    },
  });
}
