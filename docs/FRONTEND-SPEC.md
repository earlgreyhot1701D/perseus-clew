# Frontend Spec: React App, Routes, Components, State

> The public-facing Agentis Lux web application.
> Translates the locked visual language (agentislux-landing.html, agentislux-app.html) into a React app.

**Status:** v2, May 27, 2026. v1 defined the React/Vite frontend on CloudFront + S3. v2 updates the decision-level content for Path B: Next.js on Vercel with API routes that do real work, the result hero leading the results view, two-layer finding text, the 24h shareable-link lifetime, and the signed-in auth stub. **Framework-detail conversion deferred:** filenames, routing, state idioms, and Vite config below remain in React form. Read them as "the frontend" pending the build-time conversion to Next.js App Router (the conversion happens against real components, not reconstructed in this doc from memory). The decision-level content here is current.

**Naming:** The public product is **Agentis Lux**. Every user-facing string in the app references Agentis Lux. Internal file names, component names, and code comments may reference Perseus Clew where they describe the engine (e.g., "fetches results from the Perseus Clew scan Lambda"). All marketing, UI copy, and error messages use Agentis Lux.

**Scope:** The React app that serves agentislux.io. Covers app architecture, routing, core components, state management, API integration, error handling, report download, social card generation, discoverability markup, WCAG 2.1 AA requirements, and the self-scanning mechanism.

**Not in this doc:** Backend Lambda details (see BACKEND-SHARED, BACKEND-FRONTEND-CHECKS, BACKEND-API-CHECKS), infrastructure and deployment (see BUILD-PLAN), scoring methodology (see SCORING.md).

**Visual references:**
- `agentislux-landing.html`: the marketing landing page, locked design direction
- `agentislux-app.html`: six app views (scan input, scanning, results dashboard, finding detail, error, social card)

Both mockups are design artifacts. This spec translates them into component architecture.

---

## How to Review This Doc

You are the non-engineer builder. Here's how to validate this without reading every component contract.

**Fast path (10 minutes):**
1. Read the "App Architecture" section to understand the file layout and the routing model.
2. Read the "Route Flow" section to understand how a user moves through the app.
3. Read the "Components: User-Facing Behavior" section for each component's plain-English description.
4. Read "Error Handling Strategy" in full. Every error state matters.
5. Skim the WCAG section to confirm accessibility is baked in.

**Deep path (40-50 minutes):**
Read top to bottom. Each component has a contract (props, state, events) but the plain-English summary tells you what the component does without reading code.

**What to flag back:**
- Any UI behavior that contradicts the mockups
- Any route transition that feels wrong
- Any missing state the user would expect (e.g., "where does the back button go from here?")
- Any error state that produces a worse user experience than silence

---

## App Architecture

### Tech stack

- **Framework:** React 18 with hooks
- **Router:** React Router v6
- **Build tool:** Vite (fast dev, fast production builds, ESM-native, matches Vitest)
- **Styling:** CSS modules per component (no Tailwind, no CSS-in-JS runtime). Design tokens in a shared `tokens.css` imported at app root. Matches the structure in the mockup HTML files.
- **State management:** React Context + useReducer for scan state. No Redux. No Zustand. The app has one global state concern (current scan) and otherwise uses local component state.
- **HTTP:** Native `fetch` with a thin wrapper in `api-client.js` that adds error handling, request timing, and structured error shapes.
- **Testing:** Vitest + React Testing Library for unit and integration tests.
- **Images:** All SVG decorations inlined. Raster images (if any) served from CloudFront with explicit width/height attributes to prevent CLS.

### File structure

```
/frontend
â”œâ”€â”€ index.html                  # Entry point, includes meta, OG, JSON-LD
â”œâ”€â”€ vite.config.js
â”œâ”€â”€ package.json
â”œâ”€â”€ public/
â”‚   â”œâ”€â”€ robots.txt              # Self-scanning discoverability
â”‚   â”œâ”€â”€ sitemap.xml             # Generated at build time
â”‚   â””â”€â”€ fonts/                  # Self-hosted fonts (Archivo, Instrument Serif, JetBrains Mono)
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ main.jsx                # React root, Router setup, Context providers
â”‚   â”œâ”€â”€ App.jsx                 # Layout shell, route definitions
â”‚   â”œâ”€â”€ styles/
â”‚   â”‚   â”œâ”€â”€ tokens.css          # Design tokens (colors, fonts, spacing)
â”‚   â”‚   â”œâ”€â”€ reset.css           # CSS reset + base element styles
â”‚   â”‚   â””â”€â”€ globals.css         # App-level global styles
â”‚   â”œâ”€â”€ routes/
â”‚   â”‚   â”œâ”€â”€ LandingRoute.jsx    # /
â”‚   â”‚   â”œâ”€â”€ ScanInputRoute.jsx  # /scan
â”‚   â”‚   â”œâ”€â”€ ScanningRoute.jsx   # /scan/:id/loading
â”‚   â”‚   â”œâ”€â”€ ResultsRoute.jsx    # /scan/:id
â”‚   â”‚   â”œâ”€â”€ FindingDetailRoute.jsx  # /scan/:id/findings/:findingId
â”‚   â”‚   â”œâ”€â”€ ErrorRoute.jsx      # /scan/:id/error
â”‚   â”‚   â”œâ”€â”€ MethodologyRoute.jsx # /methodology (renders SCORING.md)
â”‚   â”‚   â”œâ”€â”€ BenchmarkRoute.jsx  # /benchmark
â”‚   â”‚   â”œâ”€â”€ AboutRoute.jsx      # /about
â”‚   â”‚   â””â”€â”€ NotFoundRoute.jsx   # 404 fallback
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ shell/
â”‚   â”‚   â”‚   â”œâ”€â”€ AppNav.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ AppFooter.jsx
â”‚   â”‚   â”‚   â””â”€â”€ ArcDecoration.jsx   # Reusable SVG arc pattern
â”‚   â”‚   â”œâ”€â”€ scan/
â”‚   â”‚   â”‚   â”œâ”€â”€ ScanInput.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ InputTypeTabs.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ ScanProgress.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ ScoreRing.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ CategoryGrid.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ CategoryCell.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Layer2Tasks.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Layer2Task.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ FindingsList.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ FindingItem.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ FindingDetail.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ SeverityPill.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ RatingBadge.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ ResultsHeader.jsx
â”‚   â”‚   â”‚   â””â”€â”€ ResultsFooter.jsx
â”‚   â”‚   â”œâ”€â”€ social/
â”‚   â”‚   â”‚   â”œâ”€â”€ SocialCard.jsx      # The visual card component
â”‚   â”‚   â”‚   â””â”€â”€ SocialCardExport.jsx # Wrapper with download button
â”‚   â”‚   â”œâ”€â”€ error/
â”‚   â”‚   â”‚   â”œâ”€â”€ ErrorView.jsx
â”‚   â”‚   â”‚   â””â”€â”€ ErrorIcon.jsx
â”‚   â”‚   â””â”€â”€ common/
â”‚   â”‚       â”œâ”€â”€ Button.jsx
â”‚   â”‚       â”œâ”€â”€ CodeBlock.jsx
â”‚   â”‚       â””â”€â”€ LoadingDots.jsx
â”‚   â”œâ”€â”€ state/
â”‚   â”‚   â”œâ”€â”€ ScanContext.jsx     # Current scan state (React Context + useReducer)
â”‚   â”‚   â””â”€â”€ scanReducer.js
â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”œâ”€â”€ api-client.js       # fetch wrapper with error handling
â”‚   â”‚   â”œâ”€â”€ scan-storage.js     # localStorage for draft scans only (no results stored)
â”‚   â”‚   â”œâ”€â”€ social-card.js      # Social card export to PNG via html2canvas
â”‚   â”‚   â”œâ”€â”€ report-export.js    # Report download (HTML or PDF)
â”‚   â”‚   â””â”€â”€ analytics.js        # Plausible wrapper, no cookies, server-side only
â”‚   â””â”€â”€ tests/
â”‚       â”œâ”€â”€ routes/              # Route-level integration tests
â”‚       â”œâ”€â”€ components/          # Component tests
â”‚       â””â”€â”€ fixtures/            # Mock scan responses for testing
```

### Why this structure

- **Routes and components separated.** Routes compose components, components do one thing. Matches build principle 7 (one file, one responsibility).
- **Shell components isolated.** Nav, footer, arc decoration are used across routes and live together.
- **Scan components grouped.** Most of the domain logic. Separated from shell so refactors don't cross boundaries.
- **`lib/` for non-React utilities.** Pure functions, testable in isolation.
- **`state/` for context + reducer.** Global state concerns in one place. Adding a new state concern means adding a new context, not mutating the existing one.

---

## Route Flow

The app is a series of screens, not a single scrollable page. Each route is a distinct view. Browser back button works at every step.

### User journey

```
/                          (Landing page. Marketing, not the app)
  â†“  "Scan your site" CTA
/scan                      (Scan Input View. URL / repo / spec upload)
  â†“  submit
/scan/:id/loading          (Scanning State. Progress indicator)
  â†“  success
/scan/:id                  (Results Dashboard. Main report view)
  â†“  click finding
/scan/:id/findings/:fid    (Finding Detail. Expanded view of one finding)
  â†‘  back button
/scan/:id                  (Results Dashboard)

Alternative paths from /scan/:id/loading:
  â†“  failure
/scan/:id/error            (Error View. Site blocked, timeout, etc.)
  â†‘  "Try another URL"
/scan                      (Scan Input View)
```

### Route responsibilities

**`/` (LandingRoute)**
Marketing page. Hero, manifesto, six categories, editorial thesis, report preview, call-to-action to `/scan`. Matches `agentislux-landing.html` exactly. Not part of the app's scanning flow.

**`/scan` (ScanInputRoute)**
Scan input view. Three input tabs (URL, GitHub repo, API spec upload). Validation, submit. On submit, calls scan API, receives a scan ID, navigates to `/scan/:id/loading`.

**`/scan/:id/loading` (ScanningRoute)**
Scanning state. Polls `/api/scans/:id` until status is `complete`, `error`, or `timeout`. Shows progress steps (fetch â†’ parse â†’ Layer 1 â†’ Layer 2 â†’ assemble). On success, navigates to `/scan/:id`. On error, navigates to `/scan/:id/error`.

**`/scan/:id` (ResultsRoute)**
Results dashboard. Fetches full scan result. The **result hero leads** (score 0-100 + rating label + AI-written agent narrative line, as one unit; see ResultHero component below). Below the hero: category breakdown, Layer 2 narratives, findings list with two-layer text, export actions. Scroll-based interaction within the route.

**`/scan/:id/findings/:findingId` (FindingDetailRoute)**
Finding detail view. Opened by clicking a finding on the dashboard. Breadcrumb back to results. Browser back button also works. This is a separate route (not a modal) so it has a URL, can be shared, and bookmarked.

**`/scan/:id/error` (ErrorRoute)**
Error view. Explains what went wrong and provides next-step actions. Replaces the loading/results state when scan fails.

**`/history` (HistoryRoute, signed-in stub)**
Scan history for the signed-in user. Renders the user's account-linked scan list. Empty state: "Run a scan to populate." NOT a trend chart (paid tier). Anonymous users redirected to `/scan` with the sign-up CTA visible.

**`/sign-in` (SignInRoute, signed-in stub)**
Email / magic-link sign-in. Auth provider TBD (Auth.js / Clerk / other; see checklist). Single field, single button, single-purpose.

**`/methodology` (MethodologyRoute)**
Public methodology page. Renders SCORING.md content. Linked from nav and from scan results.

**`/benchmark` (BenchmarkRoute)**
Benchmark comparison page. At MVP, shows the 50-site summary and category-level reference statistics. Not a leaderboard.

**`/about` (AboutRoute)**
About Agentis Lux, Perseus Clew engine, the Clew suite, attribution, the Supernote customer philosophy. Includes the measurement table (what we track, why, what we don't).

**`/*` (NotFoundRoute)**
Catches any unmatched route. Offers return to landing or scan.

### Scan ID model

Every scan is assigned an opaque `resultId` (UUID) by the backend when the scan completes. The `resultId` is the path parameter for `/scan/:id`. This means:

- Users can bookmark a scan result or share the URL with teammates for **24 hours** (the ScanResults TTL).
- Refreshing the page on the results view re-fetches by ID (no state loss).
- The back button flows work cleanly through browser history.

**After the 24-hour ScanResults TTL expires, the resultId returns a 404 from the backend.** The ResultsRoute handles this by navigating to the NotFoundRoute with the message: "This scan has expired after 24 hours. Anonymous scan results are stored briefly to power shareable links, then deleted. To see these results again, run the scan again." Signed-in users can also save scans to their history (Block 1L2 stub) to retain them past 24 hours.

Note: the 15-minute `ScanCache` (separate table, see ARCHITECTURE.md) is invisible to the frontend. It only affects whether a freshly-submitted scan returns from cache or runs a new check pass; the user never sees a "cached" state.

---

## Design Source of Truth

The visual identity is locked and captured in working artifacts, not in a separate design document. There is no `DESIGN.md` and there should not be.

**Where the design lives:**
- **The mockups** (`mockups/agentislux-landing.html`, `mockups/agentislux-app.html`) are the canonical visual reference. Lance Wyman-inspired: cream, deep teal, sienna, ochre; Archivo Black + Instrument Serif italic + JetBrains Mono; concentric arc motifs. Each component description below traces back to a treatment in these files.
- **The verdict hero study** (`agentislux-verdict-hero.html`, the result-hero block built in this session) is the canonical reference for the ResultHero component specifically. Pixel-faithful to the Wyman language and includes the AI-written narrative line treatment.
- **Design tokens** live in `frontend/src/styles/tokens.css` (or framework equivalent at build time), extracted from the mockups during Block 0. One file with the locked palette, type stack, spacing scale, and the concentric-arc SVG snippet. Every component imports from this file. Kiro never eyeballs hex codes from a mockup; it reads them from tokens. This is the single source of truth for design *values*.

The locked palette: cream `#f1ebdc`, cream-2 `#ebe3ce`, teal `#0f3d42`, teal-mid `#1b6d74`, sienna `#e85416`, sienna-deep `#d24912`, ochre `#d4a43c`, muted `#8a9a9d`, ink `#5a5548`. The locked type stack: Archivo (body), Archivo Black (display), Instrument Serif (italic accents and the hero number), JetBrains Mono (labels and metadata).

When a component description below references a visual treatment ("Instrument Serif italic," "ochre rating badge," "sienna accent"), the values come from tokens.css. The mockup HTML is how to verify the result by eye; tokens.css is how Kiro implements it correctly.

---

## Components: User-Facing Behavior

This section describes what each component does from the user's perspective, not the props contract. Engineering contracts are in the "Component Contracts" section below for Kiro.

### Shell components

**`AppNav`**
The top navigation bar. Agentis Lux wordmark on the left (links to `/`), nav links on the right (Scan, Methodology, Benchmark, About). Current route highlighted with orange underline. Matches the nav in all app views of the mockup.

**`AppFooter`**
Bottom footer. Appears on marketing routes (`/`, `/about`, `/methodology`) but NOT on app flow routes (`/scan/*`) because those have their own footer (results footer with download/share actions).

**`ArcDecoration`**
Reusable SVG concentric-arc component. Takes `size`, `color`, `opacity`, and `position` props. Used decoratively across multiple views. Matches the Wyman-inspired signature pattern.

### Scan flow components

**`ScanInput`**
The input field and scan button, with tab selector for URL / repo / spec. Validates input client-side before submit (URL format, repo format `owner/repo`, spec file type and size). Disables the submit button during validation. Shows inline error if validation fails before even trying to submit.

**`InputTypeTabs`**
Three tabs with active state. Switching tabs clears the input field and changes the validation rules and placeholder text.

**`ScanProgress`**
Five-step progress indicator. States: done (teal), active (orange, cream-warm background), pending (faded). Polls backend every 1.5 seconds while the scan is active. Updates step state as the backend reports progress. Has a timeout at 30 seconds. If still not complete, navigates to error view.

**`ScoreRing`**
**`ResultHero`** (the demo-critical component, leads the results view)
The single most important component in the product. Built first in Block 0 with mock data, made demo-perfect before any real scan wires to it. Reads from `scoredViews.rawHtml` in the scan response (render-mode guardrail; future modes can join). Shows as one unit:
- Big 0-100 score (Instrument Serif italic, large)
- Rating label (`Agent-Ready` / `Partially Ready` / `Not Yet Readable`) computed from SCORING.md band cutoffs (80 / 50 / 0)
- One plain-language agent narrative line (`heroLine.text`), tagged "AI written" when `heroLine.source === 'ai'` and silently the same shape when `source === 'template'`
- Action buttons: View findings Â· Share result Â· Download report
The hero is never absent and never broken: if Bedrock fails on the hero line, the backend already substituted a deterministic template, so the frontend just renders `heroLine.text`. The frontend does not need a fallback path of its own.

**`ScoreRing`** (subordinate to the hero, used in cards and the social card)
The circular score ring with number in the center. Takes `score` (0-100), `maxScore` (always 100 for now), and `size` (small, medium, large). Orange fill proportional to score. The number is display-font sized. NOT the top-level result display; that role belongs to ResultHero.

**`RatingBadge`**
Text badge showing the rating. Three variants: "Agent-Ready" (teal-mid border), "Partially Ready" (ochre border), "Not Yet Readable" (orange border). Never "bad" or "failing". Rating names come from SCORING.md.

**`CategoryGrid`**
Six-cell grid (2 columns Ã— 3 rows on desktop, 1 column on mobile). Each cell is a `CategoryCell`.

**`CategoryCell`**
One category's display. Category number (mono label), category name (display font), bar indicator with fill proportional to score, score text (e.g., "21 / 25"), finding count with link to filtered findings list. Handles `zeroInstance: true` case by showing the bar empty with an italic "This category did not apply" note.

**`Layer2Tasks`**
Three-task grid (one column on mobile). Each task is a `Layer2Task`. Distinct from the result hero line: the hero line is one sentence summarizing the whole scan; Layer 2 tasks are deeper agent-task narratives.

**`Layer2Task`**
One Layer 2 simulation task. Task number, task name, result pill (Completed / Partial / Failed), narrative in italic serif, related findings links. If task was skipped or failed due to Layer 2 system failure, the narrative explains that.

**`FindingsList`**
The list of all findings. Shows a severity summary at the top: "16 findings Â· 1 high Â· 2 medium Â· 13 low." Findings listed in order: high severity first, then medium, then low. Within each severity, ordered by category weight (highest-weighted categories first).

**`FindingItem`** (two-layer text)
One finding in the list. **Primary layer (always visible):** plain-language agent narrative ("An agent can't tell your checkout button is a button."). **Helper layer (STUB-eligible at MVP):** finding ID (mono, orange), technical category + score + selector, severity pill. Vibecoder reads the primary; dev expands or glances for the helper. The helper can be a thin first pass at launch and fill in over time. Click/tap opens `FindingDetail`.

**`FindingDetail`**
Full finding detail view. Same two-layer principle: plain-language lead, technical detail (selectors, location-in-markup, methodology reference) below. Breadcrumb back, finding ID, italic serif detail, metadata grid (severity, confidence, points deducted, category weight), location-in-markup block, "What the agent experienced" pull quote, methodology reference link.

**`SeverityPill`**
Small pill showing severity. Three variants: low (muted), medium (ochre), high (orange). Bordered, uppercase mono text.

**`ResultsHeader`**
The dashboard sub-header below the hero. Left side: scanned URL, scan metadata (timestamp, duration, scan modes), methodology version. The score visualization belongs to the hero, NOT this header; this header is supporting context (the URL and when/how the scan ran).

**`SignUpCTA`** (new, signed-in stub)
Appears in anonymous results: "Sign up to track your scores over time." Single button to `/sign-in`. Discreet, not nagging. Hidden for signed-in users.

**`ResultsFooter`**
Sticky footer on results view. Left side: "Anonymous scans stored 24h for shareable links Â· No PII" disclaimer (truthful, matches the data policy; the old "Not stored server-side" line was superseded by 24h TTL storage). Right side: three buttons (Download report, Share card, Scan another).

### Social card components

**`SocialCard`**
The visual card at 1200Ã—630. Reads from scan state context. Renders to a DOM element that can be captured by `html2canvas` for PNG export. Also used as the inline preview in `SocialCardExport`.

**`SocialCardExport`**
The share UI. Shows the SocialCard at scaled preview size, with buttons: Copy image, Download PNG, Copy share URL (deep link to the scan), Share to Twitter, Share to LinkedIn. Share buttons open pre-populated share intents with the OG preview URL.

### Error components

**`ErrorView`**
Full-page error state. Takes `errorCode` and renders the right message, icon, and action buttons. Matches the error view mockup.

**`ErrorIcon`**
Orange circle with the exclamation mark. Could be extended to variants (warning triangle, clock, etc.) but single variant at MVP.

### Common components

**`Button`**
Three variants: primary (orange), secondary (bordered), ghost (text-only). Takes `as` prop to render as `<button>`, `<a>`, or router `<Link>`.

**`CodeBlock`**
Inline or block code display using JetBrains Mono. Used in finding detail "Location in markup" sections.

**`LoadingDots`**
Three-dot loading animation in orange. Used for inline loading states (e.g., while polling, before progress steps render).

---

## Component Contracts (for Kiro)

Engineering-level specifications for each component. Props, state, events, side effects.

### `ScoreRing`

**Props:**
```
{
  score: number,              // 0-100
  maxScore: number,           // default 100
  size: "sm" | "md" | "lg",   // sm: 100px, md: 180px, lg: 340px
  label?: string,             // optional "of 100" or similar caption
  ariaLabel: string           // e.g., "Agent readiness score: 72 of 100"
}
```

**Behavior:**
- Renders an SVG circle at the size specified
- Background stroke: `--cream-warm` at md/sm, `rgba(241,235,220,0.12)` at lg (on teal background)
- Foreground stroke: `--orange`, `stroke-linecap: round`
- Number centered, font-family `--font-display`, size proportional to ring size
- No animation on initial render (too many components to coordinate); animation reserved for the social card export flow where it's rendered once

**Accessibility:**
- SVG has `role="img"` and `aria-label` prop populated
- Score number is real text (not SVG text), readable by screen readers
- Visual and text both convey the same information (SVG is decorative, number carries meaning)

### `ScanInput`

**Props:**
```
{
  onSubmit: (payload: ScanPayload) => void,
  disabled?: boolean,
  initialType?: "url" | "repo" | "spec"
}
```

**State:**
- `inputType`: which tab is active
- `value`: current input string
- `fileValue`: for spec upload, the selected File object
- `validationError`: string or null

**Events:**
- On type change: clear value, update placeholder
- On input change: debounced validation (300ms)
- On submit: final validation, call `onSubmit(payload)` if valid
- `onSubmit` payload shape:
  ```
  { type: "url", value: "https://example.com" }
  { type: "repo", value: "owner/repo" }
  { type: "spec", file: File }
  ```

**Validation rules (client-side):**
- URL: must match `/^https?:\/\/[^\s]+$/`, max 2048 chars, no private IPs (10.*, 192.168.*, 172.16-31.*, 127.*, localhost)
- Repo: must match `/^[\w.-]+\/[\w.-]+$/`
- Spec: file type application/json, application/yaml, text/yaml; max 5MB

**Backend re-validates.** Client validation is for UX, not security.

### `ScanProgress`

**Props:**
```
{
  scanId: string,
  onComplete: () => void,
  onError: (error: ErrorShape) => void
}
```

**State:**
- `currentStep`: 1 through 5
- `completedSteps`: Set<number>
- `startTime`: timestamp
- `pollCount`: number (for timeout)

**Effects:**
- Poll `GET /api/scans/:scanId` every 1500ms
- On response:
  - If `status === "in_progress"`, update `currentStep` based on `response.currentPhase`
  - If `status === "complete"`, call `onComplete`
  - If `status === "error"`, call `onError(response.error)`
- Timeout at 30 seconds â†’ `onError({ code: "TIMEOUT" })`
- Unmount: cancel any in-flight poll

**Accessibility:**
- `role="status"`, `aria-live="polite"` on the progress container
- Step state changes announced to screen readers

### `CategoryCell`

**Props:**
```
{
  categoryNumber: number,         // 1-6
  categoryName: string,
  weight: number,                 // e.g., 25
  score: number,                  // 0-weight
  findingsCount: number,
  zeroInstance?: boolean,
  onFindingsClick: () => void
}
```

**Visual behavior:**
- When `zeroInstance: true`, bar is empty, shows italic serif note "This category did not apply to your scan"
- Bar fill color: orange by default. Future enhancement: color varies by percentage (not in v1; mockup has uniform orange)
- Findings count link opens filtered findings list scoped to this category

### `FindingsList`

**Props:**
```
{
  findings: Finding[],
  categoryFilter?: string,        // optional category name
  onFindingClick: (findingId: string) => void
}
```

**Behavior:**
- Renders severity summary at top: "X findings Â· Y high Â· Z medium Â· W low"
- Sorts findings: high severity â†’ medium â†’ low
- Within severity, sorts by category weight (Semantic HTML first if high, etc.)
- Empty state if no findings in filter: "No findings in this category. An agent would complete tasks here successfully."

### `SocialCard`

**Props:**
```
{
  scanResult: ScanResult,
  methodologyVersion: string,      // e.g., "1.1.0"
  scanDate: Date
}
```

**Behavior:**
- Pure rendering component, no interactivity
- Renders at exactly 1200Ã—630
- Parent component (`SocialCardExport`) handles scaling for preview and capture for export
- Colors, fonts, layout match the mockup exactly

**Export flow (`SocialCardExport`):**
1. User clicks "Share card" in ResultsFooter
2. Component renders SocialCard off-screen at full 1200Ã—630
3. User sees scaled preview
4. User clicks "Download PNG" â†’ `html2canvas` captures the off-screen SocialCard at 2x scale â†’ downloads as `agentislux-scan-[domain]-[date].png`
5. User clicks "Copy share URL" â†’ copies the scan URL to clipboard
6. User clicks a social platform button â†’ opens share intent with the scan URL (the platform will fetch OG meta from the URL)

**Alternate path (server-rendered OG images):**
At launch, the SocialCard is rendered client-side via html2canvas for download, AND server-rendered as a static PNG at scan completion for OG meta tags. Server-rendering is via a Lambda using `@vercel/og` or similar. The URL `https://agentislux.io/og/:scanId.png` returns the PNG; this URL is set as `og:image` in the dynamic meta tag on the results page.

This dual approach means the social card always renders consistently regardless of whether someone downloads it from the UI or it's fetched by a social platform.

---

## State Management

### ScanContext

The only global state. Uses React Context + useReducer. Shared across routes in the `/scan/:id/*` tree.

**State shape:**
```
{
  currentScan: {
    id: string | null,
    status: "idle" | "submitting" | "in_progress" | "complete" | "error",
    submittedAt: Date | null,
    completedAt: Date | null,
    request: ScanPayload | null,
    result: ScanResult | null,     // populated on complete
    error: ErrorShape | null,      // populated on error
    currentPhase: string | null    // for progress display
  }
}
```

**Actions (reducer):**
- `SCAN_SUBMIT`: sets status to "submitting", stores the request payload
- `SCAN_STARTED`: sets status to "in_progress", stores scan ID, clears any previous result
- `SCAN_PROGRESS`: updates currentPhase
- `SCAN_COMPLETE`: sets status to "complete", stores result
- `SCAN_ERROR`: sets status to "error", stores error
- `SCAN_RESET`: clears everything (used when user starts a new scan)

**Persistence:**
- Not persisted. Refreshing the browser on a results page re-fetches the scan by ID from the backend.
- No localStorage for scan results. Results live server-side in ScanResults (24h TTL, anonymous) and are fetched by `resultId`. The frontend is stateless across sessions for anonymous users; signed-in users retrieve from the Users partition.
- One exception: the current scan ID is kept in `sessionStorage` only to survive a refresh within the scan flow. Cleared when a new scan starts.

### Local component state

Everything else uses `useState` in the component that owns it:
- ScanInput: `inputType`, `value`, `fileValue`, `validationError`
- ScanProgress: `currentStep`, `completedSteps`
- FindingsList: `categoryFilter` (if a filter UI is added post-MVP)
- SocialCardExport: `exportStatus` (idle, generating, ready, failed)
- ErrorView: none (props only)

### Why this architecture

- One global state concern (the scan) â†’ one context.
- No other cross-cutting concerns justify context.
- Adding state (e.g., user preferences in paid tier) means adding a new context, not mutating the scan context.
- Matches build principle 7 (one file, one responsibility).

---

## API Integration

### Endpoints consumed by the frontend

**`POST /api/scans`**
Submit a new scan. Body: ScanPayload. Returns: `{ scanId: string, estimatedDurationMs: number }`.

**`GET /api/scans/:scanId`**
Retrieve scan status and (when complete) full results. Returns: `ScanStateResponse`.

Response shape:
```
{
  scanId: string,
  status: "in_progress" | "complete" | "error",
  currentPhase?: string,          // for in_progress
  result?: ScanResult,            // for complete
  error?: ErrorShape,             // for error
  cacheExpiresAt?: Date           // for complete
}
```

**`GET /api/scans/:scanId/report.html`**
Downloadable report as self-contained HTML. Returns: HTML blob. Used by the "Download report" button.

**`GET /og/:scanId.png`**
Server-rendered social card PNG. Used by OG meta tags. Returns: PNG image.

### API client wrapper

`api-client.js` wraps fetch and provides:
- **Timeout** (30 seconds for scan status polling, 60 seconds for submit)
- **Structured error mapping** (HTTP status codes â†’ ErrorShape)
- **Request duration logging** (anonymous, for Plausible / CloudWatch correlation)
- **AbortController support** (cancels in-flight requests when the component unmounts)

Example:
```
import { apiClient } from './api-client';

const { data, error } = await apiClient.get(`/api/scans/${scanId}`, {
  timeoutMs: 30000,
  signal: abortController.signal
});
```

Errors are never thrown from apiClient calls. They return `{ data, error }` shape. Components check `error` first. This prevents uncaught promise rejections and makes error handling explicit.

### Loading states

Every route that depends on API data has three states visible to the user:

1. **Loading**: skeleton screens or progress indicators, not blank screens
2. **Success**: the populated view
3. **Error**: clear error message with next-step action

No spinners. No generic "loading..." text. Always specific about what's happening: "Fetching HTML" during scan, "Loading your report" during results fetch.

---

## Error Handling Strategy

### Error types the frontend must handle

**Network errors:**
- Fetch failed (no internet, DNS failure)
- Timeout (backend took too long)
- CORS blocked (shouldn't happen with same-origin but handled defensively)

**HTTP errors:**
- 400: validation failed (client sent bad input; show inline message on ScanInput)
- 401/403: authentication issue. May occur on signed-in routes (`/history`); anonymous routes never require auth. Handled defensively across the app.
- 404: result not found (either never existed or the 24-hour ScanResults TTL expired)
- 429: rate limited (too many scans from this IP in the current window)
- 500+: server error (backend problem; show generic error)

**Scan-specific errors (from backend response `error.code`):**
- `URL_UNREACHABLE`: site didn't respond within 30s
- `URL_BLOCKED`: site returned 403 or equivalent
- `URL_REDIRECT_LOOP`: too many redirects
- `URL_NON_HTML`: content-type wasn't HTML
- `URL_TOO_LARGE`: response exceeded 5MB
- `URL_REQUIRES_AUTH`: site required login
- `REPO_NOT_FOUND`: GitHub repo private or doesn't exist
- `REPO_RATE_LIMITED`: GitHub API rate limit hit
- `SPEC_PARSE_FAILED`: couldn't parse uploaded spec
- `SPEC_TOO_LARGE`: spec exceeded 5MB
- `SIMULATION_UNAVAILABLE`: Bedrock failed, Layer 1 results are still valid (this is a partial success, not a full error)

### Error UI rules

1. **Every error shows what happened, in plain English.** No raw error codes in the primary message.
2. **Every error offers a next step.** "Try a different URL," "Check the repo name," "Try again in a few minutes."
3. **No blank screens ever.** Errors during loading show the error view, not a loading skeleton frozen forever.
4. **Partial failures degrade gracefully.** If Layer 2 fails but Layer 1 succeeded, show Layer 1 results with a note: "Agent simulation was not attempted for this scan. See methodology for details."

### Error message catalog

Each error code has a mapping in `error-messages.js`:
```
{
  code: "URL_BLOCKED",
  title: "The site blocked automated access.",
  body: "The URL returned a 403 response, which typically means the site is configured to block automated requests. Agentis Lux respects these signals and does not work around them. The same block likely affects AI agents trying to use this site.",
  actions: [
    { label: "Try a different URL", to: "/scan" },
    { label: "Read about robots.txt", to: "/about#robots" }
  ]
}
```

The catalog is reviewed by the human builder (you) before ship. Every entry passes the voice and tone rules (no judgment, no prescriptions, observational phrasing).

---

## Report Download

### What gets downloaded

A self-contained HTML file with:
- All scan result data
- Embedded CSS (no external dependencies)
- Embedded fonts (woff2 base64-encoded)
- The SocialCard rendered inline as an SVG at the top
- The full findings list
- Methodology reference and version number
- Date of scan

Filename pattern: `agentislux-scan-[domain]-[YYYYMMDD].html`

### How it's generated

At MVP, the backend generates the HTML at scan time and serves it from `/api/scans/:scanId/report.html`. The frontend "Download report" button triggers a standard browser download of this URL.

PDF export is future (not MVP). The HTML can be printed to PDF by the user's browser if needed.

### Why HTML not PDF at launch

- HTML is smaller than PDF, renders faster, works everywhere
- HTML preserves the design language exactly (same fonts, same layout)
- PDF generation in a Lambda adds complexity (puppeteer or similar) that can be deferred
- Users who need PDF can print-to-PDF from the HTML

---

## Social Card Export

Covered in detail in the SocialCard component contract above. Summary:

- Rendered client-side via html2canvas for user-initiated downloads
- Rendered server-side as a static PNG at scan completion for OG meta tags
- Dual rendering ensures consistency across contexts
- Filename pattern: `agentislux-scan-[domain]-[YYYYMMDD].png`

---

## Discoverability

Agentis Lux must be discoverable by search engines and AI agents. This is a core requirement (Agentis Lux must pass its own scan).

### robots.txt (public/robots.txt)

```
User-agent: *
Allow: /
Sitemap: https://agentislux.io/sitemap.xml

# Agentis Lux welcomes AI agents and crawlers.
# Scan any public page by visiting https://agentislux.io/scan
```

### sitemap.xml (generated at build)

Lists every static route (`/`, `/scan`, `/methodology`, `/benchmark`, `/about`). Dynamic scan routes are not indexed (transient, ephemeral, not shareable beyond their cache TTL).

### Meta tags (per-route)

Every route sets:
- `<title>`: unique per route
- `<meta name="description">`: unique per route
- `<link rel="canonical">`: self-referencing
- `<meta property="og:title">`: same as title
- `<meta property="og:description">`: same as description
- `<meta property="og:image">`: the social card URL (scan routes) or a default card (other routes)
- `<meta property="og:url">`: canonical URL
- `<meta property="og:type">`: website
- `<meta name="twitter:card">`: summary_large_image

React Router v6 doesn't handle meta natively. Use `<Helmet>` from `react-helmet-async` for per-route meta management.

### JSON-LD structured data

Every route includes Schema.org markup:

**Landing page (`/`):**
```
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Agentis Lux",
  "applicationCategory": "DeveloperApplication",
  "url": "https://agentislux.io",
  "description": "See what AI agents experience on your site.",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "creator": { "@type": "Organization", "name": "Clew Suite" }
}
```

**Methodology page (`/methodology`):**
```
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Agentis Lux Scoring Methodology",
  "version": "1.1.0",
  "dateModified": "2026-06-19"
}
```

**Scan result page (`/scan/:id`):** No structured data (ephemeral, not indexed).

### Headings hierarchy

- Every page has exactly one `<h1>`
- Heading order is sequential (no skipping h2 to h4)
- Heading text is descriptive, not decorative

### Image alt text

- Decorative SVG arcs: `aria-hidden="true"`
- Score ring: `aria-label` describes the score
- Social card image (when rendered): `alt` describes what it shows
- No `alt=""` on content images

---

## WCAG 2.1 AA Compliance

This is a baseline, not a stretch goal. Non-negotiable.

### Color contrast

All foreground/background combinations meet WCAG AA:
- Primary text (`--teal-deep` on `--cream`): 11.4:1 âœ“ (AAA)
- Secondary text (`--muted` on `--cream`): 5.9:1 âœ“ (AA)
- Orange on cream: 4.7:1 âœ“ (AA for normal text)
- Cream on teal-deep: 12.6:1 âœ“ (AAA)

Contrast tested in the mockups. Any new color combination added during build must pass AA before shipping.

### Keyboard navigation

- All interactive elements reachable via Tab
- Tab order follows visual order
- Focus indicators visible (2px orange outline by default)
- No keyboard traps (modals can be closed with Escape)
- Skip-to-main-content link at the top of every page

### Screen reader support

- Semantic HTML throughout (nav, main, article, aside, section, h1-h6)
- ARIA used only when semantic HTML is insufficient
- Dynamic content announces via aria-live regions (scan progress, error messages)
- Form fields have associated labels (not placeholder-only)
- Error messages announced on form submit

### Touch targets

- All interactive elements minimum 44Ã—44px on mobile
- Adequate spacing between adjacent targets (8px minimum)

### No color-only meaning

- Severity uses color AND text ("High", "Medium", "Low")
- Rating uses color AND text ("Agent-Ready", "Partially Ready", "Not Yet Readable")
- Scan progress uses color AND text state ("Done", "Active", "Pending")

### Forms

- Every input has a visible label
- Placeholder is supplementary, not primary guidance
- Error messages specific and actionable
- Required fields marked visually and programmatically

### Motion

- No auto-playing animations longer than 5 seconds
- `prefers-reduced-motion` respected: disables arc animations and smooth scroll
- Progress indicator is not a spinning animation (uses discrete states)

---

## Self-Scanning

Agentis Lux must pass its own scan. This is enforced by CI.

### What gets scanned

On every PR to `main`:
1. Build the frontend
2. Deploy to a preview URL
3. Run Agentis Lux's own scan engine against the preview URL
4. Fail the build if the score is below 80 (Agent-Ready threshold)
5. Fail the build if any high-severity findings are introduced

### Why this matters

- Catches regressions automatically
- Product integrity: we cannot ship a product that would flag itself
- Builds trust publicly: the scan report of agentislux.io is linked in the about page

### How it's set up

GitHub Action: `.github/workflows/self-scan.yml`
Runs on every PR. Invokes the scan engine directly (not through the hosted UI) against the preview deployment.

---

## Mobile Considerations

Agentis Lux works on mobile. Not mobile-first, but responsive and functional at all widths.

### Breakpoints

- Desktop: 1280px+
- Laptop: 900px-1279px
- Tablet: 600px-899px
- Mobile: 375px-599px
- Small mobile: <375px (graceful degradation)

### Layout adaptations

**AppNav:**
- Desktop: horizontal with all links visible
- Mobile: hamburger menu, links in a drawer

**Scan input view (two-column on desktop):**
- Mobile: stacks vertically, left column first (input), right column second (what-happens steps)

**Results dashboard:**
- Desktop: score ring on right of header, category grid 2 columns
- Mobile: score ring stacks above URL, category grid 1 column, Layer 2 tasks 1 column

**Findings list:**
- Desktop: grid-template-columns 80px 1fr auto (ID | body | severity)
- Mobile: stack (ID, body, severity on separate lines)

**Social card:**
- Always renders at 1200Ã—630 internally
- Preview on mobile scales down via transform

### Touch optimizations

- All buttons minimum 44Ã—44px
- Tap targets have 8px+ gap between them
- Tap on FindingItem opens FindingDetail (same behavior as click)
- Double-tap to zoom is not disabled

---

## Performance Budget

- Landing page: Lighthouse Performance score >90 on desktop, >80 on mobile
- Results dashboard: initial render within 1s after scan completes
- Interaction to Next Paint (INP): <200ms on desktop, <500ms on mobile
- Cumulative Layout Shift (CLS): <0.05
- Largest Contentful Paint (LCP): <2.5s on desktop, <4s on mobile

### How we hit these

- Self-hosted fonts with `font-display: swap`
- Vite code-splitting per route
- No runtime CSS-in-JS
- SVG icons inlined (no icon font, no sprite fetch)
- Images (if any) with explicit width/height
- Lighthouse run in CI (self-scan workflow includes it)

---

## Accessibility Testing

### In CI

- axe-core run on every route in CI
- Any violation of AA fails the build
- Keyboard navigation tested via Playwright

### Manual

- Screen reader pass before every major release (VoiceOver on macOS, NVDA on Windows)
- Keyboard-only navigation pass before every major release
- Zoom-to-400% pass before every major release

---

## Confidence Notes

### High confidence (locked)

- File structure (routes, components, lib, state)
- Tech stack (React 18, React Router v6, Vite, Vitest, CSS modules)
- Route flow (landing â†’ scan â†’ scanning â†’ results â†’ finding detail, with error branches)
- Scan ID model (backend-assigned opaque resultId, 24h ScanResults TTL for shareable links, 404 after expiry)
- ScanContext + useReducer for scan state
- Error handling strategy (no blank screens, specific messages, next-step actions)
- WCAG 2.1 AA compliance requirements
- Social card dual rendering (client-side html2canvas + server-side OG PNG)
- Discoverability setup (robots.txt, sitemap, per-route meta, JSON-LD)

### Medium confidence (open questions flagged)

- Self-scan threshold (score 80 minimum). Reasonable starting value, may adjust after first benchmark run
- Polling interval (1500ms). Balances UX and backend load, may tune based on real latency
- Timeout threshold (30s for scan). Matches backend timeout; conservative for real-world network conditions
- Report download format at launch (HTML only, PDF later). May ship PDF earlier if users ask

### Low confidence (needs spike before build)

- html2canvas reliability across browsers. Social card export is a visible feature; needs testing. Spike: render the SocialCard at 2x scale with html2canvas across Chrome, Safari, Firefox, mobile Safari, mobile Chrome. Verify pixel-accuracy and color fidelity.
- OG PNG rendering in Lambda. `@vercel/og` or alternatives. Spike: verify font loading and layout fidelity match the client-side render.
- Mobile layout edge cases. The mockups show desktop. Mobile adaptations described above are based on general patterns but need a visual mockup pass before Phase 2. Deferred to BUILD-PLAN or a mobile-specific mockup session.

### Locked decisions (re-stated)

- Public name Agentis Lux, domain agentislux.io (canonical), agentislux.com redirect
- Primary tagline: "See what AI agents experience on your site."
- Secondary tagline: "For your second audience."
- React 18 + Vite + React Router v6 + Vitest in this spec; **Path B target is Next.js (App Router) on Vercel.** Framework-detail conversion deferred to build time per the status note above. The decision-level content (routes, components, contracts) is current.
- No Tailwind, no CSS-in-JS runtime (CSS modules per component, or Next.js equivalent at build)
- Anonymous scans require no account; the signed-in tier is opt-in (auth + history stub at MVP). Anonymous scan results stored 24h server-side for shareable links, then auto-deleted. Signed-in scans persist in the Users partition.
- Self-scanning enforced in CI
- WCAG 2.1 AA is minimum bar

### Integrity check

Every view in the mockup maps to a route in this spec. Every route has clear responsibilities. Every component has a user-facing behavior description and an engineering contract. Every error has a specific message and a next-step action. Every accessibility requirement has a measurement. The design language is preserved across all views via shared CSS tokens and component patterns.

---

*AI assisted. Human approved. Powered by NLP.*
