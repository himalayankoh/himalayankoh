/**
 * Campaigns — drafting, validation and persistence.
 *
 * Persistence is one deliberate store (`site_settings`, category `campaigns`, one
 * row per campaign) because a campaign is application data and not commerce data:
 * it must not become a second place a price could be changed, and it must not
 * require a migration this repository cannot run. Coupons stay in WooCommerce and
 * are *referenced* here; a campaign that points at a code the store does not have
 * is refused when it is asked to become ready.
 *
 * Email sending is Resend's, and whether it is available is reported rather than
 * assumed — the console is told so it can disable the action and say why.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  CampaignError,
  campaignSendBlocker,
  deleteCampaign,
  listCampaigns,
  saveCampaign,
  validateCampaignCoupon,
  type CampaignInput,
  type CampaignStatus,
} from '@/lib/admin/campaigns';

export const dynamic = 'force-dynamic';

const REQUESTABLE_STATUSES: CampaignStatus[] = ['draft', 'ready', 'cancelled'];

function failure(error: unknown) {
  if (error instanceof CampaignError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'The campaigns could not be read.';
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { campaigns, unreadable } = await listCampaigns();
    return NextResponse.json({
      campaigns,
      unreadable,
      sendBlocker: campaignSendBlocker(),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;

  if (record.action === 'delete') {
    const id = typeof record.id === 'string' ? record.id : '';
    if (!id) return NextResponse.json({ error: 'A campaign id is required.' }, { status: 400 });
    const removed = await deleteCampaign(id);
    return NextResponse.json({ removed }, { status: removed ? 200 : 404 });
  }

  if (record.action === 'check-coupon') {
    const code = typeof record.couponCode === 'string' ? record.couponCode : null;
    return NextResponse.json(await validateCampaignCoupon(code));
  }

  const input: CampaignInput = {
    id: typeof record.id === 'string' ? record.id : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    goal: typeof record.goal === 'string' ? record.goal : undefined,
    audience: typeof record.audience === 'string' ? record.audience : undefined,
    brief: typeof record.brief === 'string' ? record.brief : undefined,
    startsAt: typeof record.startsAt === 'string' || record.startsAt === null ? record.startsAt : undefined,
    endsAt: typeof record.endsAt === 'string' || record.endsAt === null ? record.endsAt : undefined,
    productIds: Array.isArray(record.productIds) ? record.productIds.map(Number) : undefined,
    couponCode:
      typeof record.couponCode === 'string' || record.couponCode === null ? record.couponCode : undefined,
    status: REQUESTABLE_STATUSES.includes(record.status as CampaignStatus)
      ? (record.status as CampaignStatus)
      : 'draft',
  };

  try {
    const { campaign, validation } = await saveCampaign(input);
    return NextResponse.json({ campaign, validation, sendBlocker: campaignSendBlocker() });
  } catch (error) {
    return failure(error);
  }
}
