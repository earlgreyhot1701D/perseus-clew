# Agentis Lux

**See what AI agents experience on your site.**
For your second audience.

Engine: Perseus Clew, part of the Clew suite. Public name: Agentis Lux. Domain: agentislux.io.

> ### Status: pre-production
> The scan engine is built, tested, and merged, with CI green. It has not been deployed yet, and it has not run against live sites. This repo is open to read, not yet to use. The benchmark predictions are pre-registered in [docs/BENCHMARK-HYPOTHESES.md](docs/BENCHMARK-HYPOTHESES.md), committed before any scan runs. The results will follow.

## What this is

The web has a second audience now. AI agents fetch pages, read content, fill out forms, and call APIs, and most products were built and tested for people, not for them. Agents are a different audience with different needs, and most of them don't run JavaScript, so they often see far less of a page than a person does.

Agentis Lux scans a site and surfaces what an agent experiences when it tries to use it. It reports findings from the agent's point of view, like "an agent landing on this page can't tell which element starts checkout, because it's a styled div and not a button." It describes what the agent can and can't do. It does not suggest fixes, because fixes assume knowledge of your codebase. Awareness, not judgment.

Built for the H0 Hackathon, B2B track.

## What works today, and what's pending

Built and merged:

- Six frontend checks (semantic HTML, form accessibility, ARIA, structured data, content in HTML, link and navigation), all implemented with cheerio.
- Six API checks (naming and descriptions, error design, discoverability, response efficiency, reliability patterns, agent integration), derived in part from Emmanuel Paraskakis's API checklist. See NOTICE.
- Two scoring modules computing weighted scores, with ratings of Agent-Ready, Partially Ready, or Not Yet Readable.
- An agent-simulation layer that calls AWS Bedrock (Claude Haiku) for a plain-language verdict, fail-soft if Bedrock is unavailable.
- A benchmark batch engine that scans 50 curated sites, ten per vertical, and writes results to DynamoDB.
- Full CI: lint, type-check, and the test suites run on every push and pull request.

Pending:

- Deployment. The engine has not been deployed, so there is no live scan yet.
- Input types. The public scan reads a URL today. Repo scanning and spec upload are stubbed and return "not yet available."
- The first 50-site benchmark run. The predictions are committed. The scan has not run.

## The bet

Before the engine scans anything, I wrote down what I expect it to find across the 50 sites, and committed it with a timestamp. Predictions first, data later. Read them in [docs/BENCHMARK-HYPOTHESES.md](docs/BENCHMARK-HYPOTHESES.md). The site list and the selection rationale are in [docs/BENCHMARK-SITES.md](docs/BENCHMARK-SITES.md).

## Dogfooding

We scan our own site and publish the result, flattering or not. The first self-scan, before any cleanup, scored 70/100 ("Partially Ready"), with the gaps in structured data and navigation. The after-scan, once we fix what the tool found, will be published right beside it.

![Agentis Lux self-scan card: perseus-clew.vercel.app scored 70 of 100, Partially Ready](docs/self-scan/before/self-scan-before-card.png)

Full artifacts:
- [Scan result JSON](docs/self-scan/before/self-scan-before.json)
- [Downloadable report HTML](docs/self-scan/before/self-scan-before-report.html)
- [Build-in-public writeup](docs/self-scan/SELF-SCAN-BEFORE.md)

## Benchmark

I scanned 50 sites to see what agents experience across the web: ten each in e-commerce, SaaS, content/media, US government, and indie/builder projects. The headline: indie builders scored highest (mean 77/100), beating government, SaaS, and e-commerce. Scores ran from 34 to 91, with no convergence on agent-readiness yet. Four sites blocked the scan at the door, including OpenAI. The complete dataset, every site, including the ones that blocked us, is in [docs/benchmark/](docs/benchmark/), and the predictions I made before scanning are timestamped in [docs/BENCHMARK-HYPOTHESES.md](docs/BENCHMARK-HYPOTHESES.md). I missed three of six, which is the point.

## Architecture

Two ideas run through the whole build. The structure is deterministic, so the same input gives the same score every time. The flavor is AI, used only where judgment helps. The checks and the scoring are pattern matching, no model involved. Bedrock writes the one-line verdict and runs the agent simulation on top of that.

Stack:

- **Backend:** Node ESM Lambda source. Six frontend checks, six API checks, two scoring modules, two scan flows (one for frontend HTML, one for API specs), a scan handler, the simulation layer, and the benchmark engine.
- **Frontend:** Next.js (App Router) with an `/api/scan` proxy route.
- **Infra:** AWS CDK in TypeScript, four stacks (base, data, compute, monitoring).
- **Containers:** Docker. The Lambdas run as container images, and the stack runs locally with Docker Compose.

AWS services defined in the CDK stack:

- **Lambda** (Docker image): the scan function, and a monthly benchmark-refresh function.
- **API Gateway** (HTTP API): `POST /scan` and `GET /health`, CORS locked to agentislux.io.
- **Bedrock:** Claude Haiku, called by the scan Lambda for the verdict and the simulation.
- **DynamoDB:** five tables, for benchmark scans, scan counters, ephemeral results, a short-lived URL cache, and users.
- **EventBridge:** a monthly rule to refresh the benchmark dataset.
- **CloudWatch and SNS:** alarms on scan error rate and duration, wired to an alert topic.

Everything above is defined in the stack and verified by a type-checking build in CI. None of it is deployed yet.

## Project structure

```
perseus-clew/
├── backend/                  Node ESM Lambda source
│   ├── src/
│   │   ├── checks/           the six frontend checks and six API checks
│   │   ├── scoring/          weighted scoring
│   │   ├── orchestrator/     scan flows and the agent simulation
│   │   ├── handlers/         Lambda entry points (scan, refresh)
│   │   ├── benchmark/        the 50-site batch engine and site list
│   │   ├── shared/           fetch, parse, sanitize, Bedrock client
│   │   └── simulation/
│   ├── scripts/              local DB init, local server, run-benchmark CLI
│   └── tests/                Vitest suites (unit, integration, fixtures)
├── frontend/                 Next.js App Router app
│   ├── app/                  routes, including the /api/scan proxy and /scan
│   ├── components/           landing, shell, common, ResultHero
│   ├── lib/                  report export
│   ├── styles/               tokens and globals
│   └── tests/                Vitest suites
├── infra/                    AWS CDK (TypeScript)
│   ├── bin/app.ts
│   └── lib/                  base, data, compute, monitoring stacks
├── docs/                     source-of-truth specs and methodology
│   ├── ARCHITECTURE.md
│   ├── SCORING.md
│   ├── BACKEND-FRONTEND-CHECKS.md
│   ├── BACKEND-API-CHECKS.md
│   ├── BACKEND-SHARED.md
│   ├── FRONTEND-SPEC.md
│   ├── BENCHMARK-HYPOTHESES.md      the pre-registered predictions
│   ├── BENCHMARK-SITES.md           the 50 sites and selection rationale
│   └── benchmark-candidate-pool.md
├── mockups/                  locked visual design (landing, app, verdict hero)
├── .kiro/                    steering file and enforcement hooks
├── .github/workflows/        ci.yml, deploy-aws.yml, self-scan.yml
├── Dockerfile, Dockerfile.dev, docker-compose.yml
├── NOTICE                    attribution for Paraskakis and the Clew suite
└── README.md
```

## Running it locally

This is the honest way to see the engine work today, since there is no hosted scan. The test suites exercise every check against fixtures.

```
nvm use            # Node version from .nvmrc
npm ci             # install
npm test           # run the Vitest suites
```

Docker Compose runs the stack locally for development:

```
docker compose up
```

There is no "paste your URL" box yet. The scan runs in the tests today, and behind the API once it's deployed.

## Methodology and docs

The scoring methodology is published and versioned, so anyone can audit it.

- [docs/SCORING.md](docs/SCORING.md): categories, weights, and what each check looks for.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design.
- [docs/BACKEND-FRONTEND-CHECKS.md](docs/BACKEND-FRONTEND-CHECKS.md) and [docs/BACKEND-API-CHECKS.md](docs/BACKEND-API-CHECKS.md): the check definitions.
- [docs/BENCHMARK-HYPOTHESES.md](docs/BENCHMARK-HYPOTHESES.md): the pre-registered predictions.
- [docs/BENCHMARK-SITES.md](docs/BENCHMARK-SITES.md): the 50 sites and why each one is in.

The API checks draw in part on the "Build AI-Ready Products" API checklist by Emmanuel Paraskakis, credited in NOTICE.

## License

Apache 2.0. Use it, change it, share it, say where it came from. See LICENSE.

---

*AI assisted. Human approved. Powered by NLP.*
