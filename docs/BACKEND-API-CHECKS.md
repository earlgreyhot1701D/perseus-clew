# Backend: API Check Modules, API Scoring, Layer 2 Simulation

> The six API check modules + API scoring + the agent simulation layer.
> Addresses Paraskakis Pitfall #2 directly in the check logic.

**Status:** v2, May 27, 2026. v1 defined the six API check modules, API scoring, and Layer 2 simulation. v2 updates how simulation results are stored (ScanResults 24h TTL, alongside the rest of the response) and points at the Next.js frontend instead of React. API check module specs are unchanged.

**Naming:** Engineering artifacts (code, tests, CloudWatch metric namespaces) use "Perseus Clew" as the engine name. The public product is **Agentis Lux** (agentislux.io). User-facing strings â€” findings text, error messages â€” reference Agentis Lux. See the Voice and Tone section for how this plays out in findings.

**Scope:** Six API check modules, the API scoring module, and the Layer 2 agent simulation Lambda (includes task library, prompt design, structured output contract, graceful degradation). Also covers the orchestrator extensions that tie API scanning into the existing scan flow.

**Not in this doc:** Shared infrastructure (see BACKEND-SHARED), frontend check modules (see BACKEND-FRONTEND-CHECKS), Next.js UI (see FRONTEND-SPEC), CDK deploy and build sequence (see BUILD-PLAN).

---

## How to Review This Doc

You're the non-engineer builder. Here's how to validate this without reading every line of pseudo-code.

**Fast path (10 minutes):**
1. Read the "What Each Module Does" summaries. They're plain English. Every module has one.
2. Read "How You'll Know It Works" per module. These describe observable behavior you can verify when Kiro hands you a built module.
3. Read the "Paraskakis Pitfall #2 Mitigations" section in full. This is the trust-critical section.
4. Read the Voice and Tone section. Every user-facing finding string flows through this.
5. Skip the contract and detection logic sections unless you want to go deeper.

**Deep path (45-60 minutes):**
Read the whole thing top to bottom. Each module section is roughly 80-120 lines. The simulation section is longer because it's new work (no Hermes v1 precedent).

**What to flag back to Claude:**
- Any finding text that sounds judgmental or prescriptive
- Any check that feels like it would produce false positives against real OpenAPI specs
- Anything in the simulation flow that seems like it could go wrong in production
- Anything that contradicts SCORING.md or the product review

---

## Input Contract

Every API check module takes the same input: a parsed OpenAPI spec object produced by `parse-spec.js` (specced in BACKEND-SHARED).

```
input: {
  spec: {
    version: "3.0.3" | "3.1.0" | "2.0",
    info: { title, description, version, ... },
    paths: { "/users": { get: {...}, post: {...} }, ... },
    components: { schemas: {...}, securitySchemes: {...}, ... },
    servers: [...],
    tags: [...],
    externalDocs: {...}
  },
  metadata: {
    sourceType: "upload" | "url" | "repo-discovered",
    sourceUrl: string | null,
    sizeBytes: number,
    parserWarnings: string[]  // non-fatal warnings from parse-spec
  }
}
```

The spec is already validated and dereferenced according to the rules in BACKEND-SHARED `parse-spec.js`. Specifically:
- `$ref` targets are resolved but each reference is tracked so checks can respect reference boundaries (see Pitfall #2 mitigation)
- OpenAPI 2.0 (Swagger) specs are normalized to 3.x structure where possible; version-specific differences are surfaced via `parserWarnings`
- Circular references are detected and handled (cycles are cut at the second visit with a `__circular` marker)

## Output Contract

Every API check module returns the same shape:

```
output: {
  passed: number,               // number of sub-checks that passed
  total: number,                // total number of sub-checks run
  findings: Finding[]           // list of observations
}
```

The `Finding` shape:

```
Finding = {
  id: string,                   // stable identifier, e.g., "API-DISC-001"
  text: string,                 // agent-perspective finding text
  count: number | null,         // number of instances flagged
  examples?: string[]           // list of example endpoints/parameters flagged
}
```

---

## The Six API Check Modules

Each module lives in `/backend/src/checks/api/` as a single file. Each has one responsibility. Each reads the parsed spec, runs its checks, returns the output contract above. No module calls another module. No module mutates the spec. No module calls Bedrock or any external service (those are in Layer 2).

Category weights come from SCORING.md v1.0.0 and the product review. They sum to 100.

| File | Weight | Category |
|------|--------|----------|
| `naming-descriptions.js` | 25 | Naming & Descriptions |
| `error-design.js` | 20 | Error Design |
| `discoverability.js` | 20 | Discoverability |
| `response-efficiency.js` | 15 | Response Efficiency |
| `reliability-patterns.js` | 10 | Reliability Patterns |
| `agent-integration.js` | 10 | Agent Integration |

---

## Module 1: Naming & Descriptions (`naming-descriptions.js`)

**Weight:** 25 points

### What this module does (plain English)

Agents read an API spec the way a developer reads unfamiliar documentation: they look at the endpoint names and the descriptions to decide what each operation does. If an endpoint is called `/sync` with no description, an agent has to guess. If a response field is called `auc` instead of `activeUserCount`, the agent has to look it up somewhere else to be sure. This module checks whether the names and descriptions in the spec are clear enough for an agent to understand what each operation and field is for without guessing.

Draws from multiple sources: the Paraskakis checklist (insights #1, #2, #5 credited below), Hermes v1 patterns for description-quality heuristics, and WCAG-adjacent clarity principles applied to API documentation.

### What it checks

**Endpoint operation clarity**
- Every operation has a `summary` OR a `description`. Missing both is a medium-severity finding.
- Descriptions are at least 20 characters long. Very short descriptions like "gets users" or "creates it" don't give the agent enough context. Source: Paraskakis insight #2 ("Descriptions can override schema").
- Operation `operationId` is present. Agents prefer stable identifiers over constructing method+path strings. Source: common OpenAPI best practice, not Paraskakis-specific.



**Schema and property descriptions**
- Every response schema property has a `description` OR a self-explaining name. Self-explaining means the property name contains a full word that indicates type or purpose: `activeUserCount` is self-explaining, `auc` is not. The check uses a minimum-meaningful-length heuristic (property name must be at least 4 characters and contain at least one recognizable English word fragment) plus a common-abbreviation allowlist (`id`, `url`, `api`, etc.). Source: Paraskakis insight #5 ("Descriptive response field names eliminate extra API calls") credited.

**Global description presence**
- `info.description` at the top of the spec is present and explains what the API is for.
- If the spec uses `tags`, each tag has a `description` (not just a name).

### Checks that DO NOT run here (Pitfall #2 mitigation)

- We do NOT flag missing property-level descriptions if the parent schema has a comprehensive description. Paraskakis's warning: "property-level examples compose into full responses." Same principle applies to descriptions. If the schema description says "A user object with standard fields including email, name, and createdAt timestamps," we don't separately flag each property for missing descriptions.
- We do NOT count the same schema multiple times when it is referenced from multiple endpoints. Each schema is scored once globally, then findings are linked to all endpoints that reference it. See Pitfall #2 Mitigations section.

### Finding examples (agent's-perspective voice)

Good:
> "An agent reading this spec cannot determine what the POST /users/sync endpoint does. The operation has no summary or description. Without additional context, an agent has to guess whether this creates users, updates users, or triggers a sync job."

> "The response schema property `auc` has no description and the name is not self-explanatory. An agent receiving this response would have to look up the field name elsewhere to know whether it represents active user count, authorized user certificate, or something else."

Bad (would violate the voice rules â€” never ship these):
> ~~"Poor naming in POST /users/sync. Missing description is a failure."~~
> ~~"This API has bad descriptions."~~

### Scoring math

The module returns the count of sub-checks passed and total sub-checks run. The category score is computed proportionally:
`earned = Math.round((passed / total) * 25)`

Zero-instance rule: if the spec has no `paths` at all (e.g., an empty or malformed spec that parsed without error), the module returns `passed: 1, total: 1` (full credit) with a finding noting there was nothing to evaluate. See SCORING.md for the rationale.

### How you'll know it works

Observable behaviors you can check when Kiro delivers this module:

1. Feed it a good spec (Stripe, GitHub, or a hand-crafted fixture with full descriptions). Score should be at or near 25.
2. Feed it a bad spec (minimal descriptions, one-word summaries, abbreviated field names). Score should be meaningfully reduced, with specific findings pointing at the offending operations and properties.
3. Feed it a spec that uses `$ref` to share a schema across 10 endpoints, with one missing description on that shared schema. The finding should appear once, not 10 times.
4. Feed it a spec with property-level descriptions and no top-level schema description. It should not generate a finding for the top-level schema.
5. Run it twice on the same input. Scores and findings should be identical (determinism requirement).

### Confidence notes

- **High confidence:** The detection heuristics (length thresholds, abbreviation allowlist, summary/description presence) are straightforward text analysis.
- **Medium confidence:** The summary/description contradiction detection is a heuristic. False positives are possible on specs where summaries describe HTTP behavior and descriptions describe business logic. Needs real-world testing during the 50-site benchmark.
- **Low confidence:** The "self-explaining name" heuristic is subjective. The allowlist of common abbreviations will need to grow based on real specs. Initial allowlist includes: `id`, `url`, `uri`, `api`, `uuid`, `ip`, `http`, `https`, `sql`, `css`, `js`, `ts`. Flagged for review after first benchmark run.

---

## Module 2: Error Design (`error-design.js`)

**Weight:** 20 points

### What this module does (plain English)

When an agent makes an API call that fails, it needs to know what went wrong specifically enough to retry correctly. A 400 response that just says "Bad Request" with no body sends the agent into a guessing loop: which field was bad, which value, what format did you expect? A 400 that follows RFC 9457 Problem Details and says "The `age` field must be a positive integer" lets the agent recover in one retry. This module checks whether the spec documents errors in a way that supports one-try recovery.

Draws from the Paraskakis checklist (insight #3 credited) and RFC 9457 Problem Details standard.

### What it checks

**Error response documentation per operation**
- Every operation documents at least one 4xx response. Operations that only document 2xx responses leave agents without any recovery path when something fails.
- Documented 4xx responses have a schema attached, not just a status code. A response of `400: { description: "Bad request" }` with no schema is a medium-severity finding.
- Documented 4xx schemas include a way to identify which field failed. This is detected by looking for any of: a `field` or `fieldName` property, a `fields` or `errors` array, or explicit RFC 9457 Problem Details structure (`type`, `title`, `status`, `detail`, `instance`, `errors`).

**Error response structure**
- If the spec uses RFC 9457 Problem Details (`application/problem+json`), full credit. Source: Paraskakis insight #3 directly.
- If the spec uses a custom consistent error schema (same schema across all 4xx responses), partial credit.
- If error schemas vary across operations, finding flagged because agents have to learn multiple error formats.

**Common-error completeness**
- Authentication endpoints document 401 responses.
- Endpoints that require specific permissions document 403 responses.
- Endpoints that accept input document 400 or 422 responses.
- Endpoints that return resources document 404 responses.

Missing any of these for the relevant operation type is a low or medium finding depending on how common the gap is across the spec.

### Checks that DO NOT run here (Pitfall #2 mitigation)

- We do NOT flag missing 5xx documentation. Server errors are rarely documented in specs and agents treat them as "retry later" by default. Not worth flagging.
- We do NOT count the same shared error schema multiple times. If a spec uses `$ref: '#/components/schemas/ErrorResponse'` across 40 endpoints, the schema is evaluated once and findings are linked to all endpoints.
- We do NOT require RFC 9457 specifically. A custom but consistent error schema gets partial credit. RFC 9457 just gets full credit.

### Finding examples

Good:
> "An agent calling POST /users cannot recover from a 400 response because the error schema does not identify which field failed validation. Without a `field` reference or a structured errors array, the agent would have to inspect the full request body against the schema to guess which value caused the rejection."

> "The spec documents 14 operations that accept request bodies but only 3 of them document 4xx error responses. An agent encountering an error on the other 11 operations has no documented recovery path."

### Scoring math

The module returns the count of sub-checks passed and total sub-checks run. The category score is computed proportionally:
`earned = Math.round((passed / total) * 20)`

Zero-instance rule: if a spec has no operations that would reasonably return errors (e.g., read-only spec with all 2xx responses and no inputs), returns `passed: 1, total: 1` (full credit).

### How you'll know it works

1. Feed it a spec using RFC 9457 Problem Details consistently. Score should be at or near 20.
2. Feed it a spec with no documented error responses. Score should be near 0.
3. Feed it a spec with inconsistent error schemas (some RFC 9457, some custom, some just `{ message: string }`). Score should be in the middle with findings identifying the inconsistency.
4. Feed it a spec where `ErrorResponse` is shared via `$ref` across 20 operations. One finding about the shared schema, linked to all 20 operations, not 20 separate findings.

### Confidence notes

- **High confidence:** RFC 9457 detection (specific content-type `application/problem+json` or specific field presence).
- **Medium confidence:** The "identifies which field failed" heuristic. Some specs use nested error structures this check may not recognize. Allowlist of known patterns will grow.
- **Low confidence:** The "common-error completeness" check. Distinguishing between "this endpoint should document 401" vs. "this endpoint legitimately doesn't require auth" requires knowing the auth model. Implementation uses the spec's `security` declarations as signal. If security is declared, 401 should be documented.

---

## Module 3: Discoverability (`discoverability.js`)

**Weight:** 20 points

### What this module does (plain English)

Agents don't know what IDs exist in your system until they find them. If an API has a `GET /users/{userId}` endpoint but no `GET /users` list endpoint, an agent can't get started because it has no way to discover user IDs. Same for orders, documents, products, anything. This module checks whether collection resources have discovery endpoints and whether the hierarchy makes relationships between resources clear.

Draws from the Paraskakis checklist (insights #4, #6, #10 credited) and REST API design conventions.

### What it checks

**List endpoint presence for collection resources**
- For every resource that has a `GET /{resource}/{id}` endpoint, check whether there is also a `GET /{resource}` endpoint (or a filter-based discovery path). Missing list endpoints are medium-severity findings. Source: Paraskakis insight #6 ("Every collection resource needs a list endpoint") credited directly.
- Resources are identified by analyzing path structure: `/users/{userId}` implies a `users` resource.

**Resource hierarchy clarity**
- When nested resources exist (e.g., `/courses/{courseId}/cohorts/{cohortId}/students/{studentId}`), the parent resources should also be listable independently. A `students` endpoint that only exists nested deep in a hierarchy is hard to discover. Source: Paraskakis insight #4 ("Agents navigate multi-resource APIs through context + design") credited.

**Filter and query parameter documentation**
- List endpoints document their filterable query parameters. `GET /orders?status=active` only works for agents if the spec documents that `status` is a valid filter. Undocumented filters cause agents to miss the feature entirely. Source: Paraskakis insight #10 ("Agents won't look for docs they think they don't need") credited.
- Documented query parameters have types and enum values where applicable. `status` typed as `string` is less useful than `status` typed as `string` with `enum: [active, pending, completed, cancelled]`.

**Outcome-focused operation presence**
- Check for the presence of operations beyond basic CRUD. An API for course management that only has CRUD on courses, students, and cohorts but no "enroll student in cohort" operation forces agents to orchestrate multiple calls. Outcome-focused operations simplify agent work. This is a low-severity informational finding, not a deduction. Source: Paraskakis insight #4 directly.

### Checks that DO NOT run here (Pitfall #2 mitigation)

- We do NOT assume every endpoint needs a list endpoint. Some endpoints are legitimately action-based (`POST /emails/send`, `POST /jobs/trigger`). We detect action-based endpoints by verb analysis of the operation summary (action verbs like "send," "trigger," "cancel," "approve") and exclude them from the list-endpoint check.
- We do NOT flag missing list endpoints for resources that aren't typical collection resources. Singleton endpoints (`GET /account/settings`, `GET /config`) don't need list variants.

### Finding examples

Good:
> "An agent trying to use this API cannot discover which users exist. The spec defines GET /users/{userId} but no GET /users endpoint. Without a list endpoint, an agent has no way to get a userId to use in other operations unless one is provided externally."

> "The GET /orders endpoint accepts a `status` query parameter but does not document its valid values. An agent attempting to filter orders by status would have to guess (active? pending? complete?) or try all possibilities."

### Scoring math

The module returns the count of sub-checks passed and total sub-checks run. The category score is computed proportionally:
`earned = Math.round((passed / total) * 20)`

Zero-instance rule: if the spec has no parameterized paths at all (no `{id}` segments), returns `passed: 1, total: 1` (full credit).

### How you'll know it works

1. Feed it a spec with `/users/{id}` but no `/users`. Medium-severity finding.
2. Feed it a spec with `/users/{id}` AND `/users`. No finding.
3. Feed it a spec with a deeply nested resource and no intermediate list endpoints. Multiple findings, one per missing list endpoint.
4. Feed it a spec where `/emails/send` is the only email-related endpoint. No finding (recognized as action-based).
5. Feed it a spec with undocumented query parameter values. Finding specifically about missing enum values.

### Confidence notes

- **High confidence:** Path structure analysis (detecting `/resource/{id}` patterns).
- **Medium confidence:** Action-based endpoint detection via verb analysis. Some action endpoints use non-verb paths (`/sessions` where POST creates and DELETE revokes). These are handled via operation summary analysis but edge cases will emerge.
- **Low confidence:** The "outcome-focused operations" check is subjective. Implemented as informational finding only (zero point deduction) in v1.

---

## Module 4: Response Efficiency (`response-efficiency.js`)

**Weight:** 15 points

### What this module does (plain English)

When an agent calls an API, every field in the response costs tokens. Returning 80 fields when the agent only needs 3 isn't a single big problem â€” it's a small problem that compounds across every call. Over a conversation that makes 30 API calls, bloated responses can burn thousands of unnecessary tokens. This module checks whether response schemas are focused, whether pagination is designed well, and whether the spec supports field selection or sparse responses.

Draws from the Paraskakis checklist (insights #8, #9 credited).

### What it checks

**Response schema size**
- Count the number of properties in response schemas per endpoint. Response schemas with 30+ fields are flagged for review. Source: Paraskakis insight #9 ("Complex, verbose responses are a silent token tax") credited.
- Deeply nested responses (3+ levels of object nesting) get a separate finding because deep nesting also complicates agent parsing.

**Pagination design**
- List endpoints that return arrays support pagination (via `limit`/`offset`, `page`/`pageSize`, `cursor`, or equivalent). Unpaginated list endpoints that could return large arrays are flagged. Source: Paraskakis insight #8 ("Pagination is a safety net, not the front door") credited.
- Pagination parameters have sensible defaults documented and reasonable maximums.
- List responses document total count via `totalCount` or equivalent. Source: Paraskakis insight #8 directly.

**Filter presence on list endpoints**
- List endpoints offer filter parameters, not just pagination. Without filters, agents have to retrieve large result sets and filter client-side. Source: Paraskakis insight #8 directly.

**Sparse response support (informational)**
- Spec supports field selection (`fields=id,name,email` query parameter or GraphQL-style selection). This is a bonus, not a deduction. Documented as informational finding.

### Checks that DO NOT run here (Pitfall #2 mitigation)

- We do NOT flag a schema that has many properties if the properties have good descriptions and clear names. Large responses are only a problem when the data is bloated AND unclear. Well-documented 80-field schemas are scored differently than opaque 80-field schemas. The detection logic combines field count with naming/description signal from Module 1 (without re-running Module 1's checks).
- We do NOT penalize responses that are inherently large (file listings, paginated datasets). Pagination presence mitigates the schema size finding.

### Finding examples

Good:
> "The response schema for GET /users/{userId} contains 52 properties. An agent needing only a user's email and name receives 52 fields on every call. Over repeated invocations, this accumulates as unused token context."

> "GET /orders returns an array of orders but does not document pagination. An agent querying this endpoint cannot control result set size and may receive responses too large to process in a single context window."

### Scoring math

The module returns the count of sub-checks passed and total sub-checks run. The category score is computed proportionally:
`earned = Math.round((passed / total) * 15)`

Zero-instance rule: if the spec has no response schemas at all, returns `passed: 1, total: 1` (full credit).

### How you'll know it works

1. Feed it a spec with a 60-field response schema and no filtering. Finding about schema size.
2. Feed it a spec with paginated list endpoints with `totalCount`. No pagination findings.
3. Feed it a spec with list endpoints that accept filter query parameters. No filter findings.
4. Feed it a spec with a large response schema AND excellent descriptions on every field. Reduced severity on the size finding (from medium to low).

### Confidence notes

- **High confidence:** Field counting, pagination parameter detection.
- **Medium confidence:** The "good descriptions offset size" heuristic. Needs tuning against real specs.
- **Low confidence:** The sparse response detection. Different APIs implement this different ways; the check looks for common patterns but will miss custom implementations.

---

## Module 5: Reliability Patterns (`reliability-patterns.js`)

**Weight:** 10 points

### What this module does (plain English)

Agents retry when calls fail. They also call APIs across versions as things change. Both of these need support from the API: safe retries require idempotency guarantees, and version changes require machine-readable deprecation signals. This module checks whether the spec supports reliable agent behavior when things go wrong or change.

Draws from the Paraskakis checklist (insights #7, #11 credited) and HTTP standards (RFC 9745 Deprecation header, RFC 8594 Sunset header).

### What it checks

**Idempotency signals**
- PUT and DELETE operations are documented as idempotent (either through explicit documentation or implicit by HTTP method convention). This is the baseline.
- POST operations that create resources support idempotency keys via the `Idempotency-Key` header OR document server-side uniqueness constraints (e.g., "email must be unique" in schema). Source: Paraskakis insight #7 ("Design for idempotency") credited.
- Operations that mutate state document whether retry is safe.

**Deprecation signals**
- Deprecated operations use OpenAPI's `deprecated: true` flag.
- Deprecated operations document their successor (via `externalDocs`, `description`, or `x-deprecation` extension).
- If any operations are marked deprecated, the spec mentions the deprecation policy in `info.description` or references RFC 9745 Deprecation headers. Source: Paraskakis insight #11 ("Signal deprecation with machine-readable headers") credited.

**Versioning clarity**
- The spec has a clear versioning strategy (URL-based like `/v2/`, header-based, or date-based). Detecting via `servers` URLs or explicit `info.version` patterns.
- If versioning is URL-based, older versions are referenced or documented somewhere so agents can find migration info.

### Checks that DO NOT run here (Pitfall #2 mitigation)

- We do NOT require idempotency keys on all POST operations. Many POST operations are legitimately non-idempotent by design (creating events, sending notifications, recording metrics). The check applies specifically to resource-creation POSTs, detected via response shape (returns a new resource with an ID).
- We do NOT flag non-deprecated APIs for missing deprecation policy. The deprecation policy check only runs if the spec has at least one `deprecated: true` operation.

### Finding examples

Good:
> "An agent retrying a failed POST /users request cannot be confident the retry will not create duplicate users. The operation does not support an Idempotency-Key header and the schema does not declare a uniqueness constraint on any field."

> "The GET /v1/users endpoint is marked deprecated but does not document its successor. An agent cannot determine which endpoint to migrate to without additional documentation the spec does not reference."

### Scoring math

The module returns the count of sub-checks passed and total sub-checks run. The category score is computed proportionally:
`earned = Math.round((passed / total) * 10)`

Zero-instance rule: if the spec has no state-mutating operations (read-only API) and no deprecated operations, returns `passed: 1, total: 1` (full credit).

### How you'll know it works

1. Feed it a spec with Idempotency-Key on creation POSTs. No idempotency findings.
2. Feed it a spec with no idempotency support and creation POSTs. Idempotency findings per creation endpoint.
3. Feed it a spec with deprecated operations that document successors. No deprecation findings.
4. Feed it a spec with deprecated operations that don't document successors. Deprecation findings.

### Confidence notes

- **High confidence:** `deprecated: true` flag detection, `Idempotency-Key` header presence.
- **Medium confidence:** "Resource-creation POST" detection via response shape analysis.
- **Low confidence:** The "server-side uniqueness constraint" detection. Requires pattern matching on schema descriptions, which is fuzzy. Allowlist of common uniqueness phrases: "must be unique," "uniquely identifies," "duplicate detection."

---

## Module 6: Agent Integration (`agent-integration.js`)

**Weight:** 10 points

### What this module does (plain English)

Even a perfect API spec is just a spec. Agents that consume it directly (via MCP servers, tool-calling, or code generation) benefit from whether the spec lives alongside other integration resources: SDKs, Skills, code samples, auth that uses recognizable conventions. This module checks whether the spec is part of a complete agent integration story or just a document.

Draws from the Paraskakis checklist (insight #12 credited, pitfall #1 addressed). Also draws from observed agent behavior in tool-calling contexts.

### What it checks

**Authentication scheme clarity**
- `securitySchemes` are defined in components.
- Auth schemes use standard types where possible (`http` with `bearer` or `basic`, `apiKey`, `oauth2`, `openIdConnect`). Custom auth schemes documented inline.
- API key auth includes location (`header`, `query`, `cookie`) and name. Note: API key auth is not a deduction in itself â€” it's flagged if the location/name is ambiguous. Source: Paraskakis pitfall #2 addressed (we do not flag API key auth as an "issue" just because it's not OAuth).

**Universal search endpoint detection (Pitfall #1)**
- If the spec has a `POST /search` endpoint that accepts arbitrary query objects and returns heterogeneous results, flag it. Source: Paraskakis pitfall #1 ("Universal search endpoints are a hallucination factory") credited directly.
- Exception: if the API is clearly a search product (name contains "search", description mentions "search engine" or similar), the endpoint is expected and not flagged.

**External documentation links**
- `externalDocs` is present at spec level, pointing to human documentation.
- Individual operations reference `externalDocs` where deeper context exists.

**SDK / Skill references (informational)**
- Spec description or `externalDocs` references an SDK, code samples, or agent Skill. Source: Paraskakis insight #12 ("SDKs > OpenAPI > Code samples or tutorials for agents") credited.
- This is informational only. Missing SDK doesn't deduct points. Present SDK is a positive signal surfaced in the report.

### Checks that DO NOT run here (Pitfall #2 mitigation)

- We do NOT flag API key auth as insecure or inferior. API key auth is valid and widely understood by agents. Source: Paraskakis pitfall #2 directly.
- We do NOT flag standard rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`). Agents know these conventions from training data. Source: Paraskakis pitfall #2 directly.

### Finding examples

Good:
> "The spec defines a POST /search endpoint that accepts a generic query object and returns heterogeneous results. Agents calling this endpoint without specific knowledge of valid query shapes are prone to hallucinating parameters. Per-resource filters (e.g., GET /orders?status=active) are self-documenting and reduce this risk."

> "The API key authentication scheme does not specify whether the key should be sent in a header, query parameter, or cookie. An agent cannot correctly authenticate without trying multiple locations."

### Scoring math

The module returns the count of sub-checks passed and total sub-checks run. The category score is computed proportionally:
`earned = Math.round((passed / total) * 10)`

Zero-instance rule: if the spec has no `security` declarations and no operations requiring auth, returns `passed: 1, total: 1` (full credit).

### How you'll know it works

1. Feed it a spec with well-defined OAuth2 and externalDocs. No auth findings.
2. Feed it a spec with ambiguous API key setup (no location specified). Finding about auth ambiguity.
3. Feed it a spec with a POST /search universal endpoint. Finding (unless the API is clearly a search product).
4. Feed it a spec using X-RateLimit headers and no explicit rate limit documentation. No finding (known convention).
5. Feed it a spec with no SDK reference. Informational signal, no deduction.

### Confidence notes

- **High confidence:** Standard auth scheme detection (OpenAPI spec structure).
- **Medium confidence:** "Universal search" detection. Heuristic based on path name + request body shape + response shape. False positives possible on specs where `/search` is appropriate (Algolia, Elastic, etc.) â€” mitigated by the search-product exception.
- **Low confidence:** SDK reference detection. No standard way to declare an SDK in OpenAPI. Check looks for common patterns in `externalDocs.url` and `info.description` (github.com paths, npm/pypi links, "SDK" or "Skill" text).

---

## Paraskakis Pitfall #2 Mitigations

This section is the trust-critical one. Paraskakis's warning to the industry:

> "Don't blindly trust API readiness scoring tools. They inflate description and example gaps by dereferencing $refs and counting reused schemas multiple times. They miss that property-level examples compose into full responses. They flag X-RateLimit headers (which agents know from training data) and API key auth without considering context or convention. Always validate findings against the actual spec and real agent behavior."

This warning applies directly to Agentis Lux. If we don't address these failure modes explicitly, we become exactly the kind of tool Paraskakis is warning against. Here's how each specific mitigation is implemented in the check logic above.

### Mitigation 1: $ref boundaries respected

**The problem:** Naive tools dereference all `$ref` pointers before scoring. A shared `ErrorResponse` schema referenced from 40 endpoints gets counted 40 times for any quality issue. Score becomes wildly inflated.

**Our implementation:**
- `parse-spec.js` (in BACKEND-SHARED) tracks `$ref` origins when dereferencing. Each schema carries a `__origin` metadata field recording whether it was defined inline or referenced from `components/schemas`.
- Check modules iterate over schemas by origin. Inline schemas are scored per-appearance; referenced schemas are scored once globally.
- Findings on referenced schemas are linked to all endpoints that use them via the `location` field's array form (e.g., `location.references: ["GET /users/{id}", "POST /users", "DELETE /users/{id}"]`).

**Where this is applied:**
- Module 1 (Naming & Descriptions): shared schemas scored once.
- Module 2 (Error Design): shared error schemas scored once.
- Module 4 (Response Efficiency): shared response schemas scored once.

**How you can verify:**
Test fixture with one shared `User` schema referenced from 10 endpoints, missing one description. Expected: one finding, linked to 10 locations. NOT 10 findings.

### Mitigation 2: Property-level examples compose into full responses

**The problem:** Naive tools flag "missing top-level response example" even when every property has its own example. The property examples compose into a complete example; the tool just doesn't recognize the composition.

**Our implementation:**
- Module 4 (Response Efficiency) and Module 1 (Naming & Descriptions) examine both top-level schema descriptions/examples AND property-level descriptions/examples.
- If top-level is missing but at least 80% of properties have descriptions/examples, the top-level finding is not generated.
- The threshold (80%) is documented and can be tuned; current value is a starting assumption to be validated against the 50-site benchmark.

**Where this is applied:**
- Module 1: property-level descriptions can satisfy parent schema description expectations.
- Module 4: property-level examples count toward "schema has examples" check.

**How you can verify:**
Test fixture with no top-level `description` on `User` schema but `description` on every property. Expected: no finding on `User` schema.

### Mitigation 3: Known conventions not flagged

**The problem:** Naive tools flag `X-RateLimit-*` headers as "undocumented" or API key auth as "insecure." These are standard conventions that agents recognize from training data. Flagging them is noise.

**Our implementation:**
- Module 6 (Agent Integration) maintains an allowlist of known-from-training-data conventions:
  - Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
  - Auth schemes: `http.bearer`, `http.basic`, `apiKey`, `oauth2`, `openIdConnect`
  - Pagination conventions: `limit`, `offset`, `page`, `pageSize`, `cursor`, `after`, `before`
  - Content types: `application/json`, `application/xml`, `application/problem+json`, `multipart/form-data`
- Findings are not generated when schemas/headers/parameters match these conventions, even if they aren't explicitly described.

**Where this is applied:**
- Module 6: auth schemes and rate limit headers not flagged when standard.
- Module 1: standard parameter names (`limit`, `offset`, etc.) get reduced description requirements.

**How you can verify:**
Test fixture that uses standard `X-RateLimit-*` headers with no descriptions. Expected: no finding on these headers specifically.

### Mitigation 4: Published methodology discipline

**The problem:** Even well-implemented mitigations are opaque if the tool doesn't publish its methodology. Users have to trust the score without being able to inspect why a specific finding did or did not appear.

**Our implementation:**
- SCORING.md v1.0.0 and forward documents every category, every check, every scoring decision.
- Each finding in a scan report includes the check ID, the rule that triggered it, and what would have to change for it to resolve.
- The 50-site benchmark data will be published alongside the methodology so anyone can validate findings against the actual specs.
- Methodology changes are versioned via semver (see SCORING.md versioning section).

### Mitigation 5: Validate against the actual spec

**The problem:** Paraskakis: "Always validate findings against the actual spec and real agent behavior."

**Our implementation:**
- Layer 2 simulation (described below) sends the actual spec to an LLM that attempts tasks against it. When the LLM succeeds or fails, the simulation result validates or contradicts the Layer 1 deterministic finding.
- Where simulation contradicts Layer 1 (e.g., Layer 1 flagged a description as missing, but the LLM understood the endpoint fine), the report shows both signals so users can judge.
- The 50-site benchmark will be the first large-scale validation. Findings that consistently contradict agent behavior across multiple real specs will be re-examined.

### Integrity check

At time of writing, every mitigation above is either implemented in the check module logic specified in this doc, planned for the simulation layer specified below, or enforced by the published methodology in SCORING.md. If a check in any module violates any of these mitigations during implementation, that's a build-blocking bug.

---

## API Scoring Module (`scoring/api-scoring.js`)

### Purpose

Aggregates the six API check module outputs into a single API score with per-category breakdown. Parallel structure to the frontend scoring module in BACKEND-FRONTEND-CHECKS.

### Input

Array of six check module outputs, one per category:

```
[
  { checkId: "naming-descriptions", rawScore: 22, maxPoints: 25, findings: [...], metadata: {...} },
  { checkId: "error-design", rawScore: 15, maxPoints: 20, findings: [...], metadata: {...} },
  ... (4 more)
]
```

### Output

```
{
  scanMode: "api",
  totalScore: 84,              // 0-100, sum of rawScores
  maxScore: 100,               // always 100 for a complete API scan
  rating: "Partially Ready",   // one of: Agent-Ready, Partially Ready, Not Yet Readable
  categories: [
    {
      name: "Naming & Descriptions",
      score: 22,
      maxScore: 25,
      percentage: 88,
      zeroInstance: false,
      findingsCount: 2,
      findings: [...]  // full finding array from check module
    },
    ...
  ],
  totalFindings: 14,
  scannedAt: "2026-06-19T12:00:00.000Z",
  methodologyVersion: "1.1.1"  // matches the methodologyVersion in flow.js and api-flow.js
}
```

### Scoring math

1. For each category, compute: `earned = Math.round((passed / total) * max)` where `max` is the category weight. If `total === 0`, `earned = max`.
2. Sum the category `earned` scores to produce the total score (0-100).
3. Apply rating bands to the total score:
   - 80-100: "Agent-Ready"
   - 50-79: "Partially Ready"
   - 0-49: "Not Yet Readable"

### Zero-instance handling

If any check module returns `total === 0` (indicating no scannable instances for that category, which defaults to `passed: 1, total: 1`), that category receives full points (the category weight) with a note explaining the absence of instances (e.g., "no parameterized paths").

Determining "Not Evaluable" (where the spec is entirely empty or trivial) is handled upstream in the orchestrator before check modules are executed, rather than inside the scoring module.

### Combined scoring with frontend (when both present)

See BACKEND-FRONTEND-CHECKS scoring section for the combined-score logic. Starting assumption: 50/50 weight between frontend and API when both are present. Subject to adjustment based on 50-site benchmark data.

### How you'll know it works

1. Feed it six check outputs with known scores. Total should match sum.
2. Feed it a set where one module has `zeroInstance: true`. That category shows full credit with flag.
3. Feed it all six with `zeroInstance: true`. Rating shows "Not Evaluable" with explanation.
4. Run it twice with identical inputs. Output identical (determinism).

### Confidence notes

- **High confidence:** Sum logic, rating band assignment, zero-instance handling.
- **Medium confidence:** Combined-score weighting between frontend and API (50/50 starting assumption).
- **Low confidence:** Rating band thresholds (80/50). These are starting values; may adjust once 50-site benchmark shows real-world distribution.

---

## Voice and Tone (Findings, Errors, UI Strings)

Every user-facing string this module produces must pass the Voice and Tone rules.

### The rules

1. **Agent-perspective phrasing.** Findings describe what an agent can or cannot do, not what the developer did wrong. "An agent cannot determine..." not "Your description is missing..."
2. **No judgment words.** Never "bad," "poor," "weak," "failing," "violates," "broken." Use "cannot," "does not," "without this, an agent would..."
3. **No fix prescriptions.** Findings observe; they do not instruct. "The operation has no summary" not "Add a summary to this operation."
4. **Specific, not generic.** Every finding names the specific endpoint, schema, or property. No "some operations are missing descriptions" findings.
5. **Reference the agent behavior, not the rule.** "Without a response schema, an agent cannot validate the response structure" not "You are missing a response schema per OpenAPI best practice."
6. **Agentis Lux in user-facing strings, Perseus Clew in engineering contexts.** When a finding or error message refers to the scanner itself (rare), it's Agentis Lux. Internal log messages, CloudWatch metrics, and code comments use Perseus Clew.

### Examples

These are patterns to follow. Each module has its own full finding examples above.

Good:
> "An agent calling POST /orders cannot recover from a 400 response because the error schema does not identify which field failed validation."

Bad (judgment):
> ~~"Poor error design. The 400 response is inadequate."~~

Bad (prescription):
> ~~"Add RFC 9457 Problem Details to your 400 response schema."~~

Bad (generic):
> ~~"Some operations have weak error documentation."~~

Good (observational + specific):
> "The GET /users/{userId} response schema has 52 properties. An agent needing only `email` and `name` receives all 52 fields on every call."

### How Kiro enforces this

- Finding strings in check modules are pulled from a `findings-catalog.js` file per module, not string-literal concatenation throughout the code. This means voice/tone review happens once per file, not per finding instance.
- The catalog file is reviewed by the human builder (you) before the module ships. Each catalog entry has the template, the severity, and one example rendering.
- Kiro hook (security scan + voice check) runs a grep on check modules for banned words: "bad", "poor", "weak", "failing", "you should", "we recommend", "fix this", "violates". Any hit blocks the commit.

---

## Layer 2: Agent Simulation

### What Layer 2 does (plain English)

Layer 1 is deterministic. It pattern-matches the HTML or spec against known agent-readiness rules and produces findings. Layer 2 is different: it sends the actual HTML or spec (summarized appropriately) to an LLM with a specific task, asks the LLM to attempt the task as an agent would, and records what the LLM could and couldn't do. The result is a narrative layer that sits alongside the findings: "An agent was asked to find the checkout button. It could not locate the button and tried three div elements before giving up. Related Layer 1 finding: SEM-001 (styled div instead of semantic button)."

This turns abstract rule violations into observed agent behavior. It's also the validation layer for Paraskakis Pitfall #2: when the LLM succeeds at a task despite a Layer 1 finding, that's a signal the finding may be a false positive.

### Why now (not future)

Hermes Clew v1 proved the deterministic-plus-LLM pattern works. Bedrock credits are available. The architecture is familiar. Building Layer 2 at MVP means the launch report has narrative context from day one, not just scores and findings.

### Where it runs

Dedicated Lambda: `simulation-lambda`. Triggered by the scan orchestrator after Layer 1 completes and after the result-hero line is generated. Invokes Bedrock via the shared `bedrock-client` (BACKEND-SHARED). The simulation result is included in the scan response (under the `simulation` field) and persisted with the rest of the response in ScanResults (24-hour TTL) per the v2 architecture. The ScanCache table (15-minute TTL, separate concern) holds a deduplication entry keyed by URL hash; simulation results live with the response, not the cache.

At MVP, simulation runs synchronously within the scan request. Scan response returns when both Layer 1 and Layer 2 are complete. Target end-to-end latency: under 15 seconds for typical inputs.

Upgrade path (documented, not built at MVP): if latency or cost become problems, simulation becomes asynchronous. Scan response returns with Layer 1 immediately and Layer 2 results populate in the UI via polling or SSE. Not built now; the orchestrator is structured so this upgrade is a small refactor, not a rewrite.

### Task library

The task library defines what the LLM tries to do against each scanned HTML document. There are three frontend-only simulation tasks at MVP (and no API-specific simulation tasks):

#### Frontend tasks

**SIM-FE-CTA: Find the primary call-to-action**
- Prompt: "Identify the primary call-to-action on this page (the main action the page wants the user to take). Report the element tag, its text content, and whether it is a semantic interactive element (button or anchor)."
- Links to Layer 1 categories: Semantic HTML, Content in HTML.

**SIM-FE-PURPOSE: Identify the page's purpose**
- Prompt: "From this HTML alone (no JavaScript execution, no images rendered), determine what this page is for. What would an agent be able to understand about this page without rendering it?"
- Links to: Structured Data, Semantic HTML, Content in HTML.

**SIM-FE-NAV: Identify navigation structure**
- Prompt: "Identify the navigation structure of this page. Can you find a nav element? Where do links lead? Can you determine where this page sits in the site hierarchy?"
- Links to: Link & Navigation, ARIA & Accessibility.

### Input summarization

LLM context windows are finite. Sending a full 500KB OpenAPI spec or a full HTML page with inlined CSS would exceed Claude Haiku 4.5's effective context. Input summarization runs before each simulation task.

**HTML summarization:**
- Strip: `<script>` tags and their contents, `<style>` tags and their contents, all CSS (inline and external), HTML comments, data URIs, SVG path data.
- Keep: tag structure, text content, attributes (id, class, name, role, aria-*, href, src metadata only), form field structure.
- Collapse: long repeated structures (e.g., 50-row tables) to their first 3 rows + "... (47 more rows)"
- Output: cleaned HTML, under 50KB typically.

**Spec summarization:**
- Keep: `info`, `tags`, `servers`, full `paths` with operation summaries and descriptions, `components.schemas` with descriptions (not full nested definitions), `components.securitySchemes`.
- Collapse: `examples` bodies to their first 3 properties, nested schemas beyond 2 levels to their description.
- Output: cleaned JSON, under 40KB typically.

If summarization still produces output too large for context, the task is run against a subset (first N endpoints or first N KB of HTML) with a note in the simulation result: `{ inputTruncated: true, truncationReason: string }`. Truncation is surfaced in the report UI.

### Prompt structure

Every simulation task uses the same prompt skeleton. Filled in from the task library.

System prompt (fixed, same for all tasks):
```
You are an AI agent examining [HTML | an API spec] to determine what actions you could take if you were trying to complete a task.

You do not have JavaScript execution or browser rendering. You see only the raw [HTML | OpenAPI spec] content.

Your job is to report what you can and cannot determine from the input alone. Be specific. Reference elements or endpoints by name. Do not guess or fill in gaps. If something is unclear from the input, say so.

Return your response as JSON matching the schema provided in the user prompt. Do not include any text outside the JSON.
```

User prompt template (filled per task):
```
[Task-specific prompt from task library]

Input:
```[html|json]
[summarized input]
```

Respond with JSON matching this schema:
[expected output schema for this task]
```

### Structured output contract:

```
{
  available: true,
  tasks: [
    {
      taskId: string,               // e.g. "SIM-FE-CTA"
      outcome: "success" | "partial" | "failure",
      narrative: string,            // present-tense agent narrative (under 150 chars)
      linkedFindings: string[],     // Layer 1 finding IDs, validated against computed findings
      reasoning: string             // model's reasoning
    }
  ],
  source: "ai",
  model: string,                    // Bedrock model ID used
  durationMs: number,               // elapsed time for the call
  totalTokensUsed: number
}
```

On Bedrock failure, rate-limiting, or parsing error, it degrades gracefully to:

```
{
  available: false,
  reason: string                    // "timeout", "throttle", "parse-error", etc.
}
```

### Graceful degradation

Layer 2 is additive. If it fails, Layer 1 results still ship. The scan response always includes Layer 1. Layer 2 appears when available.

Failure modes:

**Bedrock timeout:** Task marked `status: "failed"`, `result: null`, narrative explains "The simulation did not complete within the time budget." Other tasks continue.

**Bedrock rate limit (throttling):** Simulation Lambda retries once with backoff. If still throttled, affected tasks marked `status: "failed"`. Rate limit events logged to CloudWatch.

**Malformed LLM output (not valid JSON against schema):** Simulation Lambda attempts one re-prompt with explicit instruction to fix the format. If still malformed, task marked `status: "failed"`.

**Input too large even after summarization:** Task marked `status: "skipped"`, `result: { skipped: true, reason: "input_too_large" }`. Narrative in UI: "Simulation was not attempted because the input exceeded size limits even after summarization."

**Prompt injection detected:** BACKEND-SHARED `sanitize.js` runs on all summarized inputs before they hit Bedrock. Inputs containing patterns like "ignore previous instructions" or base64-encoded instruction blobs are stripped. If sanitization alters the input materially, a flag is set and the simulation result notes the input was sanitized.

### Linking Layer 2 to Layer 1 findings

The `relatedFindings` field in each task result links simulation narratives to deterministic findings. The linking happens during result processing, not in the prompt.

After simulation completes, for each task:
1. Read the task's `links to` categories (declared in task library).
2. Pull all Layer 1 findings from those categories.
3. Use LLM narrative keywords (the `reasoning` field) to identify specific finding references. Example: if the narrative mentions "could not find a button element," link to any Layer 1 finding with `category: "Semantic HTML"` and title referencing buttons.
4. If no specific match, link to the category-level findings generally.

This is a best-effort linking; low confidence on any individual link is acceptable because the user can see both the narrative and the full finding list in the report.

### Caching

Same input + same task = same cached result. Cache key: hash of `(summarized_input + task_id + prompt_version)`. TTL: 15 minutes (env-configurable, matches scan result cache).

This means a user who re-scans the same URL within 15 minutes gets the cached simulation result without a new Bedrock call. Saves cost and latency.

### Cost management

Claude Haiku 4.5 pricing (verified current): $1/M input tokens, $5/M output tokens.

Per-task budget estimate:
- Input: ~20k tokens typical (summarized HTML or spec + prompts) = $0.02
- Output: ~1k tokens typical (structured JSON response) = $0.005
- Per-task cost: ~$0.025

Three tasks per full scan = ~$0.075 per scan.

At 1000 scans/day, that's $75/day or $2250/month in Bedrock costs. Covered by AWS credits for initial period. Cost alarms set at $50/day during MVP as an early warning.

If costs grow beyond expected, levers available:
- Reduce task count (currently 6, could drop to 3)
- Reduce model to smaller tier if Claude releases a Haiku-mini or similar
- Move simulation to paid tier only
- Rate-limit simulation per IP or per scan type

None needed at MVP. All are documented fallbacks.

### Confidence notes

- **High confidence:** The structured output contract, graceful degradation patterns, caching strategy, sanitization requirements.
- **Medium confidence:** The specific task library (three tasks). May expand or refine based on real-world results. Task library file is designed as a JS module that exports task definitions, so adding or adjusting tasks post-launch is a contained change.
- **Low confidence:** Input summarization token targets. Real specs and pages vary wildly. Summarization may under-trim on some inputs and over-trim on others. Will need tuning against the 50-site benchmark. Truncation flag exists as a safety net.

---

## Orchestrator Extensions

The scan orchestrator Lambda (specced in BACKEND-FRONTEND-CHECKS) is extended to handle API scanning and simulation. No new Lambda; same orchestrator, more steps.

### Updated scan flow

1. **Validate input.** Same as before.
2. **Fetch and parse.** If URL, fetch HTML and also attempt API spec auto-discovery (per product review). If repo, fetch files and identify both frontend files and spec files. If spec upload, parse spec directly.
3. **Run Layer 1 frontend checks.** Same as before (six modules, sequential).
4. **Run Layer 1 API checks.** If spec present: six modules, sequential. If no spec: skip this step.
5. **Compute Layer 1 scoring.** Frontend score, API score, combined score if both present.
6. **Run Layer 2 simulation.** Three frontend tasks. Run concurrently (Bedrock can handle concurrent invocations).
7. **Assemble report.** Combine Layer 1 + Layer 2 + methodology version + scan metadata.
8. **Return response.** Scan response goes to the client.

### When the spec is discovered but not uploaded

If the user scanned a URL and the orchestrator auto-discovered an API spec at `/openapi.json` or similar, the API scan is included at MVP for the backend-only path (benchmark data) but NOT surfaced in the user-facing UI. This matches the product review decision: API scanning is backend-only for the public free tier at launch.

The scan response will include API results when the caller is the benchmark scanner (internal) and omit them when the caller is the public-facing UI Lambda. Controlled by a flag in the orchestrator's input payload.

### Idempotency

Same input + same scan ID = same output. Deterministic across Layer 1. Layer 2 uses caching to preserve idempotency within the cache TTL.

### How you'll know it works

1. Scan a URL with an auto-discovered spec. Both Layer 1 frontend and Layer 1 API run. Layer 2 runs both task sets.
2. Scan a URL with no spec. Only frontend runs. Layer 2 runs only frontend tasks.
3. Scan a repo with both frontend files and a spec file. Both layers run.
4. Scan an uploaded spec only. Only API side runs. Layer 2 runs only API tasks.
5. Run the same scan twice within 15 minutes. Second scan returns cached Layer 2 results.

### Confidence notes

- **High confidence:** The flow structure, idempotency model.
- **Medium confidence:** The parallel Layer 2 task execution. Tasks don't share state, so parallelism is safe. Coordination error cases (one task fails, others succeed) handled by graceful degradation per task.
- **Low confidence:** Backend-only API scan gating via flag. The flag approach works but an attacker could potentially forge the flag if Lambda is invoked without authentication. BACKEND-SHARED rate-limit and auth enforcement (public UI Lambda has an AWS-internal auth check) mitigate but do not eliminate. Worth revisiting in BUILD-PLAN security section.

---

## Integration with SCORING.md

This doc and SCORING.md are kept in sync. When this doc is signed off, SCORING.md is updated to v1.1.1 with:

- API category sections expanded to match the detail already in the frontend sections
- Paraskakis Pitfall #2 mitigations explained in public-facing language
- Layer 2 simulation described (not full technical detail, just what users see in the report)
- Zero-instance rule confirmed for API modules
- Changelog entry: "1.1.1 — Expanded API methodology to match engineering spec in BACKEND-API-CHECKS.md v1."

The public methodology in SCORING.md is the trust document. This doc is the engineering contract. They describe the same system at different depths.

---

## Confidence Notes Summary

### High confidence (locked)

- Output contract (findings shape, scoring shape)
- Module pattern (one file, one responsibility, no cross-module calls)
- Paraskakis Pitfall #2 mitigations (each specifically implemented)
- Voice and tone rules (enforced by catalog pattern + Kiro hooks)
- Layer 2 graceful degradation (Layer 1 always ships)
- Caching strategy (15-minute TTL, hash-based cache keys)
- Bedrock cost estimates (per current Haiku 4.5 pricing)

### Medium confidence (open questions flagged)

- API category weights (from SCORING.md, starting values, may adjust post-benchmark)
- Combined frontend/API scoring weight (50/50 starting, test against benchmark)
- Task library scope (three tasks, may expand based on usage)
- Rating band thresholds (80/50, starting values)
- "Self-explaining name" heuristic (allowlist will grow)
- Summary/description contradiction detection (heuristic, false positives possible)
- Backend-only API scan gating (flag approach, hardening in BUILD-PLAN)

### Low confidence (needs spike before build)

- Input summarization token targets. Real-world spec and page sizes vary; summarization needs tuning against actual benchmark inputs before Phase 1 ships. Spike: run summarization against 10 diverse real specs and 10 real pages, measure output size distribution.
- "Outcome-focused operations" detection in Module 3. Subjective. Implemented as informational in v1 to avoid false deductions.
- Simulation-to-finding linking accuracy. Keyword matching in LLM narrative is fuzzy. May need refinement after first benchmark run.

### Locked decisions (re-stated for clarity)

- 6 API check modules with weights from SCORING.md v1.1.1
- Layer 2 simulation at MVP with 3 frontend-only tasks
- Claude Haiku 4.5 for simulation (model ID: `us.anthropic.claude-haiku-4-5-20251001-v1:0`)
- Synchronous simulation at MVP, async upgrade path documented
- 15-minute cache TTL (env-configurable)
- Backend-only API scan for public UI at launch (UI exposes frontend only)
- Paraskakis Pitfall #2 mitigations non-negotiable
- Findings catalog pattern for voice/tone enforcement
- Zero-instance rule: full credit with visible note in UI

### Integrity check

All Paraskakis Pitfall #2 mitigations are implemented in check module logic, planned for Layer 2 validation, or enforced by published methodology. No module violates any mitigation. Every user-facing string passes through the voice/tone catalog. Every deterministic check has a corresponding "how you'll know it works" observable behavior. Every scoring decision traces back to SCORING.md v1.0.0 weights.

---

*AI assisted. Human approved. Powered by NLP.*
