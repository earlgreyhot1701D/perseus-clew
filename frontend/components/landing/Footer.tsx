/**
 * Footer: site footer with brand, link columns, and bar.
 * Ported from mockups/agentislux-landing.html.
 */

import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer} id="repo" role="contentinfo">
      <svg className={styles.footArcLeft} aria-hidden="true">
        <use href="#arcs-tl" />
      </svg>
      <svg className={styles.footArcRight} aria-hidden="true">
        <use href="#arcs-tr" />
      </svg>

      <div className={styles.footGrid}>
        <div className={styles.footBrand}>
          <div className={styles.wm}>Agentis<span className={styles.dot}>·</span>Lux</div>
          <p>
            A scanner that tells you what AI agents experience when they try to use your product. Findings only. Methodology published. Not your gramma&#39;s SaaS.
          </p>
        </div>

        <div className={styles.footCol}>
          <h4>Product</h4>
          <ul>
            <li><a href="#scan">Scan</a></li>
            <li><a href="#method">Methodology</a></li>
            <li><a href="#benchmark">Benchmark</a></li>
            <li><a href="#">Roadmap</a></li>
          </ul>
        </div>

        <div className={styles.footCol}>
          <h4>Field Notes</h4>
          <ul>
            <li><a href="#">50-site study</a></li>
            <li><a href="#">Why agents matter</a></li>
            <li><a href="#">Measurement ethics</a></li>
            <li><a href="#">The thesis</a></li>
          </ul>
        </div>

        <div className={styles.footCol}>
          <h4>Project</h4>
          <ul>
            <li><a href="#">GitHub</a></li>
            <li><a href="#">License · Apache 2.0</a></li>
            <li><a href="#">Contribute</a></li>
            <li><a href="#">Credits</a></li>
          </ul>
        </div>
      </div>

      <div className={styles.footBar}>
        <div>&#169; 2026 · Part of the Clew Suite</div>
        <div>AI Assisted<span className={styles.sep}>·</span>Human Approved<span className={styles.sep}>·</span>Powered by NLP</div>
      </div>
    </footer>
  );
}
