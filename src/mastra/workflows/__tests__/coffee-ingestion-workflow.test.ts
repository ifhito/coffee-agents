import { describe, it, expect, vi, beforeEach } from 'vitest';

// ツールをモック
vi.mock('../../tools/ocr/extract-coffee-image-tool.js', () => ({
  extractCoffeeFromImageTool: {
    execute: vi.fn(),
  },
}));

vi.mock('../../tools/ocr/insert-coffee-evaluation-tool.js', () => ({
  insertCoffeeEvaluationTool: {
    execute: vi.fn(),
  },
}));

import { extractCoffeeFromImageTool } from '../../tools/ocr/extract-coffee-image-tool.js';
import { insertCoffeeEvaluationTool } from '../../tools/ocr/insert-coffee-evaluation-tool.js';
import { coffeeIngestionWorkflow } from '../coffee-ingestion-workflow.js';

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

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

const validInput = {
  imageBase64: 'data:image/jpeg;base64,abc123',
  user_id:     TEST_USER_ID,
  is_public:   false,
};

describe('coffeeIngestionWorkflow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('正常フロー（OCR成功・全必須項目あり） → inserted: true', async () => {
    vi.mocked(extractCoffeeFromImageTool.execute).mockResolvedValueOnce({
      success:   true,
      extracted: validExtracted,
      message:   'OCR完了',
    });
    vi.mocked(insertCoffeeEvaluationTool.execute).mockResolvedValueOnce({
      inserted:  true,
      extracted: validExtracted,
    });

    const run = await coffeeIngestionWorkflow.createRunAsync();
    const result = await run.start({ inputData: validInput });

    const output = result.results?.['db-insert'];
    expect(output?.output?.inserted).toBe(true);
  });

  it('OCR失敗（VLM例外相当）→ inserted: false, DBに追加なし', async () => {
    vi.mocked(extractCoffeeFromImageTool.execute).mockResolvedValueOnce({
      success:   false,
      extracted: null,
      message:   'OCRエラー: VLM connection timeout',
    });

    const run = await coffeeIngestionWorkflow.createRunAsync();
    const result = await run.start({ inputData: validInput });

    const output = result.results?.['db-insert'];
    expect(output?.output?.inserted).toBe(false);
    expect(output?.output?.reason).toContain('OCR失敗');
    expect(insertCoffeeEvaluationTool.execute).not.toHaveBeenCalled();
  });

  it('必須項目不足（bean_name null） → inserted: false, reason あり, DBに追加なし', async () => {
    vi.mocked(extractCoffeeFromImageTool.execute).mockResolvedValueOnce({
      success:   true,
      extracted: { ...validExtracted, bean_name: null },
      message:   'OCR完了',
    });
    vi.mocked(insertCoffeeEvaluationTool.execute).mockResolvedValueOnce({
      inserted:  false,
      extracted: { ...validExtracted, bean_name: null },
      reason:    '必須項目が不足しています: bean_name',
    });

    const run = await coffeeIngestionWorkflow.createRunAsync();
    const result = await run.start({ inputData: validInput });

    const output = result.results?.['db-insert'];
    expect(output?.output?.inserted).toBe(false);
    expect(output?.output?.reason).toContain('bean_name');
  });

  it('Supabase INSERT エラー → inserted: false, reason に error.message', async () => {
    vi.mocked(extractCoffeeFromImageTool.execute).mockResolvedValueOnce({
      success:   true,
      extracted: validExtracted,
      message:   'OCR完了',
    });
    vi.mocked(insertCoffeeEvaluationTool.execute).mockResolvedValueOnce({
      inserted:  false,
      extracted: validExtracted,
      reason:    'DB登録エラー: duplicate key value',
    });

    const run = await coffeeIngestionWorkflow.createRunAsync();
    const result = await run.start({ inputData: validInput });

    const output = result.results?.['db-insert'];
    expect(output?.output?.inserted).toBe(false);
    expect(output?.output?.reason).toContain('duplicate key value');
  });

  it('MIMEタイプ不正 → VLMがエラーを返し inserted: false', async () => {
    vi.mocked(extractCoffeeFromImageTool.execute).mockResolvedValueOnce({
      success:   false,
      extracted: null,
      message:   'OCRエラー: unsupported image format',
    });

    const run = await coffeeIngestionWorkflow.createRunAsync();
    const result = await run.start({ inputData: { ...validInput, imageBase64: 'data:application/pdf;base64,abc' } });

    const output = result.results?.['db-insert'];
    expect(output?.output?.inserted).toBe(false);
  });
});
