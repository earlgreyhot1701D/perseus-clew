import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dns.lookup
vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn()
  }
}));

// Mock logger
vi.mock('../../src/shared/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const dns = (await import('node:dns/promises')).default;
const { fetchUrl } = await import('../../src/shared/fetch-url.js');

// Helper to create a mock Response with a readable body
function mockResponse(body, status = 200, headers = {}) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(body);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    }
  });
  return new Response(stream, {
    status,
    headers: { 'content-type': 'text/html', ...headers }
  });
}

function mockRedirect(location, status = 301) {
  return new Response(null, {
    status,
    headers: { location }
  });
}

describe('fetch-url', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Default: dns resolves to a public IP
    dns.lookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('rejects empty input', async () => {
      await expect(fetchUrl('')).rejects.toThrow('A URL is required.');
    });

    it('rejects non-https URLs', async () => {
      await expect(fetchUrl('http://example.com')).rejects.toThrow('URL must start with https://.');
    });

    it('rejects URLs exceeding 2048 characters', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2048);
      await expect(fetchUrl(longUrl)).rejects.toThrow('exceeds 2048 characters');
    });
  });

  describe('SSRF protection - initial URL', () => {
    it('rejects private IP 10.x on initial URL', async () => {
      await expect(fetchUrl('https://10.0.0.1/page'))
        .rejects.toThrow('private or reserved address');
    });

    it('rejects private IP 192.168.x on initial URL', async () => {
      await expect(fetchUrl('https://192.168.1.1/page'))
        .rejects.toThrow('private or reserved address');
    });

    it('rejects metadata IP 169.254.169.254', async () => {
      await expect(fetchUrl('https://169.254.169.254/latest/meta-data/'))
        .rejects.toThrow('private or reserved address');
    });

    it('rejects localhost', async () => {
      await expect(fetchUrl('https://localhost/page'))
        .rejects.toThrow('private or reserved address');
    });

    it('rejects DNS rebinding: public hostname resolving to private IP', async () => {
      dns.lookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
      await expect(fetchUrl('https://evil-rebind.com/page'))
        .rejects.toThrow('private or reserved address');
    });
  });

  describe('SSRF protection - redirect hops', () => {
    it('blocks redirect to a private IP (169.254.x)', async () => {
      dns.lookup
        .mockResolvedValueOnce({ address: '93.184.216.34', family: 4 }) // initial
        .mockResolvedValueOnce({ address: '169.254.169.254', family: 4 }); // redirect target

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(mockRedirect('https://internal.evil.com/secret'))
        .mockResolvedValueOnce(mockResponse('<html></html>'));

      await expect(fetchUrl('https://public-site.com/'))
        .rejects.toThrow('private or reserved address');
    });

    it('blocks redirect to a 10.x IP', async () => {
      dns.lookup
        .mockResolvedValueOnce({ address: '93.184.216.34', family: 4 })
        .mockResolvedValueOnce({ address: '10.0.0.1', family: 4 });

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(mockRedirect('https://redir.example.com/'))
        .mockResolvedValueOnce(mockResponse('<html></html>'));

      await expect(fetchUrl('https://public-site.com/'))
        .rejects.toThrow('private or reserved address');
    });

    it('blocks redirect to non-HTTPS', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'http://example.com/' } }));

      await expect(fetchUrl('https://public-site.com/'))
        .rejects.toThrow('non-HTTPS address');
    });
  });

  describe('redirect limits', () => {
    it('follows up to 3 redirects', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(mockRedirect('https://hop1.com/'))
        .mockResolvedValueOnce(mockRedirect('https://hop2.com/'))
        .mockResolvedValueOnce(mockRedirect('https://hop3.com/'))
        .mockResolvedValueOnce(mockResponse('<html>final</html>'));

      const result = await fetchUrl('https://start.com/');
      expect(result.html).toBe('<html>final</html>');
      expect(result.metadata.redirectChain).toHaveLength(3);
    });

    it('throws FETCH_REDIRECT_LIMIT on 4th redirect', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(mockRedirect('https://hop1.com/'))
        .mockResolvedValueOnce(mockRedirect('https://hop2.com/'))
        .mockResolvedValueOnce(mockRedirect('https://hop3.com/'))
        .mockResolvedValueOnce(mockRedirect('https://hop4.com/'));

      await expect(fetchUrl('https://start.com/'))
        .rejects.toThrow('redirected too many times');
    });
  });

  describe('timeout', () => {
    it('throws FETCH_TIMEOUT when request exceeds 30s', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockImplementationOnce(() => new Promise((_, reject) => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 10);
        }));

      await expect(fetchUrl('https://slow-site.com/'))
        .rejects.toThrow('did not respond within 30 seconds');
    });
  });

  describe('body size limit', () => {
    it('throws FETCH_TOO_LARGE when body exceeds 5MB', async () => {
      const bigChunk = new Uint8Array(6 * 1024 * 1024); // 6MB
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(bigChunk);
          controller.close();
        }
      });
      const bigResponse = new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(bigResponse);

      await expect(fetchUrl('https://big-page.com/'))
        .rejects.toThrow('exceeds 5MB');
    });
  });

  describe('content-type check', () => {
    it('throws FETCH_NOT_HTML for non-HTML content', async () => {
      const pdfResponse = new Response('binary', {
        status: 200,
        headers: { 'content-type': 'application/pdf' }
      });

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(pdfResponse);

      await expect(fetchUrl('https://example.com/file.pdf'))
        .rejects.toThrow('application/pdf, not HTML');
    });
  });

  describe('HTTP errors', () => {
    it('throws FETCH_FORBIDDEN on 403', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(new Response('', { status: 403 }));

      await expect(fetchUrl('https://blocked.com/'))
        .rejects.toThrow('blocking automated requests');
    });

    it('throws FETCH_NOT_FOUND on 404', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots.txt
        .mockResolvedValueOnce(new Response('', { status: 404 }));

      await expect(fetchUrl('https://missing.com/page'))
        .rejects.toThrow('page was not found');
    });

    it('throws FETCH_DNS_FAILURE on DNS error', async () => {
      dns.lookup.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
      await expect(fetchUrl('https://nonexistent-domain.xyz/'))
        .rejects.toThrow('could not be resolved');
    });
  });

  describe('robots.txt', () => {
    it('sets disallowed=true when robots.txt disallows our UA', async () => {
      const robotsBody = 'User-agent: *\nDisallow: /\n';
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response(robotsBody, { status: 200 })) // robots
        .mockResolvedValueOnce(mockResponse('<html>page</html>'));

      const result = await fetchUrl('https://example.com/');
      expect(result.metadata.robotsTxt.disallowed).toBe(true);
      // Fetch still proceeds
      expect(result.html).toBe('<html>page</html>');
    });

    it('sets disallowed=false when robots.txt does not disallow', async () => {
      const robotsBody = 'User-agent: *\nDisallow:\n';
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response(robotsBody, { status: 200 }))
        .mockResolvedValueOnce(mockResponse('<html>page</html>'));

      const result = await fetchUrl('https://example.com/');
      expect(result.metadata.robotsTxt.disallowed).toBe(false);
    });

    it('treats missing robots.txt (404) as allowed', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(mockResponse('<html>page</html>'));

      const result = await fetchUrl('https://example.com/');
      expect(result.metadata.robotsTxt.disallowed).toBe(false);
    });
  });

  describe('output shape', () => {
    it('returns domain-only in finalUrl and redirectChain', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 404 })) // robots
        .mockResolvedValueOnce(mockRedirect('https://www.example.com/final-path?secret=123'))
        .mockResolvedValueOnce(mockResponse('<html></html>'));

      const result = await fetchUrl('https://example.com/start?token=abc');
      expect(result.metadata.finalUrl).toBe('www.example.com');
      expect(result.metadata.redirectChain[0].domain).toBe('example.com');
      // No full URLs leaked
      expect(JSON.stringify(result)).not.toContain('/start?token=abc');
      expect(JSON.stringify(result)).not.toContain('/final-path?secret=123');
    });
  });
});
