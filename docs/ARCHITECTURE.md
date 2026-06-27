# Architecture

> Perseus Clew system architecture.
> How the parts fit together. How a scan flows end to end. What this system will and won't do.

**Status:** May 27, 2026. Next.js on Vercel with an API route that does real work (scan initiation). The benchmark page serves static data. Entering into the H0 Hackathon (B2B track, deadline June 29). The scan engine, Bedrock simulation, and EventBridge refresh stay on AWS. Written for Kiro, future contributors, and the builder returning after a break.

**Naming:** Perseus Clew is the engine name used throughout this document and the rest of the engineering artifacts. The public-facing product is **Agentis Lux**, which is what end users see in the UI, on the website (agentislux.io), and in marketing. Architecture, backend specs, and code all use "Perseus Clew" because that's where the engineering identity lives. See the Project Checklist (external design document) "Naming Convention" section for details.

**Scope:** This document is the system view. It names the parts and describes how they relate. Detailed specs live in sibling documents:

- `BACKEND-SHARED.md`, `BACKEND-FRONTEND-CHECKS.md`, `BACKEND-API-CHECKS.md` â€” scan engine, module contracts, check definitions at the interface level
- `FRONTEND-SPEC.md` â€” Next.js app (App Router), routes, API routes, components, state
- `BUILD-PLAN.md` (external design document) â€” security implementation, testing strategy, build sequence, risks
- `SCORING.md` â€” public scoring methodology (already published)

**Source of truth:** This document derives from the Perseus Clew Product Review (v5, signed off; external design document) and the Project Checklist (external design document). Any contradiction with those documents is a bug in this one.

---

## 1. Purpose and Scope

Perseus Clew is a web application that scans a URL, a public GitHub repository, or an OpenAPI specification and produces a report describing what an AI agent would experience when it tries to use that product.

The system must:

- Scan public URLs at MVP (gated/501-stubbed for public GitHub repos and OpenAPI spec uploads in the UI, which are reserved for the Team tier)
- Scan OpenAPI specifications on the backend at MVP (powers the 50-site benchmark)
- Return findings without suggested fixes
- Publish its scoring methodology in the repository
- Pass its own scan for agent-readiness and WCAG 2.1 AA
- Store anonymous scan results for 24 hours (TTL) to enable future shareable result links, then auto-delete. No PII, no IP, no cross-scan linkage. (The current UI does not yet surface these shareable links.)
- Run its scan engine, simulation, and refresh on AWS; serve its Next.js frontend (including the `/api/scan` route) on Vercel
- Be containerized so the scan engine runs anywhere with `docker compose up`

The system must not:

- Store full HTML or API spec content from any scan
- Store raw IPs or any identifier that links one anonymous scan to another
- Require an account for anonymous scans (the signed-in tier is opt-in)
- Suggest code fixes
- Execute JavaScript during scans (Lambda does not run a browser)
- Rank or judge (findings describe what an agent sees, not what the developer did wrong)

This doc names the parts. The four sibling documents define how each part is built.

---

## 2. The Three Layers

Perseus is built in three layers. Each layer adds capability without altering the layers beneath it. Each can be tested in isolation.

### Layer 1: Deterministic Scan (MUST at MVP)

Pattern matching on HTML and OpenAPI specs. No AI calls. Same input produces same score, every time. This is the foundation.

For frontend scans: the six check modules implemented in JavaScript (Node.js on Lambda). Each module examines HTML or JSX/TSX files, counts patterns, and returns a structured result with `passed`, `total`, and `findings` fields.

For API scans: six check modules that parse an OpenAPI 3.x or Swagger 2.0 spec and examine naming, error design, discoverability, response shape, reliability patterns, and agent integration. The contract matches the frontend modules: `passed`, `total`, `findings`.

The scoring module consumes check module outputs and applies the weights defined in `SCORING.md`. Scoring knows nothing about HTML or OpenAPI. It knows weights and math.

### Layer 2: Agent Simulation (MUST at MVP)

The simulation module sends the scanned content (summarized HTML or parsed spec) to AWS Bedrock with a structured prompt. The LLM attempts a task as an agent would and returns structured output describing what it could and could not do. The simulation is linked back to Layer 1 findings so the narrative is grounded in deterministic observations.

The system is built on the deterministic-plus-LLM pattern.

**The result-hero line (smaller, separate Bedrock use).** Distinct from the full agent simulation: after Layer 1 scoring, a short Bedrock call (same model) reads the top findings and writes one human sentence describing what an agent experiences, in the product voice. This is the line that leads the result hero, the first thing a user sees, the AI moment a judge sees in the first 30 seconds. It is generated; the score it sits above is deterministic. **Fail-soft contract:** if Bedrock is slow or errors, the hero falls back to a deterministic template ("An agent can {top-passing capability} but can't {top-failing capability}") so the hero never breaks. The AI version is the good version; the template is the floor. The narrative line has a hard length ceiling (one to two sentences) so it never overflows the hero on mobile.

This split matters: the score is math (reproducible, auditable, passes determinism tests), the hero line and the full simulation are AI (language and judgment, where a regex can't help). Math stays math for trust. Language is AI for value. This is the deterministic-logic-plus-AI-reasoning principle applied to the demo-critical component.

**Model:** Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`). Pricing is $1/M input, $5/M output on Bedrock. The model is active with no deprecation notice, and Anthropic commits to at least 60 days notice before any retirement. The specific model ID is stored in Lambda environment configuration, not hardcoded. Swapping to a different model is a one-line env change.

**Orchestration:** Layer 2 simulation runs AFTER Layer 1 checks complete, concurrently (Promise.all) with the hero-line Bedrock call. The scan Lambda completes Layer 1 checks, then initiates both Bedrock calls (simulation and hero line) in parallel before assembling the final report.

**Upgrade path to async (documented, not yet needed):** The simulation module is built with a clean contract from day one. Input: findings + parsed content. Output: structured narrative. If Bedrock latency becomes a user-facing problem (perceptible "waiting" state over 5 seconds on average scans), the upgrade is:

1. Extract `simulation.run()` into its own Lambda (code moves, contract unchanged)
2. Replace the direct call with async invocation (Lambda invoke or SQS)
3. Frontend adds a "generating narrative" state and polls for the Layer 2 result

The report JSON shape is designed to support both modes from the start. The `narrative` field can be `attached` (MVP sync mode) or `pending` (future async mode). Frontend rendering handles both states. This means the upgrade does not break existing clients or require a breaking API change.

**Forward-compatibility guardrail (for the v3 JS-rendering stub):** the report shape treats the scored result as belonging to a render mode, even though MVP only ever produces one. Concretely, the score and category breakdown live under a mode-labeled context (MVP: `rawHtml`) rather than as bare top-level fields. MVP emits exactly one mode and the frontend reads that one. A future version that renders the DOM can emit a second mode (`rendered`) and a delta without changing the contract. This costs nothing now (one nesting level) and prevents a breaking report-shape change later. See the NEVER list note on JS rendering.

### Layer 3: Benchmark (MUST at MVP, pluggable)

A curated dataset of 50 scanned sites providing reference points. When comparison data exists for a scan, the report shows category-level context ("your Semantic HTML score is 16/25. The median across our dataset is 19/25"). When comparison data does not exist, the report omits the comparison silently. No broken promise.

The benchmark is architected as a pluggable module. It plugs into the report pipeline but is not load-bearing. The scan works with or without it.

A batch scan Lambda populates the benchmark by running the deterministic engine (Layer 1) against all 50 URLs and storing results in DynamoDB. This is a scripted, repeatable process, not 50 manual scans.

### Refresh (MUST at MVP)

Sites change. A scheduled Lambda (triggered by EventBridge) re-runs the batch scan on a cadence to keep the benchmark current. The refresh applies only to the benchmark dataset, not to individual user scans. Perseus does not monitor user sites.

The refresh pattern was proven in Clew Directive's Scout Agent. Perseus implements its own version in the AWS ecosystem. **Cadence: monthly.** Websites don't change fast enough to warrant weekly refresh, and weekly is four times the compute for negligible data change. Monthly also keeps the benchmark stable for the DEV post period. Cadence is configurable (via EventBridge rule) so it can be tightened later if needed.

---

## 3. System Diagram

### Request lifecycle: a single scan

```
                                    USER
                                     |
                                     v
                         +------------------------+
                         |  Next.js on Vercel     |
                         |  - UI (App Router)     |
                         |    (with static        |
                         |     benchmark data)    |
                         |  - API routes:         |
                         |    /api/scan (init)    |
                         |  Validates input       |
                         +------------------------+
                            |
              scan request  |
              (to AWS)      v
                         +------------------------+
                         |  API Gateway (HTTP API)|
                         |  Rate limiting / CORS  |
                         +------------------------+
                                     |
                                     v
                         +------------------------+
                         |  Scan Lambda           |
                         |  (Docker container)    |
                         |                        |
                         |  1. Validate input     |
                         |  2. Check cache        |
                         |  3. Fetch target       |
                         |  4. Parse              |
                         |  5. Run check modules  |
                         |  6. Score (det.)       |
                         |  7. Hero line (Bedrock,|
                         |     fail-soft)         |
                         |  8. Add benchmark ctx  |
                         |  9. Return report      |
                         | 10. Write result async |
                         |     (24h TTL, fail-soft)|
                         +------------------------+
                            |       |        |
                   +--------+   +---+        +-------+
                   v            v                    v
            +----------------+ +----------------+ +-------------------------+
            |  CloudWatch    | |  Bedrock       | |  DynamoDB               |
            |  Logs          | |  (hero line +  | |  - PerseusClew-         |
            |                | |   simulation)  | |    BenchmarkScans       |
            |                | |                | |  - PerseusClew-ScanCache|
            |                | |                | |    (15m TTL)            |
            |                | |                | |  - PerseusClew-         |
            |                | |                | |    ScanResults (24h TTL)|
            +----------------+ +----------------+ +-------------------------+
                                     |
                                     v
                               JSON response
                                     |
                                     v
                          Next.js renders report
                          (result hero leads)
```

Note on topology: The Next.js frontend is served on Vercel. The `/api/scan` route on Vercel initiates a scan against the AWS scan Lambda (via API Gateway). The scan engine, Bedrock, and the database stay on AWS. The benchmark page in the frontend is fully static and does not read from DynamoDB. DynamoDB is used on AWS for caching, temporary results storage (24h TTL), and benchmark references.

### Side flow: batch scan (populates benchmark)

```
  Manual trigger (MVP) or
  EventBridge scheduled rule
           |
           v
  Batch Scan Lambda
  (same Docker container,
   different entry point)
           |
           v
  For each of 50 URLs:
    Layer 1 scan (frontend)
    Layer 1 scan (API spec, if discoverable)
    Store result in DynamoDB
           |
           v
  Summary written to
  CloudWatch + repo
  (docs/BENCHMARK-SITES.md,
   scan data as JSON)
```

### Side flow: Layer 2 simulation (runs after Layer 1 checks, concurrently with hero-line)

```
  Scan Lambda
  (concurrent Promise.all invocation with hero-line)
           |
           v
  Calls Bedrock via SDK
  (structured prompt)
           |
           v
  Structured narrative
  linked to Layer 1 findings
           |
           v
  Combined with Layer 1 findings,
  returned in report
```

The simulation runs synchronously after Layer 1 checks complete, concurrently with the hero-line Bedrock call (single round-trip to Bedrock before returning the report). The diagram shows it as a conceptually separate side flow because the module is cleanly isolated, but it shares the Lambda execution context with Layer 1. See Section 2 (Layer 2) for the upgrade path to async invocation if needed.

---

## 4. Tech Stack

Locked in the product review. Reproduced here with architectural rationale.

| Component       | Choice                            | Architectural Rationale                                    |
|-----------------|-----------------------------------|------------------------------------------------------------|
| Frontend        | Next.js (App Router)              | Component-based UI for growing dashboard. The `/api/scan` route initiates scans. Self-scanning requirement means semantic HTML throughout (SSR/SSG output is agent-readable). |
| Hosting         | Vercel                            | Frontend + API routes. H0 requirement and a good fit. v2 change: supersedes the v1 CloudFront + S3 decision for the frontend. Scan engine and refresh stay on AWS. |
| API gateway     | AWS API Gateway (HTTP API)        | Fronts the AWS scan Lambda. Rate limiting, CORS. HTTP API chosen over REST API: cheaper ($1/M vs $3.50/M requests), lower latency, fewer features we don't need. The Vercel /api/scan route calls this. |
| Serverless      | AWS Lambda                        | Per-scan pricing. No idle compute cost. Cold-start is acceptable for a scan that runs under the 60-second Lambda timeout limit (fetch timeout is 30 seconds). |
| Containers      | Docker                            | Lambda runs the container in production. Same image runs locally with `docker compose up`. Contributors can work without AWS credentials. |
| AI (Layer 2)    | AWS Bedrock + Claude Haiku 4.5    | Model ID: `us.anthropic.claude-haiku-4-5-20251001-v1:0`. Pricing: $1/M input, $5/M output. Active, no deprecation. Model ID in env config for easy swap. |
| HTML parser     | cheerio                           | jQuery-like server-side HTML parsing. Doesn't execute JS (matches agent behavior). Active maintenance. Familiar API means easy debugging. |
| OpenAPI parser  | @readme/openapi-parser            | Handles $ref resolution, which matters for Paraskakis Pitfall #2 (tools that inflate gaps by dereferencing $refs). Active maintenance. |
| Database        | DynamoDB                          | Benchmark data, ephemeral scan results (24h TTL), and the signed-in user partition (all prefixed with `PerseusClew-`). Simple access patterns. *OPEN QUESTION from checklist: whether percentile and trend queries will fit DynamoDB or require RDS. Spike needed before benchmark queries get complex.* |
| Monitoring      | CloudWatch Logs                   | Lambda logs automatically. Alarms built in. Credits cover it. No custom metrics are emitted; logs are parsed for metrics. |
| Alarm channel   | Email (via SNS)                   | Solo project, no on-call rotation. Simpler than Slack integration. Revisit if volume grows. |
| Refresh agent   | EventBridge + Lambda              | Scheduled trigger, monthly cadence. Proven pattern from Clew Directive. |
| Analytics       | Vercel Web Analytics              | Privacy-first. No cookies. Hosted on Vercel infrastructure. Consistent with the measurement and privacy section of the product review. |
| Testing         | Vitest                            | Fast, ESM-native, JavaScript-native test runner.           |
| CI              | GitHub Actions                    | Lint, audit, test on every PR. Runs the self-scan as part of CI. |
| IaC             | AWS CDK (TypeScript)              | AWS-native, matches stack language, no separate state backend. Portability not needed (AWS-only project). |
| Builder         | Kiro IDE                          | Primary build tool. Spec-driven development against this doc and the sibling specs. |
| License         | Apache 2.0                        | Permissive with patent protection and attribution. LICENSE in repo root. |

---

## 5. Data Flow: A Single Scan

End to end walkthrough of one URL scan. This is the canonical path. Every section below this is a variation on this flow.

### Step 1: User input

The user pastes a URL into the scan form on the Next.js frontend. Client-side validation confirms:

- URL format is valid (https:// required, no private/local IPs, max 2048 characters)
- Consent messaging is shown: "This URL must be publicly accessible (no login required). By scanning, you confirm you have the right to test this URL."

If validation fails, the form shows an inline error and no request is made.

### Step 2: API request

The frontend calls its own `/api/scan` route (Next.js, on Vercel). That route validates again server-side, then forwards to `POST /scan` on AWS API Gateway. Request body:

```json
{
  "type": "url",
  "target": "https://example.com"
}
```

The Vercel API route is a real server-side step: it validates, can attach rate-limit context, and keeps the AWS endpoint from being called directly by the browser. API Gateway enforces rate limiting (see Build Plan for specific limits) and CORS, then forwards valid requests to the scan Lambda.

### Step 3: Cache check

The scan Lambda checks the `PerseusClew-ScanCache` table for a recent scan of this URL. The cache is keyed by a hash of the URL (never the full URL), and an entry is reused only if it is within the cache window. If a fresh entry exists, its result is returned immediately. This is good-citizen behavior toward target sites and keeps costs down.

**Cache window: 15 minutes at MVP.** This is the starting value. Short enough that users rescanning to see changes don't see stale results. Long enough to prevent rapid re-scanning of the same URL from abusing target sites. The cache TTL is configurable (env variable on the scan Lambda) so it can be tuned based on real usage during the 50-site benchmark testing period.

`PerseusClew-ScanCache` is deliberately separate from `PerseusClew-ScanResults` (Table 3, Table 5 in the data model). The cache exists to dedup target-site fetches: short-lived, keyed by URL hash, disposable. The result store exists to back shareable links: 24-hour life, keyed by an opaque result id. They have different keys, different lifetimes, and different purposes, so they are different tables. A scan writes to both `PerseusClew-ScanCache` and `PerseusClew-ScanResults`.

### Step 4: Fetch target

The fetch module retrieves the target URL. Constraints from the product review:

- 30-second fetch timeout
- Up to 3 redirects followed (redirect chain noted in report)
- Max 5MB response size
- Content-type must be HTML (returns a structured error otherwise)
- robots.txt checked; if agents are disallowed, this is noted as a pre-scan finding

If any fetch constraint fails, the Lambda returns a structured error with a user-facing message. Never a blank screen.

### Step 5: Parse

The parse module converts raw HTML into a structure the check modules can reason about. Perseus does not execute JavaScript. It scans raw HTML, which is what most agents see.

**Parser: cheerio.** jQuery-like API for server-side HTML parsing. Loads raw HTML into a tree the check modules can query (e.g., "how many `<button>` elements exist on this page," "do all `<input>` elements have associated `<label>` elements"). cheerio does not execute JavaScript and does not emulate a browser, which is exactly the behavior we want: it sees what an agent without a browser engine sees. Active maintenance. Familiar API for contributors.

**OpenAPI parser: `@readme/openapi-parser`.** Handles $ref resolution, which is required to avoid the failure mode Paraskakis warns about in Pitfall #2 (tools that inflate gaps by counting reused schemas multiple times).

### Step 6: Run check modules

Six frontend check modules execute against the parsed HTML:

1. Semantic HTML
2. Form Accessibility
3. ARIA & Accessibility
4. Structured Data
5. Content in HTML
6. Link & Navigation

Each module returns `{ passed, total, findings }`. The modules run sequentially, not in parallel, because the parsed HTML is shared and the marginal cost of each module is low. Sequential execution also keeps logs readable.

If API scanning is enabled for this scan (backend flag, not user-facing at MVP for free tier), the six API check modules also run. For MVP free tier scans, this branch is skipped.

### Step 7: Score

The scoring module consumes check results and applies weights from `SCORING.md`. The module returns:

- Total score (0-100)
- Rating label: **Agent-Ready / Partially Ready / Not Yet Readable**. Three bands, observational tone, no judgment language. Band thresholds defined in `SCORING.md`.
- Per-category breakdown (earned/max per category)

The score is fully deterministic. After scoring, a short Bedrock call generates the result-hero narrative line from the top findings (see Layer 2). This call is fail-soft: on slowness or error, a deterministic template fills the line instead, so the report never blocks on it.

### Step 8: Benchmark enrichment

If benchmark data exists for the scanned vertical or at the global level, the scoring module adds reference points to the report. When comparison data doesn't exist, this step is a no-op.

### Step 9: Log and respond

The scan event is logged as a structured JSON entry in CloudWatch. Domain only, never full URLs. No PII. No HTML. No raw IPs. No custom metrics are emitted; standard metrics are derived from parsing structured logs.

The report is returned to the frontend. After the response is sent, the scan result is written to the `PerseusClew-ScanResults` table asynchronously with a 24-hour TTL (anonymous: domain, scores, findings, timestamp; no PII, no IP, no cross-scan linkage). The write is fail-soft: if it fails, the user still has their report, and the failure is logged to CloudWatch, never surfaced. This row is what a shareable result link resolves against; after 24 hours the TTL deletes it and the link resolves to an expired state. If the user is signed in, the result is also written to their account partition in the `PerseusClew-Users` table (a small honest signal is shown if that history write fails; anonymous scans get no such signal because there is nothing to save to).

### Step 10: Render

The Next.js frontend renders the report, result hero first: the 0-100 score, the rating label, and the AI-written agent narrative line as one unit. Below the hero: per-category breakdown with two-layer finding text (plain-language agent sentence leading, technical category and score as helper), pre-scan findings (robots.txt status, redirect chain), option to download a readable report and to generate a shareable social card, and (for anonymous users) a "sign up to track your scores over time" CTA.

---

## 6. Data Model (DynamoDB)

Single-table-ish design to match DynamoDB patterns and keep cost and access simple.

### Tables

**Table 1: PerseusClew-BenchmarkScans**

Stores the most recent scan for each of the 50 benchmark sites. Read-heavy, written only by the batch scan Lambda.

| Attribute | Type | Notes |
|-----------|------|-------|
| `siteId` (PK) | String | Stable identifier for the site (e.g., `ecom-shopify`) |
| `scanTimestamp` (SK) | String (ISO 8601) | Sort key; most recent on top |
| `vertical` | String | `ecommerce`, `saas`, `content`, `government`, `indie` |
| `domain` | String | `shopify.com` |
| `frontendScore` | Number | 0-100 |
| `apiScore` | Number | 0-100, nullable if no spec found |
| `combinedScore` | Number | 0-100, nullable if only one mode scanned |
| `categoryBreakdown` | Map | Per-category earned/max for frontend and API |
| `findings` | List | Top findings per category, sanitized |
| `scanMeta` | Map | Redirect chain, robots.txt status, content type |

Index: GSI on `vertical` + `scanTimestamp` for per-vertical benchmark queries.

**Table 2: PerseusClew-ScanCounters**

Aggregate counters for the measurement and privacy section of the product review. Incremented atomically. No user identifiers. *(This table is defined and granted in IAM for future telemetry needs, but is not written to or read by the application codebase in this release; all telemetry is derived from log parsing.)*

| Attribute | Type | Notes |
|-----------|------|-------|
| `counterKey` (PK) | String | e.g., `scans:total:2026-06-19` |
| `count` | Number | Atomic counter |
| `lastUpdated` | String (ISO 8601) | |

Counters: total scans per day, scans per type, success/failure, error breakdown by error code, report downloads, social card generations. The full list is in the product review's "What We Measure and Why" section.

**Table 3: PerseusClew-ScanResults (24h TTL, anonymous)**

Stores a scan result long enough to enable future shareable result links, then auto-deletes. Written async and fail-soft by the scan Lambda after the response is sent. The current UI does not yet surface or resolve these shareable links.

| Attribute | Type | Notes |
|-----------|------|-------|
| `resultId` (PK) | String | Random opaque id, used in the shareable link. Not derived from the URL. |
| `domain` | String | Domain only, never the full URL |
| `score` | Number | 0-100 |
| `ratingLabel` | String | Agent-Ready / Partially Ready / Not Yet Readable |
| `heroLine` | String | The AI-written (or fallback) narrative line, sanitized |
| `categoryBreakdown` | Map | Per-category earned/max |
| `findings` | List | Findings per category, sanitized |
| `createdAt` | String (ISO 8601) | |
| `ttl` (TTL attr) | Number | Epoch seconds, createdAt + 24h. DynamoDB TTL deletes the item. |

No PII, no IP, no identifier linking one anonymous scan to another. The `resultId` is opaque and single-purpose.

**Table 5: PerseusClew-ScanCache (15-min TTL, dedup only)**

Exists solely to avoid re-fetching a target site when the same URL is scanned repeatedly in a short window. Keyed by a hash of the URL, never the full URL. Separate from `PerseusClew-ScanResults` by design: different key (URL hash vs opaque result id), different lifetime (15 min vs 24h), different purpose (good-citizen dedup vs shareable links). A scan writes to both `PerseusClew-ScanCache` and `PerseusClew-ScanResults`.

| Attribute | Type | Notes |
|-----------|------|-------|
| `urlHash` (PK) | String | Hash of the normalized URL. The full URL is never stored. |
| `domain` | String | Domain only, for logging/debugging |
| `result` | Map | The scan result payload to return on a cache hit |
| `cachedAt` | String (ISO 8601) | |
| `ttl` (TTL attr) | Number | Epoch seconds, cachedAt + 15 min (configurable via env). DynamoDB TTL deletes the item. |

A cache hit is honored only if the entry is within the cache window. Because the TTL and the window are both 15 minutes here, an expired entry is simply absent. If the window is later tuned shorter than the TTL, the Lambda applies a recency check at read time.

**Table 4: PerseusClew-Users (signed-in stub)**

Created at MVP as a stub: schema present, populated on sign-up, but the trend/history features that read it heavily are paid tier. At MVP it backs the auth flow and the empty-state history view.

| Attribute | Type | Notes |
|-----------|------|-------|
| `userId` (PK) | String | From the auth provider (TBD: Auth.js / Clerk / other; see checklist open question) |
| `email` | String | For magic-link auth |
| `createdAt` | String (ISO 8601) | |
| `scanHistory` | List | Account-linked scan ids. Empty at sign-up. Trend reads over this are paid tier. |

The data policy must be published before any account-linked storage goes live (it is now a launch requirement, not paid-tier-only, because anonymous 24h storage also exists).

### What's never stored

- Full URLs from any scan (domain only)
- Full HTML or API spec content from any scan
- Raw IPs
- Any identifier linking one anonymous scan to another

Anonymous scan results ARE stored for 24 hours (`PerseusClew-ScanResults`, TTL-deleted) to enable shareable links. Signed-in users' scans are account-linked in the `PerseusClew-Users` partition. Neither holds full content, IPs, or cross-anonymous-scan linkage.

### Paid tier extensions (STUB, not built at MVP)

The `PerseusClew-Users` table (Table 4) exists at MVP as a stub: auth wired, schema present, empty-state history. The features that read it heavily are paid tier: trend tracking, score-over-time, delta tracking, scheduled rescan configs, team/multi-domain. These are deferred. The data policy is published at launch (anonymous 24h storage and the signed-in stub both exist), not just before paid tier.

OPEN QUESTION from checklist: DynamoDB may fight against percentile and trend queries as the benchmark grows. A spike is needed before the benchmark gets complex. If DynamoDB cannot support those query patterns, the architecture switches to RDS (Postgres) for benchmark data while keeping `PerseusClew-ScanCounters` in DynamoDB. This decision is deferred, not blocking MVP.

---

## 7. Shared Infrastructure

Cross-cutting modules used by all Lambdas. Detailed contracts in `BACKEND-SPEC.md`. Existence and role established here.

- **`errors.js`** — Structured error class. Every error has a code, a user-facing message, an internal detail field, and a category (validation, fetch, parse, check, score, bedrock, internal). Thrown by any module. Caught at Lambda entry points and serialized into the response.

- **`logger.js`** — Structured JSON to CloudWatch Logs. Every log event has a timestamp, level, Lambda name, request id, and event-specific fields. Explicit deny-list: no full URLs, no HTML content, no API spec content, no raw IPs. Domain-only for URLs.

- **`fetch-url.js`** — Retrieves a URL with the constraints from section 5 (30s fetch timeout, 3 redirects max, 5MB max, content-type check, robots.txt check). Returns the HTML and metadata, or throws a structured error.

- **`fetch-repo.js`** — Mocked/stubbed at MVP (returns a 501 NotImplemented). Once implemented, it will retrieve files from a public GitHub repo via the unauthenticated REST API, filtering to `.html`, `.jsx`, `.tsx` (max 20 files, 500KB per file max) and searching for OpenAPI specs (`openapi.json`, `openapi.yaml`, `swagger.json`).

- **`parse-html.js`** — Parses HTML into the structure the check modules consume.

- **`parse-spec.js`** — Parses OpenAPI 3.x and Swagger 2.0 into a normalized structure for the API check modules.

- **`sanitize.js`** — Sanitizes strings before they're returned to clients or logged. Removes anything that could leak PII or that looks like a secret. Applies to findings, error messages, and any user-facing output derived from scanned content.

- **`rate-limit.js`** — Rate limiting middleware at the Lambda entry point. Limits per-IP and globally. Returns 429 with retry-after on breach.

- **`bedrock-client.js`** — Wraps the AWS Bedrock SDK. Single place to manage model selection, prompt construction, retries, and error handling for Layer 2 simulation.

These modules are built first, per build principle #6 and #7 (PRD-first, single responsibility). Every other module depends on them.

---

## 8. Monitoring and Alerting

CloudWatch is the monitoring layer. Everything else plugs into it.

### Structured logs

Every Lambda writes structured JSON logs to CloudWatch Logs. Log levels: DEBUG (development only), INFO (scan events, cache hits, errors by category), WARN (rate limit breaches, fetch failures), ERROR (Lambda-level failures).

### Metric Collection (Logs Only)

No custom CloudWatch metrics are published directly via `PutMetricData`, and the `PerseusClew-ScanCounters` DynamoDB table is not written to by the application. Instead, all metrics (such as scan counts, success rates, durations, and cache hits) are derived asynchronously by parsing the structured JSON logs emitted by the Lambdas to CloudWatch Logs.

### Alarms

From the production-grade section of the product review:

- Error rate > 10% over a 5-minute window â†’ notify
- Scan duration > 15 seconds at p95 â†’ notify
- Rate-limit breaches > 50 unique IPs per hour â†’ notify (possible abuse)

**Notification channel: email via SNS.** Solo project, no on-call rotation. Email is sufficient. Revisit if volume grows or a team forms.

### Vercel Web Analytics

Vercel Web Analytics tracks page views, traffic sources, device/browser, and country-level geography. It does not see scan events or scan content. It exists alongside CloudWatch, not inside it. The script is loaded from the frontend. No cookies. No fingerprinting.

---

## 9. Security Model

The 11-point checklist (from build principles #17) is applied throughout. This section describes the architectural posture. Implementation detail lives in `BUILD-PLAN.md` (external design document).

- **Authorization:** Anonymous scans require none (public endpoints). The signed-in tier adds auth (email/magic link at MVP; provider TBD per checklist). Architecturally, the Lambda never trusts the frontend, including the Vercel API routes: all validation happens server-side on the Lambda even though the Vercel route validates first.

- **Input validation:** Client-side (UX), then again server-side (enforcement). Every Lambda entry point validates before doing any work.

- **CORS:** API Gateway locks to the Agentis Lux Vercel origin (the deployed frontend domain) in production and handles preflight. The browser talks to the Vercel API routes; those talk to API Gateway.

- **Rate limiting:** API Gateway + `rate-limit.js` middleware. Per-IP and global limits. 429 responses with retry-after.

- **Secrets:** AWS Secrets Manager or environment variables via Lambda config. Never in code. Never in git.

- **Logging:** Explicit deny-list prevents PII, HTML content, or full URLs from being logged.

- **Rollback:** AWS infrastructure as Code via AWS CDK (TypeScript), one-command rollback; Lambda versioning for function-level rollback. The Vercel frontend has instant rollback to any previous deployment built in.

- **Prompt injection:** Layer 2 sends scanned content to Bedrock. Content is sanitized before being included in the prompt. System prompts are fixed, not user-editable. The prompt template enforces output structure so injected instructions in scanned content cannot change the output contract.

- **Abuse prevention:** Cache window prevents repeated scans of the same URL. Rate limiting prevents volume abuse. The robots.txt check and target-site timeout prevent Perseus from being used as a DOS tool.

- **Dependency audit:** `npm audit` on every CI run. Build principle #4 (tool longevity check) applies to every dependency before it's added.

---

## 10. Deployment and Environments

### Containers

The scan engine runs in a Docker container. The same image runs locally (`docker compose up`) and in production (Lambda container image). Contributors can work without AWS credentials. This is a direct requirement from the product review's Supernote philosophy section (no ecosystem lock-in) and build principle #15.

### Environments

- **Local:** `docker compose up` runs the scan engine (Lambda simulated with a local runner, DynamoDB Local, mock Bedrock). The Next.js frontend runs with `next dev` against the local scan engine. Used for development.
- **Staging (STUB, not built at MVP):** Full AWS deployment in a separate account or region, plus a Vercel preview deployment, for integration testing. Deferred.
- **Production:** Next.js frontend (and its API routes) on Vercel. Scan Lambda + API Gateway + DynamoDB + Bedrock + EventBridge on AWS in a single account. $10k AWS credits apply to the AWS side.

### CI/CD

GitHub Actions runs on every PR:

- Lint (ESLint)
- Dependency audit (`npm audit`)
- Unit tests (Vitest)
- Integration tests (Vitest + fixtures)
- Determinism tests (same input â†’ same output)
- Self-scan (Perseus runs against its own deployed frontend or a local build; PR fails if the self-scan regresses)

Deployment is split. The Next.js frontend deploys to Vercel on merge to `main` (Vercel's Git integration, with preview deployments per PR). The AWS side (Lambda, API Gateway, DynamoDB, EventBridge) deploys via CDK. Application deploy is separate from infrastructure deploy. Both sides have one-command (or one-click, on Vercel) rollback.

### License

Apache 2.0. LICENSE in repo root. CONTRIBUTING.md deferred to Phase 5 (per checklist).

---

## 11. What's NOT in This Architecture (NEVER list)

These behaviors are architecturally excluded. Some have stubs for future implementation; none are partially built.

- **No user accounts required for anonymous scans.** The signed-in tier is opt-in (auth + history stub at MVP; trend features are paid). Anonymous scanning never requires login.
- **No stored full content.** DynamoDB holds benchmark scans, aggregate counters, anonymous scan results (24h TTL), and the signed-in user partition. It never holds full HTML, full API specs, raw IPs, or any identifier linking one anonymous scan to another.
- **No JS rendering in scans (MVP).** Perseus scans raw HTML. Lambda does not run a browser. This is a product decision (mirrors what most agents see) and an architectural constraint (keeps Lambda cold-start and memory bounded). *STUB for v3: a future version may render the page in a headless browser and scan the rendered DOM, surfacing the gap between what a JS-capable agent sees and what a non-JS agent sees ("agents testing agents"). This defers cleanly because the check modules consume parsed output and do not care how the HTML was obtained, so rendering is an addition at the fetch/parse seam, not a refactor. The one guardrail to honor now: the report shape leaves room for a render-mode dimension (see report contract note in Section 2 / Layer 2), so a second scored view can be added later without breaking the report contract. See checklist roadmap.*
- **No fix suggestions.** Anywhere in the system. Findings describe what an agent sees. The developer decides what to do.
- **No multi-page crawling.** Single-page scans only at MVP.
- **No continuous monitoring of user sites.** The refresh agent applies to the 50-site benchmark only, not to user-scanned sites.
- **No third-party tracking.** No Google Analytics, no ads, no pixel trackers, no session replay, no heatmaps. Vercel Web Analytics is the only analytics tool, and it meets privacy-first criteria.
- **No AI-generated scores.** The score is deterministic, always. AI writes the hero narrative line (with a deterministic fallback) and runs the Layer 2 simulation. AI never produces the number, and never replaces deterministic findings; it sits alongside them.
- **No hardcoded API keys, credentials, or secrets.** Ever. Anywhere.

---

## 12. How the Architecture Handles Known Risks

From the checklist's Open Questions. These are not blocking MVP. The architecture is designed to accommodate them without major rework.

**Risk: the 50-site data is not interesting (scores don't vary enough).** If every site scores in the same narrow band, the DEV post doesn't differentiate. The architecture mitigates this by (a) curating the 50 sites with deliberate vertical diversity (e-commerce, SaaS, government, media, indie) to maximize expected variance, and (b) publishing raw scan data so readers can inspect specific findings regardless of score. If the data still fails the "interesting" bar, the scoring weights are the lever to adjust. Scoring methodology is versioned with a changelog. The architecture does not hardcode weights into check modules; scoring.js is the single point of truth.

**Risk: DynamoDB fights percentile and trend queries.** Spike needed before benchmark queries get complex. The architecture hedges by keeping benchmark data in a single, well-defined table that can be migrated to RDS if required. The scan Lambda reads benchmark data through a single module (`benchmark.js`, per backend spec), so the migration would touch one file.

**Risk: retention.** Free tier is designed as single-use (like Lighthouse). Retention lives in the paid tier. The architecture accommodates this by not building retention features into the free path. When retention ships in the paid tier, it adds tables and endpoints without changing the free tier.

**Risk: API category provenance.** The Open Question on whether API categories would have emerged differently without Paraskakis as a reference. Not an architectural risk. It is a methodology question tracked in the checklist and to be resolved before the detailed methodology doc ships. The architecture treats API check modules as pluggable, so category re-organization does not require scan engine changes.

**Risk: combined score weighting (50/50 is an assumption).** The scoring module exposes weights as configuration. Changing the split requires changing one file (scoring.js) and updating `SCORING.md`. The architecture treats this as a methodology decision, not an engineering one.

---

## 13. References

### Perseus Clew documents

- **Product Review** (`PERSEUS-CLEW-PRODUCT-REVIEW.md` — external design document) â€” source of truth for scope, philosophy, and stack. Signed off.
- **Project Checklist** (`PERSEUS-CLEW-PROJECT-CHECKLIST.md` — external design document) â€” living tracker. Contains decisions, open questions, methodology decisions log, and build sequence.
- **Build Principles** (`BUILD-PRINCIPLES.md` — external design document) â€” 38 principles applied throughout this architecture.
- **Scoring** (`SCORING.md`) â€” public scoring methodology. What each category measures and why.
- **Frontend Spec** (`FRONTEND-SPEC.md`) â€” Next.js app, routes, API routes, components, state. Written (v1; Path B update in progress).
- **Backend Specs** (`BACKEND-SHARED.md`, `BACKEND-FRONTEND-CHECKS.md`, `BACKEND-API-CHECKS.md`) â€” module contracts, check definitions, orchestrator flow, Layer 2 simulation. Written.
- **Build Plan** (`BUILD-PLAN.md` — external design document) â€” security implementation, testing strategy, block-by-block build sequence. Written.

### External references

- Lance Wyman's 1968 Mexico City Olympics identity (visual lineage, not technical)
- Emmanuel Paraskakis, "Build AI-Ready Products: API Checklist" (Â© 2026 Level 250, Inc.) â€” informs API scanning categories per the attribution in the product review
- WCAG 2.1 AA â€” accessibility baseline
- Hermes Clew v1 codebase (GitLab AI Hackathon, March 2026) â€” proven frontend scan engine patterns

---

## Confidence Notes

Per the self-QA framework.

### Changes locked May 27, 2026 (v2, Path B + H0)

- **Frontend topology:** Next.js on Vercel with a load-bearing `/api/scan` API route initiating scans against AWS. The benchmark page serves static data. Supersedes v1 CloudFront + S3. Scan engine, Bedrock, refresh stay on AWS.
- **Storage:** anonymous scan results stored 24h (`PerseusClew-ScanResults`, TTL), written async + fail-soft, to support future shareable result links. A separate `PerseusClew-ScanCache` table (15-min TTL, keyed by URL hash) handles target-site fetch dedup. Two tables by design: different keys, lifetimes, and purposes. Signed-in user partition (`PerseusClew-Users`) added as a stub. Supersedes v1 "store nothing." The current UI does not yet surface these shareable links.
- **AI placement:** deterministic score, AI-written hero line (fail-soft to deterministic template), AI Layer 2 simulation. AI never produces the score.
- **Result hero leads** the report (0-100 score + rating label + agent narrative line). Two-layer finding text below.
- **Auth stub** in scope (provider TBD, open question). **Rating band cutoffs** (0-100 â†’ label) tracked as an open question in `SCORING.md`.
- **Data policy** is now a launch requirement, not paid-tier-only.

### Decisions locked

The 11 items originally flagged as VERIFY or ASSUMPTION have been resolved:

1. **Bedrock model:** Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`). Active, no deprecation. Model ID in env config for easy swap.
2. **Rating labels:** Agent-Ready / Partially Ready / Not Yet Readable. Three bands, observational tone.
3. **HTML parser:** cheerio.
4. **OpenAPI parser:** `@readme/openapi-parser`.
5. **API Gateway:** HTTP API (not REST API).
6. **Layer 2 orchestration:** Synchronous within scan Lambda at MVP. Upgrade path to async documented in Section 2.
7. **Cache window:** 15 minutes at MVP. Configurable via env variable.
8. **Check execution:** Sequential.
9. **Alarm thresholds:** As specified in product review (10% error rate, 15s p95, 50 IPs/hour).
10. **Alarm channel:** Email via SNS.
11. **Refresh cadence:** Monthly.
12. **Infrastructure as Code:** AWS CDK (TypeScript).

### High confidence (grounded in existing docs or code)

- Three-layer architecture and their MUST status
- Stack table (reproduced from product review, extended with confirmed tech choices)
- NEVER list (reproduced from product review decisions)
- Data flow steps 1-10 (composed from product review scan prerequisites)
- Measurement metrics (reproduced from product review measurement section)
- DynamoDB tables for `PerseusClew-BenchmarkScans` and `PerseusClew-ScanCounters` (composed from product review and single-table concepts)

### Remaining open items (not architecture-blocking)

These are tracked in the checklist, not in this doc. They affect specific implementation details but do not change the system shape:

- **DynamoDB fit for percentile and trend queries across verticals.** Spike needed before benchmark queries get complex. If DynamoDB cannot support those patterns, the benchmark data migrates to RDS (Postgres). The scan Lambda reads benchmark data through a single module so this migration would touch one file.
- **API category provenance.** Methodology question tracked in the checklist, to be resolved before the full methodology doc ships. Not an architecture concern.
- **Combined score weighting (50/50 is a starting assumption).** Scoring is configuration in `scoring.js`. Changing the split touches one file.
- **Rating language vs the new three-band scheme.** The three bands are locked above. Specific thresholds (what score qualifies as Agent-Ready vs Partially Ready vs Not Yet Readable) are defined in `SCORING.md`, not here.

### Integrity check

- No tech choices were invented outside the product review stack table or the decisions above.
- No behaviors were invented outside the product review's "What Perseus Clew Does" and "Scan Prerequisites" sections.
- Every NEVER list item is traceable to the product review.

---

*AI assisted. Human approved. Powered by NLP.*
