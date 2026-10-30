# Himalayan Koh — Hermes Ingest Backend, Salman OS Bridge & n8n Foundation

## 1. Architecture & Boundaries

```
[ Hermes Computer Use / Agents ] ──┐
[ Salman OS External Router    ] ──┼─► [ POST /api/hermes/ingest ] ──► [ Supabase: hermes_evidence ] ──► [ Admin AI Intelligence UI ]
[ n8n Automation Workflows     ] ──┘         (Auth + Validation + Dedupe)     (Dedicated Evidence Store)         (/admin/ai-intelligence)
                                                                                                                     │
                                                                                                        [ Owner Review & Actions ]
                                                                                                        (Manual Qualification Only)
                                                                                                                     │
                                                                                       [ NO Direct Auto-Writes to Woo / Production ]
```

### Roles & Responsibilities
- **Hermes**: External research agent providing product opportunities, competitor pricing, SEO gap analysis, and catalog QA observations.
- **Salman OS**: AI orchestration router coordinating models and research tasks. Configured with project slug `himalayan-koh`.
- **n8n**: Workflow automation platform running scheduled crawls, monitoring feeds, and submitting research findings to the ingest API.
- **Himalayan Koh Application**: Authoritative review and e-commerce system. Provides the authenticated ingest endpoint, enforces idempotency, displays evidence in `/admin/ai-intelligence`, and safeguards WooCommerce from automated mutations.

### Strict Security Boundary
> [!IMPORTANT]
> **RESEARCH EVIDENCE ONLY**: The `/api/hermes/ingest` endpoint accepts research evidence into the Himalayan Koh review system. It **NEVER** directly:
> - Modifies WooCommerce products, pricing, or stock
> - Publishes blog posts
> - Changes site settings or payment configurations
> - Dispatches customer emails or executes live ads
> - Alters production databases

---

## 2. Ingestion Endpoint & Authentication

- **Endpoint**: `POST https://preview.himalayankoh.com/api/hermes/ingest` (Staging)
- **Local Dev**: `POST http://localhost:3000/api/hermes/ingest`
- **Health / Contract**: `GET https://preview.himalayankoh.com/api/hermes/health`
- **Content-Type**: `application/json`
- **Payload Limit**: `100 KB` maximum
- **Rate Limit**: `120 requests / minute` per IP/client

### Authentication Headers
The ingest API supports token authentication via any of the following headers:
```http
Authorization: Bearer <HERMES_INGEST_TOKEN>
```
or
```http
x-hermes-token: <HERMES_INGEST_TOKEN>
```
or
```http
x-salman-os-token: <SALMAN_OS_TOKEN>
```

Secrets are configured on the server via `HERMES_INGEST_TOKEN` or `SALMAN_OS_TOKEN` (in `.env.local`, `.dev.vars`, or Supabase `site_settings`). Credentials are **never** exposed in client bundles, public HTML, or log outputs.

---

## 3. Normalized Evidence Contract

All research submissions must adhere to the normalized evidence schema:

```json
{
  "source": "hermes | salman-os | n8n",
  "type": "product | seo | free_marketing | free_listing | market | marketing | ads | catalog_qa | competitor | blog_topic | content_gap | pricing_observation",
  "entity": {
    "sku": "optional string (max 100 chars)",
    "woo_id": "optional number or string",
    "slug": "optional string (max 200 chars)",
    "category_slug": "optional string (max 100 chars)"
  },
  "title": "Short descriptive title (1 - 300 chars)",
  "summary": "Detailed research findings summary (1 - 5000 chars)",
  "evidence": [
    {
      "url": "https://example.com/source (valid http/https, max 1000 chars)",
      "label": "Source label (max 200 chars)",
      "observation": "Specific factual observation (max 2000 chars)"
    }
  ],
  "confidence": 85,
  "priority": "low | medium | high | critical",
  "recommended_action": "Suggested manual review action (max 2000 chars)",
  "observed_at": "2026-09-19T12:00:00.000Z",
  "dedupe_key": "hermes_product_opportunity_20260919_001",
  "metadata": {
    "customField": "arbitrary serializable JSON (max 50KB)"
  }
}
```

### Whitelisted Types
1. `product`: Product opportunity or new formulation suggestion
2. `pricing_observation`: Competitor price shifts or wholesale pricing benchmarks
3. `competitor`: Competitor positioning or packaging observation
4. `seo`: Search engine optimization suggestion or keyword target
5. `content_gap`: Missing content angle or educational topic
6. `blog_topic`: Suggested blog article concept
7. `free_marketing`: Organic reach strategy, forum, or social channel opportunity
8. `free_listing`: Unpaid business or product directory listing opportunity
9. `market`: Broad agricultural, culinary, or animal wellness market trend
10. `marketing`: Brand positioning or campaign concept
11. `ads`: Paid ads creative or audience targeting research
12. `catalog_qa`: QA finding (e.g. broken image link, missing alt text, duplicate SKU)

---

## 4. Deduplication & Idempotency

- The database table `public.hermes_evidence` enforces a unique constraint on `dedupe_key`:
  ```sql
  CREATE UNIQUE INDEX hermes_evidence_dedupe_key_idx ON public.hermes_evidence (dedupe_key);
  ```
- **First Submission**: Returns `HTTP 201 Created` with `{ status: "CREATED", dedupe_key: "...", id: "..." }`.
- **Subsequent Submissions**: When the same `dedupe_key` is submitted again, the system does not create duplicate records. It returns `HTTP 200 OK` with `{ status: "ALREADY_EXISTS", dedupe_key: "...", id: "..." }`.

---

## 5. Salman OS Bridge Configuration

- **Target Project Slug**: `himalayan-koh` (configured dynamically via `SALMAN_OS_PROJECT_SLUG` or `site_settings`).
- **Target Environment**: `staging` on preview, `production` on live.
- **Server-Side Settings**:
  - `SALMAN_OS_BASE_URL`: Public HTTPS base URL of the Salman OS router.
  - `SALMAN_OS_TOKEN`: Integration token.
- **Handshake Response**: Validates contract version 1.0 and registers Himalayan Koh capabilities as `research_evidence_only`.

---

## 6. n8n Expected Workflow Contract

When building n8n workflows for Himalayan Koh:
1. Use an **HTTP Request** node targeting `https://preview.himalayankoh.com/api/hermes/ingest`.
2. Method: `POST`.
3. Authentication: Header `Authorization` with value `Bearer <HERMES_INGEST_TOKEN>` or `x-hermes-token`.
4. Body: JSON matching the Normalized Evidence Contract above.
5. Generate deterministic, stable `dedupe_key` values (e.g., `n8n_qa_${sku}_${date}` or `n8n_seo_${keyword}`).
6. Handle response codes:
   - `201`: Successfully ingested new finding.
   - `200`: Already received (safe to ignore).
   - `400`: Payload rejected due to schema error.
   - `401 / 403`: Authentication failure.
   - `429`: Backoff and retry.

---

## 7. Review & Approval Workflow

All ingested items appear in **Admin → AI Intelligence** (`/admin/ai-intelligence`):
- Filterable by 8 core tabs: **Products**, **SEO**, **Free Marketing**, **Free Listings**, **Market**, **Marketing**, **Ads**, **Catalog QA**.
- Status transitions:
  - `new`: Initial state upon ingestion.
  - `reviewed`: Evaluated by team member with review notes.
  - `accepted`: Approved for manual action.
  - `dismissed`: Evaluated and rejected.
- **Contextual Actions**:
  - Products: Quick link to search product in `/admin/products`.
  - SEO: Quick link to launch the `/admin/seo` AI SEO Engine.
  - Blog: Quick link to `/admin/blog`.
  - Catalog QA: Direct navigation to affected product card.
