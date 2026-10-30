import { useState } from 'react';
import { ArrowRight, BookOpen, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CategoryArticleCard } from '../../lib/categoryContent';
import type { CategoryArticleSource } from '../../hooks/useCategoryBlogArticles';
import PdpEmptyState from '../product/PdpEmptyState';
import { publicEnv } from '../../lib/env';

const PREVIEW_LENGTH = 140;

interface Props {
  articles: CategoryArticleCard[];
  emptyMessage?: string;
  loading?: boolean;
  source?: CategoryArticleSource;
  categoryLabel?: string;
}

function ArticleCard({ article }: { article: CategoryArticleCard }) {
  const [expanded, setExpanded] = useState(false);
  const fullText = (article.body || article.excerpt).trim();
  const canExpand = fullText.length > PREVIEW_LENGTH;
  const displayText = expanded || !canExpand
    ? fullText
    : `${fullText.slice(0, PREVIEW_LENGTH).trim()}…`;

  return (
    <article className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      <div className="flex gap-0 sm:gap-0 flex-col sm:flex-row">
        <div className="sm:w-32 md:w-36 shrink-0 h-28 sm:h-auto sm:min-h-[7.5rem]">
          <img
            src={article.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover sm:rounded-l-xl"
          />
        </div>
        <div className="flex-1 p-4 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-himalayan">
            {article.tag}
          </span>
          <h4 className="font-semibold text-charcoal text-sm sm:text-base mt-1 leading-snug">
            {article.title}
          </h4>
          <p className="text-xs sm:text-sm text-charcoal-light mt-2 leading-relaxed">
            {displayText}
          </p>
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 text-xs font-semibold text-himalayan hover:text-himalayan-dark transition-colors"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-[11px] text-charcoal-light flex items-center gap-1">
              <Clock size={12} aria-hidden />
              {article.readTime}
            </span>
            {article.href && (
              <Link
                to={article.href}
                className="inline-flex items-center gap-1 text-xs font-semibold text-himalayan hover:underline"
              >
                Read full article
                <ArrowRight size={12} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CategoryArticlesSection({
  articles,
  emptyMessage,
  loading,
  source,
}: Props) {
  // Blog is temporarily off the storefront (kept live for direct/search access
  // and in the sitemap for SEO) — this is the one place that promotes it into
  // category/product pages, so hiding it here is enough. Nothing about the
  // blog data, routes, or sitemap changed; delete this guard to bring it back.
  if (!publicEnv.blogEnabled) return null;

  if (loading) {
    return (
      <section aria-busy="true" aria-label="Loading articles">
        <div className="flex items-center gap-2 mb-3">
          <Loader2 size={18} className="animate-spin text-himalayan" aria-hidden />
          <h3 className="font-serif text-base font-bold text-charcoal">Articles & insights</h3>
        </div>
        <ul className="space-y-3">
          {[1, 2].map((slot) => (
            <li key={slot} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </ul>
      </section>
    );
  }

  if (articles.length === 0) {
    return emptyMessage ? (
      <PdpEmptyState title="Articles" message={emptyMessage} compact />
    ) : null;
  }

  const sourceLabel = source === 'blog' ? 'Live from blog' : 'Category guides';

  return (
    <section aria-labelledby="category-articles-heading">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-himalayan shrink-0" aria-hidden />
          <h3 id="category-articles-heading" className="font-serif text-base font-bold text-charcoal">
            Articles
          </h3>
        </div>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-charcoal-light">
          {sourceLabel}
        </span>
      </div>

      <ul className="space-y-3" role="list">
        {articles.map((article) => (
          <li key={article.id}>
            <ArticleCard article={article} />
          </li>
        ))}
      </ul>

      <Link
        to="/blog"
        className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-himalayan hover:underline"
      >
        More on the blog
        <ExternalLink size={12} aria-hidden />
      </Link>
    </section>
  );
}
