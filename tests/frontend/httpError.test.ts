import { describe, expect, it } from 'vitest';
import { toErrorMessage } from '../../src/frontend/api/httpError';

describe('toErrorMessage', () => {
  it('JSONのerrorフィールドを優先して返す', async () => {
    const message = await toErrorMessage({
      status: 504,
      text: async () => JSON.stringify({ error: 'Gateway Timeout', stack: '...' }),
    });
    expect(message).toBe('Gateway Timeout');
  });

  it('JSONのreasonフィールドを返す', async () => {
    const message = await toErrorMessage({
      status: 500,
      text: async () => JSON.stringify({ reason: 'DB登録エラー: fetch failed' }),
    });
    expect(message).toBe('DB登録エラー: fetch failed');
  });

  it('非JSONはそのまま返す', async () => {
    const message = await toErrorMessage({
      status: 500,
      text: async () => 'plain error body',
    });
    expect(message).toBe('plain error body');
  });
});
