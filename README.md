# Perseus Clew Starter Kit

> Drop-in starter package for the Agentis Lux / Perseus Clew project.
> Everything you need to start Phase 0, in the right folder structure.

## What this is

This is a starter kit that you unzip into an empty directory (or an already-initialized git repo). It contains:

- All spec documents (`/docs`)
- Visual design mockups (`/mockups`)
- Kiro steering file and five enforcement hooks (`/.kiro`)
- Phase 0 kickoff checklist (root)
- This README, a NOTICE file, and a .gitignore

It does NOT contain:

- Source code (that's what you build in Phase 1)
- Node modules, Docker images, or AWS resources
- GitHub repo configuration (that's done via `gh` CLI in the kickoff checklist)

## Quick start

1. **Unzip into your projects directory.** The archive extracts as a folder called `perseus-clew`.

2. **Initialize git if you haven't already:**
   ```bash
   cd perseus-clew
   git init
   git add .
   git commit -m "chore: initial starter kit"
   ```

3. **Verify Kiro picks up the steering file and hooks:**
   ```bash
   kiro doctor
   ```
   Expected: one steering file loaded, five hooks registered.

4. **Read PHASE-0-KICKOFF-CHECKLIST.md** in this directory. Work through it top to bottom.

5. **When Phase 0 is complete**, declare Block 0 to Kiro and start Phase 1.

## Folder structure

```
perseus-clew/
├── README.md                          This file
├── PHASE-0-KICKOFF-CHECKLIST.md       Day 1 of building. Start here.
├── NOTICE                             Attribution for Paraskakis, Clew suite
├── .gitignore                         Standard Node + AWS patterns
├── docs/                              All source-of-truth documents
│   ├── PERSEUS-CLEW-PRODUCT-REVIEW.md
│   ├── PERSEUS-CLEW-PROJECT-CHECKLIST.md
│   ├── BUILD-PRINCIPLES.md
│   ├── SCORING.md
│   ├── ARCHITECTURE.md
│   ├── BACKEND-SHARED.md
│   ├── BACKEND-FRONTEND-CHECKS.md
│   ├── BACKEND-API-CHECKS.md
│   ├── FRONTEND-SPEC.md
│   ├── BUILD-PLAN.md
│   └── BuildAIReadyProductsAPIChecklist.pdf   Paraskakis reference
├── mockups/                           Locked visual design
│   ├── agentislux-landing.html
│   └── agentislux-app.html
└── .kiro/                             Kiro configuration
    ├── steering/
    │   └── agentislux.md              Loaded automatically on every prompt
    └── hooks/
        ├── scope-guard.md
        ├── qa-checkpoint.md
        ├── security-scan.md
        ├── voice-check.md
        └── single-responsibility.md
```

## What's coming next (once you start Phase 1)

The kickoff checklist will have you scaffold these additional directories:

- `/infra` (AWS CDK TypeScript)
- `/backend` (Lambda source)
- `/frontend` (React app)
- `/.github/workflows` (CI)

Those are Phase 0 work. This starter kit gives you the foundation to do that work against.

## Project names

- **Agentis Lux** is the public product name. agentislux.io is the domain.
- **Perseus Clew** is the internal engine name. Part of the Clew suite.
- Both names are active. Use Agentis Lux for user-facing strings. Use Perseus Clew for engineering artifacts.

## License

Apache 2.0 (add LICENSE file after `git init`; the kickoff checklist has the step).

---

*AI assisted. Human approved. Powered by NLP.*
