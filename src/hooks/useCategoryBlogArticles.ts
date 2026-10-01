import { useEffect, useState } from 'react';
import { loadCategoryArticles } from '../lib/categoryContent/blogArticles';
import type { CategoryArticleCard } from '../lib/categoryContent';
import { toCategoryContentKey } from '../lib/categoryContent';

export type CategoryArticleSource = 'blog' | 'placeholder' | 'idle';

export function useCategoryBlogArticles(
  categoryKey: string | null,
  placeholderArticles: CategoryArticleCard[] = []
) {
  // Only a shelf key has a blog mapping; a newer category renders no article row.
  const contentKey = toCategoryContentKey(categoryKey);
  const [articles, setArticles] = useState<CategoryArticleCard[]>(placeholderArticles);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<CategoryArticleSource>(
    placeholderArticles.length > 0 ? 'placeholder' : 'idle'
  );

  useEffect(() => {
    if (!contentKey) {
      setArticles([]);
      setSource('idle');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadCategoryArticles(contentKey, placeholderArticles).then((result) => {
      if (cancelled) return;
      setArticles(result.articles);
      setSource(result.source);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [contentKey, placeholderArticles]);

  return { articles, loading, source };
}
