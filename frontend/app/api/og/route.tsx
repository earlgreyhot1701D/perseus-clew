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

// Font URLs (Google Fonts static woff2)
const FONT_URLS = {
  instrumentSerif: 'https://fonts.gstatic.com/s/instrumentserif/v4/jizBRFtNs2ka5fCjOY3GtSiUx3Yr.woff2',
  archivoBlack: 'https://fonts.gstatic.com/s/archivoblack/v21/HTxqL89-YrCOkULFpE3CfMg8Eqs.woff2',
  jetbrainsMono: 'https://fonts.gstatic.com/s/jetbrainsmono/v20/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2',
};

/**
 * Fetch a font with validation. Returns ArrayBuffer or null on failure.
 * Fail-soft: a missing font renders the card in system fonts, not an empty PNG.
 */
async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract and validate params (all user/model-supplied, cap lengths)
    const domain = (searchParams.get('domain') || 'unknown').slice(0, 100);
    const scoreRaw = searchParams.get('score') || '0';
    const score = Math.max(0, Math.min(100, parseInt(scoreRaw, 10) || 0));
    const heroText = (searchParams.get('hero') || '').slice(0, 200);

    // Rating whitelist (L-OG-RATING-1): only locked labels pass through
    const VALID_RATINGS = ['Agent-Ready', 'Partially Ready', 'Not Yet Readable'];
    const ratingParam = searchParams.get('rating') || '';
    const rating = VALID_RATINGS.includes(ratingParam) ? ratingParam : 'Not Yet Readable';

    // Load fonts (fail-soft: null means use system font for that slot)
    const [instrumentSerifData, archivoBlackData, jetbrainsMonoData] = await Promise.all([
      loadFont(FONT_URLS.instrumentSerif),
      loadFont(FONT_URLS.archivoBlack),
      loadFont(FONT_URLS.jetbrainsMono),
    ]);

    // Build fonts array (only include successfully loaded fonts)
    const fonts: { name: string; data: ArrayBuffer; style: 'italic' | 'normal'; weight: 400 }[] = [];
    if (instrumentSerifData) fonts.push({ name: 'Instrument Serif', data: instrumentSerifData, style: 'italic', weight: 400 });
    if (archivoBlackData) fonts.push({ name: 'Archivo Black', data: archivoBlackData, style: 'normal', weight: 400 });
    if (jetbrainsMonoData) fonts.push({ name: 'JetBrains Mono', data: jetbrainsMonoData, style: 'normal', weight: 400 });

    // Rating badge: NEUTRAL — ochre for all ratings (no celebrate/punish signal)
    const ratingBg = '#d4a43c';
    const ratingText = '#0f3d42';

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
          {/* Arc decoration: Wyman signature, richer strokes + ochre dots */}
          <svg
            viewBox="0 0 420 630"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '420px',
              height: '100%',
              opacity: 0.18,
            }}
          >
            <g fill="none" stroke="#f1ebdc" strokeWidth="4">
              <path d="M 420 630 A 380 380 0 0 0 50 60" />
              <path d="M 420 630 A 300 300 0 0 0 130 130" />
              <path d="M 420 630 A 220 220 0 0 0 210 210" />
              <path d="M 420 630 A 150 150 0 0 0 280 290" />
              <path d="M 420 630 A 90 90 0 0 0 335 380" />
            </g>
            <circle cx="370" cy="70" r="16" fill="#d4a43c" />
            <circle cx="280" cy="290" r="8" fill="#d4a43c" />
          </svg>

          {/* Header: branding + domain */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
            <span style={{ fontFamily: 'Archivo Black', fontSize: '20px', letterSpacing: '0.02em' }}>
              AgentisLux
            </span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '13px', color: '#8a9a9d', letterSpacing: '0.04em' }}>
              {domain}
            </span>
          </div>

          {/* Main: score + narrative */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '56px', zIndex: 2, marginTop: '16px' }}>
            {/* Score block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '200px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'Instrument Serif', fontSize: '130px', lineHeight: '0.85', fontStyle: 'italic' }}>
                  {score}
                </span>
                <span style={{ fontFamily: 'Instrument Serif', fontSize: '42px', color: '#f1ebdc', fontStyle: 'italic', marginLeft: '4px', opacity: 0.6 }}>
                  /100
                </span>
              </div>
              <div style={{
                marginTop: '14px',
                fontFamily: 'JetBrains Mono',
                fontSize: '12px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                padding: '5px 14px',
                borderRadius: '2px',
                backgroundColor: ratingBg,
                color: ratingText,
              }}>
                {rating}
              </div>
              {/* Ring/progress bar (sienna fill, score% width) */}
              <div style={{
                marginTop: '14px',
                width: '180px',
                height: '6px',
                backgroundColor: 'rgba(241, 235, 220, 0.18)',
                borderRadius: '3px',
                overflow: 'hidden',
                display: 'flex',
              }}>
                <div style={{
                  width: `${score}%`,
                  height: '100%',
                  backgroundColor: '#e85416',
                  borderRadius: '3px',
                }} />
              </div>
            </div>

            {/* Narrative */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#8a9a9d' }}>
                What an agent experiences
              </span>
              {heroText && (
                <p style={{ fontFamily: 'Instrument Serif', fontSize: '24px', fontStyle: 'italic', lineHeight: '1.35', margin: 0, maxWidth: '560px' }}>
                  {heroText}
                </p>
              )}
            </div>
          </div>

          {/* Footer with separator */}
          <div style={{ display: 'flex', flexDirection: 'column', zIndex: 2, marginTop: 'auto', gap: '10px' }}>
            <div style={{ height: '1px', backgroundColor: 'rgba(241, 235, 220, 0.15)', width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: '#8a9a9d', letterSpacing: '0.04em' }}>
                agentislux.io
              </span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: '#8a9a9d', letterSpacing: '0.04em' }}>
                Powered by the Perseus Clew engine
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: fonts.length > 0 ? fonts : undefined,
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch {
    // Fail-soft: return a minimal fallback image rather than an empty response
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
