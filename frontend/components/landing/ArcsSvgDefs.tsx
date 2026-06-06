/**
 * ArcsSvgDefs: SVG symbol definitions for the landing page.
 *
 * Ported character-for-character from mockups/agentislux-landing.html (lines 889-930).
 * Renders as a hidden SVG with <symbol> defs that other components reference via <use href="#...">.
 *
 * Symbols:
 *   - arcs-tr: 6-arc concentric quarter circle, anchored top-right
 *   - arcs-tl: 6-arc concentric quarter circle, anchored top-left
 *   - arcs-bl: 6-arc concentric quarter circle, anchored bottom-left
 *   - arcs-tr-small: 3-arc for wordmark punctuation
 */

export default function ArcsSvgDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* 6-arc concentric quarter circle, anchored top-right (arcs emerge from TR corner) */}
        <symbol id="arcs-tr" viewBox="0 0 100 100" preserveAspectRatio="xMaxYMin meet">
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M 100 95 A 95 95 0 0 0 5 0" />
            <path d="M 100 78 A 78 78 0 0 0 22 0" />
            <path d="M 100 61 A 61 61 0 0 0 39 0" />
            <path d="M 100 44 A 44 44 0 0 0 56 0" />
            <path d="M 100 27 A 27 27 0 0 0 73 0" />
            <path d="M 100 10 A 10 10 0 0 0 90 0" />
          </g>
        </symbol>
        {/* anchored top-left */}
        <symbol id="arcs-tl" viewBox="0 0 100 100" preserveAspectRatio="xMinYMin meet">
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M 0 95 A 95 95 0 0 1 95 0" />
            <path d="M 0 78 A 78 78 0 0 1 78 0" />
            <path d="M 0 61 A 61 61 0 0 1 61 0" />
            <path d="M 0 44 A 44 44 0 0 1 44 0" />
            <path d="M 0 27 A 27 27 0 0 1 27 0" />
            <path d="M 0 10 A 10 10 0 0 1 10 0" />
          </g>
        </symbol>
        {/* anchored bottom-left for hero anchor (full quadrant feel) */}
        <symbol id="arcs-bl" viewBox="0 0 100 100" preserveAspectRatio="xMinYMax meet">
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M 0 5 A 95 95 0 0 0 95 100" />
            <path d="M 0 22 A 78 78 0 0 0 78 100" />
            <path d="M 0 39 A 61 61 0 0 0 61 100" />
            <path d="M 0 56 A 44 44 0 0 0 44 100" />
            <path d="M 0 73 A 27 27 0 0 0 27 100" />
            <path d="M 0 90 A 10 10 0 0 0 10 100" />
          </g>
        </symbol>
        {/* small 3-arc for wordmark punctuation */}
        <symbol id="arcs-tr-small" viewBox="0 0 100 100" preserveAspectRatio="xMaxYMin meet">
          <g fill="none" stroke="currentColor" strokeWidth="4">
            <path d="M 100 90 A 90 90 0 0 0 10 0" />
            <path d="M 100 60 A 60 60 0 0 0 40 0" />
            <path d="M 100 30 A 30 30 0 0 0 70 0" />
          </g>
        </symbol>
      </defs>
    </svg>
  );
}
