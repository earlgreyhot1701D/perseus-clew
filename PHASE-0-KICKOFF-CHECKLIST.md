# Phase 0 Kickoff Checklist

> [!NOTE]
> **COMPLETE** — historical Phase 0 setup record. The product is live at [agentislux.io](https://agentislux.io).

> Day 1 of building Agentis Lux. Work through this top-to-bottom before writing any Phase 1 code.

**Status:** v2, May 27, 2026. Updated for Path B (Next.js on Vercel + AWS scan engine) and the v2 doc set. Expect 1-2 focused days (not just one) because Vercel + AWS first-time integration eats time even when no individual step is hard.

Use this checklist the first time you sit down to start Phase 0. Each item has the commands, the verification step, and what to do if it fails.

---

## Before you start

**Prerequisites (install if missing):**

- [ ] Node.js 20.x LTS (`node --version` shows v20.x)
- [ ] Docker Desktop (`docker --version` shows 24+)
- [ ] AWS CLI v2 (`aws --version` shows 2.x)
- [ ] AWS CDK (`cdk --version` shows 2.x)
- [ ] GitHub CLI (`gh --version`)
- [ ] Vercel CLI (`vercel --version`) — install: `npm i -g vercel`
- [ ] Kiro IDE (installed, `kiro --version`)

**AWS account ready:**

- [ ] AWS credits available in your account (verify via Billing dashboard)
- [ ] IAM user `agentislux-dev` created with AdministratorAccess (or equivalent)
- [ ] AWS CLI profile `agentislux` configured (`aws configure --profile agentislux`)
- [ ] Region set to `us-east-1` (or your preferred region; use consistently)

**Vercel account ready:**

- [ ] Vercel account created (free tier is fine for MVP)
- [ ] `vercel login` completed locally
- [ ] Vercel team created for Agentis Lux (note the Team ID, needed for the H0 submission)

**Domain already registered:**

- [x] agentislux.io (canonical, via Route 53)
- [x] agentislux.com (redirect, via Route 53)

---

## Step 1: Create the GitHub repo

```bash
gh auth login
gh repo create agentislux-io/perseus-clew \
  --public \
  --description "Agentis Lux agent-readiness scanner. Perseus Clew engine. Part of the Clew suite."
cd ~/projects  # or wherever you keep projects
git clone git@github.com:agentislux-io/perseus-clew.git
cd perseus-clew
```

**Verify:**
- [ ] Repo exists at https://github.com/agentislux-io/perseus-clew
- [ ] Local clone in your projects directory
- [ ] You can cd into it and `git status` works

**If it fails:**
- `gh auth login` issues: check GitHub token permissions, re-run with `gh auth refresh`
- Organization doesn't exist: create it via GitHub web UI first, then re-run

---

## Step 2: Add LICENSE, NOTICE, .gitignore

```bash
# Apache 2.0 license
curl -o LICENSE https://www.apache.org/licenses/LICENSE-2.0.txt
```

Create `NOTICE` with the content from the external BUILD-PLAN.md § Step 0.2.

Create `.gitignore`:
```
# Dependencies
node_modules/
.npm/

# Build outputs
dist/
build/
.next/
.vercel/

# Environment
.env
.env.local
.env.*.local

# AWS
cdk.out/
.cdk.staging/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp

# Logs
*.log
npm-debug.log*

# Test
coverage/
.nyc_output/
```

Create `.nvmrc`:
```
20.11.0
```

**Commit:**
```bash
git add LICENSE NOTICE .gitignore .nvmrc
git commit -m "chore: initial repo setup with license, notice, gitignore"
git push origin main
```

**Verify:**
- [ ] Four files committed and pushed
- [ ] GitHub repo page shows the Apache 2.0 license badge

---

## Step 3: Set up the monorepo structure

```bash
# From repo root
mkdir -p docs mockups infra backend frontend .kiro/steering .kiro/hooks .github/workflows

# Initialize root package.json for workspaces
cat > package.json << 'EOF'
{
  "name": "perseus-clew",
  "version": "0.1.0",
  "private": true,
  "description": "Agentis Lux agent-readiness scanner. Perseus Clew engine.",
  "workspaces": ["backend", "frontend", "infra"],
  "scripts": {
    "dev": "docker compose up",
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "lint": "npm run lint --workspaces"
  },
  "license": "Apache-2.0"
}
EOF
```

---

## Step 4: Drop in the spec documents

Copy these files from `/mnt/user-data/outputs/` (where they currently live) into `/docs/` in the repo:

- [ ] PERSEUS-CLEW-PRODUCT-REVIEW.md (external design document)
- [ ] PERSEUS-CLEW-PROJECT-CHECKLIST.md (external design document)
- [ ] BUILD-PRINCIPLES.md (external design document)
- [ ] SCORING.md
- [ ] ARCHITECTURE.md
- [ ] BACKEND-SHARED.md
- [ ] BACKEND-FRONTEND-CHECKS.md
- [ ] BACKEND-API-CHECKS.md
- [ ] FRONTEND-SPEC.md
- [ ] BUILD-PLAN.md (external design document)

And the design references into `/mockups/`:

- [ ] agentislux-landing.html
- [ ] agentislux-app.html

Commit:
```bash
git add docs/ mockups/
git commit -m "docs: add spec documents and design mockups"
git push
```

---

## Step 5: Install Kiro steering file and hooks

Copy the five hook files and the steering file from `/mnt/user-data/outputs/`:

```bash
# From repo root
cp /path/to/.kiro-steering-agentislux.md .kiro/steering/agentislux.md
cp /path/to/.kiro-hook-scope-guard.md .kiro/hooks/scope-guard.md
cp /path/to/.kiro-hook-qa-checkpoint.md .kiro/hooks/qa-checkpoint.md
cp /path/to/.kiro-hook-security-scan.md .kiro/hooks/security-scan.md
cp /path/to/.kiro-hook-voice-check.md .kiro/hooks/voice-check.md
cp /path/to/.kiro-hook-single-responsibility.md .kiro/hooks/single-responsibility.md
```

Rename files inside `.kiro/` to their proper names (drop the `.kiro-` prefix once moved into the `.kiro/` directory).

**Verify Kiro picks them up:**
```bash
kiro doctor
```

Expected output: Kiro reports one steering file loaded and five hooks registered.

**If it fails:**
- Run `kiro init` first, then re-copy
- Check file permissions (should be readable)

Commit:
```bash
git add .kiro/
git commit -m "chore: add Kiro steering file and hooks"
git push
```

---

## Step 6: Set up AWS CDK infrastructure

```bash
cd infra
npm init -y
npm install aws-cdk-lib constructs typescript @types/node ts-node
npx cdk init app --language typescript
```

Follow the CDK scaffolding in the external BUILD-PLAN.md § Step 0.5. Create the four stacks (no edge stack: Vercel handles the frontend, not CloudFront):

- [ ] `lib/perseus-clew-base-stack.ts`
- [ ] `lib/perseus-clew-data-stack.ts` (with all five tables: BenchmarkScans, ScanCounters, ScanResults [24h TTL], ScanCache [15m TTL], Users)
- [ ] `lib/perseus-clew-compute-stack.ts`
- [ ] `lib/perseus-clew-monitoring-stack.ts`

Bootstrap CDK in your AWS account (one-time):
```bash
npx cdk bootstrap --profile agentislux
```

Commit:
```bash
git add infra/
git commit -m "chore: scaffold AWS CDK infrastructure"
git push
```

---

## Step 7: Set SSM parameters

```bash
aws ssm put-parameter \
  --profile agentislux \
  --name "/agentislux/production/cache-ttl-minutes" \
  --value "15" \
  --type "String"

aws ssm put-parameter \
  --profile agentislux \
  --name "/agentislux/production/bedrock-model-id" \
  --value "claude-haiku-4-5-20251001" \
  --type "String"

aws ssm put-parameter \
  --profile agentislux \
  --name "/agentislux/production/rate-limit-requests-per-hour" \
  --value "100" \
  --type "String"

aws ssm put-parameter \
  --profile agentislux \
  --name "/agentislux/production/benchmark-refresh-cadence" \
  --value "cron(0 6 1 * ? *)" \
  --type "String"
```

Repeat for `preview` and `staging` environments (same values).

**Verify:**
```bash
aws ssm get-parameters-by-path \
  --profile agentislux \
  --path "/agentislux/production/" \
  --recursive
```

---

## Step 8: Scaffold the backend workspace

```bash
cd ../backend
npm init -y
npm install --save-dev vitest eslint typescript @types/node

mkdir -p src/shared src/checks/frontend src/checks/api src/scoring src/simulation src/orchestrator src/handlers
mkdir -p tests/unit tests/integration tests/fixtures
```

Create `backend/src/handlers/health.js` (Block 0 deliverable):

```javascript
export const handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    status: "ok",
    version: "0.1",
    name: "Perseus Clew engine",
    scanner: "Agentis Lux"
  })
});
```

Commit when ready.

---

## Step 9: Scaffold the frontend workspace (Next.js)

```bash
cd ../frontend
npx create-next-app@latest . --typescript --app --tailwind=false --eslint --no-src-dir --import-alias "@/*"
npm install
npm install --save-dev vitest @testing-library/react axe-core playwright
```

When prompted: App Router yes, no Tailwind (we use CSS modules / tokens.css), no src dir, default import alias.

Create `frontend/app/page.tsx` (Block 0 landing):

```tsx
'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [health, setHealth] = useState<{status: string, version: string} | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth);
  }, []);

  return (
    <main>
      <h1>Agentis Lux</h1>
      <p>Backend: {health ? `${health.status}, ${health.version}` : 'loading'}</p>
    </main>
  );
}
```

Create `frontend/app/api/health/route.ts` (the Next.js API route that proxies to AWS):

```ts
export async function GET() {
  const awsHealthUrl = process.env.AWS_HEALTH_URL!;
  const res = await fetch(awsHealthUrl);
  return Response.json(await res.json());
}
```

This is just Block 0 verification. The real landing page (built from `mockups/agentislux-landing.html`) comes in Block 1L. The result hero (Block 0 main deliverable) is added next.

Create `frontend/styles/tokens.css` with the locked palette and type stack (extract from `mockups/agentislux-landing.html` and `agentislux-verdict-hero.html`):

```css
:root {
  --cream: #f1ebdc;
  --cream-2: #ebe3ce;
  --teal: #0f3d42;
  --teal-mid: #1b6d74;
  --sienna: #e85416;
  --sienna-deep: #d24912;
  --ochre: #d4a43c;
  --muted: #8a9a9d;
  --ink: #5a5548;
  /* type stack via Google Fonts: Archivo, Archivo Black, Instrument Serif, JetBrains Mono */
}
```

Commit when ready.

---

## Step 10: Create Dockerfile and docker-compose.yml

Docker covers the backend (scan engine Lambda) and DynamoDB Local. The Next.js frontend runs via `next dev` against the dockerized backend.

Copy the Dockerfile and docker-compose.yml contents from the external BUILD-PLAN.md § Steps 0.3 and 0.4 into the repo root. Compose includes `backend` and `dynamodb-local` services; the frontend is NOT in compose (Vercel handles it in production, `next dev` handles it locally).

**Verify:**
```bash
# Backend + DynamoDB Local via docker
docker compose up -d

# Frontend via Next.js dev server
cd frontend && npm run dev
```

Expected:
- [ ] `backend` service starts, accessible at http://localhost:3001
- [ ] `dynamodb-local` service running on port 8000
- [ ] Next.js dev server at http://localhost:3000 shows "Backend: ok, 0.1" via the `/api/health` route proxying to backend

**If it fails:**
- Check that Docker Desktop is running
- Check ports 3000, 3001, 8000 are free (`lsof -i :3000`)
- Check logs: `docker compose logs backend`
- Check the Next.js API route forwards to the right backend URL (env: `AWS_HEALTH_URL` for prod, `http://localhost:3001/health` for local)

Commit.

---

## Step 11: Create CI workflows and connect Vercel

**GitHub Actions workflows** (only the ones we actually need; Vercel handles frontend deploys):

- [ ] `ci.yml` — lint, test, audit, determinism, self-scan on every PR (MUST)
- [ ] `deploy-aws.yml` — manual/dispatch `cdk deploy` with smoke test (deliberate, not auto-on-merge)
- [ ] `self-scan.yml` — run Agentis Lux against the deployed URL on merge and weekly

Set up GitHub Actions secrets for AWS:
```bash
gh secret set AWS_ACCESS_KEY_ID --body "..."
gh secret set AWS_SECRET_ACCESS_KEY --body "..."
gh secret set AWS_REGION --body "us-east-1"
```

**Connect Vercel to the repo:**

```bash
cd frontend
vercel link
```

Follow prompts: select the Agentis Lux team, link to the repo. Vercel will auto-detect Next.js and configure:
- Auto-deploy on merge to main
- Preview deployment per PR with URL comment
- One-click rollback to any prior deployment

In the Vercel dashboard:
- [ ] Set `AWS_HEALTH_URL` env var (points at API Gateway production URL after first cdk deploy)
- [ ] Set custom domain `agentislux.io` (DNS step is in Step 12)

**Verify:**
- Open a test PR with a trivial change
- [ ] GitHub Actions CI workflow runs and passes
- [ ] Vercel posts a preview URL comment on the PR
- [ ] Click the preview URL: frontend loads, even if the AWS backend is not yet connected

Merge the test PR when CI is green.

---

## Step 12: Point domains at Vercel

After the first frontend deploy (Block 0 Hello World), configure Route 53 records to point at Vercel:

- [ ] In Vercel project settings, add custom domain `agentislux.io`; Vercel shows the required DNS records
- [ ] In Route 53, add the records Vercel specified (typically an A/AAAA or CNAME for the apex, plus a CNAME for `www`)
- [ ] In Vercel, add `agentislux.com` as a redirect domain pointing at `agentislux.io`
- [ ] Route 53 records for `agentislux.com` updated accordingly
- [ ] TLS: Vercel issues certificates automatically once DNS validates (no ACM setup needed for the frontend)
- [ ] AWS API Gateway endpoint has its own TLS via the default `*.execute-api.<region>.amazonaws.com` cert (no custom domain needed at MVP; if you want `api.agentislux.io`, that uses ACM and is post-MVP)

**Verify:**
- [ ] `curl -I https://agentislux.io` returns 200 with valid HTTPS
- [ ] `curl -I https://agentislux.com` returns 301 or 302 redirecting to `agentislux.io`
- [ ] DNS propagation may take a few minutes; Vercel dashboard shows a green check when records are correct

---

## Phase 0 completion gate

Before declaring Phase 0 done and starting Phase 1 Block 0:

- [ ] Repo structure in place, all docs committed (including the v2 spec set)
- [ ] Kiro steering file and five hooks active (verified via `kiro doctor`)
- [ ] AWS CDK deploys successfully to your account (data + compute + monitoring stacks)
- [ ] SSM parameters set for production, preview, staging
- [ ] Vercel project linked, preview deploys working per PR
- [ ] `docker compose up` + `next dev` works locally end-to-end (frontend talks to backend talks to DynamoDB Local)
- [ ] CI workflow green on an initial test PR (ci.yml, self-scan.yml)
- [ ] Vercel production URL loads (even if only showing the Block 0 hello world)
- [ ] Vercel Team ID documented somewhere durable (needed for the H0 submission)
- [ ] You can walk through these steps from a fresh machine with only AWS_PROFILE and a Vercel login

---

## When something breaks during Phase 0

Phase 0 is foundation work. Nothing here is fast-and-loose. If something breaks:

1. Stop. Do not proceed to the next step.
2. Read the error carefully.
3. Check the relevant external BUILD-PLAN.md section for setup details.
4. If AWS-related: check your profile, region, and credits.
5. If Docker-related: check that Docker Desktop is running and has resources.
6. If npm-related: check Node version matches `.nvmrc`.
7. If none of the above fix it: flag it, document what you tried, come back to it.

---

## After Phase 0

Once this checklist is complete, you are ready for Phase 1 Block 0 (Hello World end-to-end, see the external BUILD-PLAN.md § Block 0).

Remember: at the start of each Phase 1 session, declare the build block to Kiro so the scope-guard hook works correctly:

```
"Working on Block 0: Hello World end-to-end."
```

---

*AI assisted. Human approved. Powered by NLP.*
