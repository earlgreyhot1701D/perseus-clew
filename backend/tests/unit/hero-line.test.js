import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateHeroLine } from '../../src/orchestrator/hero-line.js';
import { AppError } from '../../src/shared/errors.js';

// Mock bedrock-client and logger
vi.mock('../../src/shared/bedrock-client.js', () => ({
  invokeBedrock: vi.fn()
}));

vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { invokeBedrock } from '../../src/shared/bedrock-client.js';
import { logger } from '../../src/shared/logger.js';

// --- Test data ---

const sampleFindings = {
  semantic_html: [
    { id: 'SEM-001', text: '3 elements with click handlers use styled div or span tags instead of the button tag. Agents identifying buttons by tag name cannot find these.', count: 3 }
  ],
  form_accessibility: [],
  aria: [
    { id: 'ARIA-004', text: '2 buttons have no accessible name. Agents selecting controls by label cannot identify what these buttons do.', count: 2 }
  ],
  structured_data: [],
  content_in_html: [],
  link_navigation: [
    { id: 'LINK-003', text: '3 links use generic text as their entire accessible name with no additional context. Agents parsing link intent from text alone cannot determine where these links lead.', count: 3 }
  ]
};

const emptyFindings = {
  semantic_html: [],
  form_accessibility: [],
  aria: [],
  structured_data: [],
  content_in_html: [],
  link_navigation: []
};

// --- Banned-word regex (same set as the module, for template voice testing) ---
const BANNED_REGEX = /\b(bad|poor|weak|failing|broken|wrong|incorrect|should|need\s+to|fix|must|recommend|critical|serious|minor|you\s+forgot|you\s+missed|delve|landscape|straightforward|genuinely|honestly)\b/i;
const EM_DASH_RE = /\u2014/;

// --- Tests ---

describe('generateHeroLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AI success path', () => {
    it('returns source=ai with model on valid response', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent visiting this page can read content and follow links, but cannot identify three interactive elements.',
        modelId: 'claude-haiku-4-5-20251001',
        usage: { inputTokens: 50, outputTokens: 20 },
        durationMs: 500
      });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('ai');
      expect(result.model).toBe('claude-haiku-4-5-20251001');
      expect(result.text.length).toBeGreaterThan(0);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('strips wrapping double quotes from response (Amendment 3)', async () => {
      invokeBedrock.mockResolvedValue({
        text: '"An agent can read the page content but cannot find navigation landmarks."',
        modelId: 'claude-haiku-4-5-20251001',
        usage: { inputTokens: 50, outputTokens: 20 },
        durationMs: 300
      });

      const result = await generateHeroLine(70, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('ai');
      expect(result.text[0]).not.toBe('"');
      expect(result.text[result.text.length - 1]).not.toBe('"');
      expect(result.text).toBe('An agent can read the page content but cannot find navigation landmarks.');
    });

    it('strips wrapping single quotes from response', async () => {
      invokeBedrock.mockResolvedValue({
        text: "'An agent can read content on this page.'",
        modelId: 'claude-haiku-4-5-20251001',
        usage: { inputTokens: 50, outputTokens: 20 },
        durationMs: 300
      });

      const result = await generateHeroLine(85, 'Agent-Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('ai');
      expect(result.text[0]).not.toBe("'");
      expect(result.text[result.text.length - 1]).not.toBe("'");
    });

    it('returns valid AI line for perfect score (zero findings)', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent visiting example.com can fully navigate and interpret all page elements.',
        modelId: 'claude-haiku-4-5-20251001',
        usage: { inputTokens: 30, outputTokens: 15 },
        durationMs: 400
      });

      const result = await generateHeroLine(100, 'Agent-Ready', emptyFindings, 'example.com');

      expect(result.source).toBe('ai');
      expect(result.model).toBe('claude-haiku-4-5-20251001');
    });
  });

  describe('fallback: Bedrock errors (Amendment 1 - granular reasons)', () => {
    it('timeout -> source=template, reason=timeout', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_TIMEOUT', 'Timed out'));

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(result.model).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line fallback to template',
        expect.objectContaining({ reason: 'timeout' })
      );
    });

    it('throttle (429) -> source=template, reason=throttle', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_THROTTLED', 'At capacity'));

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line fallback to template',
        expect.objectContaining({ reason: 'throttle' })
      );
    });

    it('unavailable (500/503) -> source=template, reason=bedrock-unavailable', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_UNAVAILABLE', 'Unavailable'));

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line fallback to template',
        expect.objectContaining({ reason: 'bedrock-unavailable' })
      );
    });

    it('prompt too long -> source=template, reason=prompt-too-long (persistent)', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_PROMPT_TOO_LONG', 'Too long'));

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line fallback to template',
        expect.objectContaining({ reason: 'prompt-too-long' })
      );
    });

    it('invalid response (4xx) -> source=template, reason=bedrock-invalid-response (persistent)', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_INVALID_RESPONSE', 'Bad request'));

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line fallback to template',
        expect.objectContaining({ reason: 'bedrock-invalid-response' })
      );
    });

    it('unknown error -> source=template, reason=bedrock-error (catch-all)', async () => {
      invokeBedrock.mockRejectedValue(new Error('Something unexpected'));

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line fallback to template',
        expect.objectContaining({ reason: 'bedrock-error' })
      );
    });
  });

  describe('fallback: validation failures', () => {
    it('empty response -> reason=empty-response', async () => {
      invokeBedrock.mockResolvedValue({ text: '', modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100 });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(invokeBedrock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line validation failed',
        expect.objectContaining({ reason: 'empty-response', attempt: 1 })
      );
    });

    it('too-long response (> 200 chars) -> reason=too-long', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'A'.repeat(250),
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(invokeBedrock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line validation failed',
        expect.objectContaining({ reason: 'too-long', attempt: 1 })
      );
    });

    it('multi-line response -> reason=multi-line-response', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'Line one.\nLine two.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(invokeBedrock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line validation failed',
        expect.objectContaining({ reason: 'multi-line-response', attempt: 1 })
      );
    });

    it('markdown in response -> reason=markdown-in-response', async () => {
      invokeBedrock.mockResolvedValue({
        text: '# This is a heading about the page.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(invokeBedrock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line validation failed',
        expect.objectContaining({ reason: 'markdown-in-response', attempt: 1 })
      );
    });

    it('voice violation (banned word) -> reason=voice-violation', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'This page has bad navigation that agents cannot use.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(invokeBedrock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line validation failed',
        expect.objectContaining({ reason: 'voice-violation', attempt: 1 })
      );
    });

    it('em dash in response -> reason=voice-violation-em-dash', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent can read content \u2014 but cannot navigate links.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(invokeBedrock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line validation failed',
        expect.objectContaining({ reason: 'voice-violation-em-dash', attempt: 1 })
      );
    });

    it('cliche word (delve) -> reason=voice-violation', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'Agents can delve into the page content and extract information.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(result.source).toBe('template');
      expect(invokeBedrock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hero line validation failed',
        expect.objectContaining({ reason: 'voice-violation', attempt: 1 })
      );
    });
  });

  describe('validation: no false positives on innocent text (Amendment 2)', () => {
    it('does NOT reject "landscaped garden" (contains "landscape" but not as whole word)', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent can read about the landscaped garden on this page.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(80, 'Agent-Ready', sampleFindings, 'example.com');
      expect(result.source).toBe('ai');
    });

    it('does NOT reject "fixed layout" (contains "fix" substring but not whole word "fix")', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent can read the fixed layout content on this page.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(80, 'Agent-Ready', sampleFindings, 'example.com');
      expect(result.source).toBe('ai');
    });

    it('does NOT reject "dishonestly" (contains "honestly" but not as standalone word)', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent cannot dishonestly interpret the page structure.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(60, 'Partially Ready', sampleFindings, 'example.com');
      expect(result.source).toBe('ai');
    });

    it('DOES reject bare "fix" as a whole word', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'Developers can fix the navigation to help agents.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      const result = await generateHeroLine(60, 'Partially Ready', sampleFindings, 'example.com');
      expect(result.source).toBe('template');
    });
  });

  describe('template determinism', () => {
    it('same inputs produce byte-identical template output x3', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_TIMEOUT', 'Timed out'));

      const r1 = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');
      const r2 = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');
      const r3 = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'example.com');

      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('Agent-Ready template is deterministic', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_TIMEOUT', 'Timed out'));
      const r = await generateHeroLine(90, 'Agent-Ready', emptyFindings, 'test.com');
      expect(r.text).toBe('An agent visiting test.com can identify interactive elements, read content, and navigate links on this page.');
    });

    it('Partially Ready template is deterministic', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_TIMEOUT', 'Timed out'));
      const r = await generateHeroLine(65, 'Partially Ready', sampleFindings, 'test.com');
      expect(r.text).toBe('An agent visiting test.com can read some content on this page, but encounters elements it cannot interpret or navigate.');
    });

    it('Not Yet Readable template is deterministic', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_TIMEOUT', 'Timed out'));
      const r = await generateHeroLine(30, 'Not Yet Readable', sampleFindings, 'test.com');
      expect(r.text).toBe('An agent visiting test.com finds little readable content or navigable structure on this page.');
    });
  });

  describe('template voice compliance', () => {
    it('all template strings pass banned-word check', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_TIMEOUT', 'x'));

      const ratings = ['Agent-Ready', 'Partially Ready', 'Not Yet Readable'];
      for (const rating of ratings) {
        const r = await generateHeroLine(50, rating, sampleFindings, 'example.com');
        expect(r.text).not.toMatch(BANNED_REGEX);
        expect(r.text).not.toMatch(EM_DASH_RE);
      }
    });
  });

  describe('perfect score / zero findings (Amendment 5)', () => {
    it('AI path with zero findings returns source=ai', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent visiting example.com can fully interpret and navigate all page elements.',
        modelId: 'claude-haiku-4-5-20251001',
        usage: { inputTokens: 30, outputTokens: 15 },
        durationMs: 300
      });

      const result = await generateHeroLine(100, 'Agent-Ready', emptyFindings, 'example.com');
      expect(result.source).toBe('ai');
    });

    it('template path with zero findings returns Agent-Ready template', async () => {
      invokeBedrock.mockRejectedValue(new AppError('BEDROCK_TIMEOUT', 'x'));

      const result = await generateHeroLine(100, 'Agent-Ready', emptyFindings, 'example.com');
      expect(result.source).toBe('template');
      expect(result.text).toBe('An agent visiting example.com can identify interactive elements, read content, and navigate links on this page.');
    });
  });

  describe('prompt construction safety', () => {
    it('scan data goes in userPrompt only, never in systemPrompt', async () => {
      invokeBedrock.mockResolvedValue({
        text: 'An agent can read this page.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      await generateHeroLine(65, 'Partially Ready', sampleFindings, 'evil-domain.com');

      const [systemPrompt, userPrompt] = invokeBedrock.mock.calls[0];
      // System prompt never contains the domain or findings text
      expect(systemPrompt).not.toContain('evil-domain.com');
      expect(systemPrompt).not.toContain('click handlers');
      // User prompt contains the domain and findings
      expect(userPrompt).toContain('evil-domain.com');
      expect(userPrompt).toContain('click handlers');
    });

    it('no raw HTML (< or >) in the constructed user prompt', async () => {
      const findingsWithEscapedExamples = {
        semantic_html: [{
          id: 'SEM-001',
          text: '2 elements use div tags. Agents cannot find these.',
          count: 2,
          examples: ['&lt;div onclick=&quot;go()&quot;&gt;Submit&lt;/div&gt;']
        }],
        form_accessibility: [],
        aria: [],
        structured_data: [],
        content_in_html: [],
        link_navigation: []
      };

      invokeBedrock.mockResolvedValue({
        text: 'An agent can read this page.',
        modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100
      });

      await generateHeroLine(65, 'Partially Ready', findingsWithEscapedExamples, 'example.com');

      const [, userPrompt] = invokeBedrock.mock.calls[0];
      expect(userPrompt).not.toMatch(/</);
      expect(userPrompt).not.toMatch(/>/);
    });
  });

  describe('never throws to caller', () => {
    it('catches any unexpected error and returns template', async () => {
      invokeBedrock.mockImplementation(() => { throw null; });

      const result = await generateHeroLine(50, 'Partially Ready', sampleFindings, 'example.com');
      expect(result.source).toBe('template');
      expect(result.model).toBeNull();
    });
  });
});
