/**
 * Editorial/Thesis section.
 * Ported from mockups/agentislux-landing.html.
 * Two-column grid: sticky sidebar + article with columns and pullquote.
 */

import styles from './Editorial.module.css';

export default function Editorial() {
  return (
    <section className={styles.editorial} id="method" aria-labelledby="thesis-h2">
      <svg className={styles.editorialArcs} aria-hidden="true">
        <use href="#arcs-tr" />
      </svg>

      <div className={styles.editorialGrid}>
        <aside className={styles.sidebar} aria-label="Thesis sidebar">
          <p className={styles.sectionMarker}>&#167; 02</p>
          <p className={styles.sidebarTitle}>The Thesis · In Plain View</p>
          <div>
            <div className={styles.bylineWriter}>Scanner named for Perseus<br />Tool named for agents</div>
          </div>
        </aside>

        <article>
          <h2 id="thesis-h2" className={styles.editorialH2}>
            Accessibility and agent-readiness are the{' '}
            <span className={styles.editorialH2Ital}>same work.</span>{' '}
            The tools haven&#39;t caught up.
          </h2>

          <div className={styles.columns}>
            <p className={styles.columnsFirstParagraph}>
              The internet was built for human eyes. Websites use visual layouts, styled divs, and JavaScript-rendered content that humans navigate by sight. Agents don&#39;t have eyes. They parse the DOM. When a button is a styled div instead of a button element, an agent literally cannot find it.
            </p>
            <p className={styles.columnsParagraph}>
              This is not a future problem. Production agents read the web right now. ChatGPT visits URLs. Perplexity reads pages. Google&#39;s AI overviews pull from live sites. These retrieval agents arrive by the million, read your HTML, and decide what your page is about, often without ever running your JavaScript. Most products were built for human readers and never tested for this second audience.
            </p>

            <figure className={styles.pullquote} role="group">
              <div className={`${styles.tripleRule} ${styles.trTop}`}><span /></div>
              &#34;An agent landing on this page cannot identify the checkout button{' '}
              <span className={styles.hl}>because it is a styled div,</span>{' '}
              not a button element.&#34;
              <div className={`${styles.tripleRule} ${styles.trBot}`}><span /></div>
            </figure>

            <p className={styles.columnsParagraph}>
              AgentisLux scans your site and reports what an agent experiences. Six categories of deterministic checks. Findings written from the agent&#39;s perspective. No fixes suggested, because suggesting fixes implies we know your codebase, your constraints, and your reasons. We don&#39;t. We know what an agent sees.
            </p>
            <p className={styles.columnsParagraph}>
              The overlap with WCAG accessibility is not a coincidence. It&#39;s the thesis. Semantic HTML, proper labels, ARIA roles, heading hierarchy, structured data: all of this helps screen readers and agents alike. Build for accessibility, build for agents. Same work.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
