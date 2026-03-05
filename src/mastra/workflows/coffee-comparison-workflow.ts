import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { Mastra } from '@mastra/core/mastra';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Supabaseクライアントの初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// コーヒーデータのスキーマ
const coffeeDataSchema = z.object({
  beanName: z.string().nullable(),
  beanType: z.string().nullable(),
  roastLevel: z.string().nullable(),
  shopName: z.string().nullable(),
  shopAddress: z.string().nullable(),
  acidity: z.number().nullable(),
  aroma: z.number().nullable(),
  bitterness: z.number().nullable(),
  overallRating: z.number().nullable(),
});

export type CoffeeData = z.infer<typeof coffeeDataSchema>;

/**
 * Supabaseから取得した生データをCoffeeData形式に変換
 */
function transformCoffeeData(raw: {
  bean_name: string | null;
  bean_type: string | null;
  roast_level: string | null;
  shop_name: string | null;
  shop_address: string | null;
  acidity: number | null;
  aroma: number | null;
  bitterness: number | null;
  overall_rating: number | null;
}): CoffeeData {
  return {
    beanName: raw.bean_name,
    beanType: raw.bean_type,
    roastLevel: raw.roast_level,
    shopName: raw.shop_name,
    shopAddress: raw.shop_address,
    acidity: raw.acidity,
    aroma: raw.aroma,
    bitterness: raw.bitterness,
    overallRating: raw.overall_rating,
  };
}

/**
 * コーヒー情報をSupabaseから検索する共通ロジック
 */
async function fetchCoffeeByName(
  coffeeName: string
): Promise<{ coffee: CoffeeData | null; error?: string }> {
  if (!supabase) {
    return { coffee: null, error: 'Supabase接続が設定されていません' };
  }

  try {
    const { data, error } = await supabase
      .from('coffee_evaluations')
      .select(
        'bean_name, bean_type, roast_level, shop_name, shop_address, acidity, aroma, bitterness, overall_rating'
      )
      .eq('is_public', true)
      .ilike('bean_name', `%${coffeeName}%`)
      .maybeSingle();

    if (error) {
      return { coffee: null, error: error.message };
    }

    if (!data) {
      return {
        coffee: null,
        error: `コーヒー「${coffeeName}」が見つかりませんでした`,
      };
    }

    return { coffee: transformCoffeeData(data) };
  } catch (err) {
    return {
      coffee: null,
      error: `予期しないエラー: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ワークフロー入力スキーマ
const workflowInputSchema = z.object({
  coffeeNameA: z.string().describe('比較対象のコーヒーA'),
  coffeeNameB: z.string().describe('比較対象のコーヒーB'),
});

// fetchCoffeeA出力スキーマ
const fetchCoffeeAOutputSchema = z.object({
  coffeeA: coffeeDataSchema.nullable(),
  error: z.string().optional(),
});

// fetchCoffeeB出力スキーマ
const fetchCoffeeBOutputSchema = z.object({
  coffeeB: coffeeDataSchema.nullable(),
  error: z.string().optional(),
});

/**
 * コーヒーAの情報を取得するステップ
 * 並列実行される片方のステップ
 */
export const fetchCoffeeA = createStep({
  id: 'fetch-coffee-a',
  description: 'コーヒーAの情報をSupabaseから取得',
  inputSchema: workflowInputSchema,
  outputSchema: fetchCoffeeAOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      return { coffeeA: null, error: '入力データがありません' };
    }
    const result = await fetchCoffeeByName(inputData.coffeeNameA);
    return { coffeeA: result.coffee, error: result.error };
  },
});

/**
 * コーヒーBの情報を取得するステップ
 * 並列実行される片方のステップ
 */
export const fetchCoffeeB = createStep({
  id: 'fetch-coffee-b',
  description: 'コーヒーBの情報をSupabaseから取得',
  inputSchema: workflowInputSchema,
  outputSchema: fetchCoffeeBOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      return { coffeeB: null, error: '入力データがありません' };
    }
    const result = await fetchCoffeeByName(inputData.coffeeNameB);
    return { coffeeB: result.coffee, error: result.error };
  },
});

// generateComparisonReport入力スキーマ（並列ステップの出力を受け取る）
const generateReportInputSchema = z.object({
  'fetch-coffee-a': z.object({
    coffeeA: coffeeDataSchema.nullable(),
    error: z.string().optional(),
  }),
  'fetch-coffee-b': z.object({
    coffeeB: coffeeDataSchema.nullable(),
    error: z.string().optional(),
  }),
});

// generateComparisonReport出力スキーマ
const generateReportOutputSchema = z.object({
  report: z.string(),
});

/**
 * フォールバックレポートを生成
 */
function generateFallbackReport(
  coffeeA: CoffeeData | null,
  coffeeB: CoffeeData | null,
  errorA?: string,
  errorB?: string
): string {
  const lines: string[] = ['# コーヒー比較レポート\n'];

  if (coffeeA) {
    lines.push(`## ${coffeeA.beanName || 'コーヒーA'}`);
    lines.push(`- 焙煎度: ${coffeeA.roastLevel || '不明'}`);
    lines.push(`- 店舗: ${coffeeA.shopName || '不明'}`);
    lines.push(`- 酸味: ${coffeeA.acidity ?? '-'}/5`);
    lines.push(`- 苦味: ${coffeeA.bitterness ?? '-'}/5`);
    lines.push(`- 香り: ${coffeeA.aroma ?? '-'}/5`);
    lines.push(`- 総合評価: ${coffeeA.overallRating ?? '-'}/5\n`);
  } else if (errorA) {
    lines.push(`## コーヒーA\n${errorA}\n`);
  }

  if (coffeeB) {
    lines.push(`## ${coffeeB.beanName || 'コーヒーB'}`);
    lines.push(`- 焙煎度: ${coffeeB.roastLevel || '不明'}`);
    lines.push(`- 店舗: ${coffeeB.shopName || '不明'}`);
    lines.push(`- 酸味: ${coffeeB.acidity ?? '-'}/5`);
    lines.push(`- 苦味: ${coffeeB.bitterness ?? '-'}/5`);
    lines.push(`- 香り: ${coffeeB.aroma ?? '-'}/5`);
    lines.push(`- 総合評価: ${coffeeB.overallRating ?? '-'}/5\n`);
  } else if (errorB) {
    lines.push(`## コーヒーB\n${errorB}\n`);
  }

  return lines.join('\n');
}

/**
 * 比較レポートを生成するステップ
 */
export const generateComparisonReport = createStep({
  id: 'generate-comparison-report',
  description: '2つのコーヒーの比較レポートをLLMで生成',
  inputSchema: generateReportInputSchema,
  outputSchema: generateReportOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      return { report: 'エラー: 入力データがありません' };
    }

    const coffeeAResult = inputData['fetch-coffee-a'];
    const coffeeBResult = inputData['fetch-coffee-b'];
    const coffeeA = coffeeAResult?.coffeeA ?? null;
    const coffeeB = coffeeBResult?.coffeeB ?? null;
    const errorA = coffeeAResult?.error;
    const errorB = coffeeBResult?.error;

    // エージェントを取得
    const agent = (mastra as Mastra | undefined)?.getAgent('coffeeAgent');

    if (!agent) {
      // エージェントがない場合はフォールバックレポート
      return {
        report: generateFallbackReport(coffeeA, coffeeB, errorA, errorB),
      };
    }

    // プロンプトを作成
    const prompt = `
以下の2つのコーヒーを比較して、日本語で分かりやすい比較レポートを作成してください。

## コーヒーA
${coffeeA ? JSON.stringify(coffeeA, null, 2) : `データなし: ${errorA || '不明なエラー'}`}

## コーヒーB
${coffeeB ? JSON.stringify(coffeeB, null, 2) : `データなし: ${errorB || '不明なエラー'}`}

以下の形式でレポートを作成してください：
1. 基本情報の比較（豆名、焙煎度、店舗）
2. 味わいの比較（酸味、苦味、香りを★で表現）
3. どのような人におすすめか

「【比較レポート】」から始めてください。
`;

    try {
      const response = await agent.generate([
        { role: 'user', content: prompt },
      ]);

      return { report: response.text };
    } catch (err) {
      // LLM失敗時はフォールバックレポート
      return {
        report: generateFallbackReport(coffeeA, coffeeB, errorA, errorB),
      };
    }
  },
});

/**
 * コーヒー比較ワークフロー
 * 2つのコーヒーを並列で取得し、比較レポートを生成
 */
export const coffeeComparisonWorkflow = createWorkflow({
  id: 'coffee-comparison-workflow',
  description: '2つのコーヒーを比較してレポートを生成するワークフロー',
  inputSchema: workflowInputSchema,
  outputSchema: generateReportOutputSchema,
})
  .parallel([fetchCoffeeA, fetchCoffeeB])
  .then(generateComparisonReport);

coffeeComparisonWorkflow.commit();
