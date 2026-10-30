import { lazy, Suspense, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { Product } from '../../data/products';
import { loadPublishedMedia } from '../../services/media';
import type { MediaVideo } from '../../services/media';

// The same click-to-load YouTube embed MediaHub uses (youtube-nocookie.com, no
// autoplay, responsive 16:9), imported **from MediaHub itself** — but lazily.
//
// It used to be a plain import, which put the whole media hub module on every
// product page: MediaHub is a hub for a media library the visitor has not asked
// for, and it reaches for the Phosphor icon set, which this storefront otherwise
// does not ship at all (it uses lucide). That is how a product page ended up
// downloading `MediaHub`, `Play.es` and `IconBase.es` — measured 2026-09-30.
// The section renders nothing at all when the product has no videos, so the
// deferral costs a fetch only in the case where a video is actually shown.
const YouTubeEmbed = lazy(() =>
  import('../../media/MediaHub').then((module) => ({ default: module.YouTubeEmbed }))
);

interface Props {
  product: Product;
}

/**
 * Product Video Section
 *
 * Displays YouTube videos from the Media Hub that are linked to this product
 * via `related_product_ids`. Uses the same click-to-load YouTubeEmbed
 * (youtube-nocookie.com, no autoplay, responsive 16:9) already used on /media.
 *
 * If no videos are linked, the section is hidden entirely — no broken state.
 */
export default function ProductVideoSection({ product }: Props) {
  const [videos, setVideos] = useState<MediaVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadVideos = async () => {
      try {
        const all = await loadPublishedMedia();
        if (cancelled || !all) return;

        // Match videos whose relatedProductIds includes this product's id
        const productId = String(product.id);
        const matched = all.filter(
          (v) =>
            v.relatedProductIds.some((pid) => String(pid) === productId) &&
            v.youtubeVideoId,
        );

        setVideos(matched);
      } catch {
        // Fail silently — section just won't render
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadVideos();
    return () => { cancelled = true; };
  }, [product.id]);

  // Don't render anything when loading, empty, or no linked videos
  if (loading || videos.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="bg-white rounded-2xl shadow-md shadow-black/5 p-6 md:p-8">
        <div className="flex items-center gap-2 mb-5">
          <Play size={20} className="text-himalayan" />
          <h2 className="font-serif text-xl font-bold text-charcoal">
            {videos.length === 1 ? 'Product Video' : 'Product Videos'}
          </h2>
        </div>

        <div className="space-y-6">
          {videos.map((video) => (
            <div key={video.id}>
              {videos.length > 1 && (
                <h3 className="text-sm font-medium text-charcoal mb-2">
                  {video.title}
                </h3>
              )}
              <Suspense fallback={<div className="aspect-video w-full rounded-xl bg-gray-100" />}>
                <YouTubeEmbed
                  videoId={video.youtubeVideoId!}
                  title={video.title}
                />
              </Suspense>
              {video.summary && (
                <p className="mt-2 text-sm text-charcoal-light">
                  {video.summary}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
