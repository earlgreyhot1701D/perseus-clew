/**
 * Agentis Lux: Social card image generation via @vercel/og.
 *
 * Renders a 1200x630 PNG social card with the scan result.
 * Uses Satori (via ImageResponse) for server-side rendering with
 * custom fonts (Instrument Serif, Archivo Black, JetBrains Mono).
 *
 * NEUTRAL VISUAL: same dignified treatment at any score. No red/green
 * pass/fail coloring, no celebratory/punitive iconography. The teal
 * background + cream text + arc motif is constant regardless of number.
 *
 * Security: domain, heroLine, rating are user/model-supplied strings.
 * Satori renders to SVG/PNG natively (no innerHTML), so XSS is not
 * possible in the image output. Query params are validated and capped.
 *
 * Block 1I. See FRONTEND-SPEC.md social card section.
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Font loading (fetched at build time on Vercel, cached at edge)
const instrumentSerifItalic = fetch(
  new URL('https://fonts.gstatic.com/s/instrumentserif/v4/jizBRFtNs2ka5fCjOY3GtSiUx3Yr.woff2')
).then((res) => res.arrayBuffer());

const archivoBlack = fetch(
  new URL('https://fonts.gstatic.com/s/archivoblack/v21/HTxqL89-YrCOkULFpE3CfMg8Eqs.woff2')
).then((res) => res.arrayBuffer());

const jetbrainsMono = fetch(
  new URL('https://fonts.gstatic.com/s/jetbrainsmono/v20/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2')
).then((res) => res.arrayBuffer());

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract and validate params (all user/model-supplied, cap lengths)
    const domain = (searchParams.get('domain') || 'unknown').slice(0, 100);
    const scoreRaw = searchParams.get('score') || '0';
    const score = Math.max(0, Math.min(100, parseInt(scoreRaw, 10) || 0));
    const rating = (searchParams.get('rating') || 'Not Yet Readable').slice(0, 30);
    const heroText = (searchParams.get('hero') || '').slice(0, 200);

    // Load fonts
    const [instrumentSerifData, archivoBlackData, jetbrainsMonoData] = await Promise.all([
      instrumentSerifItalic,
      archivoBlack,
      jetbrainsMono
    ]);

    // Rating badge color (observational tones, not pass/fail)
    const ratingBg = rating === 'Agent-Ready' ? '#1b6d74'
      : rating === 'Partially Ready' ? '#d4a43c'
      : '#a5370e';
    const ratingText = rating === 'Partially Ready' ? '#0f3d42' : '#f1ebdc';

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f3d42',
            color: '#f1ebdc',
            padding: '48px 56px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Arc decoration (simplified for Satori compatibility) */}
          <svg
            viewBox="0 0 340 360"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '340px',
              height: '100%',
              opacity: 0.15,
            }}
          >
            <g fill="none" stroke="#f1ebdc" strokeWidth="3">
              <path d="M 340 360 A 300 300 0 0 0 60 70" />
              <path d="M 340 360 A 235 235 0 0 0 120 120" />
              <path d="M 340 360 A 170 170 0 0 0 180 180" />
              <path d="M 340 360 A 105 105 0 0 0 235 250" />
            </g>
          </svg>

          {/* Header: branding + domain */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
            <span style={{ fontFamily: 'Archivo Black', fontSize: '18px', letterSpacing: '0.02em' }}>
              AgentisLux
            </span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '14px', color: '#8a9a9d', letterSpacing: '0.04em' }}>
              {domain}
            </span>
          </div>

          {/* Main: score + narrative */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '48px', zIndex: 2, marginTop: '24px' }}>
            {/* Score block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '200px' }}>
              <span style={{ fontFamily: 'Instrument Serif', fontSize: '120px', lineHeight: '0.85', fontStyle: 'italic' }}>
                {score}
              </span>
              <span style={{ fontFamily: 'Instrument Serif', fontSize: '36px', color: '#8a9a9d', fontStyle: 'italic', marginTop: '-8px' }}>
                /100
              </span>
              <div style={{
                marginTop: '16px',
                fontFamily: 'JetBrains Mono',
                fontSize: '13px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                padding: '6px 16px',
                borderRadius: '2px',
                backgroundColor: ratingBg,
                color: ratingText,
              }}>
                {rating}
              </div>
            </div>

            {/* Narrative */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#8a9a9d' }}>
                What an agent experiences
              </span>
              {heroText && (
                <p style={{ fontFamily: 'Instrument Serif', fontSize: '28px', fontStyle: 'italic', lineHeight: '1.3', margin: 0 }}>
                  {heroText}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2, marginTop: 'auto' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: '#8a9a9d', letterSpacing: '0.04em' }}>
              Scan mode: Frontend
            </span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: '#8a9a9d', letterSpacing: '0.04em' }}>
              Powered by the Perseus Clew engine
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          { name: 'Instrument Serif', data: instrumentSerifData, style: 'italic' as const, weight: 400 as const },
          { name: 'Archivo Black', data: archivoBlackData, style: 'normal' as const, weight: 400 as const },
          { name: 'JetBrains Mono', data: jetbrainsMonoData, style: 'normal' as const, weight: 400 as const },
        ],
      }
    );
  } catch {
    // Fail-soft: return a minimal fallback image rather than crashing
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#0f3d42', color: '#f1ebdc',
          fontSize: '24px', fontFamily: 'sans-serif'
        }}>
          AgentisLux scan result card unavailable
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
