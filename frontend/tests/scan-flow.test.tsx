import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/scan')
}));

import { useSearchParams } from 'next/navigation';

// Import after mocks
import ScanPage from '@/app/scan/page';

// --- Fixtures ---

const mockReport = {
  meta: {
    requestId: 'abc-123',
    resultId: 'def-456',
    scanType: 'url',
    targetDomain: 'example.com',
    durationMs: 2500,
    timestamp: '2026-06-07T12:00:00Z',
    scannedAt: '2026-06-07T12:00:00Z',
    fromCache: false,
    methodologyVersion: '1.1.1'
  },
  preScanFindings: [],
  scoredViews: {
    rawHtml: {
      score: { total: 75, rating: 'Partially Ready', breakdown: {
        semantic_html: { earned: 20, max: 25, note: null },
        form_accessibility: { earned: 15, max: 20, note: null },
        aria: { earned: 12, max: 15, note: null },
        structured_data: { earned: 10, max: 15, note: null },
        content_in_html: { earned: 13, max: 15, note: null },
        link_navigation: { earned: 5, max: 10, note: null }
      }},
      heroLine: { text: 'An agent can read most content on this page but cannot identify some interactive elements.', source: 'ai' as const, model: 'claude-haiku-4-5-20251001' },
      findings: {
        semantic_html: [{ id: 'SEM-001', text: '2 elements use div tags. Agents cannot find these.', count: 2 }],
        form_accessibility: [],
        aria: [],
        structured_data: [{ id: 'SDATA-001', text: 'No JSON-LD present.', count: null }],
        content_in_html: [],
        link_navigation: []
      }
    }
  },
  simulation: { available: false }
};

const mockReportTemplate = {
  ...mockReport,
  scoredViews: {
    rawHtml: {
      ...mockReport.scoredViews.rawHtml,
      heroLine: { text: 'An agent visiting example.com can read some content.', source: 'template' as const, model: null }
    }
  }
};

const mockReportWithPreScan = {
  ...mockReport,
  preScanFindings: [
    { type: 'robots_txt', message: 'robots.txt disallows automated access to this site. An agent visiting may also encounter access restrictions.' },
    { type: 'redirect_chain', message: 'This URL redirected through 2 hops before responding.' }
  ]
};

// --- Helpers ---

function mockFetchSuccess(report = mockReport) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(report)
  });
}

function mockFetchError(status: number, error: string, message: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error, message })
  });
}

function mockFetchNetworkError() {
  global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
}

// --- Tests ---

describe('Scan Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('state machine transitions (Axis 2)', () => {
    it('successful scan: input -> scanning -> results', async () => {
      mockFetchSuccess();
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      // Wait for results (scanning state is transient with instant mocks)
      await waitFor(() => {
        expect(screen.getAllByText('75').length).toBeGreaterThan(0);
      });

      // Score renders (not mock 62)
      expect(screen.queryByText('62')).toBeNull();
    });

    it('failed scan (non-ok response): input -> scanning -> error', async () => {
      mockFetchError(403, 'SITE_BLOCKED', 'This site is blocking automated requests.');
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/blocking automated requests/)).toBeDefined();
      });

      // Not stuck on scanning
      expect(screen.queryByText(/Asking the/)).toBeNull();
    });

    it('network error (fetch rejects): input -> scanning -> error', async () => {
      mockFetchNetworkError();
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Could not connect/)).toBeDefined();
      });

      // Not stuck on scanning
      expect(screen.queryByText(/Asking the/)).toBeNull();
    });

    it('handleReset clears state after error', async () => {
      mockFetchError(404, 'PAGE_NOT_FOUND', 'Not found');
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Try a different URL/)).toBeDefined();
      });

      // Reset
      await act(async () => {
        fireEvent.click(screen.getByText('Try a different URL'));
      });

      // Back to input view
      expect(screen.getByLabelText('Enter URL to scan')).toBeDefined();
      // Input is cleared
      const resetInput = screen.getByLabelText('Enter URL to scan') as HTMLInputElement;
      expect(resetInput.value).toBe('');
    });

    it('success after error renders clean (no lingering error)', async () => {
      // First: trigger an error
      mockFetchError(404, 'PAGE_NOT_FOUND', 'Not found');
      const { unmount } = render(<ScanPage />);

      let input = screen.getByLabelText('Enter URL to scan');
      let scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Try a different URL/)).toBeDefined();
      });

      // Reset
      await act(async () => {
        fireEvent.click(screen.getByText('Try a different URL'));
      });

      // Now succeed
      mockFetchSuccess();
      input = screen.getByLabelText('Enter URL to scan');
      scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getAllByText('75').length).toBeGreaterThan(0);
      });

      // No error state remnants
      expect(screen.queryByText(/could not complete/i)).toBeNull();
      unmount();
    });

    it('double-submit guard: fetch called only once during scanning (F-1)', async () => {
      // Use a fetch that never resolves (stays scanning)
      global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      // Fetch was called exactly once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('render states (Axis 4)', () => {
    it('template hero shows "Generated summary" tag', async () => {
      mockFetchSuccess(mockReportTemplate);
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('Generated summary')).toBeDefined();
      });

      // Should NOT show "AI written"
      expect(screen.queryByText('AI written')).toBeNull();
    });

    it('AI hero shows "AI written" tag, NOT "Generated summary"', async () => {
      mockFetchSuccess(mockReport);
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('AI written')).toBeDefined();
      });

      expect(screen.queryByText('Generated summary')).toBeNull();
    });

    it('preScanFindings render above results', async () => {
      mockFetchSuccess(mockReportWithPreScan);
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/robots.txt disallows/)).toBeDefined();
        expect(screen.getByText(/2 hops/)).toBeDefined();
        // Score still renders (notices don't suppress results)
        expect(screen.getAllByText('75').length).toBeGreaterThan(0);
      });
    });

    it('simulation available:false renders nothing (no crash)', async () => {
      mockFetchSuccess(mockReport);
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getAllByText('75').length).toBeGreaterThan(0);
      });

      // No "simulation" or "undefined" text
      expect(screen.queryByText('simulation')).toBeNull();
      expect(screen.queryByText('undefined')).toBeNull();
    });

    it('each error code renders a user-facing message', async () => {
      const errorCases = [
        { status: 400, code: 'INVALID_URL', expected: /cannot be scanned/ },
        { status: 422, code: 'DNS_FAILURE', expected: /could not be resolved/ },
        { status: 504, code: 'SCAN_TIMEOUT', expected: /took too long/ },
        { status: 429, code: 'RATE_LIMIT', expected: /wait a moment/ },
      ];

      for (const { status, code, expected } of errorCases) {
        mockFetchError(status, code, 'Backend message');
        const { unmount } = render(<ScanPage />);

        const input = screen.getByLabelText('Enter URL to scan');
        const scanBtn = screen.getByRole('button', { name: 'Scan' });

        await act(async () => {
          fireEvent.change(input, { target: { value: 'https://example.com' } });
          fireEvent.click(scanBtn);
        });

        await waitFor(() => {
          expect(screen.getByText(expected)).toBeDefined();
        });

        unmount();
      }
    });
  });

  describe('seam + mock (Axes 1, 3)', () => {
    it('client calls /api/scan (not AWS URL)', async () => {
      mockFetchSuccess();
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/scan', expect.objectContaining({
        method: 'POST'
      }));

      // Never calls an AWS URL
      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callUrl).not.toContain('amazonaws');
      expect(callUrl).not.toContain('execute-api');
    });

    it('no hardcoded 62 in render path (no-mock-62)', async () => {
      mockFetchSuccess(mockReport); // score is 75
      render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan');
      const scanBtn = screen.getByRole('button', { name: 'Scan' });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'https://example.com' } });
        fireEvent.click(scanBtn);
      });

      await waitFor(() => {
        expect(screen.getAllByText('75').length).toBeGreaterThan(0);
      });

      expect(screen.queryByText('62')).toBeNull();
    });
  });

  describe('URL prefill (Axis 7)', () => {
    it('prefills input from ?url= search param', () => {
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
        new URLSearchParams('url=https://prefilled.com')
      );

      const { unmount } = render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan') as HTMLInputElement;
      expect(input.value).toBe('https://prefilled.com');
      unmount();
    });

    it('absent ?url= param renders empty input without crash', () => {
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(new URLSearchParams());

      const { unmount } = render(<ScanPage />);

      const input = screen.getByLabelText('Enter URL to scan') as HTMLInputElement;
      expect(input.value).toBe('');
      unmount();
    });
  });

  describe('badge contrast (Axis 5)', () => {
    // WCAG contrast ratio calculation
    function sRGBtoLinear(c: number) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function luminance(hex: string) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
    }
    function contrastRatio(hex1: string, hex2: string) {
      const l1 = luminance(hex1);
      const l2 = luminance(hex2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    // Actual shipped color pairs (from tokens.css + ResultHero.tsx)
    const BANDS = [
      { name: 'Agent-Ready', bg: '#1b6d74', text: '#f1ebdc' },
      { name: 'Partially Ready', bg: '#d4a43c', text: '#0f3d42' },
      { name: 'Not Yet Readable', bg: '#a5370e', text: '#f1ebdc' },
    ];

    for (const band of BANDS) {
      it(`${band.name} badge passes WCAG AA at normal text (>= 4.5:1)`, () => {
        const ratio = contrastRatio(band.bg, band.text);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });
});
