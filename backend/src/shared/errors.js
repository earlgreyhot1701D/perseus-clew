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
    this.category = code.includes('_') ? code.split('_')[0] : code;
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
