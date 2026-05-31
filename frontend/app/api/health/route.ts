import { NextResponse } from 'next/server';

/**
 * Health check API route.
 * Proxies to the AWS scan engine health endpoint.
 * In local dev, points at the Docker backend on port 3001.
 */
export async function GET() {
  const awsHealthUrl = process.env.AWS_HEALTH_URL || 'http://localhost:3001/health';

  try {
    const res = await fetch(awsHealthUrl, { cache: 'no-store' });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'BACKEND_UNAVAILABLE', message: `Backend returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'BACKEND_UNREACHABLE', message: 'Could not connect to the scan engine' },
      { status: 502 }
    );
  }
}
