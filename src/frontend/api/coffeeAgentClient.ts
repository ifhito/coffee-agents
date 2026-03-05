import type { AgentResponse } from '../types';
import { toErrorMessage } from './httpError';

type RawAgentResponse = {
  text?: string;
  message?: string;
  outputText?: string;
  threadId?: string;
  toolCalls?: AgentResponse['toolCalls'];
  error?: string;
};

const baseUrl = import.meta.env.VITE_MASTRA_BASE_URL ?? '';

export async function sendMessage(message: string, threadId?: string): Promise<AgentResponse> {
  // generateLegacyを使用するカスタムエンドポイントに接続
  const response = await fetch(`${baseUrl}/api/coffee/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      threadId,
    }),
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  const data = (await response.json()) as RawAgentResponse;

  // エラーレスポンスをチェック
  if (data.error) {
    throw new Error(data.error);
  }

  const text = data.text ?? data.message ?? data.outputText;

  if (!text) {
    throw new Error('エージェントから有効な応答が返ってきませんでした。');
  }

  return {
    text,
    threadId: data.threadId,
    toolCalls: data.toolCalls,
  };
}
