# Scoring

> How Agentis Lux scores agent readiness, and why you can audit it.

**Methodology version:** 1.1.1
**Last updated:** May 27, 2026
**Status:** MVP — active methodology

Every score Agentis Lux produces is tagged with the methodology version that produced it. When this methodology changes, the version number changes. Scores produced under different versions should not be compared directly without noting the version difference. See the Changelog at the bottom of this document for the full version history.

---

## What Agentis Lux Scores

Agentis Lux scans a product and surfaces what AI agents experience when they try to use it. You give it a URL, a public GitHub repo, or an OpenAPI spec. Agentis Lux runs a deterministic scan and returns a report.

The report has one score from 0 to 100, broken down across six categories per scan mode. If you give Agentis Lux a URL, you get a frontend scan. If you give it an API spec, you get an API scan. If both are present, you get a combined score.

Findings are written from the agent's perspective. "An agent landing on this page cannot identify the checkout button because it is a styled div, not a button element." Agentis Lux reports what it observes. It does not suggest fixes. The developer decides what to do.

*Agentis Lux is powered by the Perseus Clew engine, part of the Clew suite of developer tools.*

---

## The Philosophy

Awareness, not judgment.

Agentis Lux surfaces what agents can and cannot do. It does not say "your site is bad" or rank you against competitors as a leaderboard. It does not call findings "weak" or "failing." Where comparison data exists, it provides reference points without editorializing.

We do not suggest fixes because suggesting fixes implies we know your codebase, your constraints, and your reasons. We do not. We know what an agent sees. That is what we report.

The data speaks. We do not interpret on your behalf.

---

## What's Available Now (MVP)

> **Agentis Lux is in MVP.** The free tier scans frontends only at launch. API scanning runs on the backend to power the published 50-site benchmark and the launch article on DEV Community. API scanning will come to the user-facing tool in a future release. See "What's Coming" below for the roadmap.

### Frontend Scoring (live in the free tier)

Six categories. Total weight: 100. Available now when you scan a URL or public GitHub repo.

**Semantic HTML (weight: 25)**
Whether interactive elements use semantic tags (button, a, input) instead of styled divs with click handlers. Whether navigation, main content, headings, lists, and forms use the right elements. Agents identify interactive elements by tag name. A styled div is invisible to them as a button.

**Form Accessibility (weight: 20)**
Whether form inputs have associated labels. Whether each field signals what it expects. Whether required fields and validation rules are surfaced to assistive technology. Agents filling out a form need to know what each field is for. A placeholder is not a label.

**ARIA and Accessibility (weight: 15)**
Whether dynamic widgets have correct roles, states, and properties. Whether status messages are announced. Whether interactive components built from non-semantic elements have ARIA support. Agents use ARIA the same way screen readers do, to interpret components that HTML alone cannot describe.

**Structured Data (weight: 15)**
Whether the page declares what it is using JSON-LD or microdata. Whether key entities (products, articles, events, organizations) have schema markup. Agents use structured data to understand the page's purpose without parsing visual layout.

**Content in HTML (weight: 15)**
Whether meaningful content is present in the initial HTML response, or whether the page is mostly empty containers waiting for JavaScript to populate them. Many agents do not execute JavaScript. A page that requires JS to render is invisible to them.

**Link and Navigation (weight: 10)**
Whether links have href attributes and descriptive text. Whether navigation is consistent and discoverable. Whether breadcrumbs and site structure help agents understand where they are. Agents traverse a site through links the same way they would read a sitemap.

### Pre-Scan Findings (always reported)

Some findings affect whether agents can reach a site at all. They are reported alongside the six scored categories but do not have their own weights. They appear in every report when applicable.

**robots.txt status**
Agentis Lux checks robots.txt before scanning. If a site disallows crawling for our User-Agent or for all automated agents, that is reported as a finding. A site that blocks agents from arriving cannot be agent-ready regardless of its HTML quality. Agentis Lux still scans the HTML that was returned (we are analyzing structure, not indexing content), but the robots.txt status is surfaced because it directly affects agent access.

**Redirect chain**
If the URL redirected before returning HTML, the redirect chain is reported. Agents follow redirects but each hop adds latency and possibility of failure.

**Content type and size**
If the response was unusual in shape (non-HTML content type, exceptionally large response, partial content), that is reported as context for the scan results.

### API Scoring (backend only at launch, powers the benchmark and launch article)

Six categories. Total weight: 100. Running on the backend at launch to scan the 50-site benchmark dataset. Not yet available in the user-facing tool. Will move to the paid tier when ready.

These categories were developed from multiple sources: Hermes Clew v1's pattern of structured deterministic scanning, observed behavior of production AI agents consuming APIs (which often differs from how their documentation says they consume APIs), WCAG accessibility principles where APIs intersect with assistive technology, and Emmanuel Paraskakis's "Build AI-Ready Products" checklist (© 2026 Level 250, Inc.) where his specific insights apply. Per-insight attribution to Paraskakis appears inline where his work directly informed a check.

**Naming and Descriptions (weight: 25)**

Whether endpoints, parameters, and response fields have clear, descriptive names. Whether descriptions explain what each endpoint does in plain language. Agents trust descriptions over schemas: a description that says "search by email" overrides a schema that also accepts name, and the agent only tries email. (Paraskakis insight #2, credited.)

Specifically checks:
- Every operation has a `summary` or `description`. Missing both generates a finding.
- Descriptions are long enough to explain behavior (minimum meaningful length).
- `operationId` is present for stable agent references.
- Response schema properties have descriptions or self-explaining names. `activeUserCount` is self-explaining; `auc` is not. (Paraskakis insight #5, credited.)
- Summary and description do not contradict each other (one says "list users," the other says "create user"). When they contradict, agents follow the description, which can cause wrong behavior. (Paraskakis insight #2, credited.)
- Top-level spec `info.description` explains what the API is for.

Not flagged (Paraskakis Pitfall #2 mitigation): missing property-level descriptions when the parent schema description is comprehensive. Missing descriptions on shared schemas are counted once, not per reference.

**Error Design (weight: 20)**

Whether error responses follow RFC 9457 (Problem Details) or an equivalent structured format. Whether errors tell the agent which field failed and why. Good errors enable one-try recovery. Bad errors send agents into retry loops. (Paraskakis insight #3, credited.)

Specifically checks:
- Every operation documents at least one 4xx response.
- Documented 4xx responses have a schema, not just a status code.
- Error schemas identify which field failed (via a `field` property, a structured errors array, or RFC 9457 Problem Details).
- Error response structure is consistent across operations. Mixed structures mean agents have to learn multiple formats.
- Common errors are documented where they apply: 401 for authenticated endpoints, 403 for permission-gated endpoints, 400/422 for input-accepting endpoints, 404 for resource endpoints.

Not flagged: missing 5xx documentation (agents treat 5xx as "retry later" by default). Shared error schemas counted once across all references.

**Discoverability (weight: 20)**

Whether collection resources have list endpoints. Whether agents can find resources without guessing IDs. Whether resource hierarchy is clear. An agent that lands on an API needs a starting point. Without list endpoints, it has nowhere to begin. (Paraskakis insights #4, #6, #10 credited.)

Specifically checks:
- For every `GET /{resource}/{id}` endpoint, there is a `GET /{resource}` endpoint (or a filter-based discovery path). (Paraskakis insight #6, credited.)
- Nested resources are independently listable where they represent collections. (Paraskakis insight #4, credited.)
- List endpoints document their filterable query parameters with types and enum values. Undocumented filters mean agents miss features entirely. (Paraskakis insight #10, credited.)
- Outcome-focused operations (beyond basic CRUD) are present for common workflows. Surfaced as informational signal, not a deduction in v1.

Not flagged: missing list endpoints for action-based endpoints (`POST /emails/send`, `POST /jobs/trigger`) or singleton endpoints (`GET /account/settings`, `GET /config`).

**Response Efficiency (weight: 15)**

Whether responses are focused or bloated. Whether the API returns 80 fields when 3 would do. Verbose responses are a silent token tax. They compound across every call an agent makes. (Paraskakis insights #8, #9 credited.)

Specifically checks:
- Response schemas with very large field counts (30+) are flagged for review. (Paraskakis insight #9, credited.)
- Deeply nested responses (3+ levels of object nesting) are flagged.
- List endpoints support pagination (limit/offset, page/pageSize, cursor, or equivalent). (Paraskakis insight #8, credited.)
- Pagination parameters have sensible defaults and reasonable maximums documented.
- List responses document total count (`totalCount` or equivalent).
- List endpoints offer filter parameters, not just pagination. (Paraskakis insight #8, credited.)
- Sparse response support (field selection) is surfaced as a positive signal.

Not flagged: large schemas where properties have good descriptions and clear names. Well-documented 80-field schemas are treated differently than opaque 80-field schemas.

**Reliability Patterns (weight: 10)**

Whether the API supports idempotency for retries. Whether deprecation is signaled with machine-readable headers (RFC 9745 Deprecation, RFC 8594 Sunset). Whether versioning is clear. Agents will retry. They cannot read your blog post about the upcoming v2. (Paraskakis insights #7, #11 credited.)

Specifically checks:
- PUT and DELETE operations are documented as idempotent (via method convention or explicit documentation).
- Resource-creation POST operations support idempotency keys (`Idempotency-Key` header) or document server-side uniqueness constraints. (Paraskakis insight #7, credited.)
- Deprecated operations use the OpenAPI `deprecated: true` flag.
- Deprecated operations document their successor.
- If any operations are deprecated, the spec mentions the deprecation policy. (Paraskakis insight #11, credited.)
- Versioning strategy is clear (URL-based, header-based, or date-based).

Not flagged: all POST operations requiring idempotency keys (many POSTs are legitimately non-idempotent by design). Non-deprecated APIs for missing deprecation policy.

**Agent Integration (weight: 10)**

Whether the spec is well-formed and parseable. Whether authentication uses standard schemes. Whether SDKs are available. Whether universal search endpoints (a single POST /search for everything) are used in place of self-documenting per-resource filters. The first three help agents succeed. The last is a known anti-pattern. (Paraskakis insight #12 credited, pitfall #1 credited.)

Specifically checks:
- `securitySchemes` are defined in components.
- Authentication schemes use standard types where possible (http.bearer, http.basic, apiKey, oauth2, openIdConnect).
- API key authentication documents location (header, query, cookie) and name.
- Universal search endpoints (`POST /search` accepting arbitrary queries) are flagged unless the API is clearly a search product. (Paraskakis pitfall #1, credited.)
- `externalDocs` is present at spec level.
- Individual operations reference `externalDocs` where deeper context exists.
- SDK or Skill references in the spec surface as positive signals.

Not flagged: API key authentication as inferior to OAuth. Standard rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`). Known conventions from training data. (Paraskakis pitfall #2 directly informs these non-findings.)

---

## Layer 2: Agent Simulation (at MVP)

A second scoring layer that sends scanned content to a language model and asks it to attempt tasks against the input as an agent would. Results include what the agent could and could not do, with specific references linked back to Layer 1 findings. Layer 1 (the deterministic scan described above) is the foundation. Layer 2 adds context through observed behavior.

Six simulation tasks at MVP, three per scan mode. Frontend tasks: find the primary call-to-action, identify the page purpose, attempt form submission. API tasks: identify the primary resource, attempt error recovery, discover lists of resources. Each task produces a structured narrative that appears in the report alongside the deterministic findings.

Layer 2 runs on Claude Haiku 4.5 via AWS Bedrock. Layer 2 is additive. If it fails for any reason (timeout, rate limit, malformed output, input too large), Layer 1 results still ship. The report shows Layer 2 when available and indicates when it was not attempted.

Layer 2 is also where Paraskakis Pitfall #2 validation happens. When the LLM successfully completes a task despite a Layer 1 finding flagging something as missing or unclear, that is a signal the deterministic finding may be a false positive. Both signals appear in the report so users can judge for themselves.

---

## What's Coming (Future Versions)

These are roadmap items, not promises. They ship when they are ready.

**API scanning in the user-facing tool (paid tier)**
Today you can scan your frontend through the free tier. API scanning runs on our backend for the benchmark. Bringing API scanning into the tool itself, with spec upload and auto-discovery, is the first paid tier feature.

**Combined score in the UI**
When both frontend and API scanning are user-facing, scans that include both will produce a combined score. The methodology for combining the two scores is described in the "Combined Score" section below.

**Trend tracking and scheduled rescans (paid tier)**
Score over time, with rescans on a schedule. Anonymous scans are stored for 24 hours so shareable result links work, then auto-deleted; they are not kept for trend history. Trend tracking requires account-linked storage, which the signed-in tier provides (the data policy covering it is published at launch).

**CI integration**
A GitHub Action that runs Agentis Lux on every pull request, so agent readiness becomes part of code review.

**Benchmark refresh**
The 50-site benchmark refreshes on a schedule so the dataset stays current as scanned sites change. The refresh runs at launch (powering the benchmark itself) but the trend data and historical comparisons are future features.

---

## Combined Score

When both a frontend and an API spec are present and both are user-facing, Agentis Lux produces a combined score by weighting the two together. The starting assumption is 50/50.

This is a starting assumption, not a final answer. It treats frontend and API readiness as equally important, which is defensible at a glance and questionable on inspection. A site with a perfect frontend and a terrible API may not be the same readiness as the reverse. We will test the assumption against the 50-site benchmark dataset and adjust if the data tells us to. The current weighting and any future change will be documented in the Changelog.

When only one scan mode is available, the combined score is the score from that mode. Agentis Lux scores what exists. It never penalizes for what is not there.

At MVP launch, the combined score appears in the published benchmark dataset (which has both frontend and API scores for all 50 sites) but not in the user-facing tool, since the user-facing tool is frontend-only.

---

## What We Score and What We Don't

Agentis Lux measures things that affect whether an AI agent can navigate a site or use an API.

We do score:
- Semantic HTML structure
- Form labels and ARIA support
- Structured data and metadata
- Content presence in initial HTML
- robots.txt access for agents (reported as a pre-scan finding)
- API endpoint clarity, error design, and discoverability (in the benchmark, not yet in the user-facing tool)
- Response shape and reliability patterns (in the benchmark, not yet in the user-facing tool)
- Spec quality and standards compliance (in the benchmark, not yet in the user-facing tool)

We do not score:
- Visual design quality or brand voice
- Page load performance or Core Web Vitals (use Lighthouse or PageSpeed Insights)
- Business logic correctness
- API rate limit fairness or pricing
- Whether your product is a good idea

If a scan mode is not applicable (no API spec found, no frontend HTML), Agentis Lux reports that and scores only what exists.

---

## Where the Methodology Comes From

Agentis Lux draws from multiple sources. No single document defines our methodology.

**Frontend categories** evolved from Hermes Clew v1, an agent readiness scanner built for the GitLab AI Hackathon (March 2026). The six frontend categories were tested against real repositories during that build and refined for Agentis Lux.

**API categories** were shaped by several inputs. Hermes Clew's pattern of dividing scanning into deterministic categories with weighted scoring carries over. Observed behavior of production AI agents consuming APIs informs which patterns matter most. WCAG accessibility principles apply where APIs intersect with assistive technology. Emmanuel Paraskakis's "Build AI-Ready Products" checklist (© 2026 Level 250, Inc.) contributed specific insights, credited inline above where his work directly informed a check.

**Accessibility overlap** comes from WCAG 2.1 AA. The same semantic HTML, ARIA support, and structured markup that helps screen readers helps AI agents. The overlap is real and useful, and WCAG 2.1 AA is the baseline Agentis Lux builds and scans against. But agents are a distinct audience with distinct needs, not a subset of the accessibility audience. The thesis is that the web is becoming an interface for agents and most sites were built for a different audience; the WCAG overlap is a head start, not the whole story.

**Agent behavior observation** is the connecting thread across all of the above. How agents actually behave in production (which often does not match what their documentation describes) shapes which checks ship and which are deprioritized.

Attribution and source links are maintained in the full methodology document.

---

## How We Avoid Common Pitfalls

Scoring tools have known failure modes. Some come from real-world testing. Some are documented by other practitioners. Some surfaced during Hermes Clew v1's testing against actual repositories. We address them here.

**Inflating gaps by miscounting reused schemas**
When an OpenAPI spec uses $ref to share schemas across endpoints, naive scoring tools count description gaps once per reference. Agentis Lux respects $ref boundaries. Reused schemas are counted once across all references. (This is one of the failure modes Paraskakis identifies in his pitfall #2.)

**Missing composable property-level examples**
A response schema may have no top-level example but full property-level examples that compose into a complete response. Agentis Lux recognizes this and does not flag the missing top-level example when property examples are present. (Also from Paraskakis pitfall #2.)

**Flagging known conventions as gaps**
Standard rate limit headers, common authentication schemes, and other widely understood conventions are recognized from training data. Agentis Lux does not flag them as missing documentation. (Also from Paraskakis pitfall #2.)

**False positives on framework-rendered components**
React component libraries, CSS-in-JS frameworks, and SPAs with client-side routing produce HTML patterns that look like anti-patterns but are not. A custom Button component that renders to a semantic button at build time is not a div with a click handler. Agentis Lux accounts for these patterns. (This came out of Hermes Clew v1's testing against real React/Vue/Svelte repositories.)

**Heuristic parsing of JSX/TSX**
Agentis Lux does not run a full AST parser on JSX. The deterministic scan uses pattern matching. Some constructs (deeply nested conditional rendering, dynamic component selection, template literal interpolation) are not interpreted. Findings on JSX/TSX files are best-effort and may have false positives or false negatives compared to fully rendered HTML. The full methodology document lists known parsing limitations.

**Over-confidence in scores**
A score is a starting point for investigation, not a verdict. The findings are what matter. We publish raw scan data alongside scores so the findings can always be inspected directly.

The full mitigation algorithms and the complete list of known limitations live in the detailed methodology document.

---

## Versioning

This methodology uses semantic versioning. Every score Agentis Lux produces is tagged with the version of the methodology that produced it. This is how we honor the trust commitment: a score from April 2026 can always be reconciled with a score from October 2026, because you know exactly what changed between versions.

**Version format:** `MAJOR.MINOR.PATCH`

- **MAJOR** — a change that could make old scores incomparable to new ones. Weight changes across categories. New categories added. Removed categories. Rating band threshold changes. The kind of change where you cannot reasonably say "site X improved from 62 to 78" because the scoring system itself shifted.
- **MINOR** — a change that refines specific checks within a category without changing category-level weights or rating thresholds. Adding a new sub-check within an existing category. Refining how a specific pattern is detected. Old scores still directionally valid but not byte-for-byte reproducible.
- **PATCH** — clarifications, fixed bugs in detection logic, improvements to finding text, or documentation-only changes. Scores remain reproducible; wording may improve.

**Current version: 1.1.1**

**When we change the methodology:**
1. The Changelog below is updated with the date, the version increment, the specific change, and the rationale
2. The `Methodology version` at the top of this document is updated
3. For MAJOR or MINOR changes, scans produced under the previous version are flagged in the UI when the user compares them against current scores
4. Raw benchmark data in the repo is versioned alongside the methodology; historical data is never silently rescored

**What does not change after launch:**
- The six frontend categories and their names
- The six API categories and their names
- The "awareness, not judgment" philosophy
- The commitment to transparency and auditability

---

## Open Questions

Things we have not finalized:

- **Combined score weighting.** 50/50 is a starting assumption. The right weighting may be vertical-dependent or asymmetric. We will test against benchmark data and update.
- **Category weights within frontend and API.** Current weights reflect informed judgment from Hermes v1 testing and the various sources documented above. They may shift after the 50-site scan reveals real-world score variance.
- **Rating band thresholds.** The three bands (Agent-Ready, Partially Ready, Not Yet Readable) are locked. The specific score cutoffs are starting values: Agent-Ready 80-100, Partially Ready 50-79, Not Yet Readable 0-49. The result hero label is computed from these cutoffs. They may be adjusted once the 50-site benchmark shows real-world score distribution; any change is a MAJOR version bump (old scores become incomparable).
- **Edge cases for hybrid sites.** Sites that are partially server-rendered and partially client-rendered surface findings that may need refined handling. We will document patterns as they emerge.

When we change anything in this document, the change is logged in the Changelog with a date, a version increment, and a rationale.

---

## Where to Go Deeper

- **Full methodology:** `docs/SCORING-METHODOLOGY.md` (forthcoming, includes specific check definitions, examples, edge cases, and weight rationale)
- **Benchmark data:** `docs/BENCHMARK-SITES.md` (forthcoming, the 50 curated sites and their scores)
- **Source code:** GitHub repository (link added at launch)

---

## Changelog

| Version | Date | Change | Rationale |
|---------|------|--------|-----------|
| 1.1.1 | 2026-05-27 | Patch: corrected internal version inconsistency (body said 1.0.0); sharpened thesis framing (agents are a distinct audience, WCAG 2.1 AA is the baseline not the thesis); clarified anonymous 24h storage vs account-based trend tracking; stated rating band cutoffs (80/50/0) as the active values the hero label is computed from | Align public methodology with v5 product review and v2 architecture (Path B, 24h TTL storage, result hero). No weight or threshold changes, so scores remain comparable. |
| 1.1.0 | 2026-04-18 | Expanded API category detail (specific checks per category, Paraskakis insight credits inline, "Not flagged" mitigation notes), Layer 2 simulation moved from roadmap to MVP section, methodology version bumped | API methodology brought to match frontend detail level; Layer 2 is at MVP not future; public methodology aligned with engineering spec in BACKEND-API-CHECKS.md v1 |
| 1.0.0 | 2026-04-17 | Initial methodology published | Repository launch |

---

*AI assisted. Human approved. Powered by NLP.*
