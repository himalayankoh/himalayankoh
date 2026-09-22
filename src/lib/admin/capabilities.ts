/**
 * What each admin capability is waiting for.
 *
 * Every module that cannot act yet used to restate the same paragraphs — "needs
 * a WooCommerce REST key", "needs a Gemini key" — in its own words, so the same
 * requirement read differently on every screen and drifted as the credential
 * situation changed. This file is the single owner of that text.
 *
 * The rule it exists to enforce: a module never renders a figure it cannot
 * source. A capability that is not connected produces a *named requirement*
 * here, and the screen renders that requirement, not a zero or an empty table
 * that a reviewer would read as "nothing to show".
 *
 * Status is deliberately not asserted here. The only fact this module derives is
 * the catalog source, which is a public build flag and therefore truthful in the
 * browser; everything else is "what would have to exist", which is true whatever
 * the deployment's configuration happens to be. A live connection probe belongs
 * server-side, next to the credential it inspects.
 */

import { backendConfig } from '../backend/config';

export type CapabilityId =
  /* Commerce */
  | 'woo-catalog-read'
  | 'woo-rest-read'
  | 'woo-write'
  /* Intelligence */
  | 'ai-text'
  | 'ai-vision'
  /* Reach */
  | 'email-send'
  | 'traffic-analytics'
  | 'search-console'
  | 'adsense'
  /* Operations */
  | 'payments'
  | 'shipping-labels'
  | 'crm-sync'
  | 'supplier-feed';

export interface Capability {
  id: CapabilityId;
  /** Chip-sized name. */
  label: string;
  /** What the console can do once this exists — one sentence, no promise of a date. */
  enables: string;
  /** Exactly what has to be provided, and by whom. */
  requires: string;
}

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  'woo-catalog-read': {
    id: 'woo-catalog-read',
    label: 'Catalog read',
    enables: 'Products, categories and the listing state that the storefront actually serves.',
    requires:
      'A WordPress origin (WORDPRESS_BASE_URL), so the admin and the storefront read one catalog.',
  },
  'woo-rest-read': {
    id: 'woo-rest-read',
    label: 'WooCommerce REST read',
    enables: 'Orders, customers, coupons, reviews, payment gateways and unit stock counts.',
    // The exact variable names live in the server-only credentials module and in
    // the setup docs. They are deliberately not spelled out here: this record is
    // rendered in the browser, and a bundle naming the credential variables is
    // how the next component ends up reading the source directly.
    requires:
      'A WooCommerce REST API key with read scope on the staging store, configured server-side for this deployment — never in a public variable, and never the production key.',
  },
  'woo-write': {
    id: 'woo-write',
    label: 'WooCommerce write',
    enables: 'Creating and editing products, prices, stock, categories and coupons from the console.',
    requires:
      'The same key with read/write scope on the staging store. Every write on the products console goes to the store; nothing falls back to another database.',
  },
  'ai-text': {
    id: 'ai-text',
    label: 'AI text model',
    enables: 'SEO titles, meta descriptions, product copy and keyword or internal-link suggestions.',
    requires:
      'A server-side model key — GEMINI_API_KEY for the SEO centre, or OPENROUTER_API_KEY for the assistant already wired at /api/openrouter. Suggestions are reviewed by hand before anything is saved.',
  },
  'ai-vision': {
    id: 'ai-vision',
    label: 'AI image model',
    enables: 'Alt text and image descriptions written from the image itself.',
    requires: 'A vision-capable model key, server-side, in addition to the text key.',
  },
  'email-send': {
    id: 'email-send',
    label: 'Email sending',
    enables: 'Order mail and campaign mail sent from the store’s own domain.',
    requires:
      'RESEND_API_KEY and a verified sending domain (RESEND_FROM). Addresses are collected today through /api/newsletter; nothing bulk-sends until the domain is verified.',
  },
  'traffic-analytics': {
    id: 'traffic-analytics',
    label: 'Traffic analytics',
    enables: 'Sessions, channels, conversion rate and campaign attribution for the storefront.',
    requires:
      'An analytics property for himalayankoh.com and a server-side read credential — or a self-hosted event sink. Page-view numbers are not estimated from anything else.',
  },
  'search-console': {
    id: 'search-console',
    label: 'Search Console',
    enables: 'Index coverage, query performance, sitemap submission and soft-404 detection.',
    requires:
      'The owner verifies himalayankoh.com in Google Search Console and grants read access to a service account. The preview host is never submitted for indexing.',
  },
  adsense: {
    id: 'adsense',
    label: 'AdSense',
    enables: 'Ad placements on public content pages, reserved with fixed dimensions so they add no layout shift.',
    requires:
      'An AdSense publisher ID and ads.txt for himalayankoh.com. Never rendered on /admin, /login, /account, /cart or /checkout.',
  },
  payments: {
    id: 'payments',
    label: 'Payments',
    enables: 'Live card checkout and payment status per order.',
    requires:
      'Stripe keys for the intended mode, or WooCommerce payment gateways on staging. The console reports which mode is configured and never places a real charge during development.',
  },
  'shipping-labels': {
    id: 'shipping-labels',
    label: 'Shipping labels',
    enables: 'Rate quotes, address validation and label purchase from an order.',
    requires: 'A Shippo key plus the warehouse address the labels ship from.',
  },
  'crm-sync': {
    id: 'crm-sync',
    label: 'CRM sync',
    enables: 'Leads and contact form submissions flowing both ways with the CRM.',
    requires: 'A HubSpot private-app token, and a decision on which store events are worth syncing.',
  },
  'supplier-feed': {
    id: 'supplier-feed',
    label: 'Supplier feed',
    enables: 'Cost, lead time and stock by supplier, so a listing’s real margin is visible.',
    requires:
      'Supplier records for Himalayan Koh’s own sourcing. Third-party dropship feeds are not applicable: the salt is packed and shipped from the store’s own warehouse.',
  },
};

/** The requirement sentences for a set of capabilities — feeds `AdminPendingPanel`. */
export function capabilityRequirements(ids: CapabilityId[]): string[] {
  return ids.map((id) => `${CAPABILITIES[id].requires}`);
}

/** The "once this exists" sentences — feeds the other column of the same panel. */
export function capabilityEnables(ids: CapabilityId[]): string[] {
  return ids.map((id) => `${CAPABILITIES[id].label}: ${CAPABILITIES[id].enables}`);
}

/** Human label for the catalog source the admin is reading right now. */
export function catalogSourceLabel(): string {
  return 'WooCommerce';
}

/** True when the admin and the storefront are reading the same catalog. */
export function isCatalogSourceShared(): boolean {
  return Boolean(backendConfig.wordpressBaseUrl);
}
