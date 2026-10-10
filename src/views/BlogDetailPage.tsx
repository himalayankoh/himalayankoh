import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, Clock, Loader2, Tag, User } from 'lucide-react';
import { blogPostApi } from '../lib/blog/client';
import type { BlogPostWithAuthor } from '../lib/blog/client';
import { resolveLegacyImageSrc } from '../lib/images/legacyAssets';
import AdSlot from '../components/ads/AdSlot';

interface BlogDetailPageProps {
  /**
   * Post fetched during server render. Seeding state with it puts the article
   * body in the initial HTML, so crawlers index the content instead of the
   * loading spinner they would otherwise get from a client-only fetch.
   */
  initialPost?: BlogPostWithAuthor | null;
}

export default function BlogDetailPage({ initialPost = null }: BlogDetailPageProps) {
  const { slug } = useParams();
  const [post, setPost] = useState<BlogPostWithAuthor | null>(initialPost);
  const [relatedPosts, setRelatedPosts] = useState<BlogPostWithAuthor[]>([]);
  const [loading, setLoading] = useState(!initialPost);

  useEffect(() => {
    const fetchPost = async () => {
      if (!slug) {
        setLoading(false);
        return;
      }

      try {
        const fetched = await blogPostApi.getPostBySlug(slug);

        // Keep the server-rendered post if the client refetch comes back empty,
        // so a transient failure never blanks out content already on screen.
        if (fetched || !initialPost) {
          setPost(fetched);
        }

        const current = fetched ?? initialPost;
        if (current) {
          setRelatedPosts(await blogPostApi.getRelatedPosts(current.id, current.category, 3));
        }
      } catch (err) {
        console.error('Failed to fetch blog post:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
    // initialPost is a server-render constant for this route; refetch keys on slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <Loader2 size={40} className="animate-spin text-himalayan" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-warm-white py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white rounded-2xl shadow-md p-12">
            <h1 className="font-serif text-3xl font-bold text-charcoal mb-3">Article Not Found</h1>
            <p className="text-charcoal-light mb-6">This blog post is unavailable.</p>
            <Link to="/blog" className="inline-flex items-center justify-center px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors">
              Back to Blog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Article + Breadcrumb JSON-LD is server-rendered by app/(main)/blog/[slug]/page.tsx. */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Link to="/blog" className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-6 text-sm">
            <ArrowLeft size={16} />
            Back to Blog
          </Link>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl md:text-5xl font-bold text-white leading-tight"
          >
            {post.title}
          </motion.h1>
          <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm mt-5">
            <span className="flex items-center gap-1.5">
              <User size={14} />
              {post.author?.full_name || 'Himalayan Koh'}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {post.read_time} min read
            </span>
            {post.category && (
              <span className="flex items-center gap-1.5">
                <Tag size={14} />
                {post.category}
              </span>
            )}
          </div>
        </div>
      </div>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        {/* Featured image is the LCP element for an article — eager, high priority. */}
        {post.featured_image && (
          <img
            src={resolveLegacyImageSrc(post.featured_image).src}
            alt={post.title}
            fetchPriority="high"
            decoding="async"
            className="w-full rounded-3xl shadow-lg object-cover aspect-[16/9] mb-10"
          />
        )}

        <div className="bg-white rounded-2xl shadow-md p-6 md:p-10">
          {post.excerpt && (
            <p className="text-lg text-charcoal-light leading-relaxed mb-8">
              {post.excerpt}
            </p>
          )}
          <div
            className="prose prose-lg max-w-none text-charcoal-light leading-relaxed"
            dangerouslySetInnerHTML={{ __html: post.content || '' }}
          />
        </div>

        {post.is_published && <AdSlot key={post.slug} className="mt-10" />}

        {relatedPosts.length > 0 && (
          <section className="mt-12">
            <h2 className="font-serif text-2xl font-bold text-charcoal mb-6">Related Articles</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedPosts.map((related) => (
                <Link
                  key={related.id}
                  to={`/blog/${related.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300"
                >
                  <img
                    src={resolveLegacyImageSrc(related.featured_image).src || ''}
                    alt={related.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-[16/10] object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="p-5">
                    <p className="text-xs text-charcoal-light mb-2">{related.category}</p>
                    <h3 className="font-serif font-bold text-charcoal line-clamp-2 group-hover:text-himalayan transition-colors">
                      {related.title}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-himalayan font-semibold text-sm mt-4">
                      Read
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
