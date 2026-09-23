/**
 * The console's reads and writes beyond the catalog — **browser** code.
 *
 * Admin screens are client components, and the WooCommerce consumer key/secret are
 * server-only, so every one of these goes through an authenticated `/api/admin/*`
 * route. This module is the only place a console screen is allowed to talk to the
 * server, exactly as `adminCatalogClient` is for the catalog.
 *
 * Two rules it keeps so screens do not have to:
 *
 *  - a failure **throws with the store's own message** — a refused delete, a taken
 *    slug, a rate limit — because those are decisions the owner must see rather
 *    than have smoothed into an empty list;
 *  - the *source* of a record is carried on the record itself, so a screen that
 *    mixes a store read with a local one can label which is which instead of
 *    implying they came from the same place.
 */

import { getAccessToken } from '@/services/wordpressAdminAuth';
import type { Order, OrderItem, Profile } from '@/lib/commerce/types';

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new Error('Your admin session has expired. Sign in again.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(body.error || `The server answered HTTP ${response.status}.`);
  return body as T;
}

async function getJson<T>(path: string): Promise<T> {
  return parse<T>(await fetch(path, { headers: await authHeaders() }));
}

async function postJson<T>(path: string, body: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<T> {
  return parse<T>(
    await fetch(path, { method, headers: await authHeaders(), body: JSON.stringify(body) })
  );
}

/* ------------------------------------------------------------------ */
/* Orders (WooCommerce)                                               */
/* ------------------------------------------------------------------ */

/**
 * An order as the console renders it: the store's record, plus its lines.
 *
 * `profile` is always null and is carried only so the view's existing type keeps
 * compiling. It used to be the Supabase profile of the signed-in customer, which
 * the store does not know about; the customer on a store order is its billing
 * name and email, and inventing a profile there would put another system's data on
 * a WooCommerce record.
 */
export type AdminOrderRecord = Order & { order_items: OrderItem[]; profile: Profile | null };

export interface AdminOrderStats {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  refundRequests: number;
  totalRevenue: number;
  window: number;
}

export interface AdminOrderFilters {
  search?: string;
  status?: Order['status'];
  page?: number;
  limit?: number;
}

export interface AdminOrderPage {
  orders: AdminOrderRecord[];
  count: number;
  totalPages: number;
  stats: AdminOrderStats;
}

function orderQueryString(filters: AdminOrderFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

/** A page of the store's orders, with the store's own count. */
export async function fetchAdminOrders(filters: AdminOrderFilters = {}): Promise<AdminOrderPage> {
  return getJson<AdminOrderPage>(`/api/admin/orders${orderQueryString(filters)}`);
}

/** One order, straight from the store. */
export async function fetchAdminOrder(id: string): Promise<AdminOrderRecord> {
  const { order } = await getJson<{ order: AdminOrderRecord }>(`/api/admin/orders/${id}`);
  return order;
}

/* ------------------------------------------------------------------ */
/* Coupons (WooCommerce)                                              */
/* ------------------------------------------------------------------ */

export type CouponState = 'active' | 'scheduled' | 'expired' | 'draft';

export interface AdminCoupon {
  id: number;
  code: string;
  amount: string;
  discount_type: 'percent' | 'fixed_cart' | 'fixed_product';
  description?: string;
  date_expires_gmt?: string | null;
  usage_count?: number;
  usage_limit?: number | null;
  usage_limit_per_user?: number | null;
  minimum_amount?: string;
  maximum_amount?: string;
  free_shipping?: boolean;
  status?: string;
  state: CouponState;
}

export interface AdminCouponInput {
  code: string;
  discountType: AdminCoupon['discount_type'];
  amount: number;
  description?: string;
  dateExpires?: string | null;
  minimumAmount?: number | null;
  maximumAmount?: number | null;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  freeShipping?: boolean;
  published?: boolean;
}

export async function fetchAdminCoupons(): Promise<AdminCoupon[]> {
  const { coupons } = await getJson<{ coupons: AdminCoupon[] }>('/api/admin/coupons');
  return coupons ?? [];
}

export async function createAdminCoupon(input: AdminCouponInput): Promise<AdminCoupon> {
  const { coupon } = await postJson<{ coupon: AdminCoupon }>('/api/admin/coupons', input);
  return coupon;
}

export async function updateAdminCoupon(
  id: number,
  input: Partial<AdminCouponInput>
): Promise<AdminCoupon> {
  const { coupon } = await postJson<{ coupon: AdminCoupon }>(
    `/api/admin/coupons/${id}`,
    input,
    'PUT'
  );
  return coupon;
}

export async function deleteAdminCoupon(
  id: number
): Promise<{ coupon: AdminCoupon; remaining: number; stillPresent: boolean }> {
  return postJson(`/api/admin/coupons/${id}`, {}, 'DELETE');
}

/* ------------------------------------------------------------------ */
/* Customers (WooCommerce)                                            */
/* ------------------------------------------------------------------ */

export interface AdminCustomer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  /** Null when WooCommerce does not report a figure for this customer. */
  ordersCount: number | null;
  totalSpent: number | null;
  lastOrderStatus: string | null;
  lastOrderAt: string | null;
  registeredAt: string | null;
  isPayingCustomer: boolean;
}

export async function fetchAdminCustomers(
  options: { search?: string; page?: number; limit?: number; payingOnly?: boolean } = {}
): Promise<{ customers: AdminCustomer[]; count: number; totalPages: number; page: number }> {
  const params = new URLSearchParams();
  if (options.search) params.set('search', options.search);
  if (options.page) params.set('page', String(options.page));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.payingOnly) params.set('payingOnly', '1');
  const query = params.toString();
  return getJson(`/api/admin/customers${query ? `?${query}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* Inventory (WooCommerce)                                            */
/* ------------------------------------------------------------------ */

export interface InventoryRow {
  id: string;
  parentId: number | null;
  name: string;
  sku: string | null;
  type: 'simple' | 'variation';
  tracksQuantity: boolean;
  quantity: number | null;
  stockStatus: 'in_stock' | 'out_of_stock' | 'on_backorder' | 'unknown';
  backorders: string | null;
  lowStockThreshold: number | null;
  lowStock: boolean;
  price: string | null;
}

export interface InventoryReport {
  rows: InventoryRow[];
  productsRead: number;
  tracksQuantities: boolean;
  missingCounts: number;
  outOfStock: number;
  lowStock: number;
  onBackorder: number;
  unexpanded: number;
  notes: string[];
}

export async function fetchInventory(): Promise<InventoryReport> {
  return getJson<InventoryReport>('/api/admin/inventory');
}

/* ------------------------------------------------------------------ */
/* WordPress content (posts, media, reviews)                          */
/* ------------------------------------------------------------------ */

export interface ContentCapability {
  canReadPublished: boolean;
  canReadDrafts: boolean;
  canModerate: boolean;
  canUpload: boolean;
  hasWooCredentials: boolean;
  hasOrigin: boolean;
  writeBlocker: string | null;
  origin: string;
}

export interface AdminPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  date: string | null;
  status: string | null;
  link: string | null;
}

export interface AdminMediaItem {
  id: number;
  title: string;
  alt: string | null;
  mime: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  thumbnail: string | null;
  date: string | null;
}

export interface AdminRating {
  productId: number;
  name: string;
  averageRating: number | null;
  ratingCount: number;
}

export interface AdminComment {
  id: number;
  author: string | null;
  date: string | null;
  content: string;
  type: string | null;
  post: number | null;
}

export interface WordPressContent {
  capability: ContentCapability;
  posts: { items: AdminPost[]; error: string | null } | null;
  media: { items: AdminMediaItem[]; error: string | null } | null;
  reviews:
    | {
        ratings: AdminRating[];
        unrated: number;
        error: string | null;
        approvedComments: { items: AdminComment[]; error: string | null } | null;
      }
    | null;
}

export async function fetchWordPressContent(
  options: { section?: 'all' | 'posts' | 'media' | 'reviews'; page?: number; search?: string } = {}
): Promise<WordPressContent> {
  const params = new URLSearchParams();
  if (options.section) params.set('section', options.section);
  if (options.page) params.set('page', String(options.page));
  if (options.search) params.set('search', options.search);
  const query = params.toString();
  return getJson(`/api/admin/content${query ? `?${query}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* Campaigns (the app's own store)                                    */
/* ------------------------------------------------------------------ */

export type CampaignStatus = 'draft' | 'ready' | 'scheduled' | 'running' | 'completed' | 'cancelled';

export interface AdminCampaign {
  id: string;
  name: string;
  goal: string;
  audience: string;
  brief: string;
  startsAt: string | null;
  endsAt: string | null;
  productIds: number[];
  couponCode: string | null;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignSaveResult {
  campaign: AdminCampaign;
  validation: { ok: boolean; problems: string[] };
  sendBlocker: string | null;
}

export interface CampaignList {
  campaigns: AdminCampaign[];
  unreadable: string[];
  sendBlocker: string | null;
}

export async function fetchCampaigns(): Promise<CampaignList> {
  return getJson<CampaignList>('/api/admin/campaigns');
}

export async function saveCampaign(
  input: Partial<AdminCampaign> & { status?: CampaignStatus }
): Promise<CampaignSaveResult> {
  return postJson<CampaignSaveResult>('/api/admin/campaigns', input);
}

export async function deleteCampaign(id: string): Promise<{ removed: boolean }> {
  return postJson<{ removed: boolean }>('/api/admin/campaigns', { action: 'delete', id });
}

/* ------------------------------------------------------------------ */
/* Integrations                                                       */
/* ------------------------------------------------------------------ */

export interface IntegrationStatus {
  id: string;
  label: string;
  state: 'CONNECTED' | 'NOT CONFIGURED' | 'INVALID' | 'OWNER ACTION REQUIRED';
  mode: 'TEST' | 'LIVE' | 'UNKNOWN' | null;
  source: 'console' | 'environment' | 'mixed' | 'none';
  detail: string;
  overridden: boolean;
}

export async function fetchIntegrationStatuses(
  probe = true
): Promise<{ integrations: IntegrationStatus[]; checkedAt: string }> {
  return getJson(`/api/admin/integrations${probe ? '' : '?probe=0'}`);
}

export async function testGemini(): Promise<{
  state: string;
  model: string;
  keySource: string;
  detail: string;
}> {
  const { gemini } = await postJson<{ gemini: { state: string; model: string; keySource: string; detail: string } }>(
    '/api/admin/integrations',
    { action: 'test-gemini' }
  );
  return gemini;
}

/* ------------------------------------------------------------------ */
/* Gemini SEO drafts                                                  */
/* ------------------------------------------------------------------ */

export interface SeoDraftField {
  value: string;
  blocked: Array<{ rule: string; match: string }>;
}

export interface SeoDraft {
  title: SeoDraftField;
  metaDescription: SeoDraftField;
  description: SeoDraftField;
  keywords: string[];
  model: string;
  warnings: string[];
}

export async function generateSeoDraft(input: {
  subject?: 'product' | 'category' | 'page';
  name: string;
  facts?: Record<string, string | null | undefined>;
  keywords?: string[];
}): Promise<SeoDraft> {
  const { draft } = await postJson<{ draft: SeoDraft }>('/api/admin/seo/generate', input);
  return draft;
}
