-- =============================================
-- Migration 041: Product Scout & Supplier Tables
-- =============================================

CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_configured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_slug_idx ON public.suppliers(slug);

CREATE TABLE IF NOT EXISTS public.supplier_products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  title TEXT NOT NULL,
  url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_products_supplier_id_idx ON public.supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_products_url_idx ON public.supplier_products(url);

CREATE TABLE IF NOT EXISTS public.product_candidates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_product_id TEXT,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  evidence JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'researching',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_candidates_status_idx ON public.product_candidates(status);
CREATE INDEX IF NOT EXISTS product_candidates_source_url_idx ON public.product_candidates(source_url);
CREATE INDEX IF NOT EXISTS product_candidates_created_at_idx ON public.product_candidates(created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_scores (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_id TEXT REFERENCES public.product_candidates(id) ON DELETE CASCADE,
  overall NUMERIC NOT NULL,
  explanation TEXT,
  weights JSONB DEFAULT '{}'::jsonb,
  breakdown JSONB DEFAULT '{}'::jsonb,
  scored_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_scores_candidate_id_idx ON public.product_scores(candidate_id);

CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input JSONB,
  output JSONB,
  error TEXT,
  provider TEXT,
  model TEXT,
  token_cost JSONB,
  retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_jobs_status_idx ON public.agent_jobs(status);
CREATE INDEX IF NOT EXISTS agent_jobs_created_at_idx ON public.agent_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admin full access to suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  )
  WITH CHECK (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );

CREATE POLICY "Admin full access to supplier_products" ON public.supplier_products FOR ALL TO authenticated
  USING (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  )
  WITH CHECK (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );

CREATE POLICY "Admin full access to product_candidates" ON public.product_candidates FOR ALL TO authenticated
  USING (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  )
  WITH CHECK (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );

CREATE POLICY "Admin full access to product_scores" ON public.product_scores FOR ALL TO authenticated
  USING (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  )
  WITH CHECK (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );

CREATE POLICY "Admin full access to agent_jobs" ON public.agent_jobs FOR ALL TO authenticated
  USING (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  )
  WITH CHECK (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );

-- Service role full access
CREATE POLICY "Service role full access on suppliers" ON public.suppliers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on supplier_products" ON public.supplier_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on product_candidates" ON public.product_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on product_scores" ON public.product_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on agent_jobs" ON public.agent_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
