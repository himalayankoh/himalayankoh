-- Migration 036: Dedicated Research Evidence Store for Hermes / Salman OS / n8n
-- Purely research evidence — never directly mutates WooCommerce or production.

CREATE TABLE IF NOT EXISTS public.hermes_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('hermes', 'salman-os', 'n8n')),
  type TEXT NOT NULL CHECK (type IN (
    'product', 'seo', 'free_marketing', 'free_listing',
    'market', 'marketing', 'ads', 'catalog_qa',
    'competitor', 'blog_topic', 'content_gap', 'pricing_observation'
  )),
  entity JSONB DEFAULT '{}'::jsonb,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 100),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  recommended_action TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  dedupe_key TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hermes_evidence_dedupe_key_idx ON public.hermes_evidence (dedupe_key);
CREATE INDEX IF NOT EXISTS hermes_evidence_type_idx ON public.hermes_evidence (type);
CREATE INDEX IF NOT EXISTS hermes_evidence_status_idx ON public.hermes_evidence (status);
CREATE INDEX IF NOT EXISTS hermes_evidence_created_at_idx ON public.hermes_evidence (created_at DESC);

ALTER TABLE public.hermes_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on hermes_evidence" ON public.hermes_evidence;
CREATE POLICY "Service role full access on hermes_evidence"
  ON public.hermes_evidence
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view hermes_evidence" ON public.hermes_evidence;
CREATE POLICY "Admins can view hermes_evidence"
  ON public.hermes_evidence
  FOR SELECT
  TO authenticated
  USING (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );

DROP POLICY IF EXISTS "Admins can update status on hermes_evidence" ON public.hermes_evidence;
CREATE POLICY "Admins can update status on hermes_evidence"
  ON public.hermes_evidence
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );
