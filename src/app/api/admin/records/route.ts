/**
 * The admin tool's own records — same-origin, admin-authenticated.
 *
 * The Product Scout, Product Research, Hermes feeds and the media/settings key-value
 * stores keep their own working state (candidates and scores, suppliers, agent jobs).
 * That state used to be read and written straight from the browser to a database
 * endpoint. It now lives in the hk-storefront plugin's `hk_admin_records` table, and the
 * browser reaches it through this route, which is the only side that holds the
 * WordPress credential.
 *
 * ## Why one route for several record names
 *
 * The record name is a parameter, not a path segment, because the plugin's allowlist
 * is the thing that decides what may be written — a `/records/<name>` shape would put
 * that decision in the URL and invite a per-name route for every future table. The
 * plugin refuses an unlisted name; this route refuses an unauthenticated caller.
 *
 * ## Server-only credentials
 *
 * `verifyAdminRequest` checks the app's own admin session (the same one the console
 * signs in with). Nothing here exposes a WordPress application password, and the
 * browser never learns the WordPress origin.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { storefrontRequest } from '@/lib/wordpress/storefrontClient';

export const dynamic = 'force-dynamic';

/** A WordPress/plugin failure, reported as the store's own message. */
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'The record store could not be reached.';
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const table = params.get('table') ?? '';
  const id = params.get('id');

  try {
    if (id) {
      const result = await storefrontRequest<{ record: unknown }>('/admin-records/one', {
        params: { table, id },
      });
      return NextResponse.json(result);
    }

    const result = await storefrontRequest<{ items: unknown[] }>('/admin-records', {
      params: {
        table,
        limit: params.get('limit'),
        order: params.get('order'),
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { table?: string; id?: string; payload?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.table || !body.id) {
    return NextResponse.json({ error: 'A record name and an id are required.' }, { status: 400 });
  }

  try {
    const result = await storefrontRequest<{ record: unknown }>('/admin-records', {
      method: 'POST',
      body: {
        table: body.table,
        id: String(body.id),
        payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { table?: string; id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.table || !body.id) {
    return NextResponse.json({ error: 'A record name and an id are required.' }, { status: 400 });
  }

  try {
    const result = await storefrontRequest<{ deleted: boolean }>('/admin-records', {
      method: 'DELETE',
      body: { table: body.table, id: String(body.id) },
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
