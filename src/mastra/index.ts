import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { coffeeComparisonWorkflow } from './workflows/coffee-comparison-workflow';
import { coffeeIngestionWorkflow } from './workflows/coffee-ingestion-workflow';
import { ingestionInputSchema } from './lib/ocr-types';
import { handleCoffeeOcrExtract, handleCoffeeOcrConfirm } from './api/ocr-handlers';
import { isOperationTimeoutError, parseTimeoutMs, runWithTimeout } from './lib/timeout';
import { weatherAgent } from './agents/weather-agent';
import { OllamaAgent } from './agents/mcpAgent';
import { coffeeAgent } from './agents/coffee-agent';

const COFFEE_CHAT_TIMEOUT_MS = parseTimeoutMs(process.env.COFFEE_CHAT_TIMEOUT_MS, 120_000);
const OCR_INGEST_TIMEOUT_MS = parseTimeoutMs(process.env.OCR_INGEST_TIMEOUT_MS, 120_000);
const SERVER_TIMEOUT_MS = parseTimeoutMs(process.env.MASTRA_SERVER_TIMEOUT_MS, 5 * 60 * 1000);

const handleCoffeeOcrIngest = async (c: {
  req: { json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => unknown;
}) => {
  const body = await c.req.json();
  const parsed = ingestionInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    const result = await runWithTimeout('OCR取込処理', OCR_INGEST_TIMEOUT_MS, async () => {
      const run = await coffeeIngestionWorkflow.createRunAsync();
      return run.start({ inputData: parsed.data });
    });
    const output = result.results?.['db-insert'] ?? result.results?.['ocr-extract'];
    return c.json(output ?? { inserted: false, reason: 'ワークフロー結果が取得できませんでした' });
  } catch (err) {
    if (isOperationTimeoutError(err)) {
      return c.json({
        inserted: false,
        extracted: null,
        reason: `${err.message}。画像サイズを小さくして再試行してください。`,
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
};

const handleCoffeeRequest = async (c: {
  req: { json: () => Promise<{ messages?: { content?: string }[] }> };
  json: (body: unknown, status?: number) => unknown;
}) => {
  const { messages } = await c.req.json();
  const userMessage = messages?.[messages.length - 1]?.content || '';

  console.log('📥 User message:', userMessage);

  try {
    // generateLegacy を使用（ollama-ai-provider用）
    const response = await runWithTimeout('チャット応答生成', COFFEE_CHAT_TIMEOUT_MS, () => coffeeAgent.generateLegacy(userMessage, {
      maxSteps: 10,
    }));

    // ツール呼び出しのログ出力
    if (response.steps && response.steps.length > 0) {
      console.log('🔧 Tool calls in steps:');
      response.steps.forEach((step, index) => {
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((tc) => {
            console.log(`  Step ${index + 1}: ${tc.toolName}`, tc.args);
          });
        }
      });
    }

    // ツール実行結果のログ出力
    if (response.toolResults && response.toolResults.length > 0) {
      console.log('📤 Tool results:');
      response.toolResults.forEach((tr) => {
        console.log(`  ${tr.toolName}:`, tr.result?.success ?? 'N/A');
      });
    }

    console.log('✅ Response generated');

    return c.json({
      text: response.text,
      toolCalls: response.toolCalls,
      // デバッグ用: ツール実行履歴
      _debug: {
        stepsCount: response.steps?.length ?? 0,
        toolResultsCount: response.toolResults?.length ?? 0,
      },
    });
  } catch (error) {
    if (isOperationTimeoutError(error)) {
      return c.json({
        text: `処理がタイムアウトしました。${error.message}。質問を短くするか、しばらく待って再試行してください。`,
      });
    }

    console.error('❌ Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: errorMessage }, 500);
  }
};

export const mastra = new Mastra({
  workflows: { weatherWorkflow, coffeeComparisonWorkflow, coffeeIngestionWorkflow },
  agents: { weatherAgent, OllamaAgent, coffeeAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    port: 4111, // ポートを固定
    timeout: SERVER_TIMEOUT_MS,
    apiRoutes: [
      {
        path: '/api/coffee/chat',
        method: 'POST',
        handler: handleCoffeeRequest,
      },
      {
        path: '/api/coffee/generate',
        method: 'POST',
        handler: handleCoffeeRequest,
      },
      {
        path: '/api/coffee/ocr/ingest',
        method: 'POST',
        handler: handleCoffeeOcrIngest,
      },
      {
        path: '/api/coffee/ocr/extract',
        method: 'POST',
        handler: handleCoffeeOcrExtract,
      },
      {
        path: '/api/coffee/ocr/confirm',
        method: 'POST',
        handler: handleCoffeeOcrConfirm,
      },
    ],
  },
});
