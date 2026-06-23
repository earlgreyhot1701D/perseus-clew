/**
 * ReportPreview: Before/After case study showing the self-scan comparison.
 * Reuses design tokens, typography, and styles from Categories.module.css.
 */

import styles from './Categories.module.css';

export default function ReportPreview() {
  return (
    <section
      className={styles.categories}
      aria-labelledby="preview-h2"
      style={{ paddingTop: 24, paddingBottom: 72 }}
    >
      <div className={styles.wrap}>
        <header className={styles.catHead}>
          <h2
            id="preview-h2"
            className={styles.catHeadH2}
            style={{ fontSize: 'clamp(24px, 2.4vw, 32px)' }}
          >
            Case Study. <span className={styles.catHeadItal}>Before &amp; After.</span>
          </h2>
          <div className={styles.catMeta}>
            <div className={styles.catMetaTop}>Self-Scan · dogfooding</div>
            <div className={styles.catMetaBot}>Agentis Lux scanned its own site</div>
          </div>
        </header>

        <div className={styles.tripleRule} aria-hidden="true"><span /></div>

        <div className={styles.beforeAfterGrid}>
          {/* Card 1: Before Fixes */}
          <article className={styles.beforeAfterCard}>
            <svg className={styles.catArcs} aria-hidden="true">
              <use href="#arcs-tr" />
            </svg>
            <div className={styles.catTop}>
              <div>
                <span className={styles.scoreLabel}>Before Fixes</span>
                <div className={styles.scoreNum}>
                  70<span className={styles.scoreDenom}>/100</span>
                </div>
              </div>
              <div
                className={styles.ratingBadge}
                style={{ backgroundColor: 'var(--ochre)', color: 'var(--teal)' }}
              >
                <span className={styles.statusDot} style={{ backgroundColor: 'var(--teal)' }} />
                Partially Ready
              </div>
            </div>
            
            <div className={styles.ringTrack}>
              <div className={styles.ringFill} style={{ width: '70%', background: 'var(--sienna)' }} />
            </div>

            <div>
              <span className={styles.narrativeTitle}>What an agent experiences</span>
              <p className={styles.narrativeLine}>
                “An agent visiting perseus-clew.vercel.app can read page content and interact with styled elements, but cannot follow 10 placeholder links or identify page type from missing structured data.”
              </p>
            </div>

            <div style={{ marginTop: 8 }}>
              <span className={styles.narrativeTitle}>Representative Findings (Gaps Flagged)</span>
              <ul className={styles.findingList}>
                <li className={styles.findingItem}>
                  <span className={styles.findingId}>SDATA-001</span>
                  <p className={styles.findingText}>
                    No JSON-LD structured data is present. Agents cannot identify page type.
                  </p>
                </li>
                <li className={styles.findingItem}>
                  <span className={styles.findingId}>LINK-002</span>
                  <p className={styles.findingText}>
                    10 anchors use placeholder hrefs like &apos;#&apos;. Agents arrive at no destination.
                  </p>
                </li>
              </ul>
            </div>
          </article>

          {/* Card 2: After Fixes */}
          <article className={styles.beforeAfterCard}>
            <svg className={styles.catArcs} aria-hidden="true">
              <use href="#arcs-tr" />
            </svg>
            <div className={styles.catTop}>
              <div>
                <span className={styles.scoreLabel}>After Fixes</span>
                <div className={styles.scoreNum}>
                  96<span className={styles.scoreDenom}>/100</span>
                </div>
              </div>
              <div
                className={styles.ratingBadge}
                style={{ backgroundColor: 'var(--teal-mid)', color: 'var(--cream)' }}
              >
                <span className={styles.statusDot} style={{ backgroundColor: 'var(--cream)' }} />
                Agent-Ready
              </div>
            </div>

            <div className={styles.ringTrack}>
              <div className={styles.ringFill} style={{ width: '96%', background: 'var(--teal-mid)' }} />
            </div>

            <div>
              <span className={styles.narrativeTitle}>What an agent experiences</span>
              <p className={styles.narrativeLine}>
                “An agent visiting perseus-clew.vercel.app can read text and follow links, but cannot identify repeated sibling elements as lists without ul or ol wrappers.”
              </p>
            </div>

            <div style={{ marginTop: 8 }}>
              <span className={styles.narrativeTitle}>Gaps Resolved (Search Crawler Optimization)</span>
              <ul className={styles.findingList}>
                <li className={styles.findingItem}>
                  <span className={styles.findingId} style={{ color: 'var(--teal-mid)' }}>SDATA-001</span>
                  <p className={styles.findingText}>
                    WebApplication JSON-LD structured data schema added.
                  </p>
                  <span className={styles.resolvedBadge}>Resolved</span>
                </li>
                <li className={styles.findingItem}>
                  <span className={styles.findingId} style={{ color: 'var(--teal-mid)' }}>LINK-002</span>
                  <p className={styles.findingText}>
                    Mapped all placeholder anchors to real, traversable URL destinations.
                  </p>
                  <span className={styles.resolvedBadge}>Resolved</span>
                </li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
