/**
 * Agentis Lux: HTML report generation and download.
 *
 * Generates a self-contained HTML report from scan results and triggers
 * a browser download. Styled to match mockups/agentislux-verdict-hero.html.
 * Uses Google Fonts (Instrument Serif, Archivo Black, JetBrains Mono) with
 * system fallbacks for offline viewing.
 *
 * L-XSS-SIM-1: all dynamic strings (domain, heroLine, findings, simulation
 * narrative/reasoning) are HTML-entity-escaped before template insertion.
 * Defense-in-depth: findings are already sanitized by flow.js, but we
 * double-escape here because the report is a standalone HTML file that
 * could be opened in any context.
 *
 * Self-scan integrity: output uses semantic HTML (main, section, h1-h3,
 * ul/li), proper lang attribute, no div-buttons, no image-only content.
 *
 * Block 1I. See FRONTEND-SPEC.md report section.
 */

// --- Types ---

interface ScoreBreakdown {
  [category: string]: { earned: number; max: number; note: string | null };
}

interface Finding {
  id: string;
  text: string;
  count: number | null;
  examples?: string[];
}

interface SimulationTask {
  taskId: string;
  outcome: string;
  narrative: string;
  linkedFindings: string[];
  reasoning: string;
}

export interface ReportData {
  domain: string;
  score: number;
  rating: string;
  heroText: string;
  heroSource: string;
  breakdown: ScoreBreakdown;
  findings: Record<string, Finding[]>;
  simulation?: { available: boolean; tasks?: SimulationTask[] };
  scannedAt: string;
  methodologyVersion: string;
}

// --- Escaping (L-XSS-SIM-1) ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Category display names ---

const CATEGORY_NAMES: Record<string, string> = {
  semantic_html: 'Semantic HTML',
  form_accessibility: 'Form Accessibility',
  aria: 'ARIA and Accessibility',
  structured_data: 'Structured Data',
  content_in_html: 'Content in HTML',
  link_navigation: 'Link and Navigation',
};

const CATEGORY_SUMMARIES: Record<string, string> = {
  semantic_html: 'Agents can\'t always tell your buttons, lists, and sections apart. This is usually handled with semantic HTML, which most frameworks output by default.',
  form_accessibility: 'Agents can\'t always tell what each form field expects. This is usually handled with proper labels and input types.',
  aria: 'Agents can\'t always read the state of interactive widgets. This is usually handled with ARIA roles and attributes.',
  structured_data: 'Agents can\'t reliably tell what your pages are about. This is usually handled with structured data, which most site builders and frameworks support.',
  content_in_html: 'Agents may not see content that only appears after JavaScript runs. This is usually handled with server-side rendering or static HTML.',
  link_navigation: 'Agents can\'t always move through your site predictably. This is usually handled with real link destinations and clear navigation.',
};

// --- Report generation ---

export function generateReportHtml(data: ReportData): string {
  const {
    domain, score, rating, heroText, heroSource,
    breakdown, findings, simulation, scannedAt, methodologyVersion
  } = data;

  const safeDomain = escapeHtml(domain);
  const safeHeroText = escapeHtml(heroText);
  const safeRating = escapeHtml(rating);
  const safeScannedAt = escapeHtml(scannedAt);
  const safeVersion = escapeHtml(methodologyVersion);

  // Rating badge colors (observational tones, not pass/fail)
  const ratingBg = rating === 'Agent-Ready' ? '#1b6d74'
    : rating === 'Partially Ready' ? '#d4a43c'
    : '#a5370e';
  const ratingTextColor = rating === 'Partially Ready' ? '#0f3d42' : '#f1ebdc';

  const fillWidth = Math.max(0, Math.min(100, score));

  // Category breakdown cards (3x2 grid matching on-screen layout)
  const categoryCards = Object.entries(breakdown).map(([key, val], index) => {
    const name = CATEGORY_NAMES[key] || key;
    const categoryFindings = findings[key] || [];
    const pct = val.max > 0 ? Math.round((val.earned / val.max) * 100) : 100;
    const findingCount = categoryFindings.length;
    const findingLabel = findingCount === 0 ? '' : `${findingCount} ${findingCount === 1 ? 'finding' : 'findings'}`;

    return `
      <div class="cat-card">
        <span class="cat-num">Category ${String(index + 1).padStart(2, '0')} &middot; Weight ${val.max}</span>
        <span class="cat-name">${escapeHtml(name)}</span>
        <p class="cat-summary">${escapeHtml(CATEGORY_SUMMARIES[key] || '')}</p>
        <div class="cat-bar-row">
          <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
          <span class="cat-score">${val.earned} / ${val.max}</span>
        </div>
        ${val.note ? `<span class="cat-note">${escapeHtml(val.note)}</span>` : ''}
        ${findingLabel ? `<span class="cat-finding-count">${findingLabel}</span>` : ''}
      </div>`;
  }).join('');

  // All findings detail
  const findingsSections = Object.entries(findings).map(([category, items]) => {
    if (!items || items.length === 0) return '';
    const name = CATEGORY_NAMES[category] || category;
    const rows = items.map(f => `
      <li>
        <span class="finding-id">${escapeHtml(f.id)}</span>
        ${escapeHtml(f.text)}
        ${f.count !== null ? `<span class="finding-count">(${f.count} instance${f.count === 1 ? '' : 's'})</span>` : ''}
      </li>`).join('');
    return `
      <section>
        <h3>${escapeHtml(name)}</h3>
        <ul class="finding-list">${rows}</ul>
      </section>`;
  }).join('');

  // Simulation section
  let simulationSection = '';
  if (simulation?.available && simulation.tasks && simulation.tasks.length > 0) {
    const taskRows = simulation.tasks.map(t => `
      <li class="task">
        <div class="task-head">
          <strong>${escapeHtml(t.taskId)}</strong>
          <span class="outcome outcome-${escapeHtml(t.outcome)}">${escapeHtml(t.outcome)}</span>
        </div>
        <p class="task-narrative">${escapeHtml(t.narrative)}</p>
        ${t.linkedFindings.length > 0
          ? `<p class="task-linked">Related: ${t.linkedFindings.map(id => escapeHtml(id)).join(', ')}</p>`
          : ''}
      </li>`).join('');
    simulationSection = `
      <section class="simulation-section">
        <h2>Agent Simulation</h2>
        <p class="section-note">Layer 2 is an agent simulation: Claude Haiku reasons about what a retrieval agent would experience, not an autonomous agent acting on the page.</p>
        <ul class="tasks">${taskRows}</ul>
      </section>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentis Lux Report: ${safeDomain}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Archivo+Black&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --cream: #f1ebdc;
    --cream-2: #ebe3ce;
    --teal: #0f3d42;
    --teal-mid: #1b6d74;
    --sienna: #e85416;
    --sienna-deep: #d24912;
    --ochre: #d4a43c;
    --muted: #8a9a9d;
    --ink: #5a5548;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--cream);
    font-family: 'Archivo', system-ui, sans-serif;
    color: var(--teal);
    line-height: 1.5;
    padding: 32px 20px;
    display: flex;
    justify-content: center;
  }
  .wrap { width: 100%; max-width: 880px; }

  .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink);
  }

  /* Topbar */
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid var(--teal);
    padding-bottom: 10px;
    margin-bottom: 0;
  }
  .topbar .meta { display: flex; gap: 18px; align-items: center; }

  /* Hero card */
  .hero {
    background: var(--teal);
    color: var(--cream);
    border-radius: 2px;
    padding: 34px 36px 30px;
    position: relative;
    overflow: hidden;
    margin-top: 18px;
  }
  .hero .arcs {
    position: absolute;
    top: 0;
    right: 0;
    width: 340px;
    height: 100%;
    opacity: 0.18;
    pointer-events: none;
  }
  .hero-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 34px;
    align-items: center;
    position: relative;
    z-index: 2;
  }
  .scoreblock { text-align: center; min-width: 170px; }
  .scoreblock .num {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 118px;
    line-height: 0.82;
    color: var(--cream);
    font-style: italic;
  }
  .scoreblock .num .denom { font-size: 34px; color: var(--muted); }
  .label {
    margin-top: 14px;
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 6px 14px;
    border-radius: 2px;
  }
  .ring-track { margin-top: 16px; height: 5px; background: rgba(241,235,220,0.18); border-radius: 3px; overflow: hidden; }
  .ring-fill { height: 100%; background: var(--sienna); }

  .narr .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 10px;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .narr .tag .ai { color: var(--ochre); }
  .narr p.line {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 24px;
    font-style: italic;
    line-height: 1.28;
    color: var(--cream);
    max-width: 540px;
  }

  /* Categories */
  .cats-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 26px 2px 12px;
  }
  .cats-head .h {
    font-family: 'Archivo Black', sans-serif;
    font-size: 15px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--teal);
  }
  .cat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .cat-card {
    background: var(--cream-2);
    border: 1px solid rgba(15,61,66,0.14);
    border-radius: 2px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cat-card .cat-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .cat-card .cat-name {
    font-family: 'Archivo Black', sans-serif;
    font-size: 14px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--teal);
  }
  .cat-card .cat-summary {
    font-family: 'Archivo', system-ui, sans-serif;
    font-size: 12px;
    color: var(--ink);
    line-height: 1.4;
    margin: 0;
  }
  .cat-card .cat-bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .cat-card .cat-bar {
    flex: 1;
    height: 5px;
    background: rgba(15,61,66,0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  .cat-card .cat-bar-fill { height: 100%; background: var(--teal); border-radius: 3px; }
  .cat-card .cat-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--teal-mid);
    font-weight: 500;
    white-space: nowrap;
  }
  .cat-card .cat-finding-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }

  /* Findings detail */
  .findings-detail { margin-top: 32px; }
  .findings-detail h2 {
    font-family: 'Archivo Black', sans-serif;
    font-size: 15px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--teal);
    border-bottom: 1px solid var(--teal);
    padding-bottom: 6px;
    margin-bottom: 16px;
  }
  .findings-detail h3 {
    font-size: 14px;
    color: var(--teal-mid);
    margin: 20px 0 8px;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .finding-list { list-style: none; padding: 0; }
  .finding-list li {
    padding: 10px 0;
    border-bottom: 1px solid rgba(15,61,66,0.08);
    font-size: 15px;
    line-height: 1.5;
  }
  .finding-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--sienna);
    margin-right: 8px;
  }
  .finding-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    margin-left: 6px;
  }

  /* Simulation */
  .simulation-section { margin-top: 32px; }
  .simulation-section h2 {
    font-family: 'Archivo Black', sans-serif;
    font-size: 15px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--teal);
    border-bottom: 1px solid var(--teal);
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .section-note { font-size: 13px; color: var(--ink); margin-bottom: 16px; }
  .tasks { list-style: none; padding: 0; }
  .task { padding: 12px 0; border-bottom: 1px solid rgba(15,61,66,0.08); }
  .task-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .outcome {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 2px;
  }
  .outcome-success { background: var(--teal-mid); color: var(--cream); }
  .outcome-partial { background: var(--ochre); color: var(--teal); }
  .outcome-failure { background: var(--sienna); color: var(--cream); }
  .task-narrative { font-style: italic; font-size: 14px; color: var(--teal); margin-top: 4px; }
  .task-linked { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); margin-top: 4px; }

  /* Footer */
  .footnote {
    margin-top: 28px;
    padding-top: 14px;
    border-top: 1px solid rgba(15,61,66,0.2);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Print */
  @media print {
    body { padding: 16px; }
    .hero { break-inside: avoid; }
    .cat-card { break-inside: avoid; }
  }

  /* Mobile */
  @media (max-width: 640px) {
    .hero-grid { grid-template-columns: 1fr; text-align: center; }
    .scoreblock .num { font-size: 72px; }
    .narr p.line { font-size: 20px; max-width: none; }
    .cat-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="wrap">
<main>
  <div class="topbar">
    <div class="meta">
      <span class="eyebrow" style="font-weight:500;color:var(--teal);">Agentis Lux</span>
      <span class="eyebrow">Powered by the Perseus Clew engine</span>
    </div>
    <div class="meta">
      <span class="eyebrow">${safeDomain}</span>
      <span class="eyebrow">${safeScannedAt}</span>
    </div>
  </div>

  <section class="hero" aria-label="Score summary">
    <svg class="arcs" viewBox="0 0 340 360" preserveAspectRatio="xMaxYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" stroke="#f1ebdc" stroke-width="3">
        <path d="M 340 360 A 300 300 0 0 0 60 70"></path>
        <path d="M 340 360 A 235 235 0 0 0 120 120"></path>
        <path d="M 340 360 A 170 170 0 0 0 180 180"></path>
        <path d="M 340 360 A 105 105 0 0 0 235 250"></path>
      </g>
      <circle cx="300" cy="56" r="14" fill="#d4a43c"></circle>
    </svg>

    <div class="hero-grid">
      <div class="scoreblock">
        <div class="num">${score}<span class="denom">/100</span></div>
        <div class="label" style="background:${ratingBg};color:${ratingTextColor}">${safeRating}</div>
        <div class="ring-track"><div class="ring-fill" style="width:${fillWidth}%"></div></div>
      </div>

      <div class="narr">
        <div class="tag">
          <span>What an agent experiences</span>
          <span class="ai">${heroSource === 'ai' ? '&bull; AI written' : '&bull; Generated summary'}</span>
        </div>
        <p class="line">${safeHeroText}</p>
      </div>
    </div>
  </section>

  <div class="cats-head">
    <span class="h">Six categories</span>
    <span class="eyebrow">Methodology v${safeVersion}</span>
  </div>

  <div class="cat-grid">
  ${categoryCards}
  </div>

  <section class="findings-detail">
    <h2>All Findings</h2>
    ${findingsSections || '<p>No findings.</p>'}
  </section>

  ${simulationSection}

  <div class="footnote">
    <span>Agentis Lux &middot; for your second audience</span>
    <span>Score is deterministic &middot; narrative is ${heroSource === 'ai' ? 'AI written' : 'template generated'}</span>
  </div>
</main>
</div>
</body>
</html>`;
}

// --- Download trigger ---

export function downloadReport(data: ReportData): void {
  try {
    const html = generateReportHtml(data);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentislux-report-${data.domain.replace(/[^a-z0-9.-]/gi, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Fail-soft: report download failure should not crash the app
    // The caller handles the error state (toast/message)
    throw new Error('Report download failed');
  }
}
