/**
 * /benchmark route: the 50-site benchmark results page.
 *
 * Ported from the benchmark-results-page-mockup.html design.
 * Static data from the real benchmark run (run-2026-06-19-f8cb741a).
 * Full interactive comparison UI deferred to Block 1L.
 */

import AppNav from '@/components/shell/AppNav';
import Link from 'next/link';
import styles from './page.module.css';

const VERTICALS = [
  { name: 'Indie', score: 77, color: 'var(--teal)' },
  { name: 'Content', score: 64, color: 'var(--teal-mid)' },
  { name: 'SaaS', score: 62, color: 'var(--ochre)' },
  { name: 'Government', score: 59, color: 'var(--sienna)' },
  { name: 'E-commerce', score: 53, color: 'var(--ink)' },
];

const BLOCKED_SITES = [
  { domain: 'openai.com', reason: 'forbidden' },
  { domain: 'congress.gov', reason: 'forbidden' },
  { domain: 'michigan.gov', reason: 'forbidden' },
  { domain: 'npr.org', reason: 'timeout' },
];

export default function BenchmarkPage() {
  const maxScore = Math.max(...VERTICALS.map(v => v.score));

  return (
    <div className={styles.frame}>
      <AppNav />
      <main className={styles.main} id="main-content">
        {/* Hero / headline */}
        <section className={styles.hero} aria-labelledby="benchmark-headline">
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>The 50-site study</span>
            <h1 id="benchmark-headline" className={styles.headline}>
              Indie builders scored highest. I predicted the opposite.
            </h1>
            <p className={styles.subhead}>
              50 sites, scored before I looked. I missed 3 of 6 predictions. The data and the predictions are both public.
            </p>
          </div>
        </section>

        {/* Metric cards */}
        <section className={styles.metrics} aria-label="Key metrics">
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Top vertical</span>
            <span className={styles.metricValue}>Indie &middot; 77</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Score range</span>
            <span className={styles.metricValue}>34 &ndash; 91</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Blocked at the door</span>
            <span className={styles.metricValue}>4 sites</span>
          </div>
        </section>

        {/* Bar chart */}
        <section className={styles.chartSection} aria-labelledby="chart-heading">
          <h2 id="chart-heading" className={styles.sectionTitle}>Mean score by vertical</h2>
          <div className={styles.chart} role="img" aria-label="Bar chart showing mean scores: Indie 77, Content 64, SaaS 62, Government 59, E-commerce 53">
            {VERTICALS.map((v) => (
              <div key={v.name} className={styles.barRow}>
                <span className={styles.barLabel}>{v.name}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(v.score / 100) * 100}%`, background: v.color }}
                  />
                </div>
                <span className={styles.barScore}>{v.score}</span>
              </div>
            ))}
          </div>
          <p className={styles.chartNote}>
            Each vertical = 10 sites. Scored on what each site has, not penalized for what it lacks.
          </p>
        </section>

        {/* Blocked at the door */}
        <section className={styles.blockedSection} aria-labelledby="blocked-heading">
          <div className={styles.blockedInner}>
            <div className={styles.blockedIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 id="blocked-heading" className={styles.blockedTitle}>
              Four sites blocked the scan at the door
            </h2>
          </div>
          <p className={styles.blockedDesc}>
            NPR timed out. Congress.gov, Michigan.gov, and OpenAI returned a hard block to an automated request. The company building the agents blocks them at its own front door.
          </p>
          <div className={styles.blockedList}>
            {BLOCKED_SITES.map((site) => (
              <span key={site.domain} className={styles.blockedSite}>
                {site.domain} &middot; <em>{site.reason}</em>
              </span>
            ))}
          </div>
        </section>

        {/* Published artifacts */}
        <section className={styles.artifacts} aria-labelledby="artifacts-heading">
          <h2 id="artifacts-heading" className={styles.sectionTitle}>Published artifacts</h2>
          <div className={styles.artifactLinks}>
            <a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/benchmark/benchmark-2026-06-19.csv" className={styles.artifactLink}>
              Full dataset (CSV)
            </a>
            <a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/SCORING.md" className={styles.artifactLink}>
              Methodology
            </a>
            <a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/BENCHMARK-HYPOTHESES.md" className={styles.artifactLink}>
              Predictions (pre-registered)
            </a>
            <a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/BENCHMARK-SITES.md" className={styles.artifactLink}>
              Site selection and rationale
            </a>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.cta}>
          <Link href="/scan" className={styles.ctaButton}>
            Scan your own site
          </Link>
        </section>
      </main>
    </div>
  );
}
