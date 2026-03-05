import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractCoffeeFromImageTool } from '../tools/ocr/extract-coffee-image-tool.js';
import { insertCoffeeEvaluationTool } from '../tools/ocr/insert-coffee-evaluation-tool.js';
import {
  ingestionInputSchema,
  ingestionOutputSchema,
  extractedCoffeeSchema,
} from '../lib/ocr-types.js';

// Step 1: OCR + 構造化
const ocrStep = createStep({
  id: 'ocr-extract',
  description: 'VLMで画像からコーヒー情報を抽出・構造化する',
  inputSchema: ingestionInputSchema,
  outputSchema: z.object({
    success:   z.boolean(),
    extracted: extractedCoffeeSchema.nullable(),
    message:   z.string(),
    // 後続ステップに渡すためのパススルー
    user_id:   z.string().uuid(),
    is_public: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const result = await extractCoffeeFromImageTool.execute({
      context: {
        imageBase64: inputData.imageBase64,
        ocrInstruction: inputData.ocr_instruction,
      },
    });
    return {
      ...result,
      user_id:   inputData.user_id,
      is_public: inputData.is_public,
    };
  },
});

// Step 2: DB登録（OCR失敗時はスキップ）
const insertStep = createStep({
  id: 'db-insert',
  description: '構造化データをSupabaseに登録する',
  inputSchema: z.object({
    success:   z.boolean(),
    extracted: extractedCoffeeSchema.nullable(),
    message:   z.string(),
    user_id:   z.string().uuid(),
    is_public: z.boolean(),
  }),
  outputSchema: ingestionOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData.success || !inputData.extracted) {
      return {
        inserted: false,
        extracted: null,
        reason: `OCR失敗のため登録スキップ: ${inputData.message}`,
      };
    }
    return insertCoffeeEvaluationTool.execute({
      context: {
        extracted: inputData.extracted,
        user_id:   inputData.user_id,
        is_public: inputData.is_public,
      },
    });
  },
});

export const coffeeIngestionWorkflow = createWorkflow({
  id: 'coffee-ingestion-workflow',
  description: '画像からコーヒー情報をOCRで抽出しSupabaseに登録するワークフロー',
  inputSchema:  ingestionInputSchema,
  outputSchema: ingestionOutputSchema,
})
  .then(ocrStep)
  .then(insertStep);

coffeeIngestionWorkflow.commit();
