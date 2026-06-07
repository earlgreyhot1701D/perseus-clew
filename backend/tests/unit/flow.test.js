import { describe, it, expect } from 'vitest';
import { runScan } from '../../src/orchestrator/flow.js';

// --- Fixtures ---

const wellBuiltPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Great Product</title>
  <meta property="og:title" content="Great Product">
  <meta property="og:description" content="Desc">
  <meta property="og:type" content="product">
  <meta property="og:image" content="https://example.com/img.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Great Product">
  <meta name="twitter:description" content="Desc">
  <meta name="twitter:image" content="https://example.com/img.jpg">
  <link rel="canonical" href="https://example.com/product">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Product","name":"Widget"}
  </script>
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main id="main">
    <h1>Great Product</h1>
    <h2>Features</h2>
    <p>This is a well-built product page with substantial content that agents
    can read without executing JavaScript. It contains real headings, semantic
    navigation, proper form controls, and descriptive link text throughout.
    The page is server-rendered with all content in the initial HTML response.</p>
    <form action="/buy">
      <label for="qty">Quantity</label>
      <input id="qty" type="number" name="qty">
      <button type="submit">Add to Cart</button>
    </form>
    <ul><li>Feature 1</li><li>Feature 2</li><li>Feature 3</li></ul>
    <a href="/docs">Documentation</a>
  </main>
</body>
</html>`;

const badPage = `<!DOCTYPE html>
<html>
<head><title>React App</title></head>
<body>
  <div id="root"></div>
  <div onclick="nav()">Menu</div>
  <div onclick="action()">Do thing</div>
  <a href="#">Click here</a>
  <a href="https://external.com/page">Learn more</a>
  <a href="https://external.com/other">Learn more</a>
  <noscript>You need JavaScript to run this app.</noscript>
  <script src="/bundle.js"></script>
  <script src="/vendor.js"></script>
</body>
</html>`;

const pageWithHtmlInExamples = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Examples Test</title>
  <link rel="canonical" href="https://example.com/">
  <meta property="og:title" content="T">
  <meta property="og:description" content="D">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://example.com/i.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="T">
  <meta name="twitter:description" content="D">
  <meta name="twitter:image" content="https://example.com/i.jpg">
  <script type="application/ld+json">{"@type":"WebPage"}</script>
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main id="main">
    <h1>Page</h1>
    <h2>Content</h2>
    <p>Enough content here to pass the body text threshold with more than two
    hundred characters of real text present for the measurement to work.</p>
    <div onclick="go()">Submit</div>
    <form action="/x">
      <label for="e">Email</label>
      <input id="e" type="email" name="email">
      <button type="submit">Go</button>
    </form>
  </main>
</body>
</html>`;

const externalLinkPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>External Links</title>
  <meta property="og:title" content="T">
  <meta property="og:description" content="D">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://example.com/i.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="T">
  <meta name="twitter:description" content="D">
  <meta name="twitter:image" content="https://example.com/i.jpg">
  <script type="application/ld+json">{"@type":"WebPage"}</script>
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main id="main">
    <h1>Resources</h1>
    <h2>Links</h2>
    <p>A page with enough content to pass the body text threshold check with
    more than two hundred characters present in the page body.</p>
    <a href="https://other-domain.com/page">Partner Site</a>
    <a href="https://another.org/docs">Docs</a>
    <form action="/go">
      <label for="q">Search</label>
      <input id="q" type="text" name="q">
      <button type="submit">Go</button>
    </form>
  </main>
</body>
</html>`;

const minimalPage = `<html><body></body></html>`;

// --- Tests ---

describe('runScan (deterministic flow)', () => {
  describe('report shape', () => {
    it('returns the full spec-compliant report structure', () => {
      const report = runScan(wellBuiltPage, 'https://example.com/product');

      // Top-level keys
      expect(report).toHaveProperty('meta');
      expect(report).toHaveProperty('preScanFindings');
      expect(report).toHaveProperty('scoredViews');
      expect(report).toHaveProperty('simulation');

      // meta fields
      expect(report.meta.scanType).toBe('url');
      expect(report.meta.targetDomain).toBe('example.com');
      expect(report.meta.fromCache).toBe(false);
      expect(report.meta.methodologyVersion).toBe('1.0.0');
      expect(report.meta.requestId).toBeNull();
      expect(report.meta.resultId).toBeNull();
      expect(report.meta.durationMs).toBeNull();
      expect(report.meta.timestamp).toBeNull();
      expect(report.meta.scannedAt).toBeNull();

      // scoredViews.rawHtml
      expect(report.scoredViews.rawHtml).toHaveProperty('score');
      expect(report.scoredViews.rawHtml).toHaveProperty('heroLine');
      expect(report.scoredViews.rawHtml).toHaveProperty('findings');

      // score shape
      expect(typeof report.scoredViews.rawHtml.score.total).toBe('number');
      expect(typeof report.scoredViews.rawHtml.score.rating).toBe('string');
      expect(report.scoredViews.rawHtml.score).toHaveProperty('breakdown');

      // findings has all 6 categories
      const findings = report.scoredViews.rawHtml.findings;
      expect(findings).toHaveProperty('semantic_html');
      expect(findings).toHaveProperty('form_accessibility');
      expect(findings).toHaveProperty('aria');
      expect(findings).toHaveProperty('structured_data');
      expect(findings).toHaveProperty('content_in_html');
      expect(findings).toHaveProperty('link_navigation');

      // Each category findings is an array
      for (const cat of Object.values(findings)) {
        expect(Array.isArray(cat)).toBe(true);
      }
    });

    it('heroLine is stub pending', () => {
      const report = runScan(wellBuiltPage, 'https://example.com/product');
      expect(report.scoredViews.rawHtml.heroLine).toEqual({
        text: '', source: 'pending', model: null
      });
    });

    it('simulation is available:false', () => {
      const report = runScan(wellBuiltPage, 'https://example.com/product');
      expect(report.simulation).toEqual({ available: false });
    });

    it('preScanFindings is empty array from flow', () => {
      const report = runScan(wellBuiltPage, 'https://example.com/product');
      expect(report.preScanFindings).toEqual([]);
    });
  });

  describe('scoring integration', () => {
    it('well-built page scores high (Agent-Ready or close)', () => {
      const report = runScan(wellBuiltPage, 'https://example.com/product');
      expect(report.scoredViews.rawHtml.score.total).toBeGreaterThanOrEqual(70);
    });

    it('bad page scores low', () => {
      const report = runScan(badPage, 'https://badsite.com/');
      expect(report.scoredViews.rawHtml.score.total).toBeLessThanOrEqual(55);
      expect(['Not Yet Readable', 'Partially Ready']).toContain(report.scoredViews.rawHtml.score.rating);
    });

    it('breakdown parts sum to total (trust property)', () => {
      const report = runScan(wellBuiltPage, 'https://example.com/product');
      const breakdown = report.scoredViews.rawHtml.score.breakdown;
      const sum = Object.values(breakdown).reduce((s, c) => s + c.earned, 0);
      expect(sum).toBe(report.scoredViews.rawHtml.score.total);
    });
  });

  describe('sanitization of finding text', () => {
    it('strips HTML tags from finding text', () => {
      const report = runScan(badPage, 'https://badsite.com/');
      const allFindings = Object.values(report.scoredViews.rawHtml.findings).flat();
      for (const finding of allFindings) {
        // No raw HTML tags in text (sanitize strips them)
        expect(finding.text).not.toMatch(/<[a-z][^>]*>/i);
      }
    });
  });

  describe('escaping of finding examples', () => {
    it('examples contain escaped HTML (no raw < or > remain)', () => {
      const report = runScan(pageWithHtmlInExamples, 'https://example.com/');
      const allFindings = Object.values(report.scoredViews.rawHtml.findings).flat();
      const findingsWithExamples = allFindings.filter(f => f.examples && f.examples.length > 0);

      // There should be at least one finding with examples (SEM-001 from the onclick div)
      expect(findingsWithExamples.length).toBeGreaterThan(0);

      for (const finding of findingsWithExamples) {
        for (const example of finding.examples) {
          // No raw angle brackets remain
          expect(example).not.toMatch(/</);
          expect(example).not.toMatch(/>/);
        }
      }
    });

    it('escaped examples decode back to original (lossless)', () => {
      const report = runScan(pageWithHtmlInExamples, 'https://example.com/');
      const allFindings = Object.values(report.scoredViews.rawHtml.findings).flat();
      const findingsWithExamples = allFindings.filter(f => f.examples && f.examples.length > 0);

      for (const finding of findingsWithExamples) {
        for (const example of finding.examples) {
          // Decoding entities should produce a non-empty string containing HTML
          const decoded = example
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, '&');
          expect(decoded.length).toBeGreaterThan(0);
          // The decoded version should contain the original HTML markup
          expect(decoded).toMatch(/<[a-z]/i);
        }
      }
    });
  });

  describe('external-link detection via pageOrigin', () => {
    it('detects external links using targetUrl origin (no canonical needed)', () => {
      // This page has no <link rel="canonical"> — the flow passes pageOrigin directly
      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>No Canonical</title>
  <meta property="og:title" content="T">
  <meta property="og:description" content="D">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://mysite.com/i.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="T">
  <meta name="twitter:description" content="D">
  <meta name="twitter:image" content="https://mysite.com/i.jpg">
  <script type="application/ld+json">{"@type":"WebPage"}</script>
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main id="main">
    <h1>Page</h1><h2>Section</h2>
    <p>Enough content here to pass the body text threshold check with more than
    two hundred characters of text for the measurement to succeed.</p>
    <a href="https://external-site.com/page">External</a>
    <form action="/go"><label for="q">Q</label><input id="q" type="text" name="q"><button type="submit">Go</button></form>
  </main>
</body>
</html>`;

      const report = runScan(html, 'https://mysite.com/page');
      const linkFindings = report.scoredViews.rawHtml.findings.link_navigation;
      const extFinding = linkFindings.find(f => f.id === 'LINK-004');
      expect(extFinding).toBeDefined();
      expect(extFinding.count).toBe(1);
    });
  });

  describe('meta fields', () => {
    it('extracts targetDomain from targetUrl', () => {
      const report = runScan(wellBuiltPage, 'https://sub.example.com/path');
      expect(report.meta.targetDomain).toBe('sub.example.com');
    });

    it('methodologyVersion is 1.0.0', () => {
      const report = runScan(wellBuiltPage, 'https://example.com/');
      expect(report.meta.methodologyVersion).toBe('1.0.0');
    });

    it('handles malformed targetUrl gracefully', () => {
      const report = runScan(wellBuiltPage, 'not-a-url');
      expect(report.meta.targetDomain).toBe('not-a-url');
      // Should not throw
    });
  });

  describe('determinism', () => {
    it('same input produces identical output on three runs', () => {
      const r1 = runScan(wellBuiltPage, 'https://example.com/product');
      const r2 = runScan(wellBuiltPage, 'https://example.com/product');
      const r3 = runScan(wellBuiltPage, 'https://example.com/product');
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });
  });

  describe('empty/minimal page', () => {
    it('produces a valid report without crashing', () => {
      const report = runScan(minimalPage, 'https://example.com/');
      expect(report.scoredViews.rawHtml.score.total).toBeGreaterThanOrEqual(0);
      expect(report.scoredViews.rawHtml.score.total).toBeLessThanOrEqual(100);
      expect(report.scoredViews.rawHtml.findings).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('throws on null/empty HTML (from parse-html)', () => {
      expect(() => runScan('', 'https://example.com/')).toThrow();
      expect(() => runScan(null, 'https://example.com/')).toThrow();
    });
  });
});
