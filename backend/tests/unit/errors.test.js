import { describe, it, expect } from 'vitest';
import { AppError } from '../../src/shared/errors.js';

describe('AppError', () => {
  it('sets code, userMessage, and internalDetail from constructor', () => {
    const err = new AppError('FETCH_TIMEOUT', 'This site did not respond within 30 seconds.', { durationMs: 30000 });
    expect(err.code).toBe('FETCH_TIMEOUT');
    expect(err.userMessage).toBe('This site did not respond within 30 seconds.');
    expect(err.internalDetail).toEqual({ durationMs: 30000 });
  });

  it('derives category from the code prefix before the first underscore', () => {
    expect(new AppError('FETCH_TIMEOUT', 'msg').category).toBe('FETCH');
    expect(new AppError('VALIDATION_INVALID_URL', 'msg').category).toBe('VALIDATION');
    expect(new AppError('RATE_LIMIT_EXCEEDED', 'msg').category).toBe('RATE');
    expect(new AppError('INTERNAL_UNKNOWN', 'msg').category).toBe('INTERNAL');
  });

  it('sets category to the full code when no underscore is present', () => {
    const err = new AppError('UNKNOWN', 'msg');
    expect(err.category).toBe('UNKNOWN');
  });

  it('sets internalDetail to null when not provided', () => {
    const err = new AppError('FETCH_TIMEOUT', 'msg');
    expect(err.internalDetail).toBeNull();
  });

  it('sets timestamp as a valid ISO 8601 string', () => {
    const err = new AppError('FETCH_TIMEOUT', 'msg');
    expect(err.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(err.timestamp).toISOString()).toBe(err.timestamp);
  });

  it('extends Error and has the correct name', () => {
    const err = new AppError('FETCH_TIMEOUT', 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppError');
  });

  it('uses userMessage as the Error message property', () => {
    const err = new AppError('FETCH_TIMEOUT', 'This site did not respond.');
    expect(err.message).toBe('This site did not respond.');
  });

  it('toJSON returns code, category, and message but never internalDetail', () => {
    const err = new AppError('FETCH_TIMEOUT', 'Timed out.', { secret: 'data' });
    const json = err.toJSON();
    expect(json).toEqual({
      code: 'FETCH_TIMEOUT',
      category: 'FETCH',
      message: 'Timed out.'
    });
    expect(json.internalDetail).toBeUndefined();
    expect(json.timestamp).toBeUndefined();
  });
});
