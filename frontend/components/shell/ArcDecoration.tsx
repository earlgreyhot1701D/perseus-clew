/**
 * ArcDecoration: reusable concentric-arc SVG decoration.
 *
 * The Wyman signature pattern. Renders quarter-arcs emanating from a corner.
 * Purely decorative (aria-hidden).
 *
 * Visual reference: mockups/agentislux-app.html .arc-decoration
 */

import styles from './ArcDecoration.module.css';

interface ArcDecorationProps {
  size?: number;
  color?: string;
  arcs?: number;
  opacity?: number;
  className?: string;
}

export default function ArcDecoration({
  size = 300,
  color = 'var(--accent)',
  arcs = 5,
  opacity = 0.18,
  className = ''
}: ArcDecorationProps) {
  // Generate concentric arc paths from bottom-right corner
  const paths = [];
  const step = Math.floor((size - 40) / arcs);

  for (let i = 0; i < arcs; i++) {
    const radius = size - (i * step) - 20;
    if (radius <= 0) break;
    const endX = size - radius;
    const endY = size - radius;
    paths.push(
      <path
        key={i}
        d={`M ${size} ${size} A ${radius} ${radius} 0 0 0 ${endX} ${endY}`}
      />
    );
  }

  return (
    <div
      className={`${styles.arcDecoration} ${className}`}
      style={{ width: size, height: size, opacity }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svg}
      >
        <g fill="none" stroke={color} strokeWidth="2.5">
          {paths}
        </g>
      </svg>
    </div>
  );
}
