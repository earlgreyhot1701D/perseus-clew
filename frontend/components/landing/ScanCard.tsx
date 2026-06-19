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
  { id: 'url', label: 'URL' },
  { id: 'github', label: 'GitHub' },
  { id: 'api', label: 'API Spec' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ScanCard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('url');
  const [urlValue, setUrlValue] = useState('');
  const [ghValue, setGhValue] = useState('');
  const [apiValue, setApiValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let target = '';
    if (activeTab === 'url' && urlValue.trim()) {
      target = urlValue.trim().startsWith('http') ? urlValue.trim() : `https://${urlValue.trim()}`;
    } else if (activeTab === 'github' && ghValue.trim()) {
      target = `https://github.com/${ghValue.trim()}`;
    } else if (activeTab === 'api' && apiValue.trim()) {
      target = apiValue.trim();
    }

    if (!target) return;

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
      <p className={styles.scanSub}>Frontend scanning live. API scanning on the backend.</p>

      <div className={styles.tabs} role="tablist" aria-label="Scan input type">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
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

        {/* GitHub panel */}
        <div
          className={activeTab === 'github' ? styles.scanPanel : styles.scanPanelHidden}
          id="panel-github"
          role="tabpanel"
          aria-labelledby="tab-github"
        >
          <label className={styles.visuallyHidden} htmlFor="gh-input">GitHub repository</label>
          <div className={styles.inputRow}>
            <span className={styles.prefix} aria-hidden="true">github.com/</span>
            <input
              className={styles.urlInput}
              id="gh-input"
              name="gh"
              type="text"
              placeholder="org/repo"
              style={{ paddingLeft: 106 }}
              autoComplete="off"
              spellCheck={false}
              value={ghValue}
              onChange={(e) => setGhValue(e.target.value)}
            />
          </div>
        </div>

        {/* API Spec panel */}
        <div
          className={activeTab === 'api' ? styles.scanPanel : styles.scanPanelHidden}
          id="panel-api"
          role="tabpanel"
          aria-labelledby="tab-api"
        >
          <label className={styles.visuallyHidden} htmlFor="api-input">OpenAPI spec URL</label>
          <div className={styles.inputRow}>
            <span className={styles.prefix} aria-hidden="true">spec:</span>
            <input
              className={styles.urlInput}
              id="api-input"
              name="api"
              type="text"
              placeholder="openapi.yaml"
              style={{ paddingLeft: 58 }}
              autoComplete="off"
              spellCheck={false}
              value={apiValue}
              onChange={(e) => setApiValue(e.target.value)}
            />
          </div>
        </div>

        <button className={styles.cta} type="submit">
          <span>Observe this site</span>
          <span className={styles.arrow} aria-hidden="true">&#8594;</span>
        </button>
      </form>

      <p className={styles.cardFoot}>No account · No tracking · ~4s scan</p>
    </div>
  );
}
