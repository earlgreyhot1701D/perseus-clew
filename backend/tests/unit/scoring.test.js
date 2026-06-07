import { describe, it, expect } from 'vitest';
import { calculateScore } from '../../src/checks/frontend/scoring.js';

// --- Helper: assert the trust property on every result ---

function assertTrustProperties(result) {
  // The parts always add up to the total exactly
  const breakdownSum = Object.values(result.breakdown).reduce((sum, cat) => sum + cat.earned, 0);
  expect(breakdownSum).toBe(result.total);

  // Total is always 0-100
  expect(result.total).toBeGreaterThanOrEqual(0);
  expect(result.total).toBeLessThanOrEqual(100);

  // Total is an integer
  expect(Number.isInteger(result.total)).toBe(true);

  // All earned values are integers
  for (const cat of Object.values(result.breakdown)) {
    expect(Number.isInteger(cat.earned)).toBe(true);
  }
}

// --- Helper: make a full input with defaults ---

function makeInput(overrides = {}) {
  const defaults = {
    semantic_html: { passed: 6, total: 6, findings: [] },
    form_accessibility: { passed: 6, total: 6, findings: [] },
    aria: { passed: 6, total: 6, findings: [] },
    structured_data: { passed: 7, total: 7, findings: [] },
    content_in_html: { passed: 6, total: 6, findings: [] },
    link_navigation: { passed: 6, total: 6, findings: [] }
  };
  return { ...defaults, ...overrides };
}

// --- Tests ---

describe('calculateScore', () => {
  describe('spec worked example', () => {
    it('produces total=78, rating=Partially Ready with correct breakdown', () => {
      const input = {
        semantic_html: { passed: 4, total: 6, findings: [] },
        form_accessibility: { passed: 0, total: 0, findings: [] },
        aria: { passed: 3, total: 6, findings: [] },
        structured_data: { passed: 5, total: 7, findings: [] },
        content_in_html: { passed: 6, total: 6, findings: [] },
        link_navigation: { passed: 4, total: 6, findings: [] }
      };

      const result = calculateScore(input);

      expect(result.total).toBe(78);
      expect(result.rating).toBe('Partially Ready');

      // Per-category breakdown (Option A rounding: round each, then sum)
      // semantic: 4/6 * 25 = 16.667 -> 17
      expect(result.breakdown.semantic_html.earned).toBe(17);
      expect(result.breakdown.semantic_html.max).toBe(25);
      expect(result.breakdown.semantic_html.note).toBeNull();

      // form: 0/0 -> full credit 20, note
      expect(result.breakdown.form_accessibility.earned).toBe(20);
      expect(result.breakdown.form_accessibility.max).toBe(20);
      expect(result.breakdown.form_accessibility.note).toBe('no forms present');

      // aria: 3/6 * 15 = 7.5 -> 8
      expect(result.breakdown.aria.earned).toBe(8);
      expect(result.breakdown.aria.max).toBe(15);
      expect(result.breakdown.aria.note).toBeNull();

      // structured: 5/7 * 15 = 10.714 -> 11
      expect(result.breakdown.structured_data.earned).toBe(11);
      expect(result.breakdown.structured_data.max).toBe(15);
      expect(result.breakdown.structured_data.note).toBeNull();

      // content: 6/6 * 15 = 15 -> 15
      expect(result.breakdown.content_in_html.earned).toBe(15);
      expect(result.breakdown.content_in_html.max).toBe(15);
      expect(result.breakdown.content_in_html.note).toBeNull();

      // link: 4/6 * 10 = 6.667 -> 7
      expect(result.breakdown.link_navigation.earned).toBe(7);
      expect(result.breakdown.link_navigation.max).toBe(10);
      expect(result.breakdown.link_navigation.note).toBeNull();

      assertTrustProperties(result);
    });
  });

  describe('perfect page', () => {
    it('produces total=100, rating=Agent-Ready', () => {
      const input = makeInput();
      const result = calculateScore(input);

      expect(result.total).toBe(100);
      expect(result.rating).toBe('Agent-Ready');

      for (const cat of Object.values(result.breakdown)) {
        expect(cat.note).toBeNull();
      }

      assertTrustProperties(result);
    });
  });

  describe('zero page (all passed=0, total>0)', () => {
    it('produces total=0, rating=Not Yet Readable', () => {
      const input = {
        semantic_html: { passed: 0, total: 6, findings: [] },
        form_accessibility: { passed: 0, total: 6, findings: [] },
        aria: { passed: 0, total: 6, findings: [] },
        structured_data: { passed: 0, total: 7, findings: [] },
        content_in_html: { passed: 0, total: 6, findings: [] },
        link_navigation: { passed: 0, total: 6, findings: [] }
      };

      const result = calculateScore(input);

      expect(result.total).toBe(0);
      expect(result.rating).toBe('Not Yet Readable');
      assertTrustProperties(result);
    });
  });

  describe('zero-instance rules', () => {
    it('form_accessibility 0/0 -> earned=20, note="no forms present"', () => {
      const input = makeInput({ form_accessibility: { passed: 0, total: 0, findings: [] } });
      const result = calculateScore(input);

      expect(result.breakdown.form_accessibility.earned).toBe(20);
      expect(result.breakdown.form_accessibility.note).toBe('no forms present');
      assertTrustProperties(result);
    });

    it('aria 0/0 -> earned=15, note="no custom widgets present"', () => {
      const input = makeInput({ aria: { passed: 0, total: 0, findings: [] } });
      const result = calculateScore(input);

      expect(result.breakdown.aria.earned).toBe(15);
      expect(result.breakdown.aria.note).toBe('no custom widgets present');
      assertTrustProperties(result);
    });

    it('link_navigation 0/0 -> earned=10, note="no links present"', () => {
      const input = makeInput({ link_navigation: { passed: 0, total: 0, findings: [] } });
      const result = calculateScore(input);

      expect(result.breakdown.link_navigation.earned).toBe(10);
      expect(result.breakdown.link_navigation.note).toBe('no links present');
      assertTrustProperties(result);
    });

    it('semantic_html 0/0 -> earned=25, note=null (defensive)', () => {
      const input = makeInput({ semantic_html: { passed: 0, total: 0, findings: [] } });
      const result = calculateScore(input);

      expect(result.breakdown.semantic_html.earned).toBe(25);
      expect(result.breakdown.semantic_html.note).toBeNull();
      assertTrustProperties(result);
    });
  });

  describe('rating band boundaries', () => {
    it('score=80 -> Agent-Ready', () => {
      const input = {
        semantic_html: { passed: 6, total: 6, findings: [] },
        form_accessibility: { passed: 6, total: 6, findings: [] },
        aria: { passed: 6, total: 6, findings: [] },
        structured_data: { passed: 7, total: 7, findings: [] },
        content_in_html: { passed: 2, total: 6, findings: [] },
        link_navigation: { passed: 0, total: 6, findings: [] }
      };
      const result = calculateScore(input);
      expect(result.total).toBe(80);
      expect(result.rating).toBe('Agent-Ready');
      assertTrustProperties(result);
    });

    it('score=79 -> Partially Ready', () => {
      const input = {
        semantic_html: { passed: 5, total: 6, findings: [] },
        form_accessibility: { passed: 6, total: 6, findings: [] },
        aria: { passed: 6, total: 6, findings: [] },
        structured_data: { passed: 7, total: 7, findings: [] },
        content_in_html: { passed: 1, total: 6, findings: [] },
        link_navigation: { passed: 3, total: 6, findings: [] }
      };
      const result = calculateScore(input);
      expect(result.total).toBe(79);
      expect(result.rating).toBe('Partially Ready');
      assertTrustProperties(result);
    });

    it('score=50 -> Partially Ready', () => {
      const input = {
        semantic_html: { passed: 4, total: 6, findings: [] },
        form_accessibility: { passed: 3, total: 6, findings: [] },
        aria: { passed: 2, total: 6, findings: [] },
        structured_data: { passed: 3, total: 7, findings: [] },
        content_in_html: { passed: 2, total: 6, findings: [] },
        link_navigation: { passed: 4, total: 6, findings: [] }
      };
      const result = calculateScore(input);
      expect(result.total).toBe(50);
      expect(result.rating).toBe('Partially Ready');
      assertTrustProperties(result);
    });

    it('score=49 -> Not Yet Readable', () => {
      const input = {
        semantic_html: { passed: 4, total: 6, findings: [] },
        form_accessibility: { passed: 3, total: 6, findings: [] },
        aria: { passed: 2, total: 6, findings: [] },
        structured_data: { passed: 4, total: 7, findings: [] },
        content_in_html: { passed: 1, total: 6, findings: [] },
        link_navigation: { passed: 3, total: 6, findings: [] }
      };
      const result = calculateScore(input);
      expect(result.total).toBe(49);
      expect(result.rating).toBe('Not Yet Readable');
      assertTrustProperties(result);
    });
  });

  describe('rounding edge cases', () => {
    it('aria 1/2 (7.5) rounds to 8 consistently', () => {
      const input = makeInput({ aria: { passed: 1, total: 2, findings: [] } });
      const result = calculateScore(input);
      expect(result.breakdown.aria.earned).toBe(8);
      assertTrustProperties(result);
    });

    it('semantic 1/3 (8.33) rounds to 8', () => {
      const input = makeInput({ semantic_html: { passed: 1, total: 3, findings: [] } });
      const result = calculateScore(input);
      expect(result.breakdown.semantic_html.earned).toBe(8);
      assertTrustProperties(result);
    });

    it('link 1/3 (3.33) rounds to 3', () => {
      const input = makeInput({ link_navigation: { passed: 1, total: 3, findings: [] } });
      const result = calculateScore(input);
      expect(result.breakdown.link_navigation.earned).toBe(3);
      assertTrustProperties(result);
    });
  });

  describe('passed > total (clamp)', () => {
    it('clamps earned to max, does not produce earned > max', () => {
      const input = makeInput({ semantic_html: { passed: 10, total: 6, findings: [] } });
      const result = calculateScore(input);
      expect(result.breakdown.semantic_html.earned).toBe(25);
      assertTrustProperties(result);
    });

    it('does not throw on passed > total', () => {
      const input = makeInput({ aria: { passed: 99, total: 6, findings: [] } });
      expect(() => calculateScore(input)).not.toThrow();
    });
  });

  describe('input validation', () => {
    it('throws SCORING_INVALID_INPUT for null input', () => {
      expect(() => calculateScore(null)).toThrow();
      try { calculateScore(null); } catch (e) { expect(e.code).toBe('SCORING_INVALID_INPUT'); }
    });

    it('throws SCORING_INVALID_INPUT for missing category', () => {
      const input = makeInput();
      delete input.aria;
      expect(() => calculateScore(input)).toThrow();
      try { calculateScore(input); } catch (e) { expect(e.code).toBe('SCORING_INVALID_INPUT'); }
    });

    it('throws SCORING_INVALID_INPUT for non-numeric passed', () => {
      const input = makeInput({ semantic_html: { passed: 'x', total: 6, findings: [] } });
      expect(() => calculateScore(input)).toThrow();
      try { calculateScore(input); } catch (e) { expect(e.code).toBe('SCORING_INVALID_INPUT'); }
    });

    it('throws SCORING_INVALID_INPUT for negative total', () => {
      const input = makeInput({ form_accessibility: { passed: 0, total: -1, findings: [] } });
      expect(() => calculateScore(input)).toThrow();
      try { calculateScore(input); } catch (e) { expect(e.code).toBe('SCORING_INVALID_INPUT'); }
    });
  });

  describe('determinism', () => {
    it('produces identical output on three runs', () => {
      const input = {
        semantic_html: { passed: 4, total: 6, findings: [] },
        form_accessibility: { passed: 0, total: 0, findings: [] },
        aria: { passed: 3, total: 6, findings: [] },
        structured_data: { passed: 5, total: 7, findings: [] },
        content_in_html: { passed: 6, total: 6, findings: [] },
        link_navigation: { passed: 4, total: 6, findings: [] }
      };
      const r1 = calculateScore(input);
      const r2 = calculateScore(input);
      const r3 = calculateScore(input);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });
  });

  describe('does not mutate input', () => {
    it('input object is unchanged after scoring', () => {
      const input = {
        semantic_html: { passed: 4, total: 6, findings: [{ id: 'SEM-001' }] },
        form_accessibility: { passed: 0, total: 0, findings: [] },
        aria: { passed: 3, total: 6, findings: [] },
        structured_data: { passed: 5, total: 7, findings: [] },
        content_in_html: { passed: 6, total: 6, findings: [] },
        link_navigation: { passed: 4, total: 6, findings: [] }
      };
      const inputCopy = JSON.parse(JSON.stringify(input));
      calculateScore(input);
      expect(input).toEqual(inputCopy);
    });
  });

  describe('output structure', () => {
    it('has total, rating, and breakdown with all six categories', () => {
      const input = makeInput();
      const result = calculateScore(input);

      expect(typeof result.total).toBe('number');
      expect(typeof result.rating).toBe('string');
      expect(typeof result.breakdown).toBe('object');

      const expectedCategories = [
        'semantic_html', 'form_accessibility', 'aria',
        'structured_data', 'content_in_html', 'link_navigation'
      ];
      for (const cat of expectedCategories) {
        expect(result.breakdown[cat]).toBeDefined();
        expect(result.breakdown[cat]).toHaveProperty('earned');
        expect(result.breakdown[cat]).toHaveProperty('max');
        expect(result.breakdown[cat]).toHaveProperty('note');
      }

      assertTrustProperties(result);
    });

    it('weights sum to 100', () => {
      const input = makeInput();
      const result = calculateScore(input);
      const maxSum = Object.values(result.breakdown).reduce((sum, cat) => sum + cat.max, 0);
      expect(maxSum).toBe(100);
    });
  });
});
