/**
 * The blog console's post collection: list and create.
 *
 * The console is in HK Admin and the posts are WordPress's, so this route is the
 * seam: it verifies the admin's own session (`verifyAdminRequest`, the same gate
 * every admin route uses) and then writes through WordPress with the deployment's
 * administrator application password. A browser never holds that credential, and the
 * console's sign-in is unchanged.
 *
 * A slug already in use is a 409 with a readable message rather than a silent
 * suffix: an editor who typed a slug should know it was taken, not discover later
 * that the URL is not the one they chose.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WordPressApiError } from '@/lib/backend/wordpress';
import { createPost, listPosts, type BlogPostInput } from '@/lib/blog/wordpressAdminBlog';

export const dynamic = 'force-dynamic';

/** A backend failure as an HTTP answer, with WordPress's own status when it has one. */
function failure(error: unknown) {
  if (error instanceof WordPressApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status || 502 });
  }
  console.error('Blog post operation failed:', error);
  return NextResponse.json({ error: 'The blog could not be reached right now.' }, { status: 502 });
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    return NextResponse.json({ posts: await listPosts() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: BlogPostInput;
  try {
    body = (await request.json()) as BlogPostInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!String(body.title ?? '').trim()) {
    return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
  }

  try {
    return NextResponse.json({ post: await createPost(body) });
  } catch (error) {
    if (error instanceof WordPressApiError && error.code === 'term_exists') {
      return NextResponse.json({ error: 'That slug is already in use.' }, { status: 409 });
    }
    return failure(error);
  }
}
