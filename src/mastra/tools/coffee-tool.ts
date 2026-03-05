import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Supabaseクライアントの初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not set');
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const roastLevelSchema = z
  .preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case 'medium-dark':
      case 'medium dark':
      case 'mediumdark':
        return 'dark';
      case 'light-medium':
      case 'light medium':
      case 'lightmedium':
        return 'medium';
      case '浅煎り':
      case '中煎り':
      case '深煎り':
      case 'light':
      case 'medium':
      case 'dark':
        return value;
      default:
        return value;
    }
  }, z.enum(['浅煎り', '中煎り', '深煎り', 'light', 'medium', 'dark']))
  .optional();

/**
 * コーヒー検索ツール
 * ユーザーの好みに基づいてSupabaseからコーヒー評価を検索
 */
export const searchCoffeeTool = createTool({
  id: 'searchCoffee',
  description: `
    ユーザーの好みに基づいてコーヒーを検索します。
    酸味(acidity)、苦味(bitterness)、香り(aroma)の条件を指定できます。
    各評価値は1-5のスケールです（1=弱い、5=強い）。
  `,
  inputSchema: z.object({
    // z.coerce を使用: LLMが文字列 "3" を返しても数値 3 に自動変換
    minAcidity: z.coerce.number().min(1).max(5).optional()
      .describe('酸味の最小値 (1-5)'),
    maxAcidity: z.coerce.number().min(1).max(5).optional()
      .describe('酸味の最大値 (1-5)'),
    minBitterness: z.coerce.number().min(1).max(5).optional()
      .describe('苦味の最小値 (1-5)'),
    maxBitterness: z.coerce.number().min(1).max(5).optional()
      .describe('苦味の最大値 (1-5)'),
    minAroma: z.coerce.number().min(1).max(5).optional()
      .describe('香りの最小値 (1-5)'),
    maxAroma: z.coerce.number().min(1).max(5).optional()
      .describe('香りの最大値 (1-5)'),
    roastLevel: roastLevelSchema.describe('焙煎度'),
    limit: z.coerce.number().min(1).max(10).default(5)
      .describe('取得件数 (1-10)')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.object({
      beanName: z.string().nullable(),
      beanType: z.string().nullable(),
      roastLevel: z.string().nullable(),
      shopName: z.string().nullable(),
      shopAddress: z.string().nullable(),
      acidity: z.number().nullable(),
      aroma: z.number().nullable(),
      bitterness: z.number().nullable(),
      overallRating: z.number().nullable(),
    })),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    if (!supabase) {
      return {
        success: false,
        results: [],
        message: 'Supabase接続が設定されていません。環境変数SUPABASE_URLとSUPABASE_ANON_KEYを設定してください。'
      };
    }

    try {
      let query = supabase
        .from('coffee_evaluations')
        .select('bean_name, bean_type, roast_level, shop_name, shop_address, acidity, aroma, bitterness, overall_rating')
        .eq('is_public', true);

      // 酸味フィルター
      if (context.minAcidity !== undefined) {
        query = query.gte('acidity', context.minAcidity);
      }
      if (context.maxAcidity !== undefined) {
        query = query.lte('acidity', context.maxAcidity);
      }

      // 苦味フィルター
      if (context.minBitterness !== undefined) {
        query = query.gte('bitterness', context.minBitterness);
      }
      if (context.maxBitterness !== undefined) {
        query = query.lte('bitterness', context.maxBitterness);
      }

      // 香りフィルター
      if (context.minAroma !== undefined) {
        query = query.gte('aroma', context.minAroma);
      }
      if (context.maxAroma !== undefined) {
        query = query.lte('aroma', context.maxAroma);
      }

      // 焙煎度フィルター
      if (context.roastLevel !== undefined) {
        query = query.eq('roast_level', context.roastLevel);
      }

      // 総合評価でソートして取得
      const { data, error } = await query
        .order('overall_rating', { ascending: false })
        .limit(context.limit);

      if (error) {
        return {
          success: false,
          results: [],
          message: `検索エラー: ${error.message}`
        };
      }

      if (!data || data.length === 0) {
        return {
          success: true,
          results: [],
          message: '条件に合うコーヒーが見つかりませんでした。条件を緩和してみてください。'
        };
      }

      const results = data.map(row => ({
        beanName: row.bean_name,
        beanType: row.bean_type,
        roastLevel: row.roast_level,
        shopName: row.shop_name,
        shopAddress: row.shop_address,
        acidity: row.acidity,
        aroma: row.aroma,
        bitterness: row.bitterness,
        overallRating: row.overall_rating,
      }));

      return {
        success: true,
        results,
        message: `${results.length}件のコーヒーが見つかりました。`
      };
    } catch (err) {
      return {
        success: false,
        results: [],
        message: `予期しないエラー: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }
});

/**
 * 人気コーヒー取得ツール
 * 好みが不明な場合に、評価の高いコーヒーを取得
 */
export const getPopularCoffeeTool = createTool({
  id: 'getPopularCoffee',
  description: `
    評価の高い人気のコーヒーを取得します。
    ユーザーの好みが不明な場合や、おすすめを聞かれた場合に使用してください。
  `,
  inputSchema: z.object({
    limit: z.coerce.number().min(1).max(10).default(5)
      .describe('取得件数 (1-10)')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.object({
      beanName: z.string().nullable(),
      beanType: z.string().nullable(),
      roastLevel: z.string().nullable(),
      shopName: z.string().nullable(),
      acidity: z.number().nullable(),
      aroma: z.number().nullable(),
      bitterness: z.number().nullable(),
      overallRating: z.number().nullable(),
    })),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    if (!supabase) {
      return {
        success: false,
        results: [],
        message: 'Supabase接続が設定されていません。環境変数SUPABASE_URLとSUPABASE_ANON_KEYを設定してください。'
      };
    }

    try {
      const { data, error } = await supabase
        .from('coffee_evaluations')
        .select('bean_name, bean_type, roast_level, shop_name, acidity, aroma, bitterness, overall_rating')
        .eq('is_public', true)
        .order('overall_rating', { ascending: false })
        .limit(context.limit);

      if (error) {
        return {
          success: false,
          results: [],
          message: `検索エラー: ${error.message}`
        };
      }

      if (!data || data.length === 0) {
        return {
          success: true,
          results: [],
          message: '登録されているコーヒーがありません。'
        };
      }

      const results = data.map(row => ({
        beanName: row.bean_name,
        beanType: row.bean_type,
        roastLevel: row.roast_level,
        shopName: row.shop_name,
        acidity: row.acidity,
        aroma: row.aroma,
        bitterness: row.bitterness,
        overallRating: row.overall_rating,
      }));

      return {
        success: true,
        results,
        message: `人気のコーヒーを${results.length}件取得しました。`
      };
    } catch (err) {
      return {
        success: false,
        results: [],
        message: `予期しないエラー: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }
});
