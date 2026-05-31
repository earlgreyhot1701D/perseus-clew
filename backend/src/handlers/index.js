/**
 * Perseus Clew Lambda entry point.
 * Routes requests to the appropriate handler based on the event path.
 */
import { handler as healthHandler } from './health.js';
import { handler as scanHandler } from './scan.js';

export const handler = async (event) => {
  const path = event.rawPath || event.path || '';
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';

  if (path === '/health' || path === '/') {
    return healthHandler(event);
  }

  if (path === '/scan' && method === 'POST') {
    return scanHandler(event);
  }

  return {
    statusCode: 404,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'NOT_FOUND', message: 'Route not found' })
  };
};
