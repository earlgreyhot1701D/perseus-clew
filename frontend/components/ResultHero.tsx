/**
 * ResultHero: the demo-critical component.
 *
 * Renders the scan result hero as one unit:
 * - Big 0-100 score (Instrument Serif italic)
 * - Rating label from the response (badge with color by band)
 * - One agent narrative line (heroLine.text)
 * - Action buttons (stubs in Block 0)
 *
 * Rating label comes from score.rating in the response.
 * The 80/50 threshold logic lives only in scoring.js (backend).
 * This component renders what the backend computed.
 *
 * Visual reference: mockups/agentislux-verdict-hero.html
 */

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
}

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'Agent-Ready': return 'var(--teal-mid)';
    case 'Partially Ready': return 'var(--ochre)';
    case 'Not Yet Readable': return 'var(--sienna)';
    default: return 'var(--ochre)';
  }
}

export default function ResultHero({ score, heroLine }: ResultHeroProps) {
  const fillWidth = `${score.total}%`;
  const ratingColor = getRatingColor(score.rating);

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

      <div className={styles.heroGrid}>
        <div className={styles.scoreBlock}>
          <div className={styles.scoreNum}>
            {score.total}<span className={styles.scoreDenom}>/100</span>
          </div>
          <div className={styles.ratingBadge} style={{ backgroundColor: ratingColor }}>
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
          </div>
          <p className={styles.narrativeLine}>{heroLine.text}</p>
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="button">
              View findings
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} type="button">
              Share result
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} type="button">
              Download report
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
