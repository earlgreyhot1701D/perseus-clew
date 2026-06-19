/**
 * Agentis Lux: Unit tests for report-export utility.
 *
 * Tests data correctness, XSS escaping (L-XSS-SIM-1), neutral treatment,
 * fail-soft, and output integrity. Does NOT test visual rendering (not
 * unit-testable).
 */

import { describe, it, expect } from 'vitest';
import { generateReportHtml } from '../lib/report-export';
import type { ReportData } from '../lib/report-export';

function makeReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    domain: 'example.com',
    score: 72,
    rating: 'Partially Ready',
    heroText: 'An agent visiting this page can read content but cannot identify the checkout button.',
    heroSource: 'ai',
    breakdown: {
      semantic_html: { earned: 18, max: 25, note: null },
      form_accessibility: { earned: 15, max: 20, note: null },
      aria: { earned: 12, max: 15, note: null },
      structured_data: { earned: 10, max: 15, note: null },
      content_in_html: { earned: 12, max: 15, note: null },
      link_navigation: { earned: 5, max: 10, note: null },
    },
    findings: {
      semantic_html: [
        { id: 'SEM-001', text: '3 elements with click handlers use styled div instead of button.', count: 3 }
      ],
      form_accessibility: []
    },
    simulation: { available: false },
    scannedAt: '2026-06-12T14:30:00.000Z',
    methodologyVersion: '1.1.1',
    ...overrides,
  };
}

describe('generateReportHtml', () => {
  describe('data correctness', () => {
    it('includes score, rating, domain, and hero text', () => {
      const html = generateReportHtml(makeReportData());

      expect(html).toContain('72');
      expect(html).toContain('/100');
      expect(html).toContain('Partially Ready');
      expect(html).toContain('example.com');
      expect(html).toContain('An agent visiting this page can read content but cannot identify the checkout button.');
    });

    it('includes category breakdown with earned/max values', () => {
      const html = generateReportHtml(makeReportData());

      expect(html).toContain('Semantic HTML');
      expect(html).toContain('18 / 25');
      expect(html).toContain('Form Accessibility');
      expect(html).toContain('15 / 20');
    });

    it('includes findings with IDs and text', () => {
      const html = generateReportHtml(makeReportData());

      expect(html).toContain('SEM-001');
      expect(html).toContain('3 elements with click handlers use styled div instead of button.');
    });

    it('includes simulation tasks when available', () => {
      const html = generateReportHtml(makeReportData({
        simulation: {
          available: true,
          tasks: [{
            taskId: 'SIM-FE-CTA',
            outcome: 'success',
            narrative: 'The agent located a semantic button.',
            linkedFindings: ['SEM-001'],
            reasoning: 'Found button element.'
          }]
        }
      }));

      expect(html).toContain('Agent Simulation');
      expect(html).toContain('SIM-FE-CTA');
      expect(html).toContain('success');
      expect(html).toContain('The agent located a semantic button.');
      expect(html).toContain('SEM-001');
    });

    it('omits simulation section when not available', () => {
      const html = generateReportHtml(makeReportData({ simulation: { available: false } }));

      expect(html).not.toContain('Agent Simulation');
    });

    it('includes methodology version and scan timestamp', () => {
      const html = generateReportHtml(makeReportData());

      expect(html).toContain('1.1.1');
      expect(html).toContain('2026-06-12T14:30:00.000Z');
    });

    it('shows hero source label', () => {
      const aiHtml = generateReportHtml(makeReportData({ heroSource: 'ai' }));
      expect(aiHtml).toContain('AI written');

      const templateHtml = generateReportHtml(makeReportData({ heroSource: 'template' }));
      expect(templateHtml).toContain('Generated summary');
    });
  });

  describe('XSS escaping (L-XSS-SIM-1)', () => {
    it('escapes domain with script injection', () => {
      const html = generateReportHtml(makeReportData({
        domain: '<script>alert("xss")</script>'
      }));

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes heroLine with HTML entities', () => {
      const html = generateReportHtml(makeReportData({
        heroText: '<img onerror="alert(1)" src=x>'
      }));

      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('escapes simulation narrative (untrusted model output)', () => {
      const html = generateReportHtml(makeReportData({
        simulation: {
          available: true,
          tasks: [{
            taskId: 'SIM-FE-CTA',
            outcome: 'failure',
            narrative: '<div onmouseover="steal()">hover me</div>',
            linkedFindings: [],
            reasoning: 'Agent could not find a CTA element.'
          }]
        }
      }));

      expect(html).not.toContain('<div onmouseover');
      expect(html).toContain('&lt;div onmouseover');
    });

    it('escapes finding text (defense-in-depth)', () => {
      const html = generateReportHtml(makeReportData({
        findings: {
          semantic_html: [{
            id: 'SEM-001',
            text: '3 elements <img src=x onerror=alert(1)> with handlers.',
            count: 3
          }]
        }
      }));

      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x');
    });
  });

  describe('neutral treatment', () => {
    it('produces same structural HTML for score=30 and score=95', () => {
      const low = generateReportHtml(makeReportData({ score: 30, rating: 'Not Yet Readable' }));
      const high = generateReportHtml(makeReportData({ score: 95, rating: 'Agent-Ready' }));

      // Same structure: both have hero section, category table, findings section
      expect(low).toContain('<section class="hero"');
      expect(high).toContain('<section class="hero"');
      expect(low).toContain('Six categories');
      expect(high).toContain('Six categories');

      // No conditional celebratory/punitive classes
      expect(low).not.toContain('class="fail"');
      expect(low).not.toContain('class="pass"');
      expect(high).not.toContain('class="fail"');
      expect(high).not.toContain('class="pass"');
    });
  });

  describe('output integrity', () => {
    it('produces valid HTML with doctype and lang attribute', () => {
      const html = generateReportHtml(makeReportData());

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('contains no script tags in output', () => {
      const html = generateReportHtml(makeReportData());

      // No executable JS in the report
      expect(html).not.toMatch(/<script[\s>]/i);
    });

    it('contains no onclick or event handler attributes', () => {
      const html = generateReportHtml(makeReportData());

      expect(html).not.toMatch(/\son\w+=/i);
    });

    it('uses semantic HTML structure', () => {
      const html = generateReportHtml(makeReportData());

      expect(html).toContain('<main>');
      expect(html).toContain('<h2>');
      expect(html).toContain('<section');
      expect(html).toContain('aria-label=');
    });

    it('produces non-empty output for minimal data', () => {
      const html = generateReportHtml(makeReportData({ findings: {} }));
      expect(html.length).toBeGreaterThan(500);
    });
  });

  describe('zero-instance categories', () => {
    it('shows note for categories with note field', () => {
      const html = generateReportHtml(makeReportData({
        breakdown: {
          semantic_html: { earned: 25, max: 25, note: 'no forms present' },
          form_accessibility: { earned: 20, max: 20, note: null },
          aria: { earned: 15, max: 15, note: null },
          structured_data: { earned: 15, max: 15, note: null },
          content_in_html: { earned: 15, max: 15, note: null },
          link_navigation: { earned: 10, max: 10, note: null },
        }
      }));

      expect(html).toContain('no forms present');
    });
  });
});
