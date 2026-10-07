export interface ShippoAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ShippoParcelInput {
  /**
   * Weight of this one box in pounds. The packer states it in `actualWeightLbs` below.
   *
   * Kept as the fallback for a parcel built without one. This is not a billable weight:
   * which of actual weight and dimensional weight a carrier charges on is the carrier's
   * rule, and applying it here would quote a parcel heavier than the one being shipped.
   */
  weightLbs: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  /** What the carrier is told. One box, one parcel, this weight. */
  actualWeightLbs?: number;
  /**
   * Our own DIM estimate = L × W × H / DIM_DIVISOR, kept for reference so a carrier's
   * own billable weight can be explained after the fact. Never sent, and never billed
   * by us.
   */
  dimWeightLbs?: number;
}

export interface ShippoRate {
  objectId: string;
  amount: number;
  currency: string;
  provider: string;
  serviceName: string;
  estimatedDays: number | null;
}

export interface ShippoLabelResult {
  transactionId: string;
  trackingNumber: string;
  labelUrl: string;
  trackingUrl: string | null;
  carrier: string;
  serviceName: string;
}

export interface CheckoutShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface RatesLineItem {
  productId?: string;
  quantity: number;
  weightLbs?: number;
}
