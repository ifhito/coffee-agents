import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { generateObject } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { openai } from '@ai-sdk/openai';
import 'dotenv/config';
import { extractedCoffeeSchema } from '../../lib/ocr-types.js';

const DEFAULT_OCR_MODEL = 'qwen2.5vl:7b';
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/api';
const DEFAULT_OCR_INSTRUCTION = '画像を読み取ってください。コーヒーラベルの情報を抽出してください。';
const VISION_MODEL_FALLBACKS = ['qwen2.5vl:7b', 'qwen2.5vl:latest', 'qwen2.5vl', 'minicpm-v'];

function isNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /not found|404/i.test(message);
}

function isInternalServerError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /internal server error|500/i.test(message);
}

function isTimeoutError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|gateway timeout|aborted|econnreset|etimedout|socket hang up/i.test(message);
}

function isSchemaGenerationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /no object generated|did not match schema|validation|json/i.test(message);
}

function isRecoverableOllamaError(err: unknown): boolean {
  return isNotFoundError(err) || isInternalServerError(err) || isTimeoutError(err) || isSchemaGenerationError(err);
}

function getOllamaBaseURLCandidates(rawBaseUrl: string | undefined): string[] {
  const candidates: string[] = [];
  const raw = rawBaseUrl?.trim();

  if (!raw) return [DEFAULT_OLLAMA_BASE_URL];

  const normalizedRaw = raw.replace(/\/+$/, '');

  // 環境差分吸収のため /api 有無を両方試す
  if (/\/api$/i.test(normalizedRaw)) {
    candidates.push(normalizedRaw);
    candidates.push(normalizedRaw.replace(/\/api$/i, ''));
  } else {
    candidates.push(`${normalizedRaw}/api`);
    candidates.push(normalizedRaw);
  }

  return [...new Set(candidates)];
}

function getOllamaModelCandidates(rawModel: string | undefined): string[] {
  const requested = rawModel?.trim() || DEFAULT_OCR_MODEL;
  const candidates = [requested];

  // qwen2.5vl と qwen2.5vl:7b の表記ゆれを吸収
  if (requested === 'qwen2.5vl') {
    candidates.push('qwen2.5vl:7b');
  } else if (requested === 'qwen2.5vl:7b') {
    candidates.push('qwen2.5vl');
  }

  return [...new Set([...candidates, ...VISION_MODEL_FALLBACKS])];
}

function getOpenAiVisionModel() {
  if ((process.env.OCR_PROVIDER ?? 'ollama') === 'openai') {
    return openai('gpt-4o-mini');
  }

  return null;
}

function getOllamaVisionModel(modelName: string, baseURL: string) {
  const ollama = createOllama({
    baseURL,
  });
  return ollama(modelName);
}

function decodeDataUrlImage(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) {
    throw new Error('画像データ形式が不正です (data:image/...;base64,...)');
  }

  try {
    return Uint8Array.from(Buffer.from(match[1], 'base64'));
  } catch {
    throw new Error('画像のbase64デコードに失敗しました');
  }
}

function getMimeType(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
  return match ? match[1].toLowerCase() : null;
}

async function convertToJpegIfNeeded(
  imageBytes: Uint8Array,
  mimeType: string,
): Promise<Uint8Array> {
  if (!['heic', 'heif'].includes(mimeType)) return imageBytes;
  const heicConvert = (await import('heic-convert')).default;
  const buffer = await heicConvert({
    buffer: Buffer.from(imageBytes),
    format: 'JPEG',
    quality: 0.9,
  });
  return new Uint8Array(buffer);
}

export const extractCoffeeFromImageTool = createTool({
  id: 'extractCoffeeFromImage',
  description: 'コーヒー画像からOCRでテキストを抽出し、構造化JSONに変換する',
  inputSchema: z.object({
    imageBase64: z.string().describe('data URL形式の画像 (data:image/jpeg;base64,...)'),
    ocrInstruction: z.string().trim().min(1).max(500).optional(),
  }),
  outputSchema: z.object({
    success:   z.boolean(),
    extracted: extractedCoffeeSchema.nullable(),
    message:   z.string(),
  }),
  execute: async ({ context }) => {
    const openAiModel = getOpenAiVisionModel();
    let ollamaImage: Uint8Array | null = null;
    const ocrInstruction = context.ocrInstruction?.trim() || DEFAULT_OCR_INSTRUCTION;
    const systemPrompt = `
あなたはコーヒーのラベル・パッケージ・レシートの画像からテキストを読み取り、
指定されたJSONスキーマに従ってデータを抽出するAIです。
読み取れなかった項目は null にしてください。
数値の評価（acidity, aroma, bitterness, overall_rating）は
画像内に記載がない場合は null にしてください。
roast_level は '浅煎り', '中煎り', '深煎り', 'light', 'medium', 'dark' のいずれかに正規化してください。
`.trim();
    const promptText = `${systemPrompt}\n\n追加指示:\n${ocrInstruction}`;

    try {
      if (!openAiModel) {
        const rawBytes = decodeDataUrlImage(context.imageBase64);
        const mimeType = getMimeType(context.imageBase64) ?? 'jpeg';
        ollamaImage = await convertToJpegIfNeeded(rawBytes, mimeType);
      }

      if (openAiModel) {
        const { object } = await generateObject({
          model: openAiModel,
          schema: extractedCoffeeSchema,
          maxRetries: 2,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image', image: context.imageBase64 },
              ],
            },
          ],
        });
        return { success: true, extracted: object, message: 'OCR完了' };
      }

      const modelCandidates = getOllamaModelCandidates(process.env.OCR_MODEL);
      const baseUrlCandidates = getOllamaBaseURLCandidates(process.env.OLLAMA_BASE_URL);
      let lastError: unknown;
      const attempted: Array<{ model: string; baseURL: string }> = [];
      const internalErrors: string[] = [];
      const timeoutErrors: string[] = [];
      const validationErrors: string[] = [];

      for (const baseURL of baseUrlCandidates) {
        for (const modelName of modelCandidates) {
          attempted.push({ model: modelName, baseURL });
          try {
            const model = getOllamaVisionModel(modelName, baseURL);
            const { object } = await generateObject({
              model,
              schema: extractedCoffeeSchema,
              maxRetries: 2,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: promptText },
                    { type: 'image', image: ollamaImage! },
                  ],
                },
              ],
            });
            return { success: true, extracted: object, message: 'OCR完了' };
          } catch (err) {
            lastError = err;
            if (isInternalServerError(err)) {
              internalErrors.push(err instanceof Error ? err.message : String(err));
            }
            if (isTimeoutError(err)) {
              timeoutErrors.push(err instanceof Error ? err.message : String(err));
            }
            if (isSchemaGenerationError(err)) {
              validationErrors.push(err instanceof Error ? err.message : String(err));
            }
            if (!isRecoverableOllamaError(err)) {
              throw err;
            }
          }
        }
      }

      if (internalErrors.length > 0) {
        const configuredModel = process.env.OCR_MODEL ?? DEFAULT_OCR_MODEL;
        const lastInternal = internalErrors[internalErrors.length - 1];
        return {
          success: false,
          extracted: null,
          message:
            `OCRエラー: Internal Server Error (model=${configuredModel})。` +
            `詳細: ${lastInternal}。` +
            'Ollamaの再起動、モデル再pull、画像サイズ縮小を試してください。',
        };
      }

      if (timeoutErrors.length > 0) {
        const configuredModel = process.env.OCR_MODEL ?? DEFAULT_OCR_MODEL;
        const lastTimeout = timeoutErrors[timeoutErrors.length - 1];
        return {
          success: false,
          extracted: null,
          message:
            `OCRエラー: Timeout (model=${configuredModel})。` +
            `詳細: ${lastTimeout}。` +
            '画像サイズ縮小、Ollama再起動、しばらく待って再試行を試してください。',
        };
      }

      if (validationErrors.length > 0) {
        const lastValidation = validationErrors[validationErrors.length - 1];
        return {
          success: false,
          extracted: null,
          message:
            'OCRエラー: 抽出結果の構造化に失敗しました。' +
            `詳細: ${lastValidation}。` +
            '別画像で再試行するか、確認画面で手入力してください。',
        };
      }

      if (isNotFoundError(lastError)) {
        const configuredModel = process.env.OCR_MODEL ?? DEFAULT_OCR_MODEL;
        const configuredBaseURL = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
        return {
          success: false,
          extracted: null,
          message:
            `OCRエラー: Not Found (model=${configuredModel}, baseURL=${configuredBaseURL})。` +
            `試行: ${attempted.map((a) => `${a.model}@${a.baseURL}`).join(', ')}。` +
            'Ollamaで対象モデルを pull するか、OLLAMA_BASE_URL の値を確認してください。',
        };
      }

      throw lastError;
    } catch (err) {
      return {
        success: false,
        extracted: null,
        message: `OCRエラー: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
