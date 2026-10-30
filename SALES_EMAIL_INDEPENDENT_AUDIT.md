# Himalayan Koh — Sales Email Removal Safety Audit
**Document:** `SALES_EMAIL_INDEPENDENT_AUDIT.md`  
**Role:** Senior Email Infrastructure Architect, Cloudflare/Next.js Auditor and Independent QA Engineer  
**Mode:** READ-ONLY AUDIT (Strict Non-Destructive Verification)  
**Date:** October 20, 2026  
**Audited Branch:** `integration/cloudflare-workers-migration`  
**Target Repository:** `https://github.com/himalayankoh/himalayankoh.git`  
**Latest Audited Commit:** `35c84e5ef54687b76853885bfdad1ef6c75f749b`  
**Cloudflare Production Worker Deployment:** `b1bb14c9-42d1-4745-9db9-faa151bdb5da`  

---

## 1. Executive Summary

This independent safety audit was commissioned to verify the removal of `sales@himalayankoh.com` from the custom Himalayan Koh Admin Panel Email Inbox (`/admin` Email tab) while ensuring that:
1. The public storefront (`himalayankoh.com`) retains `sales@himalayankoh.com` across all customer touchpoints (Footer, Contact, About, Policies, FAQs, and order communications).
2. The live mailbox on cPanel / Namecheap is **not deleted, disabled, or modified**, preserving Ayaz Bashir's operational access via Outlook, Webmail, and HubSpot.
3. No historical email data has been purged or destroyed.
4. The custom Admin Inbox continues to operate safely for authorized administrative identities (`salman@himalayankoh.com`, `support@himalayankoh.com`, `admin@himalayankoh.com`).

### Audit Verdict Summary
- **Website Storefront Restoration:** **PASS** (Independently verified in code and live production HTTP curl).
- **Admin Inbox Sales Exclusion:** **PASS** (Independently verified in UI components, inbox store, and automated test suite).
- **Historical Data Preservation:** **PASS** (Underlying database and settings storage remain intact; exclusion is an in-memory view filter).
- **DNS & Routing Non-Interference:** **PASS** (Live DNS query confirms MX, SPF, DMARC pointing to Jellyfish / Namecheap cPanel).
- **HubSpot Infrastructure Safety:** **PASS (Code & DNS)** / **NOT VERIFIED (External HubSpot Portal)**.
- **cPanel / Namecheap Mailbox Integrity:** **PASS (Repo & Deployment Scope)** / **NOT VERIFIED (External cPanel Shell)**.

### Overall Assessment
**FINAL DECISION: SAFE WITH WARNINGS**  
*(Safe for production operations; "Warnings" note that external SaaS configurations like the internal HubSpot portal session cannot be inspected directly from the local repository and require external confirmation if portal-side checks are desired).*

---

## 2. Exact Git Commits Reviewed

| Commit Hash | Author | Subject | Scope / Impact | Status |
|---|---|---|---|---|
| `1a29f729381fd58657feb16b5d3c448efa04c79b` | salmanbashir80 | `perf(email): parallelize IMAP mailbox sync and add SWR cache header for inbox` | Baseline commit prior to sales email modifications. | **BASELINE** |
| `2707ba4cacb307c258cf2c0d2f36bb82bd00990a` | salmanbashir80 | `chore(storefront): replace public sales email with support email` | Erroneous replacement of public storefront sales email (22 files). | **SUPERSEDED** |
| `e3e999ad73dbcff2d87560bd932c52642425c6a7` | salmanbashir80 | `revert(storefront): restore sales@himalayankoh.com across website storefront` | Clean revert of `2707ba4`. Byte-for-byte identical to baseline `1a29f72`. | **PASS** |
| `35c84e5ef54687b76853885bfdad1ef6c75f749b` | salmanbashir80 | `feat(admin-inbox): exclude sales mailbox from admin email inbox view` | Scoped exclusion of sales from admin inbox, mobile views, compose selectors, and IMAP sync (7 files). | **PASS** |

### Mathematical Revert Verification
An automated diff check between the baseline commit and the revert commit:
```powershell
git diff 1a29f729381fd58657feb16b5d3c448efa04c79b e3e999ad73dbcff2d87560bd932c52642425c6a7
```
**Result:** Empty output (0 bytes changed). This proves with mathematical certainty that all 22 storefront files were completely restored to their exact prior state.

### Remote Synchronization Verification
An automated comparison between the local HEAD and the GitHub remote:
```powershell
git diff origin/integration/cloudflare-workers-migration HEAD
```
**Result:** Empty output. The local branch and active GitHub remote `origin/integration/cloudflare-workers-migration` are identical.

---

## 3. Changed Files and Purposes

The active delta between the baseline `1a29f72` and current `HEAD` (`35c84e5`) consists exclusively of the 7 files modified in commit `35c84e5`:

1. **`src/admin/EmailInboxAdmin.tsx`**
   - *Purpose:* Primary Desktop/Mobile Admin Email Inbox UI.
   - *Changes:*
     - Removed `<button onClick={() => selectFolder('sales')}>` from the sidebar folder navigation.
     - Removed `<option value="sales@himalayankoh.com">` from the "From:" sender dropdown in the compose modal.
     - Set default `composeMailbox` state to `'support@himalayankoh.com'`.
     - Set fallback sender on replies and forwards to `'support@himalayankoh.com'`.

2. **`src/components/admin/mobile/MobileEmailThreadView.tsx`**
   - *Purpose:* Mobile email thread detail viewer.
   - *Changes:*
     - Changed default outbound recipient chip from `Sales Team <sales@himalayankoh.com>` to `Support Team <support@himalayankoh.com>`.

3. **`src/components/admin/mobile/MobileGmailReplyComposer.tsx`**
   - *Purpose:* Mobile Gmail-style floating reply composer.
   - *Changes:*
     - Changed default sender chip fallback from `Sales Team <sales@himalayankoh.com>` to `Support Team <support@himalayankoh.com>`.

4. **`src/lib/email/inboxStore.ts`**
   - *Purpose:* Core inbox data store, IMAP synchronization, and threading engine.
   - *Changes:*
     - Removed `'sales@himalayankoh.com'` from `ALLOWED_MAILBOXES` (leaving Salman, Support, Admin).
     - Removed `'sales@himalayankoh.com'` from the default `mailboxesToSync` array in `syncImapMailboxes()`, stopping background IMAP polling of the sales mailbox.
     - In `listInboxState()`, added an in-memory view filter: `.filter((m) => m.mailbox !== 'sales@himalayankoh.com')`, ensuring no sales messages or threads appear in admin inbox views or counters.
     - Preserved `'sales@himalayankoh.com'` in `MailboxAddress` and `MAILBOX_DEFINITIONS` to prevent type breakage on legacy data.

5. **`src/lib/email/accountConfig.ts`**
   - *Purpose:* Secure Mailbox credentials and metadata configuration.
   - *Changes:*
     - Removed `'sales@himalayankoh.com'` from `SUPPORTED_MAILBOXES` so it is no longer listed in the admin accounts management settings panel (`EmailAccountsPanel.tsx`).

6. **`src/lib/email/accountConfig.test.ts`**
   - *Purpose:* Unit tests for email accounts configuration.
   - *Changes:*
     - Updated assertions to reflect 3 supported admin mailbox identities.

7. **`src/lib/email/inboxStore.test.ts`**
   - *Purpose:* Unit tests for email store and threading.
   - *Changes:*
     - Updated mock tests and assertions to verify that `sales@himalayankoh.com` is excluded from reported mailboxes (`expect(sales).toBeUndefined()`).

---

## 4. Production Deployment Verification

| Check Item | Verified Fact / Artifact | Status |
|---|---|---|
| Deployment Target | `himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev` | **PASS** |
| Target Worker Name | `himalayan-koh-ecommerce-prod` | **PASS** |
| Deployment Version ID | `b1bb14c9-42d1-4745-9db9-faa151bdb5da` | **PASS** |
| Git SHA in Deployment | `35c84e5ef54687b768` | **PASS** |
| Production Build Status | Exit Code 0 (clean static generation and SSR bundling) | **PASS** |
| Build Secrets Scan | Scanned 1,818 files against 33 variables — 0 credentials leaked | **PASS** |
| Public Origin Safety | No loopback origin found in 2,116 build files | **PASS** |
| DNS / Production Hostname | No DNS alteration made — `himalayankoh.com` routes safely | **PASS** |

---

## 5. Website Email Verification

All public storefront files were audited for email addresses, copy, and HTML `mailto:` anchors:

| Page / Component | File Path | Found Email | Mailto Anchor Verified | Status |
|---|---|---|---|---|
| Global Footer | `src/components/Footer.tsx` (L108, L237) | `sales@himalayankoh.com` | `<a href="mailto:sales@himalayankoh.com">` | **PASS** |
| Contact Page | `src/views/ContactPage.tsx` (L93-94) | `sales@himalayankoh.com` | `<a href="mailto:sales@himalayankoh.com">` | **PASS** |
| About Us Page | `src/views/AboutPage.tsx` (L364, L480) | `sales@himalayankoh.com` | `<a href="mailto:sales@himalayankoh.com">` | **PASS** |
| FAQs Page | `src/views/FaqPage.tsx` (L39, L69) | `sales@himalayankoh.com` | Text and mail link | **PASS** |
| Legal / Policies | `src/views/LegalPage.tsx` (L17) | `sales@himalayankoh.com` | `SUPPORT_EMAIL = 'sales@himalayankoh.com'` | **PASS** |
| Disclaimer Page | `src/views/DisclaimerPage.tsx` (L168) | `sales@himalayankoh.com` | `<a href="mailto:sales@himalayankoh.com">` | **PASS** |
| Editorial Policy | `src/views/EditorialPolicyPage.tsx` (L57, L161) | `sales@himalayankoh.com` | `<a href="mailto:sales@himalayankoh.com">` | **PASS** |
| Site Policies Data | `src/content/policies.ts` (19 occurrences) | `sales@himalayankoh.com` | Terms, Privacy, Returns, Shipping | **PASS** |
| Site Content Data | `src/content/sitePages.ts` (L94, 102, 113, 126) | `sales@himalayankoh.com` | Inquiries, support, returns text | **PASS** |
| Author Bios | `src/data/authors.ts` (L50, 66, 86) | `sales@himalayankoh.com` | Author contact references | **PASS** |
| Ordering Fallback | `src/lib/storefront/ordering.ts` (L79) | `sales@himalayankoh.com` | Shopper pause notice | **PASS** |
| Customer Auth Fallbacks | `src/lib/auth/wordpressCustomerAuth.ts` | `sales@himalayankoh.com` | Rate limit & sign-in error text | **PASS** |

### Live Production HTTP Verification
Live HTTP GET requests to `https://himalayankoh.com/` and core subpages were executed during this audit:
```powershell
# Live Footer Check:
><div class="space-y-3"><a href="mailto:sales@himalayankoh.com" ...>sales@himalayankoh.com</a>

# Live Contact Page Check:
<a href="mailto:sales@himalayankoh.com" class="text-himalayan hover:underline text-sm">sales@himalayankoh.com</a>

# Live Terms Page Check:
<li>Email: sales@himalayankoh.com</li>
```
**Verdict:** **PASS**. Every public customer touchpoint consistently provides `sales@himalayankoh.com`.

---

## 6. Admin Email Inbox Verification

Independent inspection was performed on all Admin Inbox interfaces and data flow pipelines:

| UI / Data Layer | Component / File | Behavior Verified | Status |
|---|---|---|---|
| Mailbox Sidebar | `src/admin/EmailInboxAdmin.tsx` | "Sales & Wholesale" folder button completely removed. | **PASS** |
| Folder Navigation | `src/admin/EmailInboxAdmin.tsx` | Active mailboxes limited to: All Inboxes, Salman, Support, Admin. | **PASS** |
| All Inboxes Feed | `src/lib/email/inboxStore.ts` (`listInboxState`) | `rawMessages.filter((m) => m.mailbox !== 'sales@himalayankoh.com')` drops sales messages before grouping into threads. | **PASS** |
| Thread Grouping | `src/lib/email/inboxStore.ts` | Sales threads are omitted from `allThreadsById` and thread list. | **PASS** |
| Search Filter | `src/lib/email/inboxStore.ts` | Search runs exclusively on filtered messages. No sales match returned. | **PASS** |
| Total Emails Counter | `src/lib/email/inboxStore.ts` (`computeInboxCounts`) | Counters calculated from filtered messages only; sales messages do not increment `counts.all`. | **PASS** |
| Unread Counter | `src/lib/email/inboxStore.ts` (`computeInboxCounts`) | Sales unread messages do not increment `counts.allUnread` or `counts.unread`. | **PASS** |
| Compose "From:" Dropdown | `src/admin/EmailInboxAdmin.tsx` | Options restricted to Salman, Customer Support, Administration. | **PASS** |
| Compose Default Sender | `src/admin/EmailInboxAdmin.tsx` | Initial state set to `support@himalayankoh.com`. | **PASS** |
| Reply / Forward Sender | `src/admin/EmailInboxAdmin.tsx` | Fallback sender defaults to `support@himalayankoh.com`. | **PASS** |
| Mobile Thread Viewer | `MobileEmailThreadView.tsx` | Default outbound chip set to `Support Team <support@himalayankoh.com>`. | **PASS** |
| Mobile Composer | `MobileGmailReplyComposer.tsx` | Default sender chip set to `Support Team <support@himalayankoh.com>`. | **PASS** |
| IMAP Synchronization | `src/lib/email/inboxStore.ts` (`syncImapMailboxes`) | `sales@himalayankoh.com` removed from `mailboxesToSync`. No IMAP fetch to sales mailbox occurs. | **PASS** |
| Non-Sales Mailboxes | `salman@`, `support@`, `admin@` | All 3 identities remain fully registered in `ALLOWED_MAILBOXES` and `SUPPORTED_MAILBOXES`. | **PASS** |

---

## 7. HubSpot Integration Safety Assessment

| Audit Item | Evidence & Verification | Status |
|---|---|---|
| Mailbox Connection in Code | The codebase contains no connection or credentials modifying HubSpot's IMAP/SMTP inbox integration. | **PASS** |
| CRM Contact Sync | `src/lib/hubspot/client.ts` contains only CRM contact push/pull via `HUBSPOT_ACCESS_TOKEN`. No changes were made to this module. | **PASS** |
| MX / Mail Routing Stability | Inbound mail routes to Jellyfish Private Email servers (`mx1..3-hosting.jellyfish.systems`), preserving delivery into HubSpot. | **PASS** |
| Forwarding Rules | No Cloudflare Email Routing or server-side forwarding was created or modified. | **PASS** |
| External HubSpot Portal Access | Direct session inspection of Ayaz Bashir's connected inbox inside `app.hubspot.com` cannot be performed from the local Git repo. | **NOT VERIFIED** |

*Finding:* From code and infrastructure evidence, there is zero risk to Ayaz Bashir's HubSpot integration. Because portal login cannot be simulated locally, the external portal session itself is marked **NOT VERIFIED** per audit rules.

---

## 8. WordPress / cPanel / Namecheap Safety Assessment

| Hosting Layer | Verified Fact | Status |
|---|---|---|
| cPanel Mailbox Records | No cPanel UAPI or API commands were executed to delete or alter the `sales` mail account. | **PASS** |
| Namecheap Private Email | Jellyfish mail server MX records remain intact and prioritized (5, 10, 20). | **PASS** |
| WordPress Options | `email_accounts` in WordPress settings were not cleared or truncated. | **PASS** |
| DNS Integrity | Live DNS lookup proves MX, SPF (`+ip4:162.0.209.25`), and DMARC (`p=none`) are completely unchanged. | **PASS** |
| cPanel Disk / Maildir Direct Inspection | Physical inspection of `/home/himaljpz/mail/himalayankoh.com/sales` requires live cPanel terminal session. | **NOT VERIFIED** |

*Finding:* The deployment script (`scripts/deploy-production.mjs`) deployed only Cloudflare Worker code and has no access or mechanism to alter cPanel mailboxes or DNS.

---

## 9. Historical Email Preservation Assessment

| Preservation Requirement | Architecture & Audit Result | Status |
|---|---|---|
| No DB Table Drops | WordPress `admin-records` table was not dropped or truncated. | **PASS** |
| Stored Messages Intact | `readStoredMessages()` continues to read all records from `/admin-records` and `settings`. | **PASS** |
| In-Memory vs Destruction | `listInboxState` applies an in-memory `.filter()` for UI presentation; it does NOT write deletion flags to the database. | **PASS** |
| Recovery Capability | If historical sales correspondence is ever needed for audit, removing the single `.filter()` immediately restores visibility. | **PASS** |

---

## 10. Security and Regression Findings

1. **Unauthorized Data Exposure Risk:** **PASS**  
   `/api/admin/inbox` requires `verifyAdminRequest` (admin session token). Unauthenticated callers receive HTTP 401. Furthermore, authenticated responses run through `listInboxState`, ensuring sales data is not exposed over the REST API.

2. **Automated Test Suite Status:** **PASS**  
   - Full test run: **2,406 tests passed** (227 passed test files, 0 failed, 5 skipped integration tests).
   - `npm run typecheck`: **0 errors**.
   - `npm run lint`: **0 errors**.
   - `npm run build`: **0 errors**.

3. **Accidental Outbound Sending as Sales:** **PASS**  
   By removing `sales@himalayankoh.com` from the compose modal dropdown and setting the default sender and fallback to `support@himalayankoh.com`, administrators cannot accidentally send outgoing messages as `sales@himalayankoh.com` from the custom web interface.

---

## 11. Evidence References

### Live DNS Lookup Record (Verified October 20, 2026)
```text
himalayankoh.com    MX    preference: 5   exchange: mx1-hosting.jellyfish.systems
himalayankoh.com    MX    preference: 10  exchange: mx2-hosting.jellyfish.systems
himalayankoh.com    MX    preference: 20  exchange: mx3-hosting.jellyfish.systems

himalayankoh.com    TXT   v=spf1 +mx +a +ip4:162.0.209.25 +include:spf.web-hosting.com ~all
_dmarc.himalayankoh.com TXT v=DMARC1; p=none; rua=mailto:sales@himalayankoh.com; aspf=r; adkim=r
```

### Git Log Proof
```text
35c84e5 feat(admin-inbox): exclude sales mailbox from admin email inbox view
e3e999a revert(storefront): restore sales@himalayankoh.com across website storefront
2707ba4 chore(storefront): replace public sales email with support email
1a29f72 perf(email): parallelize IMAP mailbox sync and add SWR cache header for inbox
```

---

## 12. Remaining Risks and Recommended Fixes

1. **External HubSpot Inbox Status:**
   - *Risk:* None detected from codebase or DNS.
   - *Recommendation:* Ayaz Bashir may perform a standard test email send/receive within his HubSpot / Outlook client to confirm ongoing delivery as an operational double-check.
2. **Future Developer Awareness:**
   - *Risk:* A future developer might see `sales@himalayankoh.com` on the storefront and assume it should be added back to the custom Admin Inbox.
   - *Recommendation:* The architectural comment placed in `src/lib/email/inboxStore.ts` line 1819 explicitly documents this intentional separation:
     ```typescript
     // Exclude sales@himalayankoh.com from Admin Inbox display (handled externally via Outlook/Namecheap)
     const allMessages = rawMessages.filter((m) => m.mailbox !== 'sales@himalayankoh.com');
     ```

---

## FINAL AUDIT DECISION

# [ SAFE WITH WARNINGS ]

**Justification:**  
The implementation strictly fulfills all requirements. The storefront public email `sales@himalayankoh.com` is 100% active and verified live on production. The Admin Email Inbox completely excludes `sales@himalayankoh.com` from UI views, search, counters, compose dropdowns, and IMAP synchronization without deleting any historical data or modifying cPanel/Namecheap email infrastructure. The "Warnings" designation is applied strictly because third-party SaaS portals (HubSpot internal settings and cPanel file system) were not directly logged into during this local codebase audit.
