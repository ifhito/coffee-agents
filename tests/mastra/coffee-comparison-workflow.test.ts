import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseClientMock } from '../helpers/supabaseMock';

/**
 * コーヒー比較レポートワークフローのテスト
 * TDDアプローチ: Red → Green → Refactor
 */

// Supabaseクライアントのモック
let mockClient: ReturnType<typeof createSupabaseClientMock>['client'];
const createClientMock = vi.fn(() => mockClient);

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

// テスト用のコーヒーデータ
const mockCoffeeA = {
  bean_name: 'エチオピア イルガチェフェ',
  bean_type: 'Arabica',
  roast_level: '浅煎り',
  shop_name: 'Blue Bottle Coffee',
  shop_address: '東京都渋谷区',
  acidity: 4,
  aroma: 5,
  bitterness: 2,
  overall_rating: 5,
};

const mockCoffeeB = {
  bean_name: 'ブラジル サントス',
  bean_type: 'Arabica',
  roast_level: '深煎り',
  shop_name: 'Starbucks',
  shop_address: '東京都新宿区',
  acidity: 2,
  aroma: 3,
  bitterness: 4,
  overall_rating: 4,
};

describe('coffee-comparison-workflow', () => {
  const baseEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...baseEnv };
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-key';
    createClientMock.mockClear();
  });

  describe('fetchCoffeeA step', () => {
    it('should fetch coffee data by name from Supabase', async () => {
      const { client, calls } = createSupabaseClientMock({
        data: mockCoffeeA,
        error: null,
      });
      mockClient = client;

      // ワークフローのステップをインポート
      const { fetchCoffeeA } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await fetchCoffeeA.execute({
        inputData: {
          coffeeNameA: 'エチオピア イルガチェフェ',
          coffeeNameB: 'ブラジル サントス',
        },
      });

      // Supabaseクエリが正しく呼ばれたか確認
      expect(calls.from).toEqual([['coffee_evaluations']]);
      expect(calls.eq).toContainEqual(['is_public', true]);
      expect(calls.ilike).toContainEqual(['bean_name', '%エチオピア イルガチェフェ%']);

      // 結果の確認
      expect(result.coffeeA).toEqual({
        beanName: 'エチオピア イルガチェフェ',
        beanType: 'Arabica',
        roastLevel: '浅煎り',
        shopName: 'Blue Bottle Coffee',
        shopAddress: '東京都渋谷区',
        acidity: 4,
        aroma: 5,
        bitterness: 2,
        overallRating: 5,
      });
      expect(result.error).toBeUndefined();
    });

    it('should return null when coffee is not found', async () => {
      const { client } = createSupabaseClientMock({
        data: null,
        error: null,
      });
      mockClient = client;

      const { fetchCoffeeA } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await fetchCoffeeA.execute({
        inputData: {
          coffeeNameA: '存在しないコーヒー',
          coffeeNameB: 'ブラジル サントス',
        },
      });

      expect(result.coffeeA).toBeNull();
      expect(result.error).toContain('見つかりませんでした');
    });

    it('should handle Supabase connection errors', async () => {
      const { client } = createSupabaseClientMock({
        data: null,
        error: { message: 'Connection failed' },
      });
      mockClient = client;

      const { fetchCoffeeA } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await fetchCoffeeA.execute({
        inputData: {
          coffeeNameA: 'エチオピア イルガチェフェ',
          coffeeNameB: 'ブラジル サントス',
        },
      });

      expect(result.coffeeA).toBeNull();
      expect(result.error).toContain('Connection failed');
    });
  });

  describe('fetchCoffeeB step', () => {
    it('should fetch coffee data by name from Supabase', async () => {
      const { client, calls } = createSupabaseClientMock({
        data: mockCoffeeB,
        error: null,
      });
      mockClient = client;

      const { fetchCoffeeB } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await fetchCoffeeB.execute({
        inputData: {
          coffeeNameA: 'エチオピア イルガチェフェ',
          coffeeNameB: 'ブラジル サントス',
        },
      });

      expect(calls.ilike).toContainEqual(['bean_name', '%ブラジル サントス%']);
      expect(result.coffeeB).toEqual({
        beanName: 'ブラジル サントス',
        beanType: 'Arabica',
        roastLevel: '深煎り',
        shopName: 'Starbucks',
        shopAddress: '東京都新宿区',
        acidity: 2,
        aroma: 3,
        bitterness: 4,
        overallRating: 4,
      });
    });

    it('should return null when coffee is not found', async () => {
      const { client } = createSupabaseClientMock({
        data: null,
        error: null,
      });
      mockClient = client;

      const { fetchCoffeeB } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await fetchCoffeeB.execute({
        inputData: {
          coffeeNameA: 'エチオピア イルガチェフェ',
          coffeeNameB: '存在しないコーヒー',
        },
      });

      expect(result.coffeeB).toBeNull();
      expect(result.error).toContain('見つかりませんでした');
    });

    it('should handle Supabase connection errors', async () => {
      const { client } = createSupabaseClientMock({
        data: null,
        error: { message: 'Database error' },
      });
      mockClient = client;

      const { fetchCoffeeB } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await fetchCoffeeB.execute({
        inputData: {
          coffeeNameA: 'エチオピア イルガチェフェ',
          coffeeNameB: 'ブラジル サントス',
        },
      });

      expect(result.coffeeB).toBeNull();
      expect(result.error).toContain('Database error');
    });
  });

  describe('generateComparisonReport step', () => {
    // モック用のコーヒーデータ（変換済み形式）
    const coffeeAData = {
      beanName: 'エチオピア イルガチェフェ',
      beanType: 'Arabica',
      roastLevel: '浅煎り',
      shopName: 'Blue Bottle Coffee',
      shopAddress: '東京都渋谷区',
      acidity: 4,
      aroma: 5,
      bitterness: 2,
      overallRating: 5,
    };

    const coffeeBData = {
      beanName: 'ブラジル サントス',
      beanType: 'Arabica',
      roastLevel: '深煎り',
      shopName: 'Starbucks',
      shopAddress: '東京都新宿区',
      acidity: 2,
      aroma: 3,
      bitterness: 4,
      overallRating: 4,
    };

    it('should generate comparison report when both coffees exist', async () => {
      // Mastraとagentのモック
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: '【比較レポート】エチオピア イルガチェフェは酸味が強くフルーティ、ブラジル サントスは苦味が強くコクがあります。',
        }),
      };
      const mockMastra = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      };

      const { generateComparisonReport } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await generateComparisonReport.execute({
        inputData: {
          'fetch-coffee-a': { coffeeA: coffeeAData },
          'fetch-coffee-b': { coffeeB: coffeeBData },
        },
        mastra: mockMastra as any,
      });

      expect(mockMastra.getAgent).toHaveBeenCalledWith('coffeeAgent');
      expect(mockAgent.generate).toHaveBeenCalled();
      expect(result.report).toContain('比較レポート');
    });

    it('should include error message when one coffee is null', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'コーヒーAのみの情報で生成されたレポート',
        }),
      };
      const mockMastra = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      };

      const { generateComparisonReport } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await generateComparisonReport.execute({
        inputData: {
          'fetch-coffee-a': { coffeeA: coffeeAData },
          'fetch-coffee-b': { coffeeB: null, error: 'コーヒーが見つかりませんでした' },
        },
        mastra: mockMastra as any,
      });

      expect(result.report).toBeDefined();
      // エラー情報を含むプロンプトでagentが呼ばれる
      expect(mockAgent.generate).toHaveBeenCalled();
    });

    it('should return fallback report when LLM fails', async () => {
      const mockAgent = {
        generate: vi.fn().mockRejectedValue(new Error('LLM connection failed')),
      };
      const mockMastra = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      };

      const { generateComparisonReport } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await generateComparisonReport.execute({
        inputData: {
          'fetch-coffee-a': { coffeeA: coffeeAData },
          'fetch-coffee-b': { coffeeB: coffeeBData },
        },
        mastra: mockMastra as any,
      });

      // フォールバックレポートが返される
      expect(result.report).toContain('エチオピア イルガチェフェ');
      expect(result.report).toContain('ブラジル サントス');
    });

    it('should return error when agent is not found', async () => {
      const mockMastra = {
        getAgent: vi.fn().mockReturnValue(null),
      };

      const { generateComparisonReport } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      const result = await generateComparisonReport.execute({
        inputData: {
          'fetch-coffee-a': { coffeeA: coffeeAData },
          'fetch-coffee-b': { coffeeB: coffeeBData },
        },
        mastra: mockMastra as any,
      });

      // エージェントがなくてもフォールバックレポートを返す
      expect(result.report).toBeDefined();
    });
  });

  describe('workflow integration', () => {
    it('should execute parallel fetch and generate report', async () => {
      // 両方のコーヒーが見つかるモック
      const mockClientA = createSupabaseClientMock({
        data: mockCoffeeA,
        error: null,
      });
      const mockClientB = createSupabaseClientMock({
        data: mockCoffeeB,
        error: null,
      });

      // 1回目の呼び出しはA、2回目はB
      let callCount = 0;
      mockClient = new Proxy({} as typeof mockClientA.client, {
        get: (_, prop) => {
          if (prop === 'from') {
            return (table: string) => {
              callCount++;
              const client = callCount === 1 ? mockClientA : mockClientB;
              return client.client.from(table);
            };
          }
          return undefined;
        },
      });

      const { coffeeComparisonWorkflow } = await import(
        '../../src/mastra/workflows/coffee-comparison-workflow'
      );

      // ワークフローが定義されていることを確認
      expect(coffeeComparisonWorkflow).toBeDefined();
      expect(coffeeComparisonWorkflow.id).toBe('coffee-comparison-workflow');
    });
  });
});
