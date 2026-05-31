# Hook: Scope Guard

**Purpose:** Prevent accidental out-of-block edits that create refactor risk.

**Trigger:** Before Kiro writes to any file.

## Behavior

At the start of each session, the user declares the current build block. Example declarations:

- "Working on Block 0: Hello World end-to-end."
- "Block 1A: Backend shared infrastructure."
- "Block 1D: Frontend scanning and results views."

The scope guard maintains a list of file paths that belong to the current block (from BUILD-PLAN.md's Phase 1 Block Sequence).

Before Kiro writes to a file, the hook checks:

1. Is the file path in the current block's declared file list?
2. If no: is the change a trivial fix (missing import, typo that blocks compilation, missing type annotation)?
3. If no to both: warn the user and pause for confirmation.

## Warning output

```
SCOPE GUARD: Editing /path/to/file outside current block.

Current block: Block 1C (Backend frontend check modules)
File: frontend/src/components/scan/ScoreRing.jsx
Change: Modifying score ring rendering logic

This file belongs to Block 1D (Frontend scanning and results views).

Continue anyway? [y/N]
```

## What counts as a trivial fix (allowed without warning)

- Adding a missing import statement
- Fixing a typo that causes a compile error
- Adding a TypeScript type annotation that was missing
- Removing dead code that was obviously left behind (unused variable, stale comment)

## What does not count as trivial

- Refactoring existing code that was working
- Renaming functions or variables
- Changing the shape of an interface or prop type
- Moving code between files
- Adding new functionality to a file from a previous block

## Action

On warning:
- Print the warning
- Wait for user response
- If `y`: log the override and proceed
- If `n` or no response: skip the change

On compile-blocking trivial fixes:
- Log the fix briefly, proceed
- Do not pause

## Why this exists

Parallel frontend/backend tracks in Phase 1 work best when blocks stay bounded. A small fix to previous-block code is fine and unblocks the builder. A full refactor in the middle of a new block creates regression risk and makes QA checkpoints unreliable.

The distinction: a fix serves the current block's needs. A refactor reorganizes code that was already working.

## Honors the project-wide pause

If a `// HOOKS-PAUSED: <reason>` comment is present in the file being edited or declared in the session context, this hook switches to warn-only mode for the duration of the session. See the steering file "Working with hooks" section for the discipline.
