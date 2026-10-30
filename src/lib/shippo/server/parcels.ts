import type { ShippoParcelInput } from '../types';

export function shippoParcelPayload(parcel: ShippoParcelInput) {
  // The carrier is told the box and the weight of the parcel as it goes out, and it
  // decides the billable weight from there.
  //
  // This used to send `weightLbs`, which is max(actual weight, dimensional weight).
  // Applying that rule ourselves is not ours to apply, and it made a light parcel to
  // a wrong one: a single 2 lb lick in a 10 x 10 x 6 box has a DIM weight of 3.61 lb, so
  // the carrier was asked to price 3.61 lb for a parcel that weighs 2 lb. The owner's
  // rule is that Shippo and the carrier decide billable weight, service and price.
  const weightLbs = parcel.actualWeightLbs ?? parcel.weightLbs;
  return {
    length: String(parcel.lengthIn),
    width: String(parcel.widthIn),
    height: String(parcel.heightIn),
    distance_unit: 'in',
    weight: String(weightLbs),
    mass_unit: 'lb',
  };
}
