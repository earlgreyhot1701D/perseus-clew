'use client';

/**
 * ScanCard: the scan input card in the landing hero.
 *
 * Ported from mockups/agentislux-landing.html lines 996-1035.
 * Tabs switch between URL / GitHub / API Spec inputs.
 * On submit, navigates to /scan?url=<value> (hands off to the scan page).
 *
 * NOTE: The /scan page does not yet read the ?url= query param to prefill its input.
 * That handoff is a follow-up task (trivial: read searchParams, prefill useState).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './ScanCard.module.css';

const TABS = [
  { id: 'url', label: 'URL', gated: false },
  { id: 'github', label: 'GitHub', gated: true },
  { id: 'api', label: 'API Spec', gated: true },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ScanCard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('url');
  const [urlValue, setUrlValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (activeTab !== 'url' || !urlValue.trim()) return;

    const target = urlValue.trim().startsWith('http') ? urlValue.trim() : `https://${urlValue.trim()}`;
    router.push(`/scan?url=${encodeURIComponent(target)}`);
  }

  return (
    <div className={styles.scanCard}>
      <svg className={styles.cardArcs} aria-hidden="true">
        <use href="#arcs-tr" />
      </svg>

      <div className={styles.scanEyebrow}>
        <span>&#167; 01 · Begin scan</span>
        <span className={styles.status} aria-live="polite">
          <span className={styles.pulseDot} aria-hidden="true" />
          System ready
        </span>
      </div>

      <h2 className={styles.scanHeading}>
        Paste a URL.
        <span className={styles.scanHeadingItal}>Get the report.</span>
      </h2>
      <p className={styles.scanSub}>Frontend scanning live. Repo and API scanning on the Team tier.</p>

      <div className={styles.tabs} role="tablist" aria-label="Scan input type">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''} ${tab.gated ? styles.tabGated : ''}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-disabled={tab.gated ? true : undefined}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={tab.gated ? -1 : (activeTab === tab.id ? 0 : -1)}
            onClick={() => { if (!tab.gated) setActiveTab(tab.id); }}
            type="button"
          >
            {tab.label}
            {tab.gated && <span className={styles.tierBadge}>Team</span>}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* URL panel */}
        <div
          className={activeTab === 'url' ? styles.scanPanel : styles.scanPanelHidden}
          id="panel-url"
          role="tabpanel"
          aria-labelledby="tab-url"
        >
          <label className={styles.visuallyHidden} htmlFor="url-input">Website URL to scan</label>
          <div className={styles.inputRow}>
            <span className={styles.prefix} aria-hidden="true">https://</span>
            <input
              className={styles.urlInput}
              id="url-input"
              name="url"
              type="url"
              placeholder="yourdomain.com"
              autoComplete="off"
              spellCheck={false}
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
            />
          </div>
        </div>

        {/* GitHub panel (gated) */}
        <div
          className={styles.scanPanelHidden}
          id="panel-github"
          role="tabpanel"
          aria-labelledby="tab-github"
        >
          <p className={styles.gatedNote}>Available on the Team tier.</p>
        </div>

        {/* API Spec panel (gated) */}
        <div
          className={styles.scanPanelHidden}
          id="panel-api"
          role="tabpanel"
          aria-labelledby="tab-api"
        >
          <p className={styles.gatedNote}>Available on the Team tier.</p>
        </div>

        <button className={styles.cta} type="submit">
          <span>Observe this site</span>
          <span className={styles.arrow} aria-hidden="true">&#8594;</span>
        </button>
      </form>

      <p className={styles.cardFoot}>No account · No tracking · ~10s scan</p>
    </div>
  );
}
