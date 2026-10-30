/**
 * Generate an SEO draft — Gemini, server side, admin only.
 *
 * Three gates in front of the model, because this endpoint costs money and its
 * output is copy a human is about to trust:
 *
 *  1. an admin session (`verifyAdminRequest`), so it is not a public proxy;
 *  2. an allowed request origin, so another site cannot drive it from a browser;
 *  3. a per-admin rate limit, so a stuck button cannot spend the key.
 *
 * The response is a **draft**. Nothing here writes to WordPress or to a product;
 * the console's Apply step is separate and refuses while the copy contains a claim
 * the store cannot support (`lib/products/claims`).
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { GeminiError, generateSeoDraft, type SeoDraftInput } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

const SUBJECTS: SeoDraftInput['subject'][] = ['product', 'category', 'page'];

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const origin = request.headers.get('origin') || '';
  if (origin && !isAllowedRequestOrigin(origin, request.url)) {
    return NextResponse.json({ error: 'This origin may not call the SEO assistant.' }, { status: 403 });
  }

  const limit = checkRateLimit(`seo-generate:${auth.userId}`, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many generations in the last minute. Wait a moment and try again.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'A product or page name is required.' }, { status: 400 });
  }

  const subject = SUBJECTS.includes(record.subject as SeoDraftInput['subject'])
    ? (record.subject as SeoDraftInput['subject'])
    : 'product';

  const rawFacts = (record.facts ?? {}) as Record<string, unknown>;
  const fact = (key: string): string | null => {
    const value = rawFacts[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  try {
    const draft = await generateSeoDraft({
      subject,
      name,
      facts: {
        sku: fact('sku'),
        price: fact('price'),
        weight: fact('weight'),
        category: fact('category'),
        grainSize: fact('grainSize'),
        description: fact('description'),
        currentTitle: fact('currentTitle'),
        currentMeta: fact('currentMeta'),
      },
      keywords: Array.isArray(record.keywords)
        ? record.keywords.map((entry) => String(entry)).filter(Boolean).slice(0, 8)
        : undefined,
    });
    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof GeminiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'The draft could not be generated.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
