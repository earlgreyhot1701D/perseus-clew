# Hook: QA Checkpoint

**Purpose:** Force explicit task-completion accountability. No "I'm done" without proof.

**Trigger:** When Kiro declares a task or sub-task is complete.

## Behavior

Kiro cannot move to the next task without producing a five-question QA checklist. The user (human builder) reviews the checklist and marks the block PASS or FAIL before work continues.

## Required checklist

```
QA CHECKPOINT

Task completed: <task description>
Block context: <current block from scope guard>

1. Files created or modified:
   <list of file paths with one-line description of each change>

2. Tests added:
   <list of new test files or test cases>

3. Tests currently passing:
   <run the test suite relevant to these changes, paste the output>

4. Manual checks to verify observable behavior:
   <3-5 specific actions the human can take to verify the work>
   For each check, reference the spec section that describes the expected outcome.

5. Related spec section:
   <link or path to the spec section that defines what was built>

Awaiting PASS / FAIL from builder.
```

## Example output

```
QA CHECKPOINT

Task completed: Semantic HTML check module
Block context: Block 1C (Backend frontend check modules)

1. Files created or modified:
   - backend/src/checks/frontend/semantic-html.js (new, 240 lines)
   - backend/src/checks/frontend/semantic-html.findings-catalog.js (new, 85 lines)
   - backend/tests/checks/frontend/semantic-html.test.js (new, 180 lines)
   - backend/tests/fixtures/frontend-html/semantic-html-good.html (new)
   - backend/tests/fixtures/frontend-html/semantic-html-bad.html (new)

2. Tests added:
   - 12 unit tests covering each check in the module
   - 3 fixture-based integration tests (good, bad, mixed HTML)
   - 1 determinism test (10 iterations, identical output)

3. Tests currently passing:
   ✓ semantic-html.test.js (16/16 passing, 340ms)
   ✓ All other frontend check tests still passing

4. Manual checks to verify observable behavior:
   a. Feed the module the Agentis Lux landing page HTML. Expect score near 25/25, zero findings.
      Spec: BACKEND-FRONTEND-CHECKS.md § "Module 1: Semantic HTML" (how you'll know it works, check 1)
   b. Feed the module a page with 20 styled divs used as buttons. Expect multiple findings
      with specific selectors, each following the voice pattern "An agent cannot confirm..."
      Spec: BACKEND-FRONTEND-CHECKS.md § "Module 1: Semantic HTML" (how you'll know it works, check 2)
   c. Read aloud three findings. Do they describe what an agent cannot do, or tell the
      developer what to fix? They must be the former.
      Spec: BACKEND-FRONTEND-CHECKS.md § "Voice and Tone"

5. Related spec section:
   docs/BACKEND-FRONTEND-CHECKS.md § Module 1
   docs/SCORING.md § Semantic HTML (weight: 25)

Awaiting PASS / FAIL from builder.
```

## User response

**PASS:** Kiro logs the pass, moves to the next task or waits for the next instruction.

**FAIL:** Kiro stops, asks the user what needs to change. Does not proceed until the issue is addressed and a new checkpoint is produced.

**No response:** Kiro waits. Does not assume approval.

## What Kiro MUST NOT do

- Claim task completion without producing the checklist
- Move to the next task without an explicit PASS
- Summarize test results as "all tests pass" without running them and showing output
- Describe observable behavior in abstract terms without specific spec references

## Why this exists

A shared failure mode: the AI says "done" and moves on, but the work was half-finished. The builder discovers the gap three blocks later, after more work has been built on top of it. QA checkpoints catch gaps at the earliest possible moment. They also create a paper trail of what was verified when.

## Honors the project-wide pause

If a `// HOOKS-PAUSED: <reason>` comment is present in the file being edited or declared in the session context, this hook switches to warn-only mode for the duration of the session. See the steering file "Working with hooks" section for the discipline.
