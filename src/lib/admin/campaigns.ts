/**
 * Campaigns — drafting and orchestration, server only.
 *
 * ## One store, and why it is this one
 *
 * A campaign is application data: a plan, an audience, a brief, a schedule. It is
 * not commerce data, so it does not belong in WooCommerce — and a campaign is not
 * a discount, so putting it there would create a second place a price could be
 * changed. It goes in `site_settings`, which this app already owns for exactly
 * this kind of record (category/key/value, reachable only with the service role,
 * no migration needed), one row per campaign. That is one deliberate store, not a
 * second catalogue.
 *
 * ## What a campaign may and may not do
 *
 * Ownership is stated in the code because it is the part that drifts:
 *
 *   - **Coupons** stay on the Coupons screen. A campaign may *reference* a coupon
 *     code, and the reference is verified against the store when the campaign is
 *     validated — a campaign pointing at a code that does not exist is a broken
 *     campaign, and is refused rather than saved as ready.
 *   - **Price rules** stay on Promotions.
 *   - **Sending** is Resend's, and Resend is not configured on this deployment. So
 *     a campaign can be drafted, validated, scheduled and marked ready, and
 *     `send` is refused with the reason. Nothing anywhere claims an email was sent.
 *
 * ## Status is earned, not selected
 *
 * `draft` is where a campaign starts. `ready` requires the validation below to
 * pass. `scheduled`, `running` and `completed` are *derived* from the schedule
 * once a campaign is ready, so the calendar cannot disagree with the record: there
 * is no way to mark a campaign "running" while its start date is next month.
 */

import { deleteSetting, getSettingsForCategory, upsertSettings } from '../settings/serverSettings';
import { findCouponByCode } from '../woo/coupons';
import { hasWooCommerceCredentials } from '../backend/credentials';

/** The settings category campaigns live under. Also the whole namespace. */
export const CAMPAIGN_CATEGORY = 'campaigns';

export type CampaignStatus = 'draft' | 'ready' | 'scheduled' | 'running' | 'completed' | 'cancelled';

export interface Campaign {
  id: string;
  name: string;
  goal: string;
  audience: string;
  brief: string;
  /** ISO dates, or null when the campaign has no schedule yet. */
  startsAt: string | null;
  endsAt: string | null;
  /** WooCommerce product ids this campaign is about. */
  productIds: number[];
  /** A coupon code that exists in the store, or null. Ownership stays with Coupons. */
  couponCode: string | null;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInput {
  id?: string;
  name?: string;
  goal?: string;
  audience?: string;
  brief?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  productIds?: number[];
  couponCode?: string | null;
  /** Only 'draft' and 'ready' may be requested; the rest are derived. */
  status?: CampaignStatus;
}

export class CampaignError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CampaignError';
    this.status = status;
  }
}

function isoOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new CampaignError(`"${value}" is not a readable date.`);
  return parsed.toISOString();
}

function parseCampaign(id: string, raw: string | null): Campaign | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Campaign;
    if (!parsed || typeof parsed !== 'object' || !parsed.name) return null;
    return { ...parsed, id: parsed.id || id };
  } catch {
    return null;
  }
}

/** Every campaign, newest first. Rows that cannot be parsed are reported, not hidden. */
export async function listCampaigns(now: Date = new Date()): Promise<{
  campaigns: Campaign[];
  unreadable: string[];
}> {
  const rows = await getSettingsForCategory(CAMPAIGN_CATEGORY);
  const campaigns: Campaign[] = [];
  const unreadable: string[] = [];

  for (const [id, raw] of Object.entries(rows)) {
    const parsed = parseCampaign(id, raw);
    if (!parsed) {
      unreadable.push(id);
      continue;
    }
    campaigns.push({ ...parsed, status: effectiveStatus(parsed, now) });
  }

  campaigns.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { campaigns, unreadable };
}

/**
 * The status a campaign actually has, given the clock.
 *
 * Applied on read so a campaign that has run its course reports as completed
 * without anyone editing it — and so `running` can never be claimed for a
 * campaign whose window has not opened.
 */
export function effectiveStatus(campaign: Campaign, now: Date = new Date()): CampaignStatus {
  if (campaign.status === 'draft' || campaign.status === 'cancelled') return campaign.status;
  const start = campaign.startsAt ? new Date(campaign.startsAt) : null;
  const end = campaign.endsAt ? new Date(campaign.endsAt) : null;
  if (end && end.getTime() <= now.getTime()) return 'completed';
  if (start && start.getTime() > now.getTime()) return 'scheduled';
  if (start && start.getTime() <= now.getTime()) return 'running';
  return 'ready';
}

export interface CampaignValidation {
  ok: boolean;
  problems: string[];
  /** Checks that need the store, reported separately so a store outage is visible. */
  storeChecks: string[];
}

/**
 * Everything that must hold before a campaign can be marked ready.
 *
 * `productIds` are checked for shape here; whether they exist in the catalogue is
 * the caller's job, because it needs a store read and its failure must not read as
 * "this campaign is invalid".
 */
export function validateCampaign(campaign: Campaign): CampaignValidation {
  const problems: string[] = [];
  if (!campaign.name.trim()) problems.push('A campaign needs a name.');
  if (!campaign.goal.trim()) problems.push('A campaign needs a goal — what it is for.');
  if (!campaign.audience.trim()) problems.push('A campaign needs an audience to be aimed at.');
  if (!campaign.brief.trim()) problems.push('A campaign needs a brief describing the offer.');
  if (campaign.productIds.length === 0) problems.push('Select at least one product to feature.');

  if (campaign.startsAt && campaign.endsAt) {
    const start = new Date(campaign.startsAt).getTime();
    const end = new Date(campaign.endsAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
      problems.push('The end date is not after the start date.');
    }
  }

  return { ok: problems.length === 0, problems, storeChecks: [] };
}

/**
 * The part of validation that needs the store: does the referenced coupon exist?
 *
 * Run when a campaign is asked to become ready, so a campaign cannot point at a
 * code that will never apply. A store that cannot be read says so instead of
 * failing the campaign.
 */
export async function validateCampaignCoupon(code: string | null): Promise<{
  ok: boolean;
  problem: string | null;
  error: string | null;
}> {
  if (!code) return { ok: true, problem: null, error: null };
  if (!hasWooCommerceCredentials()) {
    return {
      ok: false,
      problem: null,
      error: 'WooCommerce is not connected, so the coupon code could not be checked.',
    };
  }
  try {
    const coupon = await findCouponByCode(code);
    return coupon
      ? { ok: true, problem: null, error: null }
      : {
          ok: false,
          problem: `No coupon "${code}" exists in the store. Create it on the Coupons screen first — a campaign cannot reference a code that will never apply.`,
          error: null,
        };
  } catch (error) {
    return {
      ok: false,
      problem: null,
      error: `The coupon could not be checked against the store: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function randomId(): string {
  return `cmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates or updates a campaign. Returns the stored record. */
export async function saveCampaign(
  input: CampaignInput,
  now: Date = new Date()
): Promise<{ campaign: Campaign; validation: CampaignValidation }> {
  const existing = input.id ? await getCampaign(input.id) : null;
  const timestamp = now.toISOString();

  const campaign: Campaign = {
    id: existing?.id ?? input.id ?? randomId(),
    name: (input.name ?? existing?.name ?? '').trim(),
    goal: (input.goal ?? existing?.goal ?? '').trim(),
    audience: (input.audience ?? existing?.audience ?? '').trim(),
    brief: (input.brief ?? existing?.brief ?? '').trim(),
    startsAt: input.startsAt !== undefined ? isoOrNull(input.startsAt) : existing?.startsAt ?? null,
    endsAt: input.endsAt !== undefined ? isoOrNull(input.endsAt) : existing?.endsAt ?? null,
    productIds: (input.productIds ?? existing?.productIds ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
    couponCode: input.couponCode !== undefined ? input.couponCode?.trim().toLowerCase() || null : existing?.couponCode ?? null,
    status: 'draft',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const requested = input.status ?? existing?.status ?? 'draft';
  const validation = validateCampaign(campaign);
  const couCheck = await validateCampaignCoupon(campaign.couponCode);

  if (requested === 'ready') {
    if (!validation.ok) {
      throw new CampaignError(`This campaign is not ready: ${validation.problems.join(' ')}`, 400);
    }
    if (couCheck.problem) throw new CampaignError(couCheck.problem, 400);
    if (couCheck.error) throw new CampaignError(couCheck.error, 502);
    campaign.status = 'ready';
  } else if (requested === 'cancelled') {
    campaign.status = 'cancelled';
  } else {
    campaign.status = 'draft';
  }

  await upsertSettings(CAMPAIGN_CATEGORY, { [campaign.id]: JSON.stringify(campaign) });
  return { campaign: { ...campaign, status: effectiveStatus(campaign, now) }, validation };
}

/** One campaign by id. */
export async function getCampaign(id: string): Promise<Campaign | null> {
  const rows = await getSettingsForCategory(CAMPAIGN_CATEGORY);
  if (!(id in rows)) return null;
  return parseCampaign(id, rows[id]);
}

/** Removes a campaign record. A real delete: a discarded draft is not history. */
export async function deleteCampaign(id: string): Promise<boolean> {
  const existing = await getCampaign(id);
  if (!existing) return false;
  await deleteSetting(CAMPAIGN_CATEGORY, id);
  return true;
}

/** True when the deployment can actually deliver mail. Resend owns this. */
export function canSendCampaignEmail(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** The reason sending is unavailable, or null when it is available. */
export function campaignSendBlocker(): string | null {
  if (canSendCampaignEmail()) return null;
  return 'RESEND_API_KEY and a verified sending domain are not configured on this deployment, so campaign email cannot be sent. Drafting, validating and scheduling a campaign all work without it.';
}
