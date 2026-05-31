# Project: Agentis Lux (public) / Perseus Clew (engine)

Agentis Lux is an agent-readiness scanner. Perseus Clew is the engine.
Public domain: agentislux.io. Internal repo: perseus-clew.

All source-of-truth documents live in /docs. Before making any change,
read the relevant spec(s):

- Product questions: docs/PERSEUS-CLEW-PRODUCT-REVIEW.md
- Architecture: docs/ARCHITECTURE.md
- Backend shared: docs/BACKEND-SHARED.md
- Frontend checks: docs/BACKEND-FRONTEND-CHECKS.md
- API checks: docs/BACKEND-API-CHECKS.md
- Frontend (Next.js on Vercel): docs/FRONTEND-SPEC.md
- Methodology: docs/SCORING.md
- Build sequence: docs/BUILD-PLAN.md
- Principles: docs/BUILD-PRINCIPLES.md

Design references (visual spec, locked):
- mockups/agentislux-landing.html (marketing landing)
- mockups/agentislux-app.html (six app views)

## Non-negotiable rules

### Code

1. One file, one responsibility. No god files.
2. MUST / STUB / NEVER labels on features. NEVER is never.
3. Stub do not build. Out-of-phase features get a comment stub with implementation notes and a reference back to the spec, not partial implementation.
4. textContent, not innerHTML. No eval. API keys only via SSM or Secrets Manager, never in code.
5. try/catch on every fetch. Meaningful error states, never blank screens.
6. Input validation client-side AND server-side. Never trust the front end. Never trust users.
7. Mock data first. Never wire APIs to a broken layout.
8. Deterministic logic + AI reasoning. Structure is deterministic. Flavor is AI-generated. Never mix the two in a way that makes scoring non-reproducible.

### Path B topology and storage (v2 additions, non-negotiable)

8a. **Frontend is Next.js on Vercel with load-bearing API routes** (`/api/scan`, `/api/benchmark`). Scan engine, Bedrock, DynamoDB, EventBridge stay on AWS. No CloudFront for the frontend.
8b. **Two per-scan DynamoDB tables, not one:** `ScanCache` (15-min TTL, URL-hash key, target-site fetch dedup) and `ScanResults` (24-hour TTL, opaque resultId key, shareable links). A scan writes to both. Never merge them.
8c. **Writes to ScanCache and ScanResults are async and fail-soft.** Scan result returns to the user before the write. Write failures are logged, never surfaced.
8d. **Result hero leads the results view.** 0-100 score + rating label (Agent-Ready / Partially Ready / Not Yet Readable, cutoffs in SCORING.md) + one AI-written narrative line, as one unit. The hero is the demo-critical component.
8e. **The hero narrative line is AI written (Bedrock, Haiku 4.5) with a deterministic template fallback.** The hero is never absent; only the `source` field varies (`'ai'` or `'template'`). The score itself is always deterministic; AI never produces the number.
8f. **Findings carry two-layer text.** Plain-language agent sentence as the primary (always visible). Technical category + score + selector as a helper layer (STUB-eligible at MVP). Vibecoder reads the primary; dev expands or glances for the helper.
8g. **Render-mode guardrail.** The scan response nests scores under `scoredViews.rawHtml`. A future `rendered` mode can join without breaking the contract. Do not collapse the nesting "because there is only one mode today."
8h. **Auth + history is a stub at MVP.** Auth wired, Users partition populated on sign-up, empty-state history view. NOT trend charts, NOT score-over-time, NOT delta tracking; those are paid tier. Pulling them into the stub is scope creep.

### Voice and tone

9. No em dashes anywhere.
10. No AI cliches. Forbidden words: delve, landscape, straightforward, genuinely, honestly, soapbox phrasing, at the end of the day.
11. No "bad / worse / failing / poor / weak / broken / violates / wrong" language. Observational only. Awareness, not judgment.
12. Findings describe what an agent cannot do, not what the developer did wrong. "An agent cannot identify the button" not "Your button is missing."
13. Fix suggestions are never included in findings. We surface what agents experience. The developer decides what to do with that information.
14. Specific, not generic. Every finding names the specific endpoint, schema, element, or property. No "some operations are missing descriptions" findings.

### Naming

15. User-facing strings reference Agentis Lux. Error messages, findings text, report UI, marketing copy.
16. Engineering artifacts use Perseus Clew. Code comments, tests, CloudWatch metric namespaces, commit messages, internal logs.
17. Attribution line in public copy: "Agentis Lux is powered by the Perseus Clew engine, part of the Clew suite of developer tools."

### Security

18. textContent over innerHTML always. No exceptions.
19. try/catch on every fetch with structured error mapping to known error codes.
20. Rate limit every public-facing endpoint. Default 100 requests/hour per IP.
21. Log structurally as JSON. Never log raw HTML, raw spec content, PII, IP addresses, or full URLs (domain only).
22. Prompt injection sanitization before every Bedrock call. Strip "ignore previous instructions" patterns, base64 instruction blobs, etc.
23. API Gateway routes locked to Lambda integrations. No direct Lambda invocation URLs.
24. CORS origin locked to agentislux.io. Wildcards forbidden.

### Methodology integrity

25. Every scoring decision traces to SCORING.md. No invented weights. No shifted thresholds.
26. Changing scoring requires a new methodology version (semver) and a changelog entry in SCORING.md.
27. Paraskakis Pitfall #2 mitigations are non-negotiable. Every API check that touches shared schemas, property-level examples, or standard conventions must implement the corresponding mitigation documented in BACKEND-API-CHECKS.md.
28. Zero-instance rule: if a category has nothing to scan, return full credit with a visible note. Never penalize for what is not there.

## Staged prompts (how I work with you)

When I ask you to implement something, propose your approach first. Do not implement until I approve. When I approve, implement only what was approved.

Do NOT refactor other code unless the change is trivially required (missing import, typo in an adjacent file that blocks compilation). Ask first for anything beyond that.

When proposing, include:
- What files you will create or modify
- What tests you will add
- Any assumptions you are making
- Any spec section you are uncertain about

When implementing, stay strictly within the approved scope. If you discover something that needs changing outside the scope, stop and propose the additional change as a follow-up.

## Block discipline

At the start of every session, I will tell you which build block we are working on (e.g., "Block 1C: Backend frontend check modules"). All work in that session stays in scope for that block. The scope-guard hook will warn if you try to edit files outside the block.

Before declaring a task complete, produce the QA checkpoint checklist defined in the qa-checkpoint hook.

## Verification

Before claiming a task is done, verify against the actual file, not memory. If I claim a file says X, show me the lines. If I claim a test passes, run it and show the output. If I claim a behavior works, describe the specific observable action that confirms it.

## If something does not fit

If something in the spec conflicts with reality (spec is wrong, a library does not behave as documented, a decision needs revisiting), stop and raise it. Do not silently work around it. Do not guess. Update the spec first, then implement.

## Working with hooks

Five hooks are configured: scope-guard, qa-checkpoint, security-scan, single-responsibility, voice-check. The hooks exist to surface drift, scope creep, and rule violations. They are tools, not judges. Two escape hatches exist so the hooks serve work rather than fight it.

**Per-line override:** any hard-gate match (security-scan, voice-check) can be overridden by adding a comment on the line immediately above:

```
// SECURITY-OVERRIDE: <reason>      (security-scan)
// VOICE-OVERRIDE: <reason>         (voice-check)
```

The override is logged so it appears in PR review. Use only when the match is a genuine edge case (an error code identifier that overlaps with a banned word, a trusted markdown render that genuinely needs innerHTML, etc.), not when rewriting feels inconvenient.

**Project-wide pause (emergency valve):** add this comment to the top of the file you are editing or as a top-of-session note:

```
// HOOKS-PAUSED: <reason>
```

All five hooks switch to warn-only mode for the rest of the session. The pause is logged. Use rarely. Pausing hooks routinely is a signal that the hooks need adjustment, not bypassing.

**The discipline:**

1. If a hook is wrong twice in one week, **fix the hook, do not override it twice.** Update the banned-word list, the scope rules, the security pattern, whatever is misfiring. Ship the fix. Then stop fighting the tool.
2. If you cannot make a hook stop misfiring without breaking what it was supposed to catch, the hook may be the wrong shape for this project. **Deleting a hook is allowed.** Five hooks is already a lot of automation. A hook that drains energy is a net loss even if its intent is good.
3. Hooks warn, they do not judge. The scope-guard hook is explicitly `warn-and-confirm`, not `block`. Most hooks follow that model. The ones that hard-gate (security-scan, voice-check) hard-gate for a real reason and have the per-line override above.
4. Overrides leave a trail. The trail is the audit. Pretending an override did not happen is worse than the original violation.

If a hook starts feeling like it is preventing real work, raise it. The hook gets adjusted in the same conversation that produces the work, not in a separate "fix the tooling" session.

---

*This steering file is loaded automatically by Kiro on every prompt in this project. Last updated: May 27, 2026 (v2, Path B + hook override mechanisms added).*
