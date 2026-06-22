# Backend Shared Infrastructure

> The seven foundational modules every Lambda depends on.
> Contracts, constraints, and observable behavior.

**Status:** v2, May 27, 2026. v1 defined the shared module set. v2 adds `scan-store.js` for the ScanResults (24h TTL) + ScanCache (15m TTL) writes/reads added in architecture v2, and clarifies that the existing `bedrock-client.js` is shared by both the Layer 2 simulation and the new hero-line generation. Written for Kiro to build from and for the builder (non-engineer) to validate behavior.

**Naming:** Engineering artifacts use "Perseus Clew" as the engine name. The public product is **Agentis Lux** (agentislux.io). User-facing strings (error messages users see, the User-Agent identifying the scanner publicly) use Agentis Lux. Code, tests, CloudWatch metric namespaces, and internal logs use Perseus Clew.

**Scope:** Ten shared modules (`errors`, `logger`, `fetch-url`, `fetch-repo`, `parse-html`, `parse-spec`, `sanitize`, `rate-limit`, `bedrock-client`, `scan-store`). These get built first in Phase 1 because everything else depends on them.

**Not in this doc:** Check modules, scoring, orchestrators, simulation prompts, DynamoDB schema. Those live in sibling specs (BACKEND-FRONTEND-CHECKS, BACKEND-API-CHECKS, FRONTEND-SPEC, BUILD-PLAN; external design document).

---

## How to Review This Doc

This doc is written so you can validate it without reading code.

1. **For each module, read "What It Does" and "How You'll Know It Works."** If those descriptions match what you expect users to experience, the module is specified correctly.
2. **Check the examples.** Each module has a concrete input and a concrete output. If the output looks wrong or surprising, flag it.
3. **Check the "Constraints" section.** These are the rules the module must follow. If something's missing that matters to you, add it.
4. **Ignore implementation details.** Anything about how a function is structured internally, what helper functions exist, how retries are timed â€” that's Kiro's call, not yours.

If a module's "How You'll Know It Works" section matches your expectations, the spec is good. If the test results later say "all tests pass," the build matches the spec.

---

## Module Inventory

| Module | What it does | Depends on |
|--------|--------------|------------|
| `errors.js` | Structured error class used by every module | (nothing) |
| `logger.js` | Structured JSON logging to CloudWatch | `errors.js` |
| `fetch-url.js` | Fetches a public URL with safety constraints | `errors.js`, `logger.js` |
| `fetch-repo.js` | Fetches files from a public GitHub repo | `errors.js`, `logger.js` |
| `parse-html.js` | Parses raw HTML into a queryable tree | `errors.js` |
| `parse-spec.js` | Parses an OpenAPI or Swagger spec | `errors.js` |
| `sanitize.js` | Strips unsafe patterns from user-facing strings | `errors.js` |
| `rate-limit.js` | Rate-limit middleware for Lambda entry points | `errors.js`, `logger.js` |
| `bedrock-client.js` | Wraps the AWS Bedrock SDK. Used by Layer 2 simulation AND by the hero-line generator. | `errors.js`, `logger.js` |
| `scan-store.js` | DynamoDB CRUD for ScanResults (24h TTL) and ScanCache (15m TTL). Fail-soft writes. | `errors.js`, `logger.js` |

**Build order:** errors â†’ logger â†’ everything else in any order. The two leaf modules (errors, logger) are foundational. Everything above depends on them.

---

## Shared Conventions

Rules every module follows. Kiro must apply these consistently.

**One file, one responsibility.** Each module does one thing. If a module starts doing a second job, split it. *Build principle #7.*

**Throw structured errors, don't return error flags.** Modules signal failure by throwing an `AppError` (see `errors.js`). Callers wrap calls in try/catch. No `{ success: false, error: ... }` return shapes.

**Inputs validated at the boundary.** Every public function validates its inputs before doing work. Invalid inputs throw a `VALIDATION_*` error. *Build principles #14, #10.*

**No hardcoded secrets, keys, or config.** Everything configurable comes from `process.env`. Module reads env at import time, fails fast if required config is missing. *Build principle #13.*

**Logging goes through `logger.js`, not console.** No `console.log` anywhere in shared modules (or check modules, or orchestrators). The logger enforces the deny-list.

**Return the simplest possible data.** Modules return plain JavaScript objects. No classes (except AppError), no proxies, no magic. Kiro should be able to `JSON.stringify` any return value and get useful output.

---

## Voice and Tone (for User-Facing Strings)

Some modules produce strings that end up in user-facing output (error messages, log entries that get surfaced in the report). Those strings follow Perseus's tone:

**Good voice:**
- "This site did not respond within 30 seconds."
- "This repo is private or doesn't exist. Perseus can only scan public repositories."
- "This page exceeds 5MB. Perseus cannot scan pages this large."

**Bad voice (do not do this):**
- "ERROR: FETCH_TIMEOUT at line 42"
- "You need to make your site respond faster"
- "Bad URL"
- "Failed to parse HTML. This is a bad page."

Tone rules:
- Describe what happened from the user's point of view
- No judgment language ("bad," "wrong," "poor," "failing")
- No fix suggestions ("you should...", "try..."); Perseus surfaces, doesn't prescribe
- No stack traces or error codes in user-facing text (those go to logs only)
- Internal error codes exist and are logged; user-facing messages are plain language

*Build principles #35, #27, #32.*

---

## 1. errors.js

### What It Does

Defines a single error class, `AppError`, that every other module uses to signal failure. Every error has a code (for log grepping), a category (for grouping), a user-facing message (for the UI), and an optional internal detail (for logs only).

One place for all errors means consistent shape everywhere. When a scan fails, the Lambda catches an `AppError`, serializes it to JSON, and returns it. The frontend shows the user-facing message. The internal detail is logged but not returned.

### Inputs and Outputs

**Export:** `AppError` class.

**Constructor signature:** `new AppError(code, userMessage, internalDetail?)`

**Properties on an AppError instance:**
- `code` â€” string, e.g. `FETCH_TIMEOUT`
- `category` â€” string, derived from the code prefix (see below)
- `userMessage` â€” string, shown in the UI
- `internalDetail` â€” string or object, logged only, never returned in responses
- `timestamp` â€” ISO 8601 string, set automatically
- `toJSON()` â€” method that returns `{ code, category, message: userMessage }` (never includes internalDetail)

### Error Code Format

Hierarchical strings. Category prefix, then specific code.

**Categories and examples:**
- `VALIDATION_*` â€” input validation failures (`VALIDATION_INVALID_URL`, `VALIDATION_URL_TOO_LONG`)
- `FETCH_*` â€” URL or repo fetching failures (`FETCH_TIMEOUT`, `FETCH_TOO_LARGE`, `FETCH_NOT_HTML`, `FETCH_REDIRECT_LIMIT`, `FETCH_FORBIDDEN`, `FETCH_NOT_FOUND`, `FETCH_DNS_FAILURE`)
- `PARSE_*` â€” parsing failures (`PARSE_INVALID_HTML`, `PARSE_INVALID_SPEC`, `PARSE_UNSUPPORTED_SPEC_VERSION`)
- `CHECK_*` â€” check module failures (`CHECK_MODULE_ERROR`)
- `SCORE_*` â€” scoring failures (`SCORE_INVALID_INPUT`)
- `BEDROCK_*` â€” Bedrock/simulation failures (`BEDROCK_THROTTLED`, `BEDROCK_UNAVAILABLE`, `BEDROCK_TIMEOUT`, `BEDROCK_INVALID_RESPONSE`)
- `RATE_LIMIT_*` â€” rate limiting (`RATE_LIMIT_EXCEEDED`)
- `INTERNAL_*` â€” unexpected errors (`INTERNAL_UNKNOWN`)

Kiro adds new codes as needed within these categories. Adding a new category requires updating this doc.

### How You'll Know It Works

- When a module fails, the error thrown has a recognizable code like `FETCH_TIMEOUT`, not a generic "Error"
- When you look at logs in CloudWatch, every error log entry includes the code, category, and timestamp
- When a scan fails and the user sees a message, that message is plain language (no error codes, no technical jargon)
- When a scan fails, the response JSON includes the code but NOT the internal detail

### Example

```js
throw new AppError(
  'FETCH_TIMEOUT',
  'This site did not respond within 30 seconds.',
  { targetUrl: 'example.com', durationMs: 30123 }
);
```

The user sees: "This site did not respond within 30 seconds."

The log captures: `{ code: 'FETCH_TIMEOUT', category: 'FETCH', userMessage: 'This site did not respond within 30 seconds.', internalDetail: { targetUrl: 'example.com', durationMs: 30123 }, timestamp: '2026-06-19T12:00:00.000Z' }`

The API response body: `{ error: { code: 'FETCH_TIMEOUT', category: 'FETCH', message: 'This site did not respond within 30 seconds.' } }` (no internal detail)

---

## 2. logger.js

### What It Does

Writes structured JSON logs to stdout. In production, Lambda automatically forwards stdout to CloudWatch Logs. In local development, logs appear in the Docker container output. One logging interface regardless of environment.

The logger enforces the deny-list: certain data must never appear in logs regardless of what the calling code passes in. This is how Perseus honors its privacy commitments.

### Inputs and Outputs

**Exports:**
- `logger.debug(message, context?)`
- `logger.info(message, context?)`
- `logger.warn(message, context?)`
- `logger.error(message, context?)`

**Log entry shape (written as single-line JSON to stdout):**
```json
{
  "timestamp": "2026-06-19T12:00:00.000Z",
  "level": "info",
  "service": "perseus-scan",
  "requestId": "abc-123-def",
  "message": "Scan started",
  "domain": "example.com",
  "scanType": "url"
}
```

### Constraints

**Must never log:**
- Full URLs (path and query string). Domain only.
- Raw HTML or spec content.
- Request IP addresses.
- User agent headers from callers.
- Anything that looks like a secret (JWT, API key, token).
- Email addresses, phone numbers, or other PII from scanned content.

Kiro implements a simple scrubber on the `context` object before emitting. If a field name matches known-sensitive patterns (`*token*`, `*password*`, `*secret*`, `*auth*`, `ip`, `email`, `url`, `fullUrl`), it's stripped with the value replaced by `[redacted]`. Unknown-shape strings are passed through.

The logger also strips the full URL from any field named `url` or `targetUrl` and replaces it with the domain. This double-check exists because relying on callers to remember not to log URLs is fragile.

### Log Levels

- `DEBUG` â€” development only. Not written in production (env variable controls).
- `INFO` â€” normal operational events (scan started, scan completed, cache hit)
- `WARN` â€” recoverable issues (rate limit hit, fetch retried, Bedrock throttle)
- `ERROR` â€” failures (any AppError that reaches the Lambda boundary)

### How You'll Know It Works

- When a scan runs, CloudWatch Logs show entries with readable JSON structure (not formatted prose)
- When you search logs for a specific scan, the `requestId` field ties together all log entries for that scan
- When you inspect any log entry, you never see a full URL (only the domain), never see HTML, never see an IP address, never see what looks like a token or secret
- Log entries include the Lambda function name and a consistent set of fields across all scans

### Example

Caller code (Kiro writes something like this):

```js
logger.info('Scan started', {
  requestId: event.requestContext.requestId,
  targetUrl: 'https://example.com/secret-path?token=abc',  // full URL
  scanType: 'url',
});
```

What actually gets logged:

```json
{
  "timestamp": "2026-06-19T12:00:00.000Z",
  "level": "info",
  "service": "perseus-scan",
  "requestId": "abc-123-def",
  "message": "Scan started",
  "domain": "example.com",
  "scanType": "url"
}
```

The full URL and token are stripped. Only the domain survives.

---

## 3. fetch-url.js

### What It Does

Fetches a public URL and returns the HTML with metadata. Enforces the safety constraints from the product review (timeout, redirect limit, size limit, content-type check, robots.txt awareness). Throws a clear AppError if anything goes wrong.

This is the single entry point for fetching arbitrary URLs from Perseus. No other module uses `fetch` directly against user-provided URLs.

### Inputs and Outputs

**Export:** `fetchUrl(url)` async function.

**Input:** A string URL. Must be `https://`, absolute, max 2048 characters, not a private/local IP.

**Output (on success):** An object:
```js
{
  html: '<html>...</html>',       // raw HTML text
  metadata: {
    finalUrl: 'example.com',       // domain-only, after redirects
    statusCode: 200,
    contentType: 'text/html; charset=utf-8',
    contentLength: 45123,           // bytes
    redirectChain: [                // array of { domain, statusCode } â€” never full URLs
      { domain: 'example.com', statusCode: 301 },
      { domain: 'www.example.com', statusCode: 200 },
    ],
    robotsTxt: {
      checked: true,
      disallowed: false,            // true if robots.txt disallows Perseus
    },
    fetchDurationMs: 847,
  }
}
```

**Output (on failure):** Throws an AppError with a `FETCH_*` code.

### Constraints

- **Timeout:** 30 seconds total, including redirects
- **Redirects:** Maximum 3 followed. Exceeding throws `FETCH_REDIRECT_LIMIT`
- **Size limit:** 5MB max response body. Exceeding throws `FETCH_TOO_LARGE`
- **Content-type:** Must include `text/html`. Otherwise throws `FETCH_NOT_HTML` with the actual content-type in the user message
- **URL format:** Must be https://, max 2048 chars, no private IPs (10.x, 192.168.x, 127.x, localhost). Invalid formats throw `VALIDATION_INVALID_URL`
- **User-Agent:** Set from env variable `PERSEUS_USER_AGENT`. If not set, uses `Agentis Lux/0.1 (+https://agentislux.io/about-scanner)` as fallback. This identifies the scanner to sites being scanned so robots.txt matching works and site owners can see who's making requests.
- **robots.txt:** Checked before the main fetch. If robots.txt disallows `Perseus-Clew` user-agent (or `*`), the fetch still proceeds (we're analyzing structure, not indexing), but `metadata.robotsTxt.disallowed` is set to true so the orchestrator can surface it as a pre-scan finding
- **No cookies accepted.** No credentials stored or forwarded.

### How You'll Know It Works

- When you enter a valid URL in the UI, the scan either completes within 30 seconds or you see a specific error message about what went wrong
- When you try to scan a URL that doesn't exist, you see "This page was not found" (not a generic error)
- When you try to scan something that's not HTML (e.g., a PDF URL), you see "This URL returned application/pdf, not HTML. Perseus scans HTML pages."
- When you try to scan a site that returns content over 5MB, you see "This page exceeds 5MB. Perseus cannot scan pages this large."
- When you scan a site whose robots.txt disallows Perseus, the scan completes but the report includes a pre-scan finding noting this
- No URL scan takes longer than 30 seconds before failing with a timeout message

### Example

Input: `fetchUrl('https://example.com/')`

Output on success (abbreviated):
```js
{
  html: '<!DOCTYPE html><html>...</html>',
  metadata: {
    finalUrl: 'example.com',
    statusCode: 200,
    contentType: 'text/html',
    contentLength: 1256,
    redirectChain: [],
    robotsTxt: { checked: true, disallowed: false },
    fetchDurationMs: 312
  }
}
```

Output on timeout:
```js
// Throws:
new AppError(
  'FETCH_TIMEOUT',
  'This site did not respond within 30 seconds.',
  { targetDomain: 'example.com', durationMs: 30000 }
);
```

---

## 4. fetch-repo.js

### What It Does

Fetches a list of files from a public GitHub repository using the GitHub REST API. Returns the files' contents in an array, filtered to scannable types. Also searches for OpenAPI spec files.

This is how Perseus scans GitHub-hosted projects when a user provides a repo URL instead of a live site.

### Inputs and Outputs

**Export:** `fetchRepo(owner, repo)` async function.

**Input:** Two strings. `owner` (e.g. `anthropics`) and `repo` (e.g. `perseus-clew`). Each must match alphanumeric + hyphens + underscores + dots, max 100 chars each.

**Output (on success):**
```js
{
  files: [
    { path: 'index.html', content: '<html>...</html>', sizeBytes: 1234 },
    { path: 'src/App.jsx', content: 'export default function...', sizeBytes: 4567 },
    // ... up to 20 files
  ],
  apiSpec: {              // null if no spec found
    path: 'openapi.yaml',
    content: 'openapi: 3.0.0\n...',
    sizeBytes: 8901,
  },
  metadata: {
    totalFilesConsidered: 47,   // how many files matched patterns in the repo
    totalFilesReturned: 20,     // after cap
    skippedReasons: [{ path: 'huge.html', reason: 'exceeds_size_limit' }]
  }
}
```

**Output (on failure):** Throws an AppError.

### Constraints

- **Authentication:** Unauthenticated by default (60 requests/hour per IP). If `GITHUB_TOKEN` env variable is set, use it for authenticated requests (5000/hour). Batch scan Lambda is expected to set the token; free tier Lambda is expected not to.
- **File filter:** Only `.html`, `.jsx`, `.tsx` files. Matches Hermes v1.
- **File count cap:** 20 files max. If the repo has more, prioritize files in `src/`, `app/`, `pages/`, `components/` directories first, then the rest.
- **File size cap:** 500KB per file. Larger files are skipped (noted in `metadata.skippedReasons`).
- **Excluded directories:** `node_modules`, `dist`, `build`, `.next`, `coverage`, `.git` â€” never traversed. *Matches Hermes v1 `file_finder.py`.*
- **Spec search:** Looks for `openapi.json`, `openapi.yaml`, `swagger.json`, `swagger.yaml` in the repo root and in `docs/`, `api/`, `spec/` directories. First match wins.
- **Private repos:** Throws `FETCH_FORBIDDEN` with message "This repo is private or doesn't exist. Perseus can only scan public repositories."
- **Rate limit exhausted:** Throws `FETCH_FORBIDDEN` with message "GitHub API rate limit reached. Try again in [N] minutes." where N is derived from the `X-RateLimit-Reset` header.
- **No scannable files:** Throws `VALIDATION_EMPTY_REPO` with message "No HTML, JSX, or TSX files found in this repo."

### How You'll Know It Works

- When you scan a public repo, you get back a report within reasonable time (the scan Lambda's 30-second budget applies; typical repos complete much faster)
- When you try to scan a private repo, you see a clear message about it being private
- When a repo has no HTML/JSX/TSX files, you see "No HTML, JSX, or TSX files found in this repo"
- When a repo has 50 scannable files, only 20 are scanned and the report notes this; the 20 prioritize `src/`, `app/`, etc.
- When a repo has an `openapi.yaml` at the root, that spec is also available for API scanning (backend only at MVP)

### Example

Input: `fetchRepo('anthropics', 'perseus-clew')`

Output on a small repo:
```js
{
  files: [
    { path: 'web/src/App.jsx', content: 'export default function...', sizeBytes: 4567 },
    { path: 'web/index.html', content: '<!DOCTYPE html>...', sizeBytes: 1023 },
  ],
  apiSpec: null,
  metadata: {
    totalFilesConsidered: 2,
    totalFilesReturned: 2,
    skippedReasons: []
  }
}
```

---

## 5. parse-html.js

### What It Does

Takes raw HTML text and returns a queryable tree structure the check modules can inspect. Uses the cheerio library. Does not execute JavaScript â€” returns only what's in the HTML as received, which is what AI agents without browser engines see.

Think of it as: "turn this HTML string into something I can ask questions about."

### Inputs and Outputs

**Export:** `parseHtml(html)` function.

**Input:** A string of HTML. Up to 5MB (enforced by `fetch-url`, not re-checked here).

**Output:**
```js
{
  $: cheerioInstance,        // The loaded cheerio instance. Check modules query this directly.
  metadata: {
    title: 'Example Page',         // contents of <title>, or null
    metaDescription: '...',         // contents of <meta name="description">, or null
    lang: 'en',                     // value of <html lang=...>, or null
    charset: 'utf-8',               // declared charset, or null
    hasDoctype: true,               // whether <!DOCTYPE html> is present
    rawLength: 45123,               // length of the input string
  }
}
```

**On failure:** Throws `PARSE_INVALID_HTML` if cheerio cannot parse the input (extremely rare; cheerio is tolerant).

### Constraints

- Returns a cheerio instance. Check modules receive `$` and run their own queries (like `$('button')` or `$('input[type=text]')`).
- Does not pre-extract elements into custom structures. Check modules own their own queries.
- Does not execute JavaScript.
- Does not apply CSS.
- The `metadata` object is for fields useful across all checks (title, lang, etc.), not for check-specific data.

### How You'll Know It Works

- You don't see this module's output directly; it feeds into check modules
- If check modules return sensible results, parse-html is working
- Indirect signal: when a page has no `<title>` tag, the report's page metadata says "No title declared" (because `metadata.title` was null)

### Example

Input (a simplified page):
```html
<!DOCTYPE html>
<html lang="en">
<head><title>Home</title><meta name="description" content="Welcome"></head>
<body><h1>Hello</h1><button>Click me</button></body>
</html>
```

Output:
```js
{
  $: [cheerio instance],
  metadata: {
    title: 'Home',
    metaDescription: 'Welcome',
    lang: 'en',
    charset: null,
    hasDoctype: true,
    rawLength: 178,
  }
}
```

A check module could then do: `const buttonCount = result.$('button').length;` â†’ gets 1.

---

## 6. parse-spec.js

### What It Does

Takes an OpenAPI 3.x or Swagger 2.0 specification (as a JSON or YAML string) and returns a normalized structure that API check modules can inspect. Handles `$ref` resolution so schemas referenced multiple times are counted once, not duplicated.

Normalizes Swagger 2.0 to OpenAPI 3.x shape internally, so API check modules only deal with one structure regardless of spec version.

### Inputs and Outputs

**Export:** `parseSpec(specText, contentType?)` async function.

**Input:**
- `specText` â€” string (JSON or YAML)
- `contentType` â€” optional hint (`'application/json'`, `'application/yaml'`). If not provided, detected from content.

**Output:**
```js
{
  spec: { /* normalized OpenAPI 3.x structure with $refs resolved */ },
  metadata: {
    originalVersion: '2.0' | '3.0.x' | '3.1.x',
    title: 'Petstore API',             // from info.title
    version: '1.0.0',                   // from info.version
    endpointCount: 23,                  // distinct path+method combinations
    schemaCount: 15,                    // distinct named schemas
    hasServers: true,                   // whether servers are declared
    hasSecurity: true,                  // whether security schemes are declared
  }
}
```

**On failure:** Throws `PARSE_INVALID_SPEC` or `PARSE_UNSUPPORTED_SPEC_VERSION`.

### Constraints

- Supports OpenAPI 3.0.x, 3.1.x, and Swagger 2.0 input.
- Output is always OpenAPI 3.x shape (Swagger 2.0 is converted internally).
- `$ref` resolution is performed. Reused schemas appear once in the output, not multiple times. *This directly addresses Paraskakis Pitfall #2.*
- Invalid JSON/YAML throws `PARSE_INVALID_SPEC` with message "This file could not be parsed as JSON or YAML."
- Non-spec content (valid JSON but not an OpenAPI spec) throws `PARSE_INVALID_SPEC` with message "This file does not appear to be an OpenAPI or Swagger specification."
- Unsupported versions (OpenAPI 4.x if that ever ships, etc.) throw `PARSE_UNSUPPORTED_SPEC_VERSION`.

### How You'll Know It Works

- When API checks run (backend-only at MVP), findings are consistent whether the input was Swagger 2.0 or OpenAPI 3.x
- The same API scored from its OpenAPI 3 spec and from its equivalent Swagger 2 spec produces the same score (or very close to it)
- Reused schemas in a spec are counted once, not per-reference (no Pitfall #2 inflation)

### Example

Input (simplified Swagger 2.0):
```yaml
swagger: "2.0"
info:
  title: Petstore
  version: "1.0.0"
paths:
  /pets:
    get:
      summary: List pets
```

Output:
```js
{
  spec: { /* normalized OpenAPI 3.0 structure */ },
  metadata: {
    originalVersion: '2.0',
    title: 'Petstore',
    version: '1.0.0',
    endpointCount: 1,
    schemaCount: 0,
    hasServers: false,
    hasSecurity: false,
  }
}
```

---

## 7. sanitize.js

### What It Does

Takes a string that's about to be returned to the user (in a finding, in an error message, in a report) and removes or redacts anything unsafe. Prevents XSS, leaked secrets, and leaked PII from making it into user-facing output.

### Inputs and Outputs

**Export:** `sanitize(text, options?)` function.

**Input:**
- `text` â€” string to sanitize
- `options` â€” optional object. Default options sanitize aggressively.

**Output:** A string, safe to include in a report, log, or response body.

### Constraints (what gets sanitized)

**Always removed (aggressive, no toggle):**
- HTML tags. `<script>alert(1)</script>` becomes `[removed-html]`. This prevents findings text from rendering as markup. *Build principle #10 extended to user output.*
- Null bytes, control characters that aren't newline/tab.

**Redacted with visible placeholder:**
- Email addresses: `user@example.com` â†’ `[redacted-email]`
- What-looks-like API keys or tokens: long alphanumeric strings (20+ chars) with high entropy â†’ `[redacted-token]`
- Credit card-shaped numbers (Luhn-valid 13-19 digit sequences) â†’ `[redacted-card]`
- Phone number patterns â†’ `[redacted-phone]`
  - Note: bare 7-digit numbers (e.g. 555-1234) are deliberately not redacted. The NNN-NNNN pattern is structurally identical to numeric ranges and error codes (e.g. 100-2000, 401-4012). Over-redacting innocent numbers is worse than missing an ambiguous phone number. Only phone numbers with enough structure to be unambiguous (area code, country code, parentheses) are redacted.
- IP addresses â†’ `[redacted-ip]`

**The rule:** Never silently strip. Always replace with a visible placeholder. If something was sanitized, the reader can see it was, so they know something was there.

**Not sanitized:**
- Normal prose
- URL domains (domains are fine to show; full URLs are the issue, and those are handled by logger)

### How You'll Know It Works

- If a scanned page has an email address in its HTML, and a finding happens to describe that element, the report shows `[redacted-email]` instead of the address
- If a finding's description contains a stray `<script>` tag (from malformed HTML, maybe), it shows `[removed-html]` in place, not as executing markup
- If the report shows a finding that reads normally (no placeholders), it means no sensitive patterns were detected
- No XSS is possible via finding content rendered in the report UI

### Example

Input: `"The placeholder text says 'email us at hello@example.com or call 555-123-4567'"`

Output: `"The placeholder text says 'email us at [redacted-email] or call [redacted-phone]'"`

---

## 8. rate-limit.js

### What It Does

Prevents a single IP (or the system as a whole) from overwhelming the scan infrastructure with requests. Checks the caller's request rate before each scan Lambda invocation and rejects with a 429 if over the limit.

Defense in depth: API Gateway applies its own rate limit at the network edge; this module adds a second check inside Lambda to catch edge cases (shared IPs behind NAT, burst handling, etc.).

### Inputs and Outputs

**Export:** `checkRateLimit(event)` async function.

**Input:** The Lambda event object (contains source IP, etc.).

**Output (under limit):** Returns void (does nothing, allows the scan to proceed).

**Output (over limit):** Throws `RATE_LIMIT_EXCEEDED` AppError with user message "Too many scans recently. Try again in [N] seconds." The thrown error includes a `retryAfterSeconds` field that the Lambda handler uses to set the `Retry-After` header on the 429 response.

### Constraints

- **Per-IP limit:** 10 scans per minute per source IP.
- **Global limit:** 1000 scans per minute across all IPs (burst protection).
- **Storage:** In-memory per Lambda instance (not shared across instances). This is intentionally imperfect â€” API Gateway handles the authoritative limit. The in-memory check catches burst patterns within a single Lambda container.
- **Window:** Sliding, 60-second window.
- **Bypass:** An env variable `RATE_LIMIT_BYPASS=true` disables the check (for local development and tests). Never set in production.

### How You'll Know It Works

- When you scan a URL repeatedly within a short window, after roughly 10 scans you see "Too many scans recently. Try again in 34 seconds."
- When you wait, the limit resets and you can scan again
- When the service is healthy under normal load, rate limiting is invisible (no user ever hits it)
- When a pattern of abuse emerges (one IP hammering the endpoint), that IP is cut off within seconds

### Example

Normal request: `checkRateLimit(event)` returns nothing, scan proceeds.

Over limit: Throws
```js
new AppError(
  'RATE_LIMIT_EXCEEDED',
  'Too many scans recently. Try again in 34 seconds.',
  { sourceIp: '[redacted]', retryAfterSeconds: 34 }
);
```

The Lambda handler catches this, sets HTTP status 429, sets `Retry-After: 34` header, returns the user message in the body.

---

## 9. bedrock-client.js

### What It Does

Wraps the AWS Bedrock SDK for calling Claude Haiku 4.5. Takes a structured prompt, handles retries on transient failures, enforces timeouts, and returns the model's response. Used by both the hero-line generation and the simulation module (Layer 2).

Generic wrapper â€” the client doesn't know what prompt it's sending or what the response means. Prompt engineering lives in the simulation module.

### Inputs and Outputs

**Export:** `invokeBedrock(systemPrompt, userPrompt, options?)` async function.

**Input:**
- `systemPrompt` â€” string, the system-level instructions (e.g., "You are an AI agent simulating use of a website...")
- `userPrompt` â€” string, the user-level content (e.g., the HTML summary and findings)
- `options` â€” optional `{ maxTokens, temperature }`. Defaults: `maxTokens: 1000`, `temperature: 0.2`.

**Output (on success):**
```js
{
  text: 'The model response text',
  usage: {
    inputTokens: 1234,
    outputTokens: 456,
  },
  modelId: 'claude-haiku-4-5-20251001',
  durationMs: 2340,
}
```

**Output (on failure after retries):** Throws `BEDROCK_*` AppError. Scan orchestrator catches this and applies graceful degradation (see below).

### Constraints

- **Model ID:** From env variable `BEDROCK_MODEL_ID`. Defaults to `claude-haiku-4-5-20251001`. Changing models is a one-line env change.
- **Timeout:** 20 seconds per request. Must fit within the 30-second Lambda scan budget alongside Layer 1 work.
- **Retries:** Up to 3 retries on transient errors (429, 500, 503, network timeout). Exponential backoff (1s, 2s, 4s). No retries on 4xx client errors (bad request, invalid model, prompt too long).
- **Prompt length limit:** Haiku 4.5 supports 200K tokens context. Module rejects prompts over 150K tokens with `BEDROCK_PROMPT_TOO_LONG` to stay safely under the limit.
- **Prompt injection protection:** The module does NOT concatenate user-provided content directly into the system prompt. System prompts are fixed by the caller (the simulation module). User content is placed in the user prompt field, clearly delineated. Content from scanned HTML/specs is treated as untrusted data, not as instructions.
- **Response format:** The client returns the raw text. Parsing (e.g., expecting JSON structure) is the caller's responsibility.

### Graceful degradation

If Bedrock fails after all retries, the scan orchestrator catches the `BEDROCK_*` error and continues without Layer 2. The report returns with Layer 1 findings and a `simulation` field that reads:

```js
{
  available: false,
  reason: 'Bedrock service unavailable'
}
```

The user still gets their deterministic score and findings. Only the simulation narrative is missing. This is specified in BACKEND-FRONTEND-CHECKS (or wherever the orchestrator lives); bedrock-client just throws the error.

### How You'll Know It Works

- When Layer 2 runs successfully, the scan report includes a narrative section describing what an agent would experience on the page
- When Bedrock has a transient issue, you may notice scans take slightly longer (retries add 1-4 seconds), but they still succeed
- When Bedrock is fully down, scans still succeed but the report notes "Agent simulation narrative unavailable" instead of crashing
- You never see model error codes in user-facing output; only graceful messages

### Example

Input:
```js
invokeBedrock(
  'You are analyzing a webpage from an AI agent\'s perspective...',
  'Here is the HTML summary and findings: ...',
  { maxTokens: 800 }
);
```

Output (success):
```js
{
  text: 'An agent landing on this page would encounter the following obstacles...',
  usage: { inputTokens: 2341, outputTokens: 678 },
  modelId: 'claude-haiku-4-5-20251001',
  durationMs: 3120,
}
```

---

## 10. scan-store.js

### What it does

DynamoDB CRUD for the two per-scan tables added in architecture v2: `ScanResults` (24-hour TTL, opaque resultId key, backs shareable links) and `ScanCache` (15-minute TTL, URL-hash key, target-site fetch dedup). One module, two tables, separate concerns kept honest by separate function names.

The module is called by the scan orchestrator after scoring (write path) and at the start of each scan (cache read). All writes are fail-soft: a write failure is logged but never thrown to the caller, because the scan result is the product and persistence is a side effect.

### Interface

**Exports:**
- `readCache(urlHash)` async â†’ `result | null`. Reads ScanCache by URL hash; returns the cached result if found and within the cache window, otherwise null. Never throws.
- `writeCache(urlHash, domain, result)` async â†’ void. Writes a ScanCache row with a 15-minute TTL. Fail-soft: catches DynamoDB errors, logs to CloudWatch, returns void without throwing.
- `writeResult(resultId, domain, score, ratingLabel, heroLine, categoryBreakdown, findings)` async â†’ void. Writes a ScanResults row with a 24-hour TTL. Same fail-soft semantics.
- `readResult(resultId)` async â†’ `result | null`. Reads ScanResults by resultId for shareable links. Returns the row if found and not expired, otherwise null.

The two writes happen in parallel after the response is sent, not before. The orchestrator does not await them.

### Inputs

- `urlHash` (string): SHA-256 hex of the normalized URL. The full URL is never written.
- `domain` (string): the bare domain, for logging/debugging only.
- `resultId` (string): opaque random id (UUID v4 or equivalent), generated per scan, never derived from the URL.
- `result` / `findings` (objects): sanitized scan output (see `sanitize.js`). The store does no further sanitization; that's the caller's contract.

### Output

Read functions return either the deserialized row (without the TTL attribute) or null. Write functions return void.

### Errors

- The module **never throws on DynamoDB errors.** A failed read returns null. A failed write logs `WARN`-level structured log entries with the error code and returns void. CloudWatch metric `Perseus/ScanStore/WriteFailures` increments on each failure so alarms can detect a degraded store.
- The module **does throw on programmer errors** (missing required args, malformed input). Those are `VALIDATION_*` errors.

### What lives here

- DynamoDB GetItem / PutItem calls
- TTL computation (`createdAt + ttlSeconds`)
- Result-row â†’ JSON deserialization (strip TTL attribute)
- Fail-soft wrapping of every DynamoDB call

### What does NOT live here

- URL hashing (the orchestrator hashes the URL once and passes the hash)
- Sanitization (caller's responsibility)
- The scan logic itself
- Trend or history queries on the Users table (note: no `user-store.js` exists in the repository since authentication remains unbuilt/deferred; deliberately kept separate so anonymous-scan storage and account-linked storage don't blur)

### Why fail-soft, async, never blocking

The scan result is the product. Persistence enables shareable links and cache reuse, but the user's experience must not depend on the store being healthy. Design intent: kill DynamoDB, the user still gets their report; the shareable link they generate may resolve to an "expired" state, which the frontend handles cleanly.

Every shared module is unit tested. Tests use Vitest.

**Test structure for each module:**
- One test file per module (`errors.test.js`, `logger.test.js`, etc.)
- Tests are grouped by function using `describe` blocks
- Each test uses `it('reads like a plain-English sentence describing behavior')`
- Example: `it('throws FETCH_TIMEOUT when the target does not respond within 30 seconds')`

**What tests cover:**
- Happy path: valid input â†’ expected output
- Every error path: specific invalid input â†’ specific error code thrown
- Constraint enforcement: inputs that hit limits produce the right error
- Edge cases: empty strings, null, very large inputs

**What tests do NOT cover (not at the shared-module level):**
- Network calls against real external services (use mocks)
- Full end-to-end scan behavior (that's integration tests, separate file)

**PASS/FAIL gate:** Before Kiro moves to the next module, the current module's tests must all pass. No skipped tests. No "TODO: fix this test later" comments. *Build principles #20, #23.*

**How you review tests:** Open the test file. Read the `it(...)` descriptions. Each one should describe a behavior you expect. If descriptions match your expectations and all tests pass, the module works. If a test description surprises you ("wait, why is it doing that?"), flag it â€” either the test is wrong or the spec needs updating.

---

## What's NOT in This Doc

- **Check modules** â€” see BACKEND-FRONTEND-CHECKS and BACKEND-API-CHECKS
- **Scoring logic** â€” see BACKEND-FRONTEND-CHECKS
- **Lambda orchestrator** (the function that ties fetch + parse + checks + score together) â€” see BACKEND-FRONTEND-CHECKS
- **Layer 2 simulation prompts and logic** â€” see BACKEND-API-CHECKS or a dedicated SIMULATION-SPEC (TBD)
- **DynamoDB table schemas** â€” see ARCHITECTURE.md Section 6
- **CDK deployment config** â€” see BUILD-PLAN (external design document)
- **Frontend behavior** â€” see FRONTEND-SPEC

---

## References

- **ARCHITECTURE.md** â€” system view, tech stack, data flow
- **PERSEUS-CLEW-PRODUCT-REVIEW.md** (external design document) â€” scope, philosophy, scan constraints
- **SCORING.md** â€” public scoring methodology (what findings look like)
- **BUILD-PRINCIPLES.md** (external design document) â€” 38 principles referenced throughout this doc
- **Paraskakis checklist** (Â© 2026 Level 250 Inc.) â€” referenced for Pitfall #2 in parse-spec.js
- **Hermes Clew v1 codebase** â€” `scan/file_finder.py` confirmed file filter patterns used in fetch-repo.js

---

## Confidence Notes

### High confidence (grounded in existing docs or code)

- Module inventory and build order (derived from ARCHITECTURE.md Section 7)
- File filter patterns in fetch-repo (verified against Hermes v1 `scan/file_finder.py`: allowed extensions, excluded dirs, priority dirs)
- Fetch constraints in fetch-url (reproduced from product review "Scan Prerequisites" section)
- Model choice and pricing for bedrock-client (locked decision)
- Prompt injection protection approach (matches product review security section)
- Sanitize categories (composed from product review privacy commitments + XSS prevention from build principle #10)
- Graceful degradation behavior for Bedrock (locked decision)

### Medium confidence (reasonable synthesis, worth your review)

- Specific rate-limit numbers (10/min per IP, 1000/min global). These are my starting guesses based on expected scan volume for a launched tool with modest traffic. Easy to tune via env variable. If you expect the DEV post to drive a burst of traffic, we might want a higher per-IP burst allowance.
- Token limit for bedrock-client (150K of Haiku's 200K max). Conservative. Kiro may adjust based on actual Layer 2 prompt sizes during build.
- Specific sanitize patterns (email regex, token heuristics). These are starting implementations; Kiro will refine based on test fixtures.

### Locked decisions baked in

- Error code format: hierarchical strings (e.g., `FETCH_TIMEOUT`)
- User-Agent: `Agentis Lux/0.1 (+https://agentislux.io/about-scanner)` as fallback; Kiro sets via `PERSEUS_USER_AGENT` env if customization needed
- GitHub auth: unauthenticated by default, optional `GITHUB_TOKEN` for batch scan
- Sanitize: HTML always stripped (shown as `[removed-html]`); PII/secrets redacted with visible placeholders (`[redacted-email]`, etc.), never silent
- Bedrock: 3 retries with exponential backoff; graceful degradation on full failure (Layer 1 returns with note that simulation was unavailable)

### Kiro-pick decisions (specified with one sentence, no debate)

- Log format in local dev: stdout (Docker handles capture)
- parse-html internal approach: returns cheerio instance; check modules query directly
- Swagger 2.0 handling: normalize internally to OpenAPI 3.x shape
- Rate-limit storage: in-memory per Lambda instance (with API Gateway doing authoritative throttling)
- Prompt template location: owned by simulation module, not bedrock-client

### Integrity check

- No tech choices invented outside the architecture doc or checklist decisions
- No behaviors invented outside product review
- Every constraint in fetch-url traces to product review "Scan Prerequisites"
- Every Hermes-derived pattern cites the specific Hermes file

---

*AI assisted. Human approved. Powered by NLP.*
