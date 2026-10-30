-- =============================================
-- Migration 043: Site Events Analytics Table (migration 0023)
-- =============================================

CREATE TABLE IF NOT EXISTS public.site_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  visitor_id TEXT,
  session_id TEXT,
  device TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  item_ids JSONB,
  value NUMERIC,
  currency TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_events_occurred_at_idx ON public.site_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS site_events_event_idx ON public.site_events(event);
CREATE INDEX IF NOT EXISTS site_events_visitor_idx ON public.site_events(visitor_id);

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors can insert analytics events
DROP POLICY IF EXISTS "Public can insert site_events" ON public.site_events;
CREATE POLICY "Public can insert site_events"
  ON public.site_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Authenticated admins can view site_events
DROP POLICY IF EXISTS "Admins can view site_events" ON public.site_events;
CREATE POLICY "Admins can view site_events"
  ON public.site_events
  FOR SELECT
  TO authenticated
  USING (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'email') IN ('8002salman@gmail.com', 'basco.pk@gmail.com')
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on site_events" ON public.site_events;
CREATE POLICY "Service role full access on site_events"
  ON public.site_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
