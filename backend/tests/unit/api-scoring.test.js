/**
 * Perseus Clew: Unit tests for API scoring module.
 *
 * Covers: all-pass (100/Agent-Ready), all-fail (0/Not Yet Readable),
 * mixed (round-then-sum parts add to total), zero-instance in one category
 * (earns full weight), total=0 category (defensive, full credit with note),
 * band boundaries (80, 79, 50, 49), validation errors, determinism.
 *
 * Uses REAL module output shapes ({ passed, total, findings: [] }) to
 * confirm the scorer ignores findings and operates on passed/total only.
 *
 * 'Not Evaluable' is NOT tested here: the scorer does not emit it.
 * That determination belongs upstream (orchestrator).
 */

import { describe, it, expect } from 'vitest';
import { calculateApiScore } from '../../src/scoring/api-scoring.js';

/**
 * Helper: build a full set of category results.
 * Each category gets { passed, total, findings }.
 */
function makeResults(overrides = {}) {
  const defaults = {
    naming_descriptions: { passed: 6, total: 6, findings: [] },
    error_design: { passed: 5, total: 5, findings: [] },
    discoverability: { passed: 4, total: 4, findings: [] },
    response_efficiency: { passed: 4, total: 4, findings: [] },
    reliability_patterns: { passed: 3, total: 3, findings: [] },
    agent_integration: { passed: 4, total: 4, findings: [] }
  };
  return { ...defaults, ...overrides };
}

describe('calculateApiScore', () => {
  describe('all-pass', () => {
    it('returns 100 and Agent-Ready when all categories pass fully', () => {
      const result = calculateApiScore(makeResults());

      expect(result.total).toBe(100);
      expect(result.rating).toBe('Agent-Ready');
      // Every category earns its max
      expect(result.breakdown.naming_descriptions.earned).toBe(25);
      expect(result.breakdown.error_design.earned).toBe(20);
      expect(result.breakdown.discoverability.earned).toBe(20);
      expect(result.breakdown.response_efficiency.earned).toBe(15);
      expect(result.breakdown.reliability_patterns.earned).toBe(10);
      expect(result.breakdown.agent_integration.earned).toBe(10);
    });
  });

  describe('all-fail', () => {
    it('returns 0 and Not Yet Readable when all categories score 0', () => {
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 0, total: 6, findings: [] },
        error_design: { passed: 0, total: 5, findings: [] },
        discoverability: { passed: 0, total: 4, findings: [] },
        response_efficiency: { passed: 0, total: 4, findings: [] },
        reliability_patterns: { passed: 0, total: 3, findings: [] },
        agent_integration: { passed: 0, total: 4, findings: [] }
      }));

      expect(result.total).toBe(0);
      expect(result.rating).toBe('Not Yet Readable');
    });
  });

  describe('mixed scores: round-then-sum, parts add to total', () => {
    it('rounds each category independently then sums (Option A)', () => {
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 4, total: 6, findings: [] },   // round(4/6 * 25) = round(16.67) = 17
        error_design: { passed: 3, total: 5, findings: [] },          // round(3/5 * 20) = round(12) = 12
        discoverability: { passed: 2, total: 4, findings: [] },       // round(2/4 * 20) = round(10) = 10
        response_efficiency: { passed: 3, total: 4, findings: [] },   // round(3/4 * 15) = round(11.25) = 11
        reliability_patterns: { passed: 1, total: 3, findings: [] },  // round(1/3 * 10) = round(3.33) = 3
        agent_integration: { passed: 2, total: 4, findings: [] }      // round(2/4 * 10) = round(5) = 5
      }));

      // Parts: 17 + 12 + 10 + 11 + 3 + 5 = 58
      expect(result.breakdown.naming_descriptions.earned).toBe(17);
      expect(result.breakdown.error_design.earned).toBe(12);
      expect(result.breakdown.discoverability.earned).toBe(10);
      expect(result.breakdown.response_efficiency.earned).toBe(11);
      expect(result.breakdown.reliability_patterns.earned).toBe(3);
      expect(result.breakdown.agent_integration.earned).toBe(5);

      // Total = sum of parts (not independently computed)
      const sumOfParts = Object.values(result.breakdown).reduce((s, b) => s + b.earned, 0);
      expect(result.total).toBe(sumOfParts);
      expect(result.total).toBe(58);
      expect(result.rating).toBe('Partially Ready');
    });
  });

  describe('zero-instance in one category', () => {
    it('grants full weight when a category returns {passed:1, total:1}', () => {
      // This is the actual zero-instance shape from modules
      const result = calculateApiScore(makeResults({
        reliability_patterns: { passed: 1, total: 1, findings: [] }
      }));

      // round(1/1 * 10) = 10 (full weight)
      expect(result.breakdown.reliability_patterns.earned).toBe(10);
      expect(result.breakdown.reliability_patterns.note).toBeNull();
      expect(result.total).toBe(100);
    });
  });

  describe('total=0 category (defensive, divide-by-zero guard)', () => {
    it('grants full weight with note when total is 0', () => {
      const result = calculateApiScore(makeResults({
        discoverability: { passed: 0, total: 0, findings: [] }
      }));

      expect(result.breakdown.discoverability.earned).toBe(20);
      expect(result.breakdown.discoverability.note).toBe('no parameterized paths');
    });
  });

  describe('rating band boundaries', () => {
    it('exactly 80 -> Agent-Ready', () => {
      // Engineer a total of exactly 80
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 5, total: 6, findings: [] },   // round(5/6*25) = round(20.83) = 21
        error_design: { passed: 4, total: 5, findings: [] },          // round(4/5*20) = round(16) = 16
        discoverability: { passed: 3, total: 4, findings: [] },       // round(3/4*20) = round(15) = 15
        response_efficiency: { passed: 3, total: 4, findings: [] },   // round(3/4*15) = round(11.25) = 11
        reliability_patterns: { passed: 2, total: 3, findings: [] },  // round(2/3*10) = round(6.67) = 7
        agent_integration: { passed: 4, total: 4, findings: [] }      // round(4/4*10) = 10
      }));
      // 21+16+15+11+7+10 = 80
      expect(result.total).toBe(80);
      expect(result.rating).toBe('Agent-Ready');
    });

    it('below 80 -> Partially Ready', () => {
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 5, total: 6, findings: [] },   // 21
        error_design: { passed: 4, total: 5, findings: [] },          // 16
        discoverability: { passed: 3, total: 4, findings: [] },       // 15
        response_efficiency: { passed: 3, total: 4, findings: [] },   // 11
        reliability_patterns: { passed: 2, total: 3, findings: [] },  // 7
        agent_integration: { passed: 3, total: 4, findings: [] }      // round(3/4*10) = round(7.5) = 8
      }));
      // 21+16+15+11+7+8 = 78
      expect(result.total).toBeLessThan(80);
      expect(result.total).toBeGreaterThanOrEqual(50);
      expect(result.rating).toBe('Partially Ready');
    });

    it('exactly 50 -> Partially Ready', () => {
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 3, total: 6, findings: [] },   // round(3/6*25) = round(12.5) = 13
        error_design: { passed: 2, total: 5, findings: [] },          // round(2/5*20) = round(8) = 8
        discoverability: { passed: 2, total: 4, findings: [] },       // round(2/4*20) = round(10) = 10
        response_efficiency: { passed: 2, total: 4, findings: [] },   // round(2/4*15) = round(7.5) = 8
        reliability_patterns: { passed: 1, total: 3, findings: [] },  // round(1/3*10) = round(3.33) = 3
        agent_integration: { passed: 3, total: 4, findings: [] }      // round(3/4*10) = round(7.5) = 8
      }));
      // 13+8+10+8+3+8 = 50
      expect(result.total).toBe(50);
      expect(result.rating).toBe('Partially Ready');
    });

    it('below 50 -> Not Yet Readable', () => {
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 3, total: 6, findings: [] },   // 13
        error_design: { passed: 2, total: 5, findings: [] },          // 8
        discoverability: { passed: 2, total: 4, findings: [] },       // 10
        response_efficiency: { passed: 2, total: 4, findings: [] },   // 8
        reliability_patterns: { passed: 1, total: 3, findings: [] },  // 3
        agent_integration: { passed: 2, total: 4, findings: [] }      // round(2/4*10) = round(5) = 5
      }));
      // 13+8+10+8+3+5 = 47
      expect(result.total).toBeLessThan(50);
      expect(result.rating).toBe('Not Yet Readable');
    });
  });

  describe('output shape matches frontend scoring.js', () => {
    it('returns { total, rating, breakdown } with breakdown[category] = { earned, max, note }', () => {
      const result = calculateApiScore(makeResults());

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('rating');
      expect(result).toHaveProperty('breakdown');
      expect(typeof result.total).toBe('number');
      expect(typeof result.rating).toBe('string');
      expect(typeof result.breakdown).toBe('object');

      for (const category of ['naming_descriptions', 'error_design', 'discoverability', 'response_efficiency', 'reliability_patterns', 'agent_integration']) {
        const b = result.breakdown[category];
        expect(b).toHaveProperty('earned');
        expect(b).toHaveProperty('max');
        expect(b).toHaveProperty('note');
        expect(typeof b.earned).toBe('number');
        expect(typeof b.max).toBe('number');
      }
    });

    it('does not emit Not Evaluable (that belongs upstream)', () => {
      // Even all-perfect scores don't emit Not Evaluable
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 1, total: 1, findings: [] },
        error_design: { passed: 1, total: 1, findings: [] },
        discoverability: { passed: 1, total: 1, findings: [] },
        response_efficiency: { passed: 1, total: 1, findings: [] },
        reliability_patterns: { passed: 1, total: 1, findings: [] },
        agent_integration: { passed: 1, total: 1, findings: [] }
      }));

      expect(result.rating).toBe('Agent-Ready');
      expect(result.rating).not.toBe('Not Evaluable');
      expect(result.total).toBe(100);
    });
  });

  describe('scorer ignores findings (pure math on passed/total)', () => {
    it('produces same score regardless of findings content', () => {
      const withFindings = calculateApiScore(makeResults({
        naming_descriptions: { passed: 4, total: 6, findings: [{ id: 'API-ND-001', text: 'test', count: 2 }] }
      }));
      const withoutFindings = calculateApiScore(makeResults({
        naming_descriptions: { passed: 4, total: 6, findings: [] }
      }));

      expect(withFindings.total).toBe(withoutFindings.total);
      expect(withFindings.rating).toBe(withoutFindings.rating);
      expect(withFindings.breakdown.naming_descriptions.earned)
        .toBe(withoutFindings.breakdown.naming_descriptions.earned);
    });
  });

  describe('validation', () => {
    it('throws on null input', () => {
      expect(() => calculateApiScore(null)).toThrow('invalid input');
    });

    it('throws on missing category', () => {
      const partial = makeResults();
      delete partial.discoverability;
      expect(() => calculateApiScore(partial)).toThrow('invalid input');
    });

    it('throws on non-numeric passed', () => {
      expect(() => calculateApiScore(makeResults({
        error_design: { passed: 'five', total: 5, findings: [] }
      }))).toThrow('invalid input');
    });

    it('throws on negative total', () => {
      expect(() => calculateApiScore(makeResults({
        error_design: { passed: 0, total: -1, findings: [] }
      }))).toThrow('invalid input');
    });
  });

  describe('defensive clamp: passed > total does not inflate score', () => {
    it('clamps passed to total', () => {
      const result = calculateApiScore(makeResults({
        naming_descriptions: { passed: 10, total: 6, findings: [] }
      }));

      // Clamped: Math.round((6/6) * 25) = 25, not Math.round((10/6) * 25) = 42
      expect(result.breakdown.naming_descriptions.earned).toBe(25);
    });
  });

  describe('determinism', () => {
    it('produces identical results on repeated runs', () => {
      const input = makeResults({
        naming_descriptions: { passed: 4, total: 6, findings: [] },
        error_design: { passed: 3, total: 5, findings: [] }
      });

      const run1 = calculateApiScore(input);
      const run2 = calculateApiScore(input);

      expect(run1.total).toBe(run2.total);
      expect(run1.rating).toBe(run2.rating);
      expect(run1.breakdown).toEqual(run2.breakdown);
    });
  });

  describe('weights sum to 100', () => {
    it('category max values sum to exactly 100', () => {
      const result = calculateApiScore(makeResults());
      const maxSum = Object.values(result.breakdown).reduce((s, b) => s + b.max, 0);
      expect(maxSum).toBe(100);
    });
  });
});
