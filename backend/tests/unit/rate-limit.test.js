import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

const { checkRateLimit, _setNow, _reset } = await import('../../src/shared/rate-limit.js');
const { logger } = await import('../../src/shared/logger.js');

function makeEvent(ip = '1.2.3.4') {
  return { requestContext: { http: { sourceIp: ip } } };
}

describe('rate-limit', () => {
  let clock;

  beforeEach(() => {
    clock = 1000000;
    _setNow(() => clock);
    _reset();
    process.env.RATE_LIMIT_BYPASS = '';
    logger.warn.mockClear();
  });

  afterEach(() => {
    _setNow(() => Date.now());
  });

  it('returns void when under the per-IP limit', async () => {
    const result = await checkRateLimit(makeEvent());
    expect(result).toBeUndefined();
  });

  it('allows 10 requests from the same IP within 60 seconds', async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('10.0.0.1'));
      clock += 100; // 100ms between requests
    }
    // All 10 passed without throwing
  });

  it('throws RATE_LIMIT_EXCEEDED on the 11th request from same IP', async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('10.0.0.1'));
      clock += 100;
    }

    await expect(checkRateLimit(makeEvent('10.0.0.1')))
      .rejects.toThrow('Too many scans recently.');
  });

  it('thrown error has retryAfterSeconds field (positive, <= 60)', async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('10.0.0.1'));
      clock += 1000; // 1s between
    }

    try {
      await checkRateLimit(makeEvent('10.0.0.1'));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.retryAfterSeconds).toBeGreaterThan(0);
      expect(err.retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    }
  });

  it('user message contains retry seconds but no IP address', async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('192.168.1.55'));
      clock += 100;
    }

    try {
      await checkRateLimit(makeEvent('192.168.1.55'));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.userMessage).toMatch(/Try again in \d+ seconds/);
      expect(err.userMessage).not.toContain('192.168.1.55');
    }
  });

  it('per-IP isolation: one IP hitting limit does not block another', async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('10.0.0.1'));
      clock += 100;
    }

    // IP A is blocked
    await expect(checkRateLimit(makeEvent('10.0.0.1')))
      .rejects.toThrow();

    // IP B is still under limit
    const result = await checkRateLimit(makeEvent('10.0.0.2'));
    expect(result).toBeUndefined();
  });

  it('global limit triggers at 1000 requests regardless of IP distribution', async () => {
    for (let i = 0; i < 1000; i++) {
      await checkRateLimit(makeEvent(`10.0.${Math.floor(i / 256)}.${i % 256}`));
      clock += 1;
    }

    await expect(checkRateLimit(makeEvent('99.99.99.99')))
      .rejects.toThrow('Too many scans recently.');
  });

  it('global limit retryAfterSeconds is derived from global window, not IP window', async () => {
    // Fill global with 1000 requests starting at clock=1000000
    const startTime = clock;
    for (let i = 0; i < 1000; i++) {
      await checkRateLimit(makeEvent(`10.0.${Math.floor(i / 256)}.${i % 256}`));
      clock += 50; // 50ms apart = 50s total
    }

    // Now clock is at startTime + 50000 (50s after first request)
    // The oldest global entry is at startTime, ages out at startTime + 60000
    // So retryAfter should be ~10s (60 - 50 = 10)
    try {
      await checkRateLimit(makeEvent('99.99.99.99'));
      expect.fail('should have thrown');
    } catch (err) {
      // retryAfter should be based on global oldest (~10s), not IP oldest
      expect(err.retryAfterSeconds).toBeGreaterThanOrEqual(10);
      expect(err.retryAfterSeconds).toBeLessThanOrEqual(11);
    }
  });

  it('sliding window resets after 60s: requests age out', async () => {
    // Fill 10 requests
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('10.0.0.1'));
      clock += 100;
    }

    // Blocked at this point
    await expect(checkRateLimit(makeEvent('10.0.0.1')))
      .rejects.toThrow();

    // Advance clock 61 seconds past the first request
    clock = 1000000 + 61000;

    // Should now be under limit (all old entries aged out)
    const result = await checkRateLimit(makeEvent('10.0.0.1'));
    expect(result).toBeUndefined();
  });

  it('rejected request does NOT get recorded (count unchanged after throw)', async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('10.0.0.1'));
      clock += 100;
    }

    // Attempt 11th (rejected)
    try {
      await checkRateLimit(makeEvent('10.0.0.1'));
    } catch {
      // expected
    }

    // Attempt 12th (also rejected, count should still be 10 not 11)
    try {
      await checkRateLimit(makeEvent('10.0.0.1'));
    } catch (err) {
      // If rejected request was recorded, this would be "12 in window"
      // but since it wasn't, count stays at 10 and this still rejects correctly
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    }

    // Advance to just past when the first request ages out
    clock = 1000000 + 60001;

    // Now exactly 9 requests remain in window (first one aged out, 2nd through 10th still there)
    // A new request should succeed (9 < 10)
    const result = await checkRateLimit(makeEvent('10.0.0.1'));
    expect(result).toBeUndefined();
  });

  it('RATE_LIMIT_BYPASS=true disables the check entirely', async () => {
    process.env.RATE_LIMIT_BYPASS = 'true';

    // 100 requests from same IP, all pass
    for (let i = 0; i < 100; i++) {
      const result = await checkRateLimit(makeEvent('10.0.0.1'));
      expect(result).toBeUndefined();
    }
  });

  it('logs a warning via logger when limit is hit', async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(makeEvent('10.0.0.1'));
      clock += 100;
    }

    try {
      await checkRateLimit(makeEvent('10.0.0.1'));
    } catch {
      // expected
    }

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toBe('Per-IP rate limit exceeded');
  });
});
