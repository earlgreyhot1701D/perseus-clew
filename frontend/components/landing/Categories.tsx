/**
 * Categories: six scoring category cards in a 3x2 grid.
 * Ported from mockups/agentislux-landing.html.
 */

import styles from './Categories.module.css';

const CARDS = [
  { num: '01 / 06', score: '25', nameLine1: 'Semantic', nameLine2: 'HTML', desc: 'Whether interactive elements use semantic tags instead of styled divs. Agents identify elements by tag name. A div is not a button.', weight: 'Weight · 25 pts' },
  { num: '02 / 06', score: '20', nameLine1: 'Form', nameLine2: 'Accessibility', desc: 'Whether inputs have labels, validation signals, and structure. A placeholder is not a label. Agents need to know what each field expects.', weight: 'Weight · 20 pts' },
  { num: '03 / 06', score: '15', nameLine1: 'ARIA &', nameLine2: 'Accessibility', desc: 'Whether dynamic widgets have correct roles and states. Agents use ARIA like screen readers do. Dynamic components need help.', weight: 'Weight · 15 pts' },
  { num: '04 / 06', score: '15', nameLine1: 'Structured', nameLine2: 'Data', desc: 'Whether the page declares what it is. JSON-LD, microdata, schema markup. Agents use this to know a page without parsing visual layout.', weight: 'Weight · 15 pts' },
  { num: '05 / 06', score: '15', nameLine1: 'Content in', nameLine2: 'HTML', desc: 'Whether content is in the initial HTML or waiting for JavaScript. Many agents do not execute JS. A page that relies entirely on client-side JavaScript is often invisible to these readers.', weight: 'Weight · 15 pts' },
  { num: '06 / 06', score: '10', nameLine1: 'Link &', nameLine2: 'Navigation', desc: 'Whether links have href attributes and descriptive text. Agents traverse a site through links the way they would read a sitemap.', weight: 'Weight · 10 pts' },
];

export default function Categories() {
  return (
    <section className={styles.categories} id="benchmark" aria-labelledby="cats-h2">
      <div className={styles.wrap}>
        <header className={styles.catHead}>
          <h2 id="cats-h2" className={styles.catHeadH2}>
            Six Categories. <span className={styles.catHeadItal}>One hundred points.</span>
          </h2>
          <div className={styles.catMeta}>
            <div className={styles.catMetaTop}>Frontend Scoring · MVP</div>
            <div className={styles.catMetaBot}>Live in the free tier</div>
          </div>
        </header>

        <div className={styles.tripleRule} aria-hidden="true"><span /></div>

        <div className={styles.catGrid}>
          {CARDS.map((card) => (
            <article key={card.num} className={styles.catCard}>
              <svg className={styles.catArcs} aria-hidden="true">
                <use href="#arcs-tr" />
              </svg>
              <div className={styles.catTop}>
                <span className={styles.catNum}>{card.num}</span>
                <span className={styles.catScore}>{card.score}</span>
              </div>
              <h3 className={styles.catName}>{card.nameLine1}<br />{card.nameLine2}</h3>
              <div className={styles.catUnder} aria-hidden="true" />
              <p className={styles.catDesc}>{card.desc}</p>
              <div className={styles.catFoot}>{card.weight}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
