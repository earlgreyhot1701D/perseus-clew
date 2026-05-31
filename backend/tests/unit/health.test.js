import { describe, it, expect } from 'vitest';
import { handler } from '../../src/handlers/health.js';

describe('Perseus Clew health handler', () => {
  it('returns 200 with status ok', async () => {
    const response = await handler();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.1');
    expect(body.name).toBe('Perseus Clew engine');
    expect(body.scanner).toBe('Agentis Lux');
  });

  it('returns JSON content-type header', async () => {
    const response = await handler();
    expect(response.headers['content-type']).toBe('application/json');
  });
});
