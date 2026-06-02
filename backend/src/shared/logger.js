/**
 * Perseus Clew: Structured JSON logger.
 *
 * Writes single-line JSON to stdout. Lambda forwards stdout to CloudWatch.
 * Enforces the privacy deny-list: certain fields are always scrubbed.
 *
 * Deny-list (from BACKEND-SHARED.md section 2):
 * - Fields matching *token*, *password*, *secret*, *auth*, ip, email -> [redacted]
 * - Fields named url, targetUrl, fullUrl -> domain-only extraction
 *
 * No console.* anywhere. All logging goes through this module.
 *
 * See BACKEND-SHARED.md section 2.
 */

const SERVICE_NAME = 'perseus-scan';

// Fields that get their value replaced with [redacted]
const REDACT_PATTERNS = [
  /token/i,
  /password/i,
  /secret/i,
  /auth/i
];
const REDACT_EXACT = ['ip', 'email'];

// Fields that get domain-extracted instead of redacted
const URL_FIELDS = ['url', 'targeturl', 'fullurl'];

/**
 * Extract domain from a URL string. Returns the input unchanged if not a valid URL.
 */
function extractDomain(value) {
  if (typeof value !== 'string') return value;
  try {
    return new URL(value).hostname;
  } catch {
    // Not a URL, return as-is (might already be a domain)
    return value;
  }
}

/**
 * Scrub a context object per the deny-list.
 * Returns a new object with sensitive fields redacted.
 */
function scrub(context) {
  if (!context || typeof context !== 'object') return context;

  const cleaned = {};

  for (const [key, value] of Object.entries(context)) {
    const keyLower = key.toLowerCase();

    // Check URL fields first (domain extraction, not redaction)
    if (URL_FIELDS.includes(keyLower)) {
      cleaned.domain = extractDomain(value);
      continue;
    }

    // Check exact-match redaction fields
    if (REDACT_EXACT.includes(keyLower)) {
      cleaned[key] = '[redacted]';
      continue;
    }

    // Check pattern-match redaction fields
    if (REDACT_PATTERNS.some(pattern => pattern.test(key))) {
      cleaned[key] = '[redacted]';
      continue;
    }

    // Safe field, pass through
    cleaned[key] = value;
  }

  return cleaned;
}

/**
 * Write a structured log entry to stdout.
 */
function emit(level, message, context) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message,
    ...scrub(context)
  };

  process.stdout.write(JSON.stringify(entry) + '\n');
}

/**
 * Whether debug logging is enabled.
 */
function isDebugEnabled() {
  return (process.env.LOG_LEVEL || '').toLowerCase() === 'debug';
}

export const logger = {
  debug(message, context) {
    if (isDebugEnabled()) {
      emit('debug', message, context);
    }
  },

  info(message, context) {
    emit('info', message, context);
  },

  warn(message, context) {
    emit('warn', message, context);
  },

  error(message, context) {
    emit('error', message, context);
  }
};
