'use client';

/**
 * /scan route: the scan flow.
 *
 * Four view states per mockup agentislux-app.html:
 * - input: scan input form (View 1)
 * - scanning: progress/loading (View 2)
 * - results: results dashboard (View 3)
 * - error: error state (View 5)
 *
 * The report lives in component state (ephemeral by design; refresh resets to input).
 */

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AppNav from '@/components/shell/AppNav';
import ResultHero from '@/components/ResultHero';
import styles from './page.module.css';

type ViewState = 'input' | 'scanning' | 'results' | 'error';

interface ScanReport {
  meta: {
    requestId: string;
    resultId: string;
    scanType: string;
    targetDomain: string;
    durationMs: number;
    timestamp: string;
    scannedAt: string;
    fromCache: boolean;
    methodologyVersion: string;
  };
  preScanFindings: Array<{ type: string; message: string }>;
  scoredViews: {
    rawHtml: {
      score: { total: number; rating: string; breakdown: Record<string, { earned: number; max: number; note: string | null }> };
      heroLine: { text: string; source: 'ai' | 'template'; model: string | null };
      findings: Record<string, Array<{ id: string; text: string; count: number | null; examples?: string[] }>>;
    };
  };
  simulation: { available: boolean };
}

interface ScanError {
  error: string;
  message: string;
  status: number;
}

const TABS = ['URL', 'GitHub repo', 'API spec upload'] as const;

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_URL: 'This URL cannot be scanned. Check the format and try again.',
  DNS_FAILURE: 'This domain could not be resolved. Check the URL and try again.',
  SCAN_TIMEOUT: 'The scan took too long to complete. Try again.',
  SITE_BLOCKED: 'This site is blocking automated requests.',
  PAGE_NOT_FOUND: 'This page was not found. Check the URL and try again.',
  NOT_HTML: 'This URL returned non-HTML content. Only HTML pages can be scanned.',
  PAGE_TOO_LARGE: 'This page is too large to scan (over 5MB).',
  REDIRECT_LIMIT: 'This URL redirected too many times.',
  RATE_LIMIT: 'Too many requests. Please wait a moment before scanning again.',
  NOT_IMPLEMENTED: 'This scan type is not yet available.',
  PROXY_TIMEOUT: 'The scan took too long at the gateway. Try again.',
};

function getUserMessage(err: ScanError): string {
  return ERROR_MESSAGES[err.error] || err.message || 'An unexpected error occurred.';
}

const CATEGORY_LABELS: Record<string, string> = {
  semantic_html: 'Semantic HTML',
  form_accessibility: 'Form Accessibility',
  aria: 'ARIA',
  structured_data: 'Structured Data',
  content_in_html: 'Content in HTML',
  link_navigation: 'Link and Navigation',
};

const CATEGORY_ORDER = [
  'semantic_html', 'form_accessibility', 'aria',
  'structured_data', 'content_in_html', 'link_navigation'
];

function ScanFlow() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [viewState, setViewState] = useState<ViewState>('input');
  const [report, setReport] = useState<ScanReport | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [scanDomain, setScanDomain] = useState('');

  // URL prefill from ?url= (L-LAND-1)
  useEffect(() => {
    const prefill = searchParams.get('url');
    if (prefill) {
      setInputValue(prefill);
    }
  }, [searchParams]);

  async function handleScan() {
    if (!inputValue.trim()) return;

    const target = inputValue.trim();
    let domain = 'unknown';
    try { domain = new URL(target).hostname; } catch { /* use default */ }

    setScanDomain(domain);
    setViewState('scanning');
    setScanError(null);
    setReport(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', target }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'UNKNOWN', message: 'An unexpected error occurred.' }));
        // Distinguish proxy timeout (gateway abort) from backend SCAN_TIMEOUT
        if (res.status === 504 && !errData.error) {
          setScanError({ error: 'PROXY_TIMEOUT', message: 'The scan took too long at the gateway.', status: 504 });
        } else {
          setScanError({ ...errData, status: res.status });
        }
        setViewState('error');
        return;
      }

      const data: ScanReport = await res.json();
      setReport(data);
      setViewState('results');
    } catch {
      setScanError({ error: 'NETWORK_ERROR', message: 'Could not connect to the scan engine. Try again.', status: 0 });
      setViewState('error');
    }
  }

  function handleReset() {
    setViewState('input');
    setReport(null);
    setScanError(null);
    setInputValue('');
  }

  return (
    <>
      {viewState === 'input' && (
        <div className={styles.scanInputView}>
          <div className={styles.scanInputLeft}>
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

            <div className={styles.inputEyebrow}>Scan</div>
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
                onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
              />
              <button
                className={styles.scanBtn}
                type="button"
                onClick={handleScan}
                disabled={!inputValue.trim()}
              >
                Scan
              </button>
            </div>

            <p className={styles.inputHint}>
              By scanning, you confirm you have the right to test this URL. Agentis Lux reads raw HTML. It does not execute JavaScript. Scans are ephemeral and not stored.
            </p>
          </div>

          <div className={styles.scanInputRight}>
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
                <strong>Layer 1: deterministic scan</strong>
                Six frontend categories. Pattern matching, no AI. Same input, same score, every time.
              </li>
              <li>
                <strong>Layer 2: agent narrative</strong>
                A one-sentence summary of what an agent experiences on this page.
              </li>
            </ol>
          </div>
        </div>
      )}

      {viewState === 'scanning' && (
        <div className={styles.scanningView}>
          <div className={styles.scanningContent}>
            <div className={styles.scanningEyebrow}>Scanning {scanDomain}</div>
            <h1 className={styles.scanningTitle}>
              Asking the <em>agent</em> what it sees.
            </h1>
            <p className={styles.scanningSubtitle}>
              This typically takes a few seconds. Scans are not stored.
            </p>
            <div className={styles.scanningProgress} role="status" aria-live="polite">
              <div className={styles.progressStep}>
                <span className={styles.progressNum}>01</span>
                <span>Fetching HTML</span>
                <span className={styles.progressStatus}>Active</span>
              </div>
              <div className={`${styles.progressStep} ${styles.progressPending}`}>
                <span className={styles.progressNum}>02</span>
                <span>Running Layer 1 checks</span>
                <span className={styles.progressStatus}>Pending</span>
              </div>
              <div className={`${styles.progressStep} ${styles.progressPending}`}>
                <span className={styles.progressNum}>03</span>
                <span>Generating agent narrative</span>
                <span className={styles.progressStatus}>Pending</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewState === 'error' && scanError && (
        <div className={styles.errorView}>
          <div className={styles.errorContent}>
            <div className={styles.errorIcon}>!</div>
            <div className={styles.errorEyebrow}>Scan could not complete</div>
            <h2 className={styles.errorTitle}>{getUserMessage(scanError)}</h2>
            <div className={styles.errorActions}>
              <button className={styles.errorBtn} type="button" onClick={handleReset}>
                Try a different URL
              </button>
            </div>
          </div>
        </div>
      )}

      {viewState === 'results' && report && (
        <div className={styles.resultsView}>
          {/* Pre-scan notices */}
          {report.preScanFindings.length > 0 && (
            <div className={styles.preScanNotices}>
              {report.preScanFindings.map((finding, i) => (
                <div key={i} className={styles.preScanNotice}>
                  {finding.message}
                </div>
              ))}
            </div>
          )}

          {/* Result hero */}
          <ResultHero
            score={report.scoredViews.rawHtml.score}
            heroLine={report.scoredViews.rawHtml.heroLine}
          />

          {/* Category breakdown */}
          <section className={styles.categoriesSection}>
            <div className={styles.sectionEyebrow}>Six categories</div>
            <h3 className={styles.sectionTitle}>Category <em>breakdown.</em></h3>
            <div className={styles.categoryGrid}>
              {CATEGORY_ORDER.map((key, i) => {
                const cat = report.scoredViews.rawHtml.score.breakdown[key];
                const findings = report.scoredViews.rawHtml.findings[key] || [];
                if (!cat) return null;
                const pct = cat.max > 0 ? Math.round((cat.earned / cat.max) * 100) : 100;
                return (
                  <div key={key} className={styles.categoryCell}>
                    <span className={styles.categoryNum}>
                      Category {String(i + 1).padStart(2, '0')} · Weight {cat.max}
                    </span>
                    <span className={styles.categoryName}>{CATEGORY_LABELS[key]}</span>
                    <div className={styles.categoryBarRow}>
                      <div className={styles.categoryBarTrack}>
                        <div className={styles.categoryBarFill} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={styles.categoryScore}>{cat.earned} / {cat.max}</span>
                    </div>
                    {cat.note && (
                      <span className={styles.categoryNote}>{cat.note}</span>
                    )}
                    {findings.length > 0 && (
                      <span className={styles.categoryFindingCount}>
                        {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Findings detail */}
          <section className={styles.findingsSection}>
            <div className={styles.sectionEyebrow}>Detailed findings</div>
            {CATEGORY_ORDER.map((key) => {
              const findings = report.scoredViews.rawHtml.findings[key] || [];
              if (findings.length === 0) return null;
              return (
                <div key={key} className={styles.findingCategory}>
                  <h4 className={styles.findingCategoryTitle}>{CATEGORY_LABELS[key]}</h4>
                  <ul className={styles.findingList}>
                    {findings.map((f) => (
                      <li key={f.id} className={styles.findingItem}>
                        <span className={styles.findingId}>{f.id}</span>
                        <p className={styles.findingText}>{f.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          {/* Scan another */}
          <div className={styles.scanAnother}>
            <button className={styles.scanAnotherBtn} type="button" onClick={handleReset}>
              Scan another URL
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function ScanPage() {
  return (
    <div className={styles.appFrame}>
      <AppNav />
      <Suspense fallback={null}>
        <ScanFlow />
      </Suspense>
    </div>
  );
}
