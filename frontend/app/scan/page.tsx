/**
 * /scan route: the scan input view.
 *
 * Slice 1: renders the app shell (AppNav + ArcDecoration + layout frame).
 * The actual scan input component is added in slice 2.
 *
 * Visual reference: mockups/agentislux-app.html "View 1: Scan Input"
 */

import AppNav from '@/components/shell/AppNav';
import ArcDecoration from '@/components/shell/ArcDecoration';
import styles from './page.module.css';

export default function ScanPage() {
  return (
    <div className={styles.frame}>
      <AppNav />
      <ArcDecoration
        size={300}
        color="var(--accent)"
        arcs={5}
        opacity={0.12}
      />
      <main className={styles.content}>
        <div className={styles.placeholder}>
          <h1 className={styles.heading}>Scan a URL</h1>
          <p className={styles.subtext}>
            See what AI agents experience on your site.
          </p>
          {/* Scan input component added in Block 1B slice 2 */}
        </div>
      </main>
    </div>
  );
}
