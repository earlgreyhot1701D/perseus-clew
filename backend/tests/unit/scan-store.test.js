import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AWS SDK at the scan-store layer
const mockSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockReturnValue({ send: mockSend })
  },
  PutCommand: vi.fn().mockImplementation((params) => ({ input: params })),
  GetCommand: vi.fn().mockImplementation((params) => ({ input: params }))
}));

// Mock logger to capture warn calls
const mockLoggerWarn = vi.fn();
vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn()
  }
}));

const { writeResult, writeCache, readCache, readResult } = await import('../../src/shared/scan-store.js');

describe('scan-store', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockLoggerWarn.mockReset();
  });

  describe('writeResult', () => {
    it('writes a ScanResults row with a 24h TTL', async () => {
      mockSend.mockResolvedValueOnce({});
      const findings = { semantic_html: [{ id: 'SEM-001', text: 'test', count: 1 }] };
      await writeResult('result-123', 'example.com', 62, 'Partially Ready', 'An agent can read...', { semantic_html: { earned: 18, max: 25 } }, findings);

      expect(mockSend).toHaveBeenCalledOnce();
      const putParams = mockSend.mock.calls[0][0].input;
      expect(putParams.TableName).toBe('PerseusClew-ScanResults');
      expect(putParams.Item.resultId).toBe('result-123');
      expect(putParams.Item.domain).toBe('example.com');
      expect(putParams.Item.score).toBe(62);
      expect(putParams.Item.ratingLabel).toBe('Partially Ready');
      expect(putParams.Item.findings).toEqual(findings);

      // TTL should be ~24h from now (86400 seconds)
      const nowEpoch = Math.floor(Date.now() / 1000);
      expect(putParams.Item.ttl).toBeGreaterThan(nowEpoch + 86300);
      expect(putParams.Item.ttl).toBeLessThan(nowEpoch + 86500);
    });

    it('logs a warning and does not throw when DynamoDB write fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Service unavailable'));
      await expect(
        writeResult('result-123', 'example.com', 62, 'Partially Ready', 'text', {}, {})
      ).resolves.toBeUndefined();

      expect(mockLoggerWarn).toHaveBeenCalledOnce();
      expect(mockLoggerWarn.mock.calls[0][0]).toBe('ScanResults write failed');
      expect(mockLoggerWarn.mock.calls[0][1].errorMessage).toBe('Service unavailable');
    });

    it('throws VALIDATION_MISSING_ARGS when resultId is missing', async () => {
      await expect(writeResult(null, 'example.com', 62, 'x', 'x', {}))
        .rejects.toThrow('writeResult requires resultId and domain');
    });

    it('throws VALIDATION_MISSING_ARGS when domain is missing', async () => {
      await expect(writeResult('id', '', 62, 'x', 'x', {}))
        .rejects.toThrow('writeResult requires resultId and domain');
    });
  });

  describe('writeCache', () => {
    it('writes a ScanCache row with a 15m TTL', async () => {
      mockSend.mockResolvedValueOnce({});
      await writeCache('hash-abc', 'example.com', { score: 62 });

      expect(mockSend).toHaveBeenCalledOnce();
      const putParams = mockSend.mock.calls[0][0].input;
      expect(putParams.TableName).toBe('PerseusClew-ScanCache');
      expect(putParams.Item.urlHash).toBe('hash-abc');
      expect(putParams.Item.domain).toBe('example.com');
      expect(putParams.Item.result).toEqual({ score: 62 });

      // TTL should be ~15m from now (900 seconds)
      const nowEpoch = Math.floor(Date.now() / 1000);
      expect(putParams.Item.ttl).toBeGreaterThan(nowEpoch + 800);
      expect(putParams.Item.ttl).toBeLessThan(nowEpoch + 1000);
    });

    it('logs a warning and does not throw when DynamoDB write fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Throughput exceeded'));
      await expect(
        writeCache('hash-abc', 'example.com', {})
      ).resolves.toBeUndefined();

      expect(mockLoggerWarn).toHaveBeenCalledOnce();
      expect(mockLoggerWarn.mock.calls[0][0]).toBe('ScanCache write failed');
    });

    it('throws VALIDATION_MISSING_ARGS when urlHash is missing', async () => {
      await expect(writeCache('', 'example.com', {}))
        .rejects.toThrow('writeCache requires urlHash and domain');
    });
  });

  describe('readCache', () => {
    it('returns the cached item when found', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { urlHash: 'hash-abc', domain: 'example.com', result: { score: 62 }, cachedAt: '2026-06-01T00:00:00Z', ttl: 9999999999 }
      });
      const item = await readCache('hash-abc');
      expect(item.domain).toBe('example.com');
      expect(item.result).toEqual({ score: 62 });
      expect(item.ttl).toBeUndefined(); // TTL stripped
    });

    it('returns null when item is not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });
      const item = await readCache('hash-missing');
      expect(item).toBeNull();
    });

    it('returns null and logs warning on DynamoDB error', async () => {
      mockSend.mockRejectedValueOnce(new Error('Connection refused'));
      const item = await readCache('hash-abc');
      expect(item).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledOnce();
    });

    it('throws VALIDATION_MISSING_ARGS when urlHash is missing', async () => {
      await expect(readCache('')).rejects.toThrow('readCache requires urlHash');
    });
  });

  describe('readResult', () => {
    it('returns the result item when found', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { resultId: 'r-1', domain: 'test.com', score: 72, ttl: 9999999999 }
      });
      const item = await readResult('r-1');
      expect(item.resultId).toBe('r-1');
      expect(item.score).toBe(72);
      expect(item.ttl).toBeUndefined(); // TTL stripped
    });

    it('returns null when item is not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });
      const item = await readResult('r-missing');
      expect(item).toBeNull();
    });

    it('returns null and logs warning on DynamoDB error', async () => {
      mockSend.mockRejectedValueOnce(new Error('Timeout'));
      const item = await readResult('r-1');
      expect(item).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledOnce();
    });

    it('throws VALIDATION_MISSING_ARGS when resultId is missing', async () => {
      await expect(readResult('')).rejects.toThrow('readResult requires resultId');
    });
  });
});
