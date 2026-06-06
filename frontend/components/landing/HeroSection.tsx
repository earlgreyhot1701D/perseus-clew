/**
 * HeroSection: the landing page hero with left copy and right scan card.
 *
 * Ported from mockups/agentislux-landing.html lines 955-1035.
 * Left column: eyebrow, h1, lede paragraph, meta row, issue row.
 * Right column: ScanCard component.
 */

import ScanCard from './ScanCard';
import styles from './HeroSection.module.css';

export default function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-h1">
      <div className={styles.heroGrid}>
        <svg className={styles.heroAnchor} aria-hidden="true">
          <use href="#arcs-bl" />
        </svg>

        <div className={styles.heroLeft}>
          <span className={styles.eyebrow}>Agent-readiness, observed</span>
          <h1 id="hero-h1" className={styles.heroH1}>
            <span className={styles.line}>For your</span>
            <span className={styles.lineItalic}>second</span>
            <span className={styles.line}>Audience.</span>
          </h1>

          <p className={styles.lede}>
            AI agents are already browsing the web, filling out your forms, and calling your endpoints. Most products were never tested for this. AgentisLux scans your site and shows you what an agent experiences when it tries to use you.
          </p>

          <dl className={styles.metaRow} aria-label="Product attributes">
            <div className={styles.metaItem}>
              <dt className={styles.metaLbl}>Approach</dt>
              <dd className={styles.metaVal}>Deterministic</dd>
            </div>
            <div className={styles.metaItem}>
              <dt className={styles.metaLbl}>Method</dt>
              <dd className={styles.metaVal}>Published</dd>
            </div>
            <div className={styles.metaItem}>
              <dt className={styles.metaLbl}>Tone</dt>
              <dd className={styles.metaVal}>Observational</dd>
            </div>
            <div className={styles.metaItem}>
              <dt className={styles.metaLbl}>Cost</dt>
              <dd className={styles.metaVal}>Free</dd>
            </div>
          </dl>

          <div className={styles.issueRow}>
            <span>Issue 001 · May MMXXVI</span>
            <span>From the Clew Suite</span>
          </div>
        </div>

        <aside className={styles.heroRight} id="scan" aria-label="Begin a scan">
          <ScanCard />
        </aside>
      </div>
    </section>
  );
}
