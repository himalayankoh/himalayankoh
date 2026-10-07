/**
 * Sanity checks for Shippo packing rules (no Shippo API required).
 * Run: npm run check:packing
 */

const BOX_10_10_6 = { lengthIn: 10, widthIn: 10, heightIn: 6 };
const BOX_30 = { lengthIn: 8.5, widthIn: 7.5, heightIn: 6.5 };

const RULES = [
  { id: 'jar-1lb', unit: 1, perBox: 9, box: BOX_10_10_6 },
  { id: 'lick-2lb', unit: 2, perBox: 6, box: BOX_10_10_6 },
  { id: 'lick-4lb', unit: 4, perBox: 4, box: BOX_10_10_6 },
  // Both licks use the same approved 10 x 10 x 6 parcel; only the count per box differs.
  { id: 'lick-6lb', unit: 6, perBox: 4, box: BOX_10_10_6 },
  { id: 'block-30lb', unit: 30, perBox: 1, box: BOX_30 },
  { id: 'pouch-3lb', unit: 3, perBox: 6, box: BOX_10_10_6 },
  { id: 'pouch-6lb', unit: 6, perBox: 3, box: BOX_10_10_6 },
];

function buildParcels(quantity, rule) {
  const parcels = [];
  let remaining = quantity;
  while (remaining > 0) {
    const units = Math.min(remaining, rule.perBox);
    parcels.push({ ...rule.box, weightLbs: units * rule.unit });
    remaining -= units;
  }
  return parcels;
}

let failed = 0;

function assert(name, condition) {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    failed += 1;
  } else {
    console.log(`ok: ${name}`);
  }
}

// 7 × 2 lb licks → 2 boxes (6 + 1)
const lick2 = buildParcels(7, RULES[1]);
assert('7×2lb licks → 2 parcels', lick2.length === 2);
assert('7×2lb first box weight 12lb', lick2[0].weightLbs === 12);
assert('7×2lb second box weight 2lb', lick2[1].weightLbs === 2);

// 6 × 1 lb jars → 1 box
const jars = buildParcels(6, RULES[0]);
assert('6×1lb jars → 1 parcel', jars.length === 1);
assert('6×1lb jar box dims 10×10×6', jars[0].lengthIn === 10 && jars[0].heightIn === 6);

// 10 × 1 lb jars → 2 boxes (9 + 1)
const jars10 = buildParcels(10, RULES[0]);
assert('10×1lb jars → 2 parcels', jars10.length === 2);
assert('10×1lb first box 9 units', jars10[0].weightLbs === 9);

// 6 lb lick box size — the owner's approved standard parcel, same as the 2 lb lick
const lick6 = buildParcels(4, RULES[3]);
assert('4×6lb licks → 1 parcel', lick6.length === 1);
assert(
  '6lb lick box 10×10×6',
  lick6[0].lengthIn === 10 && lick6[0].widthIn === 10 && lick6[0].heightIn === 6,
);
assert('2lb and 6lb licks share one box', RULES[1].box.widthIn === RULES[3].box.widthIn && RULES[1].box.heightIn === RULES[3].box.heightIn);

// 5 × 6 lb licks → 2 boxes (4 + 1)
const lick6Split = buildParcels(5, RULES[3]);
assert('5×6lb licks → 2 parcels', lick6Split.length === 2);
assert('5×6lb first box weight 24lb', lick6Split[0].weightLbs === 24);
assert('5×6lb second box weight 6lb', lick6Split[1].weightLbs === 6);

// 30 lb block
const block = buildParcels(2, RULES[4]);
assert('2×30lb blocks → 2 parcels', block.length === 2);
assert('30lb block dims', block[0].lengthIn === 8.5);

if (failed > 0) {
  console.error(`\n${failed} packing check(s) failed.`);
  process.exit(1);
}

console.log('\nAll Shippo packing sanity checks passed.');
