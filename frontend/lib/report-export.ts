/**
 * Agentis Lux: HTML report generation and download.
 *
 * Generates a self-contained HTML report from scan results and triggers
 * a browser download. No external dependencies, no network requests,
 * no JavaScript in the output. System font fallbacks (no embedded font files).
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

  // Rating badge colors (same mapping as social card route)
  const ratingBg = rating === 'Agent-Ready' ? '#1b6d74'
    : rating === 'Partially Ready' ? '#d4a43c'
    : '#a5370e';
  const ratingTextColor = rating === 'Partially Ready' ? '#0f3d42' : '#f1ebdc';

  const categoryRows = Object.entries(breakdown).map(([key, val]) => {
    const name = CATEGORY_NAMES[key] || key;
    const note = val.note ? ` <em>(${escapeHtml(val.note)})</em>` : '';
    const pct = val.max > 0 ? Math.round((val.earned / val.max) * 100) : 100;
    return `
      <tr>
        <td>${escapeHtml(name)}${note}</td>
        <td>${val.earned} / ${val.max}</td>
        <td><div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div></td>
      </tr>`;
  }).join('');

  const findingsSections = Object.entries(findings).map(([category, items]) => {
    if (!items || items.length === 0) return '';
    const name = CATEGORY_NAMES[category] || category;
    const rows = items.map(f => `
      <li>
        <span class="finding-id">${escapeHtml(f.id)}</span>
        ${escapeHtml(f.text)}
        ${f.count !== null ? `<span class="finding-count">(${f.count})</span>` : ''}
      </li>`).join('');
    return `
      <section>
        <h3>${escapeHtml(name)}</h3>
        <ul>${rows}</ul>
      </section>`;
  }).join('');

  let simulationSection = '';
  if (simulation?.available && simulation.tasks && simulation.tasks.length > 0) {
    const taskRows = simulation.tasks.map(t => `
      <li>
        <strong>${escapeHtml(t.taskId)}</strong>
        <span class="outcome outcome-${escapeHtml(t.outcome)}">${escapeHtml(t.outcome)}</span>
        <p class="narrative">${escapeHtml(t.narrative)}</p>
        ${t.linkedFindings.length > 0
          ? `<p class="linked">Related: ${t.linkedFindings.map(id => escapeHtml(id)).join(', ')}</p>`
          : ''}
      </li>`).join('');
    simulationSection = `
      <section>
        <h2>Agent Simulation</h2>
        <ul class="tasks">${taskRows}</ul>
      </section>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentis Lux Report: ${safeDomain}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #0f3d42;
    background: #f1ebdc;
    line-height: 1.6;
    padding: 48px 32px;
    max-width: 800px;
    margin: 0 auto;
  }
  h1, h2, h3 { font-family: system-ui, sans-serif; }
  h1 { font-size: 1.8rem; margin-bottom: 8px; }
  h2 { font-size: 1.3rem; margin: 32px 0 12px; border-bottom: 1px solid #0f3d42; padding-bottom: 4px; }
  h3 { font-size: 1.1rem; margin: 20px 0 8px; color: #1b6d74; }
  .meta { font-family: 'Courier New', monospace; font-size: 0.8rem; color: #5a5548; margin-bottom: 32px; }
  .hero { background: #0f3d42; color: #f1ebdc; padding: 32px; border-radius: 4px; margin-bottom: 32px; }
  .hero .score { font-size: 3.5rem; font-style: italic; }
  .hero .score-denom { font-size: 1.5rem; color: #8a9a9d; }
  .hero .rating { display: inline-block; font-family: 'Courier New', monospace; font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 12px; border-radius: 2px; margin-top: 8px; }
  .hero .narrative { font-style: italic; font-size: 1.2rem; margin-top: 16px; line-height: 1.4; }
  .hero .source { font-family: 'Courier New', monospace; font-size: 0.7rem; color: #8a9a9d; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { padding: 8px 4px; border-bottom: 1px solid rgba(15,61,66,0.12); font-size: 0.9rem; }
  td:nth-child(2) { font-family: 'Courier New', monospace; text-align: right; white-space: nowrap; width: 80px; }
  td:nth-child(3) { width: 120px; }
  .bar { height: 6px; background: rgba(15,61,66,0.1); border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; background: #e85416; border-radius: 3px; }
  ul { list-style: none; padding: 0; }
  li { padding: 8px 0; border-bottom: 1px solid rgba(15,61,66,0.08); font-size: 0.9rem; }
  .finding-id { font-family: 'Courier New', monospace; font-size: 0.75rem; color: #e85416; margin-right: 8px; }
  .finding-count { font-family: 'Courier New', monospace; font-size: 0.75rem; color: #8a9a9d; }
  .tasks li { padding: 12px 0; }
  .outcome { font-family: 'Courier New', monospace; font-size: 0.75rem; text-transform: uppercase; padding: 2px 8px; border-radius: 2px; margin-left: 8px; }
  .outcome-success { background: #1b6d74; color: #f1ebdc; }
  .outcome-partial { background: #d4a43c; color: #0f3d42; }
  .outcome-failure { background: #a5370e; color: #f1ebdc; }
  .narrative { font-style: italic; margin-top: 4px; }
  .linked { font-family: 'Courier New', monospace; font-size: 0.75rem; color: #5a5548; margin-top: 4px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #0f3d42; font-family: 'Courier New', monospace; font-size: 0.7rem; color: #5a5548; }
  @media print { body { padding: 24px; } .hero { break-inside: avoid; } }
</style>
</head>
<body>
<main>
  <h1>Agentis Lux Scan Report</h1>
  <div class="meta">${safeDomain} &middot; ${safeScannedAt} &middot; Methodology v${safeVersion}</div>

  <section class="hero" aria-label="Score summary">
    <div class="score">${score}<span class="score-denom">/100</span></div>
    <div class="rating" style="background:${ratingBg};color:${ratingTextColor}">${safeRating}</div>
    <p class="narrative">${safeHeroText}</p>
    <p class="source">${heroSource === 'ai' ? 'AI written' : 'Generated summary'}</p>
  </section>

  <section>
    <h2>Category Breakdown</h2>
    <table aria-label="Score breakdown by category">
      <tbody>${categoryRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Findings</h2>
    ${findingsSections || '<p>No findings.</p>'}
  </section>

  ${simulationSection}
</main>
<footer>
  Agentis Lux is powered by the Perseus Clew engine, part of the Clew suite of developer tools.
  Score is deterministic. Narrative is AI generated with a deterministic fallback.
</footer>
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
