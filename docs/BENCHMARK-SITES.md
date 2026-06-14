# Benchmark Sites

> How we chose the 50, and which 50 we chose.
> Selection criteria pre-registered before any scan runs. Committed alongside BENCHMARK-HYPOTHESES.md.
> AgentisLux (engine: Perseus Clew).

---

## Why the criteria come first

The credibility of this benchmark rests on one thing: we decided the selection rules before we saw any scores. If the rules were written after the data, a reader could fairly ask whether we picked sites to fit the story. So the eligibility criteria below are committed before the first scan, in the same pass as the hypotheses. The predictions and the selection rules are both pre-registration. Only the results come later.

This is a first reading of a field with no settled standard yet, not a verdict. Fifty sites, ten per vertical, is illustrative. It shows patterns and examples. It is not a representative sample of the web and does not claim statistical significance.

---

## Universal eligibility (every site must pass all four)

1. **Publicly accessible, no login required** to reach the scanned page. AgentisLux reads what an agent sees at the public door. Anything behind authentication is out of scope (and is reserved for a future authenticated-scan tier).
2. **A real, in-use site**, not a demo, template showcase, or parked domain. The results only mean something if the sites are live products people actually use.
3. **English-language primary content.** The checks and our reading of the findings are English-based. Mixing languages adds a variable we cannot control for in a sample this size. This is a stated limitation, noted plainly rather than hidden.
4. **Reachable and stable at scan time**, not mid-migration or erroring. We measure agent-readiness, not uptime. A site that is down during the scan is noise, not signal, and is re-scanned or replaced.

---

## The five verticals (10 sites each, maximum-variation sampling)

The goal within each vertical is range, not "the ten best" or "the ten biggest." We deliberately span large and small, established and independent, so the sample shows the spread that exists in the wild. The universal rule under every vertical: **span the size range, do not cluster all picks at one size.**

### 1. E-commerce (10)
Online stores where the primary action is buying something.
- Span large/household-name retailers, mid-size stores, and small/indie shops.
- **Hypothesis-linked specific (feeds H4):** deliberately include a mix of platform-built stores (Shopify and similar) and custom-built storefronts. H4 predicts e-commerce has the widest internal spread, and the platform-versus-custom split is the mechanism we expect to drive it.

### 2. SaaS / developer tools (10)
Software products with a marketing frontend and, where available, a public API.
- Span well-known dev tools, mid-size SaaS, and smaller or newer products.
- **API-spec policy (the middle path):** we aim for 10 SaaS sites with a publicly discoverable OpenAPI or Swagger spec, because this is the only vertical that exercises the API half of the engine. The actual number of scannable specs found is reported with the results, not forced. If the wild yields fewer than 10, that shortfall is itself a finding (most SaaS does not publish a discoverable spec), and we report the real number rather than padding it. Tighter API-site criteria are a v2 refinement.

### 3. Content / media (10)
Sites whose primary purpose is publishing: news, magazines, blogs, documentation.
- Span major outlets, mid-size publications, and independent or niche content sites.

### 4. Government / civic (10)
Official government and public-institution sites.
- **Scope: US only for this run.** Federal, state/local, and agency/service sites, spanning levels of government. H2 (government beats indie on readability) rests on US accessibility law (Section 508, 36 CFR Part 1194), so a US-only sample lets that hypothesis stand or fall on its own terms without a different country's accessibility regime confounding it. "Government" means US government throughout this run. Non-US government is a v2 expansion.

### 5. Indie / builder (10)
Personal sites, indie maker projects, small tools, developer portfolios, side projects. The audience AgentisLux is built for.
- **Hypothesis-linked specific:** deliberately include both developer-built sites (often hand-coded, likely clean semantic HTML) and design-built sites (often prettier, likely more JavaScript-heavy). The tension between "built by someone who cares about craft" and "an agent sees none of it" is the heart of this vertical.

---

## Note on AI companies

We scan some AI companies' own public sites as part of the 50, under the same criteria as everyone else. We are not pre-registering a prediction about them (see the hypotheses file). They earn their place by meeting the vertical criteria, not by being AI companies.

---

## What gets committed when

- **Before any scan:** these criteria, the hypotheses (BENCHMARK-HYPOTHESES.md), and the final list of 50 selected sites with per-site rationale (the section below, filled once curation is done).
- **After the scan:** the raw results (JSON), per-site scan dates, and the methodology writeup.

The selection (which 50) is made under the locked criteria above and is also a "before" artifact: it is committed before the scan, so the choice cannot be tuned to the scores.

---

## The v2 parking lot

Held deliberately out of this first run, to keep the baseline tight and honest:
- Stricter API-site gating (all SaaS sites required to have scannable specs).
- Non-US government sites (and a cross-jurisdiction look at whether other accessibility regimes also produce accidental agent-readiness).
- Non-English content.
- A larger sample per vertical.

A first measurement earns the right to broaden by existing first. These are expansions, not gaps.

---

## On specs that live off the website (a methodology decision)

During candidate selection, every SaaS company with a confirmed OpenAPI spec published it on their GitHub organization, not at a path discoverable from their own website. This forced a decision about what AgentisLux measures, and it turned out to clarify the thesis rather than complicate it.

**The product scans the door.** AgentisLux auto-discovery looks for a spec where an agent would actually look: standard paths on the site (/openapi.json and similar), /.well-known/, an HTML `<link rel="service-desc">`, or the API-docs subdomain. It does not go spelunking in a company's GitHub org. An agent trying to use an API in the moment uses what the company surfaces at its own doors (or its training data), not a repository it would have to know to find. So when AgentisLux reports "no spec discoverable at the door" for a company that has an excellent spec on GitHub, that is not a miss. It is the correct, honest result: it is what the second audience meets at the front door.

**The benchmark captures both sides, because the gap is a finding.** For the 50-site run we record two things for each SaaS site:
1. The **door result**: what AgentisLux discovers at the website (the AgentisLux score, on thesis).
2. The **reference result**: the spec scanned from its actual (often GitHub) URL, clearly labeled as not-at-the-door, so we can say how good the spec is when you do find it.

The distance between those two is one of the more interesting things this benchmark can show: companies with genuinely strong specs that an agent cannot find where it would look. "Great spec, wrong doorstep" is a result, not a footnote.

**On AgentisLux ever chasing off-domain specs.** A future "also check their GitHub" mode is an open question, and the likely answer is no, by design. AgentisLux measures what an agent meets at the door. Going to find a spec an agent would not find measures something else. This is noted as a deliberate product boundary, not an oversight.

---

## The 50 selected sites

> Curation in progress. Filled, with per-site rationale, before any scan runs. Committed as a "before" artifact under the locked criteria above.

**On how these were chosen.** Within each vertical, sites were selected by maximum-variation sampling: deliberately spanning size, platform, and build type to cover the range, not chosen randomly and not chosen by predicted score. Random sampling is the wrong method at ten sites per vertical (it produces clustering by luck, not representativeness, which needs a far larger sample). Where two candidates were structurally identical (same size tier, same platform), the choice between them was made on category spread, not name recognition, so the selection axis is visible and defensible. Platform and build-type labels marked "verify" are best guesses pending confirmation (BuiltWith / Wappalyzer) before the final lock.

### 1. E-commerce (10)

| # | Site | Size / build | Why selected (variation axis) |
|---|------|--------------|-------------------------------|
| 1 | Amazon | Large / custom | High end of size; deliberate anti-bot / "blocks the gate" test case (ties to H5). The agent-hostile-giant reference. |
| 2 | Walmart | Large / custom | Large, heavy client-side, but the reliable big-box that should actually scan (insurance if Amazon blocks). |
| 3 | McMaster-Carr | Large / custom, server-rendered | The contrast case: a giant that is famously fast and server-rendered. Breaks the "big = unreadable" pattern. The within-vertical surprise candidate. |
| 4 | Bombas | Mid / Shopify | Shopify-mid DTC, apparel. Tests platform "good defaults." |
| 5 | Allbirds | Mid / Shopify | Shopify-mid DTC, footwear. |
| 6 | Olipop | Mid / Shopify | Shopify-mid DTC, beverage. |
| 7 | Brooklinen | Mid / Shopify | Shopify-mid DTC, home / bedding. |
| 8 | Vermont Country Store | Small / custom-legacy (VERIFY) | The small-end build contrast: older catalog retailer, likely custom/legacy, tested against the small-Shopify shops. If it verifies as Shopify, swap to Tom Bihn (the contrast depends on it being non-Shopify). |
| 9 | Misen | Small / Shopify | Small Shopify, kitchenware. |
| 10 | Topo Designs | Small / Shopify | Small Shopify, outdoor gear. |

*Variation captured: full size range (giant to small), platform-vs-custom contrast at both the large end (McMaster vs Amazon/Walmart) and the small end (Vermont vs the small-Shopify shops), an anti-bot block case, and seven distinct product categories. Feeds H4 (e-commerce widest spread) and H5 (gate-blocking).*
*To verify before final lock: Vermont Country Store stack (contrast depends on non-Shopify); spot-check the Shopify-mid platform labels, since platform-vs-custom is H4's mechanism.*

### 2. SaaS / developer tools (10)

All 10 have a CONFIRMED OpenAPI/Swagger spec (fetched and verified during curation). Per the middle-path policy, this is the spec-bearing target met. Note: spec location is recorded because every confirmed spec lives off the primary domain (see the off-domain methodology note above). The door-vs-reference gap is scored for each.

| # | Site | Size | Spec location (reference URL) | Why selected (variation axis) |
|---|------|------|-------------------------------|-------------------------------|
| 1 | Stripe | Large | GitHub (stripe/openapi) | Large; payments. Canonical multi-MB spec. |
| 2 | GitHub | Large | GitHub (github/rest-api-description) | Large; dev platform. |
| 3 | Twilio | Large | GitHub (twilio/twilio-oai) | Large; comms API. |
| 4 | Slack | Large | GitHub (slackapi/slack-api-specs) | Large; messaging platform. |
| 5 | Square | Large | GitHub (square/connect-api-specification) | Large; payments (deliberate pair with Stripe for within-category comparison). |
| 6 | OpenAI | Large | GitHub (openai/openai-openapi) | Large; AI company (scanned under the same criteria as everyone; no pre-registered prediction). |
| 7 | Box | Mid-large | GitHub (box/box-openapi) | Mid-tier; storage/content. |
| 8 | PagerDuty | Mid | GitHub (PagerDuty/api-schema) | Mid-tier; ops/incident. The smaller end of the confirmed set. |
| 9 | Asana | Mid-large | GitHub (Asana/openapi) | Mid-tier; work management. |
| 10 | Vercel | Mid-large | on-domain (openapi.vercel.sh) | Mid-tier; the ONE clean on-domain spec case. Important contrast: the company whose spec an agent could actually find at the door. |

*Variation captured: skews large/mid, which is itself a finding (spec-publishing skews toward established companies; small SaaS rarely publishes a discoverable spec, anticipated by the middle-path yield policy). Vercel is the deliberate on-domain contrast against 9 GitHub-hosted specs. Stripe/Square is a within-category payments pair.*
*Note: SendGrid was dropped (Twilio subsidiary, redundant with Twilio already present). The DOCS-ONLY and NONE candidates (DigitalOcean, GitLab, Notion, Linear, Discord, Spotify, Plausible, Buttondown) did not meet the confirmed-spec bar; not scored on the API half.*

### 3. Content / media (10)

Selection axis here is build/stack type (does the article text live in readable HTML?), spanning clean server-rendered, paywalled, JS-heavy CMS, nonprofit, platform, and minimal hand-built. Topic was deliberately balanced too: an early draft skewed tech-heavy (tech press tends to dominate "content site" recall), so the list was rebalanced to 5 tech-adjacent and 5 general, so the vertical tests *publishing sites* broadly rather than *tech publishing* specifically. A tech-topic site kept for a structural reason (Daring Fireball, below) is noted as such.

| # | Site | Size / type | Why selected (variation axis) |
|---|------|-------------|-------------------------------|
| 1 | NPR | Large / clean server-rendered | The readable big-outlet baseline. General news. |
| 2 | NYT | Large / paywall | The barriered big-outlet contrast (paywall changes what an agent parses). General news. |
| 3 | BBC | Large / server-rendered | Second clean major, general news, non-US. Balances the tech tilt. |
| 4 | ProPublica | Mid / nonprofit newsroom | Nonprofit incentives, often cleaner markup. General/investigative. |
| 5 | Defector | Small / worker-owned blog | Deliberately non-tech (sports/culture). Different stack and incentive structure. |
| 6 | TechCrunch | Mid / WordPress (VIP) | The WordPress publishing-stack case. Tech media. |
| 7 | The Verge | Mid / custom CMS | The custom-CMS case (known JS-heavy redesign). Tech media. |
| 8 | Dev.to | Mid / developer publishing platform | Platform-published content. **Disclosure: Dev.to is also AgentisLux's launch platform. Scored under the same criteria as every site; the relationship is disclosed for transparency.** |
| 9 | Devpost | Mid / project-listing platform | Hackathon/project content platform. **Disclosure: Devpost is AgentisLux's H0 hackathon submission platform. Scored under the same criteria as every site; disclosed for transparency.** |
| 10 | Daring Fireball | Small / minimal hand-built HTML | The minimal-markup floor (content-side equivalent of a hand-coded blog). Kept for its BUILD TYPE, not its topic: it fills the "trivially readable, no framework" axis that no other candidate covers. The one tech-topic site retained on structural grounds in a deliberately balanced vertical. |

*Variation captured: full size range (major outlet to solo blog); build spread across clean server-rendered, paywall, WordPress, custom CMS, nonprofit, platform, and minimal hand-built; topic balanced 5 tech-adjacent / 5 general to avoid a tech-bubble confound. Feeds H1 (the rendering cliff: does article text live in the HTML?). Two platform sites (Dev.to, Devpost) disclosed as AgentisLux-adjacent.*

### 4. Government / civic (10) — US only

This is the H2 headline vertical (US accessibility law, Section 508 / 36 CFR Part 1194, forces clean semantic markup, which an agent also parses). Selection axis is level of government (federal / federal-service / state / city), because different levels have different resources and CMS maturity, which tests whether the 508 effect holds uniformly or fades below the well-funded federal tier. One site (Recreation.gov) was deliberately included as a modern React-heavy build that might BREAK H2, so the hypothesis gets an honest test, not a softball.

| # | Site | Level / type | Why selected (variation axis) |
|---|------|--------------|-------------------------------|
| 1 | USA.gov | Federal portal | The federal front door. Likely-clean baseline. |
| 2 | IRS | Federal / dense forms + guidance | Heavy government-service content (can an agent navigate tax guidance?). |
| 3 | Census | Federal / data-heavy | Structured data, large content tree. |
| 4 | Congress.gov | Federal / legislative records, has API | Records site AND one of the gov-API cases (gov is the non-SaaS vertical most likely to surface a door-discoverable spec). |
| 5 | Recreation.gov | Federal-service / React-heavy | The deliberate H2 stress test: a modern JS-heavy gov build that might score LOW despite the 508 mandate. Makes the hypothesis honest. |
| 6 | Federal Register | Federal-service / strong structured data + API | Potential high scorer AND a possibly door-discoverable API. Direct contrast to the SaaS GitHub-hosted-spec pattern (a gov site that just publishes one). |
| 7 | California (ca.gov) | State portal | State-level tier. Large state. |
| 8 | Michigan (michigan.gov) | State portal / common gov CMS | State-level, on a representative shared gov CMS (stack generality). |
| 9 | Boston.gov | City / modern redesign | Municipal tier, modern rebuild (tests whether 508 reaches city level in a fresh build). |
| 10 | NYC.gov | City / large municipal | Second city for a within-municipal contrast (large/older vs Boston's modern redesign). Municipal is the most variable tier for 508, so two cities test it better than one. |

*Variation captured: spans every level of US government (federal / federal-service / state / city); includes the React-heavy might-fail-H2 case (Recreation.gov); two API-bearing sites (Congress.gov, Federal Register) that may contrast with the SaaS GitHub pattern; a within-city modern-vs-large contrast (Boston vs NYC). Set leans federal (6 of 10), which is deliberate: federal is where 508 enforcement is strongest, so it is the core of H2, with Recreation.gov as the counterweight. Feeds H2 (government beats indie) and, where APIs surface at the door, the off-domain-spec finding.*

### 5. Indie / builder (10)

**Why an agent is here (the framing this vertical needs):** agents do not transact on personal sites, they READ them. The most common thing an AI agent does on the open web is retrieve and parse content to answer a question, and high-quality technical writing lives on exactly these kinds of indie sites (they get cited by AI assistants constantly). So the test here is content-extractability, not task-completion: when an agent comes to read and cite what a careful human built, can it actually get the content, or does the framework get in the way?

Selection axis is dev-built (hand-coded, minimal, content lives in the HTML) vs design-built (polished, framework-heavy, content may render client-side where a raw-HTML agent sees an empty shell). The vertical leans slightly design-built (6 of 10) on purpose: the design-built sites are where the interesting failures live (beautiful site, agent sees nothing), and that inversion (the prettier site is the LESS agent-readable one) is the on-thesis finding. Feeds H2 (the prediction that indie LOSES to government on readability, with the design-built sites as the likely reason).

| # | Site | Build type | Why selected (variation axis) |
|---|------|-----------|-------------------------------|
| 1 | Dan Luu | Dev-built / extreme minimal | The floor case: near-raw HTML, maximally agent-readable. The "should be trivially extractable" anchor. |
| 2 | Julia Evans | Dev-built / clean static | Static site, lightly designed, simple markup. |
| 3 | Simon Willison | Dev-built / server-rendered dynamic | Django-backed, dynamically server-rendered (different technical profile from static; tests whether dynamic-server-rendered is as readable as static). |
| 4 | Xe Iaso | Dev-built / custom stack | Developer blog on a more elaborate custom stack. Content-first but more machinery. |
| 5 | Brittany Chiang | Design-built / React-Gatsby portfolio | The archetype: a gorgeous client-side-rendered developer portfolio. The classic "agent may see an empty shell" case. |
| 6 | Josh Comeau | Design-built / interactive Next.js | Heavy interactivity and animation, but Next.js can server-render: tests whether the framework actually left content in the HTML. |
| 7 | Lynn Fisher | Design-built / animation-heavy | Extreme visual craft, hand-built but richly designed. The "this is basically an art piece" case. |
| 8 | Maggie Appleton | Design-built / visual digital-garden | Content-rich AND visually rich: tests whether the richness buries the content for an agent. |
| 9 | Gwern | Mixed / dense essays, custom typesetting | Enormous content with elaborate custom tooling. Could read clean or could bury the text: the genuine could-go-either-way case. |
| 10 | Are.na | Design-built / tiny-team service (tool) | The one indie product/tool (not a blog or personal page): visually rich content-organization app, likely heavy client-side. Adds different structure and is a strong "design-forward tool locks the agent out" data point. |

*Variation captured: a roughly even split between dev-built (4) and design-built/mixed (6) so H2 gets a fair fight (all-minimal would inflate indie scores; all-design would deflate them). Dev-built side spans minimal/static/server-rendered/custom-stack; design-built side spans portfolio/interactive-blog/art-piece/digital-garden/tool. Note: the vertical is "indie builds," which includes one tiny-team service (Are.na) alongside nine personal sites, disclosed for honesty about what the vertical contains. Feeds H2 and the content-retrieval (not transaction) reading of agent behavior.*

---

*AI assisted. Human approved. Powered by NLP.*
