import Link from 'next/link';
import { User, BookOpen, ArrowRight, ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import type { Author } from '@/data/authors';
import { getArticlesByAuthor } from '@/data/resources';

interface AuthorPageProps {
  author: Author;
}

export default function AuthorPage({ author }: AuthorPageProps) {
  const articles = getArticlesByAuthor(author.slug);

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Header Profile Section */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Link
            href="/resources"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Resource Center
          </Link>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-himalayan/20 border-2 border-himalayan/40 flex items-center justify-center text-himalayan text-4xl font-serif font-bold flex-shrink-0 shadow-lg">
              {author.name.charAt(0)}
            </div>

            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-semibold uppercase tracking-wider text-himalayan">
                  Contributor Profile
                </span>
                {author.credentials && (
                  <span className="px-3 py-1 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded-full text-xs font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> {author.credentials}
                  </span>
                )}
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl font-bold">{author.name}</h1>
              <p className="text-himalayan font-medium">{author.role}</p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                {author.expertise.map((skill) => (
                  <span
                    key={skill}
                    className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-xs text-white/80"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bio & Articles Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-7">
        {/* Biography Card */}
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-4">
          <h2 className="font-serif text-2xl font-bold text-charcoal flex items-center gap-2">
            <User className="w-5 h-5 text-himalayan" /> Biography & Background
          </h2>
          <p className="text-charcoal-light leading-relaxed whitespace-pre-line">{author.bio}</p>

          {author.socials?.email && (
            <div className="pt-4 border-t border-gray-100 flex items-center gap-2 text-sm text-charcoal/70">
              <Mail className="w-4 h-4 text-himalayan" />
              <span>Editorial Inquiries:</span>
              <a
                href={`mailto:${author.socials.email}`}
                className="text-himalayan font-medium hover:underline"
              >
                {author.socials.email}
              </a>
            </div>
          )}
        </div>

        {/* Articles Written or Reviewed */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl font-bold text-charcoal flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-himalayan" /> Articles Written & Reviewed ({articles.length})
            </h2>
          </div>

          <div className="grid gap-4">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/resources/${article.slug}`}
                className="group bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:border-himalayan/40 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-himalayan/10 text-himalayan">
                      {article.category}
                    </span>
                    <span className="text-xs text-charcoal/50">{article.readTime}</span>
                  </div>
                  <h3 className="font-serif text-lg font-bold text-charcoal group-hover:text-himalayan transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-charcoal-light text-sm line-clamp-2">{article.summary}</p>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-himalayan flex-shrink-0 group-hover:translate-x-1 transition-transform">
                  <span>Read Guide</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
