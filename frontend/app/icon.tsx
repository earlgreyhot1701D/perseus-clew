/**
 * Dynamic favicon via Next.js icon route.
 * Renders a teal square with cream concentric arcs (the brand motif).
 */

import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f3d42',
          borderRadius: '4px',
        }}
      >
        <svg viewBox="0 0 32 32" style={{ width: '32px', height: '32px' }}>
          <g fill="none" stroke="#f1ebdc" strokeWidth="2" opacity="0.9">
            <path d="M 32 32 A 28 28 0 0 0 4 4" />
            <path d="M 32 32 A 20 20 0 0 0 12 12" />
            <path d="M 32 32 A 12 12 0 0 0 20 20" />
          </g>
          <circle cx="26" cy="6" r="3" fill="#d4a43c" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
