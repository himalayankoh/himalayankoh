import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { BookOpen, Search, ArrowRight, ShieldCheck } from 'lucide-react';
import { YouTubeVideosSection } from '@/components/YouTubeVideosSection';
import { RESOURCE_ARTICLES } from '@/data/resources';
import { AUTHORS } from '@/data/authors';

const CATEGORIES = [
  'All',
  'Livestock & Equine',
  'Culinary & Kitchen',
  'Bulk & Storage',
  'Mineral Science',
] as const;

export default function ResourcesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredArticles = useMemo(() => {
    return RESOURCE_ARTICLES.filter((article) => {
      const matchesCategory =
        selectedCategory === 'All' || article.category === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.sections.some((s) =>
          s.body.some((b) => b.toLowerCase().includes(searchQuery.toLowerCase()))
        );
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Hero */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            Educational Hub & Research Library
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-3"
          >
            Himalayan Salt Resource Center
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/80 text-base md:text-lg max-w-3xl mx-auto leading-relaxed"
          >
            Evidence-based guides, pasture management protocols, culinary techniques, and geological science—reviewed for factual rigor.
          </motion.p>
        </div>
      </div>

      {/* Main Grid & Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-6">
        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-himalayan text-white shadow-sm'
                    : 'bg-warm-white text-charcoal/70 hover:bg-gray-100 hover:text-charcoal'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal/40" />
            <input
              type="text"
              placeholder="Search guides & topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-warm-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/40 text-charcoal"
            />
          </div>
        </div>

        {/* Article Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredArticles.map((article, idx) => {
            const author = AUTHORS[article.authorId];
            return (
              <motion.article
                key={article.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:border-himalayan/30 transition-all flex flex-col overflow-hidden group"
              >
                <div className="p-7 sm:p-8 flex-1 flex flex-col justify-between space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 bg-himalayan/10 text-himalayan rounded-full">
                        {article.category}
                      </span>
                      <span className="text-xs text-charcoal/50 font-medium">
                        {article.readTime}
                      </span>
                    </div>

                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-charcoal group-hover:text-himalayan transition-colors leading-snug">
                      <Link href={`/resources/${article.slug}`}>
                        {article.title}
                      </Link>
                    </h2>

                    <p className="text-charcoal-light text-sm line-clamp-3 leading-relaxed">
                      {article.summary}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-charcoal/60">
                    <div>
                      {author && (
                        <span>
                          By{' '}
                          <strong className="text-charcoal font-medium">
                            {author.name}
                          </strong>
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/resources/${article.slug}`}
                      className="inline-flex items-center gap-1 font-semibold text-himalayan group-hover:translate-x-1 transition-transform"
                    >
                      Read Guide <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>

        {filteredArticles.length === 0 && (
          <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 space-y-4">
            <BookOpen className="w-12 h-12 text-himalayan mx-auto opacity-60" />
            <h3 className="font-serif text-2xl font-bold text-charcoal">No Guides Found</h3>
            <p className="text-charcoal-light max-w-md mx-auto">
              We couldn’t find any articles matching your search query. Try selecting “All” or searching for a different keyword.
            </p>
          </div>
        )}

        {/* ── YouTube Videos Section ── */}
        <YouTubeVideosSection />

        {/* Editorial Standards Notice */}
        <div className="bg-gradient-to-br from-cream to-himalayan/10 rounded-3xl p-8 border border-himalayan/20 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-himalayan font-bold text-sm uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" /> Editorial & Research Integrity
            </div>
            <h3 className="font-serif text-xl font-bold text-charcoal">
              Evidence-Based Nutritional & Handling Standards
            </h3>
            <p className="text-charcoal-light text-sm max-w-2xl">
              All guides published by Himalayan Koh are compiled from published agricultural extension research, peer-reviewed mineral studies, and verified warehouse protocols. None of our articles constitute veterinary medical advice.
            </p>
          </div>
          <Link
            href="/disclaimer"
            className="px-6 py-3 bg-charcoal hover:bg-charcoal-light text-white rounded-xl text-sm font-semibold whitespace-nowrap transition-colors shadow-sm"
          >
            Read Disclaimer
          </Link>
        </div>
      </div>
    </div>
  );
}
