# Luxedge → Himalayan Koh admin migration

**Status: inventory complete, no admin code ported yet.** This document is the
mandated Step 1 ("create an ADMIN FEATURE INVENTORY before migration") plus the
rollback record. Every route, module and cross-cutting system below was read from
the Luxedge source at `8002salman-ai/luxedge-website` (cloned locally, read-only).

---

## 0. Rollback point (recorded before any admin work)

| Item | Value |
| --- | --- |
| `main` SHA | `16e013354b2495fc46fabb8468c4f932d08075b7` |
| `preview.himalayankoh.com` alias | `himalayan-bxr6eo94c-8002salman-2281s-projects.vercel.app` (Production target, Ready) |
| Preview checks at record time | HTTP 200 · `X-Robots-Tag: noindex, nofollow` · robots `Disallow: /` · 11 WooCommerce staging products |
| Production | `https://himalayankoh.com` (WordPress, untouched) |
| Rollback command | `vercel alias set himalayan-bxr6eo94c-8002salman-2281s-projects.vercel.app preview.himalayankoh.com` |

Working branch: `integration/luxedge-full-admin`. `preview.himalayankoh.com` is not
touched until a build passes on a temporary URL.

---

## 1. What Luxedge actually is (and what that means for porting)

| Fact | Value |
| --- | --- |
| Frontend stack | **React + Vite + Tailwind 4 SPA** (`react-vite-tailwind`) — *not* Next.js |
| Routing | `react-router-dom`, single `src/App.tsx` route table |
| Admin routes | **31** (`/admin/*` → `<AdminSection />`, one 6,243-line shell file) |
| Admin code size | ~22.7k LOC across `src/admin/*`, `src/features/catalog/*`, `src/features/campaigns/*` |
| State | `zustand` stores (`store/authStore`, …) |
| Icons | `@phosphor-icons/react` (+ `@untitledui/icons`) |
| Charts | `recharts` |
| Fonts | Inter, Fraunces, Space Grotesk (`@fontsource-variable/*`) |
| Admin data layer | `src/features/catalog/repository.ts` (1,379 LOC) → `services/db` adapter in **Supabase** mode |
| Admin server calls | **30** serverless functions under `api/` (`admin/*`, `ai`, `crm`, `email`, `media`, `adsense`, `suppliers`, `hermes`, `market-intel`, `shippo`, `gift-drop`, …) |
| Auth | `store/authStore` + Supabase, `ProtectedRoute requireAdmin` |

**The consequence that governs the whole port:** Luxedge's *presentation and
interaction* is portable; its *data layer is not*. Its catalog reads come from
Supabase and its screens call 30 Luxedge-specific Vercel functions. Himalayan Koh
must read and write **WooCommerce**, so every screen is re-pointed at the
WooCommerce REST layer while keeping Luxedge's shell, layout, states and controls.

Two more constraints follow from the same facts:

- Luxedge's admin is a **Vite app with its own design tokens** (`src/index.css`,
  CSS-first Tailwind) and its own font/icon/chart stack. Porting visuals means
  bringing a **token layer**, not adding a dependency to existing components.
- Luxedge ships a **`MOBILE_NAV`** (Home / Listings / Add / Orders / More) and an
  `lg+` breakpoint comment — i.e. it deliberately becomes mobile. The mandate is
  the opposite (desktop lock), so that behaviour is **not** ported; see §5.

---

## 2. Route inventory and classification

| # | Luxedge route | Screen | Classification |
| --- | --- | --- | --- |
| 1 | `/admin` | Premium dashboard (revenue, orders, AOV, customers, active products, low stock, quick actions, activity) | **ADAPT TO WOOCOMMERCE** — real Woo counts, real Supabase order facts, no fabricated metrics |
| 2 | `/admin/products` | Product list | **ADAPT TO WOOCOMMERCE** |
| 3 | `/admin/products/new` | Product editor (create) | **ADAPT TO WOOCOMMERCE** |
| 4 | `/admin/products/edit/:id` | Product editor (edit) | **ADAPT TO WOOCOMMERCE** |
| 5 | `/admin/promotions` | Promotions / price rules | **ADAPT TO WOOCOMMERCE** (WC coupons + sale prices) |
| 6 | `/admin/orders` | Orders list + fulfilment | **ADAPT TO WOOCOMMERCE** (mobile variant dropped) |
| 7 | `/admin/users` | Users / roles | **ADAPT TO HIMALAYAN KOH** (Supabase Auth owns identity today) |
| 8 | `/admin/categories` | Category tree | **ADAPT TO WOOCOMMERCE** |
| 9 | `/admin/reviews` | Reviews moderation | **ADAPT TO WOOCOMMERCE** |
| 10 | `/admin/blogs` | Blog manager | **ADAPT TO HIMALAYAN KOH** (HK blog lives in Supabase) |
| 11 | `/admin/media` | Media hub | **ADAPT TO WOOCOMMERCE** media (HK has no media hub yet) |
| 12 | `/admin/seo-engine` | SEO engine | **ADAPT TO HIMALAYAN KOH** (Yoast/Woo data + HK `src/lib/seo`) |
| 13 | `/admin/marketing` | Marketing content generation | **ADAPT TO HIMALAYAN KOH** (Gemini, server-side only) |
| 14 | `/admin/marketing-traffic` | Ads / traffic dashboard | **NOT APPLICABLE** (no ad-account data source exists for HK) |
| 15 | `/admin/email-marketing` | Email campaign preparation | **ADAPT TO HIMALAYAN KOH** (prepare only; no bulk sends) |
| 16 | `/admin/crm` | Leads CRM | **PORT AS-IS (shell only)** — HK already has `/admin/crm`; keep HK's data |
| 17 | `/admin/variant-gen` | Variant generator | **ADAPT TO WOOCOMMERCE** (variations) |
| 18 | `/admin/ai` | AI hub | **NOT APPLICABLE** (Luxedge-specific content pipeline) |
| 19 | `/admin/ai-import` | AI product import from URL | **NOT APPLICABLE** |
| 20 | `/admin/ai-control` | AI keys / quota control | **NOT APPLICABLE** |
| 21 | `/admin/listing-task` | Marketplace listing tasks | **NOT APPLICABLE** |
| 22 | `/admin/scout` | Product scouting | **NOT APPLICABLE** |
| 23 | `/admin/product-research` | Market research | **NOT APPLICABLE** |
| 24 | `/admin/hermes-intel` | "Hermes" intelligence | **NOT APPLICABLE** |
| 25 | `/admin/cj-setup` | CJ dropshipping supplier | **NOT APPLICABLE** |
| 26 | `/admin/payments` | Payment provider setup | **ADAPT TO HIMALAYAN KOH** (Stripe already configured — read-only display, no key changes) |
| 27 | `/admin/shipping` | Shipping setup | **ADAPT TO HIMALAYAN KOH** (Shippo already configured) |
| 28 | `/admin/settings` | Settings | **ADAPT TO HIMALAYAN KOH** |
| 29 | `/admin/settings/listing-playbook` | Marketplace playbook | **NOT APPLICABLE** |
| 30 | `/admin/gift-drop` | Free-gift campaign | **NOT APPLICABLE** (Luxedge business model) |
| 31 | `/admin/campaigns` | Campaign manager | **ADAPT TO HIMALAYAN KOH** (marketing centre) |
| — | `/admin/login` | Admin login screen | **ADAPT TO HIMALAYAN KOH** (Supabase Auth) |

Totals: **31 routes → 1 NOT-in-scope family is 13 NOT APPLICABLE, 17 ADAPT, 1 PORT-AS-IS (shell only).**
Nothing is silently dropped: the 13 are listed above with the reason.

### Cross-cutting

| System | Luxedge | Himalayan Koh today | Decision |
| --- | --- | --- | --- |
| Admin shell / sidebar | `AdminSection.tsx`: grouped gradient-icon sidebar, topbar, breadcrumbs, command-style quick actions, mobile bottom nav | HK: `src/app/admin/layout.tsx` → `src/components/admin/AdminLayout.tsx` | **REPLACE** with the Luxedge shell & grouping, **DROP** mobile nav, **LOCK** desktop |
| Design tokens | `src/index.css` (Tailwind CSS-first tokens: colours, radii, shadows, type scale) | HK: `globals.css` + `tailwind.config`-era classes + brand `himalayan` palette | **PORT** as an admin-scoped token layer; storefront tokens untouched |
| Fonts | Inter / Fraunces / Space Grotesk | HK storefront fonts | **ADAPT** — admin may adopt Inter; storefront typography unchanged |
| Icons | Phosphor | lucide-react | **ADAPT** — map Phosphor names onto lucide equivalents; do not add a second icon library |
| Charts | recharts | hand-rolled CSS bar charts | **ADAPT** — prefer the existing chart primitives until a chart module is actually needed |
| States | skeletons, empty states, error cards, toasts, confirm dialogs | HK has `Skeleton*`, `EmptyState`, `ToastContext` | **PORT** the patterns on top of HK's existing primitives |
| Tables | `features/catalog/tableColumns.ts`, column config, filters, sorting, bulk actions, pagination | HK: per-screen hand-built tables | **PORT** the table system (one owner) |

---

## 3. Sidebar taxonomy to reproduce

```
Overview   → Dashboard
Catalog    → Products · Promotions · Campaigns · Orders · Users · Categories · Reviews · Blog Posts
Media      → Media Hub
Marketing  → SEO Engine · Marketing Gen · Email Marketing · CRM
AI Studio  → (content-assist surface only — the seven marketplace/AI-studio tools are NOT APPLICABLE)
System     → Payments · Shipping · Settings
```

Groups are kept in this shape, with the NOT-APPLICABLE entries removed rather than
rendered as dead links (mandate §16: no dead buttons, no duplicate navigation).

---

## 4. Data-layer mapping (the part that must not be copied)

| Luxedge mechanism | Himalayan Koh replacement |
| --- | --- |
| `features/catalog/repository.ts` → Supabase products | `src/lib/backend/adminCatalog.ts` (already the single owner of admin catalog reads; `supabase` \| `woocommerce` branches) |
| Product writes via Supabase repo | WooCommerce REST v3 (`/wc/v3/products`) — **needs a read/write key; see §6 blockers** |
| `api/admin/*` Vercel functions | Next route handlers under `src/app/api/admin/*`, server-only |
| `api/ai/*` (Luxedge prompts/models) | Gemini server-side route handler (`GEMINI_API_KEY`, never `NEXT_PUBLIC_`) |
| `services/db` Supabase adapter | Not ported — HK keeps its own Supabase client for auth/orders/customers only |
| `store/authStore` (zustand) | HK `AuthContext` (Supabase Auth) |
| AdSense / CJ / Hermes / market-intel endpoints | Not ported (no equivalent business function) |

**Hard rule:** no second product database. WooCommerce is the commerce source of
truth; Supabase keeps auth, profiles, orders (until Phase 7 of the main migration)
and other non-catalog features.

---

## 5. Desktop-only admin (mandate §3)

The admin canvas is desktop-first and stays that way at every viewport:

- Admin root gets a minimum canvas width (derived from the Luxedge layout, ~1280px)
  and the viewport scrolls horizontally below it.
- Sidebar stays visible, tables stay tables, the dashboard grid keeps its proportions.
- No hamburger, no mobile drawer, no bottom navigation, no card-stacking, no
  breakpoint that swaps the admin layout.
- The public storefront keeps its existing responsive behaviour — this rule applies
  to `/admin/*` only.

Resolution targets to pass before any cutover: 1920×1080, 1600×900, 1440×900,
1366×768, 1280×720 and 1024×768 (horizontal scroll accepted), plus 80–125% zoom.

---

## 6. Blockers and their single unblocking action

| Blocker | Blocks | One action that unblocks it |
| --- | --- | --- |
| No WooCommerce **write** credentials | Product add/edit/duplicate/delete, variations, stock, coupons, media upload — and the whole "Luxedge product system" mandate | Create a **staging** WooCommerce REST key (Read/Write) and set `WOOCOMMERCE_CONSUMER_KEY` / `WOOCOMMERCE_CONSUMER_SECRET` in Vercel (Preview scope) + locally |
| `/wc/store/v1/products` HTTP 500 (staging **and** production) | Real price/stock/SKU on every WooCommerce-backed screen | Fix the staged PHP fatal (WP_DEBUG_LOG → read `debug.log`) or ship the read-only REST key above |
| No `GEMINI_API_KEY` | Gemini SEO/marketing assistance | Owner adds the key as a **server-only** env var |
| WooCommerce orders/customers not wired | Orders, customers, promotions, dashboard revenue on WooCommerce | Planned main-migration phase 7/8 — out of scope for the admin shell port |

None of these is a reason to stop the shell/layout/product-UI port: those can be
built against `adminCatalog.ts` and the existing honest-unknown rendering, then
switch to live commercial data when the credentials land.

---

## 7. Current Himalayan Koh admin (the thing being replaced)

12 routes under `src/app/admin/*`, each a thin re-export of a view in
`src/views/admin/*`: dashboard, products, categories, category-hubs, orders,
customers, crm, labels, analytics, blog, settings, api-keys.

Already correct and to be kept underneath the new UI:

- `src/lib/backend/adminCatalog.ts` — the single owner of admin catalog reads
  (storefront and admin now serve the same catalog; unknown commercial facts stay
  unknown).
- `src/lib/backend/*` — the WordPress/WooCommerce seam (degraded-mode warnings).
- `src/context/AuthContext` + protected/admin routes.
- Shippo packing profiles, Stripe/Shippo checks, `Skeleton*`/`EmptyState`/`Toast`.

---

## 8. Phase plan (each phase ends on a temporary URL, never on the preview alias)

| Phase | Scope | Gate |
| --- | --- | --- |
| A | Admin token layer + deskop-locked shell (`AdminLayout`, sidebar groups, topbar, states) | Renders at all six resolutions, sidebar always visible, storefront untouched |
| B | Table/UI system port (columns, filters, sorting, pagination, bulk actions, confirm dialogs) | Reused by products, orders, customers, users with no per-screen reimplementation |
| C | Products + product editor on WooCommerce (`adminCatalog.ts` + WC REST writes) | Add/edit/archive a `TEST - DELETE ME` product on **staging**, reflected through the WC API |
| D | Dashboard, categories, promotions, inventory, media | Real Woo counts; unavailable data says *Unavailable / Not configured* |
| E | Users & Roles, Settings (incl. Super Admin identity) | Add user by email, role change, disable, password reset, no credential ever displayed |
| F | SEO centre + Gemini assist (generate → review → apply) | Suggestions only; nothing auto-published |
| G | Marketing centre + analytics | Real data only; no bulk email sends during development |
| H | Visual parity pass vs Luxedge | Module-by-module comparison table (matched / adapted / missing) |

---

## 9. Status

- ✅ Luxedge admin inventoried: 31 routes, ~22.7k LOC, 30 server endpoints, sidebar taxonomy, token/icon/chart/font stacks, data layer and auth identified.
- ✅ Rollback point recorded (§0); branch `integration/luxedge-full-admin`; preview and production untouched.
- ✅ Phase A–D delivered: the console's token layer, primitives, desktop-locked shell, grouped navigation and the section set below.
- ⛔ Product writes still wait on the WooCommerce credential (§6). Sections whose backend is not connected say so instead of showing figures.

---

## 10. The console as built (read this before adding a screen)

Four layers, each owning one thing. Add to the bottom layer that fits; do not invent a fifth.

| Layer | File | Owns |
| --- | --- | --- |
| Visual system | `src/components/admin/adminTheme.ts` | Every surface, control, table, chip and rail class string. Colour comes from the `admin-*` tokens in `app/globals.css`. |
| Primitives | `src/components/admin/AdminUI.tsx` | `AdminPageHeader`, `AdminPanel`, `AdminStatTile`, `AdminChip`, `AdminNotice`, `AdminTable` + `ADMIN_TD` + `AdminTableSkeleton`, `AdminTabs`, `AdminPendingPanel`, `AdminDisabledAction`, and the control/dialog set: `AdminButton`, `AdminField`, `AdminInput`, `AdminTextarea`, `AdminFacts`/`AdminFact`, `AdminModal`. Each is dumb: no fetching, no policy. |
| Shell | `src/components/admin/AdminLayout.tsx` | The desktop canvas, the rail, the header, breadcrumb, global search, notifications, session menu. |
| Navigation | `src/lib/adminNav.ts` | Route list, grouping (Overview / Commerce / Content / Growth / System), icons, and the `pending` flag that marks a section as built-but-not-connected. |

### The desktop lock

The shell is an application frame, not a responsive page: `ADMIN_CANVAS_MIN_WIDTH = 1280`, the rail is a rail, the content pane is the only scroller. Below the canvas width the console scrolls horizontally rather than restacking. Consequences:

- **Never add a structural breakpoint to admin code** (`hidden`, `sm:`, `md:`, `lg:`, `xl:`) for layout. Fixed grids only (`grid-cols-6`, not `md:grid-cols-3`) — media queries read the *viewport*, so a breakpoint would collapse the layout inside a canvas that is still 1280 wide. This is exactly how the dashboard lost its proportions under the old shell.
- **No mobile admin navigation.** `ADMIN_MOBILE_NAV_ITEMS` and the drawer/hamburger/bottom-bar are deleted, not hidden. The rail renders at every viewport.
- The public storefront keeps its own responsive behaviour; nothing in this folder touches it.

### Dialogs — one implementation, three shapes

Every console dialog is `AdminModal`: backdrop, panel, titled header with a single close affordance, scrolling body, optional footer. It is a `motion` element, so callers mount it inside `<AnimatePresence>` and the exit animation runs; the caller owns what save/delete do. `variant="drawer"` is the same dialog against the right edge (the CRM lead detail), `size` picks the width (`sm` confirmations, `md` forms, `lg`/`xl` editors, `wide` the full post editor), and `footer` holds the actions — including the destructive `BUTTON.danger` and the product editor's error banner, which lives beside the button that produces it rather than at the top of a scrolled panel.

Consequence for new screens: never hand-roll an overlay. A page that needs a dialog composes `AdminModal`; a page that needs a confirm composes `AdminModal size="sm"` with `footer`.

### Unknown is a value

A source that cannot report a fact says so. `AdminStatTile` takes either a value or `unavailable` — there is no path that renders `0` for an unknown figure. Sections with no backend use `AdminPendingPanel`, which lists what the section will do, what it needs to go live, and what is already true today.

### Sections in this pass

| Section | Route | Data today |
| --- | --- | --- |
| Dashboard | `/admin` | Real: catalog stats from `readAdminCatalogStats()`, orders/revenue/customers from Supabase when configured. |
| Products | `/admin/products` | Real WooCommerce/Supabase rows via `readAdminCatalogPage()`. Add/Edit disabled in Woo mode with `WooCommerce write connection required`. |
| Inventory | `/admin/inventory` | Real reported stock status per product; counts and thresholds pending the WooCommerce REST key. |
| Media | `/admin/media` | Real catalog images and their origins; upload/replace pending WordPress media endpoints. |
| SEO | `/admin/seo` | Live crawler checks against this deployment (robots.txt, sitemap.xml, coverage, robots header). Metadata/redirects/audits pending the WordPress connection. |
| Marketing | `/admin/marketing` | Per-capability pending panels; no email is ever sent from a development build. |
| Coupons | `/admin/coupons` | Pending — WooCommerce owns discounts and no second store exists. |
| Users & Roles | `/admin/users` | Real administrator accounts from the auth provider; invites, role changes and resets pending a server-side privileged route. |

### Every route is on the system (this pass)

The ten views that still carried the old page language are re-skinned: `AdminCategories`, `AdminOrders`, `AdminCustomers`, `AdminAnalytics`, `AdminBlog`, `AdminCategoryHubs`, `AdminCRM`, `AdminShippingLabels`, `AdminSettings`/`AdminApiKeys`. So are the components they embed (`ProductEditorModal`, `ImageDropzone`, `ProductImageEditor`, `ShippingLabelPanel`, `RichTextEditor`). There is no per-view bespoke surface, control, table or chip left: each page composes `AdminPageHeader` + `AdminPanel` + `AdminTable`/`AdminField`/`AdminModal` and keeps its own data logic.

Two structural notes from that pass:

- **Stale `/admin/settings` redirect deleted** (`next.config.ts`). It sent the console back to the dashboard because no settings screen existed; `AdminSettings` exists and the rail links to it, so the entry used to be a dead link that silently bounced.
- **`TEXTAREA` moved into `adminTheme`** — `AdminBlog` and `AdminCategoryHubs` each had their own `const TEXTAREA = \`${INPUT} w-full resize-none\``; textareas now come from one export (or `AdminTextarea` when the label rhythm matters).

### Still open (not visual)

Product **writes** wait on the WooCommerce R/W credential; inventory counts, coupons, media library, SEO metadata write-back, marketing sends, and user administration all wait on their backends. Each says so through `AdminPendingPanel` rather than showing a number it does not have.
