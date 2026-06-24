/**
 * ResultHero: the demo-critical component.
 *
 * Renders the scan result hero as one unit:
 * - Big 0-100 score (Instrument Serif italic)
 * - Rating label from the response (badge with color by band)
 * - One agent narrative line (heroLine.text)
 * - Action buttons: View findings, Download card, Download report
 *
 * Block 1I wiring: buttons call onDownloadCard and onDownloadReport
 * callbacks from the parent. Error states render inline via role="alert"
 * and auto-clear after 5 seconds. Results are NEVER hidden by a
 * card/report failure.
 *
 * Self-scan integrity: all controls are real <button> elements,
 * keyboard-focusable, with accessible labels.
 *
 * Visual reference: mockups/agentislux-verdict-hero.html
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './ResultHero.module.css';

interface ResultHeroProps {
  score: {
    total: number;
    rating: string;
  };
  heroLine: {
    text: string;
    source: 'ai' | 'template';
  };
  domain: string;
  onDownloadReport?: () => void;
  onDownloadCard?: () => Promise<void> | void;
}

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'Agent-Ready': return 'var(--teal-mid)';
    case 'Partially Ready': return 'var(--ochre)';
    case 'Not Yet Readable': return 'var(--sienna-darker)';
    default: return 'var(--ochre)';
  }
}

function getRatingTextColor(rating: string): string {
  switch (rating) {
    case 'Agent-Ready': return 'var(--cream)';
    case 'Partially Ready': return 'var(--teal)';
    case 'Not Yet Readable': return 'var(--cream)';
    default: return 'var(--teal)';
  }
}

export default function ResultHero({ score, heroLine, domain, onDownloadReport, onDownloadCard }: ResultHeroProps) {
  const fillWidth = `${score.total}%`;
  const ratingColor = getRatingColor(score.rating);
  const ratingTextColor = getRatingTextColor(score.rating);

  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleDownloadReport = useCallback(async () => {
    if (!onDownloadReport) return;
    try {
      await onDownloadReport();
    } catch {
      setError('Report download unavailable. Your results are still on screen.');
    }
  }, [onDownloadReport]);

  const handleDownloadCard = useCallback(async () => {
    if (!onDownloadCard) return;
    setIsDownloading(true);
    try {
      await onDownloadCard();
    } catch {
      setError('Card download unavailable. Your results are still on screen.');
    } finally {
      setIsDownloading(false);
    }
  }, [onDownloadCard]);

  return (
    <section className={styles.hero} aria-label="Scan result summary">
      <svg className={styles.arcs} viewBox="0 0 340 360" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <g fill="none" stroke="var(--cream)" strokeWidth="3" opacity="0.18">
          <path d="M 340 360 A 300 300 0 0 0 60 70" />
          <path d="M 340 360 A 235 235 0 0 0 120 120" />
          <path d="M 340 360 A 170 170 0 0 0 180 180" />
          <path d="M 340 360 A 105 105 0 0 0 235 250" />
        </g>
      </svg>

      <div className={styles.heroHeader}>
        <span className={styles.headerTitle}>Agent Experience Report</span>
        <div className={styles.domainWrapper}>
          <span className={styles.domainText}>{domain}</span>
          <span className={styles.domainDot} style={{ backgroundColor: ratingColor }} />
        </div>
      </div>
      <div className={styles.headerDivider} />

      <div className={styles.heroGrid}>
        <div className={styles.scoreBlock}>
          <div className={styles.scoreNum}>
            {score.total}<span className={styles.scoreDenom}>/100</span>
          </div>
          <div className={styles.ratingBadge} style={{ backgroundColor: ratingColor, color: ratingTextColor }}>
            {score.rating}
          </div>
          <div className={styles.ringTrack}>
            <div className={styles.ringFill} style={{ width: fillWidth }} />
          </div>
        </div>

        <div className={styles.narrative}>
          <div className={styles.narrativeTag}>
            <span>What an agent experiences</span>
            {heroLine.source === 'ai' && (
              <span className={styles.aiTag}>AI written</span>
            )}
            {heroLine.source === 'template' && (
              <span className={styles.templateTag}>Generated summary</span>
            )}
          </div>
          <p className={styles.narrativeLine}>{heroLine.text}</p>
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="button">
              View findings
            </button>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              type="button"
              onClick={handleDownloadCard}
              aria-label="Download social card image"
              disabled={isDownloading}
            >
              {isDownloading ? 'Generating card...' : 'Download card'}
            </button>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              type="button"
              onClick={handleDownloadReport}
              aria-label="Download HTML report"
            >
              Download report
            </button>
          </div>
          {error && (
            <p className={styles.errorMessage} role="alert">
              {error}
              <button
                className={styles.errorDismiss}
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error message"
              >
                Dismiss
              </button>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
