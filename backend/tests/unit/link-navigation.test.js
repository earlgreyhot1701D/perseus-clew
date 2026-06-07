import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/shared/parse-html.js';
import { checkLinkNavigation } from '../../src/checks/frontend/link-navigation.js';

// --- Fixtures ---

const wellLinkedPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Good Links</title>
  <link rel="canonical" href="https://example.com/page">
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/pricing">Pricing</a>
  </nav>
  <main id="main">
    <h1>Welcome</h1>
    <p>Content here.</p>
    <a href="/docs">Documentation</a>
    <a href="https://partner.com/api" rel="noopener">Partner API</a>
  </main>
</body>
</html>`;

const badLinksPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Bad Links</title>
  <link rel="canonical" href="https://mysite.com/">
</head>
<body>
  <nav>
    <a>No href at all</a>
    <a href="#">Hash only</a>
    <a href="javascript:void(0)">JS void</a>
  </nav>
  <main>
    <h1>Page</h1>
    <a href="/page1">Click here</a>
    <a href="/page2">Read more</a>
    <a href="https://external.com/a">Learn more</a>
    <a href="https://external.com/b">Learn more</a>
  </main>
</body>
</html>`;

const noAnchorsPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>No Links</title></head>
<body><main><h1>Static</h1><p>No links at all.</p></main></body>
</html>`;

const descriptiveLinks = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Descriptive</title>
  <link rel="canonical" href="https://example.com/">
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/pricing">Pricing</a>
  </nav>
  <main id="main">
    <a href="/features">Read more about features</a>
    <a href="/blog">Our Blog</a>
  </main>
</body>
</html>`;

const sameHrefDuplicates = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Same Href</title>
  <link rel="canonical" href="https://example.com/">
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav>
    <a href="/docs">Documentation</a>
    <a href="/docs">Documentation</a>
    <a href="/docs">Documentation</a>
  </nav>
  <main id="main"><h1>Docs</h1></main>
</body>
</html>`;

const textlessAnchorBoundary = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Textless</title>
  <link rel="canonical" href="https://example.com/">
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a></nav>
  <main id="main">
    <a href="/icon-page"><img src="icon.png"></a>
    <a href="/other"></a>
    <a href="/real">Real text link</a>
  </main>
</body>
</html>`;

const internalLinksOnly = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Internal</title>
  <link rel="canonical" href="https://mysite.com/page">
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav>
    <a href="https://mysite.com/">Home</a>
    <a href="https://mysite.com/about">About</a>
  </nav>
  <main id="main"><h1>Page</h1></main>
</body>
</html>`;

const singleHrefless = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>One</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main><a>Missing href</a></main>
</body>
</html>`;

const singlePlaceholder = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>One</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main><a href="#">Hash</a></main>
</body>
</html>`;

const singleGeneric = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>One</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main><a href="/x">Click here</a></main>
</body>
</html>`;

const singleExternal = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>One</title>
  <link rel="canonical" href="https://mysite.com/">
</head>
<body>
  <nav><a href="/">Home</a></nav>
  <main><a href="https://other.com/page">Other</a></main>
</body>
</html>`;

const multipleHrefless = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main><a>One</a><a>Two</a><a>Three</a></main>
</body>
</html>`;

const multiplePlaceholder = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <a href="#">One</a>
    <a href="javascript:void(0)">Two</a>
  </main>
</body>
</html>`;

const multipleGeneric = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <a href="/a">Click here</a>
    <a href="/b">Read more</a>
    <a href="/c">More</a>
  </main>
</body>
</html>`;

const multipleExternals = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Multi</title>
  <link rel="canonical" href="https://mysite.com/">
</head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <a href="https://ext1.com/a">Ext 1</a>
    <a href="https://ext2.com/b">Ext 2</a>
  </main>
</body>
</html>`;

const multipleDupeGroups = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Multi Dupes</title>
  <link rel="canonical" href="https://example.com/">
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a></nav>
  <main id="main">
    <a href="/a">Learn more</a>
    <a href="/b">Learn more</a>
    <a href="/x">Details</a>
    <a href="/y">Details</a>
  </main>
</body>
</html>`;

const singleDupeGroup = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>One Dupe</title>
  <link rel="canonical" href="https://example.com/">
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a></nav>
  <main id="main">
    <a href="/a">Learn more</a>
    <a href="/b">Learn more</a>
  </main>
</body>
</html>`;

const contextDisambiguated = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Context</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <a href="/x" aria-label="Read more about pricing">Read more</a>
    <a href="/y" title="Learn about features">Learn more</a>
  </main>
</body>
</html>`;

// --- Tests ---

describe('checkLinkNavigation', () => {
  describe('well-linked page', () => {
    it('passes all checks with no findings', () => {
      const result = checkLinkNavigation(parseHtml(wellLinkedPage));
      expect(result.findings).toEqual([]);
      expect(result.passed).toBe(result.total);
      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe('bad links page', () => {
    it('emits LINK-001 for hrefless anchor', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const f = result.findings.find(f => f.id === 'LINK-001');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });

    it('emits LINK-002 for placeholder hrefs', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const f = result.findings.find(f => f.id === 'LINK-002');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
    });

    it('emits LINK-003 for generic link text', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const f = result.findings.find(f => f.id === 'LINK-003');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(2);
    });

    it('emits LINK-004 for external link without rel', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const f = result.findings.find(f => f.id === 'LINK-004');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits LINK-005 for missing skip link', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const f = result.findings.find(f => f.id === 'LINK-005');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
    });

    it('emits LINK-006 for duplicate "Learn more" to different hrefs', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const f = result.findings.find(f => f.id === 'LINK-006');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });
  });

  describe('no-anchor page', () => {
    it('returns passed:0, total:0, findings:[] (no navigation to assess)', () => {
      const result = checkLinkNavigation(parseHtml(noAnchorsPage));
      expect(result.passed).toBe(0);
      expect(result.total).toBe(0);
      expect(result.findings).toEqual([]);
    });
  });

  describe('conservative negatives', () => {
    it('does NOT flag "Home"/"About"/"Pricing" as generic (LINK-003)', () => {
      const result = checkLinkNavigation(parseHtml(descriptiveLinks));
      const f = result.findings.find(f => f.id === 'LINK-003');
      expect(f).toBeUndefined();
    });

    it('does NOT flag "Read more about features" (generic word + context)', () => {
      const result = checkLinkNavigation(parseHtml(descriptiveLinks));
      const f = result.findings.find(f => f.id === 'LINK-003');
      expect(f).toBeUndefined();
    });

    it('does NOT flag duplicate text pointing to same href (LINK-006)', () => {
      const result = checkLinkNavigation(parseHtml(sameHrefDuplicates));
      const f = result.findings.find(f => f.id === 'LINK-006');
      expect(f).toBeUndefined();
    });

    it('does NOT flag internal links as external (LINK-004)', () => {
      const result = checkLinkNavigation(parseHtml(internalLinksOnly));
      const f = result.findings.find(f => f.id === 'LINK-004');
      expect(f).toBeUndefined();
    });

    it('does NOT flag generic text when aria-label provides context', () => {
      const result = checkLinkNavigation(parseHtml(contextDisambiguated));
      const f = result.findings.find(f => f.id === 'LINK-003');
      expect(f).toBeUndefined();
    });
  });

  describe('module 5 boundary (textless anchors)', () => {
    it('does NOT flag textless anchors in LINK-003 (module 5 territory)', () => {
      const result = checkLinkNavigation(parseHtml(textlessAnchorBoundary));
      const f = result.findings.find(f => f.id === 'LINK-003');
      expect(f).toBeUndefined();
    });
  });

  describe('verb agreement at count=null, count=1, and count>=2', () => {
    it('LINK-001 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkLinkNavigation(parseHtml(singleHrefless));
      const f1 = r1.findings.find(f => f.id === 'LINK-001');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 anchor element has');

      const r2 = checkLinkNavigation(parseHtml(multipleHrefless));
      const f2 = r2.findings.find(f => f.id === 'LINK-001');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('anchor elements have');
    });

    it('LINK-002 count=1 uses "uses", count>=2 uses "use"', () => {
      const r1 = checkLinkNavigation(parseHtml(singlePlaceholder));
      const f1 = r1.findings.find(f => f.id === 'LINK-002');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 anchor element uses a placeholder href');

      const r2 = checkLinkNavigation(parseHtml(multiplePlaceholder));
      const f2 = r2.findings.find(f => f.id === 'LINK-002');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('anchor elements use placeholder hrefs');
    });

    it('LINK-003 count=1 uses "uses", count>=2 uses "use"', () => {
      const r1 = checkLinkNavigation(parseHtml(singleGeneric));
      const f1 = r1.findings.find(f => f.id === 'LINK-003');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 link uses generic text');

      const r2 = checkLinkNavigation(parseHtml(multipleGeneric));
      const f2 = r2.findings.find(f => f.id === 'LINK-003');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('links use generic text');
    });

    it('LINK-004 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkLinkNavigation(parseHtml(singleExternal));
      const f1 = r1.findings.find(f => f.id === 'LINK-004');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 link to an external domain has');

      const r2 = checkLinkNavigation(parseHtml(multipleExternals));
      const f2 = r2.findings.find(f => f.id === 'LINK-004');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('links to external domains have');
    });

    it('LINK-005 (binary, count=null) text is correct', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const f = result.findings.find(f => f.id === 'LINK-005');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('No skip-to-content link');
    });

    it('LINK-006 count=1 uses "shares", count>=2 uses "share"', () => {
      const r1 = checkLinkNavigation(parseHtml(singleDupeGroup));
      const f1 = r1.findings.find(f => f.id === 'LINK-006');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 group of links shares');

      const r2 = checkLinkNavigation(parseHtml(multipleDupeGroups));
      const f2 = r2.findings.find(f => f.id === 'LINK-006');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('groups of links share');
      expect(f2.count).toBe(2);
    });
  });

  describe('determinism', () => {
    it('produces identical output on three runs', () => {
      const parsed = parseHtml(badLinksPage);
      const r1 = checkLinkNavigation(parsed);
      const r2 = checkLinkNavigation(parsed);
      const r3 = checkLinkNavigation(parsed);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('produces identical output on separately parsed instances', () => {
      const p1 = parseHtml(wellLinkedPage);
      const p2 = parseHtml(wellLinkedPage);
      expect(checkLinkNavigation(p1)).toEqual(checkLinkNavigation(p2));
    });
  });

  describe('voice compliance', () => {
    const BANNED_JUDGMENT = /\b(bad|poor|weak|failing|broken|violates|wrong|incorrect)\b/i;
    const BANNED_PRESCRIPTION = /\b(you should|you must|we recommend|fix this|fix the|please add|needs to|should have|need to|try |fix by)\b/i;
    const BANNED_SEVERITY = /\b(critical|serious|minor)\b/i;
    const BANNED_BLAME = /\b(you forgot|you missed)\b/i;

    const pages = [badLinksPage, multipleGeneric, multipleExternals, multipleDupeGroups];

    it('contains no judgment words in any finding text', () => {
      for (const page of pages) {
        const result = checkLinkNavigation(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_JUDGMENT);
        }
      }
    });

    it('contains no prescription words in any finding text', () => {
      for (const page of pages) {
        const result = checkLinkNavigation(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_PRESCRIPTION);
        }
      }
    });

    it('contains no severity words in any finding text', () => {
      for (const page of pages) {
        const result = checkLinkNavigation(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_SEVERITY);
        }
      }
    });

    it('contains no developer-blame in any finding text', () => {
      for (const page of pages) {
        const result = checkLinkNavigation(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_BLAME);
        }
      }
    });
  });

  describe('contract compliance', () => {
    it('returns the correct shape', () => {
      const result = checkLinkNavigation(parseHtml(wellLinkedPage));
      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('every finding has required fields with correct ID format', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(finding.id).toMatch(/^LINK-\d{3}$/);
        expect(typeof finding.text).toBe('string');
      }
    });

    it('finding IDs are in execution order', () => {
      const result = checkLinkNavigation(parseHtml(badLinksPage));
      const ids = result.findings.map(f => f.id);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('throws CHECK_MODULE_ERROR on internal failure', () => {
      expect(() => checkLinkNavigation({})).toThrow();
      try {
        checkLinkNavigation({});
      } catch (e) {
        expect(e.code).toBe('CHECK_MODULE_ERROR');
      }
    });
  });
});
