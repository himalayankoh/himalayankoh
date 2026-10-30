/**
 * WordPress content, for the Blog, Media and Reviews screens.
 *
 * One route because all three ask the same question first — "which parts of
 * WordPress can this deployment actually reach?" — and answering it three times
 * would mean three probes with three chances to disagree. The capability block
 * travels with every response so a screen can distinguish an empty list from an
 * unreachable one, which is the difference between "you have no drafts" and "this
 * credential cannot see drafts".
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  listApprovedComments,
  listWordPressMedia,
  listWordPressPosts,
  plainText,
  readProductRatings,
  readWordPressContentCapability,
  wordpressOrigin,
} from '@/lib/wordpress/content';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const section = params.get('section') ?? 'all';
  const page = Number(params.get('page') ?? '1') || 1;
  const search = params.get('search') || undefined;

  try {
    const capability = await readWordPressContentCapability();

    const wants = (name: string) => section === 'all' || section === name;

    const [posts, media, ratings] = await Promise.all([
      wants('posts')
        ? listWordPressPosts({ page, perPage: 20, search })
        : Promise.resolve(null),
      wants('media')
        ? listWordPressMedia({ page, perPage: 40, search })
        : Promise.resolve(null),
      wants('reviews') ? readProductRatings() : Promise.resolve(null),
    ]);

    const comments = wants('reviews') ? await listApprovedComments({ perPage: 50 }) : null;

    return NextResponse.json({
      capability: {
        ...capability,
        origin: wordpressOrigin(),
      },
      posts: posts
        ? {
            items: posts.items.map((post) => ({
              id: post.id,
              slug: post.slug,
              title: plainText(post.title?.rendered, 160),
              excerpt: plainText(post.excerpt?.rendered, 240),
              date: post.date_gmt ?? null,
              status: post.status ?? null,
              link: post.link ?? null,
            })),
            error: posts.error,
          }
        : null,
      media: media
        ? {
            items: media.items.map((item) => ({
              id: item.id,
              title: plainText(item.title?.rendered, 120),
              alt: item.alt_text?.trim() || null,
              mime: item.mime_type ?? null,
              url: item.source_url ?? null,
              width: item.media_details?.width ?? null,
              height: item.media_details?.height ?? null,
              bytes: item.media_details?.filesize ?? null,
              thumbnail:
                item.media_details?.sizes?.medium?.source_url ??
                item.media_details?.sizes?.thumbnail?.source_url ??
                item.source_url ??
                null,
              date: item.date_gmt ?? null,
            })),
            error: media.error,
          }
        : null,
      reviews: ratings
        ? {
            ratings: ratings.ratings.filter((rating) => rating.ratingCount > 0),
            unrated: ratings.ratings.filter((rating) => rating.ratingCount === 0).length,
            error: ratings.error,
            approvedComments: comments
              ? {
                  items: comments.items.map((comment) => ({
                    id: comment.id,
                    author: comment.author_name ?? null,
                    date: comment.date_gmt ?? null,
                    content: plainText(comment.content?.rendered, 280),
                    type: comment.type ?? null,
                    post: comment.post ?? null,
                  })),
                  error: comments.error,
                }
              : null,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WordPress content could not be read.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
