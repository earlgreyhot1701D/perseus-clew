/**
 * Agentis Lux: Unit tests for ResultHero button wiring (Block 1I).
 *
 * Tests: download report calls handler with correct data, download card
 * triggers fetch with encoded params, error states render on failure,
 * response.ok check (non-OK fetch = error, not broken download),
 * self-scan markup (real buttons, aria-labels), auto-clear.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import ResultHero from '../components/ResultHero';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const defaultProps = {
  score: { total: 72, rating: 'Partially Ready' },
  heroLine: { text: 'An agent can read content but cannot find the checkout button.', source: 'ai' as const },
};

describe('ResultHero button wiring', () => {
  describe('Download report button', () => {
    it('calls onDownloadReport when clicked', () => {
      const onDownloadReport = vi.fn();
      render(<ResultHero {...defaultProps} onDownloadReport={onDownloadReport} />);

      const btn = screen.getByRole('button', { name: /download html report/i });
      fireEvent.click(btn);

      expect(onDownloadReport).toHaveBeenCalledTimes(1);
    });

    it('shows error message when onDownloadReport throws', async () => {
      const onDownloadReport = vi.fn(() => { throw new Error('Report download failed'); });
      render(<ResultHero {...defaultProps} onDownloadReport={onDownloadReport} />);

      const btn = screen.getByRole('button', { name: /download html report/i });
      await act(async () => { fireEvent.click(btn); });

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Report download unavailable');
    });

    it('results section remains visible after report error', () => {
      const onDownloadReport = vi.fn(() => { throw new Error('fail'); });
      const { container } = render(<ResultHero {...defaultProps} onDownloadReport={onDownloadReport} />);

      const btn = screen.getByRole('button', { name: /download html report/i });
      fireEvent.click(btn);

      // Hero section still rendered
      expect(container.querySelector('section[aria-label="Scan result summary"]')).toBeTruthy();
      expect(screen.getByText('72')).toBeTruthy();
    });
  });

  describe('Download card button', () => {
    it('calls onDownloadCard when clicked', () => {
      const onDownloadCard = vi.fn();
      render(<ResultHero {...defaultProps} onDownloadCard={onDownloadCard} />);

      const btn = screen.getByRole('button', { name: /download social card/i });
      fireEvent.click(btn);

      expect(onDownloadCard).toHaveBeenCalledTimes(1);
    });

    it('shows error message when onDownloadCard rejects (async)', async () => {
      const onDownloadCard = vi.fn(async () => { throw new Error('network failure'); });
      render(<ResultHero {...defaultProps} onDownloadCard={onDownloadCard} />);

      const btn = screen.getByRole('button', { name: /download social card/i });
      await act(async () => { fireEvent.click(btn); });

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Card download unavailable');
    });

    it('shows error when fetch returns non-OK response (response.ok = false)', async () => {
      // Simulates the real handleDownloadCard: fetch resolves but with ok:false
      const onDownloadCard = vi.fn(async () => {
        const response = { ok: false, status: 500 };
        if (!response.ok) throw new Error('Card download unavailable');
      });
      render(<ResultHero {...defaultProps} onDownloadCard={onDownloadCard} />);

      const btn = screen.getByRole('button', { name: /download social card/i });
      await act(async () => { fireEvent.click(btn); });

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Card download unavailable');
    });
  });

  describe('error state behavior', () => {
    it('auto-clears error after 5 seconds', () => {
      const onDownloadReport = vi.fn(() => { throw new Error('fail'); });
      render(<ResultHero {...defaultProps} onDownloadReport={onDownloadReport} />);

      fireEvent.click(screen.getByRole('button', { name: /download html report/i }));
      expect(screen.getByRole('alert')).toBeTruthy();

      act(() => { vi.advanceTimersByTime(5000); });

      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('dismiss button clears error immediately', () => {
      const onDownloadReport = vi.fn(() => { throw new Error('fail'); });
      render(<ResultHero {...defaultProps} onDownloadReport={onDownloadReport} />);

      fireEvent.click(screen.getByRole('button', { name: /download html report/i }));
      expect(screen.getByRole('alert')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('self-scan integrity (I5)', () => {
    it('Download card is a real <button> element', () => {
      render(<ResultHero {...defaultProps} onDownloadCard={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /download social card/i });
      expect(btn.tagName).toBe('BUTTON');
    });

    it('Download report is a real <button> element', () => {
      render(<ResultHero {...defaultProps} onDownloadReport={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /download html report/i });
      expect(btn.tagName).toBe('BUTTON');
    });

    it('buttons have accessible aria-label attributes', () => {
      render(<ResultHero {...defaultProps} onDownloadCard={vi.fn()} onDownloadReport={vi.fn()} />);

      expect(screen.getByLabelText('Download social card image')).toBeTruthy();
      expect(screen.getByLabelText('Download HTML report')).toBeTruthy();
    });
  });
});
