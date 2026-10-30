-- =============================================
-- Migration 040: Media Videos CMS Table
-- =============================================

CREATE TABLE IF NOT EXISTS public.media_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  youtube_video_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  seo_title TEXT,
  meta_description TEXT,
  thumbnail_url TEXT,
  custom_thumbnail_url TEXT,
  category TEXT DEFAULT 'general',
  is_short BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  duration TEXT,
  transcript TEXT,
  chapters JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  related_product_ids TEXT[] DEFAULT '{}',
  related_article_slugs TEXT[] DEFAULT '{}',
  related_video_slugs TEXT[] DEFAULT '{}',
  faq JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_videos_status_idx ON public.media_videos(status);
CREATE INDEX IF NOT EXISTS media_videos_category_idx ON public.media_videos(category);
CREATE INDEX IF NOT EXISTS media_videos_published_at_idx ON public.media_videos(published_at DESC);
CREATE INDEX IF NOT EXISTS media_videos_slug_idx ON public.media_videos(slug);

ALTER TABLE public.media_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published media" ON public.media_videos;
CREATE POLICY "Public can view published media"
  ON public.media_videos
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "Admin full access to media_videos" ON public.media_videos;
CREATE POLICY "Admin full access to media_videos"
  ON public.media_videos
  FOR ALL
  TO authenticated
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

DROP POLICY IF EXISTS "Service role full access on media_videos" ON public.media_videos;
CREATE POLICY "Service role full access on media_videos"
  ON public.media_videos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
