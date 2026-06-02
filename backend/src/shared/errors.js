/**
 * Perseus Clew: Structured error class.
 *
 * Every module signals failure by throwing an AppError.
 * Callers catch and serialize. The user sees userMessage only.
 * internalDetail goes to logs, never to responses.
 *
 * See BACKEND-SHARED.md section 1.
 */

export class AppError extends Error {
  /**
   * @param {string} code - Hierarchical error code (e.g. FETCH_TIMEOUT)
   * @param {string} userMessage - Plain-language message shown in the UI
   * @param {string|object} [internalDetail] - Logged only, never returned
   */
  constructor(code, userMessage, internalDetail) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;

    // Derive category from code prefix. Most codes use single-token prefix
    // (FETCH_TIMEOUT -> FETCH). RATE_LIMIT is a two-token category.
    const MULTI_TOKEN_CATEGORIES = ['RATE_LIMIT'];
    const parts = code.split('_');
    if (parts.length >= 3 && MULTI_TOKEN_CATEGORIES.includes(`${parts[0]}_${parts[1]}`)) {
      this.category = `${parts[0]}_${parts[1]}`;
    } else {
      this.category = parts[0];
    }

    this.userMessage = userMessage;
    this.internalDetail = internalDetail || null;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Safe serialization for API responses.
   * Never includes internalDetail.
   */
  toJSON() {
    return {
      code: this.code,
      category: this.category,
      message: this.userMessage
    };
  }
}
