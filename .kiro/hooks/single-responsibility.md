# Hook: Single Responsibility

**Purpose:** Catch god files before they solidify.

**Trigger:** On file save.

## Behavior

Heuristic analysis of the saved file to detect multiple unrelated responsibilities. Warns (does not block) when concerns appear mixed.

## Detection

### Heuristic 1: Top-level export count

Count the number of top-level `export` statements in the file (including `module.exports`, `export default`, and named exports).

**Thresholds:**
- 1-3 exports: OK
- 4-5 exports: warn if exports appear semantically unrelated (see heuristic 2)
- 6+ exports: always warn

Exception: catalog files (`*-catalog.js`, `*-library.js`) are expected to have many exports as structured data. Recognized by filename pattern.

### Heuristic 2: Semantic relatedness of exports

For files with 4+ exports, check if the export names share a common prefix or conceptual domain.

**Related (no warning):**
```javascript
export function parseHtml(html) {...}
export function parseHtmlWithOptions(html, opts) {...}
export function parseHtmlFragment(html) {...}
export function sanitizeParsedHtml(parsed) {...}
```

**Unrelated (warn):**
```javascript
export function parseHtml(html) {...}
export function calculateScore(checks) {...}
export function renderFinding(finding) {...}
```

The check is lexical (prefix matching, word root matching) not semantic. False positives happen; the warning is the point, not the block.

### Heuristic 3: Import mix

Count imports by category:

- React imports (`react`, `react-router-dom`, etc.)
- Backend-only imports (`@aws-sdk/...`, `aws-lambda`)
- Node built-ins (`fs`, `path`, `crypto`)
- Utility libraries (`lodash`, `date-fns`)

If a file imports from 3+ categories, warn. Likely doing too much.

### Heuristic 4: File line count

- Under 200 lines: OK
- 200-400 lines: check the other heuristics more strictly
- 400-600 lines: always warn
- 600+ lines: warn strongly

Exception: catalog files, fixture files, generated files.

## Action

**On warning:**
```
SINGLE RESPONSIBILITY WARNING
File: backend/src/checks/frontend/combined-checks.js, 412 lines
Exports: 7 top-level (parseHtml, scoreSemantic, renderFinding, calculateTotal, buildReport, mergeResults, exportJson)

This file appears to have multiple unrelated responsibilities:
- HTML parsing
- Scoring
- Rendering
- Export logic

Consider splitting into:
- parse-html.js (HTML parsing only)
- scoring.js (score calculation only)
- rendering.js (finding rendering only)

Build principle 1: One file, one responsibility.

Proceed anyway? (Continues, but logged to the review queue.)
```

## Suppression

If a file legitimately has multiple exports that belong together (e.g., a state reducer + its action creators), add a suppression comment at the top of the file:

```javascript
// SINGLE-RESPONSIBILITY-OK: reducer + action creators for scan state
// Kept together because modifying one usually modifies the other.
```

The hook detects this comment and skips the warning for this file. Suppressions are logged for periodic review.

## What this hook does NOT do

- It does not block commits. The warnings are guidance.
- It does not catch poorly-named exports (can't detect if `doEverything` is a single responsibility or a god function).
- It does not check within-function complexity. Cyclomatic complexity tools handle that separately.

## Why this exists

The most common regret in a growing codebase is "this file grew too much and now nothing can change without breaking something else." Early warnings when a file starts doing multiple jobs make the fix cheap. Later warnings in a 1200-line file make the fix painful.

Build principle 1 (one file, one responsibility) is easy to follow when starting a file. It is hard to follow when a file has been growing for three weeks. This hook catches the drift.

## Honors the project-wide pause

If a `// HOOKS-PAUSED: <reason>` comment is present in the file being edited or declared in the session context, this hook switches to warn-only mode for the duration of the session. See the steering file "Working with hooks" section for the discipline.
