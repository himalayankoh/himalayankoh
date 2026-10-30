import { BookOpen, Clock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CategoryArticleCard } from '../../lib/categoryContent';
import type { CategoryArticleSource } from '../../hooks/useCategoryBlogArticles';
import PdpEmptyState from '../product/PdpEmptyState';

interface Props {
  articles: CategoryArticleCard[];
  emptyMessage?: string;
  loading?: boolean;
  source?: CategoryArticleSource;
}

export default function CategoryArticleCards({
  articles,
  emptyMessage,
  loading,
  source,
}: Props) {
  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading articles">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 size={18} className="animate-spin text-himalayan" aria-hidden />
          <h3 className="font-serif text-lg font-bold text-charcoal">From the field</h3>
        </div>
        <ul className="space-y-3">
          {[1, 2, 3].map((slot) => (
            <li key={slot} className="flex gap-3 p-3 rounded-xl border border-gray-100 bg-white animate-pulse">
              <div className="w-24 h-20 bg-gray-100 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-2 w-16 bg-gray-100 rounded" />
                <div className="h-3 w-full bg-gray-100 rounded" />
                <div className="h-2 w-4/5 bg-gray-100 rounded" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (articles.length === 0) {
    return emptyMessage ? (
      <PdpEmptyState title="Articles & guides" message={emptyMessage} compact />
    ) : null;
  }

  const sourceLabel = source === 'blog' ? 'From the blog' : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-himalayan" aria-hidden />
          <h3 className="font-serif text-lg font-bold text-charcoal">From the field</h3>
        </div>
        {sourceLabel && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-himalayan bg-himalayan-lighter px-2 py-0.5 rounded-full">
            {sourceLabel}
          </span>
        )}
      </div>
      <ul className="space-y-4" role="list">
        {articles.map((article) => {
          const inner = (
            <>
              <div className="w-28 h-24 sm:w-36 sm:h-28 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={article.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-himalayan">
                  {article.tag}
                </span>
                <p className="font-semibold text-charcoal text-sm mt-1 line-clamp-2">{article.title}</p>
                <p className="text-xs text-charcoal-light mt-1 line-clamp-2 leading-relaxed">{article.excerpt}</p>
                <p className="text-[11px] text-charcoal-light mt-2 flex items-center gap-1">
                  <Clock size={12} aria-hidden />
                  {article.readTime}
                </p>
              </div>
            </>
          );

          return (
            <li key={article.id}>
              {article.href ? (
                <Link
                  to={article.href}
                  className="flex gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-himalayan/30 hover:shadow-sm transition-all"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex gap-3 p-3 rounded-xl border border-gray-100 bg-white">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-charcoal-light mt-3">
        <Link to="/blog" className="text-himalayan font-semibold hover:underline">
          View all articles on the blog
        </Link>
      </p>
    </div>
  );
}
