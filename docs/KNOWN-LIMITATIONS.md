# Known limitations and deliberate tradeoffs

This is a working product built solo on a hackathon timeline. It is approved-for-demo, not
production-hardened for multi-tenant scale, and I would rather name that plainly than let you find it.
Everything below is a decision I made on purpose, with the reason, so the gaps read as choices rather
than blind spots.

## Architecture and code

**The backend is JavaScript, not TypeScript.** The frontend and infra are TypeScript; the backend
Lambdas are JS with JSDoc. For a system with DynamoDB writes and typed API responses, TS would be the
stronger call. I kept the backend in JS to move fast during the build and lean on the deterministic,
I/O-free scan core plus the test suite for safety. Converting a working backend to TS days before
submission would be scope creep against my own "done beats architecturally pure" rule. It is the first
thing on the path to a 9-out-of-10 repo, and it is a v2.

**Rate limiting is layered, not yet WAF-grade.** There is an API Gateway throttle (5 rps / 10 burst) in
front of the scan endpoint, plus an in-memory per-container limiter as defense-in-depth. The in-memory
piece resets on cold start, so it is burst control, not an authoritative product boundary. For real
multi-tenant abuse control I would add WAF or a token bucket outside ephemeral memory. The gateway
throttle plus Bedrock-cost dedup (15-minute scan cache) covers a public judging window; the rest is v2.

**SSRF validation is authoritative on the backend, lighter on the frontend proxy.** The backend fetcher
does full DNS resolution and private/reserved-IP blocking, redirect-hop validation, HTTPS-only, size and
timeout caps. The frontend `/api/scan` proxy does lighter regex checks for obvious private hosts. The
backend is the authority; the duplicated partial check on the frontend is there for UX, and consolidating
to one shared contract is a v2 cleanup.

**The backend "build" is a copy step.** `cp -r src dist` is not a real build because the JS Lambdas need
no transpilation or bundling. It works; it is just honestly named as what it is.

## Feature scope

**Repo scanning and API-spec upload are gated as Team tier.** The engine can scan API specs (it scanned
the APIs in the 50-site benchmark), but in the live UI only URL scanning is enabled. Repo and spec inputs
are gated, not silently broken.

**Scan results are stored for 24 hours, then auto-deleted.** Anonymous, domain-only, no PII, no IP, no
linkage between scans. The 24h store backs a shareable-result-link feature that is not wired into the UI
yet; the table and TTL exist ahead of the feature.

**The benchmark page serves a static snapshot.** The 50-site benchmark is real and stored in DynamoDB
(written by a scheduled refresh Lambda), but the public benchmark page renders a published static
snapshot rather than querying DynamoDB live. Live per-vertical querying is a v2.

## Accessibility (yes, on the product whose thesis is readability)

**The landing page scores 95, not 100, on Lighthouse accessibility.** Some small uppercase label text in
the design does not meet contrast thresholds yet; that is the main gap, and it is a tradeoff against the
visual language I will revisit. The post-scan results view also has heading-hierarchy work left (it does
not lead with an h1). Both are tracked here rather than hidden, which is the whole point of the product.

## The path to production-hard (v2)

Convert the backend to TypeScript with shared response and result types. Add Prettier with a
format-check in CI. Make the security audit blocking on high and critical. Add WAF or gateway-level rate
limiting as the real boundary. Add request and response schema validation. Add contract tests between the
frontend proxy and the backend handler. Add release tags, a changelog, and deployment provenance. Fix the
results-view heading hierarchy and the label contrast.

None of these are bugs. They are the difference between a strong hackathon build and a production-hardened
multi-tenant service, and I would rather ship the working thing and name the gap than claim a maturity I
have not earned yet.
