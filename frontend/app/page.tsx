'use client';
import { useEffect, useState } from 'react';
import ResultHero from '@/components/ResultHero';

interface HealthResponse {
  status: string;
  version: string;
  name: string;
  scanner: string;
}

interface ScanResult {
  scoredViews: {
    rawHtml: {
      score: { total: number; rating: string };
      heroLine: { text: string; source: 'ai' | 'template' };
    };
  };
}

type ScanState = 'idle' | 'loading' | 'success' | 'error';

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => {
        if (!r.ok) throw new Error(`Health check returned ${r.status}`);
        return r.json();
      })
      .then(setHealth)
      .catch((err) => setHealthError(err.message));
  }, []);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();

    if (!url.trim()) return;

    setScanState('loading');
    setScanError(null);
    setScanResult(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', target: url.trim() })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Scan returned ${res.status}`);
      }

      const data: ScanResult = await res.json();
      setScanResult(data);
      setScanState('success');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Something went wrong');
      setScanState('error');
    }
  }

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px' }}>
      <header style={{ marginBottom: 'var(--space-8)' }}>
        <h1>Agentis Lux</h1>
        <p style={{ color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>
          {healthError
            ? `Backend unavailable: ${healthError}`
            : health
              ? `Backend: ${health.status}, v${health.version}`
              : 'Connecting to backend...'}
        </p>
      </header>

      <form onSubmit={handleScan} style={{ marginBottom: 'var(--space-8)' }}>
        <label htmlFor="scan-url" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
          Paste a URL to scan
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            id="scan-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
            style={{
              flex: 1,
              padding: '10px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              border: '2px solid var(--teal)',
              borderRadius: '2px',
              background: 'var(--cream-2)'
            }}
          />
          <button
            type="submit"
            disabled={scanState === 'loading'}
            style={{
              padding: '10px 20px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              background: 'var(--sienna)',
              color: 'var(--cream)',
              border: 'none',
              borderRadius: '2px',
              cursor: scanState === 'loading' ? 'wait' : 'pointer'
            }}
          >
            {scanState === 'loading' ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </form>

      {scanState === 'loading' && (
        <p style={{ color: 'var(--ink)' }}>Running scan...</p>
      )}

      {scanState === 'error' && scanError && (
        <p style={{ color: 'var(--sienna)' }} role="alert">{scanError}</p>
      )}

      {scanState === 'success' && scanResult && (
        <ResultHero
          score={scanResult.scoredViews.rawHtml.score}
          heroLine={scanResult.scoredViews.rawHtml.heroLine}
        />
      )}
    </main>
  );
}
