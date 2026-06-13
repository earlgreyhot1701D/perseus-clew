/**
 * Perseus Clew: Unit tests for Layer 2 Agent Simulation.
 *
 * Tests mock invokeBedrock and assert contract/shape and fail-soft paths,
 * not exact model text (non-deterministic AI layer).
 *
 * Covers: available path (good response -> correct shape + linkage),
 * hallucinated ID rejection, each fail-soft path (-> available:false + WARN),
 * prompt-injection separation, input-size discipline, partial-result acceptance,
 * malformed JSON handling, HTML summarization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSimulation } from '../../src/orchestrator/simulation.js';

// Mock bedrock-client
vi.mock('../../src/shared/bedrock-client.js', () => ({
  invokeBedrock: vi.fn()
}));

// Mock logger
vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}));

import { invokeBedrock } from '../../src/shared/bedrock-client.js';
import { logger } from '../../src/shared/logger.js';

// --- Test fixtures ---

const GOOD_RESPONSE = JSON.stringify({
  tasks: [
    {
      taskId: 'SIM-FE-CTA',
      outcome: 'success',
      narrative: 'The agent located a semantic button labeled "Sign up" as the primary action.',
      linkedFindings: [],
      reasoning: 'Found a button element with clear text.'
    },
    {
      taskId: 'SIM-FE-PURPOSE',
      outcome: 'partial',
      narrative: 'The agent can determine this is a landing page but cannot identify the product.',
      linkedFindings: ['SEM-003'],
      reasoning: 'No main landmark but h1 present.'
    },
    {
      taskId: 'SIM-FE-NAV',
      outcome: 'failure',
      narrative: 'The agent cannot locate navigation structure on this page.',
      linkedFindings: ['SEM-002', 'LNK-001'],
      reasoning: 'No nav element found.'
    }
  ]
});

const SAMPLE_HTML = '<html><head><title>Test</title></head><body><h1>Hello</h1><button>Sign up</button></body></html>';

const SAMPLE_FINDINGS = {
  semantic_html: [
    { id: 'SEM-002', text: 'The page has no nav element.', count: null },
    { id: 'SEM-003', text: 'The page has no main landmark.', count: null }
  ],
  link_navigation: [
    { id: 'LNK-001', text: '3 links have no href attribute.', count: 3 }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runSimulation', () => {
  describe('available path (good response)', () => {
    it('returns available:true with validated tasks when Bedrock succeeds', async () => {
      invokeBedrock.mockResolvedValue({
        text: GOOD_RESPONSE,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 2340,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(true);
      expect(result.source).toBe('ai');
      expect(result.model).toBe('claude-haiku-4-5-20251001');
      expect(result.durationMs).toBe(2340);
      expect(result.tasks).toHaveLength(3);
    });

    it('returns correct task structure with outcome, narrative, linkedFindings, reasoning', async () => {
      invokeBedrock.mockResolvedValue({
        text: GOOD_RESPONSE,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      const ctaTask = result.tasks.find(t => t.taskId === 'SIM-FE-CTA');
      expect(ctaTask.outcome).toBe('success');
      expect(ctaTask.narrative).toBeTruthy();
      expect(ctaTask.linkedFindings).toEqual([]);
      expect(ctaTask.reasoning).toBeTruthy();
    });
  });

  describe('findings linkage: hallucinated ID rejection', () => {
    it('strips finding IDs that do not exist in Layer 1 results', async () => {
      const responseWithFakeIds = JSON.stringify({
        tasks: [{
          taskId: 'SIM-FE-CTA',
          outcome: 'failure',
          narrative: 'Cannot find CTA.',
          linkedFindings: ['SEM-002', 'FAKE-999', 'INVENTED-001'],
          reasoning: 'No button found.'
        }]
      });

      invokeBedrock.mockResolvedValue({
        text: responseWithFakeIds,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 200 }
      });

      const result = await runSimulation(SAMPLE_HTML, 50, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(true);
      const task = result.tasks[0];
      // Only SEM-002 is valid; FAKE-999 and INVENTED-001 are stripped
      expect(task.linkedFindings).toEqual(['SEM-002']);
    });
  });

  describe('fail-soft paths', () => {
    it('timeout -> available:false with reason + WARN', async () => {
      const err = new Error('timed out');
      err.code = 'BEDROCK_TIMEOUT';
      invokeBedrock.mockRejectedValue(err);

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('timeout');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('throttle -> available:false with reason + WARN', async () => {
      const err = new Error('throttled');
      err.code = 'BEDROCK_THROTTLED';
      invokeBedrock.mockRejectedValue(err);

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('throttle');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('bedrock unavailable -> available:false with reason + WARN', async () => {
      const err = new Error('unavailable');
      err.code = 'BEDROCK_UNAVAILABLE';
      invokeBedrock.mockRejectedValue(err);

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('bedrock-unavailable');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('prompt too long -> available:false with reason + WARN', async () => {
      const err = new Error('prompt too long');
      err.code = 'BEDROCK_PROMPT_TOO_LONG';
      invokeBedrock.mockRejectedValue(err);

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('prompt-too-long');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('invalid/empty response -> available:false with reason + WARN', async () => {
      invokeBedrock.mockResolvedValue({
        text: '',
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 500,
        usage: { inputTokens: 5000, outputTokens: 0 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('parse-error');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('malformed JSON -> available:false with reason parse-error + WARN', async () => {
      invokeBedrock.mockResolvedValue({
        text: '{ this is not valid json at all',
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 800,
        usage: { inputTokens: 5000, outputTokens: 100 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('parse-error');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('unexpected error -> available:false with reason simulation-error + WARN', async () => {
      invokeBedrock.mockRejectedValue(new Error('something unexpected'));

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('simulation-error');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('prompt-injection separation', () => {
    it('page content goes in userPrompt argument only, never in systemPrompt', async () => {
      invokeBedrock.mockResolvedValue({
        text: GOOD_RESPONSE,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      await runSimulation('<div>user content here</div>', 72, 'Partially Ready', {}, 'example.com');

      const [systemPrompt, userPrompt] = invokeBedrock.mock.calls[0];
      // System prompt must NOT contain page content
      expect(systemPrompt).not.toContain('user content here');
      // User prompt MUST contain page content
      expect(userPrompt).toContain('user content here');
    });
  });

  describe('input-size discipline', () => {
    it('truncates HTML longer than 40KB cap before sending to model', async () => {
      const hugeHtml = '<div>' + 'x'.repeat(50_000) + '</div>';

      invokeBedrock.mockResolvedValue({
        text: GOOD_RESPONSE,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 10000, outputTokens: 300 }
      });

      await runSimulation(hugeHtml, 72, 'Partially Ready', {}, 'example.com');

      const [, userPrompt] = invokeBedrock.mock.calls[0];
      // The prompt should contain truncated HTML, not the full 50K+ chars
      expect(userPrompt.length).toBeLessThan(50_000);
      expect(userPrompt).toContain('<!-- truncated -->');
    });
  });

  describe('partial-result acceptance', () => {
    it('accepts partial results when some tasks are valid and others malformed', async () => {
      const partialResponse = JSON.stringify({
        tasks: [
          {
            taskId: 'SIM-FE-CTA',
            outcome: 'success',
            narrative: 'Found a button.',
            linkedFindings: [],
            reasoning: 'Clear button element.'
          },
          {
            // Missing taskId - invalid
            outcome: 'failure',
            narrative: 'Something.'
          },
          {
            taskId: 'SIM-FE-NAV',
            outcome: 'invalid-outcome', // Invalid outcome
            narrative: 'Nav found.',
            linkedFindings: [],
            reasoning: 'Nav element present.'
          }
        ]
      });

      invokeBedrock.mockResolvedValue({
        text: partialResponse,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      // Should accept the one valid task, reject the two invalid ones
      expect(result.available).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].taskId).toBe('SIM-FE-CTA');
    });

    it('drops tasks with hallucinated taskIds not in the library', async () => {
      const responseWithFakeTaskId = JSON.stringify({
        tasks: [
          {
            taskId: 'SIM-FE-CTA',
            outcome: 'success',
            narrative: 'Found a button.',
            linkedFindings: [],
            reasoning: 'Clear button element.'
          },
          {
            taskId: 'SIM-FE-INVENTED',
            outcome: 'failure',
            narrative: 'Invented task.',
            linkedFindings: [],
            reasoning: 'This task does not exist in the library.'
          },
          {
            taskId: 'TOTALLY-FAKE-999',
            outcome: 'partial',
            narrative: 'Another fake.',
            linkedFindings: [],
            reasoning: 'Also hallucinated.'
          }
        ]
      });

      invokeBedrock.mockResolvedValue({
        text: responseWithFakeTaskId,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      // Only SIM-FE-CTA is a valid library task; the invented ones are dropped
      expect(result.available).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].taskId).toBe('SIM-FE-CTA');
    });
  });

  describe('HTML summarization', () => {
    it('strips script tags from HTML', async () => {
      const htmlWithScript = '<html><body><script>alert("xss")</script><h1>Hello</h1></body></html>';

      invokeBedrock.mockResolvedValue({
        text: GOOD_RESPONSE,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      await runSimulation(htmlWithScript, 72, 'Partially Ready', {}, 'example.com');

      const [, userPrompt] = invokeBedrock.mock.calls[0];
      expect(userPrompt).not.toContain('alert("xss")');
      expect(userPrompt).toContain('<h1>Hello</h1>');
    });

    it('strips style tags from HTML', async () => {
      const htmlWithStyle = '<html><body><style>body{color:red}</style><p>Content</p></body></html>';

      invokeBedrock.mockResolvedValue({
        text: GOOD_RESPONSE,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      await runSimulation(htmlWithStyle, 72, 'Partially Ready', {}, 'example.com');

      const [, userPrompt] = invokeBedrock.mock.calls[0];
      expect(userPrompt).not.toContain('body{color:red}');
      expect(userPrompt).toContain('<p>Content</p>');
    });
  });

  describe('handles markdown-wrapped JSON response', () => {
    it('strips ```json fences before parsing', async () => {
      const wrappedResponse = '```json\n' + GOOD_RESPONSE + '\n```';

      invokeBedrock.mockResolvedValue({
        text: wrappedResponse,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 1000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result.available).toBe(true);
      expect(result.tasks).toHaveLength(3);
    });
  });

  describe('output contract shape', () => {
    it('available:true shape has tasks, source, model, durationMs', async () => {
      invokeBedrock.mockResolvedValue({
        text: GOOD_RESPONSE,
        modelId: 'claude-haiku-4-5-20251001',
        durationMs: 2000,
        usage: { inputTokens: 5000, outputTokens: 300 }
      });

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result).toHaveProperty('available', true);
      expect(result).toHaveProperty('tasks');
      expect(result).toHaveProperty('source', 'ai');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('durationMs');
      expect(Array.isArray(result.tasks)).toBe(true);
    });

    it('available:false shape has reason', async () => {
      invokeBedrock.mockRejectedValue(new Error('fail'));

      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');

      expect(result).toHaveProperty('available', false);
      expect(result).toHaveProperty('reason');
      expect(typeof result.reason).toBe('string');
    });
  });

  describe('simulation failure does not throw (never crashes the scan)', () => {
    it('always resolves, never rejects', async () => {
      invokeBedrock.mockRejectedValue(new Error('catastrophic failure'));

      // Must not throw
      const result = await runSimulation(SAMPLE_HTML, 72, 'Partially Ready', SAMPLE_FINDINGS, 'example.com');
      expect(result.available).toBe(false);
    });
  });
});
