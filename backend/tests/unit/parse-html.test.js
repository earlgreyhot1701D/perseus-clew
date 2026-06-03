import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/shared/parse-html.js';

describe('parseHtml', () => {
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="description" content="A test page">
  <title>Test Page</title>
</head>
<body><h1>Hello</h1><button>Click</button></body>
</html>`;

  it('returns a queryable cheerio instance', () => {
    const { $ } = parseHtml(fullHtml);
    expect($('button').length).toBe(1);
    expect($('h1').text()).toBe('Hello');
  });

  it('extracts title when present', () => {
    const { metadata } = parseHtml(fullHtml);
    expect(metadata.title).toBe('Test Page');
  });

  it('returns null for title when absent', () => {
    const { metadata } = parseHtml('<html><head></head><body></body></html>');
    expect(metadata.title).toBeNull();
  });

  it('extracts metaDescription when present', () => {
    const { metadata } = parseHtml(fullHtml);
    expect(metadata.metaDescription).toBe('A test page');
  });

  it('returns null for metaDescription when absent', () => {
    const { metadata } = parseHtml('<html><head><title>X</title></head><body></body></html>');
    expect(metadata.metaDescription).toBeNull();
  });

  it('extracts lang when present', () => {
    const { metadata } = parseHtml(fullHtml);
    expect(metadata.lang).toBe('en');
  });

  it('returns null for lang when absent', () => {
    const { metadata } = parseHtml('<html><head></head><body></body></html>');
    expect(metadata.lang).toBeNull();
  });

  it('extracts charset from meta charset attribute', () => {
    const { metadata } = parseHtml(fullHtml);
    expect(metadata.charset).toBe('utf-8');
  });

  it('extracts charset from http-equiv Content-Type', () => {
    const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body></body></html>';
    const { metadata } = parseHtml(html);
    expect(metadata.charset).toBe('iso-8859-1');
  });

  it('returns null for charset when absent', () => {
    const { metadata } = parseHtml('<html><head></head><body></body></html>');
    expect(metadata.charset).toBeNull();
  });

  it('detects hasDoctype as true when DOCTYPE is present', () => {
    const { metadata } = parseHtml(fullHtml);
    expect(metadata.hasDoctype).toBe(true);
  });

  it('detects hasDoctype as false when DOCTYPE is absent', () => {
    const { metadata } = parseHtml('<html><body></body></html>');
    expect(metadata.hasDoctype).toBe(false);
  });

  it('sets rawLength to the input string length', () => {
    const input = '<html><body>test</body></html>';
    const { metadata } = parseHtml(input);
    expect(metadata.rawLength).toBe(input.length);
  });

  it('throws PARSE_INVALID_HTML for empty string', () => {
    expect(() => parseHtml('')).toThrow('The provided content could not be parsed as HTML.');
  });

  it('throws PARSE_INVALID_HTML for non-string input', () => {
    expect(() => parseHtml(null)).toThrow();
    expect(() => parseHtml(undefined)).toThrow();
    expect(() => parseHtml(123)).toThrow();
  });

  it('handles whitespace-only HTML without crashing', () => {
    const { metadata } = parseHtml('   \n\t  ');
    expect(metadata.title).toBeNull();
    expect(metadata.rawLength).toBe(7);
  });
});
