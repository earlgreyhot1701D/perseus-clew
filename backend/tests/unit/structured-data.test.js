import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/shared/parse-html.js';
import { checkStructuredData } from '../../src/checks/frontend/structured-data.js';

// --- Fixtures ---

const fullyMarkedUp = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Product Page</title>
  <meta property="og:title" content="My Product">
  <meta property="og:description" content="A great product">
  <meta property="og:type" content="product">
  <meta property="og:image" content="https://example.com/img.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="My Product">
  <meta name="twitter:description" content="A great product">
  <meta name="twitter:image" content="https://example.com/img.jpg">
  <link rel="canonical" href="https://example.com/product">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Product","name":"Widget"}
  </script>
</head>
<body><main><h1>Product</h1></main></body>
</html>`;

const barePage = `<!DOCTYPE html>
<html>
<head><title>Bare</title></head>
<body><main><h1>Nothing</h1></main></body>
</html>`;

const invalidJsonLd = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Invalid JSON-LD</title>
  <script type="application/ld+json">
  {not valid json at all!!!
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","name":"Good"}
  </script>
  <link rel="canonical" href="https://example.com/article">
  <meta property="og:title" content="Article">
  <meta property="og:description" content="Desc">
  <meta property="og:type" content="article">
  <meta property="og:image" content="https://example.com/img.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Article">
  <meta name="twitter:description" content="Desc">
  <meta name="twitter:image" content="https://example.com/img.jpg">
</head>
<body><main><h1>Article</h1></main></body>
</html>`;

const missingType = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Missing Type</title>
  <script type="application/ld+json">
  {"@context":"https://schema.org","name":"No Type Here"}
  </script>
  <link rel="canonical" href="https://example.com/page">
  <meta property="og:title" content="Page">
  <meta property="og:description" content="Desc">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://example.com/img.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Page">
  <meta name="twitter:description" content="Desc">
  <meta name="twitter:image" content="https://example.com/img.jpg">
</head>
<body><main><h1>Page</h1></main></body>
</html>`;

const nicheType = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Niche Type</title>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"MedicalCondition","name":"Asthma"}
  </script>
  <link rel="canonical" href="https://example.com/condition">
  <meta property="og:title" content="Asthma">
  <meta property="og:description" content="Info">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://example.com/img.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Asthma">
  <meta name="twitter:description" content="Info">
  <meta name="twitter:image" content="https://example.com/img.jpg">
</head>
<body><main><h1>Asthma</h1></main></body>
</html>`;

const graphHandling = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Graph</title>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"Site"},
    {"name":"No type item"},
    {"@type":"Organization","name":"Org"}
  ]}
  </script>
  <link rel="canonical" href="https://example.com/">
  <meta property="og:title" content="Site">
  <meta property="og:description" content="Desc">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://example.com/img.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Site">
  <meta name="twitter:description" content="Desc">
  <meta name="twitter:image" content="https://example.com/img.jpg">
</head>
<body><main><h1>Site</h1></main></body>
</html>`;

const partialOg = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Partial OG</title>
  <meta property="og:title" content="Title Only">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebPage","name":"Page"}
  </script>
  <link rel="canonical" href="https://example.com/page">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Page">
  <meta name="twitter:description" content="Desc">
  <meta name="twitter:image" content="https://example.com/img.jpg">
</head>
<body><main><h1>Page</h1></main></body>
</html>`;

const multipleInvalidJsonLd = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Multi Invalid</title>
  <script type="application/ld+json">{broken1</script>
  <script type="application/ld+json">{broken2</script>
  <link rel="canonical" href="https://example.com/">
  <meta property="og:title" content="X">
  <meta property="og:description" content="X">
  <meta property="og:type" content="x">
  <meta property="og:image" content="x">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="X">
  <meta name="twitter:description" content="X">
  <meta name="twitter:image" content="x">
</head>
<body><main><h1>X</h1></main></body>
</html>`;

const multipleTypeMissing = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Multi Missing Type</title>
  <script type="application/ld+json">{"name":"A"}</script>
  <script type="application/ld+json">{"name":"B"}</script>
  <link rel="canonical" href="https://example.com/">
  <meta property="og:title" content="X">
  <meta property="og:description" content="X">
  <meta property="og:type" content="x">
  <meta property="og:image" content="x">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="X">
  <meta name="twitter:description" content="X">
  <meta name="twitter:image" content="x">
</head>
<body><main><h1>X</h1></main></body>
</html>`;

const singleOgMissing = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>One OG Missing</title>
  <meta property="og:title" content="T">
  <meta property="og:description" content="D">
  <meta property="og:type" content="website">
  <script type="application/ld+json">{"@type":"WebPage"}</script>
  <link rel="canonical" href="https://example.com/">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="T">
  <meta name="twitter:description" content="D">
  <meta name="twitter:image" content="i">
</head>
<body><main><h1>X</h1></main></body>
</html>`;

const singleTwitterMissing = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>One Twitter Missing</title>
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="T">
  <meta name="twitter:description" content="D">
  <meta property="og:title" content="T">
  <meta property="og:description" content="D">
  <meta property="og:type" content="website">
  <meta property="og:image" content="i">
  <script type="application/ld+json">{"@type":"WebPage"}</script>
  <link rel="canonical" href="https://example.com/">
</head>
<body><main><h1>X</h1></main></body>
</html>`;

// --- Tests ---

describe('checkStructuredData', () => {
  describe('fully marked-up page', () => {
    it('passes all checks with no findings', () => {
      const result = checkStructuredData(parseHtml(fullyMarkedUp));
      expect(result.findings).toEqual([]);
      expect(result.passed).toBe(result.total);
      expect(result.total).toBe(7);
    });
  });

  describe('bare page (no metadata)', () => {
    it('emits findings for checks 1, 4, 5, 6, 7 with checks 2/3 N/A', () => {
      const result = checkStructuredData(parseHtml(barePage));
      expect(result.total).toBe(5);
      expect(result.passed).toBe(0);
      expect(result.findings.some(f => f.id === 'SDATA-001')).toBe(true);
      expect(result.findings.some(f => f.id === 'SDATA-004')).toBe(true);
      expect(result.findings.some(f => f.id === 'SDATA-005')).toBe(true);
      expect(result.findings.some(f => f.id === 'SDATA-006')).toBe(true);
      expect(result.findings.some(f => f.id === 'SDATA-007')).toBe(true);
      expect(result.findings.some(f => f.id === 'SDATA-002')).toBe(false);
      expect(result.findings.some(f => f.id === 'SDATA-003')).toBe(false);
    });
  });

  describe('invalid JSON-LD', () => {
    it('emits SDATA-002 for malformed block without crashing', () => {
      const result = checkStructuredData(parseHtml(invalidJsonLd));
      const f = result.findings.find(f => f.id === 'SDATA-002');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });

    it('does not throw on malformed JSON', () => {
      expect(() => checkStructuredData(parseHtml(invalidJsonLd))).not.toThrow();
    });
  });

  describe('missing @type', () => {
    it('emits SDATA-003 for block without @type', () => {
      const result = checkStructuredData(parseHtml(missingType));
      const f = result.findings.find(f => f.id === 'SDATA-003');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });
  });

  describe('niche @type acceptance', () => {
    it('accepts a valid-but-niche @type without flagging', () => {
      const result = checkStructuredData(parseHtml(nicheType));
      const f = result.findings.find(f => f.id === 'SDATA-003');
      expect(f).toBeUndefined();
    });
  });

  describe('@graph handling', () => {
    it('counts items within @graph that lack @type', () => {
      const result = checkStructuredData(parseHtml(graphHandling));
      const f = result.findings.find(f => f.id === 'SDATA-003');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });
  });

  describe('partial Open Graph', () => {
    it('emits SDATA-004 with count of missing tags', () => {
      const result = checkStructuredData(parseHtml(partialOg));
      const f = result.findings.find(f => f.id === 'SDATA-004');
      expect(f).toBeDefined();
      expect(f.count).toBe(3);
    });
  });

  describe('verb agreement at count=null, count=1, and count>=2', () => {
    it('SDATA-001 (binary, count=null) text is correct', () => {
      const result = checkStructuredData(parseHtml(barePage));
      const f = result.findings.find(f => f.id === 'SDATA-001');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('No JSON-LD structured data is present');
    });

    it('SDATA-002 count=1 uses "block contains", count>=2 uses "blocks contain"', () => {
      const r1 = checkStructuredData(parseHtml(invalidJsonLd));
      const f1 = r1.findings.find(f => f.id === 'SDATA-002');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 JSON-LD block contains');

      const r2 = checkStructuredData(parseHtml(multipleInvalidJsonLd));
      const f2 = r2.findings.find(f => f.id === 'SDATA-002');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('JSON-LD blocks contain');
      expect(f2.count).toBe(2);
    });

    it('SDATA-003 count=1 uses "block has", count>=2 uses "blocks have"', () => {
      const r1 = checkStructuredData(parseHtml(missingType));
      const f1 = r1.findings.find(f => f.id === 'SDATA-003');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 JSON-LD block has');

      const r2 = checkStructuredData(parseHtml(multipleTypeMissing));
      const f2 = r2.findings.find(f => f.id === 'SDATA-003');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('JSON-LD blocks have');
      expect(f2.count).toBe(2);
    });

    it('SDATA-004 count=1 uses "tag...is absent", count>=2 uses "tags are absent"', () => {
      const r1 = checkStructuredData(parseHtml(singleOgMissing));
      const f1 = r1.findings.find(f => f.id === 'SDATA-004');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('meta tag');
      expect(f1.text).toContain('is absent');

      const r2 = checkStructuredData(parseHtml(partialOg));
      const f2 = r2.findings.find(f => f.id === 'SDATA-004');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('meta tags are absent');
    });

    it('SDATA-005 count=1 uses "tag is absent", count>=2 uses "tags are absent"', () => {
      const r1 = checkStructuredData(parseHtml(singleTwitterMissing));
      const f1 = r1.findings.find(f => f.id === 'SDATA-005');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 Twitter Card meta tag is absent');

      const r2 = checkStructuredData(parseHtml(barePage));
      const f2 = r2.findings.find(f => f.id === 'SDATA-005');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('Twitter Card meta tags are absent');
      expect(f2.count).toBe(4);
    });

    it('SDATA-006 (binary, count=null) text is correct', () => {
      const result = checkStructuredData(parseHtml(barePage));
      const f = result.findings.find(f => f.id === 'SDATA-006');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('No canonical URL is declared');
    });

    it('SDATA-007 (binary, count=null) text is correct', () => {
      const result = checkStructuredData(parseHtml(barePage));
      const f = result.findings.find(f => f.id === 'SDATA-007');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('no lang attribute');
    });
  });

  describe('determinism', () => {
    it('produces identical output on three runs', () => {
      const parsed = parseHtml(barePage);
      const r1 = checkStructuredData(parsed);
      const r2 = checkStructuredData(parsed);
      const r3 = checkStructuredData(parsed);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('produces identical output on separately parsed instances', () => {
      const p1 = parseHtml(partialOg);
      const p2 = parseHtml(partialOg);
      expect(checkStructuredData(p1)).toEqual(checkStructuredData(p2));
    });
  });

  describe('voice compliance', () => {
    const BANNED_JUDGMENT = /\b(bad|poor|weak|failing|broken|violates|wrong|incorrect)\b/i;
    const BANNED_PRESCRIPTION = /\b(you should|you must|we recommend|fix this|fix the|please add|needs to|should have|need to|try |fix by)\b/i;
    const BANNED_SEVERITY = /\b(critical|serious|minor)\b/i;
    const BANNED_BLAME = /\b(you forgot|you missed)\b/i;

    const pages = [barePage, invalidJsonLd, missingType, partialOg];

    it('contains no judgment words in any finding text', () => {
      for (const page of pages) {
        const result = checkStructuredData(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_JUDGMENT);
        }
      }
    });

    it('contains no prescription words in any finding text', () => {
      for (const page of pages) {
        const result = checkStructuredData(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_PRESCRIPTION);
        }
      }
    });

    it('contains no severity words in any finding text', () => {
      for (const page of pages) {
        const result = checkStructuredData(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_SEVERITY);
        }
      }
    });

    it('contains no developer-blame in any finding text', () => {
      for (const page of pages) {
        const result = checkStructuredData(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_BLAME);
        }
      }
    });
  });

  describe('contract compliance', () => {
    it('returns the correct shape', () => {
      const result = checkStructuredData(parseHtml(fullyMarkedUp));
      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('every finding has required fields with correct ID format', () => {
      const result = checkStructuredData(parseHtml(barePage));
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(finding.id).toMatch(/^SDATA-\d{3}$/);
        expect(typeof finding.text).toBe('string');
      }
    });

    it('finding IDs are in execution order', () => {
      const result = checkStructuredData(parseHtml(barePage));
      const ids = result.findings.map(f => f.id);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('throws CHECK_MODULE_ERROR on internal failure', () => {
      expect(() => checkStructuredData({})).toThrow();
      try {
        checkStructuredData({});
      } catch (e) {
        expect(e.code).toBe('CHECK_MODULE_ERROR');
      }
    });
  });
});
