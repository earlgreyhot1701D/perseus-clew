import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/shared/parse-html.js';
import { checkContentHtml } from '../../src/checks/frontend/content-html.js';

// --- Fixtures ---

const contentRichPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Great Article</title></head>
<body>
  <main>
    <h1>Understanding Web Agents</h1>
    <p>Web agents are automated systems that navigate and interact with web pages
    on behalf of users. They rely on semantic HTML, structured data, and accessible
    markup to understand what a page contains and what actions are available. This
    article explores how agents interpret content and the signals they depend on to
    operate effectively across diverse web properties. When content is present in the
    initial HTML response, agents can immediately parse and act on it without needing
    to execute JavaScript or wait for client-side rendering to complete.</p>
    <h2>How Agents Read Pages</h2>
    <p>Agents typically fetch the raw HTML and parse it directly. They look for
    headings, landmarks, links, and structured data to build a model of the page.
    Pages that deliver content server-side give agents immediate access to all
    relevant information.</p>
    <a href="/about">About this project</a>
    <a href="/contact">Contact us</a>
  </main>
  <script src="/analytics.js"></script>
  <script src="/framework.js"></script>
  <script src="/vendor.js"></script>
</body>
</html>`;

const emptySpaShell = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>React App</title></head>
<body>
  <div id="root"></div>
  <noscript>You need JavaScript to run this app.</noscript>
  <script src="/static/js/bundle.js"></script>
  <script src="/static/js/chunk.js"></script>
</body>
</html>`;

const contentRichWithScripts = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>News Site</title></head>
<body>
  <header><nav><a href="/">Home</a><a href="/news">News</a></nav></header>
  <main>
    <h1>Breaking News Article</h1>
    <p>This is a full news article with substantial content that has been server
    rendered. It contains multiple paragraphs of real editorial content that an
    agent can read and understand without executing any JavaScript. The article
    discusses important topics and provides valuable information to readers who
    access it through various means including automated agents and screen readers.</p>
    <h2>Details of the Story</h2>
    <p>More content follows here with additional details about the news story,
    providing context and background information that agents can extract and
    summarize for their users.</p>
  </main>
  <script src="/analytics.js"></script>
  <script src="/tracking.js"></script>
  <script src="/ads.js"></script>
  <script src="/social.js"></script>
  <script src="/comments.js"></script>
  <script src="/recommendations.js"></script>
  <script src="/framework.js"></script>
  <script src="/vendor.js"></script>
</body>
</html>`;

const placeholderTitleReactApp = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>React App</title></head>
<body>
  <main><h1>Welcome</h1><p>This page has enough content to pass check 1 easily.
  It contains more than two hundred characters of text so the body content
  threshold is satisfied and only the title check fires.</p></main>
</body>
</html>`;

const placeholderTitleLoading = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Loading...</title></head>
<body>
  <main><h1>Welcome</h1><p>Enough content here to pass the body text threshold.
  More than two hundred characters of real text content present.</p></main>
</body>
</html>`;

const realShortTitle = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Blog</title></head>
<body>
  <main><h1>My Blog</h1><p>A short but real title should not be flagged as a
  placeholder. This page has adequate content for the body text check as well,
  with more than two hundred characters present in the main section.</p></main>
</body>
</html>`;

const hardNoscript = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>App</title></head>
<body>
  <main><h1>Application</h1><p>This page has enough content but also has a noscript
  message requiring JavaScript. The body text exceeds two hundred characters so
  check one passes, but check four fires due to the noscript.</p></main>
  <noscript>Please enable JavaScript to use this application.</noscript>
</body>
</html>`;

const softNoscript = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Site</title></head>
<body>
  <main><h1>Welcome</h1><p>This page has enough content and a soft noscript that
  should not trigger the check. The noscript message is informational, not a hard
  requirement declaration, with more than two hundred characters here.</p></main>
  <noscript>For the best experience, use a modern browser with JavaScript enabled.</noscript>
</body>
</html>`;

const emptyHeadings = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Page</title></head>
<body>
  <main>
    <h1></h1>
    <h2>   </h2>
    <h3>Real Heading</h3>
    <p>This page has enough body content to pass the text threshold check. It has
    more than two hundred characters here and the headings are what we test.</p>
  </main>
</body>
</html>`;

const templateHeadings = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Page</title></head>
<body>
  <main>
    <h1>{{title}}</h1>
    <h2>%PAGE_SUBTITLE%</h2>
    <h3>Real Section</h3>
    <p>This page has enough body content to pass the text threshold. More than two
    hundred characters of text are present here for the measurement.</p>
  </main>
</body>
</html>`;

const textlessAnchors = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Links Page</title></head>
<body>
  <main>
    <h1>Resources</h1>
    <p>This page has enough content to pass check one with more than two hundred
    characters of text present in the body.</p>
    <a href="/page1"><img src="icon.png"></a>
    <a href="/page2"></a>
    <a href="/page3" aria-label="Go to page 3">Icon</a>
    <a href="/page4">Real link text</a>
  </main>
</body>
</html>`;

const singleEmptyHeading = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Page</title></head>
<body>
  <main>
    <h1></h1>
    <p>This page has enough body content here with more than two hundred characters
    of text to pass the body content threshold check easily.</p>
  </main>
</body>
</html>`;

const singleTextlessAnchor = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Page</title></head>
<body>
  <main>
    <h1>Title</h1>
    <p>This page has enough body content here with more than two hundred characters
    of text to pass the body content threshold check easily.</p>
    <a href="/x"><img src="i.png"></a>
  </main>
</body>
</html>`;

// --- Tests ---

describe('checkContentHtml', () => {
  describe('content-rich server-rendered page', () => {
    it('passes all checks with no findings', () => {
      const result = checkContentHtml(parseHtml(contentRichPage));
      expect(result.findings).toEqual([]);
      expect(result.passed).toBe(result.total);
      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe('empty SPA shell (thesis case)', () => {
    it('fires CONT-001 for near-zero body text', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      const f = result.findings.find(f => f.id === 'CONT-001');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toMatch(/\d+ characters/);
    });

    it('fires CONT-002 for script-dominant structure', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      const f = result.findings.find(f => f.id === 'CONT-002');
      expect(f).toBeDefined();
    });

    it('fires CONT-003 for placeholder title "React App"', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      const f = result.findings.find(f => f.id === 'CONT-003');
      expect(f).toBeDefined();
    });

    it('fires CONT-004 for noscript requiring JS', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      const f = result.findings.find(f => f.id === 'CONT-004');
      expect(f).toBeDefined();
    });
  });

  describe('content-rich page with many scripts (false-positive guard)', () => {
    it('does NOT fire CONT-002 (content gate prevents)', () => {
      const result = checkContentHtml(parseHtml(contentRichWithScripts));
      const f = result.findings.find(f => f.id === 'CONT-002');
      expect(f).toBeUndefined();
    });

    it('passes check 1 (body has ample content)', () => {
      const result = checkContentHtml(parseHtml(contentRichWithScripts));
      const f = result.findings.find(f => f.id === 'CONT-001');
      expect(f).toBeUndefined();
    });
  });

  describe('placeholder titles', () => {
    it('flags "React App" as placeholder', () => {
      const result = checkContentHtml(parseHtml(placeholderTitleReactApp));
      const f = result.findings.find(f => f.id === 'CONT-003');
      expect(f).toBeDefined();
      expect(f.text).toContain('React App');
    });

    it('flags "Loading..." as placeholder', () => {
      const result = checkContentHtml(parseHtml(placeholderTitleLoading));
      const f = result.findings.find(f => f.id === 'CONT-003');
      expect(f).toBeDefined();
      expect(f.text).toContain('Loading...');
    });

    it('does NOT flag "Blog" as placeholder', () => {
      const result = checkContentHtml(parseHtml(realShortTitle));
      const f = result.findings.find(f => f.id === 'CONT-003');
      expect(f).toBeUndefined();
    });
  });

  describe('noscript messages', () => {
    it('flags hard JS-requirement noscript', () => {
      const result = checkContentHtml(parseHtml(hardNoscript));
      const f = result.findings.find(f => f.id === 'CONT-004');
      expect(f).toBeDefined();
    });

    it('does NOT flag soft informational noscript', () => {
      const result = checkContentHtml(parseHtml(softNoscript));
      const f = result.findings.find(f => f.id === 'CONT-004');
      expect(f).toBeUndefined();
    });
  });

  describe('empty/placeholder headings', () => {
    it('counts empty headings', () => {
      const result = checkContentHtml(parseHtml(emptyHeadings));
      const f = result.findings.find(f => f.id === 'CONT-005');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
    });

    it('counts template placeholder headings', () => {
      const result = checkContentHtml(parseHtml(templateHeadings));
      const f = result.findings.find(f => f.id === 'CONT-005');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
    });
  });

  describe('textless anchors', () => {
    it('counts anchors with no text and no aria-label', () => {
      const result = checkContentHtml(parseHtml(textlessAnchors));
      const f = result.findings.find(f => f.id === 'CONT-006');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
    });
  });

  describe('verb agreement at count=null, count=1, and count>=2', () => {
    it('CONT-001 (binary, count=null) text is correct', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      const f = result.findings.find(f => f.id === 'CONT-001');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('characters of text outside of script and style tags');
    });

    it('CONT-002 (binary, count=null) text is correct', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      const f = result.findings.find(f => f.id === 'CONT-002');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('dominated by script elements');
    });

    it('CONT-003 (binary, count=null) text is correct', () => {
      const result = checkContentHtml(parseHtml(placeholderTitleReactApp));
      const f = result.findings.find(f => f.id === 'CONT-003');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('default placeholder value');
    });

    it('CONT-004 (binary, count=null) text is correct', () => {
      const result = checkContentHtml(parseHtml(hardNoscript));
      const f = result.findings.find(f => f.id === 'CONT-004');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
      expect(f.text).toContain('noscript message requiring JavaScript');
    });

    it('CONT-005 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkContentHtml(parseHtml(singleEmptyHeading));
      const f1 = r1.findings.find(f => f.id === 'CONT-005');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 heading element has');

      const r2 = checkContentHtml(parseHtml(emptyHeadings));
      const f2 = r2.findings.find(f => f.id === 'CONT-005');
      expect(f2).toBeDefined();
      expect(f2.count).toBe(2);
      expect(f2.text).toContain('heading elements have');
    });

    it('CONT-006 count=1 uses "contains", count>=2 uses "contain"', () => {
      const r1 = checkContentHtml(parseHtml(singleTextlessAnchor));
      const f1 = r1.findings.find(f => f.id === 'CONT-006');
      expect(f1).toBeDefined();
      expect(f1.count).toBe(1);
      expect(f1.text).toContain('1 anchor element contains');

      const r2 = checkContentHtml(parseHtml(textlessAnchors));
      const f2 = r2.findings.find(f => f.id === 'CONT-006');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('anchor elements contain');
    });
  });

  describe('read-only verification', () => {
    it('does not mutate the original cheerio instance', () => {
      const parsed = parseHtml(emptySpaShell);
      const htmlBefore = parsed.$.html();
      checkContentHtml(parsed);
      checkContentHtml(parsed);
      const htmlAfter = parsed.$.html();
      expect(htmlAfter).toBe(htmlBefore);
    });
  });

  describe('determinism', () => {
    it('produces identical output on three runs', () => {
      const parsed = parseHtml(emptySpaShell);
      const r1 = checkContentHtml(parsed);
      const r2 = checkContentHtml(parsed);
      const r3 = checkContentHtml(parsed);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('produces identical output on separately parsed instances', () => {
      const p1 = parseHtml(contentRichWithScripts);
      const p2 = parseHtml(contentRichWithScripts);
      expect(checkContentHtml(p1)).toEqual(checkContentHtml(p2));
    });
  });

  describe('voice compliance', () => {
    const BANNED_JUDGMENT = /\b(bad|poor|weak|failing|broken|violates|wrong|incorrect)\b/i;
    const BANNED_PRESCRIPTION = /\b(you should|you must|we recommend|fix this|fix the|please add|needs to|should have|need to|try |fix by)\b/i;
    const BANNED_SEVERITY = /\b(critical|serious|minor)\b/i;
    const BANNED_BLAME = /\b(you forgot|you missed)\b/i;
    const BANNED_FRAMEWORK = /\b(your SPA|your app|your framework|your React|your Vue)\b/i;

    const pages = [emptySpaShell, emptyHeadings, templateHeadings, textlessAnchors, hardNoscript, placeholderTitleReactApp];

    it('contains no judgment words in any finding text', () => {
      for (const page of pages) {
        const result = checkContentHtml(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_JUDGMENT);
        }
      }
    });

    it('contains no prescription words in any finding text', () => {
      for (const page of pages) {
        const result = checkContentHtml(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_PRESCRIPTION);
        }
      }
    });

    it('contains no severity words in any finding text', () => {
      for (const page of pages) {
        const result = checkContentHtml(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_SEVERITY);
        }
      }
    });

    it('contains no developer-blame in any finding text', () => {
      for (const page of pages) {
        const result = checkContentHtml(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_BLAME);
        }
      }
    });

    it('contains no framework-blaming in any finding text', () => {
      for (const page of pages) {
        const result = checkContentHtml(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_FRAMEWORK);
        }
      }
    });
  });

  describe('contract compliance', () => {
    it('returns the correct shape', () => {
      const result = checkContentHtml(parseHtml(contentRichPage));
      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('every finding has required fields with correct ID format', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(finding.id).toMatch(/^CONT-\d{3}$/);
        expect(typeof finding.text).toBe('string');
      }
    });

    it('finding IDs are in execution order', () => {
      const result = checkContentHtml(parseHtml(emptySpaShell));
      const ids = result.findings.map(f => f.id);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('throws CHECK_MODULE_ERROR on internal failure', () => {
      expect(() => checkContentHtml({})).toThrow();
      try {
        checkContentHtml({});
      } catch (e) {
        expect(e.code).toBe('CHECK_MODULE_ERROR');
      }
    });
  });
});
