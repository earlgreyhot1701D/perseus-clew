'use client';

/**
 * /scan route: the scan input view.
 *
 * Built pixel-for-pixel from mockups/agentislux-app.html View 1 (Scan Input).
 * Two-column grid: left (input form), right (what-happens panel).
 */

import { useState } from 'react';
import AppNav from '@/components/shell/AppNav';
import styles from './page.module.css';

const TABS = ['URL', 'GitHub repo', 'API spec upload'] as const;

export default function ScanPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [inputValue, setInputValue] = useState('');

  return (
    <div className={styles.appFrame}>
      <AppNav />
      <div className={styles.scanInputView}>
        {/* LEFT COLUMN */}
        <div className={styles.scanInputLeft}>
          {/* Arc decoration top-right: sienna, 5 arcs */}
          <div className={styles.arcDecoration} aria-hidden="true">
            <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
              <g fill="none" stroke="var(--accent)" strokeWidth="2.5">
                <path d="M 300 300 A 280 280 0 0 0 20 20" />
                <path d="M 300 300 A 220 220 0 0 0 80 80" />
                <path d="M 300 300 A 160 160 0 0 0 140 140" />
                <path d="M 300 300 A 100 100 0 0 0 200 200" />
                <path d="M 300 300 A 60 60 0 0 0 240 240" />
              </g>
            </svg>
          </div>

          <div className={styles.inputEyebrow}>Scan · Layer 1 + Layer 2</div>
          <h1 className={styles.inputTitle}>
            See what AI agents <em>experience</em> on your site.
          </h1>
          <p className={styles.inputSubtitle}>
            Paste a URL, connect a GitHub repo, or upload an API spec. Findings only. No fixes suggested.
          </p>

          <div className={styles.inputTypeTabs} role="tablist">
            {TABS.map((label, i) => (
              <button
                key={label}
                className={`${styles.tab} ${i === activeTab ? styles.tabActive : ''}`}
                role="tab"
                aria-selected={i === activeTab}
                onClick={() => { setActiveTab(i); setInputValue(''); }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={styles.scanInputField}>
            <input
              type="text"
              placeholder="https://your-site.com"
              aria-label="Enter URL to scan"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <button className={styles.scanBtn} type="button">
              Scan
            </button>
          </div>

          <p className={styles.inputHint}>
            By scanning, you confirm you have the right to test this URL. AgentisLux reads raw HTML. It does not execute JavaScript. Scans are ephemeral and not stored.
          </p>
        </div>

        {/* RIGHT COLUMN */}
        <div className={styles.scanInputRight}>
          {/* Arc decoration bottom-left: ochre, 4 arcs, rotated 180deg */}
          <div className={`${styles.arcDecoration} ${styles.bottomLeft}`} aria-hidden="true">
            <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
              <g fill="none" stroke="var(--highlight)" strokeWidth="2.5">
                <path d="M 300 300 A 280 280 0 0 0 20 20" />
                <path d="M 300 300 A 220 220 0 0 0 80 80" />
                <path d="M 300 300 A 160 160 0 0 0 140 140" />
                <path d="M 300 300 A 100 100 0 0 0 200 200" />
              </g>
            </svg>
          </div>

          <div className={styles.rightPanelEyebrow}>What happens when you scan</div>
          <h2 className={styles.rightPanelHeading}>
            Three steps. <em>One report.</em>
          </h2>
          <ol className={styles.rightPanelList}>
            <li>
              <strong>Fetch and parse</strong>
              We fetch your HTML (no JavaScript execution). If an OpenAPI spec is auto-discovered, we parse it alongside.
            </li>
            <li>
              <strong>Layer 1 — deterministic scan</strong>
              Six frontend categories. Six API categories if a spec is present. Pattern matching, no AI. Same input, same score, every time.
            </li>
            <li>
              <strong>Layer 2 — agent simulation</strong>
              Six tasks attempted against your site as an agent would. Claude Haiku reports what it could and could not do. Linked back to Layer 1 findings.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
