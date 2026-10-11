# Guide authoring brief — six educational drafts (owner review required)

Status: **DRAFTS. Nothing in `docs/content/` is published by being written.** These files are
prepared for the owner to review, edit and then publish through the existing WordPress blog.
Do not publish, and do not add them to any listing, sitemap or admin screen.

This brief is the shared contract for all six drafts. Every fact, source URL, tone rule and
format rule below applies to every draft; each draft's own section says which fact block it uses.

---

## 1. Who the reader is

Two audiences share this site and the same six topics touch both:

- **Livestock owners** — horse owners with one or two animals, and small cattle or mixed herds.
  Practical, cost-aware, often already feeding a mineral mix and suspicious of marketing.
- **Home cooks** — people who bought, or are considering, edible pink salt and want to use
  and store it properly.

Write to a competent adult who has not studied animal nutrition or food chemistry. Explain the
mechanism in one sentence, then say what to do. Never talk down, never sell.

## 2. Voice and length

- Premium American English. Plain, specific, calm. Short paragraphs (2–4 sentences).
- Second person ("you", "your animals"). Active voice. No exclamation marks.
- **Length: 900–1,300 words of body text** per guide. If a section has nothing verified to say,
  cut the section rather than padding it.
- No filler openings ("In today's world…", "Salt is one of the oldest…" as a throwaway), no
  "it's important to note", no summarizing paragraphs that repeat the section before them.
- No keyword stuffing. The target phrase appears naturally two or three times, not in every
  heading.
- Concrete over abstract: say "check the feeder after rain" rather than "maintain optimal
  environmental conditions".

## 3. Non-negotiable accuracy rules

1. **Use only the facts in this brief's fact blocks and the product note.** Do not add numbers,
   percentages, doses, temperatures, times, weights or prices from memory. If a number you want
   is not here, write the sentence without the number.
2. **Never state or imply a health, performance or production benefit of Himalayan Koh salt**,
   for people or animals. Banned shapes:
   - cure / heal / treat / prevent / therapy / remedy / detox / boost immunity / antibacterial /
     anti-inflammatory
   - "helps prevent", "reduces the risk of", "supports healthy…", "improves fertility",
     "increases milk production", "faster growth", "more productive", "keeps your herd healthy"
   - "84 minerals", "84 trace minerals", "84+ essential trace minerals", "all the essential
     minerals your animals need", "the purest salt in the world", "mineral-rich for health"
   - any certification or approval nobody issued: FDA-approved, certified organic, lab-tested
     for purity, non-GMO verified, ISO certified, kosher certified (exception: a plain factual
     statement that a listed product is halal or unprocessed is allowed on a product page —
     do not import it into these guides).
   - veterinary or professional endorsement, or any implication that a veterinarian,
     nutritionist, laboratory or university endorses Himalayan Koh.
3. **Do not invent** experiments, laboratory results, photographs, customer experiences,
   testimonials, authors, credentials, product specifications or certifications. No fictional
   "a study found" and no "many customers report".
4. **Attribute sources honestly.** Where a fact comes from a specific body, name it in the
   sentence ("University of Georgia Extension guidance", "the Merck Veterinary Manual notes",
   "Codex's food-grade salt standard"). Cite as an inline link, using only the URLs in the fact
   blocks. Never call an extension publication "research by Himalayan Koh".
5. **Distinguish your product from the evidence.** These guides are educational. When you
   mention the store, keep it factual and separate: what is sold, in what grades, and where to
   check. Do not blend a product mention into a claim sentence.
6. **Flag uncertainty instead of hiding it**: where the fact block says a claim could not be
   verified, write only the verified part.
7. **Salt is salt.** For sodium and chloride, pink rock salt and ordinary salt do the same job.
   Never suggest pink salt is nutritionally superior for sodium, and never suggest it can
   replace a formulated mineral supplement.
8. Food-safety statements must stay general: "keep it refrigerated", "follow a tested recipe",
   "follow the directions on your package". Do not give curing, nitrite or botulism guidance
   beyond the fact block, and never present salt as making food safe on its own.

## 4. Format

Each guide is one file: `docs/content/<slug>.html`. Plain semantic HTML, same style as
`docs/content/how-to-cook-with-himalayan-pink-salt.html`:

- **No `<h1>`** and no page wrapper; the WordPress post title supplies the heading. Start directly
  with `<p>`.
- Headings: `<h2>` for sections (3–7 per guide), `<h3>` for sub-points inside a section.
- Lists: `<ul>` with `<li>`; use `<strong>` for the leading phrase of a list item.
- External links: `<a href="URL" target="_blank" rel="noopener noreferrer">Anchor text</a>`.
  Internal links: plain root-relative `href` (`/products`), no target/rel, 1–3 absolute-relevant
  links to resolve the reader (allowed targets in the product note).
- Tables: avoid; prefer a list.
- Do not use inline styles, classes, `<script>`, `<iframe>`, images or emoji.
- End with one short closing section (H2) that gives the reader the next step and links one or two
  relevant internal pages. No hard sell, no "order now", no urgency.

Open each file with exactly this comment header, filled in:

```
<!--
GUIDE-DRAFT: <slug>
SEO title: <50-60 characters, no brand stuffing, no claim>
Meta description: <120-158 characters, factual, no claim>
Internal links used: <list>
Status: DRAFT — not published; owner review required before publishing
-->
```

The SEO title must not contain a health claim or the words cure/heal/benefit. The meta
description must be a factual summary of what the guide explains.

## 5. Product note (facts you may state about the store)

From the live WooCommerce catalog on 2026-10-11 and the owner's stated weights. State only what
is here; otherwise point the reader to the listing.

- The store sells **Himalayan pink rock salt in two lives**: livestock products (salt licks on
  rope, a large red rock salt block for cattle, and loose rock salt bags and pouches) and
  **edible pink salt for cooking** (a fine-grain jar and fine- or coarse-grain pouches).
- Listed weights: horse licks 2 lb and 6 lb; cattle red rock salt block 30 lb; livestock loose
  rock salt 45 lb and 6 lb (fine or coarse); edible fine grain 3 lb and 6 lb; edible jar 16 oz.
- The livestock salt is unrefined rock salt sold for free-choice feeding; it is **not** a
  complete mineral supplement and is not fortified with trace minerals.
- The edible salt is sold for cooking; it is not a curing salt and contains no added nitrite.
- Do not state or imply price, stock level, certification, origin beyond "mined Himalayan rock
  salt", a mineral count, or an analysis result for a specific batch. The owner has not issued
  batch analysis results for publication.

Internal link targets verified live on 2026-10-11 (HTTP 200):

- `/products` — all products
- `/products?category=edible-pink-salt` — edible collection
- `/products/himalayan-edible-pink-salt-16-oz-jar-fine-grain` — edible fine-grain jar
- `/products/himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh` — edible fine/coarse pouches
- `/products/himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh` — horse salt lick
- `/products/himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh` — cattle red rock salt
- `/products/bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh` — loose salt for livestock
- `/faqs`, `/contact`, `/about`, `/blog`

Do **not** link `/products/himalayan-edible-pink-salt` (it only redirects).

---

# Fact blocks

The research below was gathered on 2026-10-11 from the linked sources. Numbers here are quoted
from those sources; do not extend or round them further.

## Fact block A — Salt for horses and cattle, and licks versus loose salt

- Salt is sodium chloride. Sodium and chloride help regulate body fluid volume, acid–base
  balance, nerve and muscle function; chloride is used to make stomach acid. Animals have little
  storage for them, so the diet must supply them regularly. Sodium deficiency can reduce or
  distort feed intake and slow growth. Sources: Mississippi State University Extension
  (https://extension.msstate.edu/publications/mineral-and-vitamin-nutrition-for-beef-cattle),
  UGA Extension (https://fieldreport.caes.uga.edu/publications/B895/mineral-supplements-for-beef-cattle/).
- Cattle sodium requirement is expressed as dietary sodium, not a universal salt dose:
  **0.06–0.08 % of the diet** for growing and finishing cattle and dry gestating cows, and
  **0.10 %** for lactating cows; chlorine requirements are not well determined. Source: MSU
  Extension (above).
- Published intake estimates differ by source and feeding setup, so quote them as estimates:
  Oklahoma State Extension says mature cattle need **less than 1 oz of salt per head per day**;
  UGA Extension gives a rule of thumb of **0.005–0.010 % of body weight as salt per day**
  (about 1.0–1.9 oz for a 1,200 lb cow); Missouri Extension observed free-choice **loose salt**
  intake of **¾–1⅓ oz per head per day**, with roughly **half as much taken from a block** in
  the comparison it cites. Sources: https://extension.okstate.edu/fact-sheets/limiting-feed-intake-with-salt ,
  https://fieldreport.caes.uga.edu/publications/B895/mineral-supplements-for-beef-cattle/ ,
  https://extension.missouri.edu/publications/g2081
- Blocks slow intake compared with loose salt; UGA Extension recommends loose salt where
  adequate consumption matters (it names cattle at risk of grass tetany). Missouri's comparison
  reports about half the intake from blocks. Sources as above.
- **Not verified, so do not write it:** that a hard lick can never supply adequate sodium. The
  supported statement is that intake from a block can be slower, lower and harder to judge.
- Horses: the Merck Veterinary Manual cites a National Research Council ration recommendation of
  **1.6–1.8 g salt per kg of feed dry matter**, and notes the data behind salt requirements are
  limited; Purdue Extension gives older general guidance of about **1 oz per day**; Oklahoma
  State Extension says **2 tablespoons** is generally sufficient for an exercising horse, with
  more likely needed in hot, humid conditions. Salt need rises with sweat loss. Sources:
  https://www.merckvetmanual.com/management-and-nutrition/nutrition-horses/nutritional-requirements-of-horses-and-other-equids ,
  https://www.extension.purdue.edu/extmedia/as/as-429.html ,
  https://extension.okstate.edu/fact-sheets/nutritional-concerns-for-exercising-horses
- Horse salt intake varies widely between individuals — Merck reports **19–134 g per day in one
  study** — and loose salt typically produces greater intake than a block. Because intake is
  variable, block use should not be assumed to meet an individual animal's needs; University of
  Kentucky Extension warns horses use mineral blocks inconsistently. Sources as above plus
  https://equine.mgcafe.uky.edu/feeding-broodmare-four-easy-steps
- Do not put a separate plain salt source beside a complete mineral mix: Nebraska Extension
  warns this can lower and destabilize mineral-mix intake because some animals eat the salt and
  others the mineral. Minnesota Extension adds: if you use a trace-mineral salt, do not offer
  another salt source; if you feed a complete mineral supplement or a fortified grain mix,
  offer a separate plain salt block. Sources:
  https://beef.unl.edu/beefwatch/2021/tips-managing-free-choice-mineral-intake/ ,
  https://extension.umn.edu/agriculture/animals-and-livestock/horse/feeding-your-horse-a-ration-balancer
- Weather: University of Georgia Extension says a mineral feeder should keep the product dry and
  should be checked at least weekly. A block kept out of standing water and sheltered from direct
  rain lasts better, which follows from salt dissolving in water. **Not verified:** a quantified
  comparison of block versus loose salt durability in weather; present the shelter advice as
  practical guidance, not as an official rule. Sources: UGA (above) and the moisture behavior in
  fact block D.

## Fact block B — Salt versus a complete livestock mineral

- Unfortified sodium chloride supplies sodium and chloride only. It is not a formulated source of
  copper, zinc, selenium, cobalt or iodine. Source: Virginia Cooperative Extension archive
  (https://www.sites.ext.vt.edu/newsletter-archive/livestock/aps-06_10/aps-373.html — a sheep
  article that describes white salt as sodium and chlorine) and UGA Extension (above).
- For beef cattle, UGA Extension lists dietary requirements of **10 ppm copper, 30 ppm zinc,
  0.10 ppm selenium, 0.50 ppm iodine and 0.10 ppm cobalt**, and identifies copper, zinc and
  selenium as the trace minerals most likely to be short in grazing cattle, with copper the most
  common micromineral deficiency. Source: https://fieldreport.caes.uga.edu/publications/B895/mineral-supplements-for-beef-cattle/
- Sodium and chloride are macronutrients supplied in grams per day; the trace minerals above are
  measured in parts per million. That size difference is the reason a salt lick cannot stand in
  for a trace-mineral mix. (Frame this as arithmetic of the requirement, not as a test result.)
- **Iodized** salt is a different case: Missouri Extension says iodized salt is an adequate iodine
  supplement for beef cattle in most instances — but that still does not make salt a complete
  mineral supplement. Source: https://extension.missouri.edu/publications/g2081
- Peer-reviewed analysis of **31 retail pink salts** found wide variation between products;
  copper was below 1 mg/kg, selenium appeared in only six samples at less than 0.19 mg/kg, and
  zinc in three samples at less than 0.86 mg/kg. The study examined retail salt for human
  nutrition, not livestock diets, bioavailability or feeding safety, and did not test iodine — so
  it supports "pink salt's trace mineral content is small and variable", not a feeding claim.
  Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC7603209/
- The popular **"84 minerals"** figure was not substantiated by the analyses reviewed: the 2020
  study above measured 25 nutritive and non-nutritive elements across 31 retail pink salts, and a
  2023 peer-reviewed study of commercial table salts measured 12 elements in one Himalayan pink
  sample. An elemental assay counts elements, not 84 distinct mineral compounds. Sources:
  https://hero.epa.gov/reference/7092616/ , https://pmc.ncbi.nlm.nih.gov/articles/PMC10459412/
- Practical conclusion to write: the only reliable way to cover trace-mineral requirements is a
  supplement formulated for the species and production stage, used as its label directs and as
  your nutrition plan says. Source: Nebraska Extension (above).

## Fact block C — Fine versus coarse edible salt

- Crystal size changes how salt behaves in the hand, in the dish and in a brine. Smaller crystals
  dissolve faster in a high-salinity solution; larger, flakier crystals are easier to pinch and
  distribute by hand and are commonly used as a finishing salt. Sources: Serious Eats
  (https://www.seriouseats.com/ask-the-food-lab-do-i-need-to-use-kosher-salt ,
  https://www.seriouseats.com/guide-to-salt), America's Test Kitchen
  (https://www.americastestkitchen.com/articles/4286-ask-paul-what-s-the-difference-between-table-salt-kosher-salt-and-other-salts).
- Salt types are not interchangeable by **volume**, because crystal size and shape change how
  tightly salt packs into a spoon. Published examples: table salt about **280 g per cup**,
  Morton kosher about **225 g per cup** and Diamond Crystal kosher about **140 g per cup**;
  America's Test Kitchen gives about **23 g, 16 g and 10 g per tablespoon** for the same three.
  These are examples for those products, not conversion factors for Himalayan salt. Both sources
  recommend weighing salt for precision. Sources as above.
- Composition: food-grade salt standards set a minimum sodium chloride content of **97 % on a
  dry-matter basis, exclusive of additives** (Codex Standard for Food-Grade Salt, CXS 150-1985);
  a McGill University explainer describes table, kosher, sea and Himalayan salts as at least
  about **98 % sodium chloride**. These are minimums and broad estimates, not a measured result
  for a particular bag. Do not state a purity figure for Himalayan Koh salt. Sources:
  https://openknowledge.fao.org/server/api/core/bitstreams/fa48b5df-8de7-442b-a0ce-5a4f730d02c2/content
  (note: the PDF was not machine-readable when this brief was written — the owner should confirm
  the current text before quoting the figure), and
  https://www.mcgill.ca/oss/article/health-nutrition-you-asked/table-salt-kosher-salt-sea-salt-himalayan-salt-which-one-should-i-buy
- Pink color: trace impurities, iron among them, contribute the color. Source: McGill (above).
  Do not state which mineral compound causes it in a particular product.
- Anti-caking agents: salt is sold with or without them. The United States permits specified
  anti-caking agents for food use (21 CFR Part 172 Subpart E) and its salt labeling rule allows a
  "free flowing" statement when they are used (21 CFR 100.155). Salt without an anti-caking agent
  can clump when it takes up moisture; clumping alone is not contamination or poor quality.
  Sources: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-172/subpart-E ,
  https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-100/subpart-G/section-100.155
- "Fine" and "coarse" are commercial descriptions. **There is no universal millimeter cutoff.**
  A seller should state the actual particle-size range for a specific product; a guide should
  tell the reader to use the range on the listing rather than assume the words mean a fixed size.

## Fact block D — Storage of edible salt and of livestock salt products

- Moisture, not temperature, is the main storage concern. Utah State University Extension says
  moisture causes salt to cake, advises storing opened salt away from moisture, and states that
  iodized salt has an **indefinite shelf life** when protected from moisture and contamination.
  Source: https://extension.usu.edu/preserve-the-harvest/research/cooking-food-storage
- Sodium chloride is moisture-sensitive: after absorbing water vapor it can cake as that moisture
  is released. Reference figures from a cargo-handling reference: appreciable moisture uptake
  begins around **74 % relative humidity at 20 °C**, with dissolution at about **75 %**. Salt has
  no biological activity and can be stored for years under suitable conditions. These are
  reference conditions for transport, not a kitchen threshold. Source:
  https://www.tis-gdv.de/tis_e/ware/gewuerze/salz/salz-htm/
- Practical wording that the sources support: store edible salt in a clean, tightly closed
  container in a dry place, keep a dry spoon in it and close it after use; caking alone does not
  mean the salt has spoiled.
- Livestock products outdoors: keep the product dry where practical. UGA Extension says a mineral
  feeder should keep the product dry and should be checked at least weekly; loose salt that
  cakes in a wet feeder is harder for animals to take. A block kept off the ground, out of
  standing water and sheltered from direct rain lasts longer. Sources:
  https://fieldreport.caes.uga.edu/publications/B895/mineral-supplements-for-beef-cattle/ ,
  https://beef.unl.edu/beefwatch/2021/tips-managing-free-choice-mineral-intake/
- **Not verified:** a service-life or replacement interval for an outdoor salt block, and any
  universal rule that a block must be placed beside water. Placement is a management decision:
  UGA Extension lists areas near water, shaded loafing areas and good grazing areas as options,
  while South Dakota State University Extension advises placing blocks **away** from natural water
  and riparian areas in some pasture setups to spread grazing pressure. Sources: UGA (above),
  https://extension.sdstate.edu/managing-livestock-attractants-near-water
- Cooking slabs: gradual heating and complete drying before use are the reported method; fissures
  can develop with use; clean after the slab has cooled with minimal water, no soap and no
  dishwasher; follow the block maker's own instructions. Sources: The Meadow
  (https://themeadow.com/pages/guide-to-himalayan-salt-blocks) and The Splendid Table
  (https://www.splendidtable.org/story/2013/09/20/salt-block-cooking-101-dont-clean-it-in-a-dishwasher).
  These are culinary and maker instructions, not food-safety authority.

## Fact block E — Reading a salt analysis report

- Two different documents: a **certificate of analysis** reports what a specific lot tested at,
  while a **specification sheet** states the limits or targets the product is expected to meet.
  Neither has one universal format, so read the fields, not the cover.
- For each result, establish four things: the value and its **unit**, the **basis**, the
  **method/limit of detection**, and the standard or jurisdiction the sheet compares against.
- **Basis.** "As-fed" (or as-received) results include the sample's moisture; "dry-matter" results
  are recalculated after moisture is excluded, so they are higher and are comparable between
  samples with different moisture. If a sample is 50 % dry matter, its dry-matter concentration
  is twice its as-fed concentration. Source: Mississippi State University Extension
  (https://extension.msstate.edu/publications/interpreting-forage-and-feed-analysis-reports)
- **Units.** For a solid reported by mass, **1 % = 10,000 ppm** and **1 ppm = 1 mg/kg**. Source:
  University of Florida IFAS Extension (https://ask.ifas.ufl.edu/publication/HS1229)
- **Maximum versus typical.** A maximum is a ceiling used for a compliance decision; a typical
  value describes an observed or representative result. A typical value is not proof that every
  lot clears a legal maximum, and a maximum is not what a typical lot contains.
- **Detection limits.** "Not detected" or "below the reporting limit" does not mean zero; it means
  the method did not report a quantified result at or above that level. If the reporting limit is
  above the legal maximum being checked, the test cannot demonstrate compliance.
- **Purity figure.** Codex's standard for food-grade salt sets a minimum of **97 % sodium chloride
  on a dry-matter basis, exclusive of additives** (CXS 150-1985 — confirm the current text before
  quoting; the PDF was not machine-readable when this brief was written). Treat it as a minimum
  standard for food-grade salt, not as a measured result and not as a livestock-salt
  specification.
- **Metal limits are jurisdiction-specific.** A 2023 peer-reviewed review of the EU contaminants
  regulation reports maximum lead levels of **1 mg/kg for salt generally** and **2 mg/kg for
  specified unrefined salts**, and **0.10 mg/kg mercury**. Sources:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10459412/ , and the EU regulation it reviews
  (https://eur-lex.europa.eu/eli/reg/2023/915/oj/eng). Do not mix limits from different
  standards or editions: Codex contaminant entries differ and the official text could not be
  verified for this brief, so do not print Codex metal numbers as current requirements.
  Do not present US regulation as setting a numeric heavy-metal panel for salt: 21 CFR 100.155
  covers salt labeling (including iodized and "free flowing" statements), and 21 CFR Part 165 is
  the beverages part of the code — they are often cited for the wrong thing. Source:
  https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-100/subpart-G/section-100.155
- Food grade and feed grade are different specs. A food-grade salt standard does not describe a
  livestock salt, and asking a supplier for the right specification for the intended use is part
  of reading the report correctly.
- An elemental analysis detects elements. It does not count mineral compounds, which is why a
  report showing twenty-odd elements is not evidence of a "84 minerals" claim.

## Fact block F — Livestock salt handling and safety

- Risk profile, from the Merck Veterinary Manual: salt toxicosis is unlikely when the animal's
  sodium regulation is intact and fresh drinking water is continuously available; risk rises with
  a failed waterer, overcrowding, frozen or unpalatable water, or sudden water restriction. The
  manual reports an acute oral lethal dose of about **2.2 g of salt per kg of body weight for
  cattle and horses** — a veterinary toxicology figure, not a feeding limit. Horses are rarely
  affected by classic salt toxicosis but can be after increased salt intake followed by sudden
  water restriction. Source: https://www.merckvetmanual.com/toxicology/salt-toxicosis/salt-toxicosis-in-animals
- Diagnosis figures from the same source (state them as diagnostic, never as feeding targets):
  serum or cerebrospinal fluid sodium **above 160 mEq/L** suggests toxicosis. Restoring water and
  electrolytes too quickly can worsen brain swelling, so suspected cases need veterinary care —
  write that a suspected case is a call to a veterinarian, not a home remedy.
- A reported case example: Penn State Extension describes 30 dairy cows that consumed a 50 lb bag
  of loose salt in an afternoon after fresh grazing access, with three cows unable to rise,
  loose manure in others and several deaths; water was available and the amount eaten per cow was
  not measured, so it is a case, not a threshold. The same source advises cautious reintroduction
  of salt and monitoring of intake. Source:
  https://extension.psu.edu/salt-smart-preventing-deficiency-and-toxicity-in-livestock
- Water matters more than the salt itself: Oklahoma State Extension estimates water use may rise
  **50–75 %**, or about **5 extra gallons of water per pound of salt**, when salt is used to limit
  intake in a self-fed supplement, and advises caution when water total dissolved solids exceed
  **5,000 ppm**. This figure belongs to salt-limited feeding, not to routine free-choice salt.
  Source: https://extension.okstate.edu/fact-sheets/limiting-feed-intake-with-salt
- Horses: Merck recommends unlimited access to clean water; needs rise with dry feed, work, heat,
  sweating and lactation, and sweat loss can raise water need by **50–200 %**. For a heavily
  sweating or dehydrated horse the manual names a properly balanced electrolyte supplement, and
  says that if electrolytes are added to drinking water, plain water should be offered at the same
  time; prolonged supplementation when it is not needed is discouraged. Source:
  https://www.merckvetmanual.com/management-and-nutrition/nutrition-horses/nutritional-requirements-of-horses-and-other-equids
- Handling: keep salt and mineral feeders from filling with rain (Nebraska Extension; UGA
  Extension), check them weekly (UGA Extension), keep blocks off the ground and out of standing
  water, and introduce salt gradually to animals that have been without it (Penn State
  Extension). Sources as above.

---

# The six guides

Each draft uses its own fact block plus the product note. Titles below are the proposed SEO
titles; the slug is the file name.

| # | Slug | Topic | Draft's fact block |
| --- | --- | --- | --- |
| 1 | `horse-salt-licks-vs-loose-salt` | Salt licks versus loose salt for horses and cattle | A (+ D for weather, F for water) |
| 2 | `salt-vs-complete-livestock-minerals` | Salt versus a complete livestock mineral | B |
| 3 | `fine-vs-coarse-himalayan-edible-salt` | Fine versus coarse Himalayan edible salt | C (+ D for storage, F's brining boundary) |
| 4 | `storing-himalayan-pink-salt` | Storing edible salt and livestock salt products | D |
| 5 | `reading-a-salt-analysis-report` | Reading a salt analysis report or certificate of analysis | E (+ B for the element-versus-mineral point) |
| 6 | `livestock-salt-handling-and-safety` | Handling livestock salt safely: water, intake and weather | F (+ A for intake, D for feeders) |

Section shapes are suggestions, not scripts. Each guide must be useful on its own to a reader who
has never read the others, and where two guides touch the same point (intake, water,
minerals) they must agree with the brief and repeat it rather than cross-reference for the facts.
