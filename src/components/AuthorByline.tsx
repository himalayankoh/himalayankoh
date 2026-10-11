import Link from 'next/link';
import { Calendar, ShieldCheck } from 'lucide-react';
import { AUTHORS, getAuthorBySlug, type Author } from '@/data/authors';

interface AuthorBylineProps {
  authorId: string;
  reviewerId?: string;
  updatedAt?: string;
  publishedAt?: string;
  className?: string;
}

export default function AuthorByline({
  authorId,
  reviewerId,
  updatedAt,
  publishedAt,
  className = '',
}: AuthorBylineProps) {
  const author: Author | undefined = AUTHORS[authorId] || getAuthorBySlug(authorId);
  const reviewer: Author | undefined = reviewerId
    ? AUTHORS[reviewerId] || getAuthorBySlug(reviewerId)
    : undefined;

  const displayDate = updatedAt || publishedAt;
  const formattedDate = displayDate
    ? new Date(displayDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;

  return (
    <div
      className={`flex flex-wrap items-center gap-y-3 gap-x-6 text-sm text-charcoal-light py-3 border-y border-gray-100 ${className}`}
    >
      {/* Author */}
      {author ? (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-himalayan/10 flex items-center justify-center text-himalayan font-semibold text-xs border border-himalayan/20">
            {author.name.charAt(0)}
          </div>
          <div>
            <span className="text-xs text-charcoal/50 block">Written by</span>
            <Link
              href={`/author/${author.slug}`}
              className="font-medium text-charcoal hover:text-himalayan transition-colors flex items-center gap-1"
            >
              {author.name}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Reviewer */}
      {reviewer ? (
        <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div>
            {/* "Cross-checked" rather than "Reviewed": the second byline is another
                company team, not an independent or veterinary reviewer, and the
                label should not read as external vetting. */}
            <span className="text-xs text-charcoal/50 block">Cross-checked by</span>
            <Link
              href={`/author/${reviewer.slug}`}
              className="font-medium text-charcoal hover:text-himalayan transition-colors"
            >
              {reviewer.name}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Date */}
      {formattedDate ? (
        <div className="flex items-center gap-1.5 text-xs text-charcoal/60 sm:ml-auto">
          <Calendar className="w-3.5 h-3.5" />
          <span>Last updated: {formattedDate}</span>
        </div>
      ) : null}
    </div>
  );
}
