/**
 * Perseus Clew: Output sanitizer.
 *
 * Strips unsafe patterns from user-facing strings before they appear
 * in findings, error messages, or reports. Prevents XSS, leaked secrets,
 * and leaked PII from reaching users.
 *
 * Rule: never silently strip. Always replace with a visible placeholder
 * so the reader knows something was there.
 *
 * See BACKEND-SHARED.md section 7.
 */

// --- Patterns ---

// Script and style tags: remove tag AND contents as one unit
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

// All other HTML tags: remove the tag markup only, leave inner text
const HTML_TAG_RE = /<[^>]+>/g;

// Control characters except newline, carriage return, tab
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Email addresses
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// IPv4 addresses
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// Phone numbers (7-12 digits with separators; longer pure-digit sequences are cards)
const PHONE_RE = /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]\d{3,4}\b/g;

// High-entropy tokens: 20+ alphanumeric chars containing both letters and digits
const TOKEN_RE = /[A-Za-z0-9]{20,}/g;

/**
 * Luhn algorithm: validates a digit string as a potential credit card number.
 * Returns true if the sequence passes the Luhn check.
 */
function isLuhnValid(digits) {
  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/**
 * Check if a token string has mixed content (at least one letter AND one digit).
 * Pure-alpha strings like long English words pass through.
 */
function isMixedAlphanumeric(str) {
  return /[a-zA-Z]/.test(str) && /\d/.test(str);
}

/**
 * Sanitize a string for safe inclusion in user-facing output.
 *
 * @param {string} text - The string to sanitize
 * @param {object} [options] - Reserved for future use
 * @returns {string} Sanitized string with visible placeholders
 */
export function sanitize(text, options) {
  // Intentional: null/undefined returns empty string.
  // sanitize is a safety net, not a validator. It should never throw.
  if (text == null || typeof text !== 'string') {
    return '';
  }

  let result = text;

  // 1. Strip script/style tags AND their contents (single placeholder per block)
  result = result.replace(SCRIPT_STYLE_RE, '[removed-html]');

  // 2. Strip remaining HTML tags (tag markup only, inner text preserved)
  result = result.replace(HTML_TAG_RE, '[removed-html]');

  // 3. Remove control characters (except \n, \r, \t)
  result = result.replace(CONTROL_CHARS_RE, '');

  // 4. Redact email addresses
  result = result.replace(EMAIL_RE, '[redacted-email]');

  // 5. Redact IP addresses
  result = result.replace(IP_RE, '[redacted-ip]');

  // 6. Redact credit card numbers (Luhn-valid 13-19 digit sequences)
  // Must run BEFORE phone detection to prevent phone regex matching card digits
  result = result.replace(/\b\d{13,19}\b/g, (match) => {
    return isLuhnValid(match) ? '[redacted-card]' : match;
  });

  // 7. Redact phone numbers
  result = result.replace(PHONE_RE, '[redacted-phone]');

  // 8. Redact high-entropy tokens (20+ chars, mixed alpha+digit)
  result = result.replace(TOKEN_RE, (match) => {
    return isMixedAlphanumeric(match) ? '[redacted-token]' : match;
  });

  return result;
}

/**
 * HTML-escape a string for safe display as literal code.
 *
 * Unlike sanitize() which strips tags, this preserves the markup as
 * visible inert text by converting special characters to HTML entities.
 * Use for code snippets (finding examples) that should be displayed
 * as-is in the UI without being interpreted as HTML.
 *
 * Order: & first (prevents double-encoding the entities that follow).
 *
 * @param {string} str - The string to escape
 * @returns {string} Entity-encoded string (no raw < > & " ' remain)
 */
export function escapeHtml(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '\x26amp;')
    .replace(/</g, '\x26lt;')
    .replace(/>/g, '\x26gt;')
    .replace(/"/g, '\x26quot;')
    .replace(/'/g, '\x26#x27;');
}
