import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { CategoryContentBundle } from '../../lib/categoryContent';
import type { ContentGalleryImage } from '../../lib/content/types';
import { enrichArticleList, getCategoryAvailability } from '../../lib/categoryContent';
import CategoryHubGallery from './CategoryHubGallery';
import type { CategoryArticleSource } from '../../hooks/useCategoryBlogArticles';
import type { CategoryArticleCard } from '../../lib/categoryContent';
import CategoryArticlesSection from './CategoryArticlesSection';
import CategoryPdfResources from './CategoryPdfResources';
import CategoryTrustStrip from './CategoryTrustStrip';
import PdpEmptyState from '../product/PdpEmptyState';

interface Props {
  content: CategoryContentBundle;
  /**
   * The gallery built from the shelf's products. When it is missing or empty the
   * registry's own photographs stand in, so a hub whose products carry no usable
   * photo still shows something rather than an empty state.
   */
  galleryImages?: ContentGalleryImage[];
  articles?: CategoryArticleCard[];
  articlesLoading?: boolean;
  articlesSource?: CategoryArticleSource;
}

export default function CategoryEducationPanel({
  content,
  galleryImages,
  articles,
  articlesLoading,
  articlesSource,
}: Props) {
  const resolvedArticles = useMemo(
    () => enrichArticleList(articles ?? content.articles),
    [articles, content.articles]
  );

  const gallery = galleryImages && galleryImages.length > 0 ? galleryImages : content.gallery;

  const availability = getCategoryAvailability({
    ...content,
    gallery,
    articles: resolvedArticles,
  });

  return (
    <aside
      key={content.key}
      className="rounded-2xl border border-gray-200/80 bg-white/90 shadow-sm p-4 sm:p-5 space-y-6 lg:sticky lg:top-[var(--header-height)]"
      aria-label={`${content.hero.title} guides and resources`}
    >
      <section aria-labelledby={`${content.key}-gallery-heading`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-himalayan mb-2">
          Learn about this category
        </p>
        <h3 id={`${content.key}-gallery-heading`} className="font-serif text-base font-bold text-charcoal mb-2">
          Lifestyle gallery
        </h3>
        {availability.gallery ? (
          <CategoryHubGallery images={gallery} title={content.hero.title} />
        ) : (
          <PdpEmptyState
            title="Gallery"
            message={content.emptyStates.gallery || 'Category photos will be added soon.'}
            compact
          />
        )}
      </section>

      <CategoryTrustStrip points={content.trustPoints} />

      <div className="border-t border-gray-100 pt-6">
        <CategoryArticlesSection
          articles={resolvedArticles}
          emptyMessage={content.emptyStates.articles}
          loading={articlesLoading}
          source={articlesSource}
        />
      </div>

      <CategoryPdfResources
        resources={content.pdfs}
        categoryLabel={content.productCategoryLabel}
        emptyMessage={content.emptyStates.pdfs}
      />
    </aside>
  );
}
