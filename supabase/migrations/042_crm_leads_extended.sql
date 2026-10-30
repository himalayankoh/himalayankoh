-- =============================================
-- Migration 042: CRM Leads Extended Columns & Relaxed Constraints
-- =============================================

-- Allow leads without names (e.g. welcome coupon popups, email subscriptions)
ALTER TABLE public.crm_leads ALTER COLUMN name DROP NOT NULL;

-- Drop restrictive source check constraint so all lead sources are valid
ALTER TABLE public.crm_leads DROP CONSTRAINT IF EXISTS crm_leads_source_check;

-- Add lead attribution, coupon tracking and metadata columns
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS page_url TEXT;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS coupon_used BOOLEAN DEFAULT false;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS coupon_used_at TIMESTAMPTZ;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS opted_in BOOLEAN DEFAULT true;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Public can submit leads
DROP POLICY IF EXISTS "Public can submit leads" ON public.crm_leads;
CREATE POLICY "Public can submit leads"
  ON public.crm_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
