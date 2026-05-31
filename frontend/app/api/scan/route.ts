import { NextRequest, NextResponse } from 'next/server';

/**
 * Scan initiation API route.
 * Validates input server-side, then forwards to the AWS scan Lambda via API Gateway.
 * This route is load-bearing: it keeps the AWS endpoint from being called directly by the browser.
 */

const URL_REGEX = /^https:\/\/.+/;
const MAX_URL_LENGTH = 2048;

// Private/local IP patterns to reject
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/0\./,
  /^https?:\/\/\[::1\]/
];

function validateUrl(target: string): string | null {
  if (!target || typeof target !== 'string') {
    return 'A URL is required';
  }
  if (target.length > MAX_URL_LENGTH) {
    return `URL exceeds ${MAX_URL_LENGTH} characters`;
  }
  if (!URL_REGEX.test(target)) {
    return 'URL must start with https://';
  }
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(target)) {
      return 'Private or local URLs cannot be scanned';
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: { type?: string; target?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const { type, target } = body;

  // Validate scan type
  if (!type || !['url', 'repo', 'spec'].includes(type)) {
    return NextResponse.json(
      { error: 'INVALID_TYPE', message: 'Scan type must be one of: url, repo, spec' },
      { status: 400 }
    );
  }

  // Validate target based on type
  if (type === 'url') {
    const urlError = validateUrl(target || '');
    if (urlError) {
      return NextResponse.json(
        { error: 'INVALID_URL', message: urlError },
        { status: 400 }
      );
    }
  }

  // Forward to AWS scan endpoint
  const scanEndpoint = process.env.AWS_SCAN_ENDPOINT || 'http://localhost:3001/scan';

  try {
    const res = await fetch(scanEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target }),
      signal: AbortSignal.timeout(45000) // 45s timeout (scan Lambda has 60s)
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'SCAN_FAILED', message: errorData.message || `Scan engine returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'SCAN_TIMEOUT', message: 'The scan took too long to complete. Try again.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'SCAN_UNREACHABLE', message: 'Could not connect to the scan engine' },
      { status: 502 }
    );
  }
}
