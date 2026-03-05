import type { OcrResult } from '../types';
import { toErrorMessage } from './httpError';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
];

// HEICはChromeでfile.type=''になるため拡張子も確認
export function validateImageFormat(file: File): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.type);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  if (!mimeOk && !extOk) {
    throw new Error(
      `対応していない画像フォーマットです（${file.type || ext || '不明'}）。` +
      'JPEG・PNG・WebP・GIF・HEICのみ使用できます。',
    );
  }
}

const USER_ID_KEY = 'coffee_user_id';

export function getOrCreateUserId(): string {
  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, newId);
  return newId;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const baseUrl = import.meta.env.VITE_MASTRA_BASE_URL ?? '';

export async function sendImageForOcr(
  imageBase64: string,
  userId: string,
  isPublic: boolean,
  ocrInstruction?: string,
): Promise<OcrResult> {
  const response = await fetch(`${baseUrl}/api/coffee/ocr/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64,
      user_id: userId,
      is_public: isPublic,
      ...(ocrInstruction ? { ocr_instruction: ocrInstruction } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  return (await response.json()) as OcrResult;
}

function starRating(value: number | null): string {
  if (value === null) return '—';
  const filled = Math.round(value);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

export function formatOcrResult(result: OcrResult): string {
  if (!result.inserted || !result.extracted) {
    return `**画像の取り込みに失敗しました**\n\n理由: ${result.reason ?? '不明'}`;
  }

  const e = result.extracted;
  const rows = [
    ['豆名', e.bean_name ?? '—'],
    ['豆の種類', e.bean_type ?? '—'],
    ['焙煎度', e.roast_level ?? '—'],
    ['ショップ名', e.shop_name ?? '—'],
    ['住所', e.shop_address ?? '—'],
    ['酸味', starRating(e.acidity)],
    ['香り', starRating(e.aroma)],
    ['苦味', starRating(e.bitterness)],
    ['総合評価', starRating(e.overall_rating)],
  ];

  const tableRows = rows.map(([label, val]) => `| ${label} | ${val} |`).join('\n');

  return `**コーヒーラベルを登録しました！**\n\n| 項目 | 内容 |\n|------|------|\n${tableRows}`;
}
