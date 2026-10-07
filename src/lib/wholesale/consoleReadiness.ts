/**
 * Console readiness — which wholesale screens still cannot answer, and what unblocks them.
 *
 * ## Why this exists
 *
 * The engine is deliberately forgiving: it quotes on a documented default carton profile,
 * falls back to the physical shipment threshold when no freight rate exists, and prices
 * nothing at all without an origin cost set. Availability is the right default, and the
 * wrong thing to leave unsaid — an owner looking at a screen has no way to tell which of
 * its inputs were never entered. This module measures exactly that, from the same
 * snapshot the screens read, so one computation serves the readiness screen and no screen
 * can claim the console is ready while a calculator is refusing to price.
 *
 * ## Measured, never estimated
 *
 * Every requirement is counted from records: how many cost profiles exist, how many
 * freight rates, how many products still run on a default packaging profile (through
 * `packagingReadiness`, which reads the engine's own `defaultsUsed` rather than guessing
 * from an almost-complete-looking profile). A record type with nothing stored is a count
 * of zero, not an assumption.
 *
 * ## What it deliberately does not cover
 *
 * Only data the owner enters is measured here. A screen blocked by something else — an
 * AI provider out of credit, a freight provider without an API key — is a configuration
 * or account problem with its own message on its own panel, and reporting it here as
 * "missing data" would send the owner to a form that cannot fix it.
 */

import type { WholesaleRow } from './store';
import { packagingReadiness } from './packagingReadiness';

export interface ConsoleRequirement {
  /** Stable id for the requirement, so a test and the screen agree on it. */
  key: string;
  /** The screen the owner fills in. */
  screen: string;
  /** That screen's console tab id, so the panel can offer a link straight to it. */
  tab: string;
  /** What is missing, measured from the records. */
  missing: string;
  /** The screens whose answer is incomplete until this is filled in. */
  blocks: string[];
  /** Exactly what to enter, in the order the form asks for it. */
  toEnter: string[];
  /** A limitation of the form itself, when there is one. */
  caveat?: string;
}

export interface ConsoleReadiness {
  requirements: ConsoleRequirement[];
  /** What already works, so the screen is not only a list of problems. */
  working: string[];
  /** Products running on the default packaging profile, against the active catalogue. */
  packaging: { complete: number; total: number };
  /** True when nothing is missing, i.e. every screen can give a complete answer. */
  complete: boolean;
}

export interface ConsoleReadinessInput {
  products: WholesaleRow[];
  costProfiles: WholesaleRow[];
  freightRates: WholesaleRow[];
  containerProfiles: WholesaleRow[];
  accounts: WholesaleRow[];
  freightProvider: { provider: string; ready: boolean; missing: string[] } | null;
}

/** An inactive product is out of the catalogue, so its packaging is not outstanding. */
function isActive(row: WholesaleRow): boolean {
  return row.active !== false && row.active !== 0;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * The readiness of the whole console, from one workspace snapshot.
 *
 * Ordered by what unblocks the most: a box to measure against, then a cost set to price
 * with, then the rates, then the accuracy of the numbers, then the customer a quotation
 * is saved for.
 */
export function consoleReadiness(input: ConsoleReadinessInput): ConsoleReadiness {
  const products = input.products.filter(isActive);
  const items = products.map((row) => ({ row, readiness: packagingReadiness(row.packaging) }));
  const outstanding = items.filter((item) => item.readiness.status !== 'COMPLETE');
  const complete = items.length - outstanding.length;

  // The fields still blank, named once each, in the order the form shows them. Taken from
  // the readiness check rather than a second list here, so a product that is missing only
  // its unit dimensions does not produce a list of every field in the profile.
  const missingPackagingLabels = [...new Set(outstanding.flatMap((item) => item.readiness.missingLabels))];

  const requirements: ConsoleRequirement[] = [];

  // A container profile is the one record nothing can stand in for: every load screen
  // needs a box to measure the pallets against.
  if (input.containerProfiles.length === 0) {
    requirements.push({
      key: 'container-profiles',
      screen: 'Container profiles',
      tab: 'containers',
      missing: 'No container profile is configured, so a load cannot be measured against a box.',
      blocks: [
        'Pallet calculator (how the load sits in a container)',
        'Container & quote builder',
        'The shipment recommendation',
      ],
      toEnter: [
        'A code and a name — for example 20FT, "20ft standard"',
        'Usable volume in CBM',
        'Maximum cargo weight in kg',
        'Inside length, width and height in cm, so the pallet capacity can be counted',
      ],
    });
  }

  if (input.costProfiles.length === 0) {
    requirements.push({
      key: 'cost-profiles',
      screen: 'Cost profiles',
      tab: 'costs',
      missing: 'No cost profile is configured, so nothing can be priced.',
      blocks: [
        'Container & quote builder (a priced quotation)',
        'Pallet calculator (goods cost)',
        'Quotations (a quote that can be saved or sent)',
      ],
      toEnter: [
        'A name for the profile',
        'The currency it is quoted in',
        'The origin charges the form asks for — inland transport, stuffing, documentation, terminal, customs handling and the rest',
        "Each product's ex-factory cost under Products & pricing — a product left at zero is priced as free",
      ],
    });
  }

  // A stored rate is only required when nothing else can price the lane: with a live
  // provider connected the calc can fetch one, so this is reported as working instead.
  if (input.freightRates.length === 0 && input.freightProvider?.ready !== true) {
    requirements.push({
      key: 'freight-rates',
      screen: 'Ocean freight',
      tab: 'freight',
      missing: 'No ocean freight rate is stored, and no live provider is connected to fetch one.',
      blocks: [
        'Container & quote builder (the ocean leg of a landed cost)',
        'The shipment recommendation (LCL versus FCL economics)',
      ],
      toEnter: [
        'Provider or forwarder',
        'Origin port and destination port',
        'Container — LCL, 20FT, 40FT or 40HC. An LCL rate is a per-shipment price, not a box',
        'Base ocean freight, and the currency it is quoted in',
        'Optional: valid-until date, transit days, the forwarder’s reference',
      ],
    });
  }

  if (outstanding.length > 0) {
    requirements.push({
      key: 'packaging',
      screen: 'Products & pricing',
      tab: 'products',
      missing: `${outstanding.length} of ${items.length} ${plural(items.length, 'product', 'products')} still ${plural(
        outstanding.length,
        'uses',
        'use'
      )} the default carton and pallet profile, so its weights and pallet counts are estimates.`,
      blocks: [
        'Pallet calculator (kilos and pallets from the owner’s own figures)',
        'Container & quote builder',
        'Quotations (the weights a buyer reads)',
      ],
      toEnter: [
        'Open each product below and fill its Carton & pallet profile:',
        ...missingPackagingLabels,
      ],
    });
  }

  if (input.accounts.length === 0) {
    requirements.push({
      key: 'wholesale-accounts',
      screen: 'Wholesale accounts',
      tab: 'accounts',
      missing: 'No wholesale account exists, so a quotation has no customer to be saved for.',
      blocks: ['Quotations (saving a quote)', 'Container & quote builder (saving a quote)'],
      toEnter: ['Approve an application on the Applications tab, or create the buyer account here'],
    });
  }

  const working: string[] = [];
  if (input.containerProfiles.length > 0) {
    working.push(`Container profiles — ${input.containerProfiles.length} configured`);
  }
  if (input.costProfiles.length > 0) {
    working.push(`Cost profiles — ${input.costProfiles.length} configured`);
  }
  if (input.freightRates.length > 0) {
    working.push(
      `Ocean freight — ${input.freightRates.length} manual ${plural(input.freightRates.length, 'rate', 'rates')} stored`
    );
  } else if (input.freightProvider?.ready) {
    working.push('Ocean freight — priced from the connected live provider');
  }
  if (items.length > 0 && outstanding.length === 0) {
    working.push('Packaging — every active product has its own measured figures');
  }
  if (input.accounts.length > 0) {
    working.push(
      `Wholesale accounts — ${input.accounts.length} ${plural(input.accounts.length, 'account', 'accounts')} configured`
    );
  }
  working.push('Applications, Suppliers & origins, Ports & charges and the Audit trail need no owner data');

  return {
    requirements,
    working,
    packaging: { complete, total: items.length },
    complete: requirements.length === 0,
  };
}
