/**
 * Perseus Clew: Local development HTTP server.
 *
 * Wraps the Lambda handler in a minimal HTTP server for docker compose.
 * Production uses the Lambda runtime; this is local dev only.
 */

import http from 'node:http';
import { handler } from '../src/handlers/index.js';

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  let body = '';

  req.on('data', (chunk) => { body += chunk; });

  req.on('end', async () => {
    const event = {
      rawPath: req.url,
      path: req.url,
      httpMethod: req.method,
      requestContext: { http: { method: req.method } },
      body: body || null
    };

    try {
      const result = await handler(event);
      res.writeHead(result.statusCode, result.headers || {});
      res.end(result.body || '');
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'INTERNAL', message: 'Unexpected error' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Perseus Clew local server running on port ${PORT}`);
});
