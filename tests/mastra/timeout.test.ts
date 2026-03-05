import { describe, expect, it } from 'vitest';
import { isOperationTimeoutError, parseTimeoutMs, runWithTimeout } from '../../src/mastra/lib/timeout';

describe('timeout helpers', () => {
  it('parseTimeoutMsは正の数を採用し、不正値はfallbackを使う', () => {
    expect(parseTimeoutMs('1500', 100)).toBe(1500);
    expect(parseTimeoutMs('0', 100)).toBe(100);
    expect(parseTimeoutMs('abc', 100)).toBe(100);
    expect(parseTimeoutMs(undefined, 100)).toBe(100);
  });

  it('runWithTimeoutは期限内に完了すれば結果を返す', async () => {
    const result = await runWithTimeout('test', 1000, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('runWithTimeoutはタイムアウト時にOperationTimeoutErrorを投げる', async () => {
    await expect(
      runWithTimeout('long-task', 10, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'late';
      }),
    ).rejects.toSatisfy((err: unknown) => isOperationTimeoutError(err));
  });
});
