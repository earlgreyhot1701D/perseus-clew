import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/shared/parse-html.js';
import { checkFormAccessibility } from '../../src/checks/frontend/form-accessibility.js';

// --- Fixtures ---

const noFormsPage = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>No Forms</title></head>
<body>
  <main><h1>Hello</h1><p>No forms here.</p></main>
</body>
</html>`;

const wellBuiltForm = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Good Form</title></head>
<body>
  <main>
    <h1>Sign Up</h1>
    <form action="/register">
      <label for="user-email">Email *</label>
      <input id="user-email" type="email" name="email" required>

      <label for="user-phone">Phone</label>
      <input id="user-phone" type="tel" name="phone">

      <label for="user-url">Website</label>
      <input id="user-url" type="url" name="website">

      <fieldset>
        <legend>Notifications</legend>
        <label><input type="radio" name="notify" value="yes"> Yes</label>
        <label><input type="radio" name="notify" value="no"> No</label>
      </fieldset>

      <fieldset>
        <legend>Interests</legend>
        <label><input type="checkbox" name="interests" value="tech"> Tech</label>
        <label><input type="checkbox" name="interests" value="art"> Art</label>
      </fieldset>

      <button type="submit">Register</button>
    </form>
  </main>
</body>
</html>`;

const badForm = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Bad Form</title></head>
<body>
  <main>
    <h1>Contact</h1>
    <form action="/contact">
      <input type="text" name="email" placeholder="Email">
      <input type="text" name="phone">
      <span>Name *</span>
      <input type="text" id="name-field">
      <input type="radio" name="pref" value="a"> A
      <input type="radio" name="pref" value="b"> B
      <input type="radio" name="pref" value="c"> C
      <div onclick="submit()">Send</div>
    </form>
  </main>
</body>
</html>`;

const mixedForm = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mixed Form</title></head>
<body>
  <main>
    <h1>Login</h1>
    <form action="/login">
      <label for="login-email">Email</label>
      <input id="login-email" type="email" name="email" required>

      <input type="text" name="phone" placeholder="Phone number">

      <button type="submit">Login</button>
    </form>
  </main>
</body>
</html>`;

const negativeTypeHeuristic = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Type Negative</title></head>
<body>
  <form action="/order">
    <label for="order-num">Order Number</label>
    <input id="order-num" type="text" name="reference_number">

    <label for="desc">Description</label>
    <input id="desc" type="text" name="description">

    <label for="qty">Quantity</label>
    <input id="qty" type="text" name="item_quantity">

    <button type="submit">Search</button>
  </form>
</body>
</html>`;

const negativeRequiredHeuristic = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Required Negative</title></head>
<body>
  <form action="/search">
    <label for="q">Search query</label>
    <input id="q" type="text" name="q">

    <label for="cat">Category</label>
    <select id="cat" name="category">
      <option>All</option>
      <option>Books</option>
    </select>

    <button type="submit">Go</button>
  </form>
</body>
</html>`;

const hiddenInputsOnly = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Hidden Only</title></head>
<body>
  <form action="/track">
    <input type="hidden" name="csrf" value="abc123">
    <input type="hidden" name="session" value="xyz">
  </form>
</body>
</html>`;

const camelCaseTypeHits = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>CamelCase Hits</title></head>
<body>
  <form action="/signup">
    <label for="ue">Email</label>
    <input id="userEmail" type="text" name="userEmail">

    <label for="up">Phone</label>
    <input id="userPhone" type="text" name="contact_phone">

    <button type="submit">Go</button>
  </form>
</body>
</html>`;

const camelCaseNoFalsePositive = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>CamelCase Safe</title></head>
<body>
  <form action="/order">
    <label for="on">Order Number</label>
    <input id="on" type="text" name="orderNumber">

    <label for="rn">Reference</label>
    <input id="rn" type="text" name="reference_number">

    <button type="submit">Find</button>
  </form>
</body>
</html>`;

const singleRequiredAsterisk = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Single Required</title></head>
<body>
  <form action="/go">
    <label for="nm">Name *</label>
    <input id="nm" type="text" name="name">
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

const multipleRequiredAsterisks = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi Required</title></head>
<body>
  <form action="/go">
    <label for="nm">Name *</label>
    <input id="nm" type="text" name="name">
    <label for="em">Email *</label>
    <input id="em" type="text" name="email">
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

const singleTypeMismatch = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Single Type</title></head>
<body>
  <form action="/go">
    <label for="em">Email</label>
    <input id="em" type="text" name="email">
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

const singleLooseGroup = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Single Group</title></head>
<body>
  <form action="/go">
    <label for="nm">Name</label>
    <input id="nm" type="text" name="name">
    <input type="radio" name="pref" value="a">
    <input type="radio" name="pref" value="b">
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

const multipleLooseGroups = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi Groups</title></head>
<body>
  <form action="/go">
    <label for="nm">Name</label>
    <input id="nm" type="text" name="name">
    <input type="radio" name="color" value="r">
    <input type="radio" name="color" value="g">
    <input type="checkbox" name="opts" value="a">
    <input type="checkbox" name="opts" value="b">
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

// --- Tests ---

describe('checkFormAccessibility', () => {
  describe('zero-instance gate', () => {
    it('returns passed:0, total:0, findings:[] when no forms or inputs exist', () => {
      const parsed = parseHtml(noFormsPage);
      const result = checkFormAccessibility(parsed);
      expect(result.passed).toBe(0);
      expect(result.total).toBe(0);
      expect(result.findings).toEqual([]);
    });

    it('returns passed:0, total:0, findings:[] when only hidden inputs exist', () => {
      const parsed = parseHtml(hiddenInputsOnly);
      const result = checkFormAccessibility(parsed);
      expect(result.passed).toBe(0);
      expect(result.total).toBe(0);
      expect(result.findings).toEqual([]);
    });
  });

  describe('well-built form', () => {
    it('passes all applicable checks with no findings', () => {
      const parsed = parseHtml(wellBuiltForm);
      const result = checkFormAccessibility(parsed);
      expect(result.findings).toEqual([]);
      expect(result.passed).toBe(result.total);
      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe('bad form', () => {
    it('emits FORM-001 for bare inputs (no label, no placeholder)', () => {
      const parsed = parseHtml(badForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-001');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits FORM-002 for placeholder-only input', () => {
      const parsed = parseHtml(badForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-002');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('FORM-001 and FORM-002 are disjoint (no input counted in both)', () => {
      const parsed = parseHtml(badForm);
      const result = checkFormAccessibility(parsed);
      const f1 = result.findings.find(f => f.id === 'FORM-001');
      const f2 = result.findings.find(f => f.id === 'FORM-002');
      // The bad form has: email(placeholder-only), phone(bare), name-field(bare),
      // 3 radios(bare). FORM-001 = 5 bare, FORM-002 = 1 placeholder-only.
      // Total unlabeled = f1.count + f2.count, and they don't overlap.
      expect(f1).toBeDefined();
      expect(f2).toBeDefined();
      expect(f1.count).toBe(5);
      expect(f2.count).toBe(1);
    });

    it('emits FORM-004 for type="text" with name="email"', () => {
      const parsed = parseHtml(badForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-004');
      expect(f).toBeDefined();
      expect(f.count).toBeGreaterThanOrEqual(1);
    });

    it('emits FORM-005 for form without submit button', () => {
      const parsed = parseHtml(badForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-005');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });

    it('emits FORM-006 for loose radio group', () => {
      const parsed = parseHtml(badForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-006');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });
  });

  describe('mixed form', () => {
    it('passes some checks and fails others', () => {
      const parsed = parseHtml(mixedForm);
      const result = checkFormAccessibility(parsed);
      expect(result.passed).toBeGreaterThan(0);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('emits FORM-002 for placeholder-only phone field', () => {
      const parsed = parseHtml(mixedForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-002');
      expect(f).toBeDefined();
      expect(f.count).toBe(1);
    });

    it('does not emit FORM-001 (no bare inputs)', () => {
      const parsed = parseHtml(mixedForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-001');
      expect(f).toBeUndefined();
    });

    it('does not emit FORM-005 (submit button exists)', () => {
      const parsed = parseHtml(mixedForm);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-005');
      expect(f).toBeUndefined();
    });
  });

  describe('negative: type heuristic', () => {
    it('does not flag reference_number or item_quantity as type mismatches', () => {
      const parsed = parseHtml(negativeTypeHeuristic);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-004');
      expect(f).toBeUndefined();
    });
  });

  describe('negative: required heuristic', () => {
    it('does not flag fields as required when no asterisk is present', () => {
      const parsed = parseHtml(negativeRequiredHeuristic);
      const result = checkFormAccessibility(parsed);
      const f = result.findings.find(f => f.id === 'FORM-003');
      expect(f).toBeUndefined();
    });
  });

  describe('determinism', () => {
    it('produces identical output on three runs of the same input', () => {
      const parsed = parseHtml(badForm);
      const r1 = checkFormAccessibility(parsed);
      const r2 = checkFormAccessibility(parsed);
      const r3 = checkFormAccessibility(parsed);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('produces identical output on separately parsed instances', () => {
      const p1 = parseHtml(mixedForm);
      const p2 = parseHtml(mixedForm);
      expect(checkFormAccessibility(p1)).toEqual(checkFormAccessibility(p2));
    });
  });

  describe('voice compliance', () => {
    const BANNED_JUDGMENT = /\b(bad|poor|weak|failing|broken|violates|wrong|incorrect)\b/i;
    const BANNED_PRESCRIPTION = /\b(you should|you must|we recommend|fix this|fix the|please add|needs to|should have|need to|try |fix by)\b/i;
    const BANNED_SEVERITY = /\b(critical|serious|minor)\b/i;
    const BANNED_BLAME = /\b(you forgot|you missed)\b/i;

    const pages = [badForm, mixedForm];

    it('contains no judgment words in any finding text', () => {
      for (const page of pages) {
        const result = checkFormAccessibility(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_JUDGMENT);
        }
      }
    });

    it('contains no prescription words in any finding text', () => {
      for (const page of pages) {
        const result = checkFormAccessibility(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_PRESCRIPTION);
        }
      }
    });

    it('contains no severity words in any finding text', () => {
      for (const page of pages) {
        const result = checkFormAccessibility(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_SEVERITY);
        }
      }
    });

    it('contains no developer-blame in any finding text', () => {
      for (const page of pages) {
        const result = checkFormAccessibility(parseHtml(page));
        for (const finding of result.findings) {
          expect(finding.text).not.toMatch(BANNED_BLAME);
        }
      }
    });
  });

  describe('contract compliance', () => {
    it('returns the correct shape', () => {
      const result = checkFormAccessibility(parseHtml(wellBuiltForm));
      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('every finding has required fields with correct ID format', () => {
      const result = checkFormAccessibility(parseHtml(badForm));
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(finding.id).toMatch(/^FORM-\d{3}$/);
        expect(typeof finding.text).toBe('string');
        expect(typeof finding.count).toBe('number');
      }
    });

    it('finding IDs are in execution order', () => {
      const result = checkFormAccessibility(parseHtml(badForm));
      const ids = result.findings.map(f => f.id);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('throws CHECK_MODULE_ERROR on internal failure', () => {
      expect(() => checkFormAccessibility({})).toThrow();
      try {
        checkFormAccessibility({});
      } catch (e) {
        expect(e.code).toBe('CHECK_MODULE_ERROR');
      }
    });
  });

  describe('camelCase type detection (F-1 fix)', () => {
    it('flags id="userEmail" as type mismatch', () => {
      const result = checkFormAccessibility(parseHtml(camelCaseTypeHits));
      const f = result.findings.find(f => f.id === 'FORM-004');
      expect(f).toBeDefined();
      expect(f.count).toBe(2); // userEmail + contact_phone
    });

    it('does not flag name="orderNumber" (number alone is not a type token)', () => {
      const result = checkFormAccessibility(parseHtml(camelCaseNoFalsePositive));
      const f = result.findings.find(f => f.id === 'FORM-004');
      expect(f).toBeUndefined();
    });

    it('does not flag name="reference_number" (substring resistance preserved)', () => {
      const result = checkFormAccessibility(parseHtml(camelCaseNoFalsePositive));
      const f = result.findings.find(f => f.id === 'FORM-004');
      expect(f).toBeUndefined();
    });
  });

  describe('verb agreement at count=1 and count>=2', () => {
    it('FORM-001 count=1 uses "has", count>=2 uses "have"', () => {
      // mixedForm has no bare inputs; use a targeted fixture
      const html1 = `<!DOCTYPE html><html><head><title>T</title></head><body>
        <form><input type="text"><button type="submit">Go</button></form>
      </body></html>`;
      const r1 = checkFormAccessibility(parseHtml(html1));
      const f1 = r1.findings.find(f => f.id === 'FORM-001');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 input field has');

      // badForm has 5 bare inputs
      const r2 = checkFormAccessibility(parseHtml(badForm));
      const f2 = r2.findings.find(f => f.id === 'FORM-001');
      expect(f2.text).toContain('input fields have');
    });

    it('FORM-002 count=1 uses "relies", count>=2 uses "rely"', () => {
      // mixedForm has 1 placeholder-only
      const r1 = checkFormAccessibility(parseHtml(mixedForm));
      const f1 = r1.findings.find(f => f.id === 'FORM-002');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 input field relies');

      // Multi placeholder fixture
      const html2 = `<!DOCTYPE html><html><head><title>T</title></head><body>
        <form>
          <input type="text" placeholder="A">
          <input type="text" placeholder="B">
          <button type="submit">Go</button>
        </form>
      </body></html>`;
      const r2 = checkFormAccessibility(parseHtml(html2));
      const f2 = r2.findings.find(f => f.id === 'FORM-002');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('input fields rely');
    });

    it('FORM-003 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkFormAccessibility(parseHtml(singleRequiredAsterisk));
      const f1 = r1.findings.find(f => f.id === 'FORM-003');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('but has no required');

      const r2 = checkFormAccessibility(parseHtml(multipleRequiredAsterisks));
      const f2 = r2.findings.find(f => f.id === 'FORM-003');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('but have no required');
    });

    it('FORM-004 count=1 uses "uses", count>=2 uses "use"', () => {
      const r1 = checkFormAccessibility(parseHtml(singleTypeMismatch));
      const f1 = r1.findings.find(f => f.id === 'FORM-004');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('uses type="text"');

      const r2 = checkFormAccessibility(parseHtml(camelCaseTypeHits));
      const f2 = r2.findings.find(f => f.id === 'FORM-004');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('use type="text"');
    });

    it('FORM-005 count=1 uses "has", count>=2 uses "have"', () => {
      const r1 = checkFormAccessibility(parseHtml(badForm));
      const f1 = r1.findings.find(f => f.id === 'FORM-005');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('1 form has');

      const html2 = `<!DOCTYPE html><html><head><title>T</title></head><body>
        <form><input type="text" name="a"></form>
        <form><input type="text" name="b"></form>
      </body></html>`;
      const r2 = checkFormAccessibility(parseHtml(html2));
      const f2 = r2.findings.find(f => f.id === 'FORM-005');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('forms have');
    });

    it('FORM-006 count=1 uses "is not wrapped", count>=2 uses "are not wrapped"', () => {
      const r1 = checkFormAccessibility(parseHtml(singleLooseGroup));
      const f1 = r1.findings.find(f => f.id === 'FORM-006');
      expect(f1).toBeDefined();
      expect(f1.text).toContain('is not wrapped');

      const r2 = checkFormAccessibility(parseHtml(multipleLooseGroups));
      const f2 = r2.findings.find(f => f.id === 'FORM-006');
      expect(f2).toBeDefined();
      expect(f2.text).toContain('are not wrapped');
    });
  });
});
