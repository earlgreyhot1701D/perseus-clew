# Self-scan: the before

> Agentis Lux scanned its own site before we fixed anything. Here is what it found.
> Captured June 19, 2026, on the live engine (Perseus Clew, methodology 1.1.1).
> This is the "before" half of a before/after. The "after" lands once we close the gaps.

---

## Why we did this

A scanner that tells other people what AI agents can't read on their sites should be able to take its own scan. So we pointed Agentis Lux at its own production site, before doing any of the cleanup we already knew was coming, and saved the result. The honest version of dogfooding is the one where you publish the score even when it isn't flattering.

It scored itself **70 out of 100. "Partially Ready."**

That is not a great score, and that is the point. We captured it on purpose, before fixing a thing, so the fixes can be measured against it.

## What the agent sees

The AI layer summed it up in one line:

> "An agent visiting perseus-clew.vercel.app can read page content and interact with styled elements, but cannot follow 10 placeholder links or identify page type from missing structured data."

## The score, category by category

| Category | Score | What it means |
|----------|-------|---------------|
| Semantic HTML | 21/25 | Can an agent tell buttons from text, lists from loose elements |
| Form accessibility | 15/20 | Can an agent tell what each field expects |
| ARIA | 10/15 | Can an agent read dynamic widget state |
| Structured data | 3/15 | Can an agent identify the page type from machine-readable declarations |
| Content in HTML | 15/15 | Can an agent read the content without running JavaScript |
| Link & navigation | 6/10 | Can an agent move through the site predictably |

The weak spots are **structured data (3/15)** and **link & navigation (6/10)**. The tool did not guess at that. It named exactly what was missing.

## What it found (the findings drive the fixes)

These are the observations, in the tool's own words. No judgment, no prescriptions, just what an agent can and cannot do.

**Structured data**
- No JSON-LD structured data is present on this page. Agents parsing structured declarations to identify the page type cannot determine what this page represents.
- 1 Open Graph meta tag (og:title, og:description, og:type, or og:image) is absent. Agents generating link previews or summaries of this page must infer this value from the full HTML.
- 1 Twitter Card meta tag is absent. Agents generating card previews for this page on social platforms have incomplete metadata to work with.
- No canonical URL is declared on this page. Agents determining the authoritative URL for this content have no declared value to use.

**Link and navigation**
- 10 anchor elements use placeholder hrefs (such as "#" or "javascript:void(0)"). Agents following these links for navigation arrive at no meaningful destination.
- No skip-to-content link is present near the top of the page. Agents and keyboard users bypassing navigation to reach main content have no shortcut.

**Other findings**
- 1 group of repeated sibling elements appear to be lists but are not wrapped in ul or ol with li elements. Agents parsing list structures cannot identify these as lists.
- 1 input field that accepts a specific data type (email, phone, URL) uses type="text" instead of the matching input type. Agents parsing input expectations by type cannot distinguish this field from generic text fields.
- 1 element with a dynamic-content class name (e.g. toast, notification) has no aria-live attribute or live-region role. Agents monitoring page updates cannot detect when this region changes.

## The agent simulation agreed

Beyond the deterministic checks, the AI simulation layer tried three tasks as an agent would, and the navigation result lined up with the findings above.

- **SIM-FE-CTA**: success. Primary CTA is a semantic button element with text 'Observe this site' located in the scan form, designed to submit the URL input.
- **SIM-FE-PURPOSE**: success. Agent can determine this is a website scanning tool for AI agent readiness assessment, with metadata declaring it as a website type product offering deterministic scans.
- **SIM-FE-NAV**: partial. Navigation structure exists with a semantic nav element and anchor links, but 10 links use placeholder hrefs that lead nowhere, preventing full site traversal.

The navigation task came back "partial" and pointed at the same placeholder-link problem the deterministic checks flagged. Two layers of the engine, independently, found the same gap.

## What's honest about this

The site was not bare. It already had a meta description and a couple of Open Graph tags, which is why the simulation could still figure out what the page is for. What it was missing were the machine-readable pieces that take the guesswork out of it: JSON-LD, a complete Open Graph set including an image, a canonical URL, a Twitter card. That is a pretty typical "before." Most sites are not nothing. They are mostly-there with the agent-specific pieces missing.

## What happens next

We fix the gaps the tool named. Then we run the same scan again and publish the after, right next to this. If the score does not move, that is a finding too, it would mean the fixes did not land. But we expect structured data to climb and the placeholder links to resolve.

The raw scan result is in the repo (`docs/self-scan/self-scan-before-REAL-2026-06-19.json`) so you can check the number against the findings yourself.

---

*AI assisted. Human approved. Powered by NLP.*
