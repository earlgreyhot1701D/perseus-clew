/**
 * Perseus Clew: HTML parser.
 *
 * Parses raw HTML into a queryable cheerio tree with extracted metadata.
 * Check modules receive $ and run their own queries.
 *
 * Does NOT execute JavaScript. Does NOT apply CSS.
 * Does NOT pre-extract elements into custom structures.
 *
 * See BACKEND-SHARED.md section 5.
 */

import * as cheerio from 'cheerio';
import { AppError } from './errors.js';

/**
 * Parse an HTML string into a queryable tree with metadata.
 *
 * @param {string} html - Raw HTML string
 * @returns {{ $: cheerio.CheerioAPI, metadata: object }}
 */
export function parseHtml(html) {
  if (!html || typeof html !== 'string') {
    throw new AppError(
      'PARSE_INVALID_HTML',
      'The provided content could not be parsed as HTML.',
      { reason: 'Input is empty or not a string' }
    );
  }

  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content') || null;
  const lang = $('html').attr('lang') || null;

  // Charset: check <meta charset="..."> first, then <meta http-equiv="Content-Type">
  let charset = $('meta[charset]').attr('charset') || null;
  if (!charset) {
    const contentType = $('meta[http-equiv="Content-Type"]').attr('content') || '';
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    if (charsetMatch) {
      charset = charsetMatch[1];
    }
  }

  const hasDoctype = /^<!doctype\s/i.test(html.trimStart());
  const rawLength = html.length;

  return {
    $,
    metadata: {
      title,
      metaDescription,
      lang,
      charset,
      hasDoctype,
      rawLength
    }
  };
}
