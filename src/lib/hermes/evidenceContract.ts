import type {
  EvidencePriority,
  EvidenceSource,
  EvidenceType,
  NormalizedEvidence,
  EvidenceItem,
  EvidenceEntity,
} from './types';

const VALID_SOURCES = new Set<string>(['hermes', 'salman-os', 'n8n']);

const VALID_TYPES = new Set<string>([
  'product',
  'seo',
  'free_marketing',
  'free_listing',
  'market',
  'marketing',
  'ads',
  'catalog_qa',
  'competitor',
  'blog_topic',
  'content_gap',
  'pricing_observation',
]);

const VALID_PRIORITIES = new Set<string>(['low', 'medium', 'high', 'critical']);

export interface ValidationResult {
  ok: boolean;
  data?: NormalizedEvidence;
  errors: string[];
}

export function validateEvidencePayload(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Payload must be a JSON object'] };
  }

  const b = raw as Record<string, unknown>;

  // Source
  const sourceStr = typeof b.source === 'string' ? b.source.trim().toLowerCase() : '';
  if (!VALID_SOURCES.has(sourceStr)) {
    errors.push(`Invalid source '${String(b.source)}'. Allowed: hermes, salman-os, n8n`);
  }

  // Type
  const typeStr = typeof b.type === 'string' ? b.type.trim().toLowerCase() : '';
  if (!VALID_TYPES.has(typeStr)) {
    errors.push(
      `Invalid type '${String(b.type)}'. Allowed: product, seo, free_marketing, free_listing, market, marketing, ads, catalog_qa, competitor, blog_topic, content_gap, pricing_observation`
    );
  }

  // Title
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) {
    errors.push('title is required and cannot be empty');
  } else if (title.length > 300) {
    errors.push('title exceeds maximum length of 300 characters');
  }

  // Summary
  const summary = typeof b.summary === 'string' ? b.summary.trim() : '';
  if (!summary) {
    errors.push('summary is required and cannot be empty');
  } else if (summary.length > 5000) {
    errors.push('summary exceeds maximum length of 5000 characters');
  }

  // Dedupe key
  const dedupeKey = typeof b.dedupe_key === 'string' ? b.dedupe_key.trim() : '';
  if (!dedupeKey) {
    errors.push('dedupe_key is required and must be a non-empty stable string');
  } else if (dedupeKey.length > 255) {
    errors.push('dedupe_key exceeds maximum length of 255 characters');
  }

  // Confidence
  let confidence = Number(b.confidence);
  if (b.confidence === undefined || b.confidence === null || isNaN(confidence)) {
    errors.push('confidence is required and must be a number between 0 and 100');
  } else if (confidence < 0 || confidence > 100) {
    errors.push('confidence must be between 0 and 100');
  }

  // Priority
  const priorityStr = typeof b.priority === 'string' ? b.priority.trim().toLowerCase() : '';
  if (!VALID_PRIORITIES.has(priorityStr)) {
    errors.push(`Invalid priority '${String(b.priority)}'. Allowed: low, medium, high, critical`);
  }

  // Observed at (ISO timestamp)
  const observedAtStr = typeof b.observed_at === 'string' ? b.observed_at.trim() : '';
  if (!observedAtStr) {
    errors.push('observed_at is required as an ISO timestamp string');
  } else {
    const timestamp = Date.parse(observedAtStr);
    if (isNaN(timestamp)) {
      errors.push('observed_at must be a valid ISO timestamp');
    }
  }

  // Entity (optional)
  let entity: EvidenceEntity | undefined;
  if (b.entity !== undefined && b.entity !== null) {
    if (typeof b.entity !== 'object' || Array.isArray(b.entity)) {
      errors.push('entity must be an object if provided');
    } else {
      const ent = b.entity as Record<string, unknown>;
      entity = {
        sku: typeof ent.sku === 'string' ? ent.sku.trim().slice(0, 100) : undefined,
        woo_id: typeof ent.woo_id === 'number' || typeof ent.woo_id === 'string' ? ent.woo_id : undefined,
        slug: typeof ent.slug === 'string' ? ent.slug.trim().slice(0, 200) : undefined,
        category_slug: typeof ent.category_slug === 'string' ? ent.category_slug.trim().slice(0, 100) : undefined,
      };
    }
  }

  // Evidence items (optional array)
  let evidence: EvidenceItem[] | undefined;
  if (b.evidence !== undefined && b.evidence !== null) {
    if (!Array.isArray(b.evidence)) {
      errors.push('evidence must be an array of items if provided');
    } else if (b.evidence.length > 50) {
      errors.push('evidence array exceeds maximum limit of 50 items');
    } else {
      evidence = [];
      for (let i = 0; i < b.evidence.length; i++) {
        const item = b.evidence[i];
        if (!item || typeof item !== 'object') continue;
        const it = item as Record<string, unknown>;
        let url: string | undefined;
        if (typeof it.url === 'string' && it.url.trim()) {
          try {
            const parsedUrl = new URL(it.url.trim());
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
              url = parsedUrl.toString().slice(0, 1000);
            }
          } catch {
            // invalid URL ignored or kept null
          }
        }
        evidence.push({
          url,
          label: typeof it.label === 'string' ? it.label.trim().slice(0, 200) : undefined,
          observation: typeof it.observation === 'string' ? it.observation.trim().slice(0, 2000) : undefined,
        });
      }
    }
  }

  // Recommended Action (optional)
  const recommendedAction =
    typeof b.recommended_action === 'string' ? b.recommended_action.trim().slice(0, 2000) : undefined;

  // Metadata (optional)
  let metadata: Record<string, unknown> | undefined;
  if (b.metadata !== undefined && b.metadata !== null) {
    if (typeof b.metadata !== 'object' || Array.isArray(b.metadata)) {
      errors.push('metadata must be an object if provided');
    } else {
      const serialized = JSON.stringify(b.metadata);
      if (serialized.length > 50_000) {
        errors.push('metadata object exceeds 50KB size limit');
      } else {
        metadata = b.metadata as Record<string, unknown>;
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      source: sourceStr as EvidenceSource,
      type: typeStr as EvidenceType,
      entity,
      title,
      summary,
      evidence,
      confidence,
      priority: priorityStr as EvidencePriority,
      recommended_action: recommendedAction,
      observed_at: observedAtStr,
      dedupe_key: dedupeKey,
      metadata: metadata || {},
    },
    errors: [],
  };
}
