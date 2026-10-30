# Shippo packing rules (active products)

Live Shippo rates and labels use **approved box packing only**. A product with no packing rule cannot be priced by a carrier at checkout and cannot auto-create a label until a rule exists.

Both licks use the **same approved carton**, 10 × 10 × 6 inches. Only how many fit in it differs. The 30 lb block has a carton of its own.

## Approved products

| Product | Units per box | Box (L × W × H inches) | Unit weight |
|---------|---------------|-------------------------|-------------|
| 2 lb licks | 6 | 10 × 10 × 6 | 2 lb |
| 4 lb licks | 4 | 10 × 10 × 6 | 4 lb |
| 6 lb licks | 4 | 10 × 10 × 6 | 6 lb |
| 30 lb block | 1 | 8.5 × 7.5 × 6.5 | 30 lb |
| 3 lb fine grain pouches (incl. edible) | 6 | 10 × 10 × 6 | 3 lb |
| 6 lb fine grain pouches (incl. edible) | 3 | 10 × 10 × 6 | 6 lb |
| 1 lb jar fine grain edible | 9 | 10 × 10 × 6 | 1 lb |

## How matching works

Products are matched by **slug and name** (from the database) using rules in:

`src/lib/shippo/packing/rules.ts`

An exact slug in `SLUG_PACKING_RULE_IDS` wins and is the durable way to pin a listing to a rule; name patterns are the fallback for listings the store has not pinned.

| Product | How it is matched |
|---------|-------------------|
| 2 lb licks | slug `himalayan-salt-licks-horses`, or a name with `2 lb` + `lick` |
| 6 lb licks | a name with `6 lb` + `lick` |
| 30 lb block | slug `himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh`, or `30 lb` that is neither a pouch nor a jar |
| 6 lb pouches | slug `himalayan-rock-salt-6lbs-pouch`, or `6 lb` + `pouch` |

The 30 lb block is pinned by slug on purpose. Its published slug ends in `-bag-` even though the product is one 30 lb block, so a rule that read the word "bag" as evidence about what ships refused its own listing and left it to the weight-only fallback — which resolves it only while its WooCommerce weight happens to read 30.

Products without a match (e.g. 45 lb bags, generic listings without size) **do not** use Shippo parcel math.

## Multi-box orders

Quantity is split into full boxes per rule, and **every box is sent to Shippo as its own parcel**. Boxes are never summed into one heavier parcel: one 14 lb parcel is not the two boxes that actually ship, and carriers price the two differently.

- **7 × 2 lb licks** → 2 parcels, both **10 × 10 × 6**: **12 lb** (6 licks) + **2 lb** (1 lick)
- **5 × 6 lb licks** → 2 parcels, both **10 × 10 × 6**: **24 lb** (4 licks) + **6 lb** (1 lick)
- **2 × 30 lb blocks** → 2 parcels, both **8.5 × 7.5 × 6.5**: **30 lb** each, never one 60 lb parcel
- **1 × 2 lb + 1 × 6 lb** → 2 parcels: **10 × 10 × 6** at **2 lb**, and **10 × 10 × 6** at **6 lb**
- **7 × 2 lb + 5 × 6 lb** → 4 parcels: 12 lb + 2 lb + 24 lb + 6 lb. The two products are **not** mixed into one box yet, because no mixed-box rule has been approved.

A cart holding several products is packed **per product**, and there is no option on the rate request that merges the calculated boxes into one parcel. The collapse used to be reachable through a `consolidateParcels` flag; the flag and the function behind it are gone, because a merged parcel is a different (and on a carrier's weight band, a cheaper) quote than the boxes that really ship.

Each parcel is sent with its **actual** weight and the carton's dimensions. We do not send our own dimensional-weight figure: which of actual and dimensional weight a carrier bills on is the carrier's rule, so Shippo decides the billable weight, the service, the price and the transit estimate.

## Checkout behavior

- Supported cart only → live carrier rates from Shippo, one rate per box, summed per service  
- Unsupported product in cart → checkout cannot price the order and says so, and **no flat rate is substituted** for a live quote  
- A deployment with Shippo switched off has no carrier to ask, and prices delivery from the store's own flat table ($9.95 / $18.95 / free over $50). That is the only place those amounts apply now; there are no hand-written transit windows beside them  
- Admin label creation blocked for unsupported SKUs with a clear error  

## Adding a new SKU

1. Use a product **name or slug** that matches an existing rule pattern, **or**  
2. Add the slug to the rule’s `slugs` array in `rules.ts`, **or**  
3. Add a new entry to `ACTIVE_PACKING_RULES` (order matters — specific rules first)

Run `npm run check:packing` after changes.
