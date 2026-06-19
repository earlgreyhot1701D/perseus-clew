/**
 * ReportPreview: single demo card showing post-scan state.
 * Ported from mockups/agentislux-landing.html.
 * Reuses .cat-card styles from Categories.module.css.
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
            Report Preview. <span className={styles.catHeadItal}>Post-scan state.</span>
          </h2>
          <div className={styles.catMeta}>
            <div className={styles.catMetaTop}>Component Study · 01</div>
            <div className={styles.catMetaBot}>Not shown on live page</div>
          </div>
        </header>

        <div className={styles.tripleRule} aria-hidden="true"><span /></div>

        <div
          className={styles.catGrid}
          style={{ gridTemplateColumns: '1fr', maxWidth: 520, marginTop: 28 }}
        >
          <article className={styles.catCard} style={{ borderRight: 0, borderBottom: 0 }}>
            <svg className={styles.catArcs} aria-hidden="true">
              <use href="#arcs-tr" />
            </svg>
            <div className={styles.catTop}>
              <span className={styles.catNum}>01 / 06 · Scored</span>
              <span className={styles.catScore}>
                <span style={{ color: 'var(--teal)' }}>18</span>
                <span style={{ fontSize: '0.5em', color: 'var(--muted)' }}> / 25</span>
              </span>
            </div>
            <h3 className={styles.catName}>Semantic<br />HTML</h3>
            <div
              style={{
                height: 4,
                background: 'rgba(15,61,66,0.12)',
                margin: '2px 0 14px',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ position: 'absolute', inset: '0 28% 0 0', background: 'var(--sienna)' }} />
            </div>
            <p className={styles.catDesc}>
              Whether interactive elements use semantic tags instead of styled divs. Agents identify elements by tag name. A div is not a button.
            </p>
            <div className={styles.catFoot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Score · 72% · 4 findings</span>
              <span
                style={{
                  color: 'var(--sienna)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  fontSize: '10.5px',
                  letterSpacing: '0.12em'
                }}
              >
                View findings &#8594;
              </span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
