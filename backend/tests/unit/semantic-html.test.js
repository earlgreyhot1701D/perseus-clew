import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/shared/parse-html.js';
import { checkSemanticHtml } from '../../src/checks/frontend/semantic-html.js';

// --- Fixtures ---

const wellBuiltPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Well Built</title></head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main>
    <h1>Welcome</h1>
    <h2>Features</h2>
    <p>Some content here.</p>
    <h3>Detail</h3>
    <ul>
      <li>Item one</li>
      <li>Item two</li>
      <li>Item three</li>
    </ul>
    <form action="/submit">
      <label for="email">Email</label>
      <input id="email" type="email">
      <button type="submit">Send</button>
    </form>
  </main>
  <div class="card-grid">
    <div class="card"><img src="a.jpg"><h3>Card A</h3><p>Desc</p></div>
    <div class="card"><img src="b.jpg"><h3>Card B</h3><p>Desc</p><span class="badge">New</span></div>
    <div class="card"><img src="c.jpg"><h3>Card C</h3><p>Desc</p></div>
  </div>
</body>
</html>`;

const divSoupPage = `<!DOCTYPE html>
<html>
<head><title>Div Soup</title></head>
<body>
  <div onclick="navigate()">Menu</div>
  <div onclick="doThing()">Action 1</div>
  <div role="button">Action 2</div>
  <span onclick="click()">Click me</span>
  <div>
    <h1>Title</h1>
    <h3>Skipped to h3</h3>
    <h2>Back to h2</h2>
  </div>
  <div class="items">
    <div><span>Icon</span><p>Item 1</p></div>
    <div><span>Icon</span><p>Item 2</p></div>
    <div><span>Icon</span><p>Item 3</p></div>
  </div>
  <input type="text" placeholder="Name">
  <select><option>Choose</option></select>
</body>
</html>`;

const mixedPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mixed</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <h1>Page Title</h1>
    <h2>Section</h2>
    <div onclick="openModal()">Open</div>
    <div onclick="save()">Save</div>
    <form action="/go">
      <input type="text">
      <button type="submit">Go</button>
    </form>
  </main>
</body>
</html>`;

const emptyPage = `<!DOCTYPE html>
<html><head><title>Empty</title></head><body></body></html>`;

const cardGridNoFalsePositive = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Cards</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <h1>Products</h1>
    <div class="grid">
      <div class="card"><img src="a.jpg"><h3>Product A</h3><p>$10</p></div>
      <div class="card"><img src="b.jpg"><h3>Product B</h3><p>$20</p><span class="sale">Sale</span></div>
      <div class="card"><img src="c.jpg"><h3>Product C</h3><p>$30</p></div>
    </div>
    <aside class="layout">
      <div class="sidebar"><nav><a href="/cat">Cat</a></nav></div>
      <div class="content"><article><p>Main content</p></article></div>
      <div class="footer"><p>Footer info</p></div>
    </aside>
  </main>
</body>
</html>`;

const multipleMainPage = `<!DOCTYPE html>
<html lang="en">
<head><title>Multi Main</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main><h1>First</h1></main>
  <main><h2>Second</h2></main>
</body>
</html>`;

// --- Tests ---

describe('checkSemanticHtml', () => {
  describe('well-built page', () => {
    it('scores 6/6 with no findings', () => {
      const parsed = parseHtml(wellBuiltPage);
      const result = checkSemanticHtml(parsed);
      expect(result.passed).toBe(6);
      expect(result.total).toBe(6);
      expect(result.findings).toEqual([]);
    });
  });

  describe('div-soup page', () => {
    it('produces findings for all six checks', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      expect(result.passed).toBe(0);
      expect(result.total).toBe(6);
      expect(result.findings.length).toBe(6);
    });

    it('emits SEM-001 for clickable divs/spans', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-001');
      expect(f).toBeDefined();
      expect(f.count).toBe(4);
      expect(f.text).toContain('elements with click handlers use');
      expect(f.examples).toBeDefined();
      expect(f.examples.length).toBeLessThanOrEqual(3);
    });

    it('SEM-001 uses singular verb for count=1', () => {
      const html = `<!DOCTYPE html><html><head><title>One</title></head><body>
        <div onclick="go()">Click</div>
        <nav><a href="/">Home</a></nav><main><h1>Hi</h1></main>
      </body></html>`;
      const parsed = parseHtml(html);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-001');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
      expect(f.text).toContain('1 element with click handlers uses');
    });

    it('emits SEM-002 for missing nav', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-002');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
    });

    it('emits SEM-003 for missing main', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-003');
      expect(f).toBeDefined();
      expect(f.count).toBeNull();
    });

    it('emits SEM-004 for heading hierarchy skip', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-004');
      expect(f).toBeDefined();
      expect(f.text).toContain('skips');
    });

    it('emits SEM-005 for loose list-like content', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-005');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits SEM-006 for inputs outside form', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-006');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
    });
  });

  describe('mixed page', () => {
    it('passes some checks and fails others', () => {
      const parsed = parseHtml(mixedPage);
      const result = checkSemanticHtml(parsed);
      expect(result.passed).toBeGreaterThan(0);
      expect(result.passed).toBeLessThan(6);
      expect(result.total).toBe(6);
    });

    it('emits SEM-001 for clickable divs', () => {
      const parsed = parseHtml(mixedPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-001');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
    });

    it('does not emit SEM-002 (nav is present)', () => {
      const parsed = parseHtml(mixedPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-002');
      expect(f).toBeUndefined();
    });

    it('does not emit SEM-003 (single main present)', () => {
      const parsed = parseHtml(mixedPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-003');
      expect(f).toBeUndefined();
    });
  });

  describe('empty page', () => {
    it('returns total=6 with applicable findings', () => {
      const parsed = parseHtml(emptyPage);
      const result = checkSemanticHtml(parsed);
      expect(result.total).toBe(6);
      // No clickable elements, no inputs: those checks pass
      // No nav, no main, no headings: those fail
      expect(result.findings.some(f => f.id === 'SEM-002')).toBe(true);
      expect(result.findings.some(f => f.id === 'SEM-003')).toBe(true);
      expect(result.findings.some(f => f.id === 'SEM-004')).toBe(true);
    });
  });

  describe('multiple main elements', () => {
    it('emits SEM-003 with count for multiple mains', () => {
      const parsed = parseHtml(multipleMainPage);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-003');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
      expect(f.text).toContain('2 main landmarks');
    });
  });

  describe('false-positive resistance (check 5)', () => {
    it('does not flag card grid with varied internal structure', () => {
      const parsed = parseHtml(cardGridNoFalsePositive);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-005');
      expect(f).toBeUndefined();
    });

    it('does not flag sidebar/main/footer layout', () => {
      const parsed = parseHtml(cardGridNoFalsePositive);
      const result = checkSemanticHtml(parsed);
      const f = result.findings.find(f => f.id === 'SEM-005');
      expect(f).toBeUndefined();
    });
  });

  describe('determinism', () => {
    it('produces identical output on two runs of the same input', () => {
      const parsed = parseHtml(divSoupPage);
      const result1 = checkSemanticHtml(parsed);
      const result2 = checkSemanticHtml(parsed);
      expect(result1).toEqual(result2);
    });

    it('produces identical output on two separately parsed instances', () => {
      const parsed1 = parseHtml(mixedPage);
      const parsed2 = parseHtml(mixedPage);
      const result1 = checkSemanticHtml(parsed1);
      const result2 = checkSemanticHtml(parsed2);
      expect(result1).toEqual(result2);
    });
  });

  describe('voice compliance', () => {
    const BANNED_JUDGMENT = /\b(bad|poor|weak|failing|broken|violates|wrong|incorrect)\b/i;
    const BANNED_PRESCRIPTION = /\b(you should|you must|we recommend|fix this|fix the|please add|needs to|should have|need to|try |fix by)\b/i;
    const BANNED_SEVERITY = /\b(critical|serious|minor)\b/i;
    const BANNED_BLAME = /\b(you forgot|you missed)\b/i;

    it('contains no judgment words in any finding text', () => {
      const pages = [divSoupPage, mixedPage, emptyPage, multipleMainPage];
      for (const page of pages) {
        const parsed = parseHtml(page);
        const result = checkSemanticHtml(parsed);
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_JUDGMENT);
        }
      }
    });

    it('contains no prescription words in any finding text', () => {
      const pages = [divSoupPage, mixedPage, emptyPage, multipleMainPage];
      for (const page of pages) {
        const parsed = parseHtml(page);
        const result = checkSemanticHtml(parsed);
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_PRESCRIPTION);
        }
      }
    });

    it('contains no severity words in any finding text', () => {
      const pages = [divSoupPage, mixedPage, emptyPage, multipleMainPage];
      for (const page of pages) {
        const parsed = parseHtml(page);
        const result = checkSemanticHtml(parsed);
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_SEVERITY);
        }
      }
    });

    it('contains no developer-blame in any finding text', () => {
      const pages = [divSoupPage, mixedPage, emptyPage, multipleMainPage];
      for (const page of pages) {
        const parsed = parseHtml(page);
        const result = checkSemanticHtml(parsed);
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_BLAME);
        }
      }
    });
  });

  describe('contract compliance', () => {
    it('returns the correct shape', () => {
      const parsed = parseHtml(wellBuiltPage);
      const result = checkSemanticHtml(parsed);
      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('every finding has required fields', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(finding.id).toMatch(/^SEM-\d{3}$/);
        expect(typeof finding.text).toBe('string');
      }
    });

    it('finding IDs are in execution order (SEM-001 through SEM-006)', () => {
      const parsed = parseHtml(divSoupPage);
      const result = checkSemanticHtml(parsed);
      const ids = result.findings.map(f => f.id);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('throws CHECK_MODULE_ERROR on internal failure', () => {
      expect(() => checkSemanticHtml({})).toThrow();
      try {
        checkSemanticHtml({});
      } catch (e) {
        expect(e.code).toBe('CHECK_MODULE_ERROR');
      }
    });
  });
});
