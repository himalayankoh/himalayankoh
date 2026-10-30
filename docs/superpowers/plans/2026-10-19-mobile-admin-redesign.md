# Himalayan Koh — Premium Mobile Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## Plan Overview

Modernize the **MOBILE VERSION** (0–767px) of the existing Himalayan Koh Admin Panel using the two attached premium reference images:
1. **Reference 1: Leads Management — Premium Mobile UI** (Dark navy background, violet/blue glow, top stats card with glowing line wave chart and 4-column breakdown, search bar with filter sliders, horizontal filter chips, compact lead cards with quick actions [Call, Email, WhatsApp, View], bottom navigation bar).
2. **Reference 2: Email Inbox — Premium Mobile UI** (Dark navy background, 3 top stat cards [Total, Unread, Starred], search bar, horizontal filter chips, compact message cards with unread dot, sender avatar, subject, preview, star, attachment indicator, and full mobile thread view).

### Strict Constraints
- **Strictly Mobile Only (0–767px)**: Tablet & Desktop (768px and above) must remain visually and functionally 100% UNCHANGED.
- **Dark/Light Theme Switch (Mobile Only)**:
  - Top-right Sun (☀️) / Moon (🌙) toggle in mobile header.
  - Default: Dark mode for first-time mobile visitors.
  - Persisted in `localStorage` under `hk_mobile_theme`.
  - Scoped strictly to mobile; never applied to desktop widths.
- **Backend & Data Safety**:
  - Keep existing backend, database records, authentication, and API endpoints completely intact.
  - Never fabricate data or modify public storefront.

---

## File Structure & Responsibilities

```
src/
├── context/
│   └── MobileThemeContext.tsx          # Mobile Dark/Light theme state and persistent localStorage hook
├── components/
│   └── admin/
│       ├── AdminLayout.tsx             # Updated with MobileAdminHeader and MobileAdminBottomNav (scoped to md:hidden)
│       └── mobile/
│           ├── MobileAdminHeader.tsx   # Mobile header with menu button, dynamic route title/subtitle, theme toggle, notif bell
│           ├── MobileAdminBottomNav.tsx # Mobile bottom nav with Dashboard, Leads, Floating (+) Quick Add, Email, More
│           ├── MobileQuickAddModal.tsx # Quick actions bottom sheet (New Lead, Compose Email, Add Product, New Order)
│           ├── MobileThemeTokens.ts    # Design tokens for dark navy and polished light mode
│           ├── MobileLeadsView.tsx     # Premium Leads view matching Reference 1 (Stats card with wave graph, search, filter chips, lead cards)
│           ├── MobileEmailInboxView.tsx # Premium Email Inbox view matching Reference 2 (3-stat grid, search, filter chips, thread list, thread viewer)
│           └── MobileCardWrapper.tsx   # Mobile wrapper applying dark/light theme to other admin pages below 768px
```

---

## Tasks & Bite-Sized Steps

### Task 1: Mobile Theme Context & Persistence
- [ ] Create `src/context/MobileThemeContext.tsx` with `'dark'` default, SSR-safe mounting, and `localStorage` persistence.
- [ ] Wrap `AdminRootLayout` in `src/app/admin/layout.tsx` with `MobileThemeProvider`.
- [ ] Verify unit test or compile check that theme toggles properly without SSR hydration errors.

### Task 2: Mobile Admin Shell (Header, Navigation & Quick Add)
- [ ] Create `src/components/admin/mobile/MobileAdminHeader.tsx`:
  - Hamburger menu button (opens drawer).
  - Dynamic page title and subtitle mapped to current admin route.
  - Theme Toggle button: Sun (☀️) for Light mode, Moon (🌙) for Dark mode, 44x44px touch target, smooth transition.
  - Notification button: Bell (🔔) with unread badge pulse.
- [ ] Create `src/components/admin/mobile/MobileAdminBottomNav.tsx`:
  - 5 items: Dashboard, Leads, Center Floating (+), Email, More.
  - Elevated radiant purple gradient for `+` button with glowing drop shadow.
  - Active indicator for current tab.
- [ ] Create `src/components/admin/mobile/MobileQuickAddModal.tsx`:
  - Bottom sheet drawer with quick action shortcuts.
- [ ] Update `src/components/admin/AdminLayout.tsx` to conditionally render `MobileAdminHeader` and `MobileAdminBottomNav` on `md:hidden`, keeping desktop layout 100% untouched on `md:` and `lg:`.

### Task 3: Premium Mobile Leads Management (Reference 1)
- [ ] Create `src/components/admin/mobile/MobileLeadsView.tsx`:
  - Real statistics card: Total Leads, "+12% This Month" pill, glowing SVG curved line wave graph, 4-column mini cards (New, Contacted, Qualified, Converted).
  - Search input with filter slider button.
  - Horizontally scrollable filter chips (All, New, Contacted, Qualified, Converted).
  - Lead Cards matching Reference 1:
    - Avatar circle with initial / photo.
    - Contact/buyer name, business name, email, phone number.
    - Quick Action icon buttons: Call (`tel:`), Email (`mailto:`), WhatsApp (`https://wa.me/`), View details.
    - Time ago badge, Status badge pill (New, Contacted, Qualified, Converted).
    - Three dots menu.
  - Lead Details Drawer: View/update notes, status, contact info.
- [ ] Integrate `MobileLeadsView` into `src/admin/LeadOSAdmin.tsx` under `md:hidden`, preserving desktop table and maps on `hidden md:block`.

### Task 4: Premium Mobile Email Inbox (Reference 2)
- [ ] Create `src/components/admin/mobile/MobileEmailInboxView.tsx`:
  - 3 Top Stat Cards in a row: Total Emails (blue icon), Unread (purple icon), Starred (amber icon).
  - Search input with filter button.
  - Filter Chips: All, Inquiries / Primary, LeadOS, Sent, Starred, Drafts.
  - Message list cards matching Reference 2:
    - Glowing unread blue dot.
    - Avatar circle with sender initial.
    - Sender name, time ago, star toggle button.
    - Subject line and message preview snippet.
    - Attachment paperclip icon.
  - Mobile Thread Detail View:
    - Back button to list.
    - Sender/recipient details, full message body, attachments.
    - Quick reply bar, Reply All, Forward, Compose modal.
- [ ] Integrate `MobileEmailInboxView` into `src/admin/EmailInboxAdmin.tsx` under `md:hidden`, preserving the 3-pane desktop layout on `hidden md:flex`.

### Task 5: Mobile Dark & Light Theme Styling for Other Admin Pages
- [ ] Create mobile-scoped CSS styles / wrapper in `src/components/admin/mobile/MobileThemeTokens.ts` and `src/app/globals.css`.
- [ ] Apply theme tokens so all admin pages (Products, Orders, Customers, Dashboard, Settings) adopt the sleek dark navy (in Dark mode) or crisp off-white (in Light mode) below 768px.
- [ ] Ensure desktop styles above 767px remain 100% identical to the approved production design.

### Task 6: Verification, Production Gate, Build & Deployment
- [ ] Run `npm run typecheck` — 0 errors.
- [ ] Run `npx vitest run` — all tests pass.
- [ ] Run `npm run lint` — 0 errors.
- [ ] Run `npm run check:production-gate` — 26/26 passed.
- [ ] Run `npm run build` — Next.js build succeeds cleanly.
- [ ] Commit and push to active `origin/integration/cloudflare-workers-migration`.
- [ ] Deploy with `npm run deploy:production` and verify live SHA on `https://himalayankoh.com/api/version`.
- [ ] Output Section 22 report.
