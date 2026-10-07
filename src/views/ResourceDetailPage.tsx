import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  PackageCheck,
  ShieldAlert,
} from 'lucide-react';
import type { ResourceArticle } from '@/data/resources';
import { getResourceArticleBySlug } from '@/data/resources';
import AuthorByline from '@/components/AuthorByline';

interface ResourceDetailPageProps {
  article: ResourceArticle;
}

export default function ResourceDetailPage({ article }: ResourceDetailPageProps) {
  const relatedArticles = article.relatedArticleSlugs
    .map((slug) => getResourceArticleBySlug(slug))
    .filter((a): a is ResourceArticle => Boolean(a));

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Top Header / Breadcrumb */}
      <div className="bg-charcoal text-white py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <nav className="flex items-center gap-2 text-xs text-white/60 mb-6 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href="/resources" className="hover:text-white transition-colors">
              Resources
            </Link>
            <span>/</span>
            <span className="text-himalayan font-medium truncate max-w-xs sm:max-w-md">
              {article.title}
            </span>
          </nav>

          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-himalayan/20 text-himalayan rounded-full text-xs font-semibold uppercase tracking-wider">
              {article.category}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <Clock className="w-3.5 h-3.5" />
              <span>{article.readTime}</span>
            </div>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-6">
            {article.title}
          </h1>

          <p className="text-white/80 text-lg md:text-xl leading-relaxed font-light">
            {article.summary}
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-14 space-y-10">
        {/* Author Byline */}
        <AuthorByline
          authorId={article.authorId}
          reviewerId={article.reviewerId}
          publishedAt={article.publishedAt}
          updatedAt={article.updatedAt}
        />

        {/* Article Body */}
        <article className="bg-white rounded-3xl p-8 md:p-12 border border-gray-100 shadow-sm space-y-10 text-charcoal leading-relaxed">
          {article.sections.map((section, idx) => (
            <section key={idx} className="space-y-4">
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-charcoal tracking-tight pt-2">
                {section.heading}
              </h2>
              <div className="space-y-4 text-charcoal-light text-base md:text-lg leading-relaxed">
                {section.body.map((para, pIdx) => {
                  if (para.startsWith('• ') || para.startsWith('1. ') || para.startsWith('2. ') || para.startsWith('3. ') || para.startsWith('4. ')) {
                    return (
                      <p key={pIdx} className="pl-4 border-l-2 border-himalayan/40 py-1 font-medium text-charcoal">
                        {para}
                      </p>
                    );
                  }
                  return <p key={pIdx}>{para}</p>;
                })}
              </div>
            </section>
          ))}

          {/* Regulatory / Advisory Callout */}
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-6 md:p-8 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-base">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-600" />
              <span>Veterinary & Nutritional Advisory Note</span>
            </div>
            <p className="text-amber-950/80 text-sm leading-relaxed">
              This educational guide is provided strictly for informational and management purposes. Salt licks and mineral blocks deliver essential sodium and chloride alongside naturally occurring trace minerals, but do NOT replace complete veterinary-formulated mineral programs, vitamin supplementation, or geographic-specific forage balancing. Always consult a licensed veterinarian or livestock nutritionist for custom herd regimens. For additional guidelines, view our{' '}
              <Link href="/disclaimer" className="font-bold underline text-amber-900 hover:text-amber-700">
                full product disclaimer
              </Link>
              .
            </p>
          </div>

          {/* Scientific Citations & Sources */}
          {article.sources.length > 0 && (
            <div className="pt-8 border-t border-gray-100 space-y-4">
              <h3 className="font-serif text-xl font-bold text-charcoal flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-himalayan" /> Scientific Sources & Literature
              </h3>
              <ul className="space-y-2 text-sm text-charcoal/70">
                {article.sources.map((src, sIdx) => (
                  <li key={sIdx} className="flex items-start gap-2">
                    <span className="text-himalayan font-bold">•</span>
                    <span>
                      <strong className="text-charcoal">{src.title}</strong> — {src.publication}{' '}
                      {src.year && <span className="text-charcoal/50">({src.year})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        {/* Related Products Bar */}
        {article.relatedProductSlugs.length > 0 && (
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-himalayan">
                  Verified Catalog
                </span>
                <h3 className="font-serif text-2xl font-bold text-charcoal">
                  Related Salt Products
                </h3>
              </div>
              <Link
                href="/products"
                className="text-sm font-semibold text-himalayan hover:text-himalayan-dark flex items-center gap-1"
              >
                Browse All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {article.relatedProductSlugs.map((slug) => {
                const formattedName = slug
                  .split('-')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
                return (
                  <Link
                    key={slug}
                    href={`/products/${slug}`}
                    className="p-4 rounded-xl border border-gray-100 hover:border-himalayan/40 hover:shadow-sm bg-warm-white transition-all flex flex-col justify-between group"
                  >
                    <div className="space-y-1.5 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-himalayan/10 flex items-center justify-center text-himalayan">
                        <PackageCheck className="w-4 h-4" />
                      </div>
                      <h4 className="font-medium text-charcoal group-hover:text-himalayan text-sm transition-colors line-clamp-2">
                        {formattedName}
                      </h4>
                    </div>
                    <span className="text-xs font-semibold text-himalayan flex items-center gap-1">
                      View Product <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Related Articles Carousel/List */}
        {relatedArticles.length > 0 && (
          <div className="space-y-6">
            <h3 className="font-serif text-2xl font-bold text-charcoal">
              Related Research Guides
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {relatedArticles.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/resources/${rel.slug}`}
                  className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:border-himalayan/40 hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 bg-himalayan/10 text-himalayan rounded-full">
                      {rel.category}
                    </span>
                    <h4 className="font-serif text-lg font-bold text-charcoal group-hover:text-himalayan transition-colors">
                      {rel.title}
                    </h4>
                    <p className="text-charcoal-light text-sm line-clamp-2 leading-relaxed">
                      {rel.summary}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-himalayan">
                    <span>Read Article</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Back Button */}
        <div className="pt-6 flex items-center justify-between border-t border-gray-200">
          <Link
            href="/resources"
            className="inline-flex items-center gap-2 text-sm font-semibold text-charcoal hover:text-himalayan transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Resource Library
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center gap-1 text-sm font-semibold text-himalayan hover:underline"
          >
            Our Quality Standards <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
