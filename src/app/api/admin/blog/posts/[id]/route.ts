/**
 * One blog post: read, update, lifecycle, delete.
 *
 * Four verbs on one resource rather than four routes, because they are four things
 * you do to the same post and the console already knows which post it is editing.
 * The lifecycle action (`publish`, `schedule`, `unpublish`, `archive`, `restore`) is
 * a POST rather than a PATCH of `status`, because it is a verb with its own rules —
 * a schedule carries a time, an archive is a trash, a restore returns to draft — and
 * modelling it as a field write would push those rules into every caller.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WordPressApiError } from '@/lib/backend/wordpress';
import {
  deletePost,
  getPost,
  setLifecycle,
  updatePost,
  type BlogPostInput,
} from '@/lib/blog/wordpressAdminBlog';

export const dynamic = 'force-dynamic';

type LifecycleAction = 'publish' | 'schedule' | 'unpublish' | 'archive' | 'restore';
const LIFECYCLE_ACTIONS: LifecycleAction[] = ['publish', 'schedule', 'unpublish', 'archive', 'restore'];

function failure(error: unknown) {
  if (error instanceof WordPressApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status || 502 });
  }
  console.error('Blog post operation failed:', error);
  return NextResponse.json({ error: 'The blog could not be reached right now.' }, { status: 502 });
}

async function authorize(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  return { error: null };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  try {
    const post = await getPost(id);
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    return NextResponse.json({ post });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  let body: Partial<BlogPostInput>;
  try {
    body = (await request.json()) as Partial<BlogPostInput>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    return NextResponse.json({ post: await updatePost(id, body) });
  } catch (error) {
    if (error instanceof WordPressApiError && error.code === 'term_exists') {
      return NextResponse.json({ error: 'That slug is already in use.' }, { status: 409 });
    }
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  let body: { action?: string; scheduledAt?: string | null };
  try {
    body = (await request.json()) as { action?: string; scheduledAt?: string | null };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = body.action as LifecycleAction;
  if (!LIFECYCLE_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Unknown lifecycle action. Use one of: ${LIFECYCLE_ACTIONS.join(', ')}.` },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ post: await setLifecycle(id, action, body.scheduledAt ?? null) });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  // Trash by default; `force=true` is the console's "Delete permanently", and it is an
  // explicit request rather than a query the UI can set by accident.
  const permanent = new URL(request.url).searchParams.get('permanent') === '1';

  try {
    await deletePost(id, permanent);
    return NextResponse.json({ ok: true, permanent });
  } catch (error) {
    if (error instanceof WordPressApiError && error.status === 404) {
      // Already gone is the outcome the caller wanted, so it is not an error.
      return NextResponse.json({ ok: true, permanent, alreadyGone: true });
    }
    return failure(error);
  }
}
