# Benchmark Dataset: 50-Site Scan (June 19, 2026)

The complete record of the first AgentisLux benchmark run. Every site, every score, every failure. Published for transparency so anyone can check our work.

## Run details

- **Batch run ID:** `run-2026-06-19-f8cb741a`
- **Scan date:** 2026-06-19
- **Methodology version:** 1.1.1
- **Engine:** Perseus Clew (deterministic scoring, AI hero-lines and simulation via Bedrock Haiku 4.5)
- **Row count:** 60 total (50 door scans + 10 reference spec scans for SaaS sites)
- **Failures included:** 4 door failures (bot-blocks, timeouts) + 2 reference failures (spec URL 404s), all with reasons

## What this is

50 sites scanned with the AgentisLux engine, ten per vertical (e-commerce, SaaS/developer tools, content/media, US government, indie/builder). The selection used maximum-variation sampling, criteria and per-site rationale committed before any scan ran. See [BENCHMARK-SITES.md](../BENCHMARK-SITES.md) for how and why each site was chosen.

Scores are deterministic: the same HTML input produces the same score every time. Hero-line narratives and agent simulation are AI-generated (Claude Haiku 4.5), fail-soft to templates if Bedrock is unavailable.

This is the complete per-site record. Every one of the 50 sites is in the dataset with its scores, and every failure with its reason. It is published for auditability, not as a ranking or leaderboard. The methodology is observational: we describe what agents experience, we do not rank sites against each other.

## What the data contains

Each row in `benchmark-2026-06-19.csv`:

| Field | Description |
|-------|-------------|
| site_id | Site identifier (matches BENCHMARK-SITES.md) |
| vertical | ecommerce, saas, content, government, indie |
| scan_mode | `door` (website scan) or `reference` (spec from GitHub URL, SaaS only) |
| status | `success` or `failed` |
| failure_reason | Why the scan did not complete (FETCH_FORBIDDEN, FETCH_TIMEOUT, FETCH_SPEC_HTTP_ERROR) |
| frontend_score | 0-100 composite score (door scans only) |
| frontend_rating | Agent-Ready / Partially Ready / Not Yet Readable |
| semantic_html | Earned/max for semantic HTML category (weight 25) |
| form_accessibility | Earned/max for form accessibility (weight 20) |
| aria | Earned/max for ARIA and accessibility (weight 15) |
| structured_data | Earned/max for structured data (weight 15) |
| content_in_html | Earned/max for content in HTML (weight 15) |
| link_navigation | Earned/max for link and navigation (weight 10) |
| api_score | API spec score for reference scans (0-100) |
| api_rating | API rating for reference scans |
| hero_line_source | `ai` (Bedrock) or `template` (fallback) |
| simulation_available | Whether the agent simulation ran |

## Predictions

The hypotheses I wrote before this scan ran are in [BENCHMARK-HYPOTHESES.md](../BENCHMARK-HYPOTHESES.md), timestamped and committed before any data existed. The results confirmed some and missed others. That is the point of pre-registering predictions: the misses are findings too.

## Methodology

Full scoring methodology: [SCORING.md](../SCORING.md). Check definitions: [BACKEND-FRONTEND-CHECKS.md](../BACKEND-FRONTEND-CHECKS.md) and [BACKEND-API-CHECKS.md](../BACKEND-API-CHECKS.md).

---

*AI assisted. Human approved. Powered by NLP.*
