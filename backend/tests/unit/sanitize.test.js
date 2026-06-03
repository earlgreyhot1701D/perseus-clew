import { describe, it, expect } from 'vitest';
import { sanitize } from '../../src/shared/sanitize.js';

describe('sanitize', () => {
  describe('HTML stripping', () => {
    it('removes script tags AND their contents as a single placeholder', () => {
      expect(sanitize('<script>alert(1)</script>')).toBe('[removed-html]');
    });

    it('removes style tags AND their contents as a single placeholder', () => {
      expect(sanitize('<style>body{color:red}</style>')).toBe('[removed-html]');
    });

    it('removes script with attributes as a single placeholder', () => {
      expect(sanitize('<script type="text/javascript">var x=1;</script>')).toBe('[removed-html]');
    });

    it('strips other HTML tags but preserves inner text', () => {
      expect(sanitize('<div>hello</div>')).toBe('[removed-html]hello[removed-html]');
    });

    it('strips nested tags', () => {
      expect(sanitize('<b><i>text</i></b>')).toBe('[removed-html][removed-html]text[removed-html][removed-html]');
    });
  });

  describe('control characters', () => {
    it('removes null bytes', () => {
      expect(sanitize('hello\x00world')).toBe('helloworld');
    });

    it('preserves newlines and tabs', () => {
      expect(sanitize('line1\nline2\ttab')).toBe('line1\nline2\ttab');
    });
  });

  describe('email redaction', () => {
    it('redacts email addresses', () => {
      expect(sanitize('contact user@example.com for info')).toBe('contact [redacted-email] for info');
    });

    it('redacts emails with subdomains', () => {
      expect(sanitize('send to admin@mail.corp.co')).toBe('send to [redacted-email]');
    });
  });

  describe('IP redaction', () => {
    it('redacts IPv4 addresses', () => {
      expect(sanitize('from 192.168.1.100 request')).toBe('from [redacted-ip] request');
    });

    it('does not flag partial octets that are not IPs', () => {
      expect(sanitize('version 3.14 is out')).toBe('version 3.14 is out');
    });
  });

  describe('phone redaction', () => {
    it('redacts phone numbers with country code', () => {
      expect(sanitize('call +1-555-123-4567')).toBe('call [redacted-phone]');
    });

    it('redacts phone numbers with parentheses', () => {
      expect(sanitize('call (555) 123-4567')).toBe('call [redacted-phone]');
    });
  });

  describe('credit card redaction (Luhn)', () => {
    it('redacts a Luhn-valid 16-digit card number', () => {
      // 4532015112830366 is a valid test Visa number (passes Luhn)
      expect(sanitize('card: 4532015112830366')).toBe('card: [redacted-card]');
    });

    it('does NOT flag a non-Luhn 16-digit number', () => {
      // 1234567890123456 does not pass Luhn
      expect(sanitize('ref: 1234567890123456')).toBe('ref: 1234567890123456');
    });

    it('redacts a Luhn-valid 13-digit number', () => {
      // 4222222222222 passes Luhn (standard Visa test number)
      expect(sanitize('num 4222222222222 here')).toBe('num [redacted-card] here');
    });
  });

  describe('token redaction', () => {
    it('redacts 20+ char mixed alphanumeric tokens', () => {
      expect(sanitize('key: abc123def456ghi789jkl0')).toBe('key: [redacted-token]');
    });

    it('does NOT flag pure-alpha long words', () => {
      expect(sanitize('the word internationalization is long')).toBe('the word internationalization is long');
    });

    it('does NOT flag pure-digit long sequences (those go through card check)', () => {
      // 20-digit pure number, non-Luhn, passes through token check because no letters
      expect(sanitize('id: 12345678901234567890')).not.toContain('[redacted-token]');
    });
  });

  describe('passthrough', () => {
    it('passes normal prose through unchanged', () => {
      const text = 'An agent visiting this page can read the navigation links.';
      expect(sanitize(text)).toBe(text);
    });

    it('passes bare domains through unchanged', () => {
      expect(sanitize('visit example.com for details')).toBe('visit example.com for details');
    });
  });

  describe('spec worked example', () => {
    it('produces the expected placeholders from the spec example', () => {
      const input = "The placeholder text says 'email us at hello@example.com or call 555-1234'";
      const result = sanitize(input);
      expect(result).toContain('[redacted-email]');
      expect(result).not.toContain('hello@example.com');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null input', () => {
      expect(sanitize(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(sanitize(undefined)).toBe('');
    });

    it('returns empty string for non-string input', () => {
      expect(sanitize(42)).toBe('');
    });

    it('handles empty string input', () => {
      expect(sanitize('')).toBe('');
    });
  });
});
