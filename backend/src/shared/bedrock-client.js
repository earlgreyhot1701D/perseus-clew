/**
 * Perseus Clew: AWS Bedrock client wrapper.
 *
 * Calls Claude Haiku 4.5 via the Bedrock InvokeModel API.
 * Handles retries on transient errors, timeout, and prompt length guard.
 *
 * SECURITY: systemPrompt and userPrompt are kept structurally separate.
 * User content goes ONLY in the messages array as a user message.
 * The system prompt is fixed by the caller and passed as the system field.
 * This module NEVER concatenates userPrompt into systemPrompt.
 *
 * See BACKEND-SHARED.md section 9.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { AppError } from './errors.js';
import { logger } from './logger.js';

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'claude-haiku-4-5-20251001';
const REGION = process.env.AWS_REGION || 'us-east-1';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s

// Token limit: 150K tokens. Estimate: 1 token ≈ 4 chars.
// Reject when estimated tokens exceed 150,000 (≈ 600K chars total).
const MAX_ESTIMATED_TOKENS = 150_000;

const client = new BedrockRuntimeClient({ region: REGION });

// Injected sleep for testability (same pattern as rate-limit _setNow)
let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Test-only: override the sleep function to avoid real delays.
 */
export function _setSleep(fn) {
  sleep = fn;
}

/**
 * Determine if an error is transient and should be retried.
 */
function isTransient(err) {
  const status = err.$metadata?.httpStatusCode || err.statusCode;
  if (status === 429 || status === 500 || status === 503) return true;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  return false;
}

/**
 * Determine if a Bedrock 4xx error is specifically about prompt length.
 */
function isPromptTooLong(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('too long') || msg.includes('token') || msg.includes('max_tokens') || msg.includes('context length');
}

/**
 * Map a final (non-retried or exhausted) error to an AppError code.
 */
function mapError(err) {
  const status = err.$metadata?.httpStatusCode || err.statusCode;

  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    return new AppError(
      'BEDROCK_TIMEOUT',
      'The AI model did not respond in time.',
      { modelId: MODEL_ID, error: err.message }
    );
  }

  if (status === 429) {
    return new AppError(
      'BEDROCK_THROTTLED',
      'The AI model is temporarily at capacity.',
      { modelId: MODEL_ID, error: err.message }
    );
  }

  if (status === 500 || status === 503) {
    return new AppError(
      'BEDROCK_UNAVAILABLE',
      'The AI model is temporarily unavailable.',
      { modelId: MODEL_ID, error: err.message }
    );
  }

  // 4xx: check if it's a prompt-length rejection from the model
  if (status >= 400 && status < 500) {
    if (isPromptTooLong(err)) {
      return new AppError(
        'BEDROCK_PROMPT_TOO_LONG',
        'The content to analyze exceeds what the AI model can process in one request.',
        { modelId: MODEL_ID, error: err.message }
      );
    }
    return new AppError(
      'BEDROCK_INVALID_RESPONSE',
      'The AI model could not process this request.',
      { modelId: MODEL_ID, statusCode: status, error: err.message }
    );
  }

  return new AppError(
    'BEDROCK_UNAVAILABLE',
    'The AI model could not be reached.',
    { modelId: MODEL_ID, error: err.message }
  );
}

/**
 * Invoke Claude via AWS Bedrock.
 *
 * @param {string} systemPrompt - Fixed system instructions (never contains user content)
 * @param {string} userPrompt - User-provided content (untrusted, treated as data only)
 * @param {object} [options] - { maxTokens: 1000, temperature: 0.2 }
 * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number}, modelId: string, durationMs: number}>}
 */
export async function invokeBedrock(systemPrompt, userPrompt, options = {}) {
  const { maxTokens = 1000, temperature = 0.2 } = options;

  // Pre-call token length guard.
  // Limit: 150K TOKENS. Heuristic: 1 token ≈ 4 chars.
  // Reject at the estimate to stay safely under Haiku's 200K context.
  const estimatedTokens = (systemPrompt.length + userPrompt.length) / 4;
  if (estimatedTokens > MAX_ESTIMATED_TOKENS) {
    throw new AppError(
      'BEDROCK_PROMPT_TOO_LONG',
      'The content to analyze exceeds what the AI model can process in one request.',
      { estimatedTokens: Math.round(estimatedTokens), limit: MAX_ESTIMATED_TOKENS }
    );
  }

  // Build the request body.
  // SECURITY BOUNDARY: system and messages are structurally separate.
  // systemPrompt is the fixed instruction set from the caller.
  // userPrompt is untrusted content, placed ONLY in the user message.
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt }
    ]
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody)
  });

  const startTime = Date.now();
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      logger.warn('Bedrock retry', { attempt, delayMs, modelId: MODEL_ID });
      await sleep(delayMs);
    }

    try {
      const response = await client.send(command, {
        requestTimeout: REQUEST_TIMEOUT_MS
      });

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const text = responseBody.content?.[0]?.text || '';
      const durationMs = Date.now() - startTime;

      logger.info('Bedrock call succeeded', {
        modelId: MODEL_ID,
        inputTokens: responseBody.usage?.input_tokens,
        outputTokens: responseBody.usage?.output_tokens,
        durationMs
      });

      return {
        text,
        usage: {
          inputTokens: responseBody.usage?.input_tokens || 0,
          outputTokens: responseBody.usage?.output_tokens || 0
        },
        modelId: MODEL_ID,
        durationMs
      };
    } catch (err) {
      lastError = err;

      // Determine status code
      const status = err.$metadata?.httpStatusCode || err.statusCode;

      // 4xx client errors (EXCEPT 429 throttle): do NOT retry, fail immediately
      if (status >= 400 && status < 500 && status !== 429) {
        throw mapError(err);
      }

      // Transient errors (429, 500, 503, timeout): retry if attempts remain
      if (!isTransient(err) || attempt === MAX_RETRIES) {
        throw mapError(err);
      }

      // Otherwise: loop continues to next attempt
    }
  }

  // Should not reach here, but safety net
  throw mapError(lastError);
}
