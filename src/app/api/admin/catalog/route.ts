/**
 * The console's catalog read.
 *
 * This endpoint exists because of what happened without it: the admin views
 * called `readAdminCatalogPage()` directly, so the whole server read stack —
 * the WooCommerce client, its credential reads and the WordPress request
 * layer — shipped into the admin's browser bundle and then ran there with
 * `process.env.WOOCOMMERCE_CONSUMER_KEY` undefined. The console was therefore
 * falling back to the public WordPress route in the browser, which is why its
 * price, SKU and stock columns read "unknown" while the authenticated read
 * could have answered them.
 *
 * So the read happens here, on the server, with credentials; the browser gets
 * the read model's own rows. It is deliberately NOT `/api/catalog`: that is the
 * storefront's read, sealed by the pink-salt niche guard, and the console has to
 * see the products the storefront withholds — that is how the owner finds them
 * to archive.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { readAdminCatalogWithStats } from '@/lib/backend/adminCatalog';
import type { AdminCatalogQuery } from '@/lib/backend/adminCatalog';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;

  const query: AdminCatalogQuery = {
    search: params.get('search') || undefined,
    categoryId: params.get('categoryId') || undefined,
    listing:
      params.get('listing') === 'active' || params.get('listing') === 'inactive'
        ? (params.get('listing') as 'active' | 'inactive')
        : undefined,
    isFeatured: params.get('isFeatured') === '1' ? true : undefined,
    lowStock: params.get('lowStock') === '1' ? true : undefined,
    sort: (params.get('sort') as AdminCatalogQuery['sort']) || undefined,
    page: Number(params.get('page') ?? '1') || 1,
    perPage: Number(params.get('perPage') ?? '') || undefined,
  };

  try {
    const result = await readAdminCatalogWithStats(query);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The catalog could not be read.' },
      { status: 502 }
    );
  }
}
