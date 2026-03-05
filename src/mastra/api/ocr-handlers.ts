import { z } from 'zod';
import { extractCoffeeFromImageTool } from '../tools/ocr/extract-coffee-image-tool.js';
import { insertCoffeeEvaluationTool } from '../tools/ocr/insert-coffee-evaluation-tool.js';
import { ingestionInputSchema, extractedCoffeeSchema } from '../lib/ocr-types.js';

type HonoContext = {
  req: { json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => unknown;
};

// POST /api/coffee/ocr/extract
// OCR抽出のみ行い、DBには書き込まない
export const handleCoffeeOcrExtract = async (c: HonoContext) => {
  const body = await c.req.json();
  const parsed = ingestionInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: parsed.data.imageBase64 },
      runId: 'ocr-extract',
      mastra: undefined as never,
    });
    return c.json(result);
  } catch (err) {
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
    const result = await insertCoffeeEvaluationTool.execute({
      context: {
        extracted: parsed.data.extracted,
        user_id:   parsed.data.user_id,
        is_public: parsed.data.is_public,
      },
      runId: 'ocr-confirm',
      mastra: undefined as never,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
};
