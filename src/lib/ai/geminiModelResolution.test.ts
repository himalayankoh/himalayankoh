import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  normalizeAiModel,
  resolveConfigFor,
  chatComplete,
} from './gemini';
import {
  liveModelFor,
  loadAIProviders,
  DEFAULT_AI_PROVIDERS,
} from '@/features/ai/providers';

describe('Gemini model deprecation and live fallback healing', () => {
  it('defines live defaults instead of retired gemini-2.5-flash', () => {
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(DEFAULT_OPENROUTER_MODEL).toBe('google/gemini-3.8-flash');
  });

  it('normalizes retired 2.5 and legacy model slugs to active models', () => {
    expect(normalizeAiModel('gemini-2.5-flash')).toBe('gemini-3.8-flash');
    expect(normalizeAiModel('gemini-2.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(normalizeAiModel('gemini-2.5-pro')).toBe('gemini-3.8-flash');
    expect(normalizeAiModel('google/gemini-2.5-flash')).toBe('google/gemini-3.8-flash');
    expect(normalizeAiModel('google/gemini-2.5-flash-lite')).toBe('google/gemini-3.5-flash-lite');
    expect(normalizeAiModel('google/gemini-2.5-pro')).toBe('google/gemini-3.8-flash');
    expect(normalizeAiModel('gemini-2.0-flash')).toBe('gemini-3.8-flash');
    expect(normalizeAiModel('gemini-1.5-flash')).toBe('gemini-3.8-flash');
  });

  it('keeps current models unchanged', () => {
    expect(normalizeAiModel('gemini-3.8-flash')).toBe('gemini-3.8-flash');
    expect(normalizeAiModel('gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(normalizeAiModel('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview');
    expect(normalizeAiModel('deepseek-chat')).toBe('deepseek-chat');
  });

  it('resolves config with normalized model even when an obsolete model is requested', async () => {
    const config = await resolveConfigFor('gemini', 'gemini-2.5-flash');
    expect(config.model).toBe('gemini-3.8-flash');
  });

  it('maps retired models client-side with liveModelFor', () => {
    expect(liveModelFor('gemini-2.5-flash')).toBe('gemini-3.8-flash');
    expect(liveModelFor('gemini-2.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(liveModelFor('gemini-2.5-pro')).toBe('gemini-3.8-flash');
    expect(liveModelFor('google/gemini-2.5-flash')).toBe('google/gemini-3.8-flash');
  });

  it('heals stored localStorage configs containing gemini-2.5-flash on load', () => {
    const mockStorage = {
      getItem: () =>
        JSON.stringify([
          {
            id: 'gemini',
            name: 'Google AI Studio (Gemini + Gemma)',
            models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.8-flash'],
            defaultModel: 'gemini-2.5-flash',
            enabled: true,
            isDefault: true,
          },
        ]),
    };

    const providers = loadAIProviders(mockStorage as any);
    const gemini = providers.find((p) => p.id === 'gemini');
    expect(gemini).toBeDefined();
    expect(gemini?.defaultModel).toBe('gemini-3.8-flash');
    expect(gemini?.models).not.toContain('gemini-2.5-flash');
    expect(gemini?.models).toContain('gemini-3.8-flash');
  });

  it('DEFAULT_AI_PROVIDERS does not advertise retired 2.5 flash models', () => {
    const gemini = DEFAULT_AI_PROVIDERS.find((p) => p.id === 'gemini');
    expect(gemini?.defaultModel).toBe('gemini-3.8-flash');
    expect(gemini?.models).not.toContain('gemini-2.5-flash');
    expect(gemini?.models).not.toContain('gemini-2.5-flash-lite');
    expect(gemini?.models).not.toContain('gemini-2.5-pro');
    expect(gemini?.models).toContain('gemini-3.8-flash');
    expect(gemini?.models).toContain('gemini-3.5-flash-lite');
  });

  it('automatically falls back to DEFAULT_GEMINI_MODEL in chatComplete if a 404 occurs', async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(url);
      if (url.includes('custom-retired-model')) {
        return new Response(JSON.stringify({ error: { message: 'Not Found', code: 404 } }), { status: 404 });
      }
      if (url.includes('gemini-3.8-flash')) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"result":"success"}' }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const result = await chatComplete(
        { provider: 'gemini', apiKey: 'test-key', model: 'custom-retired-model', keySource: 'console' },
        { user: 'generate copy' },
      );
      expect(result).toBe('{"result":"success"}');
      expect(calls.length).toBe(2);
      expect(calls[0]).toContain('custom-retired-model');
      expect(calls[1]).toContain('gemini-3.8-flash');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
