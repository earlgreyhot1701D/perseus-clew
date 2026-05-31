# Hook: Voice Check

**Purpose:** Enforce the "awareness, not judgment" voice on all user-facing strings.

**Trigger:** On file save. Scoped to files that are likely to contain user-facing strings:

- `backend/src/checks/**/*findings-catalog*`
- `backend/src/shared/errors.js` and related catalogs
- `backend/src/simulation/task-library.js`
- `frontend/src/lib/error-messages.js`
- `frontend/src/components/**/*.jsx` (but only inside string literals and JSX text nodes)
- Any file with "finding", "error-message", "catalog", or "copy" in the name

## Behavior

Grep the saved file for banned words in string contexts (inside quotes or JSX text, not in code identifiers or comments).

## Banned words

### Judgment words (block on match)

- `bad`
- `poor`
- `weak`
- `failing`
- `failed` (exception: `failed` as a verb in error handling context, e.g., "fetch failed" is allowed in error codes but not in user-facing messages)
- `broken`
- `violates`
- `violation`
- `wrong`
- `incorrect`
- `mistake`
- `error` (in user-facing finding text; allowed in code-level error names and error code identifiers)

### Prescription words (block on match)

- `you should`
- `you must`
- `we recommend`
- `fix this`
- `fix the`
- `add a`
- `add the` (in finding text; allowed in docs)
- `please add`
- `please include`
- `needs to`
- `should have`

### AI cliches (block on match)

- `delve`
- `landscape` (as in "agent landscape", "AI landscape")
- `straightforward`
- `genuinely`
- `honestly`
- `soapbox`
- `at the end of the day`
- `that said`
- `it is worth noting`
- `it should be noted`

### Typography (block on match)

- Em dashes (`—`)
- En dashes used as separators (`–`)

### Declaration words (flag, do not block; might be contextually appropriate)

- `actually`
- `really`
- `definitely`
- `clearly`
- `obviously`
- `simply`

## Detection context

The hook only fires on strings that appear in user-facing contexts:

**String literals in specific variable assignments:**
```javascript
const title = "...";           // checked if in a findings catalog
const detail = "...";          // checked if in a findings catalog
const message = "...";         // checked in error-messages.js
```

**JSX text nodes:**
```jsx
<p>This text is checked</p>
```

**NOT checked:**
- Code comments (developers can say "this handles the broken case")
- Variable names and function names
- Log statements (`logger.debug("fetch failed")` is fine, it is engineering context)
- Code-level error names (`new FetchError("URL_UNREACHABLE")` is fine)
- Spec documents in `/docs/` (those are internal reference)

## Override mechanism

The voice check has hard-gate categories (judgment, prescription, AI cliches, em dashes) and a soft-flag category (declaration words). Hard gates can be overridden when the match is a genuine edge case, not a real voice violation.

**Override syntax:** add a `// VOICE-OVERRIDE: <reason>` comment on the line immediately above the flagged code. The hook reads the override, logs it (so it shows up in PR review), and allows the save.

**Example:**
```javascript
// VOICE-OVERRIDE: this is an error code identifier, not user-facing copy
const ERROR_FORM_FAILED_VALIDATION = "form-failed-validation";
```

```javascript
// VOICE-OVERRIDE: literal site name in a quoted example
const exampleSite = "Bad Site Test Corp";
```

**What counts as a legitimate override:**
- The flagged word is a code identifier, error code, or test fixture name, not user-facing copy
- The flagged word is inside a quoted example from a third party (e.g., demonstrating a banned pattern in docs)
- A specific finding genuinely needs an exact technical term that happens to overlap with a banned word

**What does NOT count as legitimate:**
- "I'm in a hurry, let me get past this"
- The word feels right and you don't want to rewrite (rewrite. The voice rule exists for a reason)
- The string is user-facing and the override would let "bad" or "failing" reach a user

**Discipline check:** if you find yourself adding more than one or two overrides in a week, or overriding the same word repeatedly, **fix the hook, do not keep overriding.** A repeated override is a signal that the rule is wrong or the category list needs adjustment. Update the banned-word list, ship it, and stop fighting the tool.

## Project-wide pause (emergency valve, all hooks)

Any hook, including voice-check, can be temporarily paused for a session when arguing with the tool is wasting more time than the tool is saving. Add this comment to the file you're editing, or to a top-of-session note in your Kiro context:

```
// HOOKS-PAUSED: <reason>
```

All five hooks switch to warn-only mode for the rest of the session. The pause is logged. **This is the emergency valve, not the default.** If you find yourself pausing hooks routinely, that's the same signal as repeated overrides: the hooks need adjustment, not bypassing.

## Action

**On banned word match:**
```
VOICE CHECK: Banned word detected
File: backend/src/checks/frontend/semantic-html.findings-catalog.js, line 42
Pattern: Contains "fix this"
Context: detail: "The element is a styled div. Fix this by using a semantic button."

Voice rule: No prescription words. Findings describe what an agent cannot do, not what the developer should do.

Rewrite suggestion:
  detail: "An agent cannot confirm this element is interactive because it is a styled div, not a semantic button."

Blocked. Rephrase or remove.
```

**On em dash:**
```
VOICE CHECK: Em dash detected
File: frontend/src/lib/error-messages.js, line 87

Em dashes are forbidden. Use periods, commas, or colons.

Line: title: "Scan could not complete — the site returned 403."
Suggestion: title: "Scan could not complete. The site returned 403."

Blocked.
```

## Rewrite guidance (reference for the user)

When a finding is flagged, rewrite following these patterns:

| Don't write | Write |
|-------------|-------|
| "Missing alt text on image" | "An agent cannot interpret the image content. No alt text is present." |
| "You should add a label" | "The input has no associated label. An agent cannot determine what value is expected." |
| "Poor error response" | "The 400 response does not identify which field failed. An agent cannot recover in one retry." |
| "This is a bad pattern" | "An agent encountering this pattern cannot distinguish it from static content." |
| "Fix the semantic structure" | "The structure uses generic div elements. An agent cannot infer the element's purpose from markup alone." |

## Override

There is no override for this hook. The voice discipline is the product's core value. If a specific string genuinely needs wording that looks like a banned phrase, the solution is to rephrase the whole finding, not to bypass the check.

## Why this exists

This is the most important hook. If Agentis Lux ever ships a finding that tells a developer their site is "bad" or that they "should fix" something, the product's core positioning breaks. Every finding is a chance to either reinforce "awareness, not judgment" or undermine it. Automated enforcement removes the possibility of a tired builder typing the wrong phrase at 11pm.

The banned word list is living. Additions come from post-merge voice reviews. The hook file is under version control so changes are reviewable.
