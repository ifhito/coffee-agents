type ErrorLikeBody = {
  error?: unknown;
  reason?: unknown;
  message?: unknown;
};

export async function toErrorMessage(response: Pick<Response, 'status' | 'text'>): Promise<string> {
  const text = await response.text();
  if (!text) return `Request failed with status ${response.status}`;

  try {
    const parsed = JSON.parse(text) as ErrorLikeBody;
    for (const candidate of [parsed.error, parsed.reason, parsed.message]) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
  } catch {
    // text が JSON でない場合はそのまま返す
  }

  return text;
}
