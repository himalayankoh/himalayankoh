/**
 * Normalized Research Evidence Contract for Himalayan Koh.
 * Accepts research evidence ONLY — never mutates WooCommerce, production, or settings.
 */

export type EvidenceSource = 'hermes' | 'salman-os' | 'n8n';

export type EvidenceType =
  | 'product'
  | 'seo'
  | 'free_marketing'
  | 'free_listing'
  | 'market'
  | 'marketing'
  | 'ads'
  | 'catalog_qa'
  | 'competitor'
  | 'blog_topic'
  | 'content_gap'
  | 'pricing_observation';

export type EvidencePriority = 'low' | 'medium' | 'high' | 'critical';

export type EvidenceStatus = 'new' | 'reviewed' | 'accepted' | 'dismissed';

export interface EvidenceEntity {
  sku?: string;
  woo_id?: number | string;
  slug?: string;
  category_slug?: string;
}

export interface EvidenceItem {
  url?: string;
  label?: string;
  observation?: string;
}

export interface NormalizedEvidence {
  source: EvidenceSource;
  type: EvidenceType;
  entity?: EvidenceEntity;
  title: string;
  summary: string;
  evidence?: EvidenceItem[];
  confidence: number; // 0 - 100
  priority: EvidencePriority;
  recommended_action?: string;
  observed_at: string; // ISO timestamp
  dedupe_key: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceRecord extends NormalizedEvidence {
  id: string;
  status: EvidenceStatus;
  review_note?: string | null;
  created_at: string;
  updated_at: string;
}
