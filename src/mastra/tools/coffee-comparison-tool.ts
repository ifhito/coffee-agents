import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { coffeeComparisonWorkflow } from '../workflows/coffee-comparison-workflow';

/**
 * コーヒー比較ツール
 * チャットからワークフローを呼び出すためのツール
 *
 * Note: mastraインスタンスを経由せず、workflowを直接importして使用
 * これにより循環参照を回避
 */
export const compareCoffeeWorkflowTool = createTool({
  id: 'compareCoffee',
  description: `
    2つのコーヒーを比較して詳細なレポートを生成します。
    ユーザーが「○○と△△を比較して」「○○ vs △△」と言った場合に使用してください。
  `,
  inputSchema: z.object({
    coffeeNameA: z.string().describe('比較する1つ目のコーヒー名'),
    coffeeNameB: z.string().describe('比較する2つ目のコーヒー名'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    report: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    try {
      // ワークフローの実行を作成して開始
      const run = await coffeeComparisonWorkflow.createRunAsync();

      const result = await run.start({
        inputData: {
          coffeeNameA: context.coffeeNameA,
          coffeeNameB: context.coffeeNameB,
        },
      });

      // ワークフロー結果を確認
      if (result.status !== 'success') {
        return {
          success: false,
          report: '',
          message: `ワークフロー実行失敗: ${result.status}`,
        };
      }

      // 最終出力からレポートを取得
      const report = result.result?.report || 'レポートの生成に失敗しました';

      return {
        success: true,
        report,
        message: `${context.coffeeNameA} と ${context.coffeeNameB} の比較レポートを生成しました`,
      };
    } catch (err) {
      return {
        success: false,
        report: '',
        message: `エラー: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
