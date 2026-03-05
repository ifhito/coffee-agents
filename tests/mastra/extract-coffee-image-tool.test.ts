import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestionInputSchema } from '../../src/mastra/lib/ocr-types';

const mockGenerateObject = vi.fn();
const mockCreateOllama = vi.fn((options?: { baseURL?: string }) => (modelId: string) => ({
  provider: 'ollama',
  modelId,
  baseURL: options?.baseURL,
}));
const mockOpenAi = vi.fn((modelId: string) => ({ provider: 'openai', modelId }));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

const mockHeicConvert = vi.fn().mockResolvedValue(Buffer.from('fake-jpeg-bytes'));

vi.mock('heic-convert', () => ({ default: mockHeicConvert }));

vi.mock('ollama-ai-provider', () => ({
  createOllama: mockCreateOllama,
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: mockOpenAi,
}));

const validExtracted = {
  bean_name: 'エチオピア イルガチェフェ',
  bean_type: 'アラビカ',
  roast_level: '浅煎り' as const,
  shop_name: 'テスト珈琲',
  shop_address: '東京都渋谷区',
  acidity: 4,
  aroma: 5,
  bitterness: 2,
  overall_rating: 4,
};

describe('extractCoffeeFromImageTool', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGenerateObject.mockReset();
    mockCreateOllama.mockClear();
    mockOpenAi.mockClear();
    mockHeicConvert.mockClear();
    delete process.env.OCR_PROVIDER;
    delete process.env.OCR_MODEL;
    delete process.env.OLLAMA_BASE_URL;
  });

  it('HEIC画像でOllamaパスが成功する（heic-convertでJPEG変換される）', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    mockHeicConvert.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    mockGenerateObject.mockResolvedValueOnce({ object: validExtracted });

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/heic;base64,abc123' },
    });

    expect(result.success).toBe(true);
    expect(mockHeicConvert).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'JPEG', quality: 0.9 }),
    );
  });

  it('JPEG画像ではheic-convertが呼ばれない（変換不要）', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    mockGenerateObject.mockResolvedValueOnce({ object: validExtracted });

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(true);
    expect(mockHeicConvert).not.toHaveBeenCalled();
  });

  it('画像のみ送信時でも既定のOCR指示をテキストに含める', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    mockGenerateObject.mockResolvedValueOnce({ object: validExtracted });

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(true);
    const textPart = mockGenerateObject.mock.calls[0]?.[0]?.messages?.[0]?.content?.find(
      (p: { type: string; text?: string }) => p.type === 'text',
    );
    expect(textPart?.text).toContain('画像を読み取ってください');
  });

  it('OCR指示文を渡した場合はプロンプトに反映される', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    mockGenerateObject.mockResolvedValueOnce({ object: validExtracted });

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: {
        imageBase64: 'data:image/jpeg;base64,abc123',
        ocrInstruction: '画像を読み取ってください。豆名を必ず探してください。',
      },
    });

    expect(result.success).toBe(true);
    const textPart = mockGenerateObject.mock.calls[0]?.[0]?.messages?.[0]?.content?.find(
      (p: { type: string; text?: string }) => p.type === 'text',
    );
    expect(textPart?.text).toContain('豆名を必ず探してください');
  });

  describe('ingestionInputSchema MIMEタイプバリデーション', () => {
    const baseInput = { user_id: '00000000-0000-0000-0000-000000000000', is_public: false };

    it.each(['jpeg', 'jpg', 'png', 'webp', 'gif', 'heic', 'heif'])(
      'data:image/%s は許可される',
      (mimeType) => {
        const result = ingestionInputSchema.safeParse({
          ...baseInput,
          imageBase64: `data:image/${mimeType};base64,abc123`,
        });
        expect(result.success).toBe(true);
      },
    );

    it('PDFは拒否される', () => {
      const result = ingestionInputSchema.safeParse({
        ...baseInput,
        imageBase64: 'data:application/pdf;base64,abc123',
      });
      expect(result.success).toBe(false);
    });

    it('未知の画像フォーマット（bmp）は拒否される', () => {
      const result = ingestionInputSchema.safeParse({
        ...baseInput,
        imageBase64: 'data:image/bmp;base64,abc123',
      });
      expect(result.success).toBe(false);
    });

    it('ocr_instruction を指定してもバリデーションに通る', () => {
      const result = ingestionInputSchema.safeParse({
        ...baseInput,
        imageBase64: 'data:image/jpeg;base64,abc123',
        ocr_instruction: '画像を読み取ってください',
      });
      expect(result.success).toBe(true);
    });
  });

  it('Not Found時に qwen2.5vl -> qwen2.5vl:7b へフォールバックする', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    process.env.OCR_MODEL = 'qwen2.5vl';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

    mockGenerateObject
      .mockRejectedValueOnce(new Error('Not Found'))
      .mockResolvedValueOnce({ object: validExtracted });

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(true);
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(mockCreateOllama).toHaveBeenCalledWith({ baseURL: 'http://localhost:11434/api' });

    const firstModel = mockGenerateObject.mock.calls[0]?.[0]?.model?.modelId;
    const secondModel = mockGenerateObject.mock.calls[1]?.[0]?.model?.modelId;
    expect(firstModel).toBe('qwen2.5vl');
    expect(secondModel).toBe('qwen2.5vl:7b');
  });

  it('Not Foundが続く場合は設定ヒント付きエラーを返す', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    process.env.OCR_MODEL = 'qwen2.5vl';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

    mockGenerateObject.mockRejectedValue(new Error('Not Found'));

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(false);
    expect(result.extracted).toBeNull();
    expect(result.message).toContain('Ollamaで対象モデルを pull');
    expect(result.message).toContain('OLLAMA_BASE_URL の値を確認');
    expect(result.message).toContain('qwen2.5vl:7b@http://localhost:11434/api');
  });

  it('Internal Server Errorが続く場合は運用ヒント付きエラーを返す', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    process.env.OCR_MODEL = 'qwen2.5vl';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api';

    mockGenerateObject.mockRejectedValue(new Error('Failed after 3 attempts. Last error: Internal Server Error'));

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(false);
    expect(result.extracted).toBeNull();
    expect(result.message).toContain('Internal Server Error');
    expect(result.message).toContain('Ollamaの再起動');
    expect(result.message).toContain('モデル再pull');
  });

  it('Timeout系エラーが続く場合はTimeoutヒントを返す', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    process.env.OCR_MODEL = 'qwen2.5vl';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api';

    mockGenerateObject.mockRejectedValue(new Error('Gateway Timeout'));

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(false);
    expect(result.extracted).toBeNull();
    expect(result.message).toContain('OCRエラー: Timeout');
    expect(result.message).toContain('画像サイズ縮小');
  });

  it('構造化失敗時は再試行ガイダンスを返す', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    process.env.OCR_MODEL = 'qwen2.5vl';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api';

    mockGenerateObject.mockRejectedValue(new Error('No object generated: response did not match schema'));

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(false);
    expect(result.extracted).toBeNull();
    expect(result.message).toContain('構造化に失敗');
    expect(result.message).toContain('手入力');
  });

  it('Internal Server Error と Not Found が混在しても Internal Server Error を優先する', async () => {
    process.env.OCR_PROVIDER = 'ollama';
    process.env.OCR_MODEL = 'qwen2.5vl:7b';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api';

    mockGenerateObject
      .mockRejectedValueOnce(new Error('Internal Server Error'))
      .mockRejectedValueOnce(new Error('Not Found'))
      .mockRejectedValue(new Error('Not Found'));

    const { extractCoffeeFromImageTool } = await import('../../src/mastra/tools/ocr/extract-coffee-image-tool');

    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: 'data:image/jpeg;base64,abc123' },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Internal Server Error');
    expect(result.message).not.toContain('OCRエラー: Not Found');
  });
});
