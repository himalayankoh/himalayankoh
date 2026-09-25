export interface ResourceArticle {
  id: string;
  slug: string;
  title: string;
  category: 'Livestock & Equine' | 'Culinary & Kitchen' | 'Bulk & Storage' | 'Mineral Science';
  readTime: string;
  publishedAt: string;
  updatedAt: string;
  authorId: string;
  reviewerId: string;
  summary: string;
  metaDescription: string;
  featuredImage: string;
  relatedProductSlugs: string[];
  relatedArticleSlugs: string[];
  sources: { title: string; publication: string; year?: string; link?: string }[];
  sections: {
    heading: string;
    body: string[];
  }[];
}

export const RESOURCE_ARTICLES: ResourceArticle[] = [
  {
    id: 'res-1',
    slug: 'salt-block-vs-loose-salt-for-livestock',
    title: 'Salt Block vs. Loose Salt for Livestock: Management Comparison',
    category: 'Livestock & Equine',
    readTime: '7 min read',
    publishedAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-03-10T14:30:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'A practical evaluation of free-choice salt blocks versus granular loose salt for cattle, horses, and small ruminants—comparing intake regulation, pasture durability, and labor efficiency.',
    metaDescription:
      'Compare solid salt blocks vs loose granular salt for cattle and horses. Understand intake rates, weather erosion, pasture management, and herd behavior.',
    featuredImage: '/images/products/salt-lick-3-4kg.jpg',
    relatedProductSlugs: ['animal-salt-lick-3-4-kg', 'salt-lick-5-6-kg', 'compressed-salt-block-20kg'],
    relatedArticleSlugs: ['how-horses-use-salt-and-electrolytes', 'salt-needs-for-cattle-practical-farm-guide', 'livestock-salt-placement-and-weather-protection'],
    sources: [
      { title: 'Nutrient Requirements of Beef Cattle: Eighth Revised Edition', publication: 'National Academies of Sciences, Engineering, and Medicine (NASEM)', year: '2016' },
      { title: 'Salt and Trace Mineral Supplementation for Grazing Cattle', publication: 'University of Nebraska–Lincoln Extension (EC288)', year: '2020' },
      { title: 'Salt for Livestock: Form, Intake, and Economics', publication: 'Oklahoma Cooperative Extension Service', year: '2019' },
    ],
    sections: [
      {
        heading: 'Introduction: The Primary Role of Sodium Supplementation',
        body: [
          'Sodium and chloride are essential macrominerals that grazing livestock cannot synthesize. Because most native forages, legumes, and grasses contain surplus potassium relative to sodium, animals experience an innate physiological hunger for sodium.',
          'Ranchers and farm managers typically face a foundational operational choice: whether to offer sodium in the form of compressed or solid rock salt blocks, or as loose, granular salt presented in covered troughs. Both delivery mechanisms serve clear managerial purposes, but they behave very differently in pasture environments.',
        ],
      },
      {
        heading: 'Compressed & Rock Salt Blocks: Strengths and Limitations',
        body: [
          'Solid rock salt licks—particularly genuine Himalayan crystalline formations—feature extreme physical density created under immense subterranean tectonic pressures. This density makes them highly resistant to wind and rapid rain dissolution compared to pressed salt cakes made with chemical binders.',
          'Key Operational Advantages:',
          '1. Weather Resilience: Rock salt blocks shed rainfall significantly better than loose salt, reducing waste from leaching in open paddocks.',
          '2. Controlled Ingestion: Animals satisfy their salt urge by licking rather than gorging, preventing accidental over-consumption during periods of high thirst.',
          '3. Durability & Transport: Solid blocks can be suspended on ropes or anchored on dedicated pasture posts without requiring enclosed bulk feeder trailers.',
          'Management Limitation: Cattle with worn teeth or high-producing lactating cows in peak summer heat may occasionally struggle to lick sufficient sodium volume per hour from an extremely hard rock face. In such scenarios, intake monitoring is essential.',
        ],
      },
      {
        heading: 'Loose Granular Salt: When Loose Mineral Programs Are Indicated',
        body: [
          'Loose granular salt allows rapid consumption and is the industry standard when blending custom trace-mineral premixes, medications, or fly-control compounds into a unified free-choice ration.',
          'However, loose salt requires dedicated covered feeder bunks with rubber flaps or weather-hoods. If an unmanaged rainstorm floods a mineral feeder, loose sodium quickly dissolves into a brine sludge, leading to significant economic loss and potential mold proliferation in nearby grain mixes.',
        ],
      },
      {
        heading: 'Management Synthesis: The Hybrid Pasture Strategy',
        body: [
          'Many seasoned livestock operations utilize a hybrid protocol: loose granular mineral mixes are placed in sheltered feeding barns near central water facilities, while solid, weatherproof Himalayan rock salt licks are hung in perimeter pastures, shaded tree groves, and rotational paddocks to encourage uniform grazing dispersal.',
          'Always verify herd water access: sodium supplementation must NEVER be provided without continuous, unrestricted access to clean, potable drinking water.',
        ],
      },
    ],
  },
  {
    id: 'res-2',
    slug: 'how-horses-use-salt-and-electrolytes',
    title: 'How Horses Use Salt and Electrolytes: Physiology & Hydration',
    category: 'Livestock & Equine',
    readTime: '6 min read',
    publishedAt: '2026-01-20T09:15:00Z',
    updatedAt: '2026-03-08T11:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'Understanding equine thermoregulation, sweat composition, and why plain sodium chloride is the indispensable trigger for the equine thirst response.',
    metaDescription:
      'Learn how horses regulate electrolyte balance, why sweat depletes sodium and chloride, and how free-choice salt licks maintain vital hydration in equine care.',
    featuredImage: '/images/products/animal-salt-lick-3-4-kg.jpg',
    relatedProductSlugs: ['animal-salt-lick-3-4-kg', 'salt-lick-5-6-kg'],
    relatedArticleSlugs: ['salt-block-vs-loose-salt-for-livestock', 'how-to-choose-salt-block-size-for-horses-and-cattle'],
    sources: [
      { title: 'Nutrient Requirements of Horses: Sixth Revised Edition', publication: 'National Research Council (NRC)', year: '2007' },
      { title: 'Equine Sweat Composition and Electrolyte Losses During Exercise', publication: 'Equine Veterinary Journal', year: '2015' },
      { title: 'Water and Electrolyte Physiology in the Performance Horse', publication: 'American Association of Equine Practitioners (AAEP)', year: '2021' },
    ],
    sections: [
      {
        heading: 'Equine Sweat Physiology: The Hypertonic Loss Reality',
        body: [
          'Unlike human sweat, which is hypotonic (dilute compared to blood serum), equine sweat is hypertonic. A exercising or heat-stressed horse loses exceptionally high concentrations of sodium, potassium, and chloride in every liter of perspiration.',
          'An average 500 kg (1,100 lb) horse in light work requires roughly 25 to 30 grams of plain sodium chloride daily just for baseline metabolic homeostasis. Under moderate to intense training or in humid summer conditions, daily requirements can easily surge to 50–100 grams.',
        ],
      },
      {
        heading: 'The Sodium Thirst Mechanism',
        body: [
          'The equine physiological thirst mechanism is triggered by extracellular sodium concentrations in the bloodstream. If a horse experiences chronic sodium depletion, blood serum becomes dilute. Counter-intuitively, the horse may stop feeling the urge to drink water, entering an insidious cycle of dehydration and impending impaction colic.',
          'Providing continuous, free-choice access to an unrefined rock salt lick ensures the horse can replenish sodium on demand, maintaining healthy blood osmolality and driving robust, consistent water intake.',
        ],
      },
      {
        heading: 'Why Rock Salt Licks Prevent Bitter Rejection',
        body: [
          'Many commercial electrolyte supplements contain artificial flavorings, sucrose, or chemical binders that degrade when exposed to stall moisture or outdoor humidity. Plain, solid Himalayan rock salt delivers pure sodium chloride with naturally embedded crystalline trace minerals without added sugars or flow agents.',
          'Hanging a 3–4 kg rock lick in a stall or paddock at chest height provides environmental enrichment, encourages saliva generation (which naturally buffers stomach acidity), and allows the equine to pace sodium consumption without human over-intervention.',
        ],
      },
      {
        heading: 'Veterinary Advisory Note',
        body: [
          'Salt licks are a vital source of sodium and chloride, but they do not replace a balanced forage analysis or veterinary-prescribed selenium/vitamin supplementation in deficient geographic regions. Consult your equine veterinarian for competitive endurance regimens.',
        ],
      },
    ],
  },
  {
    id: 'res-3',
    slug: 'salt-needs-for-cattle-practical-farm-guide',
    title: 'Salt Needs for Cattle: Practical Farm & Pasture Guide',
    category: 'Livestock & Equine',
    readTime: '6 min read',
    publishedAt: '2026-01-28T10:00:00Z',
    updatedAt: '2026-03-05T16:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'Quantitative sodium chloride requirements for beef and dairy cattle, seasonal grazing shifts, and how salt acts as a nutritional intake regulator across pasture herds.',
    metaDescription:
      'Quantitative farm guide to sodium chloride requirements for beef and dairy cattle. Manage seasonal fluctuations, grazing distribution, and pasture mineral intake.',
    featuredImage: '/images/products/compressed-salt-block-20kg.jpg',
    relatedProductSlugs: ['compressed-salt-block-20kg', 'salt-lick-5-6-kg', 'animal-salt-lick-3-4-kg'],
    relatedArticleSlugs: ['salt-block-vs-loose-salt-for-livestock', 'livestock-salt-placement-and-weather-protection'],
    sources: [
      { title: 'Nutrient Requirements of Beef Cattle', publication: 'NASEM Publications', year: '2016' },
      { title: 'Managing Minerals in Beef Cattle Diets', publication: 'Texas A&M AgriLife Extension', year: '2018' },
      { title: 'The Role of Salt in Ruminant Digestion and Health', publication: 'Journal of Animal Science', year: '2017' },
    ],
    sections: [
      {
        heading: 'Quantitative Baseline Requirements',
        body: [
          'Beef cattle generally require between 0.10% and 0.20% sodium in their total dry matter intake. In practical pasture terms, a mature beef cow typically consumes between 25 and 50 grams (approximately 1 to 2 ounces) of salt per head daily, depending on weight, lactation status, and ambient temperature.',
          'Dairy cows in peak lactation have substantially higher requirements—often 50 to 100+ grams daily—due to the significant sodium and chloride volume transferred into milk solids.',
        ],
      },
      {
        heading: 'Seasonal Forage Shifts & Potassium Ratios',
        body: [
          'During rapid spring pasture flush, lush green grasses (such as rye, fescue, and clover) are exceptionally high in water and potassium content, but frequently deficient in sodium. Excess potassium in the rumen interferes with magnesium absorption, increasing susceptibility to grass tetany (hypomagnesemia).',
          'Supplying readily accessible rock salt licks or blocks restores normal rumen cation-anion balance and supports steady microbial fermentation.',
        ],
      },
      {
        heading: 'Using Salt for Rotational Grazing Distribution',
        body: [
          'Savvy cattle managers strategically place dense salt blocks away from primary water tanks. Because cattle will travel up to a mile to seek out salt, positioning blocks in under-grazed upland pastures or timber ridges encourages herd movement and prevents overgrazing of sensitive riparian creek zones.',
        ],
      },
      {
        heading: 'Safety and Hydration Cautions',
        body: [
          'Salt toxicity in cattle is extremely rare when water is abundant, but can be fatal if cattle are salt-deprived and then given salt without sufficient drinking water. Ensure adequate tank capacity before introducing new blocks to previously unsupplemented herds.',
        ],
      },
    ],
  },
  {
    id: 'res-4',
    slug: 'himalayan-salt-licks-what-they-are-and-how-to-use-them',
    title: 'Himalayan Salt Licks: Geological Nature & Pasture Protocol',
    category: 'Livestock & Equine',
    readTime: '5 min read',
    publishedAt: '2026-02-02T11:00:00Z',
    updatedAt: '2026-03-01T15:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'Everything ranchers, equestrians, and wildlife managers need to know about unprocessed Himalayan rock salt licks: physical structure, rope mounts, and handling.',
    metaDescription:
      'What are Himalayan rock salt licks? Learn about their natural crystal structure, zero chemical binders, rope-hanging techniques, and pasture longevity.',
    featuredImage: '/images/products/salt-lick-5-6kg.jpg',
    relatedProductSlugs: ['animal-salt-lick-3-4-kg', 'salt-lick-5-6-kg'],
    relatedArticleSlugs: ['salt-block-vs-loose-salt-for-livestock', 'how-to-choose-salt-block-size-for-horses-and-cattle'],
    sources: [
      { title: 'Geological Survey of Pakistan: Khewra Salt Range Formations', publication: 'GSP Special Report', year: '2014' },
      { title: 'Livestock Mineral Delivery Devices and Ingestion Dynamics', publication: 'Applied Animal Behaviour Science', year: '2019' },
    ],
    sections: [
      {
        heading: 'What Makes Himalayan Rock Salt Licks Structurally Distinct?',
        body: [
          'Unlike white manufactured salt blocks that are pressed from artificially recrystallized vacuum-pan salt and held together with edible chemical binders, Himalayan salt licks are cut directly from massive underground halite crystal beds in the Salt Range of Pakistan.',
          'Because they are solid mineral stone rather than compressed powder, they feature an interlocking crystalline matrix that does not crumble, bite off easily, or rapidly dissolve into mud when subjected to rainfall or equine tongue abrasion.',
        ],
      },
      {
        heading: 'Rope Mount vs. Ground Installation',
        body: [
          'Most individual 3–4 kg and 5–6 kg Himalayan licks are drilled with a central bore hole and fitted with a sturdy natural jute or polypropylene suspension rope.',
          'Hanging the lick at shoulder height inside a horse stall or cattle run offers several decisive advantages:',
          '1. Prevents Manure & Dirt Contamination: Ground-placed blocks quickly accumulate mud and fecal bacteria, causing animals to reject them.',
          '2. Stall Enrichment: Horses in enclosed stables engage with swinging rope licks as gentle behavioral stimulation, curbing cribbing and stall-weaving habits.',
          '3. Moisture Drainage: Rainwater and dew drip freely off suspended blocks rather than pooling beneath them.',
        ],
      },
      {
        heading: 'Wildlife & Game Management Use',
        body: [
          'Deer, elk, and hunting lease managers frequently install Himalayan rock salt licks along natural game trails in early spring. Does nursing fawns and bucks developing summer velvet antlers have heightened sodium and mineral turnover, regularly visiting established mineral sites throughout the warm months.',
        ],
      },
    ],
  },
  {
    id: 'res-5',
    slug: 'how-to-choose-salt-block-size-for-horses-and-cattle',
    title: 'How to Choose Salt Block Size for Horses, Cattle, and Herds',
    category: 'Livestock & Equine',
    readTime: '5 min read',
    publishedAt: '2026-02-08T09:00:00Z',
    updatedAt: '2026-03-04T12:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'A practical sizing reference chart comparing 1–2 kg, 3–4 kg, 5–6 kg, and 20 kg blocks based on herd numbers, stocking density, and mounting options.',
    metaDescription:
      'Sizing guide for livestock salt blocks: choose between 3-4 kg, 5-6 kg rope licks, and 20 kg blocks based on herd size, pasture acreage, and replacement frequency.',
    featuredImage: '/images/products/animal-salt-lick-3-4-kg.jpg',
    relatedProductSlugs: ['animal-salt-lick-3-4-kg', 'salt-lick-5-6-kg', 'compressed-salt-block-20kg'],
    relatedArticleSlugs: ['salt-needs-for-cattle-practical-farm-guide', 'himalayan-salt-licks-what-they-are-and-how-to-use-them'],
    sources: [
      { title: 'Beef Cattle Mineral Management', publication: 'Kansas State University Agricultural Experiment Station', year: '2021' },
      { title: 'Equine Management Principles', publication: 'University of Kentucky College of Agriculture', year: '2020' },
    ],
    sections: [
      {
        heading: 'The Sizing Decision: Herd Headcount vs. Handling Labor',
        body: [
          'Choosing the appropriate salt block weight balances two operational variables: how frequently you want to inspect/replace the lick, and whether the animal is housed individually or in a pasture herd.',
        ],
      },
      {
        heading: 'Sizing & Application Guidelines',
        body: [
          '1. 3–4 kg (7–9 lb) Rope Lick: Ideal for single-horse stalls, small foaling pens, goats, sheep, or hobby pens. Typically lasts one mature horse 6 to 10 weeks depending on climate and workout frequency.',
          '2. 5–6 kg (11–13 lb) Rope Lick: Best suited for outdoor paddocks with 2 to 4 horses, shared corral run-in sheds, or individual pasture loafing areas. Provides extended longevity with minimal replacement labor.',
          '3. 20 kg (44 lb) Solid / Compressed Block: The standard for commercial cattle herds, multi-horse pastures, and commercial ranching. Heavy enough that grazing cattle cannot easily flip or roll it into manure piles. One 20 kg block comfortably supports 10 to 15 head of cattle for 3 to 5 weeks under typical summer grazing conditions.',
        ],
      },
      {
        heading: 'Calculation Rule of Thumb',
        body: [
          'To estimate annual requirements: multiply total adult head by 15–20 kg of expected annual sodium chloride intake. For a herd of 20 beef cows, plan for roughly 300 to 400 kg of total salt supply per year, spaced across multiple pasture stations.',
        ],
      },
    ],
  },
  {
    id: 'res-6',
    slug: 'safe-storage-of-bulk-salt',
    title: 'Safe Storage Protocols for Bulk Rock Salt: Moisture & Handling',
    category: 'Bulk & Storage',
    readTime: '6 min read',
    publishedAt: '2026-02-12T13:00:00Z',
    updatedAt: '2026-03-02T10:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'How to manage hygroscopic salt storage in humid warehouse, barn, and shipping environments—preventing caking, pallet collapse, and packaging degradation.',
    metaDescription:
      'Best practices for storing bulk Himalayan salt bags and blocks. Control relative humidity, prevent pallet caking, manage floor elevation, and avoid product loss.',
    featuredImage: '/images/legacy/salt-rock-bag.jpg',
    relatedProductSlugs: ['himalayan-rock-salt-45-lbs-large-chunks', 'himalayan-salt-block-30-lbs'],
    relatedArticleSlugs: ['fine-vs-medium-vs-coarse-grain-salt', 'what-trace-minerals-in-himalayan-salt-actually-mean'],
    sources: [
      { title: 'The Chemistry and Technology of Salt', publication: 'American Chemical Society Monograph Series', year: '2012' },
      { title: 'Bulk Solids Storage and Handling in Humid Climates', publication: 'Materials Handling & Logistics Review', year: '2021' },
    ],
    sections: [
      {
        heading: 'Understanding Halite Hygroscopy',
        body: [
          'Sodium chloride is inherently hygroscopic: it naturally absorbs atmospheric water vapor whenever relative humidity (RH) exceeds its critical relative humidity threshold of approximately 75% at room temperature.',
          'When stored in unconditioned facilities during muggy summer months (such as the Texas Gulf Coast), bulk salt grains absorb airborne moisture. When the ambient temperature drops overnight, this moisture evaporates, forming crystalline bridges between adjacent grains. This phenomenon is known as caking.',
        ],
      },
      {
        heading: 'Key Warehouse & Barn Storage Rules',
        body: [
          '1. Pallet Elevation: Never stack salt bags or cartons directly on raw concrete floors. Concrete transmits subterranean hydrostatic moisture. Always store on wooden or polymer pallets at least 4 inches above the floor.',
          '2. Stretch Wrap & Polyethylene Liners: Multi-wall paper bags must incorporate a high-density polyethylene (HDPE) internal moisture barrier. Keep unopened pallets securely stretch-wrapped until ready for distribution.',
          '3. Airflow & Ventilation: Maintain gentle cross-ventilation in storage barns to prevent stagnant humid air pockets from settling over pallet stacks.',
          '4. Stacking Limits: For 25 kg bags, do not exceed 40 bags per pallet or stack pallets more than 2 tiers high to avoid crushing the lower layers into dense bricks.',
        ],
      },
    ],
  },
  {
    id: 'res-7',
    slug: 'fine-vs-medium-vs-coarse-grain-salt',
    title: 'Fine vs. Medium vs. Coarse Grain Salt: Applications & Mesh Sizing',
    category: 'Mineral Science',
    readTime: '6 min read',
    publishedAt: '2026-02-18T14:30:00Z',
    updatedAt: '2026-03-06T09:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'A technical breakdown of Himalayan salt particle sizing (granulometry) from 0.2 mm fine shaker grind to 4.0 mm coarse brining crystal, matching each to culinary and industrial needs.',
    metaDescription:
      'Guide to Himalayan pink salt grain sizes: fine grain (0.2–0.8 mm), medium coarse (1.0–2.0 mm), and extra coarse (2.0–4.0 mm). Selection for cooking, brining, and grinders.',
    featuredImage: '/images/legacy/salt-pouch-6lb.webp',
    relatedProductSlugs: ['himalayan-salt-fine-grain-3-lbs', 'himalayan-pink-edible-salt-fine-grain-pouch-6-lbs'],
    relatedArticleSlugs: ['using-himalayan-salt-blocks-for-cooking', 'himalayan-pink-salt-vs-regular-salt-practical-differences'],
    sources: [
      { title: 'Standard Specification for Sodium Chloride (ASTM D632)', publication: 'ASTM International', year: '2020' },
      { title: 'Salt Particle Size Distribution and Sensory Perception in Food Systems', publication: 'Journal of Food Science', year: '2018' },
    ],
    sections: [
      {
        heading: 'Granulometry: Why Grain Size Governs Function',
        body: [
          'In food science and bulk mineral trade, salt is classified by particle diameter distribution, determined by vibrating mechanical sieves with standardized wire mesh ratings. Because unrefined Himalayan salt contains no artificial anti-caking agents (such as yellow prussiate of soda or sodium aluminosilicate), matching grain size to the specific application is essential.',
        ],
      },
      {
        heading: 'Sieve Profiles & Optimal Uses',
        body: [
          '1. Fine Grain (0.2 mm – 0.8 mm / 20–40 mesh):',
          'Dissolves rapidly in liquids, doughs, and sauces. Ideal for table shakers, baking formulations, dry spice rubs, and direct kitchen seasoning where immediate dissolution is required.',
          '2. Medium Grain (1.0 mm – 2.0 mm / 10–18 mesh):',
          'Provides a distinct crunchy texture when sprinkled over roasted proteins, crusty breads, or artisanal chocolates. Also serves as an excellent texture for coarse-blend meat cures.',
          '3. Coarse Grain (2.0 mm – 4.0 mm / 5–10 mesh):',
          'Engineered specifically for refillable ceramic and stainless steel salt mills and grinders. Also the standard size for wet brining poultry and smoking operations, where slow, uniform brine release is advantageous.',
        ],
      },
      {
        heading: 'Measuring Conversions Caution',
        body: [
          'Because fine salt packs much more densely than coarse crystals, a volume tablespoon of fine pink salt can weigh up to 50% more than a tablespoon of coarse salt. Always measure by weight in commercial recipes.',
        ],
      },
    ],
  },
  {
    id: 'res-8',
    slug: 'using-himalayan-salt-blocks-for-cooking',
    title: 'Using Himalayan Salt Blocks for Cooking: Searing, Curing & Chilling',
    category: 'Culinary & Kitchen',
    readTime: '7 min read',
    publishedAt: '2026-02-22T10:00:00Z',
    updatedAt: '2026-03-09T17:00:00Z',
    authorId: 'editorial-board',
    reviewerId: 'sourcing-team',
    summary:
      'Step-by-step techniques for safely heating, searing, and freezing solid pink salt slabs—including crucial temperature graduation stages to prevent thermal shock fractures.',
    metaDescription:
      'Master cooking on Himalayan salt plates and blocks. Learn safe heating steps, high-heat steak searing, cold charcuterie serving, and temperature shock prevention.',
    featuredImage: '/images/products/cooking-salt-plate.jpg',
    relatedProductSlugs: ['cooking-salt-plate', 'himalayan-salt-block-30-lbs'],
    relatedArticleSlugs: ['how-to-clean-and-maintain-a-cooking-salt-block', 'himalayan-pink-salt-vs-regular-salt-practical-differences'],
    sources: [
      { title: 'Salt Block Cooking: 70 Recipes for Grilling, Chilling, Searing, and Serving', publication: 'Bitterman Press', year: '2013' },
      { title: 'Thermal Expansion Properties of Halite Single Crystals', publication: 'Physics and Chemistry of Minerals', year: '2017' },
    ],
    sections: [
      {
        heading: 'The Thermal Mechanics of Halite Cooking Slabs',
        body: [
          'A thick culinary slab cut from crystalline rock salt possesses exceptional thermal mass and minimal internal porosity. When properly heated, it retains high surface temperatures for an extended duration, acting as a natural mineral griddle that seasons food delicately while searing.',
          'However, because salt crystals contain microscopic trapped moisture pockets and expand when heated, rapid temperature shifts can cause uneven internal expansion, resulting in violent fractures or cracks. Gradual heating is mandatory.',
        ],
      },
      {
        heading: 'The Three-Stage Safe Heating Protocol',
        body: [
          '1. Low Heat Stage (15–20 minutes): Place the bone-dry salt slab on a gas cooktop burner or grill grate on low flame (approx 200°F / 93°C). Allow residual moisture to gently evaporate.',
          '2. Medium Heat Stage (15 minutes): Increase flame to medium (approx 350°F / 177°C). The slab will begin to radiate dry heat.',
          '3. High Searing Heat (15 minutes): Increase flame to high until surface temperature reaches 450°F to 500°F (232°C–260°C), verified by an infrared thermometer or water drop test (water droplet should vaporize immediately upon contact).',
          'Once fully heated, sear thin steaks, scallops, wild shrimp, or sliced asparagus in seconds. Foods pick up a clean, delicate salinity without heavy encrustation.',
        ],
      },
      {
        heading: 'Chilled & Cold Presentation Techniques',
        body: [
          'Himalayan salt plates excel equally as freezing platters. Place the slab in a freezer for 2 to 3 hours. Use it to present fresh sashimi, chilled carpaccio, artisanal cheeses, melon carpaccio, or scoops of dark chocolate gelato. The cold stone keeps proteins food-safe while lending a sophisticated mineral backdrop.',
        ],
      },
    ],
  },
  {
    id: 'res-9',
    slug: 'how-to-clean-and-maintain-a-cooking-salt-block',
    title: 'How to Clean & Maintain a Cooking Salt Block: Sanitation Guide',
    category: 'Culinary & Kitchen',
    readTime: '5 min read',
    publishedAt: '2026-02-26T12:00:00Z',
    updatedAt: '2026-03-07T14:00:00Z',
    authorId: 'editorial-board',
    reviewerId: 'sourcing-team',
    summary:
      'Proper maintenance rules for culinary salt slabs: why soap and dishwashers ruin the stone, damp-cloth cleaning, scrape techniques, and dry storage.',
    metaDescription:
      'Learn how to clean and care for a Himalayan salt cooking plate. Avoid soap damage, scrape residues correctly, dry completely, and extend slab lifespan.',
    featuredImage: '/images/products/cooking-salt-plate.jpg',
    relatedProductSlugs: ['cooking-salt-plate'],
    relatedArticleSlugs: ['using-himalayan-salt-blocks-for-cooking', 'safe-storage-of-bulk-salt'],
    sources: [
      { title: 'Antimicrobial Properties of Halite Surfaces and High Osmotic Environments', publication: 'International Journal of Food Microbiology', year: '2019' },
      { title: 'Culinary Care Manual for Mineral Cookware', publication: 'Culinary Institute of America Reference Notes', year: '2020' },
    ],
    sections: [
      {
        heading: 'The Natural Antimicrobial Reality of Salt',
        body: [
          'A common concern among first-time salt slab users is food safety and bacterial sanitation. Because halite is 98%+ sodium chloride, any bacteria that contacts its dry surface experiences rapid osmotic dehydration—water is drawn out of the bacterial cell wall, rendering the surface naturally hostile to microbial proliferation.',
          'Consequently, chemical soaps, bleaches, and synthetic detergents are NEVER required—and must strictly never be used, as porous salt will absorb soap chemicals and ruin subsequent meals.',
        ],
      },
      {
        heading: 'Four-Step Cleaning Procedure',
        body: [
          '1. Cool Completely: Never wash or scrape a hot salt slab. Rapid cooling under a faucet will cause immediate thermal cracking. Allow 1 to 2 hours for the slab to return to ambient room temperature.',
          '2. Damp Wipe & Scrape: Lightly moisten a scouring pad or soft cloth with clean tap water (do not submerge the block in a sink). Use a stiff metal spatula or dough scraper to remove caramelized protein residues.',
          '3. Pat Dry: Wipe the surface dry with clean paper towels or a lint-free kitchen cloth. Minimize the duration water remains on the salt face.',
          '4. Air Dry & Wrap: Stand the block on edge in a well-ventilated wire drying rack for at least 24 hours until bone-dry. Store wrapped in a cotton cloth or zip-bag in a dry pantry cabinet.',
        ],
      },
      {
        heading: 'End-of-Life Repurposing',
        body: [
          'Over dozens of cooking sessions, salt slabs naturally erode and thin. When a cooking plate becomes too fragile for high-heat stovetop searing, do not discard it: break the remaining salt chunks into a mortar and pestle or food processor to produce coarse finishing salt for your spice rack.',
        ],
      },
    ],
  },
  {
    id: 'res-10',
    slug: 'livestock-salt-placement-and-weather-protection',
    title: 'Livestock Salt Placement & Weather Protection in Pastures',
    category: 'Livestock & Equine',
    readTime: '6 min read',
    publishedAt: '2026-03-01T08:30:00Z',
    updatedAt: '2026-03-11T13:00:00Z',
    authorId: 'sourcing-team',
    reviewerId: 'editorial-board',
    summary:
      'Field strategies to maximize the lifespan of outdoor salt blocks: managing rain erosion, ground contact barriers, predator security, and rotational positioning.',
    metaDescription:
      'Pasture guide to protecting livestock salt licks from heavy rain, mud contamination, and rapid weather dissolution. Strategic paddock placement advice.',
    featuredImage: '/images/products/salt-lick-5-6kg.jpg',
    relatedProductSlugs: ['animal-salt-lick-3-4-kg', 'salt-lick-5-6-kg', 'compressed-salt-block-20kg'],
    relatedArticleSlugs: ['salt-block-vs-loose-salt-for-livestock', 'salt-needs-for-cattle-practical-farm-guide'],
    sources: [
      { title: 'Grazing Distribution and Pasture Infrastructure', publication: 'USDA Natural Resources Conservation Service (NRCS)', year: '2019' },
      { title: 'Pasture Management for Small Ruminants and Horses', publication: 'Penn State Extension', year: '2021' },
    ],
    sections: [
      {
        heading: 'Weather Exposure and Mineral Leaching Dynamics',
        body: [
          'Outdoor pasture salt is exposed to seasonal thunderstorms, wind-driven rain, and freeze-thaw cycles. While genuine Himalayan rock salt blocks withstand rainfall far better than pressed soft salt cakes, unmitigated exposure to persistent ground puddles can cause unnecessary dissolution loss.',
        ],
      },
      {
        heading: 'Best Placement Practices in the Field',
        body: [
          '1. Keep Off Bare Dirt: Placing blocks directly on clay or soil causes moisture absorption from beneath, creating a muddy hollow where animals stomp manure into the mineral base. Mount on heavy rubber stall mats, wooden pallets, or dedicated poly tubs with drainage holes.',
          '2. Utilize Three-Sided Sheds: If rotational pastures feature run-in sheds, place salt stations inside the sheltered area. This cuts direct rain strike by up to 80% while keeping animals dry while licking.',
          '3. Elevation Above Standing Water: Ensure licks are mounted on elevated ridges rather than valley collection basins where seasonal floodwaters pool.',
          '4. Distance from Water Troughs: Placing salt 100 to 300 yards away from water facilities reduces loafing congestion around waterers and promotes even pasture utilization across grazing acres.',
        ],
      },
    ],
  },
  {
    id: 'res-11',
    slug: 'what-trace-minerals-in-himalayan-salt-actually-mean',
    title: 'What Trace Minerals in Himalayan Pink Salt Actually Mean',
    category: 'Mineral Science',
    readTime: '7 min read',
    publishedAt: '2026-03-05T11:00:00Z',
    updatedAt: '2026-03-12T16:00:00Z',
    authorId: 'editorial-board',
    reviewerId: 'sourcing-team',
    summary:
      'A chemical reality check on the popular "84 minerals" claim: spectroscopy findings, why the salt is pink (iron oxide), and factual nutritional boundaries.',
    metaDescription:
      'Scientific analysis of trace minerals in Himalayan pink salt. What spectroscopy reveals, why it has pink color, and what trace amounts mean for human and animal diets.',
    featuredImage: '/images/products/bowl-of-salt.jpg',
    relatedProductSlugs: ['himalayan-pink-edible-salt-fine-grain-pouch-6-lbs', 'himalayan-salt-chunks'],
    relatedArticleSlugs: ['himalayan-pink-salt-vs-regular-salt-practical-differences', 'quality'],
    sources: [
      { title: 'Mineral Analysis of Pink Himalayan Salt: An Australian Consumer Survey', publication: 'Foods Journal (MDPI)', year: '2020' },
      { title: 'Codex Standard for Food Grade Salt (CXS 150-1985)', publication: 'Codex Alimentarius Commission', year: '2019' },
      { title: 'Dietary Reference Intakes for Sodium and Potassium', publication: 'National Academies of Sciences, Engineering, and Medicine', year: '2019' },
    ],
    sections: [
      {
        heading: 'Deconstructing the "84 Minerals" Marketing Trope',
        body: [
          'Few consumer food claims are repeated as widely—or understood as poorly—as the assertion that Himalayan pink salt contains "84 nutritious minerals." At Himalayan Koh, we prioritize scientific precision over marketing hyperbole.',
          'Chemically, Himalayan rock salt is halite: roughly 96% to 99% pure sodium chloride (NaCl). The remaining 1% to 4% consists of naturally occurring mineral impurities embedded within the halite crystal lattice when ancient inland waters evaporated during the Cambrian era.',
        ],
      },
      {
        heading: 'What Trace Elements Are Actually Present?',
        body: [
          'Modern inductively coupled plasma mass spectrometry (ICP-MS) tests confirm that the predominant trace elements are:',
          '• Iron (Fe): The microscopic presence of iron oxide (ferric iron compounds) within the crystal lattice is what refracts light to produce the spectrum of peach, rose, and deep coral pink hues.',
          '• Potassium (K), Magnesium (Mg), Calcium (Ca), and Sulfur (S): Present in fractions of parts per million (ppm) or small milligrams per gram.',
          'While mass spectrometers can register dozens of elements at infinitesimal parts-per-billion (ppb) detection thresholds, their dietary contribution at standard daily salt intake levels is minute compared to whole food vegetables, meats, and grains.',
        ],
      },
      {
        heading: 'Nutritional Reality & Compliance Boundaries',
        body: [
          'Himalayan salt is celebrated for its natural geological extraction, clean crunchy texture, unrefined state, and lack of synthetic bleaching chemicals or flow additives. However, it should NOT be promoted as a cure for mineral deficiencies or a replacement for a comprehensive balanced diet or veterinary mineral ration.',
        ],
      },
    ],
  },
  {
    id: 'res-12',
    slug: 'himalayan-pink-salt-vs-regular-salt-practical-differences',
    title: 'Himalayan Pink Salt vs. Regular Salt: Practical Differences',
    category: 'Mineral Science',
    readTime: '6 min read',
    publishedAt: '2026-03-08T15:00:00Z',
    updatedAt: '2026-03-14T10:00:00Z',
    authorId: 'editorial-board',
    reviewerId: 'sourcing-team',
    summary:
      'A head-to-head comparison between mined Himalayan rock salt and refined vacuum-evaporated table salt—covering processing methods, additives, moisture, and culinary performance.',
    metaDescription:
      'Himalayan pink salt vs regular white table salt: understand chemical processing, anti-caking additives, unrefined crystal texture, and culinary taste differences.',
    featuredImage: '/images/legacy/bowl-of-salt.jpg',
    relatedProductSlugs: ['himalayan-pink-edible-salt-fine-grain-pouch-6-lbs', 'himalayan-pink-edible-salt-16-oz-jar'],
    relatedArticleSlugs: ['what-trace-minerals-in-himalayan-salt-actually-mean', 'fine-vs-medium-vs-coarse-grain-salt'],
    sources: [
      { title: 'Food Chemistry: Principles of Salt Refinement and Iodization', publication: 'CRC Press', year: '2018' },
      { title: 'Sensory and Textural Comparison of Commercial Cooking Salts', publication: 'Culinary Science Digest', year: '2021' },
    ],
    sections: [
      {
        heading: 'Extraction and Processing Differences',
        body: [
          'The fundamental difference between unrefined Himalayan salt and standard industrial table salt lies in how each is extracted and processed.',
          'Standard White Table Salt: Sourced primarily from solution mining—pumping high-pressure water underground to dissolve salt deposits into saturated brine. The brine is treated with chemical precipitants to strip away magnesium and calcium, boiled in multi-stage vacuum evaporators, and kiln-dried at extreme temperatures. Finally, anti-caking agents such as sodium silicoaluminate, tricalcium phosphate, or sodium ferrocyanide (yellow prussiate of soda) are added to keep the salt free-flowing in humid conditions.',
          'Himalayan Pink Rock Salt: Extracted through mechanical room-and-pillar mining directly from subterranean dry salt beds in Pakistan. The raw rock is brought to the surface, visually inspected, washed with pure saturated brine, crushed to size, and air-dried. No chemical bleaches, no anti-caking chemicals, and no artificial dyes are introduced at any stage.',
        ],
      },
      {
        heading: 'Culinary Texture and Flavor Perception',
        body: [
          'While both salts deliver sodium and chloride, their physical mouthfeel differs dramatically. Standard table salt consists of uniform microscopic cube crystals that dissolve instantaneously on the tongue, creating a sharp, stinging salt punch.',
          'Himalayan salt features irregular geometric crystal fractures. When coarse or medium grains are crushed over food, they dissolve at varying rates on the palate, creating a smoother, more layered seasoning profile without harsh metallic notes.',
        ],
      },
      {
        heading: 'Summary Comparison Table',
        body: [
          '• Origin: Ancient marine seabed (Khewra, Pakistan) vs. Modern solution mining or sea brine',
          '• Additives: 100% additive-free vs. Anti-caking agents (E535, E554) typically added',
          '• Color: Naturally pink/rose from trace iron oxides vs. Chemically bleached stark white',
          '• Processing: Mechanically crushed and graded vs. Chemical precipitation and vacuum boiling',
        ],
      },
    ],
  },
];

export function getAllResourceArticles(): ResourceArticle[] {
  return RESOURCE_ARTICLES;
}

export function getResourceArticleBySlug(slug: string): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((a) => a.slug.toLowerCase() === slug.toLowerCase());
}

export function getArticlesByAuthor(authorId: string): ResourceArticle[] {
  return RESOURCE_ARTICLES.filter((a) => a.authorId === authorId || a.reviewerId === authorId);
}
