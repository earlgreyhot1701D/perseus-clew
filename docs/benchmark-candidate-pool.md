# Benchmark Candidate Pool: Agent-Readability Study

Compilation only. Not ranked, not scored, not a final set. Over-gathered so you can pick the final 10 per vertical yourself.

**How to read the confidence notes.** Anything I could not verify by fetching (platform, rough size, dev-vs-design) is a best guess and labeled as such. For e-commerce platform detection, run the candidates you choose through BuiltWith or Wappalyzer before locking them. The one thing I actually fetched and verified is the SaaS API spec column.

**SaaS spec method.** CONFIRMED means I fetched a URL that returned real OpenAPI/Swagger content (a version key plus paths/components shape). DOCS-ONLY means human API docs exist but I did not fetch a machine-readable spec file. NONE means no public API docs found. Two specs (DigitalOcean, GitLab) exist but their files were too large to fetch-confirm in this run, so I did not mark them CONFIRMED. I held the line on this: better an honest DOCS-ONLY than a guessed CONFIRMED.

---

## 1. E-commerce

| Site name | URL | Size | Type note (platform/custom, confidence) | One-line note on fit |
|---|---|---|---|---|
| Amazon | https://www.amazon.com | large | Custom (high) | The reference case for an agent-hostile giant. |
| Walmart | https://www.walmart.com | large | Custom (high) | Large retailer, heavy client-side rendering. |
| Target | https://www.target.com | large | Custom (high) | Large retailer, React-heavy storefront. |
| Best Buy | https://www.bestbuy.com | large | Custom (high) | Electronics retailer, known anti-bot measures. |
| Etsy | https://www.etsy.com | large | Custom (high) | Marketplace, structured product pages. |
| Wayfair | https://www.wayfair.com | large | Custom (high) | Furniture retailer, large catalog. |
| McMaster-Carr | https://www.mcmaster.com | large | Custom (high) | Industrial supply, famously fast server-rendered pages. Interesting contrast case. |
| Newegg | https://www.newegg.com | mid-large | Custom (med) | Electronics, older stack. |
| Bombas | https://bombas.com | mid | Shopify (med-high) | DTC apparel, classic Shopify Plus profile. |
| Allbirds | https://www.allbirds.com | mid | Shopify (med-high) | DTC footwear, known Shopify Plus. |
| Ruggable | https://ruggable.com | mid | Shopify (med) | DTC home goods. |
| Olipop | https://drinkolipop.com | mid | Shopify (med) | DTC beverage brand. |
| Brooklinen | https://www.brooklinen.com | mid | Shopify (med) | DTC bedding. |
| Death Wish Coffee | https://www.deathwishcoffee.com | small-mid | Shopify (med) | Indie-rooted coffee brand, now mid-size. |
| Topo Designs | https://topodesigns.com | small-mid | Shopify (med) | Outdoor gear, smaller catalog. |
| Misen | https://misen.com | small | Shopify (med) | Small DTC kitchenware. |
| Dame | https://www.dame.com | small | Shopify (low-med) | Small indie wellness brand. |
| Tom Bihn | https://www.tombihn.com | small | Custom (low-med) | Long-running indie bag maker, possibly custom cart. Flag: verify platform. |
| The Vermont Country Store | https://www.vermontcountrystore.com | small-mid | Custom/legacy (low) | Older catalog retailer, stack uncertain. Flag: verify. |

Flag: Best Buy and Amazon run aggressive bot mitigation. They meet the universal criteria (public, real, English, live) but may block automated fetches, which is arguably the point of including them. Note that for your study.

---

## 2. SaaS / Developer Tools

API spec column is verified by fetch. Everything else (size) is a best guess.

| Site name | URL | Size | API spec status |
|---|---|---|---|
| Stripe | https://stripe.com | large | CONFIRMED. https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json (official spec, OpenAPI shape verified; file is multi-MB) |
| GitHub | https://github.com | large | CONFIRMED. https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json (openapi 3.0.3, paths present) |
| Twilio | https://www.twilio.com | large | CONFIRMED. https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json (official OAI, components/securitySchemes verified) |
| Slack | https://slack.com | large | CONFIRMED. https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json (paths present) |
| Box | https://www.box.com | mid-large | CONFIRMED. https://raw.githubusercontent.com/box/box-openapi/main/openapi.json (openapi 3.0.2, paths present) |
| Square | https://squareup.com | large | CONFIRMED. https://raw.githubusercontent.com/square/connect-api-specification/master/api.json (openapi 3.0.0) |
| PagerDuty | https://www.pagerduty.com | mid | CONFIRMED. https://raw.githubusercontent.com/PagerDuty/api-schema/main/reference/REST/openapiv3.json (openapi 3.0.2) |
| Asana | https://asana.com | mid-large | CONFIRMED. https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml (openapi 3.0.0, components present) |
| Vercel | https://vercel.com | mid-large | CONFIRMED. https://openapi.vercel.sh/ (openapi 3.0.3, on-domain, paths present) |
| SendGrid (Twilio) | https://sendgrid.com | mid-large | CONFIRMED. https://raw.githubusercontent.com/twilio/sendgrid-oai/main/spec/json/tsg_mail_v3.json (openapi 3.1.0, paths present) |
| OpenAI | https://openai.com | large | CONFIRMED. https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml (openapi 3.0.0) |
| DigitalOcean | https://www.digitalocean.com | mid-large | DOCS-ONLY (spec exists at https://api-engineering.nyc3.cdn.digitaloceanspaces.com/spec-ci/DigitalOcean-public.v2.yaml but file too large to fetch-confirm this run; treat as unverified) |
| GitLab | https://about.gitlab.com | large | DOCS-ONLY (spec exists at https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/api/openapi/openapi.yaml but fetch timed out; treat as unverified). Docs: https://docs.gitlab.com/ee/api/ |
| Notion | https://www.notion.so | large | DOCS-ONLY. https://developers.notion.com/reference (no official OpenAPI file found; not exhaustively probed) |
| Linear | https://linear.app | mid | DOCS-ONLY. https://developers.linear.app (GraphQL API, no REST OpenAPI by design) |
| Discord | https://discord.com | large | DOCS-ONLY. https://discord.com/developers/docs (no official OpenAPI spec; community specs exist but unofficial) |
| Spotify | https://www.spotify.com | large | DOCS-ONLY. https://developer.spotify.com/documentation/web-api (no single official spec file found) |
| Plausible Analytics | https://plausible.io | small-mid | DOCS-ONLY. https://plausible.io/docs/stats-api (lightweight stats API, no spec file found; not exhaustively probed) |
| Bear Blog | https://bearblog.dev | small | NONE (best guess. Indie blogging tool, no developer API surfaced. Flag: verify before relying on NONE) |
| Buttondown | https://buttondown.com | small | DOCS-ONLY. https://docs.buttondown.com/api (indie newsletter tool with API docs; spec file not confirmed) |

Note on CONFIRMED URLs: several are hosted on the vendor's official GitHub org rather than the marketing domain. That is where these companies publish their canonical machine-readable spec, and each is linked from their developer docs. Vercel is the cleanest on-domain case (openapi.vercel.sh). If your study requires the spec to live on the primary domain, flag the GitHub-hosted ones and decide your rule.

---

## 3. Content / Media

| Site name | URL | Size | One-line note on fit |
|---|---|---|---|
| The New York Times | https://www.nytimes.com | large | Major outlet. Flag: soft paywall, home page public. |
| The Guardian | https://www.theguardian.com | large | Major outlet, no hard paywall, also has a public content API. |
| BBC | https://www.bbc.com | large | Major outlet, server-rendered. |
| Reuters | https://www.reuters.com | large | Wire service. Flag: known anti-bot/Cloudflare. |
| NPR | https://www.npr.org | large | Public radio, accessible pages. |
| Vox | https://www.vox.com | mid-large | Explainer-style news on the Concert/Chorus stack. |
| The Verge | https://www.theverge.com | mid-large | Tech media, redesigned custom CMS. |
| Ars Technica | https://arstechnica.com | mid | Tech publication, text-dense. |
| TechCrunch | https://techcrunch.com | mid | Startup news on WordPress VIP (best guess, med). |
| Wired | https://www.wired.com | mid | Tech/culture. Flag: metered paywall. |
| The Atlantic | https://www.theatlantic.com | mid | Long-form. Flag: paywall. |
| ProPublica | https://www.propublica.org | mid | Nonprofit investigative newsroom. |
| 404 Media | https://www.404media.co | small | Independent tech journalism, Ghost platform (best guess, med). |
| Defector | https://defector.com | small | Worker-owned sports/culture blog. |
| Stratechery | https://stratechery.com | small/indie | Solo analyst publication. Flag: paywalled archive, public posts exist. |
| Daring Fireball | https://daringfireball.net | small/indie | Long-running solo tech blog, very minimal HTML. |
| Kottke | https://kottke.org | small/indie | Veteran independent blog. |
| MDN Web Docs | https://developer.mozilla.org | large | Documentation site, heavily structured, server-rendered. |
| Smashing Magazine | https://www.smashingmagazine.com | mid | Web-dev publication. |
| A List Apart | https://alistapart.com | small | Niche web-craft publication. |

Flag: NYT, Wired, Atlantic, and Stratechery have paywalls. Their main pages are public so they meet the criteria, but a paywall changes what an agent can parse. Worth keeping a few in the pool precisely to test that.

---

## 4. Government / Civic (US only)

| Site name | URL | Size | One-line note on fit |
|---|---|---|---|
| USA.gov | https://www.usa.gov | large (federal) | Top-level federal portal. |
| WhiteHouse.gov | https://www.whitehouse.gov | large (federal) | Executive branch site. |
| IRS | https://www.irs.gov | large (federal) | Tax agency, dense forms and guidance. |
| NASA | https://www.nasa.gov | large (federal) | Agency site, media-heavy. |
| Census Bureau | https://www.census.gov | large (federal) | Data-heavy federal agency. |
| CDC | https://www.cdc.gov | large (federal) | Public-health agency, large content tree. |
| Congress.gov | https://www.congress.gov | large (federal) | Legislative records, also has an API. |
| SEC | https://www.sec.gov | large (federal) | Filings and EDGAR. |
| Federal Register | https://www.federalregister.gov | mid (federal/agency) | Daily rules, strong structured data and API. |
| Data.gov | https://www.data.gov | mid (federal) | Open-data catalog. |
| USAJOBS | https://www.usajobs.gov | mid (federal service) | Federal hiring portal, has a public API. |
| Recreation.gov | https://www.recreation.gov | mid (federal service) | Bookings for federal lands, React-heavy. |
| Weather.gov (NWS) | https://www.weather.gov | mid (federal agency) | National Weather Service, public API.gov backend. |
| State of California | https://www.ca.gov | mid (state) | State portal. |
| Texas.gov | https://www.texas.gov | mid (state) | State portal. |
| State of Michigan | https://www.michigan.gov | mid (state) | State portal, common gov CMS. |
| NYC.gov | https://www.nyc.gov | mid (city) | Large municipal site. |
| City of Boston | https://www.boston.gov | small-mid (city) | Municipal site, modern redesign. |
| Social Security Administration | https://www.ssa.gov | large (federal) | Benefits agency, public guidance pages. |
| Login.gov | https://www.login.gov | small-mid (federal service) | Shared sign-in service, marketing/info pages public. |

All meet the universal criteria cleanly. Public, real, English, US, live.

---

## 5. Indie / Builder

Dev-built means hand-coded, simple, minimal framework. Design-built means polished, framework-heavy, visually crafted. Both are best guesses, confidence noted.

| Site name | URL | Size | Type note (dev vs design, confidence) | One-line note on fit |
|---|---|---|---|---|
| Dan Luu | https://danluu.com | small | Dev-built (high) | Famously minimal raw HTML blog. Strong baseline case. |
| Julia Evans | https://jvns.ca | small | Dev-built (high) | Programmer blog, static site, simple markup. |
| Simon Willison | https://simonwillison.net | small | Dev-built (high) | Django-backed personal blog, server-rendered. |
| Tom MacWright | https://macwright.com | small | Dev-built (high) | Plain static personal site. |
| Drew DeVault | https://drewdevault.com | small | Dev-built (high) | Minimal hand-built blog. |
| Xe Iaso | https://xeiaso.net | small | Dev-built (med-high) | Developer blog, custom stack. |
| Brittany Chiang | https://brittanychiang.com | small | Design-built (high) | Polished React/Gatsby developer portfolio. |
| Josh Comeau | https://www.joshwcomeau.com | small | Design-built (high) | Highly interactive Next.js blog. |
| Lynn Fisher | https://lynnandtonic.com | small | Design-built (high) | Hand-crafted, animation-heavy personal site. |
| Maggie Appleton | https://maggieappleton.com | small | Design-built (high) | Visually rich digital-garden site. |
| Gwern | https://gwern.net | small-mid | Mixed (med) | Dense essays, custom typesetting and tooling. |
| Pinboard | https://pinboard.in | small | Dev-built (high) | Solo-run bookmarking service, spartan HTML. |
| Marginalia Search | https://search.marginalia.nu | small | Dev-built (high) | Indie search engine, plain interface. |
| Bear Blog | https://bearblog.dev | small | Dev-built (med-high) | Minimal indie blogging platform. |
| omg.lol | https://omg.lol | small | Design-built (med) | Playful indie identity/profile service. |
| Neocities | https://neocities.org | small-mid | Design-built (med) | Indie web hosting community. |
| Are.na | https://www.are.na | small-mid | Design-built (med-high) | Small-team visual research tool. |
| NetNewsWire | https://netnewswire.com | small | Dev-built (med) | Open-source RSS reader project site. |
| Kicks Condor | https://www.kickscondor.com | small | Design-built (med) | Indie-web personal site, experimental layout. |
| Robb Knight | https://rknight.me | small | Dev-built (med) | Indie developer personal site and tools. |

Flag: a few of these (Pinboard, Marginalia, omg.lol, Bear Blog, Are.na) are services rather than pure personal sites. I included them because they are tiny-team indie builds, which fits the spirit of the vertical. Move them out if you want this vertical to be strictly personal pages.

---

*Compiled as a candidate pool. Final selection is yours.*
