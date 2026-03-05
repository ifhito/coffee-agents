import { describe, expect, it, vi } from 'vitest';
import { sendMessage } from '../../src/frontend/api/coffeeAgentClient';

describe('coffeeAgentClient', () => {
  it('returns text and threadId on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'ok', threadId: 'thread-1' }),
    });
    globalThis.fetch = fetchMock;

    const result = await sendMessage('hello');

    expect(result).toEqual({ text: 'ok', threadId: 'thread-1', toolCalls: undefined });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });
    globalThis.fetch = fetchMock;

    await expect(sendMessage('hello')).rejects.toThrow('server error');
  });

  it('parses error message from JSON HTTP error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      text: async () => JSON.stringify({ error: 'Gateway Timeout' }),
    });
    globalThis.fetch = fetchMock;

    await expect(sendMessage('hello')).rejects.toThrow('Gateway Timeout');
  });

  it('throws when response is missing text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ threadId: 'thread-2' }),
    });
    globalThis.fetch = fetchMock;

    await expect(sendMessage('hello')).rejects.toThrow('エージェントから有効な応答が返ってきませんでした。');
  });
});
