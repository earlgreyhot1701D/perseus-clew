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
            Your site has a new audience: AI agents. When someone asks ChatGPT or Perplexity a question, a retrieval agent pulls up your page and often reads the raw or minimally rendered HTML to answer them, rather than the visual version you see. Agentis Lux shows you what that agent can and can&apos;t read.
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
