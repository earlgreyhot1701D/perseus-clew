/**
 * Manifesto: scrolling marquee band between hero and editorial.
 * Ported from mockups/agentislux-landing.html.
 * Two identical .item copies + translateX(-50%) = seamless loop.
 * Pauses on hover/focus. Respects prefers-reduced-motion.
 */

import styles from './Manifesto.module.css';

function ManifestoItems() {
  return (
    <div className={styles.item}>
      <span>Not your gramma&#39;s SaaS</span>
      <span className={styles.marqueeDot} aria-hidden="true" />
      <span>Not your gramma&#39;s <span className={styles.ital}>sass</span></span>
      <span className={styles.marqueeDot} aria-hidden="true" />
      <span>Awareness, <span className={styles.ital}>not</span> judgment</span>
      <span className={styles.marqueeDot} aria-hidden="true" />
      <span>Findings, <span className={styles.ital}>not</span> fixes</span>
      <span className={styles.marqueeDot} aria-hidden="true" />
      <span>The data speaks</span>
      <span className={styles.marqueeDot} aria-hidden="true" />
    </div>
  );
}

export default function Manifesto() {
  return (
    <section className={styles.manifesto} aria-label="Product manifesto">
      <div
        className={styles.marqueeTrack}
        id="marquee"
        tabIndex={0}
        aria-label="Scrolling manifesto. Pauses on hover or focus."
      >
        <ManifestoItems />
        <div className={styles.item} aria-hidden="true">
          <span>Not your gramma&#39;s SaaS</span>
          <span className={styles.marqueeDot} aria-hidden="true" />
          <span>Not your gramma&#39;s <span className={styles.ital}>sass</span></span>
          <span className={styles.marqueeDot} aria-hidden="true" />
          <span>Awareness, <span className={styles.ital}>not</span> judgment</span>
          <span className={styles.marqueeDot} aria-hidden="true" />
          <span>Findings, <span className={styles.ital}>not</span> fixes</span>
          <span className={styles.marqueeDot} aria-hidden="true" />
          <span>The data speaks</span>
          <span className={styles.marqueeDot} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
