# Benchmark Hypotheses

> What we expect to find before the engine scans a single site.
> Pre-registered June 14, 2026. Committed before any scan runs.
> AgentisLux (engine: Perseus Clew).

---

## Why this file exists

Writing the predictions down before there is data is the difference between finding a pattern and forcing one. If the results match these, we predicted them. If they don't, the miss is a finding too. This file is timestamped and committed before the first scan so that nobody, including us, can quietly rewrite the story afterward.

---

## The thesis everything hangs on

The internet was built by humans, for humans. Search crawlers and screen readers got partial accommodation later. Agents are showing up to a house nobody built for them.

We expect most sites to show real gaps in what an agent can read and do, and we expect those gaps to land in predictable places: wherever no human incentive ever paid for machine readability.

That is the engine under every prediction below. A site tends to be readable to an agent by accident, wherever some other pressure (search ranking, accessibility law) already forced clean structure. Everywhere else, it is a blind spot.

**Confidence: pretty sure.** This is the premise, not a guess.

---

## What this is, and isn't

AgentisLux measures something that has no settled standard yet. So read this as a first reading, not a verdict.

I'm not predicting the future of the agentic web, and I'm not claiming to be the authority on it. I'm taking a baseline in a field that is six weeks old and showing my work. Nobody knows yet what agent-readiness looks like across the web, because nobody has measured it this way. That includes me.

That changes how to read the result. If scores spread out, that's a finding. If scores cluster, that's also a finding. A flat result would say sites haven't converged on agent-readiness yet, which is worth knowing on its own. A baseline can't fail by coming back flat. It can only fail by being dishonest about what it found.

I'm starting somewhere so the next measurement has something to compare against. The honest result, whatever shape it takes, is the product.

---

## The predictions

Each one carries a confidence tag (pretty sure / maybe / coin toss) and a line stating what would prove it wrong.

### H1. The rendering cliff dominates

Sites built as heavy client-side JavaScript apps will be hard for retrieval agents to read, no matter what kind of site they are, because those agents fetch raw HTML and do not run JavaScript. This will move scores more than the vertical label does.

**Confidence: pretty sure.** This is the one we would bet money on. A network study of over 500 million crawler fetches found no JavaScript execution, and Vercel's own network data shows none of the major AI crawlers render JavaScript.

**Wrong if:** client-side-heavy sites score about the same as server-rendered ones on whether content lives in the HTML.

### H2. Government beats indie on readability (the likely headline)

Government sites will be easier for agents to read than small indie and startup sites, because federal law (Section 508, codified at 36 CFR Part 1194) forces them to ship clean, semantic, labeled markup, and that same structure is what an agent parses. Regulation made them accidentally agent ready.

**Confidence: maybe, leaning pretty sure.** The legal mechanism is real, which is why this is the headline rather than a footnote.

**Wrong if:** government sites score at or below indie sites on semantic markup and labeling.

### H3. Structured data is a commerce-and-media thing

The hidden machine-readable labels that tell an agent what a page is (JSON-LD, Schema.org) will show up mostly on shopping and news sites, and be close to absent on government and indie sites, because search ranking is the only incentive that ever paid for them.

**Confidence: maybe, leaning pretty sure.**

**Wrong if:** structured data is spread evenly across verticals, or shows up widely where there is no search incentive.

### H4. E-commerce is the widest spread

Online stores will have the biggest internal range of any group: some clean and readable, some unreadable, because the platform mix runs from templated stores to custom JavaScript storefronts.

**Confidence: maybe.**

**Wrong if:** e-commerce scores cluster tightly, or another vertical spreads wider.

### H5. Some sites lock the front gate by accident

More than a couple of sites will block agents at robots.txt, so the agent never reaches the page at all. We expect most of this to be unintentional: a default setting or a blanket rule, not a deliberate decision to keep agents out.

**Confidence: coin toss.** We have no prior read on how common this is in the wild.

**Wrong if:** almost no sites restrict agent user-agents, or the ones that do clearly did it on purpose.

### H6. Scores will be all over the map, because the rules are new

Overall scores will spread wide rather than cluster, because there is no settled standard for agent readiness yet. The first real checklist landed six weeks ago: Google added an experimental Agentic Browsing category to Lighthouse in May 2026, still marked under development. Almost nobody outside developer-tool and AI companies has adopted the emerging signals (llms.txt, WebMCP). When the rules are this new, sites cannot have converged on them.

**Confidence: pretty sure.**

**Wrong if:** scores cluster tightly in one band, which would suggest sites are already converging on agent readiness without trying.

---

## Not a formal prediction: the AI companies

We scan AI companies' own public sites as part of the 50, the same as everyone else. We are not pre-registering a prediction about them. If the companies building the agents turn out to have sites their own agents struggle to read, the data will say so on its own. We let the result speak instead of betting on the irony.

---

## What counts as interesting (the bar)

Decided now, before we see any numbers, so we cannot talk ourselves into a story later. Both outcomes below are findings. They just land at different volumes.

**Loud:** scores spread out, the verticals look visibly different from each other, and at least one result is counterintuitive (government beating startups would do it). Spread plus a surprise is a story that carries the post on its own.

**Quiet:** everything clusters around the same band and no group stands apart. That is not a dud. It is a finding: sites haven't converged on agent-readiness yet, and here is the baseline that says so. The post is quieter, the result still counts, and the next scan has something to measure against.

The one thing we won't do is manufacture variance that isn't there. If the data comes back flat, we report it flat and say so plainly. A baseline only fails by lying about its own shape.

---

## The quiet parts (so the numbers are not oversold)

- Fifty sites, ten per vertical, is illustrative, not a representative sample of the web. It shows patterns and examples. It does not prove statistical significance, and the writeup will say so.
- We score the public surface only. For SaaS that means marketing, docs, and the API spec, not the product behind login. Agents meet your product at public doors long before any login. We scan the doors.
- We score what exists and never penalize absence. A site with no forms is not marked down for forms. Cross-vertical comparison is therefore done category by category, like to like, not on one combined number.
- The scan date is recorded per site so the run is reproducible and the monthly refresh can show movement over time.

---

## H7. The spec is on the doorstep of the wrong house (noted post-curation, not a blind prediction).

We expect the gap between "has a good API spec" and "publishes it where an agent would look" to be near-universal among API-providing companies: strong specs, almost none discoverable at the company's own door, most parked in a GitHub org an agent would not find.

**Honesty note:** unlike H1 through H6, this was not a blind call. We saw the pattern during candidate selection (every confirmed spec in our pool was GitHub-hosted), so we are recording it as an expectation we already have reason to hold, not a prediction made before contact with the data.

**Confidence:** pretty sure, because we have already seen it in the sample, which is exactly why it carries the caveat above.

**Wrong if:** a meaningful share of these companies turn out to expose their spec at a discoverable path on their own domain after all.

---

## What would make us rewrite this file

Nothing, after the timestamp. If a prediction is wrong, it stays here, wrong, next to the result. That is the point.

---

*AI assisted. Human approved. Powered by NLP.*
