# Shippo packing rules (active products)

Live Shippo rates and labels use **approved box packing only**. A product with no packing rule cannot be priced by a carrier at checkout and cannot auto-create a label until a rule exists.

Both licks use the **same approved carton**, 10 × 10 × 6 inches. Only how many fit in it differs.

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

| `himalayan-salt-licks-horses` | 2 lb licks (default catalog listing) |
- `himalayan-rock-salt-6lbs-pouch` → 6 lb pouch rule  
- Names containing `2 lb` + `lick` → 2 lb lick rule  

Products without a match (e.g. 45 lb bags, generic listings without size) **do not** use Shippo parcel math.

## Multi-box orders

Quantity is split into full boxes per rule, and **every box is sent to Shippo as its own parcel**. Boxes are never summed into one heavier parcel: one 14 lb parcel is not the two boxes that actually ship, and carriers price the two differently.

- **7 × 2 lb licks** → 2 parcels, both **10 × 10 × 6**: **12 lb** (6 licks) + **2 lb** (1 lick)
- **5 × 6 lb licks** → 2 parcels, both **10 × 10 × 6**: **24 lb** (4 licks) + **6 lb** (1 lick)
- **7 × 2 lb + 5 × 6 lb** → 4 parcels: 12 lb + 2 lb + 24 lb + 6 lb. The two products are **not** mixed into one box yet, because no mixed-box rule has been approved.

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
