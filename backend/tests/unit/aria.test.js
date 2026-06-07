import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/shared/parse-html.js';
import { checkAria } from '../../src/checks/frontend/aria.js';

// --- Fixtures ---

const plainSemanticPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Plain Semantic</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <h1>Welcome</h1>
    <button>Click me</button>
    <select><option>One</option><option>Two</option></select>
    <details><summary>More info</summary><p>Details here.</p></details>
  </main>
</body>
</html>`;

const wellBuiltAriaPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Good ARIA</title></head>
<body>
  <main>
    <h1>App</h1>
    <div class="dropdown" role="listbox" aria-expanded="false" onclick="toggle()">
      <button aria-label="Open menu">Menu</button>
    </div>
    <div class="tab-list" role="tablist">
      <div role="tab" aria-selected="true" tabindex="0">Tab 1</div>
      <div role="tab" aria-selected="false" tabindex="0">Tab 2</div>
    </div>
    <div class="toast-container" aria-live="polite">
      <p>Notification area</p>
    </div>
    <button aria-label="Close"><svg viewBox="0 0 24 24"></svg></button>
  </main>
</body>
</html>`;

const badAriaPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Bad ARIA</title></head>
<body>
  <main>
    <h1>App</h1>
    <div class="dropdown" onclick="toggle()">Options</div>
    <div role="tab">Tab A</div>
    <div role="tab">Tab B</div>
    <div class="accordion" onclick="expand()">Section 1</div>
    <button><svg viewBox="0 0 24 24"></svg></button>
    <div class="toast-message">Something happened</div>
    <button role="presentation">Fake</button>
    <div aria-hidden="true"><a href="/link">Hidden link</a></div>
  </main>
</body>
</html>`;

const mixedAriaPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mixed ARIA</title></head>
<body>
  <main>
    <h1>App</h1>
    <div class="dropdown" role="menu" onclick="toggle()">Options</div>
    <div role="tab" aria-selected="true" tabindex="0">Tab 1</div>
    <div role="tab">Tab 2</div>
    <button aria-label="Save"><svg viewBox="0 0 24 24"></svg></button>
    <button><svg viewBox="0 0 16 16"></svg></button>
    <div class="notification" aria-live="assertive">Alerts here</div>
  </main>
</body>
</html>`;

const camelCaseHits = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>CamelCase</title></head>
<body>
  <main>
    <h1>App</h1>
    <div class="userDropdown" onclick="open()">Pick user</div>
    <div class="toastNotification">Update saved</div>
  </main>
</body>
</html>`;

const substringTraps = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Substring Traps</title></head>
<body>
  <main>
    <h1>Data</h1>
    <div class="tabular-data" onclick="sort()">
      <button>Sort</button>
    </div>
    <div class="modalanalysis" onclick="run()">
      <button>Run</button>
    </div>
    <div class="table-of-contents">
      <a href="#s1">Section 1</a>
    </div>
    <div class="radioactive-info">Details</div>
  </main>
</body>
</html>`;

const check5Negative = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Check5 Neg</title></head>
<body>
  <main>
    <h1>Page</h1>
    <div class="content">Normal content</div>
    <div class="message-box">Some message</div>
    <div id="info-panel">Info here</div>
  </main>
</body>
</html>`;

const singleFindingFixtures = {
  aria001: `<!DOCTYPE html><html><head><title>T</title></head><body>
    <div class="dropdown" onclick="go()">One</div>
  </body></html>`,
  aria002: `<!DOCTYPE html><html><head><title>T</title></head><body>
    <div role="tab">One tab</div>
  </body></html>`,
  aria003: `<!DOCTYPE html><html><head><title>T</title></head><body>
    <div class="accordion" onclick="x()">Section</div>
  </body></html>`,
  aria004: `<!DOCTYPE html><html><head><title>T</title></head><body>
    <button><svg viewBox="0 0 24 24"></svg></button>
  </body></html>`,
  aria005: `<!DOCTYPE html><html><head><title>T</title></head><body>
    <div class="toast">Msg</div>
  </body></html>`,
  aria006: `<!DOCTYPE html><html><head><title>T</title></head><body>
    <button role="presentation">X</button>
  </body></html>`
};

// --- Tests ---

describe('checkAria', () => {
  describe('plain semantic page (no custom widgets)', () => {
    it('returns passed:0, total:0, findings:[] (not penalized)', () => {
      const result = checkAria(parseHtml(plainSemanticPage));
      expect(result.passed).toBe(0);
      expect(result.total).toBe(0);
      expect(result.findings).toEqual([]);
    });
  });

  describe('well-built ARIA page', () => {
    it('passes all applicable checks with no findings', () => {
      const result = checkAria(parseHtml(wellBuiltAriaPage));
      expect(result.findings).toEqual([]);
      expect(result.passed).toBe(result.total);
      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe('bad ARIA page', () => {
    it('emits ARIA-001 for dropdown without role', () => {
      const result = checkAria(parseHtml(badAriaPage));
      const f = result.findings.find(f => f.id === 'ARIA-001');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits ARIA-002 for tabs missing aria-selected', () => {
      const result = checkAria(parseHtml(badAriaPage));
      const f = result.findings.find(f => f.id === 'ARIA-002');
      expect(f).toBeDefined();
      expect(f.count).toBe(2);
    });

    it('emits ARIA-003 for accordion missing aria-expanded', () => {
      const result = checkAria(parseHtml(badAriaPage));
      const f = result.findings.find(f => f.id === 'ARIA-003');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits ARIA-004 for icon button without accessible name', () => {
      const result = checkAria(parseHtml(badAriaPage));
      const f = result.findings.find(f => f.id === 'ARIA-004');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits ARIA-005 for toast without aria-live', () => {
      const result = checkAria(parseHtml(badAriaPage));
      const f = result.findings.find(f => f.id === 'ARIA-005');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits ARIA-006 for conflicting ARIA', () => {
      const result = checkAria(parseHtml(badAriaPage));
      const f = result.findings.find(f => f.id === 'ARIA-006');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('mixed ARIA page', () => {
    it('passes some checks and fails others', () => {
      const result = checkAria(parseHtml(mixedAriaPage));
      expect(result.passed).toBeGreaterThan(0);
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  describe('camelCase class token matching', () => {
    it('flags class="userDropdown" as widget (ARIA-001)', () => {
      const result = checkAria(parseHtml(camelCaseHits));
      const f = result.findings.find(f => f.id === 'ARIA-001');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('flags class="toastNotification" as live region (ARIA-005)', () => {
      const result = checkAria(parseHtml(camelCaseHits));
      const f = result.findings.find(f => f.id === 'ARIA-005');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('substring traps (must NOT match)', () => {
    it('does not flag "tabular" as "tab"', () => {
      const result = checkAria(parseHtml(substringTraps));
      const f = result.findings.find(f => f.id === 'ARIA-001');
      expect(f).toBeUndefined();
    });

    it('does not flag "modalanalysis" as "modal"', () => {
      const result = checkAria(parseHtml(substringTraps));
      const f = result.findings.find(f => f.id === 'ARIA-003');
      expect(f).toBeUndefined();
    });

    it('does not flag "table-of-contents" or "radioactive"', () => {
      const result = checkAria(parseHtml(substringTraps));
      expect(result.findings.filter(f => f.id === 'ARIA-001')).toHaveLength(0);
      expect(result.findings.filter(f => f.id === 'ARIA-005')).toHaveLength(0);
    });
  });

  describe('check 5 negatives (normal divs)', () => {
    it('does not flag normal content/message divs as live regions', () => {
      const result = checkAria(parseHtml(check5Negative));
      const f = result.findings.find(f => f.id === 'ARIA-005');
      expect(f).toBeUndefined();
    });
  });

  describe('verb agreement at count=1 and count>=2', () => {
    it('ARIA-001 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkAria(parseHtml(singleFindingFixtures.aria001));
      const f1 = r1.findings.find(f => f.id === 'ARIA-001');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 element');
      expect(f1.text).toContain('has no role');

      const r2 = checkAria(parseHtml(badAriaPage));
      const f2 = r2.findings.find(f => f.id === 'ARIA-001');
      if (f2 && f2.count > 1) {
        expect(f2.text).toContain('have no role');
      }
    });

    it('ARIA-002 count=1 uses "its", count>=2 uses "their"', () => {
      const r1 = checkAria(parseHtml(singleFindingFixtures.aria002));
      const f1 = r1.findings.find(f => f.id === 'ARIA-002');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 element with an interactive ARIA role is');
      expect(f1.text).toContain('missing its required');

      const r2 = checkAria(parseHtml(badAriaPage));
      const f2 = r2.findings.find(f => f.id === 'ARIA-002');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('elements with interactive ARIA roles are');
      expect(f2.text).toContain('missing their required');
    });

    it('ARIA-003 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkAria(parseHtml(singleFindingFixtures.aria003));
      const f1 = r1.findings.find(f => f.id === 'ARIA-003');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('control has no state');

      const multi = `<!DOCTYPE html><html><head><title>T</title></head><body>
        <div class="accordion" onclick="x()">A</div>
        <div class="collapse" onclick="y()">B</div>
      </body></html>`;
      const r2 = checkAria(parseHtml(multi));
      const f2 = r2.findings.find(f => f.id === 'ARIA-003');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('controls have no state');
    });

    it('ARIA-004 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkAria(parseHtml(singleFindingFixtures.aria004));
      const f1 = r1.findings.find(f => f.id === 'ARIA-004');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 button has');

      const multi = `<!DOCTYPE html><html><head><title>T</title></head><body>
        <button><svg></svg></button>
        <button><svg></svg></button>
      </body></html>`;
      const r2 = checkAria(parseHtml(multi));
      const f2 = r2.findings.find(f => f.id === 'ARIA-004');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('buttons have');
    });

    it('ARIA-005 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkAria(parseHtml(singleFindingFixtures.aria005));
      const f1 = r1.findings.find(f => f.id === 'ARIA-005');
      expect(f1).toBeDefined();
      expect(f1.text).toMatch(/1 element .+ has no aria-live/);

      const multi = `<!DOCTYPE html><html><head><title>T</title></head><body>
        <div class="toast">A</div>
        <div class="snackbar">B</div>
      </body></html>`;
      const r2 = checkAria(parseHtml(multi));
      const f2 = r2.findings.find(f => f.id === 'ARIA-005');
      expect(f2).toBeDefined();
      expect(f2.text).toMatch(/elements .+ have no aria-live/);
    });

    it('ARIA-006 count=1 uses "has" and "receive", count>=2 uses "have" and "receive"', () => {
      const r1 = checkAria(parseHtml(singleFindingFixtures.aria006));
      const f1 = r1.findings.find(f => f.id === 'ARIA-006');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 element has');
      expect(f1.text).toContain('this element receive contradictory');

      const r2 = checkAria(parseHtml(badAriaPage));
      const f2 = r2.findings.find(f => f.id === 'ARIA-006');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('elements have');
      expect(f2.text).toContain('these elements receive contradictory');
    });
  });

  describe('determinism', () => {
    it('produces identical output on three runs', () => {
      const parsed = parseHtml(badAriaPage);
      const r1 = checkAria(parsed);
      const r2 = checkAria(parsed);
      const r3 = checkAria(parsed);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('produces identical output on separately parsed instances', () => {
      const p1 = parseHtml(mixedAriaPage);
      const p2 = parseHtml(mixedAriaPage);
      expect(checkAria(p1)).toEqual(checkAria(p2));
    });
  });

  describe('voice compliance', () => {
    const BANNED_JUDGMENT = /\b(bad|poor|weak|failing|broken|violates|wrong|incorrect)\b/i;
    const BANNED_PRESCRIPTION = /\b(you should|you must|we recommend|fix this|fix the|please add|needs to|should have|need to|try |fix by)\b/i;
    const BANNED_SEVERITY = /\b(critical|serious|minor)\b/i;
    const BANNED_BLAME = /\b(you forgot|you missed)\b/i;

    const pages = [badAriaPage, mixedAriaPage, camelCaseHits];

    it('contains no judgment words in any finding text', () => {
      for (const page of pages) {
        const result = checkAria(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_JUDGMENT);
        }
      }
    });

    it('contains no prescription words in any finding text', () => {
      for (const page of pages) {
        const result = checkAria(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_PRESCRIPTION);
        }
      }
    });

    it('contains no severity words in any finding text', () => {
      for (const page of pages) {
        const result = checkAria(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_SEVERITY);
        }
      }
    });

    it('contains no developer-blame in any finding text', () => {
      for (const page of pages) {
        const result = checkAria(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_BLAME);
        }
      }
    });
  });

  describe('contract compliance', () => {
    it('returns the correct shape', () => {
      const result = checkAria(parseHtml(wellBuiltAriaPage));
      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('every finding has required fields with correct ID format', () => {
      const result = checkAria(parseHtml(badAriaPage));
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(finding.id).toMatch(/^ARIA-\d{3}$/);
        expect(typeof finding.text).toBe('string');
        expect(typeof finding.count).toBe('number');
      }
    });

    it('finding IDs are in execution order', () => {
      const result = checkAria(parseHtml(badAriaPage));
      const ids = result.findings.map(f => f.id);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('throws CHECK_MODULE_ERROR on internal failure', () => {
      expect(() => checkAria({})).toThrow();
      try {
        checkAria({});
      } catch (e) {
        expect(e.code).toBe('CHECK_MODULE_ERROR');
      }
    });
  });
});
