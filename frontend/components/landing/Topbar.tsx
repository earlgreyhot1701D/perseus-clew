/**
 * Topbar: sticky top navigation bar for the landing page.
 *
 * Ported from mockups/agentislux-landing.html lines 935-949.
 * Uses arc symbol defs via <use href="#arcs-tr-small">.
 */

import Link from 'next/link';
import styles from './Topbar.module.css';

interface TopbarProps {
  activePage?: string;
}

export default function Topbar({ activePage = 'scan' }: TopbarProps) {
  const scrollLinks = [
    { href: '#scan', label: 'Scan', id: 'scan' },
    { href: '#method', label: 'Method', id: 'method' },
  ];

  const externalLinks = [
    { href: 'https://dev.to/earlgreyhot1701d', label: 'Field Notes', id: 'notes' },
    { href: 'https://github.com/earlgreyhot1701D/perseus-clew', label: 'Repo', id: 'repo' },
  ];

  return (
    <header className={styles.topbar} role="banner">
      <div className={styles.topbarInner}>
        <Link className={styles.wordmark} href="/" aria-label="Agentis Lux home">
          <svg className={styles.arcPunct} aria-hidden="true">
            <use href="#arcs-tr-small" />
          </svg>
          <span>Agentis<span className={styles.dot}>·</span>Lux</span>
          <span className={styles.versionBadge}>v0.1 · MVP</span>
        </Link>
        <nav className={styles.topnav} aria-label="Primary">
          {scrollLinks.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className={`${styles.topnavLink} ${link.id === activePage ? styles.topnavLinkActive : ''}`}
              {...(link.id === activePage ? { 'aria-current': 'page' as const } : {})}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/benchmark"
            className={`${styles.topnavLink} ${'benchmark' === activePage ? styles.topnavLinkActive : ''}`}
            {...('benchmark' === activePage ? { 'aria-current': 'page' as const } : {})}
          >
            Benchmark
          </Link>
          {externalLinks.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className={styles.topnavLink}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
