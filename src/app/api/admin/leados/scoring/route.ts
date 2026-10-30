import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { calculateOpportunityScore, DEFAULT_SCORE_WEIGHTS } from '@/lib/leados/scoring';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const weightsList = Object.entries(DEFAULT_SCORE_WEIGHTS).map(([key, val]) => ({
    signalKey: key,
    signalName: val.name,
    weight: val.weight,
  }));

  return NextResponse.json({ ok: true, weights: weightsList });
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const result = calculateOpportunityScore(body.lead);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to score lead' }, { status: 400 });
  }
}
