'use client';

/**
 * AppNav: top navigation bar for the Agentis Lux app views.
 *
 * Wordmark left, nav links right. Active route highlighted with sienna underline.
 * STUB links (Methodology, Benchmark, About) are non-navigating until those
 * routes are built in Block 1L.
 *
 * Visual reference: mockups/agentislux-app.html .app-nav
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './AppNav.module.css';

const LIVE_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Scan', href: '/scan' },
  { label: 'Benchmark', href: '/benchmark' }
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <Link href="/" className={styles.wordmark} aria-label="Agentis Lux home">
        <span>Agentis<span className={styles.dot}>·</span>Lux</span>
      </Link>

      <div className={styles.navRight}>
        {LIVE_LINKS.map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            className={`${styles.navLink} ${pathname === href || (href !== '/' && pathname?.startsWith(href + '/')) ? styles.active : ''}`}
          >
            {label}
          </Link>
        ))}

        <a
          href="https://earlgreyhot1701d.github.io/Clew-Labs/"
          className={styles.navLink}
          target="_blank"
          rel="noreferrer"
        >
          About
        </a>
      </div>
    </nav>
  );
}
