/**
 * A post's revision history, and restoring one.
 *
 * These are WordPress's own revisions (`wp/v2/posts/<id>/revisions`), not a
 * `blog_revisions` table. WordPress already keeps a revision per save, it already
 * snapshots the post meta the HK fields live in, and its retention policy is already
 * the site's policy — a second history in another database would be a second thing to
 * prune and a second place a restore could be wrong.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WordPressApiError } from '@/lib/backend/wordpress';
import { listRevisions, restoreRevision } from '@/lib/blog/wordpressAdminBlog';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof WordPressApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status || 502 });
  }
  console.error('Blog revision operation failed:', error);
  return NextResponse.json({ error: 'The blog could not be reached right now.' }, { status: 502 });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  try {
    return NextResponse.json({ revisions: await listRevisions(id) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  let body: { revision?: number | string };
  try {
    body = (await request.json()) as { revision?: number | string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const revision = Number(body.revision);
  if (!Number.isInteger(revision) || revision <= 0) {
    return NextResponse.json({ error: 'A revision id is required.' }, { status: 400 });
  }

  try {
    return NextResponse.json({ post: await restoreRevision(id, revision) });
  } catch (error) {
    return failure(error);
  }
}
