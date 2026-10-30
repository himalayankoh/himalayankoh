# Luxedge admin → Himalayan Koh parity matrix (audited)

The mandate for this workstream was a **full clone of the Luxedge admin system into
Himalayan Koh** — every applicable Luxedge admin route with a Himalayan Koh
equivalent, the interaction patterns preserved, and the data adapters pointed at
WooCommerce instead of Supabase. This file is the audit record: what exists on
each side, what was actually exercised in a browser, and what is still missing.

* Reference: `8002salman-ai/luxedge-website` (React + Vite SPA; admin in
  `src/admin/`, 31 routes in one 6,243-line `AdminSection.tsx` shell, Supabase
  repository + 30 serverless endpoints). Local read-only clone for this audit:
  `../.luxedge-probe`.
* Target: this repository, branch `integration/luxedge-full-admin`.
* Read with `docs/LUXEDGE-ADMIN-MIGRATION.md` (the pre-migration inventory).

## 0. What the audit actually ran

| Check | How | Result |
|---|---|---|
| Every HK admin route responds | HTTP sweep of all 35 routes | 35 × HTTP 200 |
| Every HK admin route renders | real client-side walk of all 35 rail destinations on a production build in WooCommerce mode | 35/35 rendered, each with its own `h1`, one shared rail, no route error state |
| Empty / pending states | read on each route | every unwired module states what it needs; no placeholder that looks like data |
| Tabs and sub-views | clicked on SEO (5 tabs), Marketing (6), Promotions (3), Gift Drop (3), Campaigns (3), AI Control (3) | each switches to a distinct panel |
| Table controls | Products: search (11 → 6 rows), sort, category/status filters, pagination (Next/Prev/numbered, `?page=2`) | all work |
| CRM lead drawer | created a test lead, opened the drawer, changed status, added an activity, closed, deleted | works end to end; test row removed afterwards (see §5) |
| Desktop lock | measured canvas, rail and table at 1920/1600/1440/1366/1280/1024 and at 80/90/110/125 % zoom | canvas holds at 1280, rail always visible, tables stay tables, horizontal scrolling below the minimum |
| Console | captured on the products route | 2 findings, both reported in §5 |

## 1. Route parity

`Luxedge route` → `Himalayan Koh route`. "Adapted" means the workflow exists with a
different mechanism, not that it is missing.

| # | Luxedge route | Himalayan Koh equivalent | UI parity | Function parity | Backend source | Status | Missing |
|---|---|---|---|---|---|---|---|
| 1 | `/admin` Dashboard | `/admin` | Yes | Partial | catalog adapter (+ Supabase orders) | Live | Woo-backed revenue/orders; widgets that need a source say so |
| 2 | `/admin/products` | `/admin/products` | Yes | Read yes, write blocked | WooCommerce (WP core + Store API) | Live read | `woo-write` for add/edit/duplicate/variations |
| 3 | `/admin/products/new` | product editor (**modal**, not a route) | Yes | UI complete, save blocked | editor is Supabase-backed → entry point disabled | Blocked by policy | re-point the editor at WooCommerce, then re-enable |
| 4 | `/admin/products/edit/:id` | editor modal from a table row | Yes | Same as above | Same | Same | Same |
| 5 | `/admin/promotions` | `/admin/promotions` (3 tabs) | Yes | No | WooCommerce coupons | Pending | `woo-rest-read`, `woo-write` |
| 6 | `/admin/gift-drop` | `/admin/gift-drop` (3 tabs) | Yes | Draft configuration only | no claim store | Pending | claims table + inventory decrement |
| 7 | `/admin/campaigns` | `/admin/campaigns` (3 tabs) | Yes | Drafting + real catalog targeting | catalog adapter | Partial | `email-send`, `woo-write` |
| 8 | `/admin/orders` | `/admin/orders` | Yes | Yes | Supabase orders (existing) | Live | WooCommerce orders + CSV export |
| 9 | `/admin/users` | `/admin/users` (2 tabs) | Yes | Read + own account | Supabase auth/profiles | Partial | invite/disable/remove/reset (needs the auth-admin path) |
| 10 | `/admin/categories` | `/admin/categories` | Yes | Read yes, write blocked | WooCommerce categories | Live read | `woo-write` |
| 11 | `/admin/reviews` | `/admin/reviews` | Yes | No | WooCommerce reviews | Pending | `woo-rest-read`, `woo-write` |
| 12 | `/admin/blogs` | `/admin/blog` | Yes | Yes | Supabase blog tables | Live | — |
| 13 | `/admin/media` | `/admin/media` | Yes — images from the catalog + library panel | Read only | WordPress media via Woo auth | Pending | `woo-rest-read` (+ upload scope). Luxedge's screen is YouTube-video-specific; HK adapts it to catalog images |
| 14 | `/admin/seo-engine` | `/admin/seo` (5 tabs) | Yes | Live crawler/technical checks + Gemini flows | own checks + Gemini (server) | Partial | `ai-text` for generation |
| 15 | `/admin/marketing` | `/admin/marketing` (6 tabs) | Yes | Tab structure, honest pending | catalog adapter | Partial | `ai-text`, `email-send` |
| 16 | `/admin/marketing-traffic` | `/admin/marketing-traffic` | Yes | **Working** UTM campaign-link builder | none needed | Partial | `traffic-analytics` for sessions/channels |
| 17 | `/admin/email-marketing` | `/admin/email-marketing` | Yes | Composer only | Resend (existing lib) | Pending | `email-send` + verified domain |
| 18 | `/admin/crm` | `/admin/crm` | Yes | **Yes** — create, status, assign, activities, order history | Supabase + HubSpot | Live | lead delete (Luxedge has it), Woo customer history |
| 19 | `/admin/variant-gen` | `/admin/variant-gen` | Yes — 3-step matrix | **Working** matrix maths | catalog adapter | Partial | `woo-write` to create variations |
| 20 | `/admin/ai` | `/admin/ai` | Yes | Surface inventory | none needed | Partial | `ai-text` for the unwired surfaces |
| 21 | `/admin/ai-import` | `/admin/ai-import` | Yes — 4-step wizard | **Working** URL validation | none needed | Partial | `ai-text`, `woo-write` |
| 22 | `/admin/listing-task` | `/admin/listing-task` | Yes | **Working** defect queue | catalog adapter | Live | `woo-write` to fix from the list |
| 23 | `/admin/scout` | `/admin/scout` | Yes | **Working** source validation | catalog adapter | Partial | `ai-text`, `supplier-feed` |
| 24 | `/admin/product-research` | `/admin/product-research` | Yes | **Working** shelf composition | catalog adapter | Partial | demand data |
| 25 | `/admin/ai-control` | `/admin/ai-control` (3 tabs) | Yes | Guardrails, read-only by design | none needed | Partial | settings write for a spend ceiling |
| 26 | `/admin/hermes-intel` | `/admin/ai-intelligence` | Yes | Input inventory + catalog read | catalog adapter | Partial | `ai-text`, traffic, Woo orders |
| 27 | `/admin/cj-setup` | `/admin/suppliers` (3 tabs) | Adapted (own-warehouse sourcing, not dropship) | No | none | Partial | supplier records |
| 28 | `/admin/payments` | `/admin/payments` | Yes | **Working** for card config | `/api/stripe/config` (real) | Partial | `woo-rest-read` for gateways/tax |
| 29 | `/admin/settings` | `/admin/settings` | Yes | Yes | Supabase settings + env | Live | — |
| 30 | `/admin/settings/listing-playbook` | `/admin/listing-playbook` | Yes | **Working** checklist | none needed | Live | — |
| 31 | `/admin/shipping` *(route exists, no rail entry in Luxedge)* | `/admin/labels` | Yes | Yes | Shippo | Live | — |
| — | — | `/admin/customers` *(HK-only)* | — | Yes | Supabase | Live | Woo customer migration |
| — | — | `/admin/category-hubs` *(HK-only)* | — | Yes | Supabase + local defaults | Live | — |
| — | — | `/admin/inventory` *(HK-only)* | — | Read only | catalog adapter | Partial | `woo-rest-read` for counts |
| — | — | `/admin/coupons` *(HK-only)* | — | No | WooCommerce coupons | Pending | `woo-rest-read`, `woo-write` |
| — | — | `/admin/analytics` *(HK-only)* | — | Partial | catalog adapter + Supabase orders | Live | Woo-backed figures |
| — | — | `/admin/api-keys` *(alias → `/admin/settings`)* | — | Redirect | — | Alias | removed as a second rail destination (duplicate navigation) |

**Counts.** Luxedge admin routes **31**; of those, 29 become rail destinations in
Himalayan Koh (rows 3 and 4 are the product editor, which is a modal here rather
than two routes), plus **5 store-specific** destinations Luxedge has no
counterpart for — Customers, Category Hubs, Inventory, Coupons, Analytics — for
**34** rail destinations and 35 route files (the 35th, `/admin/api-keys`, is now
the alias that redirects to Settings). Full route parity: **yes** — no Luxedge
destination is missing, and the duplicate that had crept in (`/admin/api-keys`
beside `/admin/settings`) has been collapsed.

## 2. Shell parity

| Concern | Luxedge | Himalayan Koh | Verdict |
|---|---|---|---|
| Rail with grouped sections | 6 groups, gradient icon tiles, active states | 6 groups (Overview, Catalog, Media, Marketing, AI Studio, System), same icon-tile treatment, `pending` dot | Matched, HK branding |
| Topbar | breadcrumb, store link, account menu | breadcrumb, global product search, notifications, account menu | Matched |
| Page header | eyebrow + title + description + actions | same, via one `AdminPageHeader` primitive | Matched |
| Cards / panels | `Card` + section headers | `AdminPanel` | Matched |
| Tables | sortable, row actions, status chips | `AdminTable` + chips + filters + pagination | Matched |
| Forms | labelled fields, validation, disabled states | `AdminField`/`AdminInput` with the same disabled-with-reason pattern | Matched |
| Modals / drawers | `Modal` + lead drawer | `AdminModal`/`AdminDialog` + lead drawer | Matched |
| Tabs | pill tabs inside the page | `AdminTabs`, same placement | Matched |
| Toasts | notify() | app-wide toast context, success/error tones | Matched |
| Loading | skeletons | skeletons/pulse placeholders | Matched |
| Empty / error / pending | text states | honest states that name the missing connection | Matched, stricter |
| Charts | revenue/orders bars | same, driven by real order rows | Matched |
| Desktop lock | Luxedge also keeps a desktop rail + mobile bottom nav | rail only, `min-width: 1280px`, no mobile navigation at all | Deliberate difference (the owner's requirement) |

## 3. Desktop lock — measured

Production build in WooCommerce mode, one browser, canvas element carrying
`min-width: 1280px`:

| Viewport | Canvas width | Rail | Main | Table | Horizontal scroll |
|---|---|---|---|---|---|
| 1920×1080 | 1920 | 264 | 1656 | `display: table`, 6 columns | no |
| 1600×900 | 1600 | 264 | 1336 | `display: table` | no |
| 1440×900 | 1440 | 264 | 1176 | `display: table` | no |
| 1366×768 | 1366 | 264 | 1102 | `display: table` | no |
| 1280×720 | 1280 | 264 | 1016 | `display: table` | no |
| 1024×768 | **1280** (minimum holds) | 264, visible | 1016 | `display: table`, 6 columns | **yes, inside the frame** |

Browser zoom 80 / 90 / 110 / 125 %: rail visible at 264 layout px, canvas never
collapses below 1280, no element overlap, tables stay tables, scrolling goes
horizontal rather than reflowing into cards. There are **zero** responsive
breakpoint utilities anywhere in `src/components/admin` and `src/views/admin`, so
no viewport width can trigger a different structure.

## 4. Structure this branch established

| Layer | File | Owns |
|---|---|---|
| Visual system | `src/components/admin/adminTheme.ts` | every surface/control/table/chip/rail class, `ADMIN_CANVAS_MIN_WIDTH` |
| Primitives | `src/components/admin/AdminUI.tsx` | header, panel, stat tile, chip, notice, table, tabs, dialog, pending panel, controls |
| Shell | `src/components/admin/AdminLayout.tsx` | 1280px desktop canvas, always-visible rail, header, breadcrumb, search, session menu |
| Navigation | `src/lib/adminNav.ts` | the 34 destinations, their grouping, icons and `pending` flags |
| Capabilities | `src/lib/admin/capabilities.ts` | what each unwired capability requires and enables — the text every pending panel is built from |
| Catalog read | `src/lib/admin/useAdminCatalog.ts` | the load/stats/error cycle a screen uses when it needs the whole catalog |

Rules the structure encodes:

1. A module never renders a figure it cannot source. Unknown is `Not connected`,
   `Unavailable`, `Price unavailable` or `source cannot report` — never `0`, never
   a plausible estimate.
2. `missing` on a catalog row means *the source cannot report this field*. It is a
   connection problem, not a listing defect, and the listing queue counts the two
   separately.
3. Writes that need `woo-write` are disabled with the reason attached, and never
   fall back to another database.
4. The admin is a desktop application; the public storefront keeps its own
   responsive behaviour.
5. No credential is read in the browser. Screens state what they need instead.

## 5. Findings from this audit

Fixed in this pass:

* **Duplicate navigation.** `/admin/api-keys` and `/admin/settings` rendered the
  same screen from two rail entries. The rail now has one Settings destination;
  `/admin/api-keys` redirects there for old links and bookmarks.

Verified, not a defect (recorded so nobody re-investigates):

* The CRM lead drawer was previously unexercised. It has now been exercised
  twice, most recently on the verified commit, with a development-only lead
  (`TEST - DELETE ME`): created through the New-lead dialog (`Lead created`
  toast), row opened into the drawer, status changed New → Contacted, an activity
  note ("Drawer verification activity") added through LOG ACTIVITY, the
  order-history empty state read ("No orders found for this email."), drawer
  closed, the list counts confirming the write (New 1 → 0, Contacted 0 → 1), and
  the row then deleted (`crm_leads` and `crm_activities` both verified empty). The
  app has no lead delete action — Luxedge does — so cleanup was done through the
  database.
* Pagination's icon-only Next/Previous buttons work; a text-based click test
  misses them because they carry `aria-label`, not text content.

Open findings, in the order that unblocks the most:

1. **`woo-write`** — products, variations, stock, coupons, categories. Every
   disabled Save button in the console waits on it, and the product editor modal
   (`ProductEditorModal`) still writes to Supabase, which is why its entry point is
   disabled rather than merely read-only.
2. **`woo-rest-read`** — orders, customers, coupons, reviews, media, gateways,
   unit counts, and the reconciliation of the two order sources.
3. **Store API `/products` still returns HTTP 500 on staging.** Its error response
   carries no `access-control-allow-origin`, and the console read is issued from
   the browser, so the failure surfaces as a CORS error and the admin shows
   `WooCommerce Store API failed: … Failed to fetch`. The `wp/v2/product` fallback
   returns 200 with the origin echoed back, which is why the catalog still lists
   all 11 products. Consequence for architecture: **commerce reads currently run in
   the browser**, not through a server-side application layer — moving that read
   server-side (and caching it) is the prerequisite for price/SKU/stock ever being
   reportable and for a quiet console.

   Measured cost of that design, from a console capture across a 35-route browser
   walk: **16 failed `store/v1/products?per_page=100&page=1` requests** — one per
   catalog-reading screen, because each screen mounts its own read and nothing
   shares or caches the result. The read is a full-catalog `per_page=100` fetch to
   answer questions like "how many products are low on stock", so the same payload
   is pulled again on every navigation. A module-level cache (or one server-side
   read per render) removes both the duplicate requests and the console noise.
4. **`ai-text`** — SEO suggestions, listing copy, import research, intelligence.
5. **Auth administration** — invite, disable, remove, password reset; the Users
   screen is complete and says so.
6. **Email sending**, **traffic analytics**, **Search Console**, **AdSense** —
   screens prepared, none wired.

## 6. Re-verification recorded with the duplicate-navigation fix

Run on the commit that removed the duplicate rail entry, against a production
build served in WooCommerce mode (so the catalog is the real staging one), signed
in as the seeded admin:

| Check | Result |
|---|---|
| HTTP sweep of all 35 admin route files | 35 × 200 |
| Real client-side click-walk of all 35 rail destinations | every route lands on its own path with its own `h1`, one shared rail (35 links), tables where the module is a table |
| Duplicate navigation | rail carries exactly one `/admin/settings` link, zero `/admin/api-keys` links, and the string "API Keys" no longer appears in the chrome |
| `/admin/api-keys` | redirects to `/admin/settings` (`h1` "Settings & API keys") |
| Products table | 10 rows on page 1 of 11, 6 columns, `display: table` |
| Products search | "salt" narrows the list to 6 rows; clearing restores 10; category / status / sort selects present; Next page enabled |
| Product editor entry point | `Add product` is a disabled action carrying the write-connection reason — the editor modal itself is Supabase-backed, so it is not reachable on this branch |
| Desktop canvas | viewport 966 → canvas holds at 1280 CSS px, rail 264 px still visible, tables stay `display: table` |
| Zoom 80 / 90 / 100 / 110 / 125 % | canvas 1280 and rail 264 at every step, tables stay tables, no reflow, scrolling stays inside the frame |
| Typecheck / lint / tests / build | clean · 0 errors · 129 passed, 8 skipped (WordPress integration suite needs `BACKEND_INTEGRATION=1`) · build green |
| External surfaces | `himalayankoh.com` 200, `/staging/` 200, `preview.himalayankoh.com` 200 with `X-Robots-Tag: noindex, nofollow` — none modified |
