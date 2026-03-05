import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabase-client をモック
vi.mock('../../../lib/supabase-client.js', () => ({
  supabaseAdmin: null,
}));

import * as supabaseClientModule from '../../../lib/supabase-client.js';
import { insertCoffeeEvaluationTool } from '../insert-coffee-evaluation-tool.js';

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

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function mockSupabaseAdmin(insertResult: { error: { message: string } | null }) {
  const insertMock = vi.fn().mockResolvedValue(insertResult);
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  (supabaseClientModule as { supabaseAdmin: unknown }).supabaseAdmin = { from: fromMock };
  return { fromMock, insertMock };
}

describe('insertCoffeeEvaluationTool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (supabaseClientModule as { supabaseAdmin: unknown }).supabaseAdmin = null;
  });

  it('全必須項目あり・Supabase成功 → inserted: true', async () => {
    mockSupabaseAdmin({ error: null });

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id:   TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(true);
    expect(result.extracted).toEqual(validExtracted);
  });

  it('bean_name が null → inserted: false, reason に "bean_name" を含む', async () => {
    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: { ...validExtracted, bean_name: null },
        user_id:   TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(false);
    expect(result.reason).toContain('bean_name');
  });

  it('overall_rating が null → inserted: false', async () => {
    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: { ...validExtracted, overall_rating: null },
        user_id:   TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(false);
    expect(result.reason).toContain('overall_rating');
  });

  it('supabaseAdmin が null → inserted: false, 例外なし', async () => {
    // supabaseAdmin は beforeEach で null にリセット済み

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id:   TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(false);
    expect(result.reason).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('Supabase がエラーを返す → inserted: false, reason に error.message を含む', async () => {
    mockSupabaseAdmin({ error: { message: 'duplicate key value' } });

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id:   TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(false);
    expect(result.reason).toContain('duplicate key value');
  });
});
