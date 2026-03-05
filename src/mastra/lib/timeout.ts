export class OperationTimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    const seconds = Math.ceil(timeoutMs / 1000);
    super(`${operationName}が${seconds}秒以内に完了しませんでした`);
    this.name = 'OperationTimeoutError';
  }
}

export function parseTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallbackMs;
}

export function isOperationTimeoutError(err: unknown): err is OperationTimeoutError {
  return err instanceof OperationTimeoutError
    || (err instanceof Error && err.name === 'OperationTimeoutError');
}

export async function runWithTimeout<T>(
  operationName: string,
  timeoutMs: number,
  run: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new OperationTimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
