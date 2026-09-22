/**
 * The published CMS override for one category hub, or nothing.
 *
 * The storefront used to read this straight from Supabase in the browser, which
 * put the SDK in the catalog's client graph for a read that is public and
 * cacheable anyway. Serving it here keeps the read where the table lives, and
 * gives the page a single origin for it.
 *
 * Absence is not an error: a hub with no override is the normal case (the shelf
 * then renders the registry content it already has), so a missing row, an
 * unconfigured database and a failed read all answer `override: null`. The client
 * has always fallen back to its own content, so this route adds no new failure
 * mode — it just stops lying about one.
 */

import { NextResponse } from 'next/server';
import { categoryHubApi } from '@/lib/supabase/api/categoryHub';
import { isCategoryContentKey } from '@/lib/categoryContent/keys';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key') ?? '';

  if (!key || !isCategoryContentKey(key)) {
    return NextResponse.json({ error: 'Unknown category key.' }, { status: 400 });
  }

  try {
    const override = await categoryHubApi.getOverride(key);
    return NextResponse.json({ override: override ?? null });
  } catch (error) {
    // A hub whose CMS read fails renders its registry content, exactly as it did
    // when this call was made from the browser and rejected.
    console.warn('Category hub CMS read failed; serving no override:', error);
    return NextResponse.json({ override: null });
  }
}
