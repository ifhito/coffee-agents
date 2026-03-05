import { z } from 'zod';
import { extractCoffeeFromImageTool } from '../tools/ocr/extract-coffee-image-tool.js';
import { insertCoffeeEvaluationTool } from '../tools/ocr/insert-coffee-evaluation-tool.js';
import { ingestionInputSchema, extractedCoffeeSchema } from '../lib/ocr-types.js';
import { isOperationTimeoutError, parseTimeoutMs, runWithTimeout } from '../lib/timeout.js';

type HonoContext = {
  req: { json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => unknown;
};

const OCR_EXTRACT_TIMEOUT_MS = parseTimeoutMs(process.env.OCR_EXTRACT_TIMEOUT_MS, 120_000);
const OCR_CONFIRM_TIMEOUT_MS = parseTimeoutMs(process.env.OCR_CONFIRM_TIMEOUT_MS, 45_000);

// POST /api/coffee/ocr/extract
// OCR抽出のみ行い、DBには書き込まない
export const handleCoffeeOcrExtract = async (c: HonoContext) => {
  const body = await c.req.json();
  const parsed = ingestionInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    const result = await runWithTimeout('OCR抽出処理', OCR_EXTRACT_TIMEOUT_MS, () => extractCoffeeFromImageTool.execute({
      context: {
        imageBase64: parsed.data.imageBase64,
        ocrInstruction: parsed.data.ocr_instruction,
      },
      runId: 'ocr-extract',
      mastra: undefined as never,
    }));
    return c.json(result);
  } catch (err) {
    if (isOperationTimeoutError(err)) {
      return c.json({
        success: false,
        extracted: null,
        message: `OCRエラー: ${err.message}。画像サイズを小さくして再試行してください。`,
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
};

const confirmRequestSchema = z.object({
  extracted: extractedCoffeeSchema,
  user_id:   z.string().uuid(),
  is_public: z.boolean().default(false),
});

// POST /api/coffee/ocr/confirm
// ユーザー確認済みのデータをDBに書き込む
export const handleCoffeeOcrConfirm = async (c: HonoContext) => {
  const body = await c.req.json();
  const parsed = confirmRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    const result = await runWithTimeout('OCR確認登録処理', OCR_CONFIRM_TIMEOUT_MS, () => insertCoffeeEvaluationTool.execute({
      context: {
        extracted: parsed.data.extracted,
        user_id:   parsed.data.user_id,
        is_public: parsed.data.is_public,
      },
      runId: 'ocr-confirm',
      mastra: undefined as never,
    }));
    return c.json(result);
  } catch (err) {
    if (isOperationTimeoutError(err)) {
      return c.json({
        inserted: false,
        extracted: parsed.data.extracted,
        reason: `DB登録エラー: ${err.message}。しばらく待って再試行してください。`,
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
};
