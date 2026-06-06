import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../src/shared/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const { fetchRepo } = await import('../../src/shared/fetch-repo.js');

// Helper: mock tree response
function makeTree(paths) {
  return paths.map(p => ({
    path: p,
    type: 'blob',
    size: typeof p === 'object' ? p.size : 1000
  }));
}

// Helper: mock file content response (base64)
function makeFileResponse(content, size) {
  return {
    ok: true,
    json: async () => ({
      encoding: 'base64',
      content: Buffer.from(content).toString('base64'),
      size: size || Buffer.byteLength(content)
    })
  };
}

describe('fetch-repo', () => {
  let originalFetch;
  let originalEnv;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = { ...process.env };
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  describe('input validation', () => {
    it('rejects empty owner', async () => {
      await expect(fetchRepo('', 'repo')).rejects.toThrow('owner is required');
    });

    it('rejects empty repo', async () => {
      await expect(fetchRepo('owner', '')).rejects.toThrow('name is required');
    });

    it('rejects owner exceeding 100 chars', async () => {
      await expect(fetchRepo('a'.repeat(101), 'repo')).rejects.toThrow('exceeds 100 characters');
    });

    it('rejects owner with invalid characters', async () => {
      await expect(fetchRepo('bad owner!', 'repo')).rejects.toThrow('characters that are not valid');
    });
  });

  describe('file filtering', () => {
    it('includes only .html, .jsx, .tsx files', async () => {
      const tree = makeTree(['index.html', 'app.jsx', 'page.tsx', 'style.css', 'main.js']);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<html></html>'));

      const result = await fetchRepo('owner', 'repo');
      expect(result.files.every(f =>
        f.path.endsWith('.html') || f.path.endsWith('.jsx') || f.path.endsWith('.tsx')
      )).toBe(true);
      expect(result.metadata.totalFilesConsidered).toBe(3);
    });

    it('excludes node_modules, dist, build, .next, coverage, .git', async () => {
      const tree = makeTree([
        'src/App.jsx',
        'node_modules/react/index.jsx',
        'dist/bundle.html',
        'build/output.html',
        '.next/static/page.tsx',
        'coverage/report.html',
        '.git/hooks/pre-commit.html'
      ]);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<div>test</div>'));

      const result = await fetchRepo('owner', 'repo');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/App.jsx');
    });
  });

  describe('file cap and prioritization', () => {
    it('caps at 20 files', async () => {
      const paths = Array.from({ length: 30 }, (_, i) => `file${i}.html`);
      const tree = makeTree(paths);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<html></html>'));

      const result = await fetchRepo('owner', 'repo');
      expect(result.files.length).toBeLessThanOrEqual(20);
      expect(result.metadata.totalFilesConsidered).toBe(30);
    });

    it('prioritizes src/ app/ pages/ components/ files', async () => {
      const tree = makeTree([
        'root.html',
        'other/page.html',
        'src/App.jsx',
        'app/page.tsx',
        'components/Button.tsx'
      ]);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<div>content</div>'));

      const result = await fetchRepo('owner', 'repo');
      // Priority files come first
      expect(result.files[0].path).toBe('app/page.tsx');
      expect(result.files[1].path).toBe('components/Button.tsx');
      expect(result.files[2].path).toBe('src/App.jsx');
    });
  });

  describe('size limit', () => {
    it('skips files exceeding 500KB and notes in skippedReasons', async () => {
      const tree = [
        { path: 'small.html', type: 'blob', size: 1000 },
        { path: 'huge.html', type: 'blob', size: 600000 }
      ];

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<html>small</html>', 1000));

      const result = await fetchRepo('owner', 'repo');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('small.html');
      expect(result.metadata.skippedReasons).toEqual([
        { path: 'huge.html', reason: 'exceeds_size_limit' }
      ]);
    });
  });

  describe('API spec detection', () => {
    it('finds openapi.json in root', async () => {
      const tree = makeTree(['index.html', 'openapi.json']);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValueOnce(makeFileResponse('<html></html>', 100))
        .mockResolvedValueOnce(makeFileResponse('{"openapi":"3.0.0"}', 50));

      const result = await fetchRepo('owner', 'repo');
      expect(result.apiSpec).not.toBeNull();
      expect(result.apiSpec.path).toBe('openapi.json');
      expect(result.apiSpec.content).toContain('openapi');
    });

    it('returns null apiSpec when no spec file exists', async () => {
      const tree = makeTree(['index.html']);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<html></html>'));

      const result = await fetchRepo('owner', 'repo');
      expect(result.apiSpec).toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws FETCH_NOT_FOUND for private or missing repo', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() });

      await expect(fetchRepo('owner', 'private-repo'))
        .rejects.toThrow('private or does not exist');
    });

    it('throws FETCH_FORBIDDEN with retry info on rate limit', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          headers: new Headers({ 'x-ratelimit-reset': String(resetTime) })
        });

      await expect(fetchRepo('owner', 'repo'))
        .rejects.toThrow('rate limit reached');
    });

    it('throws VALIDATION_EMPTY_REPO when no scannable files found', async () => {
      const tree = makeTree(['readme.md', 'package.json']);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) });

      await expect(fetchRepo('owner', 'repo'))
        .rejects.toThrow('No HTML, JSX, or TSX files found');
    });
  });

  describe('auth token', () => {
    it('uses GITHUB_TOKEN when set', async () => {
      process.env.GITHUB_TOKEN = 'test-gh-token';
      const tree = makeTree(['index.html']);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<html></html>'));

      await fetchRepo('owner', 'repo');

      const treeCall = globalThis.fetch.mock.calls[0];
      expect(treeCall[1].headers['Authorization']).toBe('Bearer test-gh-token');
    });

    it('does not include Authorization header when token is not set', async () => {
      const tree = makeTree(['index.html']);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
        .mockResolvedValue(makeFileResponse('<html></html>'));

      await fetchRepo('owner', 'repo');

      const treeCall = globalThis.fetch.mock.calls[0];
      expect(treeCall[1].headers['Authorization']).toBeUndefined();
    });
  });
});
