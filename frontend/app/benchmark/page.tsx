/**
 * /benchmark route: the 50-site benchmark results page.
 *
 * STUB at MVP: shows the headline finding and links to the published dataset.
 * Full interactive benchmark comparison UI is Block 1L.
 */

import AppNav from '@/components/shell/AppNav';
import styles from './page.module.css';

export default function BenchmarkPage() {
  return (
    <div className={styles.frame}>
      <AppNav />
      <main className={styles.content}>
        <div className={styles.eyebrow}>Benchmark</div>
        <h1 className={styles.title}>
          50 sites. What agents <em>actually</em> experience.
        </h1>
        <p className={styles.subtitle}>
          Ten sites per vertical, scanned with the same engine you use. Predictions committed before the data. The complete dataset is published for anyone to audit.
        </p>

        <section className={styles.headline}>
          <div className={styles.stat}>
            <span className={styles.statNum}>77</span>
            <span className={styles.statLabel}>Indie mean score (highest vertical)</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum}>34-91</span>
            <span className={styles.statLabel}>Score range across all 50 sites</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum}>4</span>
            <span className={styles.statLabel}>Sites that blocked the scan at the door</span>
          </div>
        </section>

        <section className={styles.links}>
          <h2 className={styles.sectionTitle}>Published artifacts</h2>
          <ul className={styles.linkList}>
            <li><a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/benchmark/benchmark-2026-06-19.csv">Complete dataset (CSV, 60 rows)</a></li>
            <li><a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/BENCHMARK-HYPOTHESES.md">Pre-registered predictions</a></li>
            <li><a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/BENCHMARK-SITES.md">Site selection and rationale</a></li>
            <li><a href="https://github.com/earlgreyhot1701D/perseus-clew/blob/main/docs/benchmark/README.md">Dataset methodology note</a></li>
          </ul>
        </section>

        <p className={styles.note}>
          Full interactive benchmark comparison is coming. For now, the raw data is published and the analysis is in the README.
        </p>
      </main>
    </div>
  );
}
