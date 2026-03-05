import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/mastra/lib/supabase-client.js', () => ({
  supabaseAdmin: null,
  supabaseAnon: null,
}));

import * as supabaseClientModule from '../../src/mastra/lib/supabase-client.js';
import { insertCoffeeEvaluationTool } from '../../src/mastra/tools/ocr/insert-coffee-evaluation-tool.js';

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

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function mockSupabaseAdmin(insertResult: { error: { message: string } | null }) {
  const insertMock = vi.fn().mockResolvedValue(insertResult);
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  (supabaseClientModule as { supabaseAdmin: unknown }).supabaseAdmin = { from: fromMock };
}

function mockSupabaseAnon(insertResult: { error: { message: string } | null }) {
  const insertMock = vi.fn().mockResolvedValue(insertResult);
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  (supabaseClientModule as { supabaseAnon: unknown }).supabaseAnon = { from: fromMock };
}

function mockSupabaseAdminReject(err: Error) {
  const insertMock = vi.fn().mockRejectedValue(err);
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  (supabaseClientModule as { supabaseAdmin: unknown }).supabaseAdmin = { from: fromMock };
}

describe('insertCoffeeEvaluationTool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (supabaseClientModule as { supabaseAdmin: unknown }).supabaseAdmin = null;
    (supabaseClientModule as { supabaseAnon: unknown }).supabaseAnon = null;
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  });

  it('Supabase成功時は inserted: true を返す', async () => {
    mockSupabaseAdmin({ error: null });

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id: TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(true);
    expect(result.extracted).toEqual(validExtracted);
  });

  it('Supabaseが fetch failed を返した場合は接続ヒント付きで返す', async () => {
    mockSupabaseAdmin({ error: { message: 'TypeError: fetch failed' } });

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id: TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(false);
    expect(result.reason).toContain('TypeError: fetch failed');
    expect(result.reason).toContain('supabase start');
    expect(result.reason).toContain('SUPABASE_URL=http://127.0.0.1:54321');
  });

  it('insertで例外が投げられても inserted: false で返す', async () => {
    mockSupabaseAdminReject(new Error('socket hang up'));

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id: TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(false);
    expect(result.reason).toContain('socket hang up');
  });

  it('service_role key エラー時に anon フォールバックで成功する', async () => {
    mockSupabaseAdmin({ error: { message: 'No suitable key or wrong key type' } });
    mockSupabaseAnon({ error: null });

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id: TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(true);
  });

  it('service_role key エラー時に分かりやすい設定エラーを返す', async () => {
    mockSupabaseAdmin({ error: { message: 'No suitable key or wrong key type' } });
    mockSupabaseAnon({ error: { message: 'new row violates row-level security policy' } });

    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: validExtracted,
        user_id: TEST_USER_ID,
        is_public: false,
      },
    });

    expect(result.inserted).toBe(false);
    expect(result.reason).toContain('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY');
    expect(result.reason).toContain('supabase status');
  });
});
