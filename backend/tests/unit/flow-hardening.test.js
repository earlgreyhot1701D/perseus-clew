/**
 * Perseus Clew: Unit tests for flow.js 1J hardening.
 *
 * Tests per-check isolation (crashed check → scan continues with degraded
 * score, not full credit) and findings-array guard.
 *
 * These tests mock the check modules to avoid cheerio dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all check modules and dependencies
vi.mock('../../src/shared/parse-html.js', () => ({
  parseHtml: vi.fn(() => ({ $: {} }))
}));

vi.mock('../../src/shared/sanitize.js', () => ({
  sanitize: vi.fn((s) => s || ''),
  escapeHtml: vi.fn((s) => s || '')
}));

vi.mock('../../src/checks/frontend/semantic-html.js', () => ({
  checkSemanticHtml: vi.fn(() => ({ passed: 5, total: 6, findings: [] }))
}));

vi.mock('../../src/checks/frontend/form-accessibility.js', () => ({
  checkFormAccessibility: vi.fn(() => ({ passed: 4, total: 5, findings: [] }))
}));

vi.mock('../../src/checks/frontend/aria.js', () => ({
  checkAria: vi.fn(() => ({ passed: 3, total: 4, findings: [] }))
}));

vi.mock('../../src/checks/frontend/structured-data.js', () => ({
  checkStructuredData: vi.fn(() => ({ passed: 3, total: 3, findings: [] }))
}));

vi.mock('../../src/checks/frontend/content-html.js', () => ({
  checkContentHtml: vi.fn(() => ({ passed: 4, total: 5, findings: [] }))
}));

vi.mock('../../src/checks/frontend/link-navigation.js', () => ({
  checkLinkNavigation: vi.fn(() => ({ passed: 2, total: 3, findings: [] }))
}));

import { runScan } from '../../src/orchestrator/flow.js';
import { checkSemanticHtml } from '../../src/checks/frontend/semantic-html.js';
import { checkFormAccessibility } from '../../src/checks/frontend/form-accessibility.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to default good returns
  checkSemanticHtml.mockReturnValue({ passed: 5, total: 6, findings: [] });
  checkFormAccessibility.mockReturnValue({ passed: 4, total: 5, findings: [] });
});

describe('flow.js 1J hardening', () => {
  describe('per-check isolation (#1)', () => {
    it('scan continues when one check module throws', () => {
      // Make semantic-html throw an unexpected error
      checkSemanticHtml.mockImplementation(() => {
        throw new Error('Unexpected internal crash');
      });

      const result = runScan('<html><body><h1>Hello</h1></body></html>', 'https://example.com');

      // Scan still returns a result (not a crash/500)
      expect(result).toHaveProperty('scoredViews');
      expect(result).toHaveProperty('meta');
      expect(result.scoredViews.rawHtml.score).toHaveProperty('total');
      expect(result.scoredViews.rawHtml.score).toHaveProperty('rating');
    });

    it('crashed check earns ZERO for that category (not full credit)', () => {
      // Make semantic-html throw — it should get {passed:0, total:1}
      // which scores to Math.round(0/1 * 25) = 0 points
      checkSemanticHtml.mockImplementation(() => {
        throw new Error('Unexpected crash');
      });

      const result = runScan('<html><body><h1>Hello</h1></body></html>', 'https://example.com');

      // semantic_html category should earn 0 (not 25 which would mean full credit)
      const semanticEarned = result.scoredViews.rawHtml.score.breakdown.semantic_html.earned;
      expect(semanticEarned).toBe(0);
    });

    it('crashed check does NOT earn full credit (not zero-instance shape)', () => {
      checkSemanticHtml.mockImplementation(() => {
        throw new Error('crash');
      });

      const result = runScan('<html><body><h1>Hello</h1></body></html>', 'https://example.com');

      // Full credit for semantic_html would be 25. Crashed = 0.
      const semanticEarned = result.scoredViews.rawHtml.score.breakdown.semantic_html.earned;
      expect(semanticEarned).not.toBe(25);
      expect(semanticEarned).toBe(0);
    });

    it('other categories still score normally when one crashes', () => {
      checkSemanticHtml.mockImplementation(() => {
        throw new Error('crash');
      });

      const result = runScan('<html><body><h1>Hello</h1></body></html>', 'https://example.com');

      // form_accessibility should still have a real score (not degraded)
      const formEarned = result.scoredViews.rawHtml.score.breakdown.form_accessibility.earned;
      // passed:4, total:5, weight:20 => Math.round(4/5 * 20) = 16
      expect(formEarned).toBe(16);
    });

    it('findings are empty array for crashed check', () => {
      checkSemanticHtml.mockImplementation(() => {
        throw new Error('crash');
      });

      const result = runScan('<html><body><h1>Hello</h1></body></html>', 'https://example.com');

      expect(result.scoredViews.rawHtml.findings.semantic_html).toEqual([]);
    });
  });

  describe('findings-array guard (#2)', () => {
    it('handles check result with missing findings property', () => {
      // Return result without findings array (contract violation)
      checkFormAccessibility.mockReturnValue({ passed: 3, total: 4 });

      // Should not throw
      const result = runScan('<html><body><h1>Hello</h1></body></html>', 'https://example.com');

      expect(result.scoredViews.rawHtml.findings.form_accessibility).toEqual([]);
    });

    it('handles check result with findings: undefined', () => {
      checkFormAccessibility.mockReturnValue({ passed: 3, total: 4, findings: undefined });

      const result = runScan('<html><body><h1>Hello</h1></body></html>', 'https://example.com');

      expect(result.scoredViews.rawHtml.findings.form_accessibility).toEqual([]);
    });
  });
});
