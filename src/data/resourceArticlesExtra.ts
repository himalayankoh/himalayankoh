import type { ResourceArticle } from './resources';

/**
 * Additional editorial guides.
 *
 * These exist for one reason: the AdSense review of himalayankoh.com needs a site
 * with substantive, original content, not a catalogue of thin product pages. Each
 * guide below is written to stand on its own — real management detail, cited
 * extension and reference material, no health claims — and links only to products
 * that are actually in the active catalogue (see `lib/resources/relatedProducts`,
 * whose test pins every slug in this file).
 *
 * They are spread into `RESOURCE_ARTICLES`, so the sitemap, the author pages, the
 * resource centre listing and the Article JSON-LD pick them up without any further
 * wiring.
 */
export const EXTRA_RESOURCE_ARTICLES: ResourceArticle[] = [
  {
    id: 'res-13',
    slug: 'free-choice-salt-feeding-schedule-for-livestock',
    title: 'Free-Choice Salt Feeding: Building a Workable Schedule',
    category: 'Livestock & Equine',
    readTime: '8 min read',
    publishedAt: '2026-11-08T09:00:00Z',
    updatedAt: '2026-11-08T09:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'How to turn "keep salt out for the herd" into a schedule a farm can actually run: placement, refill triggers, seasonal adjustment and the records worth keeping.',
    metaDescription:
      'A practical free-choice salt schedule for cattle, horses and small ruminants: placement, refill triggers, seasonal intake changes and simple record keeping.',
    featuredImage: '/images/products/bowl-of-salt.jpg',
    relatedProductSlugs: [
      'himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh',
      'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh',
    ],
    relatedArticleSlugs: [
      'salt-block-vs-loose-salt-for-livestock',
      'livestock-salt-placement-and-weather-protection',
      'salt-needs-for-cattle-practical-farm-guide',
    ],
    sources: [
      { title: 'Salt and Trace Mineral Supplementation for Grazing Cattle', publication: 'University of Nebraska–Lincoln Extension (EC288)', year: '2020' },
      { title: 'Nutrient Requirements of Beef Cattle: Eighth Revised Edition', publication: 'National Academy of Sciences, Engineering, and Medicine', year: '2016' },
      { title: 'Feeding Salt to Livestock', publication: 'Oklahoma Cooperative Extension Service', year: '2019' },
    ],
    sections: [
      {
        heading: 'Why a schedule beats an intention',
        body: [
          'Almost every livestock operation intends to keep salt in front of the herd at all times. Far fewer can say, on any given morning, when the last block was replaced or how much loose salt went out this month. The gap between the intention and the practice is where most salt programmes quietly fail — an empty station for a week in July, a block that sat in standing water, a loose feeder that nobody refilled because it was on the far side of the rotation.',
          'A schedule does not need software. It needs three decisions made once — where the salt lives, what "needs a refill" looks like, and who checks it — plus a note of when each refill happened. That is enough to spot a station that is being used twice as fast as its neighbour, which is usually a placement problem rather than a herd problem.',
        ],
      },
      {
        heading: 'Placement: the decision that sets intake',
        body: [
          'Salt is a tool for moving animals around a pasture as much as it is a nutrient. Stations placed near water and shade get heavy traffic; stations placed on the far side of a paddock pull grazing pressure into ground that would otherwise be under-used. Neither is wrong, but the two produce very different refill rates, and comparing them without knowing the placement is how a normal difference starts to look like a disorder.',
          'Keep stations off bare dirt where they hold moisture, and give loose salt a covered feeder. A block that sits in a puddle dissolves at the base and can collapse; a loose feeder without a hood turns into brine after one storm. If the pasture has no natural shelter, a three-sided shed or a simple hooded tub is the whole installation.',
          'Distance from water matters too. Salt placed right beside a trough concentrates animals in one corner of the field, which shows up later as a bare, muddy patch and uneven grazing. A hundred to three hundred yards of separation spreads the traffic without making the station hard to find.',
        ],
      },
      {
        heading: 'Refill triggers and seasonal adjustment',
        body: [
          'Set the refill trigger by what the animal sees, not by the calendar: a block worn to a thin wafer, or a loose feeder below roughly a quarter full, is the signal. Fixed monthly refills tend to over-supply in cool weather and run dry in the first hot week, when intake rises and the herd is least likely to be checked.',
          'Intake moves with temperature, lactation, forage moisture and how much time the herd spends near the station. A sudden jump in consumption is not automatically a problem — a heat wave will do it — but a jump that persists after the weather breaks is worth a look at water access, forage changes and whether a neighbouring station has gone empty.',
          'Write the refill date and the amount on the same page every time. Four weeks of that record turns guesswork into a pattern, and the pattern is what tells you whether the next change you make actually helped.',
        ],
      },
      {
        heading: 'Records worth keeping',
        body: [
          'A single page per pasture is enough: date, station, product, amount added, and one short note on condition — clean, wet, contaminated, moved. That is four columns and it answers the questions that come up later: how long a 30 lb block lasts this herd, whether the wet-season station is being wasted, and whether the last change in placement changed anything measurable.',
          'Water is part of the record too. Salt without continuous access to clean water is not a free-choice programme, it is a risk. If a station and a water source are both being refilled on the same visit, note that as well — it keeps the two habits tied together.',
        ],
      },
    ],
  },
  {
    id: 'res-14',
    slug: 'storing-bulk-himalayan-salt-bags-correctly',
    title: 'Storing Bulk Himalayan Salt Bags Without Losing Product',
    category: 'Bulk & Storage',
    readTime: '7 min read',
    publishedAt: '2026-11-08T09:10:00Z',
    updatedAt: '2026-11-08T09:10:00Z',
    authorId: 'editorial-board',
    reviewerId: 'sourcing-team',
    summary:
      'A 45 lb bag of rock salt does not spoil, but it can absolutely be wasted. Pallet, floor, humidity and rotation practice for bulk salt in a working barn or stockroom.',
    metaDescription:
      'How to store bulk Himalayan pink salt bags: pallet stacking, humidity control, floor contact, rotation and checking a delivery before it goes into the barn.',
    featuredImage: '/images/products/bowl-of-salt.jpg',
    relatedProductSlugs: ['bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh'],
    relatedArticleSlugs: [
      'salt-block-vs-loose-salt-for-livestock',
      'free-choice-salt-feeding-schedule-for-livestock',
      'what-trace-minerals-in-himalayan-salt-actually-mean',
    ],
    sources: [
      { title: 'Storage of Salt and Salt-Based Products', publication: 'The Salt Institute Technical Briefs' },
      { title: 'Materials Handling and Storage', publication: 'US Department of Labor, OSHA Publication 3221', year: '2002' },
    ],
    sections: [
      {
        heading: 'Salt is stable; the bag is not',
        body: [
          'Rock salt does not rot, and a sealed bag left in a dry stockroom will be the same product next season. What fails is everything around it: paper or woven bags wick moisture from a concrete floor, pallets absorb spills, and a torn corner turns a 45 lb bag into a permanent pile on the ground that nobody wants to shovel back into anything.',
          'So the storage question is not "how long will it keep" but "how much of it will still be in a bag when we need it". That reframing is useful, because the fixes are cheap and boring: get it off the floor, keep it dry, keep it out of the sun, and know which bag is oldest.',
        ],
      },
      {
        heading: 'Floor, pallet and stack',
        body: [
          'Concrete is a sponge for ground moisture and it moves that moisture into anything porous that touches it for long enough. A pallet breaks the contact. In a damp barn, a plastic pallet or a sheet of heavy polythene under a wooden pallet is better still, because wood itself will hold water.',
          'Stack bags flat and square, two or three high at most, with the seams facing inward. A tall stack of soft bags leans, and a leaning stack tears at the bottom corner — which is exactly where the product ends up on the floor. Keeping the stack away from walls gives air a path and makes it possible to see a leak before it becomes a stain.',
          'If the space is shared with feed, fertiliser or anything with a strong smell, keep the salt on its own pallet. Salt picks up odours readily, and a bag that has spent a month next to treated seed is not something to put in a feed room without thinking about it.',
        ],
      },
      {
        heading: 'Humidity, heat and sunlight',
        body: [
          'Salt is hygroscopic: in humid air the surface of the crystal draws moisture and the bag feels damp, and in a closed container that moisture can pool at the bottom. Ventilation matters more than heating. A stockroom with airflow and a dry floor will outperform a sealed room with a heater running.',
          'Direct sun is the other slow loss. Ultraviolet light degrades woven polypropylene, and a bag that has spent a summer against a south-facing window will split along its own seams the first time it is lifted. If the only space available is a sunny one, a tarpaulin over the stack is enough to stop it.',
        ],
      },
      {
        heading: 'Rotation and receiving checks',
        body: [
          'Rotate on receipt, not on convenience: new bags go to the back, older bags come forward, and a marker pen on the bag is faster than a spreadsheet nobody updates. The goal is simply that the bag opened this week is the oldest one in the room.',
          'When a delivery arrives, check three things before it goes on the pallet: the bag weight feels right for its size, the seams and corners are intact, and the pallet underneath is dry. A bag that arrives damp should be opened and used first rather than stacked, because storing it wet is how a whole pallet starts to cake together.',
        ],
      },
    ],
  },
  {
    id: 'res-15',
    slug: 'seasoning-meat-with-himalayan-pink-salt',
    title: 'Seasoning Meat with Coarse Pink Salt: Ratios and Timing',
    category: 'Culinary & Kitchen',
    readTime: '6 min read',
    publishedAt: '2026-11-08T09:20:00Z',
    updatedAt: '2026-11-08T09:20:00Z',
    authorId: 'editorial-board',
    reviewerId: 'sourcing-team',
    summary:
      'Why crystal size changes how much salt reaches the meat, how dry-brining actually works, and the timing windows that matter more than the brand on the jar.',
    metaDescription:
      'Season meat with coarse Himalayan pink salt: salt-by-weight ratios, dry-brining timing, and why crystal size changes the result more than colour does.',
    featuredImage: '/images/products/bowl-of-salt.jpg',
    relatedProductSlugs: ['himalayan-edible-pink-salt-16-oz-jar-fine-grain'],
    productUse: 'food',
    relatedArticleSlugs: [
      'fine-vs-medium-vs-coarse-grain-salt',
      'himalayan-pink-salt-vs-regular-salt-practical-differences',
    ],
    sources: [
      { title: 'The Science of Salt in Cooking', publication: "Cook's Illustrated" },
      { title: 'Salt Fat Acid Heat', publication: 'Samin Nosrat, Simon & Schuster', year: '2017' },
      { title: 'Effects of Brining on Meat Quality', publication: 'Meat Science', year: '2011' },
    ],
    sections: [
      {
        heading: 'Salt by weight, not by spoon',
        body: [
          'Two salts that look identical in a tablespoon can differ by a third in how much they actually weigh, because coarse crystals leave air between them. That is the whole reason a recipe written for fine salt tastes wrong when made with coarse, and vice versa. Weighing solves it: the same gram weight of either salt delivers the same salinity.',
          'For a home kitchen without a scale, the practical rule is to taste and adjust, and to use the same grind the recipe was written for. A finishing sprinkle of coarse crystal is a texture decision as much as a seasoning one — it lands as small bursts of salt rather than an even veil.',
        ],
      },
      {
        heading: 'What dry-brining does',
        body: [
          'Salting meat and leaving it uncovered draws moisture to the surface, dissolves the salt, and then pulls the resulting brine back into the muscle. The visible effect is a drier surface, which browns faster in a hot pan; the less visible effect is seasoning that reaches the centre rather than sitting on the crust.',
          'Timing is the variable worth controlling. A short rest — half an hour — seasons the surface but does not travel far. Several hours to overnight, on a rack in the refrigerator, gives the brine time to redistribute and dries the surface properly. Very long rests on small cuts can make the exterior firmer than intended, so match the window to the thickness of the piece.',
        ],
      },
      {
        heading: 'When coarse is the right call',
        body: [
          'Coarse salt belongs on the outside of a piece that will be seared, grilled or roasted whole, where it dissolves slowly and leaves patches of texture. Fine salt belongs in a cure, a brine, a sausage mix or anything measured by volume, because it disperses evenly and dissolves quickly.',
          'Pink salt is not a different seasoning. It is sodium chloride with trace minerals and a colour; the salinity is the same, and the colour mostly disappears in a wet marinade. Choose it for the flavour of the crystal and the look on the plate, and use the ratio you would use for any other salt of that grind.',
        ],
      },
    ],
  },
  {
    id: 'res-16',
    slug: 'salt-for-goats-and-sheep-practical-guide',
    title: 'Salt for Goats and Sheep: What Small Ruminants Need',
    category: 'Livestock & Equine',
    readTime: '7 min read',
    publishedAt: '2026-11-08T09:30:00Z',
    updatedAt: '2026-11-08T09:30:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'Small ruminants are not small cattle. A practical look at free-choice salt for goats and sheep, including the copper difference that catches new owners out.',
    metaDescription:
      'Free-choice salt for goats and sheep: sodium needs, why loose salt suits small ruminants, and the copper difference between the two species.',
    featuredImage: '/images/products/bowl-of-salt.jpg',
    relatedProductSlugs: ['bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh'],
    relatedArticleSlugs: [
      'free-choice-salt-feeding-schedule-for-livestock',
      'salt-block-vs-loose-salt-for-livestock',
      'salt-needs-for-cattle-practical-farm-guide',
    ],
    sources: [
      { title: 'Nutrient Requirements of Small Ruminants', publication: 'National Research Council', year: '2007' },
      { title: 'Goat Nutrition: Minerals', publication: 'Penn State Extension' },
      { title: 'Sheep and Goat Mineral Supplementation', publication: 'Michigan State University Extension', year: '2018' },
    ],
    sections: [
      {
        heading: 'The sodium need is real, the delivery is different',
        body: [
          'Goats and sheep need sodium for the same physiological reasons cattle do, and they will seek it out when forage is low in it. What differs is scale and behaviour: a goat herd works over a salt station far more actively than a cow herd does, and a sheep flock tends to approach a station as a group, which means a small number of animals can dominate it.',
          'That behaviour favours loose salt in a covered trough over a single fixed block. Several stations spread around the paddock let the animals that are lower in the pecking order get to salt without waiting, and a trough is easier to read at a glance than a block that has been licked into an odd shape.',
        ],
      },
      {
        heading: 'The copper difference',
        body: [
          'This is the part that catches people out. Goats have a comparatively high copper requirement and tolerate levels that are toxic to sheep. A mineral mix formulated for goats is not safe for a sheep flock, and the reverse — a sheep mix — can leave goats short.',
          'Plain salt is the neutral ground: sodium chloride with no added trace minerals is appropriate for both species as a free-choice salt source, while the copper question belongs to the mineral supplement you feed alongside it. Read the label of anything you put in the same trough, and do not assume "for livestock" means "for every species on the farm".',
        ],
      },
      {
        heading: 'Water, weather and the smallholder rhythm',
        body: [
          'Small ruminants are less tolerant of a long walk to water than cattle, so the salt station and the water source should be close enough together that a lame animal can still manage the trip. In hot weather, check both on the same round.',
          'Because small herds are checked by hand rather than by truck, the record can be simple: the date a bag went out and roughly how much. Two or three months of that is enough to see whether a station is being used normally or has become a corner where one animal camps.',
        ],
      },
    ],
  },
];
