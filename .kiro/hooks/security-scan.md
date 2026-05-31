# Hook: Security Scan

**Purpose:** Catch security anti-patterns before they ship.

**Trigger:** On file save (any file under `/backend/src` or `/frontend/src`).

## Behavior

Grep the saved file for known-dangerous patterns. Block the commit if any are found. User can override with explicit justification.

## Patterns checked

### Critical (block on match, no override without explicit comment)

**1. innerHTML with dynamic content**

Pattern: `innerHTML\s*=\s*[^'"]*[${` (innerHTML assignment that includes template literal interpolation or variable concatenation)

Match example:
```javascript
element.innerHTML = `<div>${userContent}</div>`;  // BLOCKED
```

Non-match example (static, no dynamic content):
```javascript
element.innerHTML = '<div>static content</div>';  // allowed but flagged
```

Allowlist: none at MVP. If a specific component genuinely needs dynamic HTML rendering (e.g., rendering a trusted markdown-rendered result), it gets an explicit `// SECURITY-OVERRIDE: <reason>` comment on the line above.

**2. eval() calls**

Pattern: `\beval\s*\(`

Blocked without exception at MVP.

**3. Hardcoded secrets**

Patterns:
- `sk_live_[a-zA-Z0-9]{20,}` (Stripe live secret)
- `sk_test_[a-zA-Z0-9]{20,}` (Stripe test secret, still flagged)
- `pk_live_[a-zA-Z0-9]{20,}` (Stripe publishable live)
- `AKIA[0-9A-Z]{16}` (AWS access key ID)
- Lines matching `(?i)(password|secret|api_key|token)\s*=\s*['"][^'"]{16,}['"]` (assignment to obvious-sensitive name with long string literal)

Blocked. Secrets go in Secrets Manager or SSM.

**4. API key in fetch URL**

Pattern: `(fetch|axios)[^)]+(api_key|apikey|token)=`

Flagged because keys in URLs get logged by intermediary systems.

### Warnings (log but do not block)

**5. console.log with objects**

Pattern: `console\.log\s*\(\s*[^)]*\{` (console.log with an object literal or variable that might be an object)

Warn. Production code should use the structured logger, not console.log.

**6. process.env.X in template literals**

Pattern: `\$\{\s*process\.env\.`

Warn. Potential secret exposure if the env variable holds something sensitive.

## Override mechanism

If a developer has a legitimate reason to use a blocked pattern, they add an override comment on the line above:

```javascript
// SECURITY-OVERRIDE: Rendering trusted markdown output from our own compiler
element.innerHTML = compiledMarkdown;
```

The hook detects this comment and logs the override (with file, line, and reason) to a security audit log. The user (human builder) reviews the security audit log weekly.

## Action

**On critical match without override:**
```
SECURITY SCAN: innerHTML with dynamic content
File: frontend/src/components/scan/FindingItem.jsx, line 47
Pattern: element.innerHTML = `<span>${finding.title}</span>`

This is blocked. Use textContent or React's JSX rendering.

If you have a legitimate reason, add:
  // SECURITY-OVERRIDE: <reason>
on the line above.
```

**On warning match:**
```
SECURITY WARNING: console.log with object
File: backend/src/checks/frontend/semantic-html.js, line 82
Pattern: console.log(findings);

Consider using the structured logger instead:
  logger.debug({ findings }, 'Semantic HTML check complete');
```

## Why this exists

Security is a one-way door. Shipping a scan tool that tells others to care about their security while committing our own innerHTML or eval or hardcoded secrets would destroy trust. Automated enforcement makes these mistakes impossible to ship silently.

The patterns list will evolve. Any new security class discovered during build gets added to this hook. The hook file itself is under version control so changes are reviewable.

## Honors the project-wide pause

If a `// HOOKS-PAUSED: <reason>` comment is present in the file being edited or declared in the session context, this hook switches to warn-only mode for the duration of the session. See the steering file "Working with hooks" section for the discipline.
