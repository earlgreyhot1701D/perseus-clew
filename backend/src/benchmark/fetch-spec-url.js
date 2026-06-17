/**
 * Perseus Clew: Fetch raw spec text from a URL.
 *
 * Thin utility for the benchmark runner. Fetches JSON or YAML spec text
 * from a resolved URL (GitHub raw URLs, openapi.vercel.sh, etc.).
 *
 * Distinct from fetchUrl (validates HTML content-type, follows redirects
 * with SSRF protection) and fetchRepo (navigates GitHub tree API).
 * This fetches arbitrary HTTPS URLs and returns the raw text body.
 *
 * See docs/BENCHMARK-SITES.md (spec location column).
 */

import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

const TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20MB cap (large specs like Stripe ~15MB)
const USER_AGENT = 'Agentis Lux/0.1 (+https://agentislux.io/about-scanner)';

/**
 * Fetch raw spec text from a URL.
 *
 * @param {string} url - HTTPS URL to fetch
 * @returns {Promise<{text: string, contentType: string, sizeBytes: number}>}
 * @throws {AppError} On timeout, non-2xx, DNS failure, or body too large
 */
export async function fetchSpecUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new AppError('VALIDATION_MISSING_ARGS', 'fetchSpecUrl requires a URL string.');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('VALIDATION_INVALID_URL', 'The spec URL is not a valid URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new AppError('VALIDATION_INVALID_URL', 'Only HTTPS URLs are accepted.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, application/x-yaml, text/yaml, text/plain, */*'
      },
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new AppError(
        'FETCH_SPEC_HTTP_ERROR',
        `Spec URL returned status ${response.status}.`,
        { url: parsed.hostname, statusCode: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || '';

    // Read body with size cap
    const chunks = [];
    let totalBytes = 0;
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        throw new AppError(
          'FETCH_SPEC_TOO_LARGE',
          'The spec exceeds the 20MB size limit.',
          { url: parsed.hostname, sizeBytes: totalBytes }
        );
      }
      chunks.push(value);
    }

    const text = new TextDecoder().decode(Buffer.concat(chunks));

    logger.info('Spec URL fetched', {
      domain: parsed.hostname,
      statusCode: response.status,
      contentType,
      sizeBytes: totalBytes
    });

    return { text, contentType, sizeBytes: totalBytes };
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof AppError) throw err;

    if (err.name === 'AbortError') {
      throw new AppError(
        'FETCH_SPEC_TIMEOUT',
        'The spec URL did not respond within 30 seconds.',
        { url: parsed.hostname }
      );
    }

    if (err.cause?.code === 'ENOTFOUND' || err.code === 'ENOTFOUND') {
      throw new AppError(
        'FETCH_SPEC_DNS_FAILURE',
        'The spec URL domain could not be resolved.',
        { url: parsed.hostname }
      );
    }

    throw new AppError(
      'FETCH_SPEC_NETWORK_ERROR',
      'The spec URL could not be reached.',
      { url: parsed.hostname, error: err.message }
    );
  }
}
