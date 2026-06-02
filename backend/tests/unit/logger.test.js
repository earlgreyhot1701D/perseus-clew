import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  let stdoutWrite;
  let originalEnv;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    process.env = originalEnv;
    vi.resetModules();
  });

  async function getLogger(logLevel) {
    process.env.LOG_LEVEL = logLevel || '';
    const mod = await import('../../src/shared/logger.js');
    return mod.logger;
  }

  function getLastLog() {
    const lastCall = stdoutWrite.mock.calls[stdoutWrite.mock.calls.length - 1];
    return JSON.parse(lastCall[0].trim());
  }

  it('emits JSON to stdout with timestamp, level, service, and message', async () => {
    const logger = await getLogger();
    logger.info('Scan started');
    const entry = getLastLog();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.level).toBe('info');
    expect(entry.service).toBe('perseus-scan');
    expect(entry.message).toBe('Scan started');
  });

  it('includes context fields in the log entry', async () => {
    const logger = await getLogger();
    logger.info('Scan started', { scanType: 'url', requestId: 'abc-123' });
    const entry = getLastLog();
    expect(entry.scanType).toBe('url');
    expect(entry.requestId).toBe('abc-123');
  });

  it('replaces url field with domain-only extraction', async () => {
    const logger = await getLogger();
    logger.info('Fetching', { url: 'https://example.com/secret-path?token=abc' });
    const entry = getLastLog();
    expect(entry.domain).toBe('example.com');
    expect(entry.url).toBeUndefined();
  });

  it('replaces targetUrl field with domain-only extraction', async () => {
    const logger = await getLogger();
    logger.info('Fetching', { targetUrl: 'https://shop.example.org/checkout?session=xyz' });
    const entry = getLastLog();
    expect(entry.domain).toBe('shop.example.org');
    expect(entry.targetUrl).toBeUndefined();
  });

  it('replaces fullUrl field with domain-only extraction', async () => {
    const logger = await getLogger();
    logger.info('Redirect', { fullUrl: 'https://www.test.com/path' });
    const entry = getLastLog();
    expect(entry.domain).toBe('www.test.com');
    expect(entry.fullUrl).toBeUndefined();
  });

  it('redacts fields matching *token* pattern', async () => {
    const logger = await getLogger();
    logger.info('Auth check', { accessToken: 'eyJhbGciOi...' });
    const entry = getLastLog();
    expect(entry.accessToken).toBe('[redacted]');
  });

  it('redacts fields matching *password* pattern', async () => {
    const logger = await getLogger();
    logger.info('Login', { userPassword: 'hunter2' });
    const entry = getLastLog();
    expect(entry.userPassword).toBe('[redacted]');
  });

  it('redacts fields matching *secret* pattern', async () => {
    const logger = await getLogger();
    logger.info('Config', { clientSecret: 'sk_live_abc123' });
    const entry = getLastLog();
    expect(entry.clientSecret).toBe('[redacted]');
  });

  it('redacts fields matching *auth* pattern', async () => {
    const logger = await getLogger();
    logger.info('Request', { authHeader: 'Bearer xyz' });
    const entry = getLastLog();
    expect(entry.authHeader).toBe('[redacted]');
  });

  it('redacts ip field exactly', async () => {
    const logger = await getLogger();
    logger.info('Request', { ip: '192.168.1.1' });
    const entry = getLastLog();
    expect(entry.ip).toBe('[redacted]');
  });

  it('redacts email field exactly', async () => {
    const logger = await getLogger();
    logger.info('User', { email: 'user@example.com' });
    const entry = getLastLog();
    expect(entry.email).toBe('[redacted]');
  });

  it('passes through safe fields unchanged', async () => {
    const logger = await getLogger();
    logger.info('Scan', { scanType: 'url', score: 62, domain: 'example.com' });
    const entry = getLastLog();
    expect(entry.scanType).toBe('url');
    expect(entry.score).toBe(62);
    expect(entry.domain).toBe('example.com');
  });

  it('suppresses debug logs when LOG_LEVEL is not debug', async () => {
    const logger = await getLogger('info');
    logger.debug('Verbose detail');
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it('emits debug logs when LOG_LEVEL is debug', async () => {
    const logger = await getLogger('debug');
    logger.debug('Verbose detail');
    const entry = getLastLog();
    expect(entry.level).toBe('debug');
    expect(entry.message).toBe('Verbose detail');
  });

  it('handles null or undefined context gracefully', async () => {
    const logger = await getLogger();
    logger.info('No context', null);
    const entry = getLastLog();
    expect(entry.message).toBe('No context');
  });

  it('emits warn and error levels correctly', async () => {
    const logger = await getLogger();
    logger.warn('Rate limit approaching');
    expect(getLastLog().level).toBe('warn');
    logger.error('Scan failed');
    expect(getLastLog().level).toBe('error');
  });
});
