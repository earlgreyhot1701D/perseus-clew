/**
 * Agentis Lux: Social card image generation via @vercel/og.
 *
 * Renders a 1200x630 PNG social card with the scan result.
 * Editorial cream-background design matching the AgentisLux site.
 * Uses Satori (via ImageResponse) for server-side rendering with
 * custom fonts (Instrument Serif, Archivo Black, JetBrains Mono).
 *
 * NEUTRAL VISUAL: same dignified editorial treatment at any score.
 * Cream background, teal text, sienna accents. Identical layout
 * regardless of number. No celebratory/punitive signals.
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

// Fixed category names for the index row
const CATEGORIES = [
  '01 Semantic HTML',
  '02 Form Accessibility',
  '03 ARIA & Accessibility',
  '04 Structured Data',
  '05 Content in HTML',
  '06 Link & Navigation',
];

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

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#f1ebdc',
            color: '#0f3d42',
            padding: '40px 52px 32px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Faint arc motif top-right */}
          <svg
            viewBox="0 0 300 300"
            style={{
              position: 'absolute',
              top: '-40px',
              right: '-40px',
              width: '280px',
              height: '280px',
              opacity: 0.08,
            }}
          >
            <g fill="none" stroke="#0f3d42" strokeWidth="3">
              <path d="M 300 300 A 280 280 0 0 0 20 20" />
              <path d="M 300 300 A 220 220 0 0 0 80 80" />
              <path d="M 300 300 A 160 160 0 0 0 140 140" />
              <path d="M 300 300 A 100 100 0 0 0 200 200" />
            </g>
          </svg>

          {/* Top bar: wordmark + domain */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Archivo Black', fontSize: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.03em' }}>
              Agentis<span style={{ color: '#e85416', margin: '0 3px' }}>·</span>Lux
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '13px', letterSpacing: '0.02em' }}>
                {domain}
              </span>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#d4a43c' }} />
            </div>
          </div>

          {/* Subtitle row */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '6px', gap: '16px' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#5a5548' }}>
              Agent Experience Report
            </span>
          </div>

          {/* Horizontal rule */}
          <div style={{ height: '2px', backgroundColor: '#0f3d42', marginTop: '12px', width: '100%' }} />

          {/* Main content: score left, narrative right — vertically centered */}
          <div style={{ display: 'flex', flex: 1, gap: '48px', alignItems: 'center', justifyContent: 'flex-start' }}>
            {/* Score column */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'Instrument Serif', fontSize: '140px', lineHeight: '0.85', fontStyle: 'italic' }}>
                  {score}
                </span>
                <span style={{ fontFamily: 'Instrument Serif', fontSize: '42px', color: '#8a9a9d', marginLeft: '4px', fontStyle: 'italic' }}>
                  /100
                </span>
              </div>
              {/* Rating pill (sienna, neutral for all ratings) */}
              <div style={{
                marginTop: '12px',
                fontFamily: 'JetBrains Mono',
                fontSize: '12px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                padding: '6px 16px',
                borderRadius: '2px',
                backgroundColor: '#e85416',
                color: '#f1ebdc',
                alignSelf: 'flex-start',
              }}>
                {rating}
              </div>
              {/* Score progress bar */}
              <div style={{
                marginTop: '10px',
                width: '200px',
                height: '6px',
                backgroundColor: 'rgba(15, 61, 66, 0.12)',
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

            {/* Narrative column */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '10px' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#8a9a9d' }}>
                What an agent experiences
              </span>
              {heroText && (
                <p style={{ fontFamily: 'Instrument Serif', fontSize: '32px', fontStyle: 'italic', lineHeight: '1.3', margin: '12px 0 0 0', color: '#0f3d42', maxWidth: '580px' }}>
                  {heroText}
                </p>
              )}
            </div>
          </div>

          {/* Bottom section */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: '10px' }}>
            {/* Rule above index */}
            <div style={{ height: '1px', backgroundColor: 'rgba(15, 61, 66, 0.2)', width: '100%' }} />

            {/* Category index row */}
            <div style={{ display: 'flex', gap: '0px', justifyContent: 'space-between' }}>
              {CATEGORIES.map((cat) => (
                <span key={cat} style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', letterSpacing: '0.04em', color: '#5a5548', textTransform: 'uppercase' as const }}>
                  {cat}
                </span>
              ))}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
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
          backgroundColor: '#f1ebdc', color: '#0f3d42',
          fontSize: '24px', fontFamily: 'sans-serif'
        }}>
          AgentisLux scan result card unavailable
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
