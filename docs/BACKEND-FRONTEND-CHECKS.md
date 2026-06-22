# Backend: Frontend Check Modules, Scoring, and Scan Orchestrator

> The six frontend check modules + scoring + the Lambda that ties them together.
> Ports Hermes Clew v1 patterns to JavaScript. Honors the observational tone.

**Status:** v2, May 27, 2026. v1 defined the six check modules, scoring, and the orchestrator. v2 updates the orchestrator response shape (score nested under a render-mode context for the v3 JS-rendering guardrail), splits cache from result-store (ScanCache 15m / ScanResults 24h), adds the hero-line generation step, and makes the result write fail-soft and post-response. Check module specs are unchanged.

**Naming:** Engineering artifacts (code, tests, CloudWatch metric namespaces) use "Perseus Clew" as the engine name. The public product is **Agentis Lux** (agentislux.io). User-facing strings â€” findings text, error messages, the report UI â€” reference Agentis Lux. See the Voice and Tone section below for how this plays out in findings.

**Scope:** Six frontend check modules, one scoring module, one scan orchestrator Lambda. What each one inputs, outputs, and must never do. What findings look like. How failure modes produce user-facing messages.

**Not in this doc:** Those live in sibling specs (BACKEND-SHARED, BACKEND-API-CHECKS, FRONTEND-SPEC, BUILD-PLAN, PRODUCT-REVIEW, BUILD-PRINCIPLES; external design documents).

---

## How to Review This Doc

Same review pattern as BACKEND-SHARED.

1. **Read each check module's "What It Does" and "Example findings" sections.** If the findings read like things you'd want Perseus to say, the module is specified correctly.
2. **Check "How You'll Know It Works" per module.** Those are behaviors you can verify by running the tool.
3. **Read the "Finding Shape and Voice" section carefully.** That's the drift guard for the most-visible product surface.
4. **Skip implementation details.** Internal function names, helper regexes, whether a check uses one loop or two â€” not your concern.

If the example findings match what you want users to see, and the observable behaviors match what you want users to experience, the spec is good.

---

## Module Inventory

| Module | Responsibility | Depends on |
|--------|----------------|------------|
| `semantic-html.js` | Can agents identify interactive elements by tag? | BACKEND-SHARED |
| `form-accessibility.js` | Can agents fill forms predictably? | BACKEND-SHARED |
| `aria.js` | Can agents interpret dynamic widgets? | BACKEND-SHARED |
| `structured-data.js` | Can agents know what the page is about? | BACKEND-SHARED |
| `content-html.js` | Can agents read content without JS? | BACKEND-SHARED |
| `link-navigation.js` | Can agents traverse the site? | BACKEND-SHARED |
| `scoring.js` | Total score, rating band, breakdown | All six check modules |
| `scan-orchestrator` (Lambda) | End-to-end scan pipeline | All of the above |

**Build order:** shared infrastructure first (BACKEND-SHARED), then check modules (any order, one at a time with tests), then scoring, then orchestrator.

---

## The Check Module Contract

Every check module exports one function. Same signature across all six.

**Export:** `checkXYZ(parsedHtml)` function.

**Input:** The object returned by `parse-html.js`:
```js
{
  $: cheerioInstance,
  metadata: { title, metaDescription, lang, charset, hasDoctype, rawLength }
}
```

**Output:**
```js
{
  passed: 4,              // number of individual checks that passed
  total: 6,               // total checks attempted (can be 0 if nothing to check)
  findings: [             // zero or more findings
    {
      id: 'SEM-001',      // stable identifier for this finding type
      text: '...',        // user-facing text (voice rules below)
      count: 3,           // how many instances found (null for binary checks)
      examples: [...]     // up to 3 short examples, sanitized (optional)
    }
  ]
}
```

**On failure:** Throws `CHECK_MODULE_ERROR` AppError if the module itself breaks (not if the page is bad â€” a bad page produces findings, not errors).

**Must not:**
- Write to logs at WARN or ERROR level during normal scans
- Reach outside the parsed HTML (no fetches, no file reads, no env vars)
- Modify the cheerio instance (treat it as read-only)
- Return findings with HTML tags in the text (sanitize.js is applied by the orchestrator, not here)

**Must:**
- Return `{ passed: 0, total: 0, findings: [] }` when there's nothing applicable to check
- Produce deterministic output for the same input
- Produce findings that read like observations, never like judgments

---

## Finding Shape and Voice

Every finding is a short observation from the agent's perspective. This is the most user-visible part of Perseus. Voice discipline here matters more than anywhere else.

### Finding structure

Every finding is:
```js
{
  id: 'SEM-001',
  text: 'Three buttons are implemented as styled div elements. Agents that identify buttons by the button tag cannot find these.',
  count: 3,
  examples: ['<div class="btn" onclick="...">Submit</div>']  // optional
}
```

**id** â€” category prefix + 3-digit number. `SEM-001` through `SEM-0XX` for Semantic HTML, `FORM-0XX` for forms, `ARIA-0XX`, `SDATA-0XX`, `CONT-0XX`, `LINK-0XX`. Stable over time. Used in the UI to deep-link into documentation.

**text** â€” what an agent experiences. Plain language. Usually one or two sentences. Follows the voice rules below.

**count** â€” how many instances of this issue were found. Integer for "found N of this thing" findings. Null for binary findings ("the page has no `<main>` element").

**examples** â€” up to 3 short, sanitized snippets. Optional. The UI may show or hide these. If a snippet is longer than 80 characters, it's truncated with an ellipsis.

### Voice rules for finding text

**Always:**
- Describe what an agent experiences, not what the developer did wrong
- Use present tense ("cannot find" not "could not find")
- Lead with the observation, then the consequence
- Group by type â€” one finding per issue type, with a count â€” never one finding per instance

**Never:**
- Judgment words: "bad," "poor," "wrong," "failing," "broken," "weak," "insufficient"
- Fix suggestions: "should," "need to," "try," "fix by"
- Severity words: "critical," "serious," "minor"
- Developer-blame: "you forgot," "you missed"
- Jargon without context: "WCAG violation," "a11y failure"

### Good findings

- "Three buttons are implemented as styled `div` elements. Agents that identify buttons by the button tag cannot find these."
- "Fifty-three images have no alt text. Agents relying on alternative text to understand images cannot interpret what these images depict."
- "The page has no `<main>` landmark. Agents scanning for the main content region cannot locate the primary area."
- "Two input fields rely on placeholder text alone for labeling. An agent filling this form cannot reliably determine what these fields expect."
- "No JSON-LD or microdata structured data is present. Agents parsing this page cannot determine its type or primary purpose without interpreting the visual layout."

### Bad findings (rewrite before shipping)

- "This page fails semantic HTML best practices." (judgment, no observation)
- "You should use `<button>` instead of `<div onclick>`." (fix suggestion)
- "Critical: missing alt text on 53 images." (severity word)
- "This page has broken heading hierarchy." (judgment word)
- "Fix your navigation so agents can use it." (judgment + prescription)

The orchestrator runs sanitize.js on every finding's text and examples before returning. Check modules don't need to worry about HTML injection â€” but they do need to worry about voice, because sanitize.js can't un-editorialize.

---

## 1. semantic-html.js (Weight: 25)

### What It Does

Examines whether interactive elements use semantic HTML tags (`<button>`, `<a>`, `<input>`, `<form>`, `<nav>`, `<main>`) rather than styled `<div>` or `<span>` elements with click handlers. Agents identify elements by tag name; a `<div>` with an `onclick` handler is invisible to most agents as a button.

### What an agent cannot do on a page that fails here

Cannot identify interactive elements. Cannot determine whether clicking something initiates navigation, submits a form, or opens a dialog. Cannot map the page to a predictable action vocabulary.

### What it looks for

1. **Clickable `<div>` or `<span>` elements.** Any `<div>` or `<span>` with `onClick`, `onclick`, `onPress`, `onKeyDown`, `onKeyUp`, or `role="button"` that should probably be a `<button>`. Counts instances.
2. **Presence of `<nav>`.** Is there at least one `<nav>` element? Binary.
3. **Presence of `<main>`.** Is there exactly one `<main>` element? Binary.
4. **Heading hierarchy.** Are `<h1>` through `<h6>` used? Is there exactly one `<h1>`? Are levels skipped (e.g., `<h1>` directly to `<h3>`)? Counts skip instances.
5. **List structure.** When content appears to be a list (multiple repeated items), is it wrapped in `<ul>` or `<ol>` with `<li>` children? Counts loose "list-like" content.
6. **Form wrapper.** If `<input>` or `<select>` elements exist, are they inside a `<form>` element? Counts form controls outside forms.

Each of the six checks contributes to `passed/total`. *These patterns match Hermes v1 `scan/check_semantic_html.py` â€” verified.*

### Scoring

- Category weight: 25 points of the 100-point total
- `earned = (passed / total) * 25`
- If `total === 0` (vanishingly unlikely for HTML pages), return `passed: 0, total: 0`; scoring module handles the empty-category case

### How You'll Know It Works

- When Perseus scans a page built entirely with `<div>` click handlers, the Semantic HTML score is near zero and findings describe the missing semantic tags
- When Perseus scans a well-structured page with real `<button>`, `<nav>`, `<main>`, proper headings, and `<form>` wrappers, the Semantic HTML score is near 25
- Findings describe what's missing in plain language, never tell the developer to "fix" anything
- Running the same page twice produces identical findings in identical order

### Example findings

- `{ id: 'SEM-001', text: 'Three elements with click handlers use styled div tags instead of the button tag. Agents identifying buttons by tag name cannot find these.', count: 3 }`
- `{ id: 'SEM-002', text: 'The page has no `<main>` landmark. Agents scanning for the main content region cannot locate the primary area.', count: null }`
- `{ id: 'SEM-003', text: 'The heading hierarchy skips from `<h1>` directly to `<h3>`. Agents reading heading structure to build an outline encounter a gap.', count: 1 }`
- `{ id: 'SEM-004', text: 'Two input elements appear outside any `<form>` wrapper. An agent identifying forms by the form tag misses these inputs.', count: 2 }`

---

## 2. form-accessibility.js (Weight: 20)

### What It Does

Examines whether form inputs are labeled, structured, and reachable in ways agents can understand. An agent filling a form needs to know what each field expects.

### What an agent cannot do on a page that fails here

Cannot determine what information each input expects. Cannot know which inputs are required. Cannot associate validation errors with specific fields. Cannot tell whether a "Submit" control actually submits, or which form it belongs to.

### What it looks for

1. **Every input has a label.** For each `<input>`, `<select>`, `<textarea>`: is there a `<label for="input-id">` with matching id, or is the input wrapped in a `<label>`, or does it have an `aria-label` / `aria-labelledby`? Counts unlabeled inputs.
2. **Placeholder is not the only label.** For each input, if the only "labeling" is a `placeholder` attribute with no real label, that's a finding. Counts these.
3. **Required inputs are marked.** For inputs that look required (asterisks in adjacent text, validation attributes), is `required` or `aria-required="true"` set? Counts inputs that appear required but aren't marked.
4. **Input types are specific.** Are email, tel, url, number inputs using `type="email"`, `type="tel"`, etc., or are they all `type="text"`? Counts type-generic inputs that have more specific equivalents.
5. **Submit controls exist.** For every `<form>`, is there a `<button type="submit">` or `<input type="submit">`? Counts forms without a clear submit.
6. **Fieldset grouping.** When related inputs appear (radio groups, checkbox groups), are they wrapped in `<fieldset>` with `<legend>`? Counts loose groups.

### Zero-instance case

If the page has no forms and no input controls at all, this category returns `{ passed: 0, total: 0, findings: [] }`. The scoring module treats zero-total categories specially (see scoring.js below).

### Scoring

- Category weight: 20 points
- `earned = (passed / total) * 20` when `total > 0`

### How You'll Know It Works

- When Perseus scans a login form with just `<input type="text" placeholder="email">` and `<input type="password" placeholder="password">`, findings describe the missing labels and placeholder-as-label pattern
- When Perseus scans a well-built form with labels, fieldsets, and submit buttons, the Form Accessibility score is near 20
- When Perseus scans a page with no forms at all, the report shows "Form Accessibility: 20/20 (no forms present)" (see scoring.js zero-instance rule)
- Findings identify specific field problems without telling the developer how to fix them

### Example findings

- `{ id: 'FORM-001', text: 'Four input fields rely on placeholder text alone for labeling. Agents filling this form cannot reliably determine what these fields expect.', count: 4 }`
- `{ id: 'FORM-002', text: 'The registration form has no submit button or input of type submit. Agents identifying the form completion control cannot locate it.', count: 1 }`
- `{ id: 'FORM-003', text: 'Two inputs that appear to accept email addresses use type="text" instead of type="email". Agents parsing input expectations by type cannot distinguish these from generic text fields.', count: 2 }`

---

## 3. aria.js (Weight: 15)

### What It Does

Examines whether dynamic widgets (custom dropdowns, tabs, dialogs, carousels) use ARIA roles and states that agents can interpret. ARIA is how HTML communicates dynamic component state to assistive technologies â€” and to agents.

### What an agent cannot do on a page that fails here

Cannot tell whether a control is expanded or collapsed. Cannot identify whether a dialog is open. Cannot determine which tab is selected. Cannot follow which list item is active in a listbox.

### What it looks for

1. **Custom widgets have roles.** Any element with an ARIA-ish name (class contains "dropdown", "tab", "dialog", "modal", "combobox", etc.) but no `role` attribute. Counts these.
2. **Interactive ARIA roles have keyboard semantics.** Elements with `role="button"` need `tabindex="0"` and keyboard handlers. Elements with `role="tab"` need `aria-selected`. Counts roles missing required companions.
3. **State attributes are present.** Expandable controls (accordion toggles, menu buttons) should have `aria-expanded`. Toggle controls should have `aria-pressed`. Dialogs should have `aria-modal`. Counts state-less interactive roles.
4. **Labels exist where required.** Icon-only buttons need `aria-label`. Form regions need `aria-labelledby` or `<legend>`. Counts label-less widgets.
5. **Live regions for dynamic content.** Toast notifications, error messages, and status updates benefit from `aria-live`. Counts likely-dynamic regions with no live attribute (heuristic).
6. **No conflicting or abandoned ARIA.** Elements with `role="presentation"` on semantic tags (defeats the purpose) or `aria-hidden="true"` on elements containing focusable children. Counts conflicts.

### Scoring

- Category weight: 15 points
- `earned = (passed / total) * 15` when `total > 0`

### How You'll Know It Works

- When Perseus scans a page with a custom JavaScript dropdown built from `<div>` elements and no ARIA, findings describe the missing role and state attributes
- When Perseus scans a page with native `<select>` elements (no custom widgets), ARIA findings are sparse because there's nothing custom to annotate
- Findings name the widget pattern observed (dropdown, tab, dialog) based on heuristics from class names, and describe what state information is missing

### Example findings

- `{ id: 'ARIA-001', text: 'Six elements appear to be expandable widgets (class names include "accordion" or "collapse") but have no aria-expanded attribute. Agents tracking open and closed state cannot determine which sections are open.', count: 6 }`
- `{ id: 'ARIA-002', text: 'Three icon buttons have no accessible name. Agents selecting controls by label cannot identify what these buttons do.', count: 3 }`
- `{ id: 'ARIA-003', text: 'One element has role="presentation" applied to a semantic button tag. The presentation role removes semantic meaning, so agents ignore this element.', count: 1 }`

---

## 4. structured-data.js (Weight: 15)

### What It Does

Examines whether the page declares what it is using structured data formats (JSON-LD, microdata, RDFa) that agents can parse. Structured data tells an agent "this is a product, priced $29, in stock" without requiring visual interpretation.

### What an agent cannot do on a page that fails here

Cannot determine page type (product? article? event? recipe?). Cannot extract key attributes (price, author, date, rating) without inferring from markup. Cannot link the page to known entity types.

### What it looks for

1. **JSON-LD presence.** At least one `<script type="application/ld+json">` block exists. Binary.
2. **Valid JSON-LD parsing.** Each JSON-LD block parses as valid JSON. Counts invalid blocks.
3. **Recognized schema.org types.** The structured data declares a known type (`@type` from schema.org). Counts blocks with unrecognized or missing types.
4. **Open Graph meta tags.** Presence of `og:title`, `og:description`, `og:type`, `og:image`. Counts missing required OG tags.
5. **Twitter Card meta.** Presence of `twitter:card` and related tags. Counts missing.
6. **Canonical URL.** `<link rel="canonical">` present. Binary.
7. **Page language declared.** `<html lang="...">` present with a valid value. Binary.

### Scoring

- Category weight: 15 points
- `earned = (passed / total) * 15`

### How You'll Know It Works

- When Perseus scans a product page with rich JSON-LD, complete OG tags, canonical URL, and lang attribute, the Structured Data score approaches 15
- When Perseus scans a page with no metadata at all, findings describe each missing signal
- Findings name the specific kind of declaration that's missing, in language users of web development recognize

### Example findings

- `{ id: 'SDATA-001', text: 'No JSON-LD structured data is present on this page. Agents parsing structured declarations to identify the page type cannot determine what this page represents.', count: null }`
- `{ id: 'SDATA-002', text: 'Open Graph tags for title, description, and image are absent. Agents generating link previews or summaries of this page must infer these from the full HTML.', count: 3 }`
- `{ id: 'SDATA-003', text: 'The `<html>` element has no lang attribute. Agents determining language for translation or speech synthesis have no declared value to use.', count: null }`

---

## 5. content-html.js (Weight: 15)

### What It Does

Examines whether the page's actual content is present in the initial HTML response, or whether it's waiting for JavaScript to render. Many agents (including Perseus itself) don't execute JavaScript. A page that's empty until JS runs is invisible to those agents.

### What an agent cannot do on a page that fails here

Cannot read the primary content. Cannot extract text for summarization. Cannot find the headline, article body, product description, or anything else that requires JS to materialize.

### What it looks for

1. **Body has text content.** Measure total text length within `<body>` (excluding `<script>` and `<style>`). Below a threshold (e.g., 200 characters), flag. Binary threshold check.
2. **Meaningful elements outside `<script>`.** Ratio of non-script elements to script elements. Heavily script-dominated pages flag. Heuristic.
3. **Title is not placeholder.** Title isn't "Loading..." or empty or default template text. Counts placeholder-like titles.
4. **No "enable JavaScript" messages.** Pages with visible `<noscript>` messages requiring JavaScript are flagged because they openly declare the problem. Binary.
5. **Heading content is readable.** Headings (`<h1>` - `<h6>`) contain actual text, not template placeholders. Counts empty headings.
6. **Anchor text is meaningful.** Links have text content (or `aria-label`). Counts anchors with no accessible text.

### Scoring

- Category weight: 15 points

### How You'll Know It Works

- When Perseus scans a single-page app with an empty `<body>` waiting for React to mount, findings describe the missing content and near-empty body
- When Perseus scans a server-rendered page with full content in the HTML, the Content in HTML score is high
- Findings do not judge the developer for using a framework â€” they describe what an agent without a browser engine sees

### Example findings

- `{ id: 'CONT-001', text: 'The body contains 47 characters of text outside of script tags. Agents that do not execute JavaScript see a page with no meaningful content.', count: null }`
- `{ id: 'CONT-002', text: 'The page displays a `<noscript>` message requiring JavaScript to continue. Agents without JS execution receive only this message.', count: null }`
- `{ id: 'CONT-003', text: 'Four anchor elements contain no text and no aria-label. Agents reading link destinations see only the URL, not the intent.', count: 4 }`

---

## 6. link-navigation.js (Weight: 10)

### What It Does

Examines whether links on the page are real, navigable, and descriptive. Agents traverse sites via links â€” the `<a href="...">` pattern is the primary navigation mechanism. Links that don't work as links (JS-only click handlers, empty hrefs, "click here" anchor text) break agent navigation.

### What an agent cannot do on a page that fails here

Cannot build a site map. Cannot follow navigation predictably. Cannot determine where a link will take them from the link text alone. Cannot understand site structure without visual cues.

### What it looks for

1. **Anchor elements have href.** Every `<a>` has a non-empty `href` attribute. Counts hrefless anchors.
2. **href is meaningful.** `href` is not `"#"`, `"javascript:void(0)"`, or empty. Counts placeholder hrefs.
3. **Link text is descriptive.** Link text is not "click here," "here," "link," or "read more" without surrounding context. Counts generic link text.
4. **External links are distinguishable.** Links leaving the current domain have `rel` or are otherwise identifiable. Counts unmarked externals (lower priority; flag but don't weight heavily).
5. **Skip-to-content link present.** At the top of `<body>`, is there a skip-navigation link? Binary.
6. **No duplicate link text with different destinations.** Two links both reading "Learn more" should not point to different places without context. Counts duplicate-text conflicts.

### Scoring

- Category weight: 10 points

### How You'll Know It Works

- When Perseus scans a page using `<div onclick>` for navigation, the Link & Navigation findings describe how an agent cannot traverse the site
- When Perseus scans a page with full semantic links and descriptive text, the Link & Navigation score is near 10
- Findings name specific patterns ("click here" anchor text, `javascript:void(0)` hrefs) that break agent navigation

### Example findings

- `{ id: 'LINK-001', text: 'Seven anchor elements use `href="#"` or `javascript:void(0)` as their destination. Agents following links for navigation arrive at no meaningful destination.', count: 7 }`
- `{ id: 'LINK-002', text: 'Twelve links use "click here" or "read more" as their text, with no nearby context. Agents parsing link intent from text alone cannot distinguish what these links lead to.', count: 12 }`
- `{ id: 'LINK-003', text: 'No skip-to-content link is present at the top of the page. Agents and keyboard users bypassing navigation to reach main content have no shortcut.', count: null }`

---

## 7. scoring.js

### What It Does

Takes the outputs of all six check modules and produces a final score, rating band, and per-category breakdown. Applies the category weights from SCORING.md. Knows nothing about HTML or specific checks â€” just arithmetic and labels.

### Inputs and Outputs

**Export:** `calculateScore(categoryResults)` function.

**Input:**
```js
{
  semantic_html: { passed, total, findings },
  form_accessibility: { passed, total, findings },
  aria: { passed, total, findings },
  structured_data: { passed, total, findings },
  content_in_html: { passed, total, findings },
  link_navigation: { passed, total, findings },
}
```

**Output:**
```js
{
  total: 72,                    // integer 0-100
  rating: 'Partially Ready',    // locked three-band label
  breakdown: {
    semantic_html: { earned: 18, max: 25, note: null },
    form_accessibility: { earned: 20, max: 20, note: 'no forms present' },
    aria: { earned: 9, max: 15, note: null },
    structured_data: { earned: 12, max: 15, note: null },
    content_in_html: { earned: 15, max: 15, note: null },
    link_navigation: { earned: 8, max: 10, note: null },
  }
}
```

### Scoring logic

Per category: `earned = (passed / total) * max_points` where max_points comes from the weights table.

**Zero-instance rule (Q4 recommendation):** When a category's `total === 0` (e.g., page has no forms), that category receives **full credit with a note**. The note text is predefined per category:
- `form_accessibility`: `'no forms present'`
- `aria`: `'no custom widgets present'`
- `structured_data`: (always has something to check â€” no zero case expected)
- `link_navigation`: `'no links present'` (unusual but possible)
- `semantic_html`: (always has something to check)
- `content_in_html`: (always has something to check)

The report UI must display the note when present, so users understand why a category is perfect.

### Rating bands

Thresholds applied to the total score:
- **Agent-Ready:** 80-100
- **Partially Ready:** 50-79
- **Not Yet Readable:** 0-49

*Specific thresholds are flagged as an open question in the checklist. These are starting values; adjust after the 50-site benchmark shows real score distribution.*

### How You'll Know It Works

- Running the scoring module on known test fixtures produces expected scores
- Two runs over the same category results produce identical scores (deterministic)
- A page with no forms scores 20/20 on Form Accessibility with a visible note
- The rating label matches the score according to the band thresholds above

### Example

Input:
```js
{
  semantic_html:    { passed: 4, total: 6, findings: [...] },  // â†’ 17/25
  form_accessibility:{ passed: 0, total: 0, findings: [] },     // â†’ 20/20 (note)
  aria:             { passed: 3, total: 6, findings: [...] },  // â†’ 8/15
  structured_data:  { passed: 5, total: 7, findings: [...] },  // â†’ 11/15
  content_in_html:  { passed: 6, total: 6, findings: [] },     // â†’ 15/15
  link_navigation:  { passed: 4, total: 6, findings: [...] },  // â†’ 7/10
}
```

Output:
```js
{
  total: 78,              // (17 + 20 + 8 + 11 + 15 + 7) â†’ rounded
  rating: 'Partially Ready',
  breakdown: { /* as shown in the Output structure above */ }
}
```

---

## 8. scan-orchestrator (Lambda)

### What It Does

The Lambda function that handles an incoming scan request. Validates input, enforces rate limits, checks the ScanCache (15m, URL-hash), fetches the target, parses it, runs checks, scores deterministically, generates the result-hero narrative line via Bedrock (fail-soft to a deterministic template), and returns the complete report. After the response is sent, writes to ScanResults (24h TTL) and ScanCache (15m TTL) async and fail-soft. Logs the scan event.

One Lambda handles all three input types (URL, GitHub repo, API spec upload). Branches at the top on the input type. *Q6 recommendation.*

### Input (event received by Lambda)

API Gateway HTTP API event. Body is:
```json
{
  "type": "url" | "repo" | "spec",
  "target": "https://example.com" | "owner/repo" | "<raw spec text>"
}
```

### Output (response body)

Full report shape, updated in v2 for the render-mode guardrail and the hero line:
```js
{
  meta: {
    requestId: 'abc-123',
    resultId: 'opaque-uuid',         // for shareable links; also the ScanResults PK
    scanType: 'url',
    methodologyVersion: '1.1.1',
    targetDomain: 'example.com',
    durationMs: 3421,
    timestamp: '2026-05-27T16:22:15Z',
    scannedAt: '2026-05-27T16:22:15Z',
    fromCache: false                 // true if served from ScanCache
  },
  preScanFindings: [
    { type: 'robots_txt', message: 'robots.txt disallows automated access. An agent visiting this site may also be blocked.' },
    { type: 'redirect_chain', message: 'This URL redirected through 2 hops before responding.' }
  ],
  scoredViews: {
    // v3-ready: a render-mode-labeled context, so a future "rendered" mode can join without breaking the contract.
    // MVP emits exactly one mode.
    rawHtml: {
      score: { total, rating, breakdown },
      heroLine: {
        text: 'An agent visiting this page can read your product descriptions, but cannot tell which button starts checkout.',
        source: 'ai' | 'template',   // 'ai' on Bedrock success, 'template' on fallback
        model: 'claude-haiku-4-5-20251001' // present when source is 'ai'
      },
      findings: {
        semantic_html: [/* findings */],
        form_accessibility: [/* findings */],
        aria: [/* findings */],
        structured_data: [/* findings */],
        content_in_html: [/* findings */],
        link_navigation: [/* findings */],
      }
    }
  },
  simulation: {
    // Layer 2: full agent-task narrative, distinct from the hero line.
    available: true,
    tasks: [
      {
        taskId: 'SIM-FE-CTA',
        outcome: 'success',
        narrative: '...',
        linkedFindings: ['SEM-001'],
        reasoning: '...'
      }
    ],
    source: 'ai',
    model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    durationMs: 1200
  },
  benchmark: {
    available: true,
    context: { /* per-category median comparisons */ }
  }
}
```

`simulation` and `benchmark` may have `{ available: false, reason: '...' }` in their unavailable states. `heroLine.source` falls back to `'template'` if Bedrock fails for the hero call; the hero is never absent, only sometimes generated by the deterministic template instead of the model.

**Render-mode guardrail:** MVP only emits `scoredViews.rawHtml`. The nesting exists so a future `scoredViews.rendered` (v3, headless-rendered DOM) can join alongside without a breaking change. The frontend reads whichever mode(s) are present. See the v3 JS-rendering stub in the architecture NEVER list.

### Pipeline (data flow)

1. **Validate input.** Check `type` is one of the three. Check `target` format matches the type. Invalid â†’ throw `VALIDATION_*`.
2. **Check rate limit.** `rate-limit.checkRateLimit(event)`. Over â†’ throw `RATE_LIMIT_EXCEEDED`.
3. **Hash the target.** Compute `urlHash = sha256(normalize(target))` once. Used for the cache key. The full URL is never stored.
4. **Check ScanCache.** `scan-store.readCache(urlHash)`. If a fresh entry exists (within the 15-min cache window), return that cached response with `meta.fromCache: true`. Done.
5. **Branch on type:**
   - `type: 'url'` → call `fetchUrl(target)`
   - `type: 'repo'` → 501 Not Implemented (gated on Team tier in UI)
   - `type: 'spec'` → 501 Not Implemented (gated on Team tier in UI)
6. **Parse.** Call `parseHtml(html)` for URL/repo paths. For spec input, skip to API check modules (covered in BACKEND-API-CHECKS).
7. **Run checks sequentially.** Call each of the six check modules, one after another. Collect results. *Matches Hermes v1 pattern.*
8. **Score (deterministic).** `calculateScore(categoryResults)`.
9. **Generate hero line.** Call `heroLine.generate(topFindings, score, ratingLabel)`, which makes a short Bedrock call with a deterministic template fallback on error. The hero line is ALWAYS present in the response; only the `source` field varies (`'ai'` or `'template'`). Hard length ceiling enforced in the prompt.
10. **Call Bedrock for Layer 2 (full simulation).** `invokeBedrock(systemPrompt, userPrompt)` with graceful degradation. If it fails after retries, `simulation = { available: false, reason }`. This is the longer, distinct narrative; it can be absent, while the hero line cannot.
11. **Add benchmark context.** Look up BenchmarkScans data if available. If no benchmark data matches, `benchmark = { available: false, reason }`.
12. **Sanitize all finding text.** Apply `sanitize()` to every `text` field in findings and every string in `examples`, plus the hero line text.
13. **Generate `resultId`** (opaque UUID). Build the full response body with `scoredViews.rawHtml` nesting per the render-mode guardrail.
14. **Log scan event.** `logger.info('Scan completed', { requestId, resultId, domain, scanType, durationMs, score: total, heroSource })`.
15. **Return the response body to the user.**
16. **Async, post-response, fail-soft writes** (not awaited; the user already has their report):
    - `scan-store.writeResult(resultId, ...)` â†’ ScanResults, 24-hour TTL, backs shareable links
    - `scan-store.writeCache(urlHash, domain, response)` â†’ ScanCache, 15-minute TTL, dedup
    - Either write failing logs `WARN` and increments `Perseus/ScanStore/WriteFailures` but never affects the user
    - If the user is signed in, `user-store.appendScan(userId, resultId)` runs in parallel with a small honest signal on failure (handled by the frontend; anonymous scans get no such signal)

### Error handling

Every step is wrapped in try/catch at the orchestrator level. Any thrown AppError becomes a structured error response:
```json
{
  "error": {
    "code": "FETCH_TIMEOUT",
    "category": "FETCH",
    "message": "This site did not respond within 30 seconds."
  }
}
```

The Lambda returns HTTP 200 for successful scans, 4xx for client errors (validation, rate limit, not found), 5xx for internal errors (parse failures, Bedrock catastrophe, unknown). The Next.js frontend (via its `/api/scan` route) reads the `error` field and shows the user message.

Unexpected errors (not AppErrors) are caught at the top level, logged as `INTERNAL_UNKNOWN`, and returned as a generic "Something went wrong. Try again in a moment." message. No stack traces leak to the user.

### How You'll Know It Works

- When you scan a valid URL, you receive a complete report within 30 seconds with all six categories, findings, deterministic score, rating, a hero line (AI or template), and (if Bedrock is up) a full Layer 2 simulation narrative
- When a scan fails for any reason, you see a specific user message about what went wrong, never a blank screen, never "Error 500"
- When the same URL is scanned twice within 15 minutes, the second scan returns near-instantly from ScanCache with `meta.fromCache: true`
- When Bedrock is down for the hero line, scans still succeed with the hero filled by the deterministic template (the hero is never absent)
- When Bedrock is down for the full Layer 2 simulation, scans still succeed and the report notes "Agent simulation narrative unavailable"
- When DynamoDB is down for the post-response writes, scans still succeed; the user gets their report and the failure is logged (no user-facing impact except that the shareable link may resolve to an expired state if it was the ScanResults write that failed)
- CloudWatch logs show one structured entry per scan with requestId tying together all steps
- No full URLs, raw HTML, or PII appear in any log entry

---

## Testing Patterns

Every check module and the scoring module are unit tested. Tests use Vitest.

### Fixture strategy

Each check module has three classes of fixtures:
- **Good fixtures:** HTML snippets that pass all the module's checks
- **Mixed fixtures:** HTML snippets that pass some checks and fail others
- **Bad fixtures:** HTML snippets that fail all the module's checks

Fixtures are small, focused HTML files (not full pages). One fixture per pattern the module cares about.

### Test structure

```js
describe('semantic-html.js', () => {
  describe('when interactive divs with click handlers are present', () => {
    it('produces a SEM-001 finding with the correct count', () => { /* ... */ });
    it('does not count semantic buttons in the total', () => { /* ... */ });
  });
  describe('when the page has no main element', () => {
    it('produces a SEM-002 binary finding', () => { /* ... */ });
  });
  // ... one describe per check within the module
});
```

Each `it` test reads as a plain-English behavior. You should be able to read the test file and understand what the module does without looking at implementation.

### Determinism tests

For every check module and for the scoring module: run the module twice over the same fixture. Compare outputs. If they differ, the module is non-deterministic and fails the test. Determinism tests run against fixtures only, never against live URLs. *Q8 recommendation.*

### PASS/FAIL gate

Before Kiro moves to the next module, all tests on the current module must pass. No skipped tests. No TODO tests. *Build principles #20, #23.*

### How you review tests

Open the test file. Read the `describe` and `it` descriptions. Each one should make sense to you as a behavior you'd expect. If an `it` description surprises you, flag it â€” either the test is wrong or the spec is. Running `npm test` and seeing all green means the module matches the spec.

---

## What's NOT in This Doc

- **Shared infrastructure modules** â€” see BACKEND-SHARED
- **API check modules, API scan path** â€” see BACKEND-API-CHECKS
- **Layer 2 simulation prompt design** â€” see BACKEND-API-CHECKS or a dedicated SIMULATION spec
- **DynamoDB schemas (cache table, benchmark table)** â€” see ARCHITECTURE.md Section 6
- **React UI, report rendering** â€” see FRONTEND-SPEC
- **Security implementation details, CDK deploy** â€” see BUILD-PLAN (external design document)

---

## References

- **ARCHITECTURE.md** â€” system view, scan pipeline overview
- **BACKEND-SHARED.md** â€” shared infrastructure modules that every check depends on
- **SCORING.md** â€” public scoring methodology, category weights, band descriptions
- **PERSEUS-CLEW-PRODUCT-REVIEW.md** (external design document) â€” product tone, scan prerequisites
- **BUILD-PRINCIPLES.md** (external design document) â€” 38 principles referenced throughout
- **Hermes Clew v1 codebase** â€” `scan/scanner.py`, `scan/check_semantic_html.py`, `scan/scoring.py` (patterns ported from Python to JavaScript)

---

## Confidence Notes

### High confidence (grounded in existing docs or code)

- Check module contract (`{ passed, total, findings }`) â€” verified against Hermes v1 `scan/check_semantic_html.py` return shape
- Scoring math (per-category = passed/total * weight) â€” verified against Hermes v1 `scan/scoring.py`
- Category weights (25/20/15/15/15/10) â€” from SCORING.md
- Orchestrator pipeline order â€” composed from ARCHITECTURE.md data flow section
- Semantic HTML specific patterns (div/span click, nav, main, headings, lists, forms) â€” verified against Hermes v1 `check_semantic_html.py`
- Finding voice rules â€” derived from product review and build principle #35

### Medium confidence (reasonable synthesis, worth your review)

- Specific finding IDs and text â€” these are my proposed starting language. Kiro may tweak during implementation; you'll see the results in fixtures.
- Rating band thresholds (80/50/0) â€” these are starting values. SCORING.md v2 will lock specific cutoffs after benchmark testing.
- The exact count of "what it looks for" sub-checks per module (6 per module for a clean `passed/total`) â€” matches Hermes v1 pattern but specific items may shift based on cheerio affordances.

### Deliberate departure from Hermes v1

**Zero-instance scoring.** Hermes v1 `scoring.py` skips zero-total categories entirely (normalizes out of applicable weight). This spec uses full-credit-with-note instead. The departure is intentional: "awareness, not judgment" means a page with no forms shouldn't be penalized, but also shouldn't have its overall score inflated by normalization. Full credit with a visible note is the more honest signal. Flagged here so you know this is a conscious change.

### Locked decisions baked in (from the outline discussion)

- Finding text: static templates (deterministic)
- No severity field
- Group findings by type always (one finding per issue type, with count)
- Zero-instance categories: full credit with a visible note
- JSX/TSX: static analysis of source only, no runtime reasoning
- Orchestrator: one Lambda, branches on input type
- Response shape as specified in the orchestrator section
- Determinism tests run against fixtures, not live URLs

### Integrity check

- No tech choices invented outside the architecture doc or checklist decisions
- No scoring math invented outside Hermes v1 precedent (with the zero-instance rule change flagged above)
- Every finding voice rule traces to build principle #35 or the product review
- Every check pattern cites either Hermes v1 or build principle #18 (WCAG + agent readiness overlap)

---

*AI assisted. Human approved. Powered by NLP.*
