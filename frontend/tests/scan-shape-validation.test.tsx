/**
 * Agentis Lux: Test for response shape validation (1J fix #4).
 *
 * Proves that an API response missing a required field (e.g. breakdown)
 * shows the INVALID_RESPONSE error view, NOT a white screen / crash.
 * This test would FAIL without the extended guard and PASS with it.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// We need to test the ScanFlow component inside page.tsx. Since it uses
// useSearchParams (Next.js), we mock that.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('')
}));

// Mock AppNav to avoid pulling in full shell
vi.mock('@/components/shell/AppNav', () => ({
  default: () => <nav data-testid="mock-nav">Nav</nav>
}));

// Mock ResultHero to avoid pulling in full component
vi.mock('@/components/ResultHero', () => ({
  default: (props: Record<string, unknown>) => <div data-testid="result-hero">{String((props.score as Record<string, unknown>)?.total)}</div>
}));

import ScanPage from '../app/scan/page';

describe('response shape validation (1J #4)', () => {
  it('shows error view when API response is missing breakdown', async () => {
    // Mock fetch to return 200 with a response missing score.breakdown
    const malformedResponse = {
      meta: { targetDomain: 'example.com', scannedAt: '2026-06-14T00:00:00Z', methodologyVersion: '1.1.1' },
      preScanFindings: [],
      scoredViews: {
        rawHtml: {
          score: { total: 72, rating: 'Partially Ready' }, // Missing breakdown!
          heroLine: { text: 'Test.', source: 'template', model: null },
          findings: {}
        }
      },
      simulation: { available: false }
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => malformedResponse
    } as Response);

    render(<ScanPage />);

    // Type a URL and submit
    const input = screen.getByLabelText(/enter url/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://example.com' } });
    });

    const scanBtn = screen.getByRole('button', { name: /scan/i });
    await act(async () => {
      fireEvent.click(scanBtn);
    });

    // Should show error view with INVALID_RESPONSE message, NOT a white screen
    await waitFor(() => {
      expect(screen.getByText(/unexpected format/i)).toBeTruthy();
    });

    // ResultHero should NOT be rendered (results view not active)
    expect(screen.queryByTestId('result-hero')).toBeNull();
  });

  it('shows results view when API response has all required fields', async () => {
    const validResponse = {
      meta: { targetDomain: 'example.com', scannedAt: '2026-06-14T00:00:00Z', methodologyVersion: '1.1.1', requestId: '1', resultId: '2', scanType: 'url', durationMs: 500, timestamp: '2026-06-14T00:00:00Z', fromCache: false },
      preScanFindings: [],
      scoredViews: {
        rawHtml: {
          score: { total: 72, rating: 'Partially Ready', breakdown: { semantic_html: { earned: 20, max: 25, note: null } } },
          heroLine: { text: 'Test line.', source: 'template', model: null },
          findings: { semantic_html: [] }
        }
      },
      simulation: { available: false }
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => validResponse
    } as Response);

    render(<ScanPage />);

    const input = screen.getByLabelText(/enter url/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://example.com' } });
    });

    const scanBtn = screen.getByRole('button', { name: /scan/i });
    await act(async () => {
      fireEvent.click(scanBtn);
    });

    // Should show results view
    await waitFor(() => {
      expect(screen.getByTestId('result-hero')).toBeTruthy();
    });

    // Error message should NOT be shown
    expect(screen.queryByText(/unexpected format/i)).toBeNull();
  });
});
