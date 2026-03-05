import { describe, it, expect, vi, beforeEach } from 'vitest';

// generateObject をモック
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

// openai をモック
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => ({ provider: 'openai', modelId: 'gpt-4o-mini' })),
}));

// ollama-ai-provider をモック
vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn((options?: { baseURL?: string }) => (modelId: string) => ({
    provider: 'ollama',
    modelId,
    baseURL: options?.baseURL,
  })),
}));

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';
import { extractCoffeeFromImageTool } from '../extract-coffee-image-tool.js';

const validExtracted = {
  bean_name:      'エチオピア イルガチェフェ',
  bean_type:      'アラビカ',
  roast_level:    '浅煎り' as const,
  shop_name:      'テスト珈琲',
  shop_address:   '東京都渋谷区',
  acidity:        4,
  aroma:          5,
  bitterness:     2,
  overall_rating: 4,
};

describe('extractCoffeeFromImageTool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.OCR_PROVIDER;
    delete process.env.OCR_MODEL;
  });

  it('VLMが正常なJSONを返す → success: true, extractedCoffeeSchema に適合', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: validExtracted,
    } as Awaited<ReturnType<typeof generateObject>>);

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(true);
    expect(result.extracted).toEqual(validExtracted);
    expect(result.message).toBe('OCR完了');
  });

  it('VLMが例外を投げる → success: false, extracted: null, 例外を再throwしない', async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('VLM connection timeout'));

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(false);
    expect(result.extracted).toBeNull();
    expect(result.message).toContain('VLM connection timeout');
  });

  it('OCR_PROVIDER=openai 環境 → openai モデルが選択される', async () => {
    process.env.OCR_PROVIDER = 'openai';

    vi.mocked(generateObject).mockResolvedValueOnce({
      object: validExtracted,
    } as Awaited<ReturnType<typeof generateObject>>);

    await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(openai).toHaveBeenCalledWith('gpt-4o-mini');
  });

  it('OllamaでNot Found時、/api付きURLとqwen2.5vl:7bへフォールバックして成功する', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    process.env.OCR_MODEL = 'qwen2.5vl';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

    vi.mocked(generateObject)
      .mockRejectedValueOnce(new Error('Not Found'))
      .mockResolvedValueOnce({
        object: validExtracted,
      } as Awaited<ReturnType<typeof generateObject>>);

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(true);
    expect(createOllama).toHaveBeenCalledWith({ baseURL: 'http://localhost:11434/api' });
    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(2);
  });
});
