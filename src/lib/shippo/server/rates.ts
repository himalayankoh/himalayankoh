import { resolveShippoFromAddress } from '../config';
import type { CheckoutShippingAddress, RatesLineItem, ShippoRate } from '../types';
import { enrichRatesLineItems } from '../packing/enrichLineItems';
import { buildConsolidatedParcelFromPackingLineItems, buildParcelsFromPackingLineItems } from '../packing/buildParcels';
import { shippoAddressPayload, toShippoAddress } from './addresses';
import { shippoRequest } from './client';
import { shippoParcelPayload } from './parcels';

interface ShippoRateResponse {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel?: { name?: string; token?: string };
  estimated_days?: number | null;
  attributes?: string[];
}

interface ShippoShipmentMessage {
  code: string;
  source: string;
  text: string;
}

interface ShippoShipmentResponse {
  rates: ShippoRateResponse[];
  messages?: ShippoShipmentMessage[];
}

function mapRate(rate: ShippoRateResponse): ShippoRate {
  return {
    objectId: rate.object_id,
    amount: Number(rate.amount),
    currency: rate.currency || 'USD',
    provider: rate.provider,
    serviceName: rate.servicelevel?.name || rate.provider,
    estimatedDays: rate.estimated_days ?? null,
  };
}

/**
 * Joins per-parcel rate object IDs into one composite checkout rate ID.
 * Shippo object IDs are hex strings, so '+' is a safe separator.
 */
export const MULTI_RATE_ID_SEPARATOR = '+';

export function splitShippoRateIds(rateId: string): string[] {
  return rateId.split(MULTI_RATE_ID_SEPARATOR).filter(Boolean);
}

function isUsableRate(rate: ShippoRateResponse): boolean {
  return Number(rate.amount) > 0 && (rate.currency || 'USD').toUpperCase() === 'USD';
}

function rateServiceKey(rate: ShippoRateResponse): string {
  return `${rate.provider}|${rate.servicelevel?.token || rate.servicelevel?.name || ''}`;
}

function sortRates(rates: ShippoRate[]): ShippoRate[] {
  return rates.sort((a, b) => {
    const aUsps = /usps/i.test(a.provider) ? 0 : 1;
    const bUsps = /usps/i.test(b.provider) ? 0 : 1;
    if (aUsps !== bUsps) return aUsps - bUsps;
    return a.amount - b.amount;
  });
}

/**
 * USPS does not rate multi-parcel shipments, so each box is rated as its own
 * shipment and amounts are summed per carrier service available for ALL boxes.
 */
function combineParcelRates(shipments: ShippoShipmentResponse[]): ShippoRate[] {
  const rateMaps = shipments.map((shipment) => {
    const byService = new Map<string, ShippoRateResponse>();
    for (const rate of shipment.rates || []) {
      if (!isUsableRate(rate)) continue;
      const key = rateServiceKey(rate);
      const existing = byService.get(key);
      if (!existing || Number(rate.amount) < Number(existing.amount)) {
        byService.set(key, rate);
      }
    }
    return byService;
  });

  const [first, ...rest] = rateMaps;
  if (!first) return [];

  const combined: ShippoRate[] = [];
  for (const [key, baseRate] of first) {
    const group = [baseRate];
    const availableForAllBoxes = rest.every((byService) => {
      const match = byService.get(key);
      if (match) group.push(match);
      return Boolean(match);
    });
    if (!availableForAllBoxes) continue;

    let estimatedDays: number | null = null;
    for (const rate of group) {
      if (rate.estimated_days != null) {
        estimatedDays = estimatedDays == null ? rate.estimated_days : Math.max(estimatedDays, rate.estimated_days);
      }
    }

    combined.push({
      objectId: group.map((rate) => rate.object_id).join(MULTI_RATE_ID_SEPARATOR),
      amount: Math.round(group.reduce((sum, rate) => sum + Number(rate.amount), 0) * 100) / 100,
      currency: 'USD',
      provider: baseRate.provider,
      serviceName: baseRate.servicelevel?.name || baseRate.provider,
      estimatedDays,
    });
  }

  return combined;
}

export async function fetchShippoRates(params: {
  toAddress: CheckoutShippingAddress;
  email?: string;
  lineItems: RatesLineItem[];
  consolidateParcels?: boolean;
}): Promise<ShippoRate[]> {
  const fromAddress = await resolveShippoFromAddress();
  const to = toShippoAddress(params.toAddress, params.email);
  const packingItems = await enrichRatesLineItems(params.lineItems);
  const parcelInputs = params.consolidateParcels
    ? buildConsolidatedParcelFromPackingLineItems(packingItems)
    : buildParcelsFromPackingLineItems(packingItems);

  const addressFrom = shippoAddressPayload(fromAddress);
  const addressTo = shippoAddressPayload(to);

  // One shipment per box: USPS rejects multi-parcel shipments and boxes over
  // 70 lbs, so each box gets its own rate and amounts are summed per service.
  const shipments = await Promise.all(
    parcelInputs.map((parcel) =>
      shippoRequest<ShippoShipmentResponse>('/shipments/', {
        method: 'POST',
        body: {
          address_from: addressFrom,
          address_to: addressTo,
          parcels: [shippoParcelPayload(parcel)],
          async: false,
        },
      }),
    ),
  );

  const rates =
    shipments.length === 1
      ? (shipments[0].rates || []).map(mapRate).filter((rate) => rate.amount > 0 && rate.currency.toUpperCase() === 'USD')
      : combineParcelRates(shipments);

  if (rates.length === 0) {
    for (const shipment of shipments) {
      if (shipment.messages?.length || (shipment.rates || []).length > 0) {
        console.warn(
          '[Shippo] Shipment returned no usable USD rates. Raw rate count:',
          (shipment.rates || []).length,
          'Messages:',
          JSON.stringify(shipment.messages ?? []),
        );
      }
    }
  }

  return sortRates(rates).slice(0, 8);
}

export async function fetchShippoRatesForOrder(params: {
  email: string;
  shippingAddress: CheckoutShippingAddress;
  lineItems: RatesLineItem[];
  consolidateParcels?: boolean;
}): Promise<ShippoRate[]> {
  return fetchShippoRates({
    toAddress: params.shippingAddress,
    email: params.email,
    lineItems: params.lineItems,
    consolidateParcels: params.consolidateParcels,
  });
}

export function pickRateForShippingMethod(
  rates: ShippoRate[],
  shippingMethod: 'standard' | 'expedited',
  preferredRateId?: string | null
): ShippoRate | null {
  if (rates.length === 0) return null;

  if (preferredRateId) {
    const match = rates.find((rate) => rate.objectId === preferredRateId);
    if (match) return match;
  }

  if (shippingMethod === 'expedited') {
    const expedited = rates.find((rate) =>
      /priority|express|2.?day|overnight|next|3.?day/i.test(rate.serviceName)
    );
    if (expedited) return expedited;
    return rates[Math.min(1, rates.length - 1)] || rates[0];
  }

  const standard = rates.find((rate) =>
    /ground|parcel|standard|advantage|usps/i.test(`${rate.provider} ${rate.serviceName}`)
  );
  return standard || rates[0];
}

/** Pick a rate for label purchase — USPS first, then cheapest available. */
export function pickRateForLabelPurchase(
  rates: ShippoRate[],
  shippingMethod: 'standard' | 'expedited',
): ShippoRate | null {
  if (rates.length === 0) return null;

  const uspsRates = rates.filter((rate) => /usps/i.test(rate.provider));
  if (uspsRates.length > 0) {
    return pickRateForShippingMethod(uspsRates, shippingMethod);
  }

  return pickRateForShippingMethod(rates, shippingMethod);
}

/** Ordered rate IDs to try when purchasing a label. */
export function pickRateCandidatesForLabel(
  rates: ShippoRate[],
  shippingMethod: 'standard' | 'expedited',
): string[] {
  if (rates.length === 0) return [];

  const ids = new Set<string>();
  const add = (rate: ShippoRate | null | undefined) => {
    if (rate?.objectId) ids.add(rate.objectId);
  };

  add(pickRateForLabelPurchase(rates, shippingMethod));

  for (const rate of rates) {
    if (/usps/i.test(rate.provider)) add(rate);
  }
  for (const rate of rates) {
    if (/ground|advantage|parcel select|media mail/i.test(`${rate.provider} ${rate.serviceName}`)) {
      add(rate);
    }
  }
  for (const rate of rates) {
    add(rate);
  }

  return [...ids];
}
